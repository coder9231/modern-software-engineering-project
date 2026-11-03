// @ts-check
/** @typedef {import('@se-lab/core/quality').ReportComparison} ReportComparison */
/** @typedef {{total:number,code:number,comment:number,blank:number}} Counts */
/** @typedef {{kind:'added'|'removed'|'changed',path:string,language:string,before:Counts,after:Counts,delta:Counts}} ComparisonRow */

const empty = Object.freeze({ total: 0, code: 0, comment: 0, blank: 0 });
/** @param {Counts} value @returns {Counts} */
const counts = (value) => ({
  total: value.total,
  code: value.code,
  comment: value.comment,
  blank: value.blank,
});
/** @param {Counts} value @param {1|-1} sign @returns {Counts} */
const signed = (value, sign) => ({
  total: value.total * sign,
  code: value.code * sign,
  comment: value.comment * sign,
  blank: value.blank * sign,
});

/** @param {ReportComparison} comparison @returns {ComparisonRow[]} */
export function comparisonFileRows(comparison) {
  return [
    ...comparison.files.changed.map((file) => ({
      kind: /** @type {const} */ ('changed'),
      path: file.path,
      language: file.languageChanged
        ? `${file.before.language} → ${file.after.language}`
        : file.after.language,
      before: counts(file.before),
      after: counts(file.after),
      delta: counts(file.delta),
    })),
    ...comparison.files.added.map((file) => ({
      kind: /** @type {const} */ ('added'),
      path: file.path,
      language: file.language,
      before: { ...empty },
      after: counts(file),
      delta: signed(file, 1),
    })),
    ...comparison.files.removed.map((file) => ({
      kind: /** @type {const} */ ('removed'),
      path: file.path,
      language: file.language,
      before: counts(file),
      after: { ...empty },
      delta: signed(file, -1),
    })),
  ];
}

/**
 * Keep numeric deltas numeric; prefix untrusted text that spreadsheet programs
 * might treat as a formula, including formulas after whitespace/control chars.
 * @param {string|number} value @returns {string}
 */
export function safeCsvCell(value) {
  let text = String(value);
  if (typeof value === 'string' && (/^[=+\-@\t\r\n]/u.test(text) || /^[\s\u0000-\u001f]+[=+\-@]/u.test(text)))
    text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** @param {ReportComparison} comparison @returns {string} */
export function comparisonToCsv(comparison) {
  const headers = [
    'scope',
    'name',
    'change',
    'language',
    'before_files',
    'after_files',
    'delta_files',
    'before_total',
    'after_total',
    'delta_total',
    'before_code',
    'after_code',
    'delta_code',
    'before_comment',
    'after_comment',
    'delta_comment',
    'before_blank',
    'after_blank',
    'delta_blank',
  ];
  /** @type {(string|number)[][]} */
  const rows = [headers];
  /** @param {string} scope @param {string} name @param {string} change @param {string} language @param {Counts & {files:number}} before @param {Counts & {files:number}} after */
  const add = (scope, name, change, language, before, after) => {
    rows.push([
      scope,
      name,
      change,
      language,
      before.files,
      after.files,
      after.files - before.files,
      before.total,
      after.total,
      after.total - before.total,
      before.code,
      after.code,
      after.code - before.code,
      before.comment,
      after.comment,
      after.comment - before.comment,
      before.blank,
      after.blank,
      after.blank - before.blank,
    ]);
  };
  add('total', 'all', 'summary', '', comparison.before.totals, comparison.after.totals);
  for (const item of comparison.languages)
    add('language', item.language, 'summary', item.language, item.before, item.after);
  for (const item of comparisonFileRows(comparison))
    add(
      'file',
      item.path,
      item.kind,
      item.language,
      { ...item.before, files: item.kind === 'added' ? 0 : 1 },
      { ...item.after, files: item.kind === 'removed' ? 0 : 1 },
    );
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}\r\n`;
}
