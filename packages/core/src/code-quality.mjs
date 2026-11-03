// @ts-check
import { parse } from '@babel/parser';
import { analyzeText, LANGUAGES } from '@se-lab/core/counter';
import { MAX_PARSER_BYTES } from './code-counter/javascript.mjs';
import { physicalLines, scanLexicalSource } from './code-counter/extended.mjs';

/** @typedef {import('@se-lab/core/counter').Language} Language */
/** @typedef {import('@se-lab/core/counter').Counts} Counts */
/** @typedef {{ path: string, language: string } & Counts} FileCounts */
/** @typedef {{ files: number } & Counts} Totals */
/** @typedef {{ input?: string, totals: Totals, files: FileCounts[] }} ComparisonReport */
/** @typedef {{ minBlockLines?: number, maxBlocks?: number }} QualityOptions */
/** @typedef {{ path: string, language: Language, content: string }} QualitySource */
/** @typedef {{ path: string, startLine: number, endLine: number }} Occurrence */
/** @typedef {{ lines: number, occurrences: Occurrence[] }} DuplicateBlock */
/** @typedef {{ analyzedLines: number, duplicateLines: number, ratio: number, blocks: DuplicateBlock[], truncated: boolean }} Duplication */
/** @typedef {{ method: 'lexical-file-estimate', estimate: number|null, decisionPoints: number|null, decisions: Record<string,number> }} Complexity */
/** @typedef {{ version: 1, language: Language, counts: Counts, commentRatio: number, complexity: Complexity, duplication: Duplication|null, warnings: string[] }} QualityReport */

const supported = new Set(LANGUAGES.map((item) => item.name));
/** @type {readonly (keyof Counts)[]} */
const keys = ['total', 'code', 'comment', 'blank'];
export const MAX_QUALITY_SOURCE_CHARS = 1024 * 1024;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * JS/TS quality projections use grammar tokens so /if|for/ and string/template
 * text never become decisions. Unsupported/oversized syntax has no estimate.
 * @param {string} text @param {Language} language
 * @returns {string|null}
 */
function javascriptProjection(text, language) {
  if (text.length > MAX_PARSER_BYTES || new TextEncoder().encode(text).byteLength > MAX_PARSER_BYTES)
    return null;
  let parsed;
  try {
    parsed = parse(text, {
      sourceType: 'unambiguous',
      plugins: language === 'TypeScript' ? ['typescript'] : [],
      tokens: true,
      attachComment: false,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowYieldOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return null;
    throw error;
  }
  /** @type {unknown[]} */
  const tokens = parsed.tokens ?? [];
  /** @type {string[]} */
  const pieces = [];
  let offset = 0;
  for (const token of tokens) {
    if (!record(token) || typeof token.start !== 'number' || typeof token.end !== 'number') continue;
    const label = record(token.type) ? token.type.label : token.type;
    const hidden = ['CommentLine', 'CommentBlock', 'string', 'regexp', 'template', '#!...'].includes(
      String(label),
    );
    if (!hidden) continue;
    pieces.push(
      text.slice(offset, token.start),
      text.slice(token.start, token.end).replace(/[^\r\n]/gu, ' '),
    );
    offset = token.end;
  }
  pieces.push(text.slice(offset));
  return pieces.join('');
}

/** @param {string} text @param {Language} language @returns {string|null} */
function projection(text, language) {
  // Do not turn a supported line-counting case into a misleading quality
  // estimate when this secondary projection cannot preserve its lexical goal.
  if ((language === 'C' || language === 'C++') && /\\[ \t\v\f]*(?:\r\n|\r|\n)/u.test(text)) return null;
  if (language === 'Python' && /\b(?:f|fr|rf)["']/iu.test(text)) return null;
  return language === 'JavaScript' || language === 'TypeScript'
    ? javascriptProjection(text, language)
    : scanLexicalSource(text, language).code;
}

/** @param {QualityOptions} options @returns {{minBlockLines:number, maxBlocks:number}} */
function settings(options) {
  const minBlockLines = options.minBlockLines ?? 3;
  const maxBlocks = options.maxBlocks ?? 20;
  if (!Number.isSafeInteger(minBlockLines) || minBlockLines < 2 || minBlockLines > 20)
    throw new RangeError('minBlockLines must be an integer from 2 to 20');
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > 100)
    throw new RangeError('maxBlocks must be an integer from 1 to 100');
  return { minBlockLines, maxBlocks };
}

/** @param {string} code @param {Language} language @returns {Complexity} */
function complexityOf(code, language) {
  /** @type {Record<string,number>} */
  const decisions = {};
  const words =
    language === 'Python'
      ? /\b(?:if|elif|for|while|except|and|or|case)\b/gu
      : /\b(?:if|for|while|case|catch)\b/gu;
  for (const match of code.matchAll(words)) {
    let before = match.index - 1;
    while (before >= 0 && /\s/u.test(code[before])) before -= 1;
    const previous = code[before];
    if (previous === '.' || previous === '$') continue;
    decisions[match[0]] = (decisions[match[0]] ?? 0) + 1;
  }
  if (language !== 'Python') {
    for (const token of code.match(/&&|\|\||(?<!\?)\?(?![?.])/gu) ?? [])
      decisions[token] = (decisions[token] ?? 0) + 1;
  }
  if (language === 'Rust') {
    const arms = (code.match(/=>/gu) ?? []).length;
    const matches = (code.match(/\bmatch\b/gu) ?? []).length;
    if (arms > matches) decisions['match arms'] = arms - matches;
  }
  const decisionPoints = Object.values(decisions).reduce((sum, value) => sum + value, 0);
  return {
    method: 'lexical-file-estimate',
    estimate: code.trim() ? 1 + decisionPoints : 0,
    decisionPoints,
    decisions,
  };
}

/**
 * Compare normalized blocks of meaningful code lines. Literals/comments are
 * masked, whitespace collapsed; this is structural repetition, not plagiarism
 * detection or a semantic clone analyzer. Returned sample lists are bounded.
 * @param {{path:string, code:string}[]} sources @param {QualityOptions} options
 * @returns {Duplication}
 */
function duplicationOf(sources, options) {
  const { minBlockLines, maxBlocks } = settings(options);
  /** @type {Map<string, {path:string, line:number, ordinal:number}[]>} */
  const candidates = new Map();
  /** @type {Map<string, number>} */
  const ordinalByLocation = new Map();
  /** @type {Map<string, {text:string, line:number}[]>} */
  const meaningfulByPath = new Map();
  let analyzedLines = 0;
  for (const source of sources) {
    const lines = physicalLines(source.code)
      .map((text, index) => ({ text: text.trim().replace(/\s+/gu, ' '), line: index + 1 }))
      .filter((item) => /[\p{L}\p{N}]/u.test(item.text));
    meaningfulByPath.set(source.path, lines);
    const base = analyzedLines;
    analyzedLines += lines.length;
    for (let index = 0; index < lines.length; index += 1)
      ordinalByLocation.set(`${source.path}\0${lines[index].line}`, base + index);
    for (let index = 0; index <= lines.length - minBlockLines; index += 1) {
      const block = lines.slice(index, index + minBlockLines);
      const fingerprint = block.map((item) => item.text).join('\n');
      const occurrences = candidates.get(fingerprint) ?? [];
      occurrences.push({ path: source.path, line: block[0].line, ordinal: index });
      candidates.set(fingerprint, occurrences);
    }
  }
  /** @type {Set<number>} */
  const duplicated = new Set();
  /** @type {DuplicateBlock[]} */
  const blocks = [];
  let truncated = false;
  for (const occurrences of candidates.values()) {
    // Overlapping windows within one file are not independent copies.
    /** @type {typeof occurrences} */
    const independent = [];
    for (const occurrence of occurrences) {
      const previous = independent.at(-1);
      if (
        !previous ||
        previous.path !== occurrence.path ||
        occurrence.ordinal >= previous.ordinal + minBlockLines
      )
        independent.push(occurrence);
    }
    if (independent.length < 2) continue;
    for (const occurrence of independent.slice(1)) {
      const ordinal = ordinalByLocation.get(`${occurrence.path}\0${occurrence.line}`);
      if (ordinal !== undefined)
        for (let index = 0; index < minBlockLines; index += 1) duplicated.add(ordinal + index);
    }
    if (blocks.length < maxBlocks)
      blocks.push({
        lines: minBlockLines,
        occurrences: independent.slice(0, 20).map((item) => {
          const meaningful = meaningfulByPath.get(item.path) ?? [];
          return {
            path: item.path,
            startLine: item.line,
            endLine: meaningful[item.ordinal + minBlockLines - 1]?.line ?? item.line,
          };
        }),
      });
    else truncated = true;
    if (independent.length > 20) truncated = true;
  }
  return {
    analyzedLines,
    duplicateLines: duplicated.size,
    ratio: analyzedLines ? duplicated.size / analyzedLines : 0,
    blocks,
    truncated,
  };
}

/**
 * A teaching aid, never a quality score: complexity is one file-wide lexical
 * baseline plus decision tokens, not per-function McCabe complexity. Comment
 * ratio uses comment-only physical lines / nonblank physical lines. Duplicate
 * ratio measures additional normalized block occurrences beyond the first.
 * @param {string} text @param {Language} language @param {QualityOptions} [options]
 * @returns {QualityReport}
 */
export function analyzeQuality(text, language, options = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (text.length > MAX_QUALITY_SOURCE_CHARS)
    throw new RangeError('Quality analysis supports at most 1 Mi characters per file');
  if (!supported.has(language)) throw new RangeError(`Unsupported language: ${language}`);
  settings(options);
  const counts = analyzeText(text, language);
  const code = projection(text, language);
  const warnings = [
    '词法启发式估计，不是完整语法级圈复杂度或质量评分；不评价程序正确性。',
    '注释率仅计算纯注释行；重复率忽略注释、字面量文字与空白差异，不用于判断抄袭。',
  ];
  const unavailable = code === null || language === 'JSON' || language === 'CSS';
  if (code === null)
    warnings.push(
      '当前质量投影不覆盖此词法情况，复杂度与重复率不提供估计；行数仍使用专用分类器。JS/TS 解析预算为 64 KiB；Python f-string 与 C/C++ 续行暂只提供行数。',
    );
  if (language === 'C#') warnings.push('不分析预处理分支或类型语义；可空类型的问号可能影响词法复杂度估计。');
  return {
    version: 1,
    language,
    counts,
    commentRatio: counts.total > counts.blank ? counts.comment / (counts.total - counts.blank) : 0,
    complexity: unavailable
      ? { method: 'lexical-file-estimate', estimate: null, decisionPoints: null, decisions: {} }
      : complexityOf(code, language),
    duplication: code === null ? null : duplicationOf([{ path: '(source)', code }], options),
    warnings,
  };
}

/** @param {QualitySource[]} sources @param {QualityOptions} [options] */
export function analyzeProjectQuality(sources, options = {}) {
  if (!Array.isArray(sources) || sources.length > 100)
    throw new RangeError('Provide at most 100 source files');
  settings(options);
  const paths = new Set();
  let size = 0;
  const files = sources.map((source) => {
    if (!source || typeof source.path !== 'string' || !source.path || paths.has(source.path))
      throw new TypeError('Source paths must be nonempty and unique');
    if (typeof source.content !== 'string') throw new TypeError('Source content must be a string');
    paths.add(source.path);
    size += source.content.length;
    if (size > MAX_QUALITY_SOURCE_CHARS)
      throw new RangeError('Project quality analysis supports at most 1 Mi characters in total');
    return { path: source.path, ...analyzeQuality(source.content, source.language, options) };
  });
  /** @type {{path:string, code:string}[]} */
  const projected = [];
  for (const source of sources) {
    const code = projection(source.content, source.language);
    if (code !== null) projected.push({ path: source.path, code });
  }
  return {
    version: 1,
    files,
    duplication: duplicationOf(projected, options),
    excludedFiles: files.filter((file) => file.duplication === null).map((file) => file.path),
    method: 'normalized-code-blocks',
  };
}

/** @param {unknown} value @returns {asserts value is ComparisonReport} */
function assertReport(value) {
  if (!record(value) || !record(value.totals) || !Array.isArray(value.files))
    throw new TypeError('A report must contain totals and files');
  if (value.input !== undefined && typeof value.input !== 'string')
    throw new TypeError('Report input must be a string');
  /** @type {unknown[]} */
  const inputFiles = value.files;
  if (inputFiles.length > 20000) throw new RangeError('Compare at most 20000 files per report');
  const checked = [value.totals, ...inputFiles];
  for (const item of checked) {
    if (
      !record(item) ||
      keys.some((key) => typeof item[key] !== 'number' || !Number.isSafeInteger(item[key]) || item[key] < 0)
    )
      throw new TypeError('Report counts must be nonnegative safe integers');
    if (item.total !== Number(item.code) + Number(item.comment) + Number(item.blank))
      throw new TypeError('Report line counts are inconsistent');
  }
  const paths = new Set();
  const totals = { total: 0, code: 0, comment: 0, blank: 0 };
  for (const file of inputFiles) {
    if (
      !record(file) ||
      typeof file.path !== 'string' ||
      !file.path ||
      file.path.length > 4096 ||
      typeof file.language !== 'string'
    )
      throw new TypeError('Report files need a path and language');
    const path = file.path.replace(/\\/gu, '/');
    if (paths.has(path)) throw new TypeError('Report paths must be unique');
    paths.add(path);
    for (const key of keys) totals[key] += Number(file[key]);
  }
  if (value.totals.files !== inputFiles.length) throw new TypeError('Report file count is inconsistent');
  for (const key of keys)
    if (value.totals[key] !== totals[key]) throw new TypeError('Report totals do not match file counts');
}

/** @param {Counts} before @param {Counts} after @returns {Counts} */
function delta(before, after) {
  return {
    total: after.total - before.total,
    code: after.code - before.code,
    comment: after.comment - before.comment,
    blank: after.blank - before.blank,
  };
}

/**
 * Pure count comparison. Same-count edits and renames cannot be inferred without
 * source hashes; a "changed" file means its counts or language changed.
 * @param {unknown} before @param {unknown} after
 */
export function compareReports(before, after) {
  assertReport(before);
  assertReport(after);
  const left = new Map(before.files.map((file) => [file.path.replace(/\\/gu, '/'), file]));
  const right = new Map(after.files.map((file) => [file.path.replace(/\\/gu, '/'), file]));
  /** @type {FileCounts[]} */
  const added = [];
  /** @type {FileCounts[]} */
  const removed = [];
  /** @type {{path:string, before:FileCounts, after:FileCounts, delta:Counts, languageChanged:boolean}[]} */
  const changed = [];
  let unchanged = 0;
  for (const [path, file] of left) {
    const next = right.get(path);
    if (!next) removed.push({ ...file });
    else if (file.language !== next.language || keys.some((key) => file[key] !== next[key]))
      changed.push({
        path,
        before: { ...file },
        after: { ...next },
        delta: delta(file, next),
        languageChanged: file.language !== next.language,
      });
    else unchanged += 1;
  }
  for (const [path, file] of right) if (!left.has(path)) added.push({ ...file });
  /** @param {FileCounts[]} files @returns {Map<string,Totals>} */
  const byLanguage = (files) => {
    /** @type {Map<string,Totals>} */
    const groups = new Map();
    for (const file of files) {
      const group = groups.get(file.language) ?? { files: 0, total: 0, code: 0, comment: 0, blank: 0 };
      group.files += 1;
      for (const key of keys) group[key] += file[key];
      groups.set(file.language, group);
    }
    return groups;
  };
  const oldLanguages = byLanguage(before.files);
  const newLanguages = byLanguage(after.files);
  const empty = { files: 0, total: 0, code: 0, comment: 0, blank: 0 };
  const languages = [...new Set([...oldLanguages.keys(), ...newLanguages.keys()])].sort().map((language) => {
    const old = oldLanguages.get(language) ?? empty;
    const next = newLanguages.get(language) ?? empty;
    return {
      language,
      before: { ...old },
      after: { ...next },
      delta: { ...delta(old, next), files: next.files - old.files },
    };
  });
  return {
    version: 1,
    before: { input: before.input ?? '', totals: { ...before.totals } },
    after: { input: after.input ?? '', totals: { ...after.totals } },
    delta: { ...delta(before.totals, after.totals), files: after.totals.files - before.totals.files },
    files: { added, removed, changed, unchanged },
    languages,
    warnings: ['仅比较路径、语言和行数；同等行数的源码修改与文件重命名不能据此识别。'],
  };
}
