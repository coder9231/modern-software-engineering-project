#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../packages/cli/src/arithmetic/cli.mjs';
import { MathError } from '@se-lab/core/math';
export * from '../../packages/cli/src/arithmetic/cli.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`错误${error instanceof MathError ? `（${error.code}）` : ''}：${error.message}\n`);
    process.exitCode = 1;
  });
}
