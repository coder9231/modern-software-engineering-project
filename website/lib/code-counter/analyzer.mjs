import { extname } from 'node:path';

/** First-version languages. Extensions are matched without regard to case. */
export const LANGUAGES = Object.freeze([
  { name: 'C', extensions: ['.c', '.h'] },
  { name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'] },
  { name: 'Java', extensions: ['.java'] },
  { name: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'] },
  { name: 'TypeScript', extensions: ['.ts', '.mts', '.cts'] },
  { name: 'Python', extensions: ['.py', '.pyw'] },
  { name: 'CSS', extensions: ['.css'] },
  { name: 'JSON', extensions: ['.json'] },
].map((language) => Object.freeze({
  ...language,
  extensions: Object.freeze(language.extensions),
})));

const extensionLanguages = new Map(
  LANGUAGES.flatMap(({ name, extensions }) => extensions.map((extension) => [extension, name])),
);
const languageNames = new Set(LANGUAGES.map(({ name }) => name));
const cStyleLineComments = new Set(['C', 'C++', 'Java', 'JavaScript', 'TypeScript']);
const scriptLanguages = new Set(['JavaScript', 'TypeScript']);
const expressionKeywords = new Set([
  'return', 'throw', 'case', 'yield', 'await', 'void', 'typeof', 'delete',
  'instanceof', 'in', 'of', 'new', 'else', 'do',
]);
const controlKeywords = new Set(['if', 'while', 'for', 'with', 'switch', 'catch']);
const objectBefore = new Set(['=', '(', '[', ',', ':', 'return', 'yield']);
const functionExpressionBefore = new Set([
  ...objectBefore, 'throw', 'case', 'await', 'void', 'typeof', 'delete',
  'instanceof', 'in', 'of', 'new', '?', '!', '~', '+', '-', '*', '/', '%',
  '&', '|', '^', '<', '>', '=>', '...',
]);

export function detectLanguage(filePath) {
  return extensionLanguages.get(extname(filePath).toLowerCase()) ?? null;
}

function newCodeFrame(interpolation = false) {
  return {
    kind: 'code',
    interpolation,
    braceKinds: [],
    parens: [],
    functionContexts: [],
    asyncFunctionExpression: false,
    regexAllowed: true,
    pendingControl: false,
    previousToken: '',
  };
}

function finishValue(frame) {
  frame.regexAllowed = false;
  frame.pendingControl = false;
  frame.previousToken = 'value';
}

/**
 * Count physical lines, not statements. Nonblank lines with any code are code;
 * otherwise a comment line is comment. Whitespace-only lines are always blank.
 * Python triple strings/docstrings and Java text blocks are code, not comments.
 *
 * This is a lexical scanner, not a language parser. JavaScript/TypeScript use a
 * token-context heuristic to distinguish regex literals from division; unusual
 * grammar contexts can remain ambiguous. C preprocessing/line splicing and
 * Python f-string expressions are not parsed. JSX, TSX and SCSS extensions are
 * unsupported. JSON counts every nonblank line as code, without validation.
 * Source is never evaluated. Malformed input is counted on a best-effort basis.
 */
export function analyzeText(text, language) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!languageNames.has(language)) throw new RangeError(`Unsupported language: ${language}`);

  const counts = { total: 0, code: 0, comment: 0, blank: 0 };
  if (text.length === 0) return counts;

  const lines = text.split(/\r\n|\n|\r/u);
  // A final newline terminates its preceding physical line; it adds no extra line.
  if (lines.at(-1) === '') lines.pop();
  counts.total = lines.length;
  if (language === 'JSON') {
    for (const line of lines) counts[line.trim() === '' ? 'blank' : 'code'] += 1;
    return counts;
  }

  const isScript = scriptLanguages.has(language);
  const hasSlashComments = cStyleLineComments.has(language);
  const frames = [newCodeFrame()];

  for (const line of lines) {
    let hasCode = false;
    let hasComment = false;
    let index = 0;

    while (index < line.length) {
      const frame = frames.at(-1);
      const character = line[index];

      if (frame.kind === 'blockComment') {
        hasComment = true;
        if (line.startsWith('*/', index)) {
          frames.pop();
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }

      if (frame.kind === 'rawString') {
        hasCode = true;
        if (line.startsWith(frame.ending, index)) {
          index += frame.ending.length;
          frames.pop();
          finishValue(frames.at(-1));
        } else {
          index += 1;
        }
        continue;
      }

      if (frame.kind === 'string' || frame.kind === 'tripleString') {
        hasCode = true;
        if (frame.escaped) {
          frame.escaped = false;
          index += 1;
        } else if (character === '\\') {
          frame.escaped = true;
          index += 1;
        } else if (line.startsWith(frame.ending, index)) {
          index += frame.ending.length;
          frames.pop();
          finishValue(frames.at(-1));
        } else {
          index += 1;
        }
        continue;
      }

      if (frame.kind === 'template') {
        hasCode = true;
        if (frame.escaped) {
          frame.escaped = false;
          index += 1;
        } else if (character === '\\') {
          frame.escaped = true;
          index += 1;
        } else if (character === '`') {
          frames.pop();
          finishValue(frames.at(-1));
          index += 1;
        } else if (line.startsWith('${', index)) {
          frames.push(newCodeFrame(true));
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }

      if (frame.kind === 'regex') {
        hasCode = true;
        if (frame.escaped) {
          frame.escaped = false;
        } else if (character === '\\') {
          frame.escaped = true;
        } else if (character === '[') {
          frame.inClass = true;
        } else if (character === ']') {
          frame.inClass = false;
        } else if (character === '/' && !frame.inClass) {
          frames.pop();
          finishValue(frames.at(-1));
        }
        index += 1;
        continue;
      }

      // Only code frames reach here. Whitespace does not change token context.
      if (/\s/u.test(character)) {
        index += 1;
        continue;
      }
      if (language === 'Python' && character === '#') {
        hasComment = true;
        break;
      }
      if (hasSlashComments && line.startsWith('//', index)) {
        hasComment = true;
        break;
      }
      if (language !== 'Python' && line.startsWith('/*', index)) {
        hasComment = true;
        frames.push({ kind: 'blockComment' });
        index += 2;
        continue;
      }

      hasCode = true;
      if (language === 'C++') {
        // Standard raw strings, including u8R/uR/UR/LR prefixes and delimiters.
        const rawStart = /^(?:u8|u|U|L)?R"([^ ()\\\t\v\f\r\n]{0,16})\(/u.exec(line.slice(index));
        if (rawStart) {
          frames.push({ kind: 'rawString', ending: `)${rawStart[1]}"` });
          index += rawStart[0].length;
          continue;
        }
        // Apostrophes inside C++ numeric literals are digit separators, not
        // character-string delimiters (for example 1'000 or 0xAB'CD).
        if (/[0-9]/u.test(character)) {
          index += 1;
          while (index < line.length) {
            if (/[\w.]/u.test(line[index])) index += 1;
            else if (line[index] === "'" && /[0-9a-f]/iu.test(line[index - 1])
                && /[0-9a-f]/iu.test(line[index + 1] ?? '')) index += 1;
            else break;
          }
          continue;
        }
      }
      if (language === 'Python' && (line.startsWith('"""', index) || line.startsWith("'''", index))) {
        frames.push({ kind: 'tripleString', ending: line.slice(index, index + 3), escaped: false });
        index += 3;
        continue;
      }
      if (language === 'Java' && line.startsWith('"""', index)) {
        frames.push({ kind: 'tripleString', ending: '"""', escaped: false });
        index += 3;
        continue;
      }
      if (character === '"' || character === "'") {
        frames.push({ kind: 'string', ending: character, escaped: false });
        index += 1;
        continue;
      }
      if (isScript && character === '`') {
        frames.push({ kind: 'template', escaped: false });
        index += 1;
        continue;
      }
      if (!isScript) {
        index += 1;
        continue;
      }

      if (character === '/' && frame.regexAllowed) {
        frames.push({ kind: 'regex', escaped: false, inClass: false });
        index += 1;
        continue;
      }

      if (/[\p{ID_Start}_$]/u.test(character)) {
        const start = index;
        index += 1;
        while (index < line.length && /[\p{ID_Continue}$]/u.test(line[index])) index += 1;
        const word = line.slice(start, index);
        // A keyword used as a property name is an ordinary value (obj.return).
        const propertyName = frame.previousToken === '.';
        if (!propertyName && word === 'async') {
          frame.asyncFunctionExpression = functionExpressionBefore.has(frame.previousToken);
        } else if (!propertyName && word === 'function') {
          frame.functionContexts.push({
            expression: frame.previousToken === 'async'
              ? frame.asyncFunctionExpression
              : functionExpressionBefore.has(frame.previousToken),
            parameterDepth: null,
            awaitingBody: false,
          });
        }
        frame.regexAllowed = !propertyName && expressionKeywords.has(word);
        frame.pendingControl = !propertyName && controlKeywords.has(word);
        frame.previousToken = word;
        continue;
      }
      if (/[0-9]/u.test(character)) {
        index += 1;
        while (index < line.length && /[\w.]/u.test(line[index])) index += 1;
        finishValue(frame);
        continue;
      }

      if (character === '(') {
        frame.parens.push(frame.pendingControl);
        const functionContext = frame.functionContexts.at(-1);
        if (functionContext && functionContext.parameterDepth === null) {
          functionContext.parameterDepth = frame.parens.length;
        }
        frame.regexAllowed = true;
      } else if (character === ')') {
        frame.regexAllowed = frame.parens.pop() === true;
        const functionContext = frame.functionContexts.at(-1);
        if (functionContext && frame.parens.length === functionContext.parameterDepth - 1) {
          functionContext.awaitingBody = true;
        }
      } else if (character === '{') {
        const functionContext = frame.functionContexts.at(-1);
        if (functionContext?.awaitingBody) {
          frame.functionContexts.pop();
          frame.braceKinds.push(functionContext.expression ? 'functionExpression' : 'block');
        } else {
          frame.braceKinds.push(objectBefore.has(frame.previousToken) ? 'object' : 'block');
        }
        frame.regexAllowed = true;
      } else if (character === '}') {
        if (frame.interpolation && frame.braceKinds.length === 0) {
          frames.pop();
          index += 1;
          continue;
        }
        const closedBrace = frame.braceKinds.pop();
        frame.regexAllowed = closedBrace !== 'object' && closedBrace !== 'functionExpression';
      } else if (character === ']') {
        frame.regexAllowed = false;
      } else if ((character === '+' || character === '-') && line[index + 1] === character) {
        // Postfix ++/-- keep the preceding value context; prefix keeps expression context.
        frame.pendingControl = false;
        frame.previousToken = character + character;
        index += 2;
        continue;
      } else if (line.startsWith('...', index)) {
        // Spread/rest expects another expression; treating its last dot as
        // property access would incorrectly hide a following regex literal.
        frame.regexAllowed = true;
        frame.pendingControl = false;
        frame.previousToken = '...';
        index += 3;
        continue;
      } else if (character === '.') {
        frame.regexAllowed = false;
      } else if (line.startsWith('=>', index)) {
        frame.regexAllowed = true;
        frame.pendingControl = false;
        frame.previousToken = '=>';
        index += 2;
        continue;
      } else {
        frame.regexAllowed = true;
      }
      frame.pendingControl = false;
      frame.previousToken = character;
      index += 1;
    }

    // Line breaks cannot be escaped twice. String state survives continued lines.
    for (const frame of frames) {
      if ('escaped' in frame) frame.escaped = false;
    }
    // A regex literal cannot span physical lines. Do not let malformed input
    // swallow otherwise independent comment lines on the following line.
    if (frames.at(-1).kind === 'regex') {
      frames.pop();
      finishValue(frames.at(-1));
    }

    if (line.trim() === '') counts.blank += 1;
    else if (hasCode) counts.code += 1;
    else if (hasComment) counts.comment += 1;
    else counts.code += 1;
  }
  return counts;
}
