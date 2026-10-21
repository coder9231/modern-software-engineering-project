const CODE = 1;
const COMMENT = 2;
const rawPrefixes = new Set(['R', 'u8R', 'uR', 'UR', 'LR']);
const identifierStart = /[\p{ID_Start}_]/u;
const identifierPart = /[\p{ID_Continue}_]/u;
const horizontalSpace = /[ \t\v\f]/u;

/**
 * C/C++ phase-2 line splicing with physical-line accounting. C uses an
 * immediately adjacent backslash/newline; C++ also accepts intervening horizontal
 * whitespace, as specified since C++23. Raw-string contents restore phase-2
 * characters before matching their delimiter (C++ [lex.pptoken]).
 *
 * This does not expand macros, evaluate #if, or translate legacy trigraphs.
 * Invalid source is counted best-effort, without compiling or executing it.
 */
export function analyzeCFamily(text, language) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (language !== 'C' && language !== 'C++') throw new RangeError(`Unsupported C-family language: ${language}`);
  const counts = { total: 0, code: 0, comment: 0, blank: 0 };
  if (text === '') return counts;

  const source = text.replace(/\r\n|\r/gu, '\n');
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  counts.total = lines.length;
  const marks = new Uint8Array(lines.length);
  const starts = [];
  // Each entry is normally its own index, or the first surviving character after
  // a splice. Resolving backward makes even very long splice chains O(n), rather
  // than repeatedly walking them for token lookahead.
  const logicalAt = new Uint32Array(source.length + 1);
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    const newline = offset + line.length;
    if (newline < source.length) {
      let last = line.length - 1;
      if (language === 'C++') {
        while (last >= 0 && horizontalSpace.test(line[last])) last -= 1;
      }
      if (line[last] === '\\') logicalAt[offset + last] = newline + 1;
    }
    offset = newline + 1;
  }
  logicalAt[source.length] = source.length;
  for (let position = source.length - 1; position >= 0; position -= 1) {
    logicalAt[position] = logicalAt[position] === 0 ? position : logicalAt[logicalAt[position]];
  }

  let index = 0;
  let physicalLine = 0;
  let mode = 'code';
  let quote = '';
  let escaped = false;
  let rawEnding = '';

  // Every physical span is consumed once. A token spanning a splice marks both
  // physical lines; deleted continuation markers alone never turn a comment line
  // into code. A nonblank, otherwise unmarked line is code by the existing rule.
  function consume(end, mark = 0) {
    while (physicalLine + 1 < starts.length && starts[physicalLine + 1] < end) {
      marks[physicalLine] |= mark;
      physicalLine += 1;
    }
    if (index < end && physicalLine < marks.length) marks[physicalLine] |= mark;
    index = end;
    while (physicalLine + 1 < starts.length && starts[physicalLine + 1] <= index) physicalLine += 1;
  }

  while (index < source.length) {
    if (mode !== 'raw') {
      const next = logicalAt[index];
      if (next !== index) {
        consume(next, mode === 'lineComment' || mode === 'blockComment' ? COMMENT : mode === 'string' ? CODE : 0);
        if (index >= source.length) break;
      }
    }
    const character = source[index];
    if (character === '\n') {
      if (mode === 'lineComment') mode = 'code';
      // A genuine, unspliced newline cannot be escaped by an ordinary string.
      // Keep an unclosed string as best-effort input, matching the old scanner.
      escaped = false;
      consume(index + 1);
      continue;
    }
    if (mode === 'raw') {
      if (source.startsWith(rawEnding, index)) {
        consume(index + rawEnding.length, CODE);
        mode = 'code';
      } else consume(index + 1, CODE);
      continue;
    }
    if (mode === 'lineComment') {
      consume(index + 1, COMMENT);
      continue;
    }
    const following = logicalAt[index + 1];
    if (mode === 'blockComment') {
      if (character === '*' && source[following] === '/') {
        consume(following + 1, COMMENT);
        mode = 'code';
      } else consume(index + 1, COMMENT);
      continue;
    }
    if (mode === 'string') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) mode = 'code';
      consume(index + 1, CODE);
      continue;
    }
    if (/\s/u.test(character)) {
      consume(index + 1);
      continue;
    }
    if (character === '/' && (source[following] === '/' || source[following] === '*')) {
      mode = source[following] === '/' ? 'lineComment' : 'blockComment';
      consume(following + 1, COMMENT);
      continue;
    }
    if (identifierStart.test(character)) {
      let end = index;
      let prefix = '';
      do {
        if (prefix.length < 4) prefix += source[end];
        end = logicalAt[end + 1];
      } while (end < source.length && identifierPart.test(source[end]));
      if (language === 'C++' && rawPrefixes.has(prefix) && source[end] === '"') {
        // Revert splicing immediately after the opening quote, including in the
        // delimiter. A backslash or newline there makes a malformed raw token.
        let delimiterEnd = end + 1;
        while (delimiterEnd <= end + 17 && delimiterEnd < source.length
          && !/[ ()\\\t\v\f\n]/u.test(source[delimiterEnd])) delimiterEnd += 1;
        if (source[delimiterEnd] === '(' && delimiterEnd <= end + 17) {
          rawEnding = `)${source.slice(end + 1, delimiterEnd)}"`;
          mode = 'raw';
          consume(delimiterEnd + 1, CODE);
          continue;
        }
      }
      consume(end, CODE);
      continue;
    }
    if (/[0-9]/u.test(character)) {
      let end = following;
      let previous = character;
      while (end < source.length) {
        const digit = source[end];
        const after = logicalAt[end + 1];
        if (/[\w.]/u.test(digit)
          || (language === 'C++' && digit === "'" && /[0-9a-f]/iu.test(previous)
            && /[0-9a-f]/iu.test(source[after] ?? ''))) {
          previous = digit;
          end = after;
        } else break;
      }
      consume(end, CODE);
      continue;
    }
    if (character === '"' || character === "'") {
      mode = 'string';
      quote = character;
      escaped = false;
    }
    consume(index + 1, CODE);
  }

  for (let line = 0; line < lines.length; line += 1) {
    if (lines[line].trim() === '') counts.blank += 1;
    else if (marks[line] & CODE) counts.code += 1;
    else if (marks[line] & COMMENT) counts.comment += 1;
    else counts.code += 1;
  }
  return counts;
}
