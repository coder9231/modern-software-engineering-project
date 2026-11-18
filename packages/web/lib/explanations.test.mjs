import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMathExpression, handleMathRequest } from './math-service.mjs';

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
