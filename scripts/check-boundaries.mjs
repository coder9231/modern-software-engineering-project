import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
const root = resolve('.');
const packages = ['core', 'cli', 'ocr', 'web'];
const violations = [];
async function inspect(directory, owner) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        'test',
        'tests',
        'dist',
        'public',
        '.sites-runtime',
        '.wrangler',
        '.git',
        'vendor',
        'build',
      ].includes(entry.name)
    )
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await inspect(path, owner);
    else if (/\.(?:mjs|tsx?|mts)$/u.test(entry.name) && !entry.name.includes('.test.')) {
      const text = await readFile(path, 'utf8');
      for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\1/gu)) {
        const specifier = match[2];
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(path), specifier);
          if (
            !target.startsWith(resolve(root, 'packages', owner) + '/') &&
            !target.startsWith(resolve(root, 'packages', owner) + '\\')
          )
            violations.push(`${relative(root, path)} imports across a package boundary: ${specifier}`);
        }
        if (
          owner === 'core' &&
          /^(?:@se-lab\/(?:web|cli|ocr)|(?:node:)?(?:fs|path|child_process))$/u.test(specifier)
        )
          violations.push(`${relative(root, path)} is not browser-safe: ${specifier}`);
        if (owner === 'ocr' && specifier.startsWith('@se-lab/web'))
          violations.push(`${relative(root, path)} reverses the OCR dependency direction`);
      }
    }
  }
}
for (const name of packages) await inspect(resolve(root, 'packages', name), name);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('Workspace dependency boundaries passed.');
