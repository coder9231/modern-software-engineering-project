import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url));

async function workspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'code-counter-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(directory, relativePath, content) {
  const file = path.join(directory, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

function run(directory, ...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  return result;
}

function reportFrom(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('defaults to the working directory and emits a complete JSON report', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'main.py', '# lesson\nvalue = 1\n\nprint(value)');
  const report = reportFrom(run(directory, '--json'));
  assert.equal(report.version, 1);
  assert.equal(report.input, path.resolve(directory));
  assert.deepEqual(report.totals, { files: 1, total: 4, code: 2, comment: 1, blank: 1 });
  assert.deepEqual(report.files.map((file) => file.path), ['main.py']);
  assert.deepEqual(report.errors, []);
});

test('passes custom excludes and extension filters to scanning', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'src/lesson.py', 'value = 1');
  await fixture(directory, 'src/main.js', 'let value = 1;');
  await fixture(directory, 'discard/lesson.py', 'value = 2');
  await fixture(directory, 'src/extra.py', 'value = 3');
  const report = reportFrom(run(directory, '.', '--format', 'json', '--extensions', 'py', '--exclude', 'discard/**', '--exclude', '**/extra.py'));
  assert.deepEqual(report.files.map((file) => file.path), ['src/lesson.py']);
});

test('supports disabling defaults and a size limit without a failure exit', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'node_modules/lib.js', 'let value = 1;');
  await fixture(directory, 'large.js', 'x'.repeat(100));
  const report = reportFrom(run(directory, '.', '--json', '--no-default-excludes', '--max-size', '0.00002'));
  assert.deepEqual(report.files.map((file) => file.path), ['node_modules/lib.js']);
  assert.ok(report.skipped.some((entry) => entry.path === 'large.js' && entry.reason === 'too_large'));
});

test('exports JSON inside the scanned directory and excludes it on repeated runs', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'src/main.js', 'let value = 1;');
  const output = path.join(directory, 'report.json');
  for (let runIndex = 0; runIndex < 2; runIndex += 1) {
    const result = run(directory, '.', '--format', 'json', '--output', output);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(report.files.map((file) => file.path), ['src/main.js']);
    assert.deepEqual(report.totals, { files: 1, total: 1, code: 1, comment: 0, blank: 0 });
    if (runIndex > 0) {
      assert.ok(report.skipped.some((entry) => entry.path === 'report.json' && entry.reason === 'excluded'));
    }
  }
});

test('exports CSV with a UTF-8 BOM and correctly quotes comma-containing paths', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'lesson,part.js', 'let value = 1;');
  const output = path.join(directory, 'results.csv');
  const result = run(directory, '.', '--format', 'csv', '--output', output);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const bytes = await readFile(output);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const lines = bytes.subarray(3).toString('utf8').trimEnd().split(/\r?\n/);
  assert.equal(lines[0], 'path,language,total,code,comment,blank');
  assert.equal(lines[1], '"lesson,part.js",JavaScript,1,1,0,0');
  assert.equal(lines.length, 2);
});

test('preserves source files when an output path names the same file', async (t) => {
  const directory = await workspace(t);
  const content = 'const original = "keep source";\n';
  const source = await fixture(directory, 'main.js', content);
  const result = run(directory, source, '--json', '--output', source);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(await readFile(source, 'utf8'), content);
});

test('recognizes a case-variant output path as the same Windows source file', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('case-insensitive filename regression targets Windows');
    return;
  }
  const directory = await workspace(t);
  const content = 'const original = "keep source";\n';
  const source = await fixture(directory, 'main.js', content);
  const result = run(directory, source, '--json', '--output', path.join(directory, 'MAIN.JS'));
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(await readFile(source, 'utf8'), content);
});

test('preserves a source file when output points to a hard-link alias', async (t) => {
  const directory = await workspace(t);
  const content = 'const original = "keep source";\n';
  const source = await fixture(directory, 'source.js', content);
  const alias = path.join(directory, 'alias.js');
  try {
    await link(source, alias);
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EXDEV'].includes(error.code)) {
      t.skip(`hard links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const result = run(directory, source, '--json', '--output', alias);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(await readFile(source, 'utf8'), content);
  assert.equal(await readFile(alias, 'utf8'), content);
});

test('rejects a symbolic-link output destination without changing its target', async (t) => {
  const directory = await workspace(t);
  const source = await fixture(directory, 'source.js', 'let value = 1;');
  const content = 'Preserve this existing target.\n';
  const target = await fixture(directory, 'target.txt', content);
  const alias = path.join(directory, 'report.json');
  try {
    await symlink(target, alias, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symbolic links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const result = run(directory, source, '--json', '--output', alias);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(await readFile(target, 'utf8'), content);
});

test('neutralizes CSV formula filenames while preserving exact paths in JSON', async (t) => {
  const directory = await workspace(t);
  const names = ['=2+2.js', '+SUM(1,2).js', '-1+1.js', '@task.js'];
  for (const name of names) await fixture(directory, name, 'let value = 1;');
  const report = reportFrom(run(directory, '.', '--json'));
  assert.deepEqual(new Set(report.files.map((file) => file.path)), new Set(names));

  const output = path.join(directory, 'report.csv');
  const result = run(directory, '.', '--format', 'csv', '--output', output);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = (await readFile(output, 'utf8')).replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert.equal(lines[0], 'path,language,total,code,comment,blank');
  assert.equal(lines.length, names.length + 1);
  assert.ok(lines.includes("'=2+2.js,JavaScript,1,1,0,0"));
  assert.ok(lines.includes('"\'+SUM(1,2).js",JavaScript,1,1,0,0'));
  assert.ok(lines.includes("'-1+1.js,JavaScript,1,1,0,0"));
  assert.ok(lines.includes("'@task.js,JavaScript,1,1,0,0"));
});

test('handles empty exports without adding fabricated statistics', async (t) => {
  const directory = await workspace(t);
  const report = reportFrom(run(directory, '.', '--format', 'json'));
  assert.deepEqual(report.totals, { files: 0, total: 0, code: 0, comment: 0, blank: 0 });
  assert.deepEqual(report.files, []);
  const output = path.join(directory, 'empty.csv');
  const result = run(directory, '.', '--format', 'csv', '--output', output);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal((await readFile(output, 'utf8')).replace(/^\uFEFF/, '').trimEnd(), 'path,language,total,code,comment,blank');
});

test('decodes a requested GB18030 source encoding', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'main.js', Buffer.concat([
    Buffer.from('// '), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from('\nconst value = 1;'),
  ]));
  const report = reportFrom(run(directory, '.', '--json', '--encoding', 'gb18030'));
  assert.deepEqual(report.totals, { files: 1, total: 2, code: 1, comment: 1, blank: 0 });
});

test('shows help, supported languages, and filenames in detailed text output', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'main.py', 'value = 1');
  const help = run(directory, '--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--format/);
  const languages = run(directory, '--languages');
  assert.equal(languages.status, 0, languages.stderr);
  assert.match(languages.stdout, /Python/);
  const detailed = run(directory, '.', '--details');
  assert.equal(detailed.status, 0, detailed.stderr);
  assert.match(detailed.stdout, /main\.py/);
});

test('rejects unknown, incomplete, and invalid arguments with exit 1', async (t) => {
  const directory = await workspace(t);
  const cases = [
    ['--unknown'],
    ['--format'],
    ['--format', 'xml'],
    ['--output'],
    ['--exclude'],
    ['--extensions'],
    ['--extensions', '.pdf'],
    ['--encoding', 'unknown'],
    ['--max-size', 'abc'],
    ['--max-size', '-1'],
    ['.', '.'],
  ];
  for (const args of cases) {
    const result = run(directory, ...args);
    assert.equal(result.status, 1, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
    assert.ok((result.stderr + result.stdout).trim().length > 0);
  }
});

test('reports nonexistent inputs and unwritable output destinations with exit 1', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'main.js', 'let value = 1;');
  const missing = run(directory, 'missing', '--json');
  assert.equal(missing.status, 1, missing.stderr || missing.stdout);
  assert.ok((missing.stderr + missing.stdout).trim().length > 0);
  const outputIsDirectory = run(directory, '.', '--json', '--output', directory);
  assert.equal(outputIsDirectory.status, 1, outputIsDirectory.stderr || outputIsDirectory.stdout);
});

test('keeps a success exit when all encountered files are skipped', async (t) => {
  const directory = await workspace(t);
  await fixture(directory, 'README.md', '# Documentation');
  await fixture(directory, 'invalid.js', Buffer.from([0xc3, 0x28]));
  const report = reportFrom(run(directory, '.', '--json'));
  assert.equal(report.totals.files, 0);
  assert.equal(report.errors.length, 0);
  assert.equal(report.skipped.length, 2);
});

test('uses exit 2 for partial filesystem errors and still emits a JSON report', async (t) => {
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
  const result = run(directory, '.', '--json');
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.files.map((file) => file.path), ['readable.js']);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].path, 'unreadable.js');
  assert.match(report.errors[0].message, /\b(?:EACCES|EPERM)\b/);
  assert.match(result.stderr, /读取失败.*errors/);
  const output = path.join(directory, 'partial.csv');
  const csv = run(directory, '.', '--format', 'csv', '--output', output);
  assert.equal(csv.status, 2, csv.stderr || csv.stdout);
  assert.match(csv.stderr, /unreadable\.js/);
  assert.match(csv.stderr, /EACCES|EPERM|permission|denied/i);
  const exported = await readFile(output, 'utf8');
  assert.match(exported, /readable\.js,JavaScript,1,1,0,0/);
  assert.doesNotMatch(exported, /unreadable\.js/);
});
