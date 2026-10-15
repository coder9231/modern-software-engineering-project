import { LANGUAGES, analyzeText, detectLanguage } from './code-counter/analyzer.mjs';
import { formatReport } from './code-counter/report.mjs';

export const LIMITS = Object.freeze({
  maxFilesPerBatch: 100,
  maxBytesPerBatch: 4 * 1024 * 1024,
  maxFileBytes: 4 * 1024 * 1024,
});
export const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_REPORT_ROWS = 20_000;
const COUNTERS = ['total', 'code', 'comment', 'blank'];
const DEFAULT_EXCLUDES = Object.freeze([
  '.git', '.svn', '.hg', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'target', 'coverage', 'reports',
]);
const EXTENSIONS = new Set(LANGUAGES.flatMap(({ extensions }) => extensions));
const LANGUAGE_NAMES = new Set(LANGUAGES.map(({ name }) => name));
const SKIP_REASONS = new Set([
  'excluded', 'unsupported_extension', 'extension_filter', 'symbolic_link',
  'too_large', 'binary', 'invalid_encoding', 'unsupported_file_type',
]);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const plainObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

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

function objectWithKeys(value, allowed, label) {
  if (!plainObject(value)) fail(`${label}必须是对象。`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${label}包含未知字段。`);
  return value;
}

function relativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512
    || /[\u0000-\u001f\u007f:]/u.test(value)) fail('文件路径无效，须为不超过 512 字符的相对路径。');
  const normalized = value.replace(/\\/gu, '/');
  if (normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('文件路径必须为相对路径，不能包含 . 或 .. 路径段。');
  }
  return normalized;
}

function textValue(value, label, maxLength = 512) {
  if (typeof value !== 'string' || !value || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label}无效。`);
  }
  return value;
}

export function getConfig() {
  return {
    languages: LANGUAGES.map(({ name, extensions }) => ({ name, extensions: [...extensions] })),
    defaultExcludes: [...DEFAULT_EXCLUDES],
    limits: { ...LIMITS },
    rules: [
      '按物理行统计：总行数 = 代码行 + 注释行 + 空白行；末尾换行不额外增加一行。',
      '同时包含代码与注释的行计为代码行；只有空白字符的行计为空白行。',
      'Python 文档字符串、三引号字符串和 Java 文本块计为代码；JSON 非空行计为代码，不校验语法。',
      '使用与命令行工具相同的词法分析器；不执行上传代码，不持久保存源文件。',
      '自动编码优先识别 UTF-8、UTF-16 的 BOM，其余严格按 UTF-8 解码；旧编码可手动选 GB18030。',
      'JS/TS 正则与除法使用上下文启发式判断；不支持 JSX/TSX、C 预处理续行和 Python f-string 内部表达式解析。',
      '每批最多 100 个文件、4 MiB 原始内容；单文件最多 4 MiB。大型项目由浏览器分批提交。',
    ],
  };
}

// A bounded-state glob matcher avoids backtracking on user-supplied patterns.
// Matching any directory prefix reproduces the CLI scanner's ancestor checks.
function compileGlob(pattern) {
  const tokens = pattern.includes('/') ? [] : [{ kind: 'prefix' }];
  let literal = '';
  const flush = () => { if (literal) { tokens.push({ kind: 'literal', value: literal }); literal = ''; } };
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '/' && pattern.slice(index) === '/**') {
      flush();
      tokens.push({ kind: 'suffix' });
      break;
    }
    if (char === '*' && pattern[index + 1] === '*') {
      flush();
      index += 1;
      if (pattern[index + 1] === '/') {
        tokens.push({ kind: 'prefix' });
        index += 1;
      } else tokens.push({ kind: 'any' });
    } else if (char === '*' || char === '?') {
      flush();
      tokens.push({ kind: char === '*' ? 'segment' : 'single' });
    } else literal += char;
  }
  flush();
  return (path) => {
    let states = new Uint8Array(path.length + 1);
    states[0] = 1;
    for (const token of tokens) {
      const next = new Uint8Array(path.length + 1);
      if (token.kind === 'literal') {
        for (let index = 0; index <= path.length - token.value.length; index += 1) {
          if (states[index] && path.startsWith(token.value, index)) next[index + token.value.length] = 1;
        }
      } else if (token.kind === 'single') {
        for (let index = 0; index < path.length; index += 1) {
          if (states[index] && path[index] !== '/') next[index + 1] = 1;
        }
      } else {
        let active = false;
        for (let index = 0; index <= path.length; index += 1) {
          if (token.kind === 'prefix') {
            next[index] = states[index] || (active && path[index - 1] === '/') ? 1 : 0;
            active ||= Boolean(states[index]);
          } else if (token.kind === 'suffix') {
            next[index] = states[index] || active ? 1 : 0;
            active ||= Boolean(states[index] && path[index] === '/');
          } else {
            next[index] = states[index] || (index > 0 && next[index - 1]
              && (token.kind === 'any' || path[index - 1] !== '/')) ? 1 : 0;
          }
        }
      }
      states = next;
    }
    return states.some((active, index) => active && (index === path.length || path[index] === '/'));
  };
}

function parseOptions(value = {}) {
  const options = objectWithKeys(value, ['encoding', 'exclude', 'useDefaultExcludes', 'extensions'], 'options');
  const encoding = options.encoding === undefined ? 'auto' : options.encoding;
  if (!['auto', 'utf8', 'gb18030'].includes(encoding)) fail('不支持的编码。');
  if (options.useDefaultExcludes !== undefined && typeof options.useDefaultExcludes !== 'boolean') {
    fail('useDefaultExcludes 必须为布尔值。');
  }
  const patterns = options.exclude === undefined ? [] : options.exclude;
  if (!Array.isArray(patterns) || patterns.length > 50) fail('排除模式最多 50 项。');
  const expressions = patterns.map((value) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 256
      || /[\u0000-\u001f\u007f]/u.test(value)) fail('排除模式须为 1～256 字符的文本。');
    const pattern = value.trim().replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
    if (!pattern || pattern.startsWith('/') || /(^|\/)\.\.?(\/|$)/u.test(pattern)
      || pattern.includes(':')) fail('排除模式必须是项目内的相对路径或 glob。');
    // Keep the request work bounded even for unusually complex glob patterns.
    if ((pattern.match(/[?*]/gu) ?? []).length > 12) fail('单个排除模式的通配符不能超过 12 个。');
    return compileGlob(pattern);
  });
  const requestedExtensions = options.extensions === undefined ? [] : options.extensions;
  if (!Array.isArray(requestedExtensions) || requestedExtensions.length > EXTENSIONS.size) fail('扩展名过滤参数无效。');
  const extensions = new Set(requestedExtensions.map((value) => {
    if (typeof value !== 'string') fail('扩展名过滤参数无效。');
    const extension = value.trim().toLowerCase();
    const normalized = extension.startsWith('.') ? extension : `.${extension}`;
    if (!EXTENSIONS.has(normalized)) fail(`不支持的扩展名：${value}`);
    return normalized;
  }));
  return { encoding, expressions, extensions, useDefaultExcludes: options.useDefaultExcludes !== false };
}

function pathExcluded(path, options) {
  const segments = path.split('/');
  if (options.useDefaultExcludes && segments.slice(0, -1).some((part) => DEFAULT_EXCLUDES.includes(part.toLowerCase()))) {
    return true;
  }
  return options.expressions.some((matches) => matches(path));
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) {
    fail('文件内容须为规范的 Base64 文本。', 'invalid_base64');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const byteLength = (value.length / 4) * 3 - padding;
  if (byteLength > LIMITS.maxFileBytes) fail('单个文件不能超过 4 MiB。', 'payload_too_large', 413);
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) fail('文件内容须为规范的 Base64 文本。', 'invalid_base64');
  const decoded = atob(value);
  if (btoa(decoded) !== value) fail('文件内容须为规范的 Base64 文本。', 'invalid_base64');
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function obviousBinary(bytes) {
  const starts = (values) => values.every((value, index) => bytes[index] === value);
  return starts([0xff, 0xd8, 0xff]) || starts([0x89, 0x50, 0x4e, 0x47])
    || starts([0x47, 0x49, 0x46, 0x38]) || starts([0x50, 0x4b, 0x03, 0x04])
    || starts([0x25, 0x50, 0x44, 0x46]) || starts([0x7f, 0x45, 0x4c, 0x46]);
}

function decodeSource(bytes, encoding) {
  let selected = encoding === 'auto' || encoding === 'utf8' ? 'utf-8' : 'gb18030';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) selected = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) selected = 'utf-16be';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) selected = 'utf-8';
  return new TextDecoder(selected, { fatal: true }).decode(bytes);
}

function aggregate(files) {
  const totals = { files: files.length, total: 0, code: 0, comment: 0, blank: 0 };
  const groups = new Map();
  for (const file of files) {
    const group = groups.get(file.language) ?? { language: file.language, files: 0, total: 0, code: 0, comment: 0, blank: 0 };
    group.files += 1;
    for (const key of COUNTERS) {
      totals[key] += file[key];
      group[key] += file[key];
    }
    groups.set(file.language, group);
  }
  return { totals, languages: [...groups.values()].sort((left, right) => compare(left.language, right.language)) };
}

export function analyzeUploads(payload) {
  objectWithKeys(payload, ['files', 'options'], '请求');
  if (!Array.isArray(payload.files) || payload.files.length === 0) fail('请选择至少一个文件。');
  if (payload.files.length > LIMITS.maxFilesPerBatch) fail('每批最多提交 100 个文件。', 'payload_too_large', 413);
  const options = parseOptions(payload.options);
  const knownPaths = new Set();
  let totalBytes = 0;
  // Validate the entire batch before analysis, including excluded file entries.
  const uploads = payload.files.map((entry) => {
    objectWithKeys(entry, ['path', 'contentBase64'], '文件条目');
    const path = relativePath(entry.path);
    if (knownPaths.has(path)) fail(`文件路径重复：${path}`);
    knownPaths.add(path);
    const bytes = decodeBase64(entry.contentBase64);
    totalBytes += bytes.byteLength;
    if (totalBytes > LIMITS.maxBytesPerBatch) fail('每批文件内容总计不能超过 4 MiB。', 'payload_too_large', 413);
    return { path, bytes };
  });
  const report = {
    version: 1, input: '上传的项目', generatedAt: new Date().toISOString(),
    totals: { files: 0, total: 0, code: 0, comment: 0, blank: 0 },
    languages: [], files: [], skipped: [], errors: [],
  };
  for (const { path, bytes } of uploads) {
    const skip = (reason) => report.skipped.push({ path, reason });
    if (pathExcluded(path, options)) { skip('excluded'); continue; }
    const language = detectLanguage(path);
    if (!language) { skip('unsupported_extension'); continue; }
    const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (options.extensions.size && !options.extensions.has(extension)) { skip('extension_filter'); continue; }
    if (obviousBinary(bytes)) { skip('binary'); continue; }
    let text;
    try { text = decodeSource(bytes, options.encoding); }
    catch { skip('invalid_encoding'); continue; }
    if (text.includes('\0')) { skip('binary'); continue; }
    report.files.push({ path, language, ...analyzeText(text, language) });
  }
  for (const key of ['files', 'skipped', 'errors']) report[key].sort((left, right) => compare(left.path, right.path));
  Object.assign(report, aggregate(report.files));
  return report;
}

export function getDemoReport() {
  const files = [
    { path: 'sample.py', source: '# 练习结果统计\n\ndef accuracy(correct, total):\n    # 避免除以零\n    if total == 0:\n        return 0\n    return correct / total\n' },
    { path: 'sample.java', source: '// 四则运算示例\n\nclass Sample {\n    /* 输出计算结果 */\n    public static int add(int a, int b) {\n        return a + b;\n    }}\n' },
  ];
  return analyzeUploads({ files: files.map(({ path, source }) => ({ path, contentBase64: btoa(unescape(encodeURIComponent(source))) })) });
}

function countsMatch(actual, expected, includeFiles = false) {
  if (!plainObject(actual)) return false;
  return [...COUNTERS, ...(includeFiles ? ['files'] : [])].every((key) => Number.isSafeInteger(actual[key])
    && actual[key] >= 0 && actual[key] === expected[key]);
}

function validateExportReport(value) {
  const report = objectWithKeys(value, ['version', 'input', 'generatedAt', 'totals', 'languages', 'files', 'skipped', 'errors'], '报告');
  if (report.version !== 1) fail('报告版本无效。');
  const input = textValue(report.input, '报告名称');
  const generatedAt = textValue(report.generatedAt, '生成时间', 40);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(generatedAt) || !Number.isFinite(Date.parse(generatedAt))) fail('生成时间无效。');
  for (const key of ['files', 'skipped', 'errors']) {
    if (!Array.isArray(report[key]) || report[key].length > MAX_REPORT_ROWS) fail('报告条目超过上限。');
  }
  const paths = new Set();
  const uniquePath = (value) => {
    const path = relativePath(value);
    if (paths.has(path)) fail('报告包含重复路径。');
    paths.add(path);
    return path;
  };
  const files = report.files.map((file) => {
    objectWithKeys(file, ['path', 'language', ...COUNTERS], '文件统计');
    const path = uniquePath(file.path);
    if (!LANGUAGE_NAMES.has(file.language) || detectLanguage(path) !== file.language) fail('文件语言无效。');
    if (!COUNTERS.every((key) => Number.isSafeInteger(file[key]) && file[key] >= 0 && file[key] <= 1_000_000_000)
      || file.total !== file.code + file.comment + file.blank) fail('文件行数不满足统计规则。');
    return { path, language: file.language, ...Object.fromEntries(COUNTERS.map((key) => [key, file[key]])) };
  });
  const skipped = report.skipped.map((entry) => {
    objectWithKeys(entry, ['path', 'reason'], '跳过条目');
    if (!SKIP_REASONS.has(entry.reason)) fail('跳过原因无效。');
    return { path: uniquePath(entry.path), reason: entry.reason };
  });
  const errors = report.errors.map((entry) => {
    objectWithKeys(entry, ['path', 'message'], '错误条目');
    return { path: uniquePath(entry.path), message: textValue(entry.message, '错误说明', 1024) };
  });
  const { totals, languages } = aggregate(files);
  if (!countsMatch(report.totals, totals, true)) fail('报告总计与文件明细不一致。');
  if (!Array.isArray(report.languages) || report.languages.length !== languages.length) fail('语言汇总不一致。');
  const sortedLanguages = [...report.languages].sort((left, right) => compare(left?.language, right?.language));
  for (let index = 0; index < languages.length; index += 1) {
    if (sortedLanguages[index]?.language !== languages[index].language || !countsMatch(sortedLanguages[index], languages[index], true)) {
      fail('语言汇总与文件明细不一致。');
    }
  }
  return { version: 1, input, generatedAt, totals, languages, files, skipped, errors };
}

export function exportReport(payload) {
  objectWithKeys(payload, ['format', 'report'], '导出请求');
  if (!['json', 'csv'].includes(payload.format)) fail('仅支持 JSON 或 CSV 导出。');
  const report = validateExportReport(payload.report);
  return {
    body: formatReport(report, payload.format),
    contentType: payload.format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
    filename: `code-count.${payload.format}`,
  };
}

/** Limit actual streamed bytes before JSON.parse, even with no Content-Length. */
export async function readJsonRequest(request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail('请求须使用 application/json。', 'unsupported_media_type', 415);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) fail('只接受本站提交的请求。', 'origin_not_allowed', 403);
  const advertisedLength = request.headers.get('content-length');
  if (advertisedLength !== null && (!/^\d+$/u.test(advertisedLength) || Number(advertisedLength) > MAX_REQUEST_BYTES)) {
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
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('请求体不是有效的 UTF-8 JSON。', 'invalid_json'); }
}

export function errorJSON(error) {
  const known = error instanceof HttpError;
  return Response.json({ error: {
    code: known ? error.code : 'internal_error',
    message: known ? error.message : '统计服务暂时不可用，请稍后重试。',
  } }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
}
