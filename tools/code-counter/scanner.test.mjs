import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanPath } from './scanner.mjs';

async function workspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'code-counter-scan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(directory, relativePath, content) {
  const file = path.join(directory, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

function utf16Be(content) {
  const bytes = Buffer.from(content, 'utf16le');
  bytes.swap16();
  return Buffer.concat([Buffer.from([0xfe, 0xff]), bytes]);
}

function assertConsistentCounts(report) {
  const sums = { files: report.files.length, total: 0, code: 0, comment: 0, blank: 0 };
  for (const file of report.files) {
    assert.equal(file.total, file.code + file.comment + file.blank, file.path);
    for (const key of ['total', 'code', 'comment', 'blank']) sums[key] += file[key];
  }
  assert.deepEqual(report.totals, sums);
  const languageSums = report.languages.reduce((result, language) => {
    for (const key of Object.keys(result)) result[key] += language[key];
    return result;
  }, { files: 0, total: 0, code: 0, comment: 0, blank: 0 });
  assert.deepEqual(languageSums, report.totals);
}

test('scans nested Unicode paths with consistent sorted file and language summaries', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'src/程序.js', 'const total = 1;\n// note\n\nconsole.log(total);');
  await fixture(directory, 'src/lesson.py', '# lesson\nvalue = 1\n\nprint(value)');
  await fixture(directory, 'config.json', '{"value": 1}');
  await fixture(directory, 'README.md', '# Supporting document');

  const report = await scanPath(directory);

  assert.equal(report.version, 1);
  assert.equal(report.input, path.resolve(directory));
  assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
  assert.deepEqual(report.files.map((file) => file.path), ['config.json', 'src/lesson.py', 'src/程序.js']);
  assert.deepEqual(report.languages.map((language) => language.language), ['JSON', 'JavaScript', 'Python']);
  assert.deepEqual(report.totals, { files: 3, total: 9, code: 5, comment: 2, blank: 2 });
  assert.deepEqual(report.errors, []);
  assert.ok(report.skipped.some((file) => file.path === 'README.md' && file.reason === 'unsupported_extension'));
  assertConsistentCounts(report);
});

test('returns an empty report for an empty directory and counts an empty source file', async (t) => {
  const directory = await workspace(t);
  const empty = await scanPath(directory);
  assert.deepEqual(empty.totals, { files: 0, total: 0, code: 0, comment: 0, blank: 0 });
  assert.deepEqual(empty.files, []);
  assert.deepEqual(empty.languages, []);

  await fixture(directory, 'empty.py', '');
  const report = await scanPath(directory);
  assert.deepEqual(report.files, [{ path: 'empty.py', language: 'Python', total: 0, code: 0, comment: 0, blank: 0 }]);
  assertConsistentCounts(report);
});

test('supports one source file as the scan input', async (t) => {
  const directory = await workspace(t);
  const file = await fixture(directory, 'single.java', 'class Demo {}\n// end');
  const report = await scanPath(file);
  assert.equal(report.input, path.resolve(file));
  assert.deepEqual(report.files, [{ path: 'single.java', language: 'Java', total: 2, code: 1, comment: 1, blank: 0 }]);
});

test('excludes dependency and generated directories by default, with an opt-out', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'src/main.js', 'let value = 1;');
  await fixture(directory, 'node_modules/dependency/index.js', 'let dependency = 1;');
  await fixture(directory, 'dist/bundle.js', 'let bundle = 1;');
  await fixture(directory, '.git/example.js', 'let metadata = 1;');
  await fixture(directory, 'reports/code-count.json', '{"version":1}');

  const report = await scanPath(directory);
  assert.deepEqual(report.files.map((file) => file.path), ['src/main.js']);
  assert.ok(report.skipped.some((entry) => entry.reason === 'excluded'));

  const all = await scanPath(directory, { useDefaultExcludes: false });
  assert.equal(all.totals.files, 5);
  assertConsistentCounts(all);
});

test('glob exclusions support basename, directory/**, **, and ? matching', async (t) => {
  const directory = await workspace(t);
  for (const relative of ['src/app.js', 'src/keep.py', 'src/generated/hidden.js', 'vendor/lib.js', 'nested/vendor/lib.js', 'tests/app.test.js', 'src/temp1.js']) {
    await fixture(directory, relative, 'value = 1');
  }
  const report = await scanPath(directory, {
    exclude: ['src/generated/**', 'vendor', '**/*.test.js', 'src/temp?.js'],
  });
  assert.deepEqual(report.files.map((file) => file.path), ['src/app.js', 'src/keep.py']);
  assert.equal(report.errors.length, 0);
});

test('normalizes extension filters and ignores only the exact absolute ignored path', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'app.js', 'let value = 1;');
  await fixture(directory, 'main.py', 'value = 1');
  await fixture(directory, 'main.java', 'class Demo {}');
  const metadata = await fixture(directory, 'metadata.json', '{}');
  await fixture(directory, 'nested/metadata.json', '{}');

  const filtered = await scanPath(directory, { extensions: ['py', '.java'] });
  assert.deepEqual(filtered.files.map((file) => file.path), ['main.java', 'main.py']);
  assert.ok(filtered.skipped.some((entry) => entry.path === 'app.js' && entry.reason === 'extension_filter'));

  const ignored = await scanPath(directory, { ignoredPaths: [metadata] });
  assert.ok(ignored.files.some((file) => file.path === 'nested/metadata.json'));
  assert.ok(!ignored.files.some((file) => file.path === 'metadata.json'));
  assert.ok(ignored.skipped.some((entry) => entry.path === 'metadata.json' && entry.reason === 'excluded'));
});

test('detects UTF-8, UTF-16LE, and UTF-16BE BOMs before binary checks', async (t) => {
  const directory = await workspace(t);
  const source = '// 中文说明\nconst value = 1;';
  await fixture(directory, 'utf8.js', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source)]));
  await fixture(directory, 'utf16-le.js', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, 'utf16le')]));
  await fixture(directory, 'utf16-be.js', utf16Be(source));

  const report = await scanPath(directory);
  assert.deepEqual(report.totals, { files: 3, total: 6, code: 3, comment: 3, blank: 0 });
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.errors, []);
});

test('rejects malformed UTF-8, supports explicit GB18030, and skips binary files', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'invalid.js', Buffer.from([0xc3, 0x28]));
  await fixture(directory, 'binary.py', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x04]));
  const gbFile = await fixture(directory, 'gb.js', Buffer.concat([
    Buffer.from('// '), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from('\nconst value = 1;'),
  ]));

  const report = await scanPath(directory);
  assert.equal(report.totals.files, 0);
  assert.ok(report.skipped.some((entry) => entry.path === 'invalid.js' && entry.reason === 'invalid_encoding'));
  assert.ok(report.skipped.some((entry) => entry.path === 'gb.js' && entry.reason === 'invalid_encoding'));
  assert.ok(report.skipped.some((entry) => entry.path === 'binary.py' && entry.reason === 'binary'));

  const decoded = await scanPath(gbFile, { encoding: 'gb18030' });
  assert.deepEqual(decoded.totals, { files: 1, total: 2, code: 1, comment: 1, blank: 0 });
});

test('skips oversized files without affecting readable file statistics', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'small.js', 'let x = 1;');
  await fixture(directory, 'large.js', 'x'.repeat(100));
  const report = await scanPath(directory, { maxBytes: 40 });
  assert.deepEqual(report.files.map((file) => file.path), ['small.js']);
  assert.ok(report.skipped.some((entry) => entry.path === 'large.js' && entry.reason === 'too_large'));
});

test('does not follow symbolic links or directory cycles', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'source.js', 'let value = 1;');
  try {
    await symlink(directory, path.join(directory, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symbolic links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  let fileLinkAvailable = true;
  try {
    await symlink(path.join(directory, 'source.js'), path.join(directory, 'linked.js'), 'file');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    fileLinkAvailable = false;
  }
  const report = await scanPath(directory);
  assert.deepEqual(report.files.map((file) => file.path), ['source.js']);
  if (fileLinkAvailable) {
    assert.ok(report.skipped.some((entry) => entry.path === 'linked.js' && entry.reason === 'symbolic_link'));
  }
  assert.ok(report.skipped.some((entry) => entry.path === 'loop' && entry.reason === 'symbolic_link'));
});

test('reports unreadable files separately while keeping readable files', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX permission fixture is not available on Windows');
    return;
  }
  const directory = await workspace(t);
  const unreadable = await fixture(directory, 'unreadable.js', 'let secret = 1;');
  await fixture(directory, 'readable.js', 'let value = 1;');
  await chmod(unreadable, 0);
  t.after(() => chmod(unreadable, 0o600).catch(() => {}));
  try {
    await readFile(unreadable);
    t.skip('current account can read files despite restrictive mode');
    return;
  } catch (error) {
    assert.ok(['EACCES', 'EPERM'].includes(error.code));
  }
  const report = await scanPath(directory);
  assert.deepEqual(report.files.map((file) => file.path), ['readable.js']);
  assert.ok(report.errors.some((entry) => entry.path === 'unreadable.js' && typeof entry.message === 'string' && entry.message.length > 0));
});

test('rejects an explicit nonexistent input with an explanation', async (t) => {
  const directory = await workspace(t);
  await assert.rejects(scanPath(path.join(directory, 'missing')), /不存在|not found|ENOENT|does not exist/i);
});
