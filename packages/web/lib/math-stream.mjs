import { generateWorksheetStream, normalizeOptions, MathError } from '@se-lab/core/math';
import { readJsonRequest, HttpError } from './code-count-service.mjs';
import { mathErrorJSON } from './math-service.mjs';

export async function streamWorksheetRequest(request) {
  try {
    const payload = await readJsonRequest(request);
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== 'options')
    )
      throw new HttpError('invalid_request', '出题请求只接受 options 对象。');
    const options = normalizeOptions(payload.options ?? {});
    if (request.signal.aborted) throw new MathError('generation_cancelled', '生成已取消。');
    const abort = new AbortController(),
      encoder = new TextEncoder();
    const onAbort = () => abort.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });
    const iterator = generateWorksheetStream(options, { signal: abort.signal });
    const deadline = Date.now() + 30_000;
    let generated = 0,
      finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      abort.abort();
      iterator.return();
      request.signal.removeEventListener('abort', onAbort);
    };
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: 'meta', seed: options.seed, options, requested: options.count }) + '\n',
          ),
        );
      },
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
          if (Date.now() > deadline)
            throw new MathError('generation_timeout', '生成超过 30 秒，请缩小题量或扩大规则范围。');
          if (abort.signal.aborted) throw new MathError('generation_cancelled', '生成已取消。');
          const questions = [];
          let done = false;
          for (let index = 0; index < 32; index++) {
            const next = iterator.next();
            if (next.done) {
              done = true;
              break;
            }
            questions.push(next.value);
            generated++;
          }
          if (questions.length)
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: 'questions', questions, generated, requested: options.count }) + '\n',
              ),
            );
          if (done) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'complete', generated }) + '\n'));
            cleanup();
            controller.close();
          }
        } catch (error) {
          const known = error instanceof MathError;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'error', message: known ? error.message : '出题服务暂时不可用。' }) +
                '\n',
            ),
          );
          cleanup();
          controller.close();
        }
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return mathErrorJSON(error);
  }
}
