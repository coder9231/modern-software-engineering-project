'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  FilePenLine,
  ImageOff,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Upload,
} from 'lucide-react';
import {
  BrowserOCRError,
  getBrowserOCRStatus,
  recognizeBrowserImage,
  type OCRProgress,
} from '@se-lab/ocr/browser';
import './math-ocr-panel.css';

type Language = 'zh' | 'en';
type ServiceStatus = 'checking' | 'unconfigured' | 'unavailable' | 'ready';
type Grade = {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  results: {
    id: string;
    expression: string;
    submitted: string;
    expected: string;
    correct: boolean;
    message?: string;
  }[];
};

const maximumRows = 100;
const maximumImageBytes = 4 * 1024 * 1024;
const sample = '12 + 8 * 2 = 28\n(9 - 3) / 2 = 4\n1 / 2 + 1 / 4 = 3/4';

async function imageBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export default function MathOCRPanel({ language }: { language: Language }) {
  const inputId = useId();
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking');
  const [statusRetry, setStatusRetry] = useState(0);
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [localStatus, setLocalStatus] = useState<'checking' | 'missing' | 'ready'>('checking');
  const [localRetry, setLocalRetry] = useState(0);
  const [localProgress, setLocalProgress] = useState<OCRProgress | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [recognitionError, setRecognitionError] = useState('');
  const [recognitionNotice, setRecognitionNotice] = useState<{ rows: number; uncertain: number[] } | null>(
    null,
  );
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'grade' | 'recognize'>('');
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const lineCount = input.split(/\r?\n/).filter((line) => line.trim()).length;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/math/ocr', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('status');
        const status = (await response.json()) as { configured?: boolean };
        setServiceStatus(
          status.configured === true ? 'ready' : status.configured === false ? 'unconfigured' : 'unavailable',
        );
      })
      .catch((failure) => {
        if (!(failure instanceof Error) || failure.name !== 'AbortError') setServiceStatus('unavailable');
      });
    return () => controller.abort();
  }, [statusRetry]);

  useEffect(() => {
    const controller = new AbortController();
    getBrowserOCRStatus({ signal: controller.signal })
      .then(({ available }) => setLocalStatus(available ? 'ready' : 'missing'))
      .catch(() => {
        if (!controller.signal.aborted) setLocalStatus('missing');
      });
    return () => controller.abort();
  }, [localRetry]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  function changeInput(value: string) {
    setInput(value);
    setGrade(null);
    setError('');
    setReviewConfirmed(false);
  }

  function chooseImage(nextFile: File | undefined) {
    setRecognitionError('');
    setFile(null);
    if (!nextFile) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type) ||
      !nextFile.size ||
      nextFile.size > maximumImageBytes
    ) {
      setRecognitionError(
        t('请选择不超过 4 MiB 的 PNG、JPEG 或 WebP 图片。', 'Choose a PNG, JPEG, or WebP image up to 4 MiB.'),
      );
      return;
    }
    setFile(nextFile);
  }

  async function recognize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current || serviceStatus !== 'ready' || !file || !accessCode.trim()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    setBusy('recognize');
    setRecognitionError('');
    try {
      const encoded = await imageBase64(file);
      if (controller.signal.aborted) return;
      const response = await fetch('/api/math/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ocr-access-code': accessCode.trim() },
        body: JSON.stringify({ imageBase64: encoded, mimeType: file.type }),
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        rows?: { expression: string; submitted: string; uncertain: boolean }[];
        requiresReview?: boolean;
        error?: string | { code?: string; message?: string };
      };
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : result.error?.message;
        if (typeof result.error === 'object' && result.error?.code === 'ocr_not_configured')
          setServiceStatus('unconfigured');
        throw new Error(
          language === 'zh' && message
            ? message
            : response.status === 403
              ? 'The access code was rejected.'
              : 'Recognition could not be completed. Please retry later.',
        );
      }
      if (
        !Array.isArray(result.rows) ||
        !result.rows.length ||
        result.rows.length > maximumRows ||
        result.requiresReview !== true ||
        result.rows.some(
          (row) =>
            !row ||
            typeof row.expression !== 'string' ||
            row.expression.length > 256 ||
            typeof row.submitted !== 'string' ||
            row.submitted.length > 256 ||
            typeof row.uncertain !== 'boolean',
        )
      ) {
        throw new Error(
          t(
            '识别返回的内容无法使用，请手动录入或稍后重试。',
            'The recognition result could not be used. Enter the exercises manually or retry later.',
          ),
        );
      }
      changeInput(
        result.rows
          .map(
            ({ expression, submitted }) =>
              `${expression.replace(/[\r\n]/g, ' ')} = ${submitted.replace(/[\r\n]/g, ' ')}`,
          )
          .join('\n'),
      );
      setRecognitionNotice({
        rows: result.rows.length,
        uncertain: result.rows.flatMap((row, index) => (row.uncertain ? [index + 1] : [])),
      });
    } catch (failure) {
      setRecognitionError(
        failure instanceof Error && failure.name === 'AbortError'
          ? t('识别请求已取消或超时，请重试。', 'Recognition was cancelled or timed out. Please retry.')
          : failure instanceof Error
            ? failure.message
            : t('识别失败，请稍后重试。', 'Recognition failed. Please retry later.'),
      );
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      if (mountedRef.current) setBusy('');
    }
  }

  async function recognizeLocally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current || localStatus !== 'ready' || !file) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy('recognize');
    setRecognitionError('');
    setLocalProgress({ phase: 'preparing', progress: 0 });
    try {
      const result = await recognizeBrowserImage(file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (mountedRef.current && !controller.signal.aborted) setLocalProgress(progress);
        },
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      changeInput(result.text);
      setRecognitionNotice({ rows: result.rows, uncertain: result.uncertain });
    } catch (failure) {
      if (!mountedRef.current) return;
      const code = failure instanceof BrowserOCRError ? failure.code : '';
      if (code === 'assets_missing') setLocalStatus('missing');
      setRecognitionError(
        failure instanceof Error && failure.name === 'AbortError'
          ? t(
              '本机识别已取消或超时，原有文本保留。',
              'Local recognition was cancelled or timed out. Existing text is preserved.',
            )
          : code === 'image_dimensions'
            ? t(
                '图片像素过大，请裁剪至 1200 万像素以内再试。',
                'Crop the image to at most 12 megapixels and retry.',
              )
            : code === 'invalid_image'
              ? t(
                  '图片无法读取，请选择不超过 4 MiB 的 PNG、JPEG 或 WebP。',
                  'Choose a readable PNG, JPEG or WebP up to 4 MiB.',
                )
              : code === 'no_text'
                ? t(
                    '没有识别到文字，请使用清晰印刷体图片或手动录入。',
                    'No text found. Use a clear printed image or enter the exercises manually.',
                  )
                : code === 'too_many_lines'
                  ? t(
                      '识别文本超过 100 行或单行过长，请裁剪图片后重试。',
                      'The result exceeds 100 lines or a line is too long. Crop the image and retry.',
                    )
                  : code === 'unsupported_browser'
                    ? t(
                        '当前浏览器不支持本机图片处理，请更新浏览器或使用手动录入。',
                        'This browser cannot process the image locally. Update it or use manual entry.',
                      )
                    : t(
                        '本机识别资源无法加载，请检查资源准备与本站连接，或手动录入。',
                        "Local recognition assets could not be loaded. Check asset preparation and this site's connection, or enter the text manually.",
                      ),
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (mountedRef.current) {
        setBusy('');
        setLocalProgress(null);
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    if (recognitionNotice && !reviewConfirmed) {
      setError(
        t(
          '请先逐行核对识别内容，并勾选核对确认。',
          'Review every extracted line and confirm the review first.',
        ),
      );
      return;
    }
    setError('');
    setGrade(null);
    const lines = input
      .split(/\r?\n/)
      .map((text, index) => ({ text: text.trim(), line: index + 1 }))
      .filter(({ text }) => text);
    if (!lines.length || lines.length > maximumRows) {
      setError(
        t(`请录入 1～${maximumRows} 道题，每行一道。`, `Enter 1–${maximumRows} questions, one per line.`),
      );
      return;
    }
    const questions: { id: string; expression: string; kind: 'normal' | 'remainder' }[] = [];
    const answers: Record<string, string> = {};
    for (const { text, line } of lines) {
      const parts = text.replaceAll('＝', '=').split('=');
      if (parts.length !== 2 || !parts[0].trim()) {
        setError(
          t(
            `第 ${line} 行请使用“算式 = 答案”格式；未作答可留空答案。`,
            `Line ${line}: use expression = answer. Leave the answer blank if unanswered.`,
          ),
        );
        return;
      }
      const expression = parts[0].trim();
      const answer = parts[1].trim();
      if (expression.length > 256 || answer.length > 256) {
        setError(
          t(
            `第 ${line} 行的算式和答案各不能超过 256 个字符。`,
            `Line ${line}: the expression and answer must each be at most 256 characters.`,
          ),
        );
        return;
      }
      const id = `manual-${line}`;
      questions.push({
        id,
        expression,
        kind: /^\d+\s*(?:r|余数?|…|\.{3})\s*\d+$/iu.test(answer) ? 'remainder' : 'normal',
      });
      answers[id] = answer;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setBusy('grade');
    try {
      const response = await fetch('/api/math/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, answers }),
        signal: controller.signal,
      });
      const result = (await response.json()) as Grade & { error?: string | { message?: string } };
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(
          language === 'zh' && message ? message : 'Please check that each expression is valid and retry.',
        );
      }
      setGrade(result);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.name === 'AbortError'
          ? t(
              '批改请求已取消或超时，输入内容已保留。',
              'The grading request was cancelled or timed out. Your input is preserved.',
            )
          : language === 'zh' && failure instanceof Error
            ? `${t('未能完成批改：', 'Grading failed: ')}${failure.message}`
            : 'Grading could not be completed. Check each expression and your connection, then retry.',
      );
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      if (mountedRef.current) setBusy('');
    }
  }

  const serviceMessage =
    serviceStatus === 'checking'
      ? t('正在检查识别服务状态…', 'Checking recognition service status…')
      : serviceStatus === 'unconfigured'
        ? t(
            'AI 识别尚未配置，当前可手动录入批改。',
            'AI recognition is not configured. Manual entry and grading are available.',
          )
        : serviceStatus === 'unavailable'
          ? t(
              '暂时无法确认识别服务状态，当前可手动录入批改。',
              'Recognition status is unavailable. Manual entry and grading are available.',
            )
          : t(
              '识别服务已配置。上传后请逐行核对识别内容，再提交批改。',
              'Recognition is configured. Review every extracted line before grading.',
            );

  const localMessage =
    localStatus === 'checking'
      ? t('正在检查本机识别资源…', 'Checking local recognition assets…')
      : localStatus === 'ready'
        ? t(
            '本机印刷体识别已就绪，无需密钥。',
            'Local printed-text recognition is ready. No key is required.',
          )
        : t(
            '本机资源尚未准备。请维护者运行 npm run ocr:prepare，再点击重新检查。',
            'Local assets are missing. Ask the maintainer to run npm run ocr:prepare, then check again.',
          );
  const canRecognize = mode === 'local' ? localStatus === 'ready' : serviceStatus === 'ready';
  const checking = mode === 'local' ? localStatus === 'checking' : serviceStatus === 'checking';

  return (
    <div className="math-ocr-layout">
      <aside className="math-panel math-ocr-service">
        <div className="math-panel-title">
          <span className="math-step">
            <ScanLine size={17} />
          </span>
          <div>
            <h2>{t('拍照识别与批改', 'Photo recognition & grading')}</h2>
            <p>{t('从纸面练习到可核验的结果', 'From paper exercises to verifiable results')}</p>
          </div>
        </div>
        <div className="math-ocr-modes" aria-label={t('识别方式', 'Recognition mode')}>
          <button
            type="button"
            aria-pressed={mode === 'local'}
            disabled={!!busy}
            onClick={() => {
              setMode('local');
              setRecognitionError('');
            }}
          >
            {t('本机印刷体', 'Local print')}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'cloud'}
            disabled={!!busy}
            onClick={() => {
              setMode('cloud');
              setRecognitionError('');
            }}
          >
            {t('可选 AI 服务', 'Optional AI')}
          </button>
        </div>
        <div className="math-ocr-placeholder">
          {canRecognize ? <ScanLine size={39} strokeWidth={1.3} /> : <ImageOff size={39} strokeWidth={1.3} />}
          <span>
            {mode === 'local'
              ? t('图片留在本机', 'Images stay on this device')
              : t('识别 · 核对 · 批改', 'Recognize · review · grade')}
          </span>
          <p>
            {mode === 'local'
              ? t(
                  'Tesseract 用于清晰印刷体算式，不支持可靠的手写识别。识别后仍须逐行核对。',
                  'Tesseract is for clear printed exercises, not reliable handwriting recognition. Review every extracted line.',
                )
              : t(
                  '可选 AI 服务用于更复杂的图片，需站点配置密钥及访问码。识别结果仍须核对。',
                  'Optional AI supports more complex images and needs a site key and access code. Review every result.',
                )}
          </p>
        </div>
        <div className="math-ocr-status" role="status">
          {checking ? <LoaderCircle className="math-spin" size={16} /> : <CircleAlert size={16} />}
          <p>{mode === 'local' ? localMessage : serviceMessage}</p>
        </div>
        <form className="math-ocr-upload" onSubmit={mode === 'local' ? recognizeLocally : recognize}>
          <label htmlFor={`${inputId}-image`}>{t('选择练习图片', 'Choose an exercise image')}</label>
          <input
            id={`${inputId}-image`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => chooseImage(event.target.files?.[0])}
            disabled={!!busy}
          />
          <p>{file ? file.name : t('PNG / JPEG / WebP，最大 4 MiB', 'PNG / JPEG / WebP, up to 4 MiB')}</p>
          {mode === 'cloud' && (
            <>
              <label htmlFor={`${inputId}-access`}>{t('识别访问码', 'Recognition access code')}</label>
              <input
                id={`${inputId}-access`}
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                maxLength={256}
                autoComplete="off"
                disabled={!!busy}
              />
              <small>
                {t(
                  '访问码由站点维护者提供，仅在当前面板内存中使用。',
                  "Provided by the site maintainer and kept only in this panel's memory.",
                )}
              </small>
            </>
          )}
          <button
            className="math-btn math-btn-primary"
            type="submit"
            disabled={!!busy || !canRecognize || !file || (mode === 'cloud' && !accessCode.trim())}
          >
            {busy === 'recognize' ? <LoaderCircle className="math-spin" size={16} /> : <Upload size={16} />}
            {busy === 'recognize'
              ? t('识别中…', 'Recognizing…')
              : mode === 'local'
                ? t('在本机识别', 'Recognize on this device')
                : t('上传并识别', 'Upload & recognize')}
          </button>
          {localProgress && mode === 'local' && (
            <div className="math-ocr-progress" role="status">
              <span>
                {localProgress.phase === 'preparing'
                  ? t('正在准备识别…', 'Preparing recognition…')
                  : t('正在识别文字…', 'Recognizing text…')}{' '}
                {Math.round(localProgress.progress * 100)}%
              </span>
              <progress
                value={localProgress.progress}
                max={1}
                aria-label={t('识别进度', 'Recognition progress')}
              />
            </div>
          )}
          {busy === 'recognize' && (
            <button
              className="math-btn math-btn-soft"
              type="button"
              onClick={() => requestRef.current?.abort()}
            >
              {t('取消识别', 'Cancel recognition')}
            </button>
          )}
          <p>
            {mode === 'local'
              ? t(
                  '点击后在本机处理图片；新的识别文本将替换右侧内容。资源准备完成后不调用外部 CDN 或识别服务。',
                  'The image is processed on this device; extracted text replaces the current entries. Prepared assets need no external CDN or recognition service.',
                )
              : t(
                  '点击后图片会经本站发送给 OpenAI 识别服务，新的识别内容将替换右侧文本。',
                  'Clicking sends the image through this site to OpenAI for recognition. Extracted text replaces the current entries.',
                )}
          </p>
        </form>
        {recognitionError && (
          <div className="math-message math-error math-ocr-error" role="alert">
            <CircleAlert size={17} />
            <span>{recognitionError}</span>
          </div>
        )}
        {!checking && (
          <button
            type="button"
            className="math-inline math-ocr-retry"
            disabled={!!busy}
            onClick={() => {
              if (mode === 'local') {
                setLocalStatus('checking');
                setLocalRetry((value) => value + 1);
              } else {
                setServiceStatus('checking');
                setStatusRetry((value) => value + 1);
              }
            }}
          >
            <RotateCcw size={13} />
            {t('重新检查资源或服务', 'Check assets or service again')}
          </button>
        )}
        <p className="math-ocr-privacy">
          {t(
            '选择文件不会自动识别或上传。本机模式仅在设备内处理；AI 模式才会在点击上传后发送图片。批改时仅把核对后的文本发送给本站数学服务，面板不保存批改记录。',
            "Choosing a file never starts recognition or an upload. Local mode processes it on this device; only the AI upload button sends an image. Grading sends reviewed text to this site's math service; this panel does not save grading history.",
          )}
        </p>
      </aside>

      <section className="math-panel math-ocr-manual">
        <div className="math-panel-title">
          <span className="math-step">
            <FilePenLine size={17} />
          </span>
          <div>
            <h2>{t('手动录入，立即批改', 'Enter exercises and check answers')}</h2>
            <p>
              {t(
                '标准答案由服务器重新计算，不依赖输入的答案。',
                'The server calculates the expected answers from the expressions.',
              )}
            </p>
          </div>
        </div>
        {recognitionNotice && (
          <div className="math-ocr-review" role="status">
            <CircleAlert size={17} />
            <p>
              {t(
                `已提取 ${recognitionNotice.rows} 行，请逐行核对并修改后，再点击批改。`,
                `${recognitionNotice.rows} lines extracted. Review and correct every line before grading.`,
              )}
              {recognitionNotice.uncertain.length > 0 && (
                <strong>
                  {t(
                    ` 第 ${recognitionNotice.uncertain.join('、')} 行识别不确定，请重点核对。`,
                    ` Uncertain lines: ${recognitionNotice.uncertain.join(', ')}. Please review carefully.`,
                  )}
                </strong>
              )}
            </p>
          </div>
        )}
        {recognitionNotice && (
          <label className="math-ocr-confirm">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
              disabled={!!busy}
            />
            {t('我已逐行核对识别内容', 'I have reviewed every extracted line')}
          </label>
        )}
        <form onSubmit={submit}>
          <label htmlFor={inputId}>
            {t('每行输入“算式 = 答案”', 'Enter expression = answer, one per line')}
          </label>
          <p id={`${inputId}-help`} className="math-ocr-input-help">
            {t(
              '支持 + − × ÷、括号和分数。未作答请保留等号；带余数答案用“2 R 1”，仅用于非负整数单次除法。',
              'Use + − × ÷, parentheses, and fractions. Keep = for an unanswered question. Use 2 R 1 for remainders in a single non-negative integer division.',
            )}
          </p>
          <textarea
            id={inputId}
            value={input}
            onChange={(event) => changeInput(event.target.value)}
            placeholder={sample}
            aria-describedby={`${inputId}-help`}
            maxLength={60_000}
            spellCheck={false}
            autoComplete="off"
            disabled={!!busy}
            rows={9}
          />
          <div className="math-ocr-input-footer">
            <span className={lineCount > maximumRows ? 'is-over-limit' : ''}>
              {lineCount} / {maximumRows} {t('题', 'questions')}
            </span>
            <button
              type="button"
              className="math-inline"
              disabled={!!busy}
              onClick={() => {
                changeInput(sample);
                setRecognitionNotice(null);
              }}
            >
              {t('填入演示文本', 'Fill sample text')}
            </button>
          </div>
          <div className="math-ocr-submit">
            <p>
              {t(
                '可编辑后重新提交；分数与等值小数按精确数值比较。',
                'Edit and submit again. Fractions and equivalent decimals are compared exactly.',
              )}
            </p>
            <button
              className="math-btn math-btn-primary"
              type="submit"
              disabled={!!busy || !input.trim() || (!!recognitionNotice && !reviewConfirmed)}
            >
              {busy === 'grade' ? <LoaderCircle className="math-spin" size={17} /> : <ListChecks size={17} />}
              {busy === 'grade' ? t('批改中…', 'Checking…') : t('批改录入内容', 'Check entries')}
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
        </form>
        {error && (
          <div className="math-message math-error math-ocr-error" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        {grade && (
          <section className="math-ocr-results" aria-label={t('手动批改结果', 'Manual grading results')}>
            <div className="math-ocr-summary" role="status">
              <div>
                <span>{t('批改完成', 'Grading complete')}</span>
                <h3>
                  {grade.correct} / {grade.total} {t('题正确', 'correct')}
                </h3>
                <p>{t(`已作答 ${grade.answered} 题`, `${grade.answered} answered`)}</p>
              </div>
              <strong>
                {Math.round(grade.accuracy * 100)}
                <small>%</small>
              </strong>
            </div>
            <ol>
              {grade.results.map((row) => (
                <li key={row.id} className={row.correct ? 'is-correct' : 'is-wrong'}>
                  <div className="math-ocr-row-state">
                    {row.correct ? <Check size={15} /> : <CircleAlert size={15} />}
                    <span>
                      {row.correct
                        ? t('正确', 'Correct')
                        : !row.submitted
                          ? t('未作答', 'Unanswered')
                          : t('需订正', 'Review')}
                    </span>
                  </div>
                  <div className="math-ocr-row-expression">
                    {row.expression.replace(/\*/g, '×').replace(/\//g, '÷')} = <b>{row.submitted || '—'}</b>
                  </div>
                  <p>
                    {t('标准答案', 'Expected answer')}
                    <strong>{row.expected}</strong>
                    {row.message && row.submitted && (
                      <span>{language === 'zh' ? row.message : 'Check the answer format.'}</span>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
    </div>
  );
}
