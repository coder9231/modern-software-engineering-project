import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getMathConfig, generateMathWorksheet, gradeMathWorksheet,
  evaluateMathExpression, play24, mathErrorJSON, handleMathRequest,
} from './math-service.mjs';
import { MathError } from './math/core.mjs';
import { HttpError, MAX_REQUEST_BYTES } from './code-count-service.mjs';

const question = (expression = '1 + 2') => ({ id: '1', expression, kind: 'normal' });
const request = (payload, headers = {}) => new Request('https://example.test/api/math/generate', {
  method: 'POST', body: JSON.stringify(payload),
  headers: { 'Content-Type': 'application/json', ...headers },
});

test('config has stable defaults, bounded limits and only a boolean credential state', () => {
  const config = getMathConfig({ OPENAI_API_KEY: 'secret-do-not-serialize', OCR_ACCESS_TOKEN: 'private-access-do-not-serialize' });
  assert.equal(config.defaults.count, 20);
  assert.equal(config.defaults.operatorCount, 2);
  assert.equal(config.defaults.min, 0);
  assert.equal(config.defaults.max, 100);
  assert.equal(config.defaults.resultMin, 0);
  assert.equal(config.defaults.resultMax, 100);
  assert.equal(Object.hasOwn(config.defaults, 'seed'), false);
  assert.equal(config.limits.maxQuestions, 10000);
  assert.ok(config.rules.length >= 5);
  assert.deepEqual(config.ocr, { configured: true, provider: 'openai', requiresAccessCode: true });
  assert.equal(JSON.stringify(config).includes('secret-do-not-serialize'), false);
  assert.equal(getMathConfig({}).ocr.configured, false);
  assert.equal(getMathConfig({ OPENAI_API_KEY: 'secret' }).ocr.configured, false);
  assert.equal(getMathConfig({ OCR_ACCESS_TOKEN: 'secret' }).ocr.configured, false);
  assert.equal(getMathConfig({ OPENAI_API_KEY: 'secret', OCR_ACCESS_TOKEN: '  ' }).ocr.configured, false);
  assert.equal(JSON.stringify(config).includes('private-access-do-not-serialize'), false);
});

test('generate validates envelope and uses deterministic shared core', () => {
  const input = { options: { count: 12, seed: 'service-fixture' } };
  const first = generateMathWorksheet(input);
  assert.equal(first.questions.length, 12);
  assert.deepEqual(first, generateMathWorksheet(input));
  assert.equal(new Set(first.questions.map((q) => q.canonical)).size, 12);
  assert.throws(() => generateMathWorksheet({ options: {}, filename: '/tmp/source' }), /未知字段/u);
  assert.throws(() => generateMathWorksheet({ options: { count: 10001 } }), { code: 'invalid_options' });
  assert.throws(() => generateMathWorksheet({ options: { secret: 'ignore' } }), { code: 'invalid_options' });
});

test('grade ignores counterfeit client answers and fingerprints', () => {
  const report = gradeMathWorksheet({
    questions: [{ ...question(), answer: '999', canonical: 'fake' }], answers: { 1: '3' },
  });
  assert.equal(report.correct, 1);
  assert.equal(report.results[0].expected, '3');
  assert.equal(gradeMathWorksheet({ questions: [question()], answers: { 1: '999' } }).correct, 0);
});

test('grade distinguishes blank answers, invalid answers and exact equivalent fractions', () => {
  const report = gradeMathWorksheet({
    questions: [question('1 / 2'), { id: '2', expression: '4 + 5', kind: 'normal' }], answers: { 1: '0.5' },
  });
  assert.equal(report.correct, 1);
  assert.equal(report.answered, 1);
  assert.equal(report.accuracy, 0.5);
  assert.equal(report.results[1].message, '未作答');
  const invalid = gradeMathWorksheet({ questions: [question()], answers: { 1: 'fetch("https://example.test")' } });
  assert.equal(invalid.correct, 0);
});

test('grade rejects duplicate IDs, missing fields, unknown metadata and oversized collections', () => {
  for (const questions of [[], [question(), question()], [{ id: '1', expression: '1+2' }], [{ ...question(), expected: '3' }], Array(10001).fill(question())]) {
    assert.throws(() => gradeMathWorksheet({ questions, answers: {} }));
  }
  assert.throws(() => gradeMathWorksheet({ questions: [question('1'.repeat(257))], answers: {} }));
  assert.throws(() => gradeMathWorksheet({ questions: [question()], answers: { 1: '1'.repeat(257) } }));
  assert.throws(() => gradeMathWorksheet({ questions: [question()], answers: { unknown: '3' } }));
  assert.throws(() => gradeMathWorksheet({ questions: [question()], answers: ['3'] }));
  assert.throws(() => gradeMathWorksheet({ questions: [question()], answers: { 1: 3 } }));
});

test('grade treats prototype-like question IDs as ordinary own properties', () => {
  const report = gradeMathWorksheet(JSON.parse('{"questions":[{"id":"__proto__","expression":"1+2","kind":"normal"}],"answers":{"__proto__":"3"}}'));
  assert.equal(report.correct, 1);
  assert.equal({}.polluted, undefined);
});

test('remainder grading recomputes quotient and remainder', () => {
  const report = gradeMathWorksheet({ questions: [{ id: 'r', expression: '7 / 3', kind: 'remainder', answer: '99 R 2' }], answers: { r: '2 R 1' } });
  assert.equal(report.correct, 1);
  assert.equal(report.results[0].expected, '2 R 1');
});

test('evaluate returns exact fraction and RPN without interpreting code', () => {
  const result = evaluateMathExpression({ expression: '(1 + 2) / 6' });
  assert.equal(result.answer, '1/2');
  assert.deepEqual(result.rpn, ['1', '2', '+', '6', '/']);
  assert.throws(() => evaluateMathExpression({ expression: 'globalThis.sentinel=1' }), { code: 'invalid_expression' });
  assert.throws(() => evaluateMathExpression({ expression: '1+2', arbitrary: true }), /未知字段/u);
  assert.throws(() => evaluateMathExpression({ expression: '1/0' }), { code: 'division_by_zero' });
});

test('24-point new, hint and check are bounded actions using the same solver', () => {
  const puzzle = play24({ action: 'new', seed: 'service-24' });
  assert.deepEqual(puzzle, play24({ action: 'new', seed: 'service-24' }));
  assert.equal(puzzle.numbers.length, 4);
  const { solution } = play24({ action: 'hint', numbers: puzzle.numbers });
  assert.equal(play24({ action: 'check', numbers: puzzle.numbers, expression: solution }).correct, true);
  assert.equal(play24({ action: 'check', numbers: [3, 3, 8, 8], expression: '8/(3-8/3)' }).correct, true);
  assert.equal(play24({ action: 'check', numbers: [3, 3, 8, 8], expression: '24' }).correct, false);
  assert.throws(() => play24({ action: 'new', numbers: [1, 2, 3, 4] }), /未知字段/u);
  assert.throws(() => play24({ action: 'hint', numbers: [1, 2, 3] }), { code: 'invalid_numbers' });
  assert.throws(() => play24({ action: 'arbitrary' }));
});

test('HTTP wrapper returns no-store JSON and stable math errors', async () => {
  const ok = await handleMathRequest(request({ expression: '1+2' }), 'evaluate');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await ok.json()).answer, '3');
  const invalid = await handleMathRequest(request({ expression: '1/0' }), 'evaluate');
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'division_by_zero');
});

test('HTTP boundary rejects cross-origin, non-JSON and malformed UTF-8/JSON', async () => {
  const forbidden = await handleMathRequest(request({}, { Origin: 'https://attacker.test' }), 'generate');
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, 'origin_not_allowed');
  const wrongType = await handleMathRequest(request({}, { 'Content-Type': 'text/plain' }), 'generate');
  assert.equal(wrongType.status, 415);
  for (const body of ['{oops', new Uint8Array([0xff])]) {
    const response = await handleMathRequest(new Request('https://example.test/api/math', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }), 'generate');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_json');
  }
});

test('HTTP boundary caps advertised and actual streamed bytes before JSON parsing', async () => {
  const advertised = await handleMathRequest(request({}, { 'Content-Length': String(MAX_REQUEST_BYTES + 1) }), 'generate');
  assert.equal(advertised.status, 413);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const response = await handleMathRequest(new Request('https://example.test/api/math', {
    method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json' },
  }), 'generate');
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
});

test('unexpected errors do not expose internals, but documented errors keep status', async () => {
  const response = mathErrorJSON(new Error('secret stack and token'));
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes('secret'), false);
  assert.equal(mathErrorJSON(new HttpError('blocked', '禁止', 403)).status, 403);
  assert.equal(mathErrorJSON(new MathError('invalid_expression', '错误算式')).status, 400);
});
