import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanPath } from '../../tools/code-counter/scanner.mjs';
import {
  HttpError, LIMITS, MAX_REQUEST_BYTES, analyzeUploads, errorJSON,
  exportReport, getConfig, getDemoReport, readJsonRequest,
} from './code-count-service.mjs';

const upload = (path, value = '') => ({ path, contentBase64: Buffer.from(value).toString('base64') });
const analyze = (files, options) => analyzeUploads({ files, ...(options === undefined ? {} : { options }) });
const rejectsHttp = (callback, status = 400, code) => assert.throws(callback,
  (error) => error instanceof HttpError && error.status === status && (!code || error.code === code));
const jsonRequest = (value, headers = {}) => new Request('https://example.test/api/code-count', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
});

test('config advertises actual languages, limits and exclusion defaults', () => {
  const config = getConfig();
  assert.equal(config.languages.length, 8);
  assert.equal(config.limits.maxFileBytes, config.limits.maxBytesPerBatch);
  assert.equal(config.limits.maxFilesPerBatch, 100);
  assert.ok(config.defaultExcludes.includes('node_modules'));
  config.defaultExcludes.push('mutated');
  assert.ok(!getConfig().defaultExcludes.includes('mutated'));
});

test('demo comes through the real analyzer and matches 2/14/8/4/2', () => {
  const report = getDemoReport();
  assert.deepEqual(report.totals, { files: 2, total: 14, code: 8, comment: 4, blank: 2 });
  assert.deepEqual(report.files.map(({ path }) => path), ['sample.java', 'sample.py']);
  assert.equal(report.input, '上传的项目');
});

test('uploaded physical line classifications match the CLI scanner for all 8 languages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'counter-web-'));
  const examples = [
    ['test.c', '/* comment */\nint x = 1; // inline\n\n'],
    ['test.cpp', 'auto s = R"tag(// not comment\n)tag";\n// comment\n'],
    ['test.java', 'String url = "https://a";\n/* comment */\n\n'],
    ['test.js', 'const re = /\\/\\//;\n// comment\nconst n = 4 / 2;\n'],
    ['test.ts', 'const n: number = 2; /* inline */\n/* comment\n */\n'],
    ['test.py', '# comment\ntext = "# literal"\n"""doc\nstring"""\n\n'],
    ['test.css', '/* comment */\nbody { color: red; }\n\n'],
    ['test.json', '{\n  "a": 1\n}\n\n'],
  ];
  try {
    for (const [name, source] of examples) await writeFile(join(directory, name), source);
    const cli = await scanPath(directory);
    const web = analyze(examples.map(([name, source]) => upload(name, source)));
    assert.deepEqual(web.totals, cli.totals);
    assert.deepEqual(web.files, cli.files);
    assert.deepEqual(web.languages, cli.languages);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('strict UTF-8 supports Unicode paths, empty files and CR-only lines', () => {
  const report = analyze([upload('项目/中文.py', '# 中文\rx = 1\r\r'), upload('empty.json')]);
  assert.deepEqual(report.totals, { files: 2, total: 3, code: 1, comment: 1, blank: 1 });
});

test('UTF-8 BOM takes precedence over manually chosen GB18030', () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# 中文\nx = 1\n')]);
  const report = analyze([upload('bom.py', bytes)], { encoding: 'gb18030' });
  assert.deepEqual(report.totals, { files: 1, total: 2, code: 1, comment: 1, blank: 0 });
});

test('UTF-16 LE and BE BOM source are decoded before NUL detection', () => {
  const little = Buffer.from('# 中文\nx = 1\n', 'utf16le');
  const big = Buffer.from(little).swap16();
  const report = analyze([
    upload('le.py', Buffer.concat([Buffer.from([0xff, 0xfe]), little])),
    upload('be.py', Buffer.concat([Buffer.from([0xfe, 0xff]), big])),
  ]);
  assert.deepEqual(report.totals, { files: 2, total: 4, code: 2, comment: 2, blank: 0 });
});

test('GB18030 works only on explicit selection; auto is strict UTF-8', () => {
  const file = upload('legacy.py', Buffer.from([0x23, 0x20, 0xd6, 0xd0, 0xce, 0xc4, 0x0a, 0x78, 0x3d, 0x31, 0x0a]));
  assert.equal(analyze([file]).skipped[0].reason, 'invalid_encoding');
  assert.deepEqual(analyze([file], { encoding: 'gb18030' }).totals,
    { files: 1, total: 2, code: 1, comment: 1, blank: 0 });
});

test('defaults exclude directory components case-insensitively but not similarly named files', () => {
  const files = [upload('project/Node_Modules/x.js', '1;'), upload('project/reports/x.py', '1'), upload('node_modules.py', '1')];
  const report = analyze(files);
  assert.equal(report.totals.files, 1);
  assert.deepEqual(report.skipped.map(({ reason }) => reason), ['excluded', 'excluded']);
  assert.equal(analyze(files, { useDefaultExcludes: false }).totals.files, 3);
});

test('custom glob exclusions match files and ancestor directories like the CLI', () => {
  const report = analyze([
    upload('src/generated/a.py', '1'), upload('src/unit.test.js', '1'),
    upload('fixtures/deep/a.py', '1'), upload('src/keep.py', '1'),
  ], { exclude: ['src/generated', '**/*.test.js', 'fixtures/**'] });
  assert.equal(report.totals.files, 1);
  assert.equal(report.files[0].path, 'src/keep.py');
  assert.equal(report.skipped.length, 3);
});

test('glob matcher agrees with CLI on directory, single-star, double-star and literal patterns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'counter-glob-'));
  const paths = ['a.py', 'src/a.py', 'src/deep/a.py', 'src/a.test.js', 'deep/tests/a.py', 'test.py/a.py', 'a[1].py', 'fixtures/a.py'];
  const patterns = ['*.py', 'src/*', 'src/**', '**/a.py', 'src/?.py', '**/*.test.js', 'tests', 'src/deep', 'a[1].py', 'fixtures/**'];
  try {
    for (const path of paths) {
      const full = join(directory, path);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, 'x = 1\n');
    }
    for (const pattern of patterns) {
      const cli = await scanPath(directory, { exclude: [pattern] });
      const web = analyze(paths.map((path) => upload(path, 'x = 1\n')), { exclude: [pattern] });
      assert.deepEqual(web.files, cli.files, pattern);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ambiguous glob stars are handled by bounded-state matching', { timeout: 1000 }, () => {
  const report = analyze([upload(`${'a'.repeat(70)}.py`, '1')], { exclude: ['*a*a*a*a*a*a*a*a*b'] });
  assert.equal(report.totals.files, 1);
});

test('extension filter is normalized and unsupported files have an explicit reason', () => {
  const report = analyze([upload('A.PY', '1'), upload('a.js', '1'), upload('a.jpeg', 'x')], { extensions: ['PY'] });
  assert.equal(report.files[0].path, 'A.PY');
  assert.deepEqual(report.skipped.map(({ reason }) => reason), ['unsupported_extension', 'extension_filter']);
});

test('JPEG masquerading as source and NUL-containing source are skipped', () => {
  const report = analyze([upload('fake.cpp', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), upload('zero.py', 'x\0y')]);
  assert.equal(report.totals.files, 0);
  assert.deepEqual(report.skipped.map(({ reason }) => reason), ['binary', 'binary']);
});

test('uploaded source is never evaluated', () => {
  delete globalThis.__counterExecuted;
  const report = analyze([upload('attack.js', 'globalThis.__counterExecuted = true;\nthrow new Error("execute");\n')]);
  assert.equal(globalThis.__counterExecuted, undefined);
  assert.equal(report.totals.code, 2);
});

test('all uploaded paths are relative and traversal-free', () => {
  for (const path of ['/etc/passwd.py', '../a.py', 'x/../a.py', 'x/./a.py', 'C:\\x.py', '\\\\host\\a.py', 'x//a.py', 'x\u0000.py', 'a'.repeat(513)]) {
    rejectsHttp(() => analyze([upload(path, '1')]));
  }
  assert.equal(analyze([upload('src\\valid.py', '1')]).files[0].path, 'src/valid.py');
});

test('duplicate paths are detected after normalization', () => {
  rejectsHttp(() => analyze([upload('src/a.py'), upload('src\\a.py')]));
});

test('base64 rejects whitespace, malformed padding and noncanonical trailing bits', () => {
  for (const contentBase64 of ['a', '!!!!', 'YQ', ' YQ==', 'YQ==\n', 'YQ===', 'Zh==', 'Zm9=']) {
    rejectsHttp(() => analyze([{ path: 'a.py', contentBase64 }]), 400, 'invalid_base64');
  }
});

test('unknown keys, non-object options and invalid option values are rejected', () => {
  rejectsHttp(() => analyzeUploads({ files: [upload('a.py')], inputPath: 'C:\\secret' }));
  rejectsHttp(() => analyzeUploads({ files: [{ ...upload('a.py'), source: 'extra' }] }));
  for (const options of [null, [], { encoding: 'latin1' }, { encoding: null }, { exclude: null }, { extensions: null }, { useDefaultExcludes: 'false' }, { extensions: ['.exe'] },
    { exclude: [''] }, { exclude: ['../x'] }, { exclude: Array(51).fill('a') }, { execute: true }]) {
    rejectsHttp(() => analyze([upload('a.py')], options));
  }
});

test('batch file count and decoded bytes limits are enforced', () => {
  rejectsHttp(() => analyze([]));
  rejectsHttp(() => analyze(Array.from({ length: 101 }, (_, index) => upload(`${index}.py`))), 413);
  rejectsHttp(() => analyze([upload('large.py', Buffer.alloc(LIMITS.maxFileBytes + 1, 32))]), 413);
  const half = Buffer.alloc(LIMITS.maxBytesPerBatch / 2 + 1, 32);
  rejectsHttp(() => analyze([upload('a.py', half), upload('b.py', half)]), 413);
});

test('an exact 4 MiB file is accepted without Base64 regex stack overflow', () => {
  const report = analyze([upload('limit.json', Buffer.alloc(LIMITS.maxFileBytes, 49))]);
  assert.deepEqual(report.totals, { files: 1, total: 1, code: 1, comment: 0, blank: 0 });
});

test('JSON and CSV exports retain analyzer data and contain no uploaded source', () => {
  const report = getDemoReport();
  const json = exportReport({ format: 'json', report });
  assert.equal(json.filename, 'code-count.json');
  assert.deepEqual(JSON.parse(json.body), report);
  const csv = exportReport({ format: 'csv', report });
  assert.ok(csv.body.startsWith('\ufeffpath,language,total,code,comment,blank\r\n'));
  assert.ok(csv.body.includes('sample.py,Python,7,4,2,1'));
  assert.ok(!json.body.includes('contentBase64'));
  assert.ok(!json.body.includes('def accuracy'));
});

test('CSV export defuses spreadsheet formulas in filenames', () => {
  const report = analyze([upload('=cmd.py', '1'), upload('a,"quoted".py', '1')]);
  const csv = exportReport({ format: 'csv', report }).body;
  assert.ok(csv.includes("'=cmd.py,Python"));
  assert.ok(csv.includes('"a,""quoted"".py"'));
});

test('export rejects aggregate tampering, invalid language totals and extra source fields', () => {
  const original = getDemoReport();
  for (const tamper of [
    (report) => { report.totals.code += 1; },
    (report) => { report.languages[0].files += 1; },
    (report) => { report.files[0].total += 1; },
    (report) => { report.files[0].code = -1; },
    (report) => { report.files[0].language = 'Python'; },
    (report) => { report.files[0].contentBase64 = 'secret'; },
    (report) => { report.files[0].path = '../leak.java'; },
    (report) => { report.skipped.push({ path: report.files[0].path, reason: 'excluded' }); },
    (report) => { report.generatedAt = 'today'; },
  ]) {
    const report = structuredClone(original);
    tamper(report);
    rejectsHttp(() => exportReport({ format: 'json', report }));
  }
  rejectsHttp(() => exportReport({ format: 'html', report: original }));
});

test('export validates and preserves browser skip and read-error rows', () => {
  const report = analyze([upload('src/a.py', '1'), upload('README.md')]);
  report.skipped.push({ path: 'src/large.py', reason: 'too_large' });
  report.errors.push({ path: 'src/unreadable.py', message: '浏览器无法读取文件。' });
  assert.deepEqual(JSON.parse(exportReport({ format: 'json', report }).body), report);
});

test('readJsonRequest accepts JSON with charset and matching/no Origin', async () => {
  assert.deepEqual(await readJsonRequest(jsonRequest({ x: 1 }, { 'Content-Type': 'application/json; charset=utf-8' })), { x: 1 });
  assert.deepEqual(await readJsonRequest(jsonRequest([], { Origin: 'https://example.test' })), []);
});

test('request reader rejects non-JSON and cross-origin requests', async () => {
  await assert.rejects(readJsonRequest(jsonRequest({}, { 'Content-Type': 'text/plain' })), (error) => error.status === 415);
  await assert.rejects(readJsonRequest(jsonRequest({}, { Origin: 'https://attacker.test' })), (error) => error.status === 403);
});

test('request reader rejects advertised oversized length before consuming body', async () => {
  let read = false;
  const request = {
    url: 'https://example.test/api/code-count',
    headers: new Headers({ 'Content-Type': 'application/json', 'Content-Length': String(MAX_REQUEST_BYTES + 1) }),
    get body() { read = true; throw new Error('must not touch'); },
  };
  await assert.rejects(readJsonRequest(request), (error) => error.status === 413);
  assert.equal(read, false);
});

test('request reader enforces actual streamed length with no Content-Length', async () => {
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
      controller.enqueue(new Uint8Array([32]));
    },
    cancel() { canceled = true; },
  });
  const request = { url: 'https://example.test/api/code-count', headers: new Headers({ 'Content-Type': 'application/json' }), body: stream };
  await assert.rejects(readJsonRequest(request), (error) => error.status === 413);
  assert.equal(canceled, true);
});

test('malformed JSON and invalid UTF-8 are rejected', async () => {
  const request = new Request('https://example.test/api/code-count', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.from([0xff]),
  });
  await assert.rejects(readJsonRequest(request), (error) => error.code === 'invalid_json');
  await assert.rejects(readJsonRequest(new Request('https://example.test/api/code-count', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad}',
  })), (error) => error.code === 'invalid_json');
});

test('error response uses stable public codes and does not leak internal errors', async () => {
  const expected = errorJSON(new HttpError('bad', '请求有误。', 400));
  assert.equal(expected.status, 400);
  assert.equal(expected.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await expected.json(), { error: { code: 'bad', message: '请求有误。' } });
  const unexpected = errorJSON(new Error('secret filesystem path'));
  assert.equal(unexpected.status, 500);
  assert.ok(!(await unexpected.text()).includes('secret'));
});

test('service imports do not bring the filesystem scanner into the deployed service', async () => {
  const source = await readFile(new URL('./code-count-service.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes("from 'node:fs"));
  assert.ok(!source.includes("from 'node:child_process"));
});
