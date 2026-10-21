import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCFamily } from '../../website/lib/code-counter/c-family.mjs';

const both = ['C', 'C++'];
function expect(source, expected, languages = both) {
  for (const language of languages) {
    const actual = analyzeCFamily(source, language);
    assert.deepEqual(actual, expected, language);
    assert.equal(actual.total, actual.code + actual.comment + actual.blank);
  }
}

test('C-family line accounting preserves empty input, final newline and whitespace rules', () => {
  expect('', { total: 0, code: 0, comment: 0, blank: 0 });
  expect('\n', { total: 1, code: 0, comment: 0, blank: 1 });
  expect('int x;\n \t\n// comment\n', { total: 3, code: 1, comment: 1, blank: 1 });
  expect('\\\n', { total: 1, code: 1, comment: 0, blank: 0 });
});

test('line comments continue before lexing for LF, CRLF and CR, including even backslash runs', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    for (const suffix of ['\\', '\\\\']) {
      expect(['// continued ' + suffix, 'int hidden = 1;', 'int visible = 2;'].join(newline),
        { total: 3, code: 1, comment: 2, blank: 0 });
    }
  }
});

test('line comments formed across splices classify both halves as comment', () => {
  expect(['/\\', '/ hidden', 'int visible;'].join('\n'), { total: 3, code: 1, comment: 2, blank: 0 });
  expect(['/\\', '\\', '/ hidden', '// last'].join('\n'), { total: 4, code: 0, comment: 4, blank: 0 });
});

test('block-comment open and close delimiters can both straddle splices', () => {
  expect(['/\\', '* heading', ' *\\', '/', 'int visible;'].join('\n'),
    { total: 5, code: 1, comment: 4, blank: 0 });
  expect(['int x; /\\', '* heading', '*\\', '/ int y;'].join('\n'),
    { total: 4, code: 2, comment: 2, blank: 0 });
});

test('spliced comment markers in strings remain code and escapes use the logical stream', () => {
  expect(['const char *url = "https:/\\', '/host/*path*/";', '// last'].join('\n'),
    { total: 3, code: 2, comment: 1, blank: 0 });
  // The last of two physical backslashes is removed. The remaining one escapes
  // the next physical line's quote, so // there remains literal string content.
  expect(['const char *s = "text \\\\', '" // literal";', '// last'].join('\n'),
    { total: 3, code: 2, comment: 1, blank: 0 });
});

test('macro code continues but trailing comment continuations remain comment-only', () => {
  expect(['#define ADD(x) \\', '  ((x) + 1)', '#define X 1 // continued \\', '  not_code', 'int x;'].join('\n'),
    { total: 5, code: 4, comment: 1, blank: 0 });
  expect(['/* comment */ \\', '// more', 'int x;'].join('\n'), { total: 3, code: 1, comment: 2, blank: 0 });
});

test('blank lines within continued comments and strings remain blank physical lines', () => {
  expect(['// continued \\', '   ', 'int x;'].join('\n'), { total: 3, code: 1, comment: 1, blank: 1 });
  expect(['/* block', '   ', '*/', 'const char *s = "a\\', '\t', 'end";'].join('\n'),
    { total: 6, code: 2, comment: 2, blank: 2 });
  expect(['// continued \\', '\\', '// last'].join('\n'), { total: 3, code: 0, comment: 3, blank: 0 });
});

test('C++ raw strings restore splices so a false closing delimiter cannot be manufactured', () => {
  expect(['auto s = R"tag(first )tag\\', '";', '// literal, not a comment', ')tag";', '// real comment'].join('\n'),
    { total: 5, code: 4, comment: 1, blank: 0 }, ['C++']);
  expect(['auto s = u8R"tag(first "quote"', '// literal', ' ', '/* literal */ )wrong"', ')tag"; /* actual', 'end */', '// last'].join('\n'),
    { total: 7, code: 4, comment: 2, blank: 1 }, ['C++']);
});

test('C++ raw-string prefix may be spliced but its delimiter is physical source', () => {
  expect(['auto s = u8R\\', '"tag(first', '// literal', ')tag";', '// last'].join('\n'),
    { total: 5, code: 4, comment: 1, blank: 0 }, ['C++']);
  expect(['auto s = R"(abc)\\', '" // still literal', ')";', '// last'].join('\n'),
    { total: 4, code: 3, comment: 1, blank: 0 }, ['C++']);
});

test('C++ digit separators do not create unterminated character literals after splicing', () => {
  expect(["auto value = 1'\\", '000;', '// comment', "auto hex = 0xAB'CD;", '/* comment */'].join('\n'),
    { total: 5, code: 3, comment: 2, blank: 0 }, ['C++']);
});

test('C++23 allows horizontal whitespace before the spliced newline, while C requires adjacency', () => {
  const source = '// continued \\ \t\nint hidden;\nint visible;';
  expect(source, { total: 3, code: 1, comment: 2, blank: 0 }, ['C++']);
  expect(source, { total: 3, code: 2, comment: 1, blank: 0 }, ['C']);
});

test('long splice chains stay bounded and all delimiter fragments retain physical line classes', () => {
  const count = 20_000;
  expect('/' + '\\\n'.repeat(count) + '/ comment\nint x;\n',
    { total: count + 2, code: 1, comment: count + 1, blank: 0 });
});

test('C-family scanner rejects unsupported languages and non-string input', () => {
  assert.throws(() => analyzeCFamily(null, 'C'), TypeError);
  assert.throws(() => analyzeCFamily('x', 'Java'), RangeError);
});
