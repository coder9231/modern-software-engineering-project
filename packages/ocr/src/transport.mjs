// OCR transport is independent of the web package.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
export class HttpError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
  }
}

function fail(message, code = 'invalid_request', status = 400) {
  throw new HttpError(code, message, status);
}
export async function readJsonRequest(request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json')
    fail('请求须使用 application/json。', 'unsupported_media_type', 415);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    fail('只接受本站提交的请求。', 'origin_not_allowed', 403);
  const advertisedLength = request.headers.get('content-length');
  if (
    advertisedLength !== null &&
    (!/^\d+$/u.test(advertisedLength) || Number(advertisedLength) > MAX_REQUEST_BYTES)
  ) {
    fail('请求体不能超过 6 MiB。', 'payload_too_large', 413);
  }
  if (!request.body) fail('请求体不能为空。');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        fail('请求体不能超过 6 MiB。', 'payload_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('请求体不是有效的 UTF-8 JSON。', 'invalid_json');
  }
}
