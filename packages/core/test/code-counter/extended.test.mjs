import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText, detectLanguage } from '../../../cli/src/code-counter/analyzer.mjs';
import { scanLexicalSource } from '../../src/code-counter/extended.mjs';

test('detects Go, Rust and C# extensions without case sensitivity', () => {
  assert.equal(detectLanguage('src/main.GO'), 'Go');
  assert.equal(detectLanguage('src/main.RS'), 'Rust');
  assert.equal(detectLanguage('src/Main.CS'), 'C#');
});

test('Go raw strings, runes, slash comments and whitespace retain physical lines', () => {
  const source = [
    '// heading',
    'var text = `start',
    '// literal if',
    '  ',
    '/* literal */`',
    "var rune = '/' // inline",
    '/* block',
    'end */',
  ].join('\n');
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.deepEqual(analyzeText(source.replace(/\n/gu, newline), 'Go'), {
      total: 8,
      code: 4,
      comment: 3,
      blank: 1,
    });
  }
});

test('Rust nested comments, hash-delimited raw strings and lifetimes do not confuse each other', () => {
  const source = [
    "fn take<'a>(value: &'a str) -> &'a str {",
    '/* top',
    ' nested /*',
    ' deeper */',
    '*/ value',
    '}',
    'let raw = br##"',
    '// still text',
    '"##; // end',
    "let x = '\\u{1F600}';",
    '// trailing',
  ].join('\n');
  assert.deepEqual(analyzeText(source, 'Rust'), { total: 11, code: 7, comment: 4, blank: 0 });
  assert.equal(scanLexicalSource(source, 'Rust').code.includes('still text'), false);
});

test('C# multiline verbatim text and doubled quotes are code, not comments', () => {
  const source = ['var p = @"C:\\', '//text', '""quoted"""; /* inline', ' comment*/', '// end'].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 5, code: 3, comment: 2, blank: 0 });
});

test('C# four-quote raw literal may contain three quotes and slash markers', () => {
  const source = ['var text = """"', '""" // literal', '/* if */', '"""";', '//end'].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 5, code: 4, comment: 1, blank: 0 });
});

test('C# raw interpolation comments are classified inside replacement expressions', () => {
  const source = [
    'var text = $"""',
    'start {',
    ' // comment in expr',
    ' value ??',
    '  1',
    ' } end',
    '""";',
    '//outside',
  ].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 8, code: 6, comment: 2, blank: 0 });
});

test('C# multiple-dollar interpolation uses matching brace width and nested code strings', () => {
  const source = [
    'var text = $$"""',
    'literal { // code text',
    '{{',
    '  /* comment',
    '  nested */',
    '  new { Text = "/* string */" }',
    '}}',
    '""";',
    '// comment',
  ].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 9, code: 6, comment: 3, blank: 0 });
  const masked = scanLexicalSource(source, 'C#').code;
  assert.equal(masked.includes('literal'), false);
  assert.equal(masked.includes('new { Text'), true);
  assert.equal(masked.includes('string'), false);
});

test('C# interpolated format text is not treated as a slash comment or branch', () => {
  const source = ['var s = $"{value ?? 1:/* if while */}";', '// last'].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 2, code: 1, comment: 1, blank: 0 });
  assert.equal(scanLexicalSource(source, 'C#').code.includes('while'), false);
});

test('C# nested interpolated strings and literal escaped braces close correctly', () => {
  const source = ['var s = $@"{{ literal }} { (ok ? "// if" : $"{value}") }";', '// last'].join('\n');
  assert.deepEqual(analyzeText(source, 'C#'), { total: 2, code: 1, comment: 1, blank: 0 });
});

test('added language counters preserve the partition invariant on unfinished input', () => {
  for (const language of ['Go', 'Rust', 'C#']) {
    for (const source of ['', '\n', '/*', '"unfinished\n\n// text', '/* /* nested */\n\t\n']) {
      const result = analyzeText(source, language);
      assert.equal(result.total, result.code + result.comment + result.blank);
    }
  }
});
