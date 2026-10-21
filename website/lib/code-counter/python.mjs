const prefixes = new Set(['r', 'u', 'b', 'f', 'br', 'rb', 'fr', 'rf']);
const nameStart = /[\p{ID_Start}_]/u;
const nameContinue = /[\p{ID_Continue}_]/u;
const whitespace = /\s/u;

function stringFrame(line, quoteIndex, prefix = '') {
  const quote = line[quoteIndex];
  const ending = line.startsWith(quote.repeat(3), quoteIndex) ? quote.repeat(3) : quote;
  return {
    kind: 'string', ending, formatted: prefix.includes('f'), raw: prefix.includes('r'),
    continued: false, openingLength: ending.length,
  };
}

/**
 * Classify Python physical lines without evaluating source or validating syntax.
 * f-string replacement fields follow Python 3.12 / PEP 701 lexical rules:
 * expressions may contain comments, reused quotes, nested strings and newlines.
 * A format specification is literal text except for nested replacement fields.
 * Triple-quoted strings/docstrings are code; whitespace-only lines stay blank.
 *
 * The explicit frame stack avoids recursion even for deeply nested f-strings.
 * Invalid source is best effort: an unescaped newline ends an ordinary short
 * string, while an unfinished triple string/replacement field survives to EOF.
 * This does not implement Python 3.14 t-string syntax or syntax diagnostics.
 * Reference: https://docs.python.org/3.12/reference/lexical_analysis.html#f-strings
 */
export function analyzePython(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const counts = { total: 0, code: 0, comment: 0, blank: 0 };
  if (!text.length) return counts;
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === '') lines.pop();
  counts.total = lines.length;
  const frames = [{ kind: 'code' }];

  for (const line of lines) {
    let hasCode = false;
    let hasComment = false;
    let index = 0;
    while (index < line.length) {
      const frame = frames.at(-1);
      const character = line[index];

      if (frame.kind === 'string') {
        hasCode = true;
        if (line.startsWith(frame.ending, index)) {
          frames.pop();
          index += frame.ending.length;
        } else if (character === '\\') {
          // Braces cannot be escaped with a backslash in an f-string. The
          // braces of a non-raw Unicode-name escape, however, are not fields.
          if (frame.formatted && !frame.raw && line.startsWith('\\N{', index)) {
            const end = line.indexOf('}', index + 3);
            index = end === -1 ? line.length : end + 1;
          } else if (frame.formatted && /[{}]/u.test(line[index + 1] ?? '')) {
            index += 1;
          } else {
            frame.continued = index === line.length - 1;
            index += Math.min(2, line.length - index);
          }
        } else if (frame.formatted && character === '{') {
          if (line[index + 1] === '{') index += 2;
          else {
            frames.push({ kind: 'expression', brackets: [] });
            index += 1;
          }
        } else if (frame.formatted && character === '}' && line[index + 1] === '}') {
          index += 2;
        } else index += 1;
        continue;
      }

      if (frame.kind === 'format') {
        // #, quote characters and backslashes here are literal format text,
        // unlike their meanings inside the preceding expression.
        hasCode = true;
        if (character === '{') frames.push({ kind: 'expression', brackets: [] });
        else if (character === '}') frames.pop();
        index += 1;
        continue;
      }

      if (whitespace.test(character)) {
        index += 1;
        continue;
      }
      if (character === '#') {
        hasComment = true;
        break;
      }
      hasCode = true;

      if (character === '"' || character === "'") {
        const nextFrame = stringFrame(line, index);
        frames.push(nextFrame);
        index += nextFrame.openingLength;
        continue;
      }
      if (nameStart.test(character)) {
        const start = index++;
        while (index < line.length && nameContinue.test(line[index])) index += 1;
        const prefix = line.slice(start, index).toLowerCase();
        if (prefixes.has(prefix) && (line[index] === '"' || line[index] === "'")) {
          const nextFrame = stringFrame(line, index, prefix);
          frames.push(nextFrame);
          index += nextFrame.openingLength;
        }
        continue;
      }

      if (frame.kind === 'expression') {
        if (character === '}' && frame.brackets.length === 0) frames.pop();
        else if (character === ':' && frame.brackets.length === 0) frame.kind = 'format';
        else if ('([{'.includes(character)) frame.brackets.push(character);
        else if (')]}'.includes(character)) {
          // Valid input has matching delimiters. Popping one for malformed
          // input guarantees progress without treating it as executable code.
          if (frame.brackets.length) frame.brackets.pop();
        }
      }
      index += 1;
    }

    const top = frames.at(-1);
    if (top.kind === 'string') {
      if (top.ending.length === 1 && !top.continued) frames.pop();
      else top.continued = false;
    }
    if (line.trim() === '') counts.blank += 1;
    else if (hasCode) counts.code += 1;
    else if (hasComment) counts.comment += 1;
    else counts.code += 1;
  }
  return counts;
}
