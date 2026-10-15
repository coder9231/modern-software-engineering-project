import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, detectLanguage, analyzeText } from './analyzer.mjs';

function expectCounts(source, language, expected) {
  const actual = analyzeText(source, language);
  assert.deepEqual(actual, expected);
  assert.equal(actual.total, actual.code + actual.comment + actual.blank);
}

test('language detection handles all declared extensions, uppercase names and unknown files', () => {
  for (const { name, extensions } of LANGUAGES) {
    for (const extension of extensions) {
      assert.equal(detectLanguage(`folder/source${extension.toUpperCase()}`), name);
    }
  }
  assert.equal(detectLanguage('README.md'), null);
  assert.equal(detectLanguage('Makefile'), null);
  assert.equal(detectLanguage('script.py.backup'), null);
  assert.equal(detectLanguage('component.jsx'), null);
  assert.equal(detectLanguage('component.tsx'), null);
  assert.equal(detectLanguage('style.scss'), null);
});

test('empty input and LF/CRLF/CR endings count physical lines without a phantom final line', () => {
  expectCounts('', 'C', { total: 0, code: 0, comment: 0, blank: 0 });
  expectCounts('\n', 'C', { total: 1, code: 0, comment: 0, blank: 1 });
  expectCounts('a\r\n\t\r// note\n', 'C', { total: 3, code: 1, comment: 1, blank: 1 });
  expectCounts('a\n\n', 'C', { total: 2, code: 1, comment: 0, blank: 1 });
  expectCounts('a', 'C', { total: 1, code: 1, comment: 0, blank: 0 });
});

test('C-style comments preserve code before and after a comment, and blanks inside blocks', () => {
  const source = [
    '// heading',
    'int a = 1; // explanation',
    '/* block',
    '   ',
    ' comment */ int b = 2;',
    '/* closed */',
    '/* first */ /* second */',
    'const char *url = "https://host/*path*/";',
  ].join('\n');
  for (const language of ['C', 'C++', 'Java', 'JavaScript', 'TypeScript']) {
    expectCounts(source, language, { total: 8, code: 3, comment: 4, blank: 1 });
  }
});

test('escaped quotes and backslashes do not accidentally start comments', () => {
  const source = String.raw`const a = "quoted \" // text";
const b = '\\'; /* block
comment */
// last`;
  expectCounts(source, 'JavaScript', { total: 4, code: 2, comment: 2, blank: 0 });
});

test('Python comments exclude hashes inside strings; docstrings are code', () => {
  const source = [
    '# heading',
    'value = "# string" # comment',
    '"""docstring',
    '# is string content',
    '  ',
    'end""" # trailing comment',
    "text = r'''raw # text'''; print(text)",
    '# last',
  ].join('\n');
  expectCounts(source, 'Python', { total: 8, code: 5, comment: 2, blank: 1 });
});

test('Python triple quotes support escapes and multiple strings on the same line', () => {
  const source = String.raw`'''first''' + """second
escaped \""" # still a string
end"""
# comment`;
  expectCounts(source, 'Python', { total: 4, code: 3, comment: 1, blank: 0 });
});

test('CSS uses block comments, while slash pairs and hashes remain code', () => {
  const source = [
    '/* stylesheet',
    '',
    ' */',
    'a { background: url("https://example.test/a/*b"); }',
    '// CSS has no line comment',
    '#main { color: red; } /* end */',
  ].join('\n');
  expectCounts(source, 'CSS', { total: 6, code: 3, comment: 2, blank: 1 });
});

test('JSON counts all nonblank lines as code without accepting comment syntax', () => {
  expectCounts('{\n  "url": "https://host"\n\t\n// not valid JSON\n}\n', 'JSON', {
    total: 5, code: 4, comment: 0, blank: 1,
  });
});

test('JavaScript regular expressions protect slash pairs and slash-star inside character classes', () => {
  const source = String.raw`const url = /https?:\/\/host/;
const punctuation = /[/*]/;
const slash = /[/][*]/; // real comment
// comment
/* block
end */
return /[/*]/.test(input);`;
  expectCounts(source, 'JavaScript', { total: 7, code: 4, comment: 3, blank: 0 });
});

test('division and control-statement regex contexts do not consume following block comments', () => {
  const source = String.raw`const ratio = total / count; /* block
comment */
const divided = {} / 2; /* second
comment */
if (ok) /[/*]/.test(input);
// last`;
  expectCounts(source, 'JavaScript', { total: 6, code: 3, comment: 3, blank: 0 });
});

test('keyword property names do not create a regex context instead of division', () => {
  expectCounts('const ratio = object.return / 2; /* comment\nend */', 'JavaScript', {
    total: 2, code: 1, comment: 1, blank: 0,
  });
});

test('spread preserves the expression context for regex literals containing comment markers', () => {
  expectCounts('const parts = [.../[/*]/.exec("/")];\n// comment\nconst value = 1;', 'JavaScript', {
    total: 3, code: 2, comment: 1, blank: 0,
  });
});

test('function expressions end in a value context before division and multiline comments', () => {
  for (const expression of ['function () {}', 'function named() {}', 'async function () {}', 'function* () {}']) {
    expectCounts(`const ratio = ${expression} / 2; /* block\nend */\n// last`, 'JavaScript', {
      total: 3, code: 1, comment: 2, blank: 0,
    });
  }
});

test('function declarations allow regex statements after their closing body', () => {
  expectCounts('function declared() {} /[/*]/.exec("/");\n// comment\nconst value = 1;', 'JavaScript', {
    total: 3, code: 2, comment: 1, blank: 0,
  });
});

test('nested function defaults preserve the containing function expression context', () => {
  expectCounts('const ratio = function (value = function () {}) {} / 2; /* block\nend */', 'JavaScript', {
    total: 2, code: 1, comment: 1, blank: 0,
  });
});

test('multiline templates preserve literal comment symbols and parse comments in interpolations', () => {
  const source = [
    'const text = `literal',
    '// part of template',
    '   ',
    '${',
    '/* actual comment',
    'end */',
    'value + `${ /* inline */ 1 }`',
    '}',
    '/* literal again */`;',
    '// final comment',
  ].join('\n');
  for (const language of ['JavaScript', 'TypeScript']) {
    expectCounts(source, language, { total: 10, code: 6, comment: 3, blank: 1 });
  }
});

test('template interpolation can contain object braces, escaped backticks and line comments', () => {
  const source = [
    'const text = `escaped \\` \\${ignored}',
    '${',
    '// expression comment',
    '({ value: "/**/" }).value',
    '}`;',
    '// last',
  ].join('\n');
  expectCounts(source, 'JavaScript', { total: 6, code: 4, comment: 2, blank: 0 });
});

test('C++ raw strings preserve quotes, backslashes and comments until matching delimiters', () => {
  const source = [
    'auto text = u8R"tag(first "quote"',
    '// literal content',
    ' ',
    '/* literal block */ )wrong"',
    ')tag"; /* actual block',
    'end */',
    '// last',
  ].join('\n');
  expectCounts(source, 'C++', { total: 7, code: 4, comment: 2, blank: 1 });
});

test('Java text blocks count as code with blank physical lines preserved', () => {
  const source = ['String text = """', '// content', '', '/* content */', '""";', '// end'].join('\n');
  expectCounts(source, 'Java', { total: 6, code: 4, comment: 1, blank: 1 });
});

test('C++ digit separators are numbers rather than unterminated character literals', () => {
  const source = ["auto decimal = 1'000;", '// comment', "auto hex = 0xAB'CD;", '/* comment */'].join('\n');
  expectCounts(source, 'C++', { total: 4, code: 2, comment: 2, blank: 0 });
});

test('unsupported languages and non-string source fail explicitly', () => {
  assert.throws(() => analyzeText('text', 'Unknown'), RangeError);
  assert.throws(() => analyzeText(null, 'C'), TypeError);
});
