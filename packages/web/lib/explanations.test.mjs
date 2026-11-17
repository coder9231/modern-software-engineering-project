import test from 'node:test';
import assert from 'node:assert/strict';
import { explainCodeUpload, analyzeUploads, errorJSON } from './code-count-service.mjs';
import { evaluateMathExpression, handleMathRequest } from './math-service.mjs';

const upload = (content, path = 'lesson.mjs', options = {}) => ({
  files: [{ path, contentBase64: Buffer.from(content).toString('base64') }],
  options,
});

test('line explanation honors decoding, filtering and ordinary counts', () => {
  const body = upload(
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('// 中文\nconst a = 1;\n', 'utf16le')]),
  );
  const result = explainCodeUpload(body);
  assert.equal(result.lines[0].text, '// 中文');
  const { path, language, ...counts } = analyzeUploads(body).files[0];
  assert.deepEqual(result.counts, counts);
  assert.equal(result.path, path);
  assert.equal(language, 'JavaScript');
  assert.throws(() => explainCodeUpload(upload('x', 'node_modules/a.js')), /排除/u);
  assert.throws(() => explainCodeUpload(upload('x', 'a.js', { extensions: ['py'] })), /筛选/u);
  assert.throws(() => explainCodeUpload(upload('x', '../a.js')));
  assert.throws(() => explainCodeUpload(upload('x', 'a.ts')), /目前支持/u);
  assert.throws(() => explainCodeUpload({ files: [] }));
  assert.throws(() => explainCodeUpload(upload(Buffer.from([0xff]))), /编码/u);
  assert.throws(() => explainCodeUpload(upload(Buffer.from([0]))), /文本/u);
  assert.throws(() => explainCodeUpload(upload(Buffer.from([0x50, 0x4b, 0x03, 0x04]))), /文本/u);
});

test('oversized line explanations return a useful 413 response', async () => {
  for (const source of [' '.repeat(65537), ' '.repeat(131073)]) {
    let response;
    try {
      explainCodeUpload(upload(source));
    } catch (error) {
      response = errorJSON(error);
    }
    assert.equal(response.status, 413);
    assert.match((await response.json()).error.message, /KiB/u);
  }
});

test('math explanation is opt-in and keeps existing evaluation responses compatible', async () => {
  const old = evaluateMathExpression({ expression: '8+12/3' });
  assert.equal(old.answer, '12');
  assert.equal('steps' in old, false);
  const request = new Request('https://example.test/api/math/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression: '(8+12)/4', steps: true, kind: 'normal' }),
  });
  const response = await handleMathRequest(request, 'evaluate');
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).steps.map((step) => step.result),
    ['20', '5'],
  );
  assert.equal(evaluateMathExpression({ expression: '7/3', steps: true, kind: 'remainder' }).answer, '2 R 1');
  for (const payload of [
    { expression: '1+2', steps: 'true' },
    { expression: '1+2', kind: 'other' },
    { expression: '7/3', kind: 'remainder' },
  ])
    assert.throws(() => evaluateMathExpression(payload));
});
