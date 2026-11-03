/** Browser OCR deliberately uses only same-site, prepared assets. Images never
 * enter a fetch request here. Tesseract recognises print, not handwriting.
 * @typedef {{phase: 'preparing'|'recognizing', progress: number}} OCRProgress
 * @typedef {{text: string, confidence: number, rows: number, uncertain: number[]}} OCRText
 */

export class BrowserOCRError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.name = 'BrowserOCRError';
    this.code = code;
  }
}

export const BROWSER_OCR_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxPixels: 12_000_000,
  maxRows: 100,
});

/** Preserve uncertain characters for human review rather than guessing digits.
 * @param {string} raw
 * @param {number} [confidence]
 * @returns {OCRText}
 */
export function prepareBrowserOCRText(raw, confidence = 0) {
  if (typeof raw !== 'string') throw new BrowserOCRError('invalid_result');
  const lines = raw
    .normalize('NFKC')
    .replace(/[−–]/gu, '-')
    .replace(/[×✕]/gu, '*')
    .replace(/÷/gu, '/')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new BrowserOCRError('no_text');
  if (
    lines.length > BROWSER_OCR_LIMITS.maxRows ||
    lines.some((line) => line.length > 513) ||
    raw.length > 60_000
  )
    throw new BrowserOCRError('too_many_lines');
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;
  return {
    text: lines.join('\n'),
    confidence: safeConfidence,
    rows: lines.length,
    uncertain: lines.flatMap((line, index) =>
      safeConfidence < 75 || line.split('=').length !== 2 || /[^\d\s()+\-*/=.,Rr]/u.test(line)
        ? [index + 1]
        : [],
    ),
  };
}

/** @param {{signal?: AbortSignal, fetchImpl?: typeof fetch}} [options] */
export async function getBrowserOCRStatus({ signal, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl('/ocr/manifest.json', {
      signal,
      cache: 'no-cache',
      credentials: 'same-origin',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
      return { available: false };
    const raw = await response.text();
    if (raw.length > 32_768) return { available: false };
    const manifest = JSON.parse(raw);
    const paths = Array.isArray(manifest.assets)
      ? manifest.assets.map(/** @param {{path?: string}} item */ (item) => item?.path)
      : [];
    const required = [
      'worker.min.js',
      'core/tesseract-core-lstm.wasm.js',
      'core/tesseract-core-lstm.wasm',
      'lang/eng.traineddata.gz',
    ];
    return {
      available:
        manifest.version === 1 &&
        typeof manifest.engineVersion === 'string' &&
        manifest.engineVersion.startsWith('7.') &&
        required.every((path) => paths.includes(path)),
    };
  } catch (failure) {
    if (signal?.aborted) throw failure;
    return { available: false };
  }
}

/** @param {Blob} image */
async function checkImage(image) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(image.type) ||
    !image.size ||
    image.size > BROWSER_OCR_LIMITS.maxBytes
  )
    throw new BrowserOCRError('invalid_image');
  if (typeof createImageBitmap !== 'function') throw new BrowserOCRError('unsupported_browser');
  let bitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new BrowserOCRError('invalid_image');
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > BROWSER_OCR_LIMITS.maxPixels)
      throw new BrowserOCRError('image_dimensions');
  } finally {
    bitmap.close();
  }
}

/**
 * @typedef {{setParameters: (parameters: Record<string, string>) => Promise<unknown>, recognize: (image: Blob) => Promise<{data: {text: string, confidence: number}}>, terminate: () => Promise<unknown>}} OCRWorker
 * @typedef {(language: string, engine: number, options: {workerPath: string, corePath: string, langPath: string, workerBlobURL: boolean, gzip: boolean, cacheMethod: string, logger: (message: {status?: string, progress?: number}) => void}) => Promise<OCRWorker>} OCRWorkerFactory
 */

/**
 * Cancel stops accepting results immediately. If cancellation occurs while the
 * public createWorker promise is pending, terminate runs as soon as it resolves.
 * @param {Blob} image
 * @param {{signal?: AbortSignal, onProgress?: (progress: OCRProgress) => void, timeoutMs?: number, fetchImpl?: typeof fetch, createWorker?: OCRWorkerFactory, validateImage?: (image: Blob) => Promise<void>}} [options]
 * @returns {Promise<OCRText>}
 */
export async function recognizeBrowserImage(image, options = {}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const externalAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', externalAbort, { once: true });
  const timeoutMs = Math.max(1, Math.min(180_000, options.timeoutMs ?? 90_000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  /** @type {OCRWorker | null} */
  let worker = null;
  let finished = false;
  let terminated = false;
  let lastProgress = 0;
  /** @param {OCRWorker} instance */
  const terminate = async (instance) => {
    if (terminated) return;
    terminated = true;
    try {
      await instance.terminate();
    } catch {
      /* Cleanup errors must not mask the original result. */
    }
  };
  /** @type {(() => void) | undefined} */
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => {
      if (worker) void terminate(worker);
      reject(new DOMException('OCR cancelled or timed out', 'AbortError'));
    };
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const run = async () => {
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const ready = await getBrowserOCRStatus({ signal, fetchImpl: options.fetchImpl });
    if (!ready.available) throw new BrowserOCRError('assets_missing');
    await (options.validateImage ?? checkImage)(image);
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const factory = options.createWorker ?? (await import('tesseract.js')).createWorker;
    worker = await factory('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
      logger(message) {
        if (signal.aborted || finished) return;
        const recognizing = message.status === 'recognizing text';
        const progress = Math.max(0, Math.min(1, Number(message.progress) || 0));
        const candidate = recognizing ? 0.6 + progress * 0.4 : Math.min(0.55, 0.05 + progress * 0.45);
        lastProgress = Math.max(lastProgress, candidate);
        options.onProgress?.({ phase: recognizing ? 'recognizing' : 'preparing', progress: lastProgress });
      },
    });
    if (signal.aborted || finished) {
      await terminate(worker);
      throw new DOMException('OCR cancelled', 'AbortError');
    }
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789+-*/=().,×÷−Rr \n',
      preserve_interword_spaces: '1',
      user_defined_dpi: '150',
    });
    const { data } = await worker.recognize(image);
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const result = prepareBrowserOCRText(data.text, data.confidence);
    options.onProgress?.({ phase: 'recognizing', progress: 1 });
    return result;
  };
  try {
    return /** @type {OCRText} */ (await Promise.race([run(), aborted]));
  } finally {
    finished = true;
    clearTimeout(timeout);
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
    options.signal?.removeEventListener('abort', externalAbort);
    if (worker) await terminate(worker);
  }
}
