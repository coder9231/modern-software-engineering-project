import { accessSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNpmInstall } from './npm-install.mjs';

if (!process.env.npm_execpath) {
  throw new Error('Run this installer with npm run install:ci.');
}

// A workspace has one dependency tree and lockfile, including in Sites builds.
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(workspaceRoot);
const installed = await runNpmInstall([
  process.execPath,
  process.env.npm_execpath,
  'ci',
  '--include=dev',
  '--include=optional',
  '--prefer-offline',
  '--no-audit',
  '--no-fund',
]);
if (installed.signal) process.kill(process.pid, installed.signal);
if (installed.code !== 0 || installed.signal) process.exit(installed.code || 1);

try {
  accessSync(
    fileURLToPath(new URL('../../../node_modules/vinext/dist/cli.js', import.meta.url)),
    constants.R_OK,
  );
} catch {
  console.error('npm ci exited successfully but the local vinext executable is unavailable.');
  process.exitCode = 69;
}
