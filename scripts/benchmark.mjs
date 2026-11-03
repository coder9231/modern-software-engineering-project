import { performance } from 'node:perf_hooks';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
async function measure(directory) {
  const modern = existsSync(resolve(directory, 'packages/core/src/math/core.mjs'));
  const math = await import(
    pathToFileURL(
      resolve(directory, modern ? 'packages/core/src/math/core.mjs' : 'website/lib/math/core.mjs'),
    ).href
  );
  const counter = await import(
    pathToFileURL(
      resolve(
        directory,
        modern ? 'packages/core/src/code-counter/analyzer.mjs' : 'website/lib/code-counter/analyzer.mjs',
      ),
    ).href
  );
  const tasks = {
    math1000: () => math.generateWorksheet({ count: 1000, seed: 'benchmark-fixed' }),
    javascript1000: () => counter.analyzeText('const x = /[/*]/; // note\n'.repeat(1000), 'JavaScript'),
  };
  const result = {};
  for (const [name, task] of Object.entries(tasks)) {
    task();
    const samples = [];
    for (let run = 0; run < 5; run++) {
      const began = performance.now();
      task();
      samples.push(performance.now() - began);
    }
    result[name] = samples.sort((a, b) => a - b)[2];
  }
  return result;
}
const candidate = await measure('.'),
  baseline = existsSync('.baseline') ? await measure('.baseline') : null;
const budgets = { math1000: 3000, javascript1000: 1000 };
let failed = false;
for (const [name, ms] of Object.entries(candidate)) {
  const maximum = baseline ? Math.min(budgets[name], Math.max(20, baseline[name] * 3)) : budgets[name];
  if (ms > maximum) failed = true;
  console.log(
    `${name}: ${ms.toFixed(2)} ms${baseline ? `, baseline ${baseline[name].toFixed(2)} ms` : ''}; limit ${maximum.toFixed(2)} ms`,
  );
}
mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/benchmark-results.json',
  JSON.stringify(
    { platform: process.platform, node: process.version, candidate, baseline, budgets, failed },
    null,
    2,
  ),
);
if (failed) process.exit(1);
