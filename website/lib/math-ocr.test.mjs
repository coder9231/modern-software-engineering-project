import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOCRStatus, handleOCRRequest } from './math-ocr.mjs';

const environment = { OPENAI_API_KEY: 'offline-test-key', OCR_ACCESS_TOKEN: 'offline-access-code' };
const image = { imageBase64: btoa('\x89PNG\r\n\x1a\n' + 'fixture'), mimeType: 'image/png' };
const request = (payload = image, headers = {}) => new Request('https://example.test/api/math/ocr', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ocr-access-code': environment.OCR_ACCESS_TOKEN, ...headers }, body: JSON.stringify(payload),
});
const completed = (data) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
const unavailable = () => { throw new Error('No upstream call is allowed'); };

test('OCR status exposes only configuration state and safe limits', () => {
  assert.equal(getOCRStatus({}).configured, false);
  assert.equal(getOCRStatus({ OPENAI_API_KEY: 'one-only' }).configured, false);
  const status = getOCRStatus(environment);
  assert.equal(status.configured, true);
  assert.equal(status.maxImageBytes, 4194304);
  assert.equal(status.maxQuestions, 100);
  assert.equal(JSON.stringify(status).includes(environment.OPENAI_API_KEY), false);
  assert.equal(JSON.stringify(status).includes(environment.OCR_ACCESS_TOKEN), false);
});

test('unconfigured and invalid access never call upstream', async () => {
  assert.equal((await handleOCRRequest(request(), { environment: {}, fetchImpl: unavailable })).status, 503);
  assert.equal((await handleOCRRequest(request(image, { 'x-ocr-access-code': 'wrong' }), { environment, fetchImpl: unavailable })).status, 403);
});

test('OCR checks image bytes, fields and origin before upstream', async () => {
  for (const payload of [
    { imageBase64: btoa('not a png'), mimeType: 'image/png' },
    { ...image, url: 'https://example.test/secret' },
    { ...image, mimeType: 'image/svg+xml' },
    { ...image, imageBase64: '!!!!' },
    { ...image, imageBase64: 'a'.repeat(5592408) },
  ]) {
    assert.equal((await handleOCRRequest(request(payload), { environment, fetchImpl: unavailable })).status, 400);
  }
  assert.equal((await handleOCRRequest(request(image, { Origin: 'https://elsewhere.test' }), { environment, fetchImpl: unavailable })).status, 403);
});

test('OCR sends image to fixed Responses endpoint and returns ungraded editable rows', async () => {
  const rows = [{ expression: '1+2', submitted: '9', uncertain: true }];
  const response = await handleOCRRequest(request(), { environment, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${environment.OPENAI_API_KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.input[0].content[1].image_url, `data:image/png;base64,${image.imageBase64}`);
    return completed({ rows });
  } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { rows, requiresReview: true });
});

test('OCR rejects malformed, excessive, incomplete, empty and forged scoring output', async () => {
  for (const data of [
    { rows: [] },
    { rows: [{ expression: '1+2', submitted: '3', uncertain: false, correct: true }] },
    { rows: Array.from({ length: 101 }, () => ({ expression: '1+2', submitted: '', uncertain: false })) },
    { rows: [{ expression: 'x'.repeat(257), submitted: '', uncertain: false }] },
  ]) {
    const result = await handleOCRRequest(request(), { environment, fetchImpl: async () => completed(data) });
    assert.ok([422, 502].includes(result.status));
  }
  const incomplete = await handleOCRRequest(request(), { environment, fetchImpl: async () => Response.json({ status: 'incomplete', output: [] }) });
  assert.equal(incomplete.status, 502);
});

test('OCR redacts upstream failures and bounds response size', async () => {
  for (const status of [401, 429, 500]) {
    const result = await handleOCRRequest(request(), { environment, fetchImpl: async () => new Response('private upstream details', { status }) });
    assert.equal(result.status, status === 429 ? 429 : 502);
    assert.equal((await result.text()).includes('private upstream'), false);
  }
  const huge = await handleOCRRequest(request(), { environment, fetchImpl: async () => new Response('x'.repeat(131073)) });
  assert.equal(huge.status, 502);
  const timed = await handleOCRRequest(request(), { environment, fetchImpl: async () => { throw new DOMException('secret detail', 'TimeoutError'); } });
  assert.equal(timed.status, 504);
  assert.equal((await timed.text()).includes('secret detail'), false);
});
