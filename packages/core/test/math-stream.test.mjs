import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateWorksheet, generateWorksheetStream, MathError } from '../src/math/core.mjs';

const code = (expected) => (error) => error instanceof MathError && error.code === expected;
function consume(iterator) {
  const questions = [];
  while (true) {
    const result = iterator.next();
    if (result.done) return { questions, summary: result.value };
    questions.push(result.value);
  }
}

test('pulling the first of 10000 questions does not generate the complete worksheet', () => {
  const progress = [];
  const iterator = generateWorksheetStream(
    { count: 10000, seed: 'first-pull' },
    { onProgress: (row) => progress.push(row) },
  );
  const first = iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value.id, '1');
  assert.equal(progress.at(-1).generated, 1);
  assert.equal(progress.at(-1).requested, 10000);
  assert.ok(progress.every((row) => row.generated <= 1));
  iterator.return();
  assert.equal(iterator.next().done, true);
});

test('stream metadata and progress agree with the synchronous worksheet', () => {
  const options = { count: 80, seed: 'stream-result' };
  const progress = [];
  const streamed = consume(generateWorksheetStream(options, { onProgress: (row) => progress.push(row) }));
  const worksheet = generateWorksheet(options);
  assert.deepEqual(streamed.questions, worksheet.questions);
  assert.deepEqual(streamed.summary.options, worksheet.options);
  assert.equal(streamed.summary.seed, worksheet.seed);
  assert.equal(streamed.summary.generated, 80);
  assert.equal(streamed.summary.requested, 80);
  assert.ok(streamed.summary.attempts >= 80);
  assert.deepEqual(progress[0], { generated: 0, requested: 80, attempts: 0 });
  for (let index = 1; index < progress.length; index++) {
    assert.ok(progress[index].generated >= progress[index - 1].generated);
    assert.ok(progress[index].attempts >= progress[index - 1].attempts);
  }
  assert.equal(progress.at(-1).generated, 80);
});

test('fixed seeds preserve the pre-refactor question sequence for every division mode', () => {
  // Hashes were captured from the original generator before this extraction,
  // not derived from generateWorksheetStream during the test.
  const baselines = [
    [
      { seed: 'stream-default', count: 50 },
      '9cff4758da503c6d3b7df02f0d12aa3c333c8d9f5f491d219542c5137f981b8f',
    ],
    [
      {
        seed: 'stream-fractions',
        count: 30,
        min: -9,
        max: 9,
        operators: ['+', '-', '*', '/'],
        operatorCount: 3,
        parentheses: true,
        allowNegative: true,
        fractions: true,
        divisionMode: 'fraction',
        resultMin: -100,
        resultMax: 100,
      },
      '5571b4b5fbd9d44c8e5de6916ec133e1baf74ee17cfed71eb1c6df9e3a967049',
    ],
    [
      {
        seed: 'stream-exact',
        count: 70,
        min: 0,
        max: 50,
        operators: ['+', '-', '/'],
        operatorCount: 3,
        parentheses: true,
      },
      '12ad0eb19af7b1d65b936a7a545a814e67e515e8d2ecd7d5e11d90fed0910dd1',
    ],
    [
      { seed: 'stream-remainder', count: 30, operators: ['/'], operatorCount: 1, divisionMode: 'remainder' },
      '5b371af38ce1e6df4eb00fb96cf669be9529bfb014a58d48a7a0e34f43525d5a',
    ],
  ];
  for (const [options, expected] of baselines) {
    const { questions } = consume(generateWorksheetStream(options));
    const actual = createHash('sha256').update(JSON.stringify(questions)).digest('hex');
    assert.equal(actual, expected, options.seed);
  }
});

test('an already-cancelled generation does not run progress callbacks', () => {
  const controller = new AbortController();
  controller.abort();
  let notifications = 0;
  const iterator = generateWorksheetStream(
    { seed: 'already-cancelled' },
    { signal: controller.signal, onProgress: () => notifications++ },
  );
  assert.throws(() => iterator.next(), code('generation_cancelled'));
  assert.equal(notifications, 0);
  assert.equal(iterator.next().done, true);
});

test('cancellation between pulls closes the generator without producing more questions', () => {
  const controller = new AbortController();
  const progress = [];
  const iterator = generateWorksheetStream(
    { count: 10000, seed: 'cancel-between-pulls' },
    { signal: controller.signal, onProgress: (row) => progress.push(row) },
  );
  assert.equal(iterator.next().value.id, '1');
  controller.abort();
  assert.throws(() => iterator.next(), code('generation_cancelled'));
  assert.equal(progress.at(-1).generated, 1);
  assert.equal(iterator.next().done, true);
});

test('cancellation from progress is checked before yielding the pending question', () => {
  const controller = new AbortController();
  const iterator = generateWorksheetStream(
    { seed: 'cancel-on-progress' },
    {
      signal: controller.signal,
      onProgress: (row) => {
        if (row.generated === 1) controller.abort();
      },
    },
  );
  assert.throws(() => iterator.next(), code('generation_cancelled'));
});

test('an exhausted question space reports partial progress and a bounded failure', () => {
  const progress = [];
  const iterator = generateWorksheetStream(
    { count: 2, seed: 'one-question', min: 0, max: 0, operators: ['+'], operatorCount: 1 },
    { onProgress: (row) => progress.push(row) },
  );
  assert.equal(iterator.next().value.answer, '0');
  assert.throws(
    () => iterator.next(),
    (error) =>
      code('insufficient_unique')(error) &&
      error.details.generated === 1 &&
      error.details.requested === 2 &&
      error.details.attempts <= 501,
  );
  assert.ok(progress.some((row) => row.generated === 1 && row.attempts >= 128));
  assert.equal(iterator.next().done, true);
});

test('consumer callback errors are preserved and not swallowed as candidate rejections', () => {
  const failure = new MathError('division_by_zero', 'consumer callback');
  const iterator = generateWorksheetStream(
    { seed: 'callback-error' },
    {
      onProgress: (row) => {
        if (row.generated === 1) throw failure;
      },
    },
  );
  assert.throws(
    () => iterator.next(),
    (error) => error === failure,
  );
  assert.equal(iterator.next().done, true);
});

test('invalid public stream controls retain an actionable domain error', () => {
  assert.throws(() => generateWorksheetStream({}, { onProgress: true }).next(), code('invalid_options'));
  assert.throws(() => generateWorksheetStream({}, null).next(), code('invalid_options'));
});
