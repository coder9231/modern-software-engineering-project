import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('packages/cli/dist', { recursive: true });
for (const [name, entry] of [
  ['se-count', 'code-counter'],
  ['se-math', 'arithmetic'],
]) {
  await build({
    entryPoints: [`packages/cli/src/${entry}/cli.mjs`],
    outfile: `packages/cli/dist/${name}.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'info',
  });
}
console.log(
  'Single-file ESM CLIs produced. They require Node; native executables require a separate SEA/signing process.',
);
