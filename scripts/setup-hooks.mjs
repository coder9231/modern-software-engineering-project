import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (process.env.CI || process.env.HUSKY === '0' || !existsSync('.git')) process.exit(0);
const result = spawnSync(process.execPath, ['node_modules/husky/bin.js'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
