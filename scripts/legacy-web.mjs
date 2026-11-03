import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const command = process.argv[2];
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Expected dev, build or start');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Use npm run dev from the repository root');
const result = spawnSync(
  process.execPath,
  [npm, 'run', command, '-w', '@se-lab/web', '--', ...process.argv.slice(3)],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
