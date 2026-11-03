import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeQuality,
  analyzeProjectQuality,
  compareReports,
  MAX_QUALITY_SOURCE_CHARS,
} from '@se-lab/core/quality';

test('JS complexity ignores comments, regexes and string/template text but keeps interpolation expressions', () => {
  const source = [
    'const rx = /if|for|while/;',
    'const text = "while ? &&";',
    'const tmpl = `if for ${flag ? "while" : "catch"}`;',
    'if (ready && ok) run(); // catch for while',
  ].join('\n');
  const quality = analyzeQuality(source, 'JavaScript');
  assert.equal(quality.complexity.estimate, 4);
  assert.deepEqual(quality.complexity.decisions, { if: 1, '?': 1, '&&': 1 });
});

test('Go and Rust quality do not count branch words inside their raw strings or comments', () => {
  assert.equal(
    analyzeQuality('var text = `if for while &&`\nif ready { run() } // while', 'Go').complexity.estimate,
    2,
  );
  assert.equal(
    analyzeQuality('let s = r###"if for while"###;\n/* if /* for */ while */\nif ready { run(); }', 'Rust')
      .complexity.estimate,
    2,
  );
});

test('C# quality recognizes ternary expressions while excluding literal and format text', () => {
  const source = 'var text = $"{(ready ? "if while" : "for catch")} {value ?? 1:/* if */}";';
  assert.equal(analyzeQuality(source, 'C#').complexity.estimate, 2);
});

test('comment ratio is explicitly comment-only / nonblank, not a claim about inline coverage', () => {
  const quality = analyzeQuality('// first\n\nconst x=1; // inline\n/* last */', 'JavaScript');
  assert.equal(quality.commentRatio, 2 / 3);
  assert.equal(analyzeQuality('\n\n', 'JavaScript').commentRatio, 0);
});

test('unsupported quality contexts retain line counts without inventing complexity', () => {
  for (const [text, language] of [
    ['x'.repeat(65 * 1024), 'JavaScript'],
    ['value = f"{"if"}"', 'Python'],
    ['// continued \\\nif fake', 'C'],
  ]) {
    const quality = analyzeQuality(text, language);
    assert.equal(quality.complexity.estimate, null);
    assert.equal(quality.duplication, null);
    assert.ok(quality.warnings.length >= 3);
  }
  assert.equal(analyzeQuality('{"if":1}', 'JSON').complexity.estimate, null);
});

test('repeated normalized blocks report physical line ranges and additional duplicate lines', () => {
  const source = ['a = 1;', 'b = 2;', 'c = 3;', '', 'a = 1;', 'b = 2;', 'c = 3;'].join('\n');
  const quality = analyzeQuality(source, 'JavaScript');
  assert.equal(quality.duplication.analyzedLines, 6);
  assert.equal(quality.duplication.duplicateLines, 3);
  assert.equal(quality.duplication.ratio, 0.5);
  assert.deepEqual(quality.duplication.blocks[0].occurrences, [
    { path: '(source)', startLine: 1, endLine: 3 },
    { path: '(source)', startLine: 5, endLine: 7 },
  ]);
});

test('overlapping windows alone are not counted as independent block copies', () => {
  const quality = analyzeQuality('a();\na();\na();\na();', 'JavaScript');
  assert.equal(quality.duplication.ratio, 0);
});

test('project repetition compares files and bounds sample output', () => {
  const sources = Array.from({ length: 25 }, (_, index) => ({
    path: `${index}.js`,
    language: 'JavaScript',
    content: 'a();\nb();\nc();',
  }));
  const quality = analyzeProjectQuality(sources, { maxBlocks: 1 });
  assert.equal(quality.duplication.duplicateLines, 24 * 3);
  assert.equal(quality.duplication.blocks[0].occurrences.length, 20);
  assert.equal(quality.duplication.truncated, true);
  assert.equal(quality.duplication.ratio, 24 / 25);
});

test('quality limits reject unsafe sizes, duplicate paths and invalid settings', () => {
  assert.throws(() => analyzeQuality('x'.repeat(MAX_QUALITY_SOURCE_CHARS + 1), 'Go'), /1 Mi/u);
  assert.throws(() => analyzeQuality('a()', 'Go', { minBlockLines: 1 }), /minBlockLines/u);
  assert.throws(
    () =>
      analyzeProjectQuality([
        { path: 'a', language: 'Go', content: '' },
        { path: 'a', language: 'Go', content: '' },
      ]),
    /unique/u,
  );
});

function file(path, code, comment = 0, language = 'Go') {
  return { path, language, total: code + comment, code, comment, blank: 0 };
}
function report(files) {
  const totals = files.reduce(
    (sum, item) => ({
      files: sum.files + 1,
      total: sum.total + item.total,
      code: sum.code + item.code,
      comment: sum.comment + item.comment,
      blank: 0,
    }),
    { files: 0, total: 0, code: 0, comment: 0, blank: 0 },
  );
  return { input: '(test)', totals, files };
}

test('report comparison detects added, removed and statistically changed files and language totals', () => {
  const before = report([file('same.go', 3), file('changed.go', 2), file('removed.go', 1)]);
  const after = report([file('same.go', 3), file('changed.go', 4, 1), file('added.rs', 2, 0, 'Rust')]);
  const original = JSON.stringify({ before, after });
  const comparison = compareReports(before, after);
  assert.deepEqual(comparison.delta, { total: 4, code: 3, comment: 1, blank: 0, files: 0 });
  assert.equal(comparison.files.unchanged, 1);
  assert.equal(comparison.files.changed[0].path, 'changed.go');
  assert.equal(comparison.files.added[0].path, 'added.rs');
  assert.equal(comparison.files.removed[0].path, 'removed.go');
  assert.equal(comparison.languages.find((item) => item.language === 'Rust').delta.code, 2);
  assert.equal(JSON.stringify({ before, after }), original);
});

test('comparison normalizes separators but does not guess renames or same-count source edits', () => {
  const comparison = compareReports(report([file('src\\a.go', 3)]), report([file('src/a.go', 3)]));
  assert.equal(comparison.files.unchanged, 1);
  assert.equal(comparison.files.changed.length, 0);
  assert.match(comparison.warnings[0], /同等行数/u);
});

test('comparison rejects invalid and inconsistent uploaded reports', () => {
  const valid = report([file('a.go', 2)]);
  assert.throws(() => compareReports(null, valid), /totals/u);
  assert.throws(
    () => compareReports({ ...valid, totals: { ...valid.totals, code: -1 } }, valid),
    /nonnegative/u,
  );
  assert.throws(
    () => compareReports({ ...valid, totals: { ...valid.totals, files: 8 } }, valid),
    /file count/u,
  );
  assert.throws(() => compareReports(report([file('a.go', 1), file('a.go', 1)]), valid), /unique/u);
  assert.throws(
    () => compareReports({ ...valid, totals: { files: 1, total: 3, code: 3, comment: 0, blank: 0 } }, valid),
    /totals/u,
  );
});
