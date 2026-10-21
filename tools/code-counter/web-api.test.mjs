import test from 'node:test';
import assert from 'node:assert/strict';

// Run explicitly after starting website/: CODE_COUNTER_URL=http://localhost:5173.
const base = process.env.CODE_COUNTER_URL ?? 'http://localhost:5173';
const post = (path, body, headers = {}) => fetch(new URL(path, base), {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const file = (path, bytes) => ({ path, contentBase64: Buffer.from(bytes).toString('base64') });

test('live health and configuration routes', async () => {
  const health = await fetch(new URL('/api/health', base));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const config = await fetch(new URL('/api/code-count/config', base));
  assert.equal(config.status, 200);
  const data = await config.json();
  assert.equal(data.languages.length, 8);
  assert.equal(data.limits.maxFilesPerBatch, 100);
});

test('live demo is analyzed by the server', async () => {
  const response = await fetch(new URL('/api/code-count/demo', base));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).totals,
    { files: 2, total: 14, code: 8, comment: 4, blank: 2 });
});

test('live Worker classifies spliced comments, class division and f-string expression comments', async () => {
  const response = await post('/api/code-count', {
    files: [
      file('continued.c', ['// comment \\', 'not_code();', 'int actual = 1;'].join('\n')),
      file('ratio.ts', ['const ratio = class {} / 2; /* block', 'end */', '// last'].join('\n')),
      file('format.py', ['value = f"""{', '# expression comment', '1 + 2', '}"""', '# last'].join('\n')),
    ],
  }, { Origin: base });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.deepEqual(report.totals, { files: 3, total: 11, code: 5, comment: 6, blank: 0 });
  assert.deepEqual(report.files.map(({ path, total, code, comment, blank }) => ({ path, total, code, comment, blank })), [
    { path: 'continued.c', total: 3, code: 1, comment: 2, blank: 0 },
    { path: 'format.py', total: 5, code: 3, comment: 2, blank: 0 },
    { path: 'ratio.ts', total: 3, code: 1, comment: 2, blank: 0 },
  ]);
});

test('live uploads preserve Unicode, UTF-16 and explicit GB18030', async () => {
  const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# 中文\nx=1\n', 'utf16le')]);
  const big = Buffer.from(little).swap16();
  const legacy = Buffer.from([0x23, 0x20, 0xd6, 0xd0, 0xce, 0xc4, 0x0a, 0x78, 0x3d, 0x31, 0x0a]);
  for (const [path, bytes, encoding] of [
    ['中文.py', Buffer.from('# 中文\nx=1\n'), 'auto'],
    ['utf16le.py', little, 'auto'], ['utf16be.py', big, 'auto'],
    ['legacy.py', legacy, 'gb18030'],
  ]) {
    const response = await post('/api/code-count', { files: [file(path, bytes)], options: { encoding } }, { Origin: base });
    assert.equal(response.status, 200, path);
    const report = await response.json();
    assert.deepEqual(report.totals, { files: 1, total: 2, code: 1, comment: 1, blank: 0 }, `${path}: ${JSON.stringify(report.skipped)}`);
  }
});

test('live API rejects invalid paths, origins and excessive batch counts', async () => {
  assert.equal((await post('/api/code-count', { files: [file('../escape.py', '1')] })).status, 400);
  assert.equal((await post('/api/code-count', { files: [file('a.py', '1')] }, { Origin: 'https://different.example' })).status, 403);
  assert.equal((await post('/api/code-count', { files: Array.from({ length: 101 }, (_, i) => file(`${i}.py`, '1')) })).status, 413);
});

test('live upload accepts exactly 4 MiB and skips image disguised as source', async () => {
  const response = await post('/api/code-count', { files: [file('large.py', 'x'.repeat(4 * 1024 * 1024))] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totals.code, 1);
  const binary = await post('/api/code-count', { files: [file('fake.cpp', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))] });
  const report = await binary.json();
  assert.equal(report.totals.files, 0);
  assert.equal(report.skipped[0].reason, 'binary');
});

test('live JSON and CSV download endpoints preserve counts', async () => {
  const report = await (await post('/api/code-count', { files: [file('=formula.py', '# comment\nx = 1\n\n')] })).json();
  for (const format of ['json', 'csv']) {
    const response = await post('/api/code-count/export', { format, report });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    if (format === 'json') assert.deepEqual((await response.json()).totals, report.totals);
    else assert.match(await response.text(), /'=formula\.py/);
  }
});
