import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateExpression } from '../../website/lib/math/core.mjs';

const base = new URL(process.env.ARITHMETIC_URL || 'http://127.0.0.1:5173');
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('ARITHMETIC_URL 须为不含凭据的 HTTP(S) 地址。');

async function call(path, payload, headers = {}) {
  const response = await fetch(new URL(path, base), {
    ...(payload === undefined ? {} : { method: 'POST', body: JSON.stringify(payload) }),
    headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  // The framework can reject cross-origin requests before the JSON route runs.
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json() : { raw: await response.text() };
  return { response, data };
}

test('live HTTP config exposes defaults, limits and a safe OCR state', async () => {
  const { response, data } = await call('/api/math/config');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.defaults.operatorCount, 2);
  assert.equal(data.defaults.resultMin, 0);
  assert.equal(data.defaults.resultMax, 100);
  assert.equal(data.limits.maxQuestions, 10000);
  assert.equal(typeof data.ocr.configured, 'boolean');
  assert.equal(data.ocr.requiresAccessCode, true);
  assert.equal(Object.hasOwn(data.ocr, 'key'), false);
  const status = await call('/api/math/ocr');
  assert.equal(status.response.status, 200);
  assert.equal(status.data.configured, data.ocr.configured);
  assert.equal(status.data.maxImageBytes, 4194304);
});

test('live HTTP generation is deterministic and defaults have exact bounded answers', async () => {
  const input = { options: { seed: 'http-defaults' } };
  const first = await call('/api/math/generate', input);
  assert.equal(first.response.status, 200);
  assert.equal(first.data.questions.length, 20);
  assert.deepEqual(first.data, (await call('/api/math/generate', input)).data);
  for (const question of first.data.questions) {
    assert.equal(evaluateExpression(question.expression).answer, question.answer);
    assert.match(question.answer, /^\d+$/u);
    assert.ok(Number(question.answer) <= 100);
  }
});

test('live HTTP generates one worksheet of 10000 structurally unique questions', async () => {
  const { response, data } = await call('/api/math/generate', { options: { count: 10000, seed: 'http-ten-thousand' } });
  assert.equal(response.status, 200);
  assert.equal(data.questions.length, 10000);
  assert.equal(new Set(data.questions.map((question) => question.canonical)).size, 10000);
  assert.ok(data.questions.every((question) => /^\d+$/u.test(question.answer) && Number(question.answer) <= 100));
});

test('live HTTP grading ignores client-provided standard answers', async () => {
  const { response, data } = await call('/api/math/grade', {
    questions: [{ id: 'forged', expression: '1 + 2', kind: 'normal', answer: '999', canonical: 'fake' }],
    answers: { forged: '3' },
  });
  assert.equal(response.status, 200);
  assert.equal(data.correct, 1);
  assert.equal(data.results[0].expected, '3');
  const incorrect = await call('/api/math/grade', { questions: [{ id: '1', expression: '1+2', kind: 'normal', answer: '999' }], answers: { 1: '999' } });
  assert.equal(incorrect.data.correct, 0);
});

test('live HTTP fraction and remainder worksheets can be graded exactly', async () => {
  for (const options of [
    { count: 8, fractions: true, divisionMode: 'fraction', seed: 'http-fractions' },
    { count: 8, operators: ['/'], operatorCount: 1, divisionMode: 'remainder', seed: 'http-remainders' },
  ]) {
    const generated = await call('/api/math/generate', { options });
    assert.equal(generated.response.status, 200);
    const answers = Object.fromEntries(generated.data.questions.map((question) => [question.id, question.answer]));
    const graded = await call('/api/math/grade', { questions: generated.data.questions, answers });
    assert.equal(graded.response.status, 200);
    assert.equal(graded.data.correct, 8);
  }
  const rational = await call('/api/math/evaluate', { expression: '0.1 + 0.2' });
  assert.equal(rational.data.answer, '3/10');
  assert.deepEqual(rational.data.rpn, ['0.1', '0.2', '+']);
});

test('live HTTP 24-point puzzle and hint share the expression engine', async () => {
  const puzzle = await call('/api/math/24', { action: 'new', seed: 'http-24' });
  assert.equal(puzzle.response.status, 200);
  const hint = await call('/api/math/24', { action: 'hint', numbers: puzzle.data.numbers });
  assert.equal(typeof hint.data.solution, 'string');
  const checked = await call('/api/math/24', { action: 'check', numbers: puzzle.data.numbers, expression: hint.data.solution });
  assert.equal(checked.data.correct, true);
  const misuse = await call('/api/math/24', { action: 'check', numbers: [3, 3, 8, 8], expression: '24' });
  assert.equal(misuse.data.correct, false);
});

test('live HTTP rejects invalid options, expressions, duplicate IDs and cross-origin requests', async () => {
  for (const [path, payload] of [
    ['/api/math/generate', { options: { count: 10001 } }],
    ['/api/math/generate', { options: { unexpected: true } }],
    ['/api/math/evaluate', { expression: 'globalThis.alert(1)' }],
    ['/api/math/grade', { questions: [{ id: '1', expression: '1+2', kind: 'normal' }, { id: '1', expression: '2+3', kind: 'normal' }], answers: {} }],
  ]) {
    const { response, data } = await call(path, payload);
    assert.equal(response.status, 400);
    assert.equal(typeof data.error.code, 'string');
  }
  const forged = await call('/api/math/evaluate', { expression: '1+2' }, { Origin: 'https://cross-origin.invalid' });
  assert.equal(forged.response.status, 403);
  if (forged.data.error) assert.equal(forged.data.error.code, 'origin_not_allowed');
  else assert.match(forged.data.raw, /^Forbidden$/u);
  const validOrigin = await call('/api/math/evaluate', { expression: '1+2' }, { Origin: base.origin });
  assert.equal(validOrigin.response.status, 200);
});

test('live HTTP unconfigured AI OCR clearly returns unavailable without an upstream request', async (context) => {
  const { data: config } = await call('/api/math/config');
  if (config.ocr.configured) { context.skip('AI 已配置；此脚本不发送收费识别请求。'); return; }
  const { response, data } = await call('/api/math/ocr', {});
  assert.equal(response.status, 503);
  assert.equal(typeof data.error.code, 'string');
  assert.equal(typeof data.error.message, 'string');
});
