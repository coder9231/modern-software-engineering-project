import './sites-env.mjs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
const cli = new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url);
const child = spawn(
  process.execPath,
  [
    fileURLToPath(cli),
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--local',
    '--persist-to',
    '.wrangler/state',
    '--inspector-port',
    '0',
    ...(!args.includes('--ip') ? ['--ip', '127.0.0.1'] : []),
    ...(!args.includes('--port') ? ['--port', '5173'] : []),
    ...args,
  ],
  { stdio: 'inherit', windowsHide: true },
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
