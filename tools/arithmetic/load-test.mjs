#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `四则运算 API 容量测量（只对你有权测试的目标运行）

node tools/arithmetic/load-test.mjs [选项]
  --url <URL>               默认 http://127.0.0.1:5173
  --concurrency <数量>      同时进行的请求数，默认 5，最大 10000
  --requests <数量>         总请求数，默认 100，最大 100000
  --count <题量>            每次生成的题数，默认 20，最大 10000
  --timeout-ms <毫秒>       单请求超时，默认 15000
  --allow-remote            明确允许测试非本机目标
  --allow-heavy-load        明确允许超过 100 并发的测试
  --help                    显示帮助，不发送请求

默认只测试本机。输出 JSON 包括延迟 p50/p95、错误率和吞吐，不会读取或发送密钥。
10000 道题的单请求生成，与 10000 并发请求是不同验收项。
`;

export function parseLoadArguments(args) {
  const options = { url: 'http://127.0.0.1:5173', concurrency: 5, requests: 100, count: 20, timeoutMs: 15000, allowRemote: false, allowHeavyLoad: false, help: false };
  const numeric = { '--concurrency': ['concurrency', 10000], '--requests': ['requests', 100000], '--count': ['count', 10000], '--timeout-ms': ['timeoutMs', 300000] };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--allow-remote') options.allowRemote = true;
    else if (argument === '--allow-heavy-load') options.allowHeavyLoad = true;
    else if (argument === '--url') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('--url 缺少地址。');
      options.url = value;
    } else if (Object.hasOwn(numeric, argument)) {
      const value = args[++index], [key, maximum] = numeric[argument];
      if (!value || !/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(`${argument} 须为 1～${maximum} 的整数。`);
      options[key] = Number(value);
    } else throw new Error(`未知选项：${argument}`);
  }
  const target = new URL(options.url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error('目标须为不含凭据、查询参数和片段的 HTTP(S) 地址。');
  const hostname = target.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '::1' || (isIP(hostname) === 4 && hostname.startsWith('127.'));
  if (!options.help && !loopback && !options.allowRemote) throw new Error('非本机目标须显式提供 --allow-remote，并确保拥有测试授权。');
  if (!options.help && options.concurrency > 100 && !options.allowHeavyLoad) throw new Error('超过 100 并发须额外提供 --allow-heavy-load。');
  return { ...options, url: new URL('/api/math/generate', target).href };
}

const percentile = (sorted, fraction) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
const rounded = (value) => value === null ? null : Math.round(value * 100) / 100;

export async function runLoad(options) {
  let next = 0, succeeded = 0;
  const durations = [], successDurations = [], errors = new Map(), statuses = new Map();
  const startedAt = new Date().toISOString(), start = performance.now();
  const workers = Array.from({ length: Math.min(options.concurrency, options.requests) }, async () => {
    while (next < options.requests) {
      const index = next++, before = performance.now();
      try {
        const response = await fetch(options.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options: { count: options.count, seed: `load-${index}` } }),
          signal: AbortSignal.timeout(options.timeoutMs),
          redirect: 'error',
        });
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
        const payload = await response.json();
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        if (!Array.isArray(payload.questions) || payload.questions.length !== options.count) throw new Error('invalid_response');
        succeeded++;
        successDurations.push(performance.now() - before);
      } catch (error) {
        const code = /^HTTP_\d+$/u.test(error.message) || error.message === 'invalid_response' ? error.message
          : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'network_or_response_error';
        errors.set(code, (errors.get(code) ?? 0) + 1);
      } finally { durations.push(performance.now() - before); }
    }
  });
  await Promise.all(workers);
  const elapsedMs = performance.now() - start;
  durations.sort((a, b) => a - b); successDurations.sort((a, b) => a - b);
  return {
    target: options.url, startedAt,
    clientRuntime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: { concurrency: options.concurrency, effectiveConcurrency: Math.min(options.concurrency, options.requests), requests: options.requests, questionsPerRequest: options.count, timeoutMs: options.timeoutMs },
    completed: durations.length, succeeded, failed: durations.length - succeeded,
    errorRate: (durations.length - succeeded) / durations.length,
    elapsedMs: rounded(elapsedMs), throughputRequestsPerSecond: rounded(durations.length * 1000 / elapsedMs),
    successfulRequestsPerSecond: rounded(succeeded * 1000 / elapsedMs),
    latencyMs: { p50: rounded(percentile(durations, 0.5)), p95: rounded(percentile(durations, 0.95)), min: rounded(durations[0]), max: rounded(durations.at(-1)) },
    successfulLatencyMs: { p50: rounded(percentile(successDurations, 0.5)), p95: rounded(percentile(successDurations, 0.95)) },
    statuses: Object.fromEntries(statuses), errors: Object.fromEntries(errors),
    scope: '一次原生 fetch 请求流量实验，不等于真实学生人数、浏览器并发连接或生产 SLA 证明。',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseLoadArguments(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else {
      const report = await runLoad(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.failed) process.exitCode = 2;
    }
  } catch (error) { process.stderr.write(`错误：${error.message}\n`); process.exitCode = 1; }
}
