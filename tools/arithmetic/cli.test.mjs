import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments } from './cli.mjs';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}
function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arithmetic-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI help and defaults are usable without dependencies', () => {
  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--count/u);
  const worksheet = json(run('--json', '--seed', 'cli-default'));
  assert.equal(worksheet.questions.length, 20);
  assert.equal(worksheet.options.operatorCount, 2);
  assert.equal(Object.hasOwn(worksheet.questions[0], 'answer'), false);
  const answers = json(run('--json', '--answers', '--seed', 'cli-default'));
  assert.equal(typeof answers.questions[0].answer, 'string');
});

test('CLI forwards customizable rules and a fixed seed exactly', () => {
  const args = ['--count', '8', '--operators', '+,-,*,/', '--ops', '3', '--parentheses', '--negative', '--min', '-20', '--max', '20', '--result-min', '-100', '--result-max', '100', '--seed', 'same', '--json', '--answers'];
  const first = json(run(...args));
  assert.deepEqual(first, json(run(...args)));
  assert.deepEqual(first.options.operators, ['+', '-', '*', '/']);
  assert.equal(first.options.parentheses, true);
  assert.equal(first.options.allowNegative, true);
  assert.equal(first.questions.length, 8);
});

test('CLI exposes fraction and remainder configurations', () => {
  const fractions = json(run('-n', '5', '--fractions', '--denominator', '7', '--json', '--answers', '--seed', 'fractions'));
  assert.equal(fractions.options.fractions, true);
  assert.equal(fractions.options.divisionMode, 'fraction');
  const remainder = json(run('--count', '5', '--operators', '/', '--ops', '1', '--division', 'remainder', '--json', '--answers', '--seed', 'remainder'));
  assert.ok(remainder.questions.every((q) => q.kind === 'remainder' && / R /u.test(q.answer)));
});

test('CLI generates 10000 canonical unique questions with bounded default answers', () => {
  const worksheet = json(run('--count', '10000', '--seed', 'course-10000', '--json', '--answers'));
  assert.equal(worksheet.questions.length, 10000);
  assert.equal(new Set(worksheet.questions.map((q) => q.canonical)).size, 10000);
  assert.ok(worksheet.questions.every((q) => /^\d+$/u.test(q.answer) && Number(q.answer) <= 100));
});

test('CLI reports invalid flags, values and insufficient unique space', () => {
  for (const args of [['--unknown'], ['--count'], ['--count', '2.5'], ['--count', '10001'], ['--format', 'csv'], ['--operators', '+,+'], ['--division', 'arbitrary']]) {
    const result = run(...args);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /错误/u);
  }
  const impossible = run('--count', '2', '--min', '0', '--max', '0', '--operators', '+', '--seed', 'impossible');
  assert.equal(impossible.status, 1);
  assert.match(impossible.stderr, /insufficient_unique/u);
});

test('CLI output creates a requested new report and refuses source paths and overwrite', async (t) => {
  const directory = await temporary(t);
  const filename = path.join(directory, 'nested', 'worksheet.json');
  const created = run('--count', '3', '--json', '--answers', '--output', filename);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).questions.length, 3);
  const original = await readFile(filename, 'utf8');
  assert.equal(run('--output', filename).status, 1);
  assert.equal(await readFile(filename, 'utf8'), original);
  const source = path.join(directory, 'code.mjs');
  await writeFile(source, 'sentinel');
  assert.equal(run('--output', source).status, 1);
  assert.equal(await readFile(source, 'utf8'), 'sentinel');
});

test('argument parsing rejects prototype-shaped option names', () => {
  assert.throws(() => parseArguments(['__proto__']), /未知参数/u);
  assert.throws(() => parseArguments(['--count', 'Infinity']), /安全整数/u);
});
