import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postject from 'postject';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const target = `${process.platform}-${process.arch}`;
const extension = process.platform === 'win32' ? '.exe' : '';
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const executables = [
  ['se-count', 'code-counter'],
  ['se-math', 'arithmetic'],
];
const cleanEnvironment = { ...process.env, NODE_OPTIONS: '' };

function insideRoot(filename) {
  const relative = path.relative(root, filename);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing a build path outside the workspace: ${filename}`);
  }
}

// Check each parent before creating anything below it; never follow an output symlink.
async function outputDirectory() {
  let directory = root;
  for (const segment of ['packages', 'cli', 'dist', target]) {
    directory = path.join(directory, segment);
    try {
      await mkdir(directory);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Build directory must be a normal directory: ${directory}`);
    }
    insideRoot(await realpath(directory));
  }
  return directory;
}

function execute(filename, args, options = {}) {
  return execFileSync(filename, args, {
    cwd: root,
    env: cleanEnvironment,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function smoke(executable, name, directory) {
  // Start in a clean directory with no PATH: the executable must supply its own runtime.
  const options = { cwd: directory, env: { ...cleanEnvironment, PATH: '', Path: '' } };
  assert.match(execute(executable, ['--help'], options), /--help/u);
  if (name === 'se-math') {
    const result = JSON.parse(
      execute(executable, ['--count', '3', '--seed', 'sea-smoke', '--answers', '--json'], options),
    );
    assert.equal(result.questions.length, 3);
    assert.ok(result.questions.every((question) => typeof question.answer === 'string'));
  } else {
    const result = JSON.parse(execute(executable, ['.', '--json'], options));
    assert.equal(result.totals.files, 2);
    assert.equal(result.totals.total, 6);
    assert.equal(result.totals.code, 2);
    assert.equal(result.totals.comment, 2);
    assert.equal(result.totals.blank, 2);
  }
}

if (process.argv.length > 2) {
  throw new Error('This script builds the current OS/CPU only; it does not accept cross-compile flags.');
}
if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Build native CLIs with Node.js 24 LTS, using the same Node binary for the SEA blob.');
}
if (!(
  (process.platform === 'win32' && ['x64', 'arm64'].includes(process.arch)) ||
  (process.platform === 'darwin' && process.arch === 'arm64')
)) {
  throw new Error('Native release targets are Windows x64/arm64 and macOS arm64. See docs/native-cli.md.');
}

const directory = await outputDirectory();
const work = await mkdtemp(path.join(directory, '.sea-build-'));
insideRoot(work);
const runtimeHashBefore = createHash('sha256')
  .update(await readFile(process.execPath))
  .digest('hex');
const manifest = {
  target,
  node: process.version,
  createdAt: new Date().toISOString(),
  runtimeSha256: runtimeHashBefore,
  signing: process.platform === 'darwin' ? 'ad-hoc; not notarized' : 'unsigned; not Authenticode signed',
  smoke: 'help and functional JSON checks; clean working directory and empty PATH',
  files: [],
};

try {
  const smokeDirectory = path.join(work, 'smoke');
  await mkdir(smokeDirectory);
  await writeFile(path.join(smokeDirectory, 'fixture.py'), '# comment\nprint(1)\n\n');
  await writeFile(path.join(smokeDirectory, 'fixture.js'), '// comment\nconst value = `// text`;\n\n');
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

  for (const [name, entry] of executables) {
    const main = path.join(work, `${name}.cjs`);
    const blob = path.join(work, `${name}.blob`);
    const configuration = path.join(work, `${name}.json`);
    const executable = path.join(work, `${name}${extension}`);
    const result = await build({
      absWorkingDir: root,
      entryPoints: [`packages/cli/src/${entry}/cli.mjs`],
      outfile: main,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      metafile: true,
      define: { 'import.meta.url': '__seaImportMetaUrl' },
      banner: {
        js: "const __seaImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
      },
      logLevel: 'warning',
    });
    for (const output of Object.values(result.metafile.outputs)) {
      for (const dependency of output.imports) {
        if (dependency.external && !builtins.has(dependency.path)) {
          throw new Error(`Native bundle has an external dependency: ${dependency.path}`);
        }
      }
    }
    await writeFile(
      configuration,
      JSON.stringify(
        {
          main,
          output: blob,
          disableExperimentalSEAWarning: true,
          useSnapshot: false,
          useCodeCache: false,
          execArgvExtension: 'none',
        },
        null,
        2,
      ),
    );
    execute(process.execPath, ['--experimental-sea-config', configuration]);
    // Only mutate this new workspace copy; never inject into process.execPath.
    await copyFile(process.execPath, executable, constants.COPYFILE_EXCL);
    if (process.platform === 'darwin') execute('codesign', ['--remove-signature', executable]);
    await postject.inject(executable, 'NODE_SEA_BLOB', await readFile(blob), {
      sentinelFuse: fuse,
      ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
    });
    if (process.platform === 'darwin') {
      await chmod(executable, 0o755);
      execute('codesign', ['--sign', '-', executable]);
      execute('codesign', ['--verify', '--strict', executable]);
    }
    smoke(executable, name, smokeDirectory);
    const bytes = await readFile(executable);
    const filename = `${name}${extension}`;
    manifest.files.push({
      name: filename,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    // Rename replaces an old output directory entry without following symlinks/hard links.
    await rename(executable, path.join(directory, filename));
    console.log(`Built and smoke-tested ${path.relative(root, path.join(directory, filename))}`);
  }
  assert.equal(
    createHash('sha256')
      .update(await readFile(process.execPath))
      .digest('hex'),
    runtimeHashBefore,
    'The installed Node runtime must remain unchanged.',
  );
  const manifestPath = path.join(work, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(manifestPath, path.join(directory, 'manifest.json'));
  console.log(`Signing: ${manifest.signing}. See docs/native-cli.md before distribution.`);
} finally {
  // work was created by mkdtemp beneath the checked workspace output directory.
  insideRoot(work);
  if (path.dirname(work) !== directory || !path.basename(work).startsWith('.sea-build-')) {
    throw new Error(`Refusing to clean an unexpected build directory: ${work}`);
  }
  await rm(work, { recursive: true, force: true });
}
