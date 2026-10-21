import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText } from './analyzer.mjs';
import { analyzeJavaScript, MAX_PARSER_BYTES } from '../../website/lib/code-counter/javascript.mjs';

// Each row has a manually assigned physical-line classification. Expectations
// deliberately do not inspect parser tokens or reproduce scanner decisions.
function expectRows(rows, language = 'JavaScript', newline = '\n') {
  const expected = { total: rows.length, code: 0, comment: 0, blank: 0 };
  for (const [kind] of rows) expected[kind] += 1;
  assert.deepEqual(analyzeText(rows.map(([, text]) => text).join(newline), language), expected);
}

test('class expressions end in a value context before division and block comments', () => {
  for (const expression of ['class {}', 'class Named {}', 'class extends Base {}']) {
    for (const language of ['JavaScript', 'TypeScript']) {
      expectRows([
        ['code', `const ratio = ${expression} / 2; /* block`],
        ['comment', 'still a comment */'],
        ['comment', '// final comment'],
      ], language);
    }
  }
});

test('class declarations allow a following regex statement with apparent comment markers', () => {
  expectRows([
    ['code', 'class Named { method() { return 1; } }'],
    ['code', '/[/*]/.test("/");'],
    ['comment', '// actual comment'],
    ['code', 'const next = 1;'],
  ]);
});

test('arrow return expressions, object literals and methods preserve division context', () => {
  expectRows([
    ['code', 'const factory = () => class {} / 2; /* first'],
    ['comment', 'end first */'],
    ['code', 'const ratio = (() => ({}))() / 2; /* second'],
    ['comment', 'end second */'],
    ['code', 'const object = { method() { return /[/*]/; } };'],
    ['code', 'const last = object.method() / 2; /* third'],
    ['comment', 'end third */'],
  ]);
});

test('async, await, yield and generator bodies distinguish regex values and division', () => {
  expectRows([
    ['code', 'async function run() {'],
    ['code', '  return await Promise.resolve(6) / 2; /* first'],
    ['comment', '  end first */'],
    ['code', '}'],
    ['code', 'function* values() {'],
    ['code', '  yield /[/*]/;'],
    ['code', '  const ratio = (yield 4) / 2; /* second'],
    ['comment', '  end second */'],
    ['code', '}'],
  ]);
});

test('TypeScript assertions, satisfies and non-null expressions end before division', () => {
  for (const expression of ['value as number', 'value satisfies number', 'value!', '<number>value']) {
    expectRows([
      ['code', `const ratio = ${expression} / 2; /* block`],
      ['comment', 'comment, not a regex tail */'],
      ['comment', '// last'],
    ], 'TypeScript');
  }
});

test('TypeScript generic calls and instantiation expressions preserve comment boundaries', () => {
  expectRows([
    ['code', 'function identity<T>(value: T): T { return value; }'],
    ['code', 'const ratio = identity<number>(6) / 2; /* first'],
    ['comment', 'end first */'],
    ['code', 'const factory = identity<number>;'],
    ['code', 'const result = factory(8) / 2; /* second'],
    ['comment', 'end second */'],
    ['code', 'const generic = <T>(value: T) => value;'],
    ['code', 'const third = generic<number>(10) / 2; /* third'],
    ['comment', 'end third */'],
  ], 'TypeScript');
});

test('TypeScript interface and type member comments are not source-code lines', () => {
  expectRows([
    ['code', 'interface Shape {'],
    ['comment', '  /* member explanation'],
    ['blank', '  '],
    ['comment', '  end explanation */'],
    ['code', '  value: number; // inline explanation'],
    ['code', '  method<T>(input: T): T;'],
    ['code', '}'],
    ['code', 'type Container = {'],
    ['comment', '  // a type member comment'],
    ['code', '  item: Shape;'],
    ['code', '};'],
  ], 'TypeScript');
});

test('multiline template literal text and interpolation comments receive distinct classifications', () => {
  expectRows([
    ['code', 'const text = `literal'],
    ['code', '// literal, not a comment'],
    ['blank', '   '],
    ['code', '${'],
    ['comment', '  /* expression comment'],
    ['comment', '  end comment */'],
    ['code', '  `${ /[/*]/.source }`'],
    ['code', '}'],
    ['code', '/* literal again */`;'],
    ['comment', '// final'],
  ]);
});

test('empty template chunks and a trailing newline do not mark neighboring comments as code', () => {
  expectRows([
    ['code', 'const empty = ``;'],
    ['code', 'const interpolated = `${1}${2}`;'],
    ['comment', '// no token from the previous line may leak here'],
    ['blank', ' '],
  ]);
  assert.deepEqual(analyzeText('const empty = ``;\n// last\n', 'JavaScript'), {
    total: 2, code: 1, comment: 1, blank: 0,
  });
});

test('regex character classes, escapes, quantifiers and flags do not start comments', () => {
  expectRows([
    ['code', String.raw`const slash = /[/*]/u;`],
    ['code', String.raw`const url = /https?:\/\/host\/[a-z]{1,3}/gi;`],
    ['code', String.raw`const escaped = /\/[/*]\//; // actual trailing comment`],
    ['comment', '/* actual block'],
    ['comment', 'end */'],
    ['code', 'const ratio = slash.test("/") / 2;'],
  ]);
});

test('comment-like strings inside comments do not create nested block-comment state', () => {
  expectRows([
    ['comment', '/* outer comment'],
    ['comment', '"/*" and "//" are comment content'],
    ['comment', 'end */'],
    ['code', 'const text = "/* string */";'],
    ['comment', '// last'],
  ]);
});

test('hashbangs are comments while the following source still counts as code', () => {
  expectRows([
    ['comment', '#!/usr/bin/env node'],
    ['comment', '// program description'],
    ['blank', ''],
    ['code', 'console.log("# not a comment");'],
  ]);
});

test('CRLF and CR boundaries preserve parser token offsets and blank-line priority', () => {
  const rows = [
    ['code', 'const ratio = class {} / 2; /* block'],
    ['blank', '\t'],
    ['comment', 'end block */'],
    ['code', 'const value = `literal'],
    ['code', '// literal content'],
    ['code', '`;'],
    ['comment', '// last'],
  ];
  for (const newline of ['\n', '\r\n', '\r']) expectRows(rows, 'JavaScript', newline);
});

test('unsupported or malformed grammar is still counted without executing source', () => {
  for (const source of ['const = ;\n// comment', 'const text = "unterminated\n// text', '/* unclosed\nblock', 'const x = <Broken\n// comment']) {
    for (const language of ['JavaScript', 'TypeScript']) {
      const counts = analyzeText(source, language);
      assert.equal(counts.total, 2);
      assert.equal(counts.total, counts.code + counts.comment + counts.blank);
    }
  }
  expectRows([
    ['code', 'throw new Error("source must not be executed");'],
    ['comment', '// still counted'],
  ]);
});

test('large JS/TS inputs respect a UTF-8 parser budget and retain full physical counts', () => {
  const large = '// heading\n' + '0;\n'.repeat(MAX_PARSER_BYTES / 2);
  for (const language of ['JavaScript', 'TypeScript']) {
    assert.equal(analyzeJavaScript(large, language), null);
    assert.deepEqual(analyzeText(large, language), {
      total: MAX_PARSER_BYTES / 2 + 1, code: MAX_PARSER_BYTES / 2, comment: 1, blank: 0,
    });
    const unicode = '// ' + '中'.repeat(MAX_PARSER_BYTES / 3);
    assert.ok(unicode.length < MAX_PARSER_BYTES);
    assert.ok(new TextEncoder().encode(unicode).byteLength > MAX_PARSER_BYTES);
    assert.equal(analyzeJavaScript(unicode, language), null);
    assert.deepEqual(analyzeText(unicode, language), { total: 1, code: 0, comment: 1, blank: 0 });
  }
});
