import { parse } from '@babel/parser';

// Parsing creates an AST as well as tokens. Bound that extra work in the shared
// Worker/CLI path; the ordinary scanner remains available for larger files.
export const MAX_PARSER_BYTES = 64 * 1024;

/**
 * Parse JS/TS before classifying tokens. A slash's lexical goal depends on the
 * grammar (for example class expressions versus declarations), not its nearest
 * brace. Return null for unrecoverable syntax so unfinished files can use the
 * conservative scanner instead of making an entire upload fail.
 */
export function analyzeJavaScript(text, language) {
  if (text.length > MAX_PARSER_BYTES || new TextEncoder().encode(text).byteLength > MAX_PARSER_BYTES) return null;
  let tokens;
  try {
    ({ tokens } = parse(text, {
      sourceType: 'unambiguous',
      plugins: language === 'TypeScript' ? ['typescript'] : [],
      tokens: true,
      attachComment: false,
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowYieldOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
    }));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return null;
    throw error;
  }

  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === '') lines.pop();
  const starts = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    starts.push(offset);
    offset += lines[index].length;
    offset += text[offset] === '\r' && text[offset + 1] === '\n' ? 2 : 1;
  }
  const flags = new Uint8Array(lines.length);
  let line = 0;
  for (const token of tokens) {
    // Babel emits an EOF and possibly empty template segments at [n, n).
    if (token.end <= token.start) continue;
    while (line + 1 < starts.length && starts[line + 1] <= token.start) line += 1;
    const comment = token.type === 'CommentLine' || token.type === 'CommentBlock'
      || token.type.label === '#!...';
    const flag = comment ? 1 : 2;
    for (let covered = line; covered < starts.length && starts[covered] < token.end; covered += 1) {
      flags[covered] |= flag;
    }
  }
  const counts = { total: lines.length, code: 0, comment: 0, blank: 0 };
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === '') counts.blank += 1;
    else if (flags[index] & 2) counts.code += 1;
    else if (flags[index] & 1) counts.comment += 1;
    else counts.code += 1;
  }
  return counts;
}
