// @ts-check

/** @typedef {{ total: number, code: number, comment: number, blank: number }} Counts */
/** @typedef {{ kind: 'code'|'comment'|'string'|'format', ending?: string, escaped?: boolean, verbatim?: boolean, raw?: boolean, depth: number, interpolation?: boolean, braceWidth: number, parens: number, brackets: number, ternaries: number }} Frame */

/** @returns {Frame} */
function codeFrame() {
  return { kind: 'code', depth: 0, braceWidth: 1, parens: 0, brackets: 0, ternaries: 0 };
}

/** @param {string} text @returns {string[]} */
export function physicalLines(text) {
  if (!text.length) return [];
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Identify ordinary/raw C# strings, retaining the number of interpolation braces.
 * This is a lexer, not a preprocessor or a C# semantic/format-string validator.
 * @param {string} source
 * @returns {{ length: number, frame: Frame } | null}
 */
function csharpString(source) {
  const match = /^(?:(\$+)(@)?|(@)(\$)?)?("{3,}|"|')/u.exec(source);
  if (!match) return null;
  const quote = match[5];
  const dollars = match[1]?.length ?? (match[4] ? 1 : 0);
  if (quote === "'" && match[0] !== "'") return null;
  const raw = quote.length >= 3;
  return {
    length: match[0].length,
    frame: {
      kind: 'string',
      ending: quote,
      depth: 0,
      braceWidth: raw ? dollars : dollars ? 1 : 0,
      parens: 0,
      brackets: 0,
      ternaries: 0,
      raw,
      verbatim: Boolean(match[2] || match[3]),
      escaped: false,
    },
  };
}

/**
 * Lexical projection shared by added language counters and quality heuristics.
 * Comments and literal text become spaces; interpolation expressions remain code.
 * It accepts unfinished source, does not execute it or evaluate preprocessors.
 * Python f-string fields are intentionally masked as literal text in this quality
 * projection; the authoritative Python line counter still uses its own parser.
 * @param {string} text
 * @param {string} language
 * @returns {{ counts: Counts, code: string }}
 */
export function scanLexicalSource(text, language) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const lines = physicalLines(text);
  /** @type {Counts} */
  const counts = { total: lines.length, code: 0, comment: 0, blank: 0 };
  /** @type {Frame[]} */
  const frames = [codeFrame()];
  /** @type {string[]} */
  const projected = [];
  const python = language === 'Python';
  const slashComments = !python && language !== 'CSS' && language !== 'JSON';

  for (const line of lines) {
    let index = 0;
    let hasCode = false;
    let hasComment = false;
    /** @type {[number, number][]} */
    const hidden = [];
    /** @param {number} start @param {number} end */
    const hide = (start, end) => {
      const previous = hidden.at(-1);
      if (previous && previous[1] === start) previous[1] = end;
      else hidden.push([start, end]);
    };

    while (index < line.length) {
      const frame = frames[frames.length - 1];
      const character = line[index];
      if (frame.kind === 'comment') {
        hasComment = true;
        if (language === 'Rust' && line.startsWith('/*', index)) {
          frame.depth += 1;
          hide(index, index + 2);
          index += 2;
        } else if (line.startsWith('*/', index)) {
          frame.depth -= 1;
          hide(index, index + 2);
          index += 2;
          if (frame.depth === 0) frames.pop();
        } else {
          hide(index, index + 1);
          index += 1;
        }
        continue;
      }
      if (frame.kind === 'format') {
        hasCode = true;
        const ending = '}'.repeat(frame.braceWidth);
        if (line.startsWith(ending, index)) {
          hide(index, index + ending.length);
          index += ending.length;
          frames.pop();
          frames.pop();
        } else {
          hide(index, index + 1);
          index += 1;
        }
        continue;
      }
      if (frame.kind === 'string') {
        hasCode = true;
        const ending = frame.ending ?? '"';
        if (frame.escaped) {
          frame.escaped = false;
          hide(index, index + 1);
          index += 1;
        } else if (!frame.raw && !frame.verbatim && character === '\\') {
          frame.escaped = true;
          hide(index, Math.min(index + 2, line.length));
          index += 2;
          frame.escaped = false;
        } else if (frame.verbatim && line.startsWith('""', index)) {
          hide(index, index + 2);
          index += 2;
        } else if (line.startsWith(ending, index)) {
          hide(index, index + ending.length);
          index += ending.length;
          frames.pop();
        } else if (frame.braceWidth && character === '{') {
          let run = 1;
          while (line[index + run] === '{') run += 1;
          if (!frame.raw && run >= 2) {
            hide(index, index + 2);
            index += 2;
          } else if (run >= frame.braceWidth) {
            // Raw interpolated strings use N dollars and N opening braces. Any
            // surplus leading braces belong to the literal portion.
            hide(index, index + run);
            index += run;
            frames.push({ ...codeFrame(), interpolation: true, braceWidth: frame.braceWidth });
          } else {
            hide(index, index + run);
            index += run;
          }
        } else {
          hide(index, index + 1);
          index += 1;
        }
        continue;
      }

      if (/\s/u.test(character)) {
        index += 1;
        continue;
      }
      if ((python && character === '#') || (slashComments && line.startsWith('//', index))) {
        hasComment = true;
        hide(index, line.length);
        index = line.length;
        continue;
      }
      if (!python && language !== 'JSON' && line.startsWith('/*', index)) {
        hasComment = true;
        frames.push({ ...codeFrame(), kind: 'comment', depth: 1 });
        hide(index, index + 2);
        index += 2;
        continue;
      }
      hasCode = true;
      if (frame.interpolation && frame.depth === 0 && line.startsWith('}'.repeat(frame.braceWidth), index)) {
        hide(index, index + frame.braceWidth);
        index += frame.braceWidth;
        frames.pop();
        continue;
      }
      if (language === 'C#') {
        const literal = csharpString(line.slice(index));
        if (literal) {
          hide(index, index + literal.length);
          index += literal.length;
          frames.push(literal.frame);
          continue;
        }
      } else if (language === 'Rust') {
        const raw = /^(?:br|cr|r)(#{0,255})"/u.exec(line.slice(index));
        if (raw) {
          hide(index, index + raw[0].length);
          index += raw[0].length;
          frames.push({ ...codeFrame(), kind: 'string', ending: `"${raw[1]}`, raw: true, braceWidth: 0 });
          continue;
        }
        if (character === "'") {
          const char = /^'(?:\\(?:[nrt0\\'"]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]+\})|[^'\\\r\n])'/u.exec(
            line.slice(index),
          );
          if (char) {
            hide(index, index + char[0].length);
            index += char[0].length;
          } else index += 1; // A lifetime, not an unterminated character literal.
          continue;
        }
      } else if (language === 'C++') {
        const raw = /^(?:u8|u|U|L)?R"([^ ()\\\t]{0,16})\(/u.exec(line.slice(index));
        if (raw) {
          hide(index, index + raw[0].length);
          index += raw[0].length;
          frames.push({ ...codeFrame(), kind: 'string', ending: `)${raw[1]}"`, raw: true, braceWidth: 0 });
          continue;
        }
      }
      if (
        language === 'C++' &&
        character === "'" &&
        /[0-9a-f]/iu.test(line[index - 1] ?? '') &&
        /[0-9a-f]/iu.test(line[index + 1] ?? '')
      ) {
        index += 1;
        continue;
      }
      if (language !== 'C#' && (character === '"' || character === "'")) {
        const triple = (python || language === 'Java') && line.startsWith(character.repeat(3), index);
        const ending = character.repeat(triple ? 3 : 1);
        hide(index, index + ending.length);
        index += ending.length;
        frames.push({ ...codeFrame(), kind: 'string', ending, braceWidth: 0 });
        continue;
      }
      if (
        (language === 'Go' || language === 'JavaScript' || language === 'TypeScript') &&
        character === '`'
      ) {
        hide(index, index + 1);
        index += 1;
        frames.push({ ...codeFrame(), kind: 'string', ending: '`', raw: language === 'Go', braceWidth: 0 });
        continue;
      }
      if (frame.interpolation) {
        if (character === '{') frame.depth += 1;
        else if (character === '}') frame.depth = Math.max(0, frame.depth - 1);
        else if (character === '(') frame.parens += 1;
        else if (character === ')') frame.parens = Math.max(0, frame.parens - 1);
        else if (character === '[') frame.brackets += 1;
        else if (character === ']') frame.brackets = Math.max(0, frame.brackets - 1);
        else if (
          !frame.depth &&
          !frame.parens &&
          !frame.brackets &&
          character === '?' &&
          line[index - 1] !== '?' &&
          !['?', '.'].includes(line[index + 1])
        )
          frame.ternaries += 1;
        else if (
          !frame.depth &&
          !frame.parens &&
          !frame.brackets &&
          character === ':' &&
          line[index - 1] !== ':' &&
          line[index + 1] !== ':'
        ) {
          if (frame.ternaries) frame.ternaries -= 1;
          else {
            frames.push({ ...codeFrame(), kind: 'format', braceWidth: frame.braceWidth });
            hide(index, index + 1);
          }
        }
      }
      index += 1;
    }
    let offset = 0;
    /** @type {string[]} */
    const pieces = [];
    for (const [start, end] of hidden) {
      pieces.push(line.slice(offset, start), ' '.repeat(end - start));
      offset = end;
    }
    pieces.push(line.slice(offset));
    projected.push(pieces.join(''));
    if (!line.trim()) counts.blank += 1;
    else if (hasCode) counts.code += 1;
    else if (hasComment) counts.comment += 1;
    else counts.code += 1;
  }
  return { counts, code: projected.join('\n') };
}

/** @param {string} text @param {string} language @returns {Counts} */
export function analyzeExtended(text, language) {
  return scanLexicalSource(text, language).counts;
}
