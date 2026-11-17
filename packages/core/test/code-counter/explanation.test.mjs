import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText, explainJavaScript } from '@se-lab/core/counter';

test('explains URLs, mixed comments, multiline literals and whitespace using physical lines', () => {
  const source =
    [
      'const url = "https://example.com";',
      'let n = 1; // mixed',
      '/* start',
      '  ',
      'end */',
      'const text = `literal',
      '// inside template',
      '`;',
      'const r = /[/*]/;',
      '// end',
    ].join('\r\n') + '\r\n';
  const report = explainJavaScript(source);
  assert.equal(report.method, 'parser');
  assert.deepEqual(
    report.lines.map((line) => line.kind),
    ['code', 'code', 'comment', 'blank', 'comment', 'code', 'code', 'code', 'code', 'comment'],
  );
  assert.deepEqual(report.counts, { total: 10, code: 6, comment: 3, blank: 1 });
  assert.equal(report.lines[0].reason, 'literal');
  assert.equal(report.lines[1].reason, 'mixed');
  assert.equal(report.lines[3].reason, 'whitespace');
  assert.equal(report.lines[6].reason, 'literal');
  assert.equal(report.lines[8].reason, 'literal');
  assert.equal(report.lines[9].line, 10);
  assert.equal(report.lines[0].text, 'const url = "https://example.com";');
  assert.deepEqual(report.counts, analyzeText(source, 'JavaScript'));
});

test('reports conservative scanner use for unfinished files with matching totals', () => {
  const source = 'const broken = "unfinished\n// still in string\n\n';
  const report = explainJavaScript(source);
  assert.equal(report.method, 'scanner');
  assert.deepEqual(report.counts, { total: 3, code: 2, comment: 0, blank: 1 });
  assert.deepEqual(report.counts, analyzeText(source, 'JavaScript'));
  assert.equal(report.lines[1].reason, 'literal');
});

test('handles empty files, shebangs, CR and comment-only files', () => {
  assert.deepEqual(explainJavaScript('').counts, { total: 0, code: 0, comment: 0, blank: 0 });
  assert.deepEqual(explainJavaScript('').lines, []);
  const report = explainJavaScript('#!/usr/bin/env node\r// comment\r \r');
  assert.deepEqual(
    report.lines.map((line) => line.kind),
    ['comment', 'comment', 'blank'],
  );
  assert.deepEqual(report.counts, analyzeText('#!/usr/bin/env node\r// comment\r \r', 'JavaScript'));
});

test('limits explanation by UTF-8 bytes without reducing ordinary count limits', () => {
  assert.throws(() => explainJavaScript(null), TypeError);
  const source = '// ' + '中'.repeat(22000);
  assert.throws(() => explainJavaScript(source), RangeError);
  assert.equal(analyzeText(source, 'JavaScript').comment, 1);
  assert.equal(explainJavaScript(' '.repeat(65536)).counts.blank, 1);
  assert.throws(() => explainJavaScript(' '.repeat(65537)), RangeError);
});
