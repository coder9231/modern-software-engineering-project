import test from 'node:test';
import assert from 'node:assert/strict';
import { streamWorksheetRequest } from './math-stream.mjs';
import { readWorksheetStream } from './math-stream-client.ts';
import { generateWorksheet } from '@se-lab/core/math';
const request = (options, signal) =>
  new Request('https://example.test/api/math/generate/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options }),
    signal,
  });
test('stream validates malformed configuration before returning HTTP 200', async () => {
  for (const options of [{ count: 10001 }, { operators: ['?'] }, { min: 10, max: 0 }]) {
    const response = await streamWorksheetRequest(request(options));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
  const response = await streamWorksheetRequest(
    new Request('https://example.test/api/math/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    }),
  );
  assert.equal(response.status, 415);
});
test('bounded NDJSON chunks preserve the exact seeded worksheet and progressive previews', async () => {
  const options = { count: 65, seed: 'stream-http' };
  const response = await streamWorksheetRequest(request(options));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const progress = [];
  const actual = await readWorksheetStream(
    response,
    (generated, requested, preview) => {
      progress.push(generated);
      assert.equal(requested, 65);
      assert.ok(preview.length <= 12);
    },
    new AbortController().signal,
  );
  assert.deepEqual(actual, generateWorksheet(options));
  assert.deepEqual(progress, [32, 64, 65]);
});
test('cancelled stream closes its iterator without producing a completed worksheet', async () => {
  const response = await streamWorksheetRequest(request({ count: 10000, seed: 'stream-cancel' }));
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /"type":"meta"/);
  await reader.cancel();
  assert.equal((await reader.read()).done, true);
});
test('client rejects truncated or forged completion, keeping partial results separate', async () => {
  const options = generateWorksheet({ count: 2, seed: 'bad-stream' }).options;
  for (const suffix of ['', '\n' + JSON.stringify({ type: 'complete', generated: 2 })]) {
    const text = JSON.stringify({ type: 'meta', seed: options.seed, options, requested: 2 }) + suffix;
    const response = new Response(text, { headers: { 'Content-Type': 'application/x-ndjson' } });
    await assert.rejects(
      readWorksheetStream(response, () => {}, new AbortController().signal),
      /中断|完整/,
    );
  }
});
