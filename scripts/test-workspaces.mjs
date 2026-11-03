import { readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const files = [];
async function discover(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.wrangler', '.sites-runtime', '.git', 'public'].includes(entry.name))
      continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await discover(path);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs') && !entry.name.endsWith('web-api.test.mjs'))
      files.push(path);
  }
}
await discover('packages');
if (files.length === 0) throw new Error('No workspace tests found');
const args = ['--test', '--test-reporter=spec'];
if (process.argv.includes('--coverage')) {
  await mkdir('reports', { recursive: true });
  args.push(
    '--test-reporter-destination=stdout',
    '--test-reporter=lcov',
    '--test-reporter-destination=reports/core-coverage.lcov',
    '--experimental-test-coverage',
    '--test-coverage-include=packages/core/src/**',
    '--test-coverage-exclude=**/*.test.mjs',
    '--test-coverage-lines=90',
    '--test-coverage-branches=90',
    '--test-coverage-functions=90',
  );
}
const result = spawnSync(process.execPath, [...args, ...files.sort()], {
  cwd: resolve('.'),
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
