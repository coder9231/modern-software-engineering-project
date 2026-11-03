import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonToCsv, comparisonFileRows, safeCsvCell } from './counter-insights-export.mjs';

const count = (code) => ({ total: code + 1, code, comment: 1, blank: 0 });
const comparison = {
  version: 1,
  before: { input: 'before', totals: { files: 2, total: 6, code: 4, comment: 2, blank: 0 } },
  after: { input: 'after', totals: { files: 2, total: 9, code: 7, comment: 2, blank: 0 } },
  delta: { files: 0, total: 3, code: 3, comment: 0, blank: 0 },
  languages: [
    {
      language: 'Go',
      before: { files: 2, total: 6, code: 4, comment: 2, blank: 0 },
      after: { files: 2, total: 9, code: 7, comment: 2, blank: 0 },
      delta: { files: 0, total: 3, code: 3, comment: 0, blank: 0 },
    },
  ],
  files: {
    added: [{ path: '=SUM(1,2).go', language: 'Go', ...count(4) }],
    removed: [{ path: 'old.go', language: 'Go', ...count(2) }],
    changed: [
      {
        path: 'src/main.go',
        languageChanged: false,
        before: { path: 'src/main.go', language: 'Go', ...count(2) },
        after: { path: 'src/main.go', language: 'Go', ...count(3) },
        delta: { total: 1, code: 1, comment: 0, blank: 0 },
      },
    ],
    unchanged: 0,
  },
  warnings: [],
};

test('CSV text is escaped and cannot execute formula filenames, numeric deltas stay numeric', () => {
  for (const value of ['=1+1', '+cmd', '-cmd', '@cmd', '\tfoo', '\n=cmd', '  =HYPERLINK("bad")'])
    assert.equal(safeCsvCell(value).includes("'"), true);
  assert.equal(safeCsvCell(-12), '-12');
  assert.equal(safeCsvCell('safe.go'), 'safe.go');
  assert.equal(safeCsvCell('name,"a".go'), '"name,""a"".go"');
});

test('CSV includes total, language, changed, added and removed rows with complete deltas', () => {
  const csv = comparisonToCsv(comparison);
  assert.equal(csv.startsWith('\uFEFFscope,name,change,language'), true);
  assert.equal(csv.includes('total,all,summary,,2,2,0,6,9,3,4,7,3,2,2,0,0,0,0'), true);
  assert.equal(csv.includes('language,Go,summary,Go'), true);
  assert.equal(csv.includes('file,src/main.go,changed,Go'), true);
  assert.equal(csv.includes('"\'=SUM(1,2).go"'), true);
  assert.equal(csv.includes('file,old.go,removed,Go,1,0,-1'), true);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('file table rows preserve inputs and give added/removed files the correct zero side', () => {
  const snapshot = JSON.stringify(comparison);
  const rows = comparisonFileRows(comparison);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.kind === 'added').before.total, 0);
  assert.equal(rows.find((row) => row.kind === 'removed').after.total, 0);
  assert.equal(rows.find((row) => row.kind === 'removed').delta.code, -2);
  assert.equal(JSON.stringify(comparison), snapshot);
});
