#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export * from '../../packages/cli/src/arithmetic/load-test.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../packages/cli/src/arithmetic/load-test.mjs', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
