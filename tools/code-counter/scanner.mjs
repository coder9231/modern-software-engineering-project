import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { analyzeText, detectLanguage } from './analyzer.mjs';

export const DEFAULT_EXCLUDES = Object.freeze([
  '.git', '.svn', '.hg', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'target', 'coverage', 'reports',
]);

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const COUNTERS = ['total', 'code', 'comment', 'blank'];
const normalizePath = (value) => value.split(path.sep).join('/');
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const absoluteKey = (value) => process.platform === 'win32' ? value.toLowerCase() : value;

function globSource(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '/' && pattern.slice(index) === '/**') {
      source += '(?:/.*)?';
      break;
    }
    if (char === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        source += '(?:.*/)?';
        index += 1;
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return source;
}

function exclusionMatcher(patterns) {
  const expressions = patterns.map((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('排除模式不能为空。');
    }
    const pattern = value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    const source = globSource(pattern);
    return new RegExp(pattern.includes('/') ? `^${source}$` : `^(?:.*/)?${source}(?:/.*)?$`);
  });
  return (relativePath) => expressions.some((expression) => expression.test(relativePath));
}

function decodeSource(bytes, encoding) {
  let selected = encoding === 'auto' || encoding === 'utf8' ? 'utf-8' : encoding;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) selected = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) selected = 'utf-16be';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) selected = 'utf-8';
  return new TextDecoder(selected, { fatal: true }).decode(bytes);
}

/** Read source files without executing them. All paths in the report use '/'. */
export async function scanPath(inputPath = '.', options = {}) {
  const input = path.resolve(inputPath);
  let inputInfo;
  try {
    inputInfo = await lstat(input);
  } catch (error) {
    throw new Error(`无法访问输入路径 ${input}：${error.code ?? error.message}`);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('文件大小上限必须是非负整数。');
  const encoding = options.encoding ?? 'auto';
  if (!['auto', 'utf8', 'gb18030'].includes(encoding)) throw new Error(`不支持的编码：${encoding}`);
  const isExcluded = exclusionMatcher(options.exclude ?? []);
  const defaultNames = new Set(options.useDefaultExcludes === false ? [] : DEFAULT_EXCLUDES);
  const ignoredPaths = new Set((options.ignoredPaths ?? []).map((value) => absoluteKey(path.resolve(value))));
  const extensions = new Set((options.extensions ?? []).map((value) => {
    const extension = value.trim().toLowerCase();
    return extension.startsWith('.') ? extension : `.${extension}`;
  }));
  const root = inputInfo.isDirectory() ? input : path.dirname(input);
  const report = {
    version: 1,
    input,
    generatedAt: new Date().toISOString(),
    totals: { files: 0, total: 0, code: 0, comment: 0, blank: 0 },
    languages: [],
    files: [],
    skipped: [],
    errors: [],
  };
  const skip = (relativePath, reason) => report.skipped.push({ path: relativePath, reason });

  async function visit(absolutePath, knownInfo) {
    const relativePath = normalizePath(path.relative(root, absolutePath)) || '.';
    const isRoot = absolutePath === input;
    if (ignoredPaths.has(absoluteKey(absolutePath)) || isExcluded(relativePath)) {
      skip(relativePath, 'excluded');
      return;
    }
    let info;
    try {
      info = knownInfo ?? await lstat(absolutePath);
    } catch (error) {
      report.errors.push({ path: relativePath, message: `${error.code ?? ''} ${error.message}`.trim() });
      return;
    }
    if (info.isSymbolicLink()) {
      skip(relativePath, 'symbolic_link');
      return;
    }
    if (info.isDirectory()) {
      // An explicitly selected root directory is scanned even if its name is normally excluded.
      if (!isRoot && defaultNames.has(path.basename(absolutePath).toLowerCase())) {
        skip(relativePath, 'excluded');
        return;
      }
      let entries;
      try {
        entries = await readdir(absolutePath);
      } catch (error) {
        report.errors.push({ path: relativePath, message: `${error.code ?? ''} ${error.message}`.trim() });
        return;
      }
      entries.sort(compare);
      for (const entry of entries) await visit(path.join(absolutePath, entry));
      return;
    }
    if (!info.isFile()) {
      skip(relativePath, 'unsupported_file_type');
      return;
    }
    const language = detectLanguage(absolutePath);
    if (!language) {
      skip(relativePath, 'unsupported_extension');
      return;
    }
    if (extensions.size && !extensions.has(path.extname(absolutePath).toLowerCase())) {
      skip(relativePath, 'extension_filter');
      return;
    }
    if (info.size > maxBytes) {
      skip(relativePath, 'too_large');
      return;
    }
    let bytes;
    try {
      bytes = await readFile(absolutePath);
    } catch (error) {
      report.errors.push({ path: relativePath, message: `${error.code ?? ''} ${error.message}`.trim() });
      return;
    }
    if (bytes.length > maxBytes) {
      skip(relativePath, 'too_large');
      return;
    }
    let text;
    try {
      text = decodeSource(bytes, encoding);
    } catch {
      skip(relativePath, 'invalid_encoding');
      return;
    }
    if (text.includes('\0')) {
      skip(relativePath, 'binary');
      return;
    }
    report.files.push({ path: relativePath, language, ...analyzeText(text, language) });
  }

  await visit(input, inputInfo);
  report.files.sort((left, right) => compare(left.path, right.path));
  report.skipped.sort((left, right) => compare(left.path, right.path));
  report.errors.sort((left, right) => compare(left.path, right.path));
  const byLanguage = new Map();
  for (const file of report.files) {
    const summary = byLanguage.get(file.language) ?? { language: file.language, files: 0, total: 0, code: 0, comment: 0, blank: 0 };
    summary.files += 1;
    report.totals.files += 1;
    for (const key of COUNTERS) {
      summary[key] += file[key];
      report.totals[key] += file[key];
    }
    byLanguage.set(file.language, summary);
  }
  report.languages = [...byLanguage.values()].sort((left, right) => compare(left.language, right.language));
  return report;
}
