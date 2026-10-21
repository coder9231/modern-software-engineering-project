import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyzeUploads, exportReport } from '../../website/lib/code-count-service.mjs';

const fixtures = [
  {
    name: 'continued.c',
    source: ['// continued comment \\', 'not_code();', 'int actual = 1;', ''].join('\n'),
    expected: { total: 3, code: 1, comment: 2, blank: 0 },
  },
  {
    name: 'ratio.ts',
    source: ['const ratio = class {} / 2; /* block', 'still a comment */', '// last'].join('\n'),
    expected: { total: 3, code: 1, comment: 2, blank: 0 },
  },
  {
    name: 'format.py',
    source: ['value = f"""{', '  # replacement-field comment', '  1 + 2', '}"""', '# outside'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
];

for (const { name, source, expected } of fixtures) {
  test(`CLI, upload service and exported report classify ${name} consistently`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'counter-language-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, name);
    await writeFile(path, source);
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, path, '--json'], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const scanned = JSON.parse(result.stdout);
    const uploaded = analyzeUploads({ files: [{ path: name, contentBase64: Buffer.from(source).toString('base64') }] });
    const totals = { files: 1, ...expected };
    assert.deepEqual(scanned.totals, totals);
    assert.deepEqual(uploaded.totals, totals);
    assert.deepEqual(JSON.parse(exportReport({ format: 'json', report: uploaded }).body).totals, totals);
  });
}
