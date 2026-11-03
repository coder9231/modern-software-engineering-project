#!/usr/bin/env node
// No downloads here: all bytes come from packages verified by npm's lockfile.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve, relative } from 'node:path';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (
  args.length !== 0 &&
  !(args.length === 2 && args[0] === '--web-root' && args[1] && !args[1].startsWith('--'))
) {
  throw new Error('Usage: node scripts/prepare-ocr-assets.mjs [--web-root packages/web]');
}
let webRoot;
if (args.includes('--web-root')) {
  const supplied = args[args.indexOf('--web-root') + 1];
  if (!supplied) throw new Error('--web-root needs a local project directory');
  webRoot = resolve(root, supplied);
} else {
  try {
    await stat(join(root, 'packages/web/package.json'));
    webRoot = join(root, 'packages/web');
  } catch {
    webRoot = join(root, 'website');
  }
}
const inside = (parent, child) => {
  const path = relative(parent, child);
  return !path.startsWith('..') && !isAbsolute(path);
};
webRoot = await realpath(webRoot);
if (!inside(await realpath(root), webRoot)) throw new Error('The web root must stay inside this checkout');
const require = createRequire(join(webRoot, 'package.json'));
const packageRoot = (name) => dirname(require.resolve(`${name}/package.json`));
let engineRoot, coreRoot, languageRoot;
try {
  engineRoot = packageRoot('tesseract.js');
  coreRoot = packageRoot('tesseract.js-core');
  languageRoot = packageRoot('@tesseract.js-data/eng');
} catch {
  throw new Error(
    'Install the workspaces first. Required: tesseract.js@7.0.0 and @tesseract.js-data/eng@1.0.0.',
  );
}
const enginePackage = JSON.parse(await readFile(join(engineRoot, 'package.json'), 'utf8'));
if (!enginePackage.version.startsWith('7.'))
  throw new Error('This preparation script expects Tesseract.js 7.x');
const targetRoot = join(webRoot, 'public/ocr');
await mkdir(join(webRoot, 'public'), { recursive: true });
if (!inside(webRoot, await realpath(join(webRoot, 'public'))))
  throw new Error('Public directory must not redirect outside the web workspace');
await mkdir(targetRoot, { recursive: true });
if (!inside(webRoot, await realpath(targetRoot)))
  throw new Error('OCR directory must not redirect outside the web workspace');
const assets = [];
async function copy(source, path) {
  const destination = join(targetRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  if (!inside(targetRoot, await realpath(dirname(destination))))
    throw new Error('OCR asset directory redirects outside its target');
  await copyFile(source, destination);
  const bytes = await readFile(destination);
  assets.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await copy(join(engineRoot, 'dist/worker.min.js'), 'worker.min.js');
const coreFiles = (await readdir(coreRoot))
  .filter((name) => /^tesseract-core(?:-[\w-]+)?\.wasm(?:\.js)?$/u.test(name))
  .sort();
for (const name of coreFiles) await copy(join(coreRoot, name), `core/${name}`);
for (const name of [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
]) {
  if (!coreFiles.includes(name)) throw new Error(`Missing required OCR core: ${name}`);
}
await copy(join(languageRoot, '4.0.0_best_int/eng.traineddata.gz'), 'lang/eng.traineddata.gz');
for (const [directory, name] of [
  [engineRoot, 'tesseract'],
  [coreRoot, 'core'],
  [languageRoot, 'eng-package'],
]) {
  for (const entry of (await readdir(directory)).filter((file) =>
    /^(?:LICENSE|COPYING)(?:\..*)?$/iu.test(file),
  )) {
    await copy(join(directory, entry), `licenses/${name}-${entry}`);
  }
}
await writeFile(
  join(targetRoot, 'NOTICE.txt'),
  [
    `Tesseract.js ${enginePackage.version}: Apache-2.0; https://github.com/naptha/tesseract.js`,
    'Tesseract.js-core: Apache-2.0; https://github.com/naptha/tesseract.js-core',
    'English model: from tesseract-ocr/tessdata_best, Apache-2.0; https://github.com/tesseract-ocr/tessdata_best',
    '@tesseract.js-data/eng package wrapper: MIT; https://github.com/naptha/tessdata',
    'Original package notices are retained in licenses/. Model recognition is intended for printed text, not handwriting.',
    '',
  ].join('\n'),
);
await writeFile(
  join(targetRoot, 'manifest.json'),
  JSON.stringify({ version: 1, engineVersion: enginePackage.version, languages: ['eng'], assets }, null, 2) +
    '\n',
);
console.log(
  `Prepared ${assets.length} local OCR assets at ${relative(root, targetRoot)} (${(assets.reduce((total, asset) => total + asset.bytes, 0) / 1024 / 1024).toFixed(1)} MiB). No network download was performed.`,
);
