import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorksheet, normalizeOptions } from '@se-lab/core/math';
import {
  TEACHING_PRESETS,
  MAX_MISTAKES,
  MAX_CHALLENGE_RECORDS,
  challengeLimit,
  decodeChallenges,
  decodeMistakes,
  encodeChallenges,
  encodeMistakes,
  filterMistakes,
  mistakeIdentity,
  presetOptions,
  questionDifficulty,
  recordChallenge,
  recordWorksheetResults,
} from '@se-lab/core/learning';

const now = '2026-11-01T08:00:00.000Z';
const later = '2026-11-02T08:00:00.000Z';
const options = normalizeOptions({ count: 2, max: 10, operatorCount: 1, seed: 'learning-test' });
const question = { id: '1', expression: '2 + 3', answer: '5', kind: 'normal', canonical: '(2+3)' };
const worksheet = { options, questions: [question] };
const grade = (correct) => ({ results: [{ id: '1', expected: '5', correct }] });

test('every editable grade preset can generate twenty valid questions', () => {
  assert.equal(TEACHING_PRESETS.length, 7);
  for (const preset of TEACHING_PRESETS) {
    const selected = presetOptions(preset.id);
    const result = generateWorksheet({ ...selected, seed: `preset-${preset.id}` });
    assert.equal(result.questions.length, 20, preset.id);
  }
  const independent = presetOptions('primary-1');
  independent.operators.push('*');
  assert.deepEqual(presetOptions('primary-1').operators, ['+', '-']);
  assert.equal(presetOptions('missing'), null);
});

test('wrong answers merge into a bounded book; retries track mastery and repeated misses', () => {
  const first = recordWorksheetResults([], worksheet, grade(false), now);
  assert.equal(first.length, 1);
  assert.equal(first[0].misses, 1);
  assert.equal(first[0].difficulty, 'basic');
  const repeated = recordWorksheetResults(first, worksheet, grade(false), later);
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].misses, 2);
  assert.equal(repeated[0].firstSeen, now);
  const mastered = recordWorksheetResults(repeated, worksheet, grade(true), later);
  assert.equal(mastered[0].resolved, true);
  assert.equal(recordWorksheetResults(mastered, worksheet, grade(false), later)[0].resolved, false);
  assert.deepEqual(recordWorksheetResults([], worksheet, grade(true), now), []);
});

test('stored wrong-answer data is validated without trusting serialized keys or classifications', () => {
  const book = recordWorksheetResults([], worksheet, grade(false), now);
  assert.deepEqual(decodeMistakes(encodeMistakes(book)).items, book);
  const forged = { ...book[0], key: '__proto__', difficulty: 'advanced' };
  const decoded = decodeMistakes(JSON.stringify({ version: 1, items: [forged] }));
  assert.equal(decoded.items[0].key, 'normal:2+3');
  assert.equal(decoded.items[0].difficulty, 'basic');
  for (const raw of ['{bad', '[]', JSON.stringify({ version: 9, items: book }), 'x'.repeat(1_000_001)]) {
    assert.deepEqual(decodeMistakes(raw), { items: [], recovered: true });
  }
  assert.deepEqual(decodeMistakes(null), { items: [], recovered: false });
  const invalid = { ...book[0], question: { ...question, expression: 'alert(1)' } };
  const partial = decodeMistakes(JSON.stringify({ version: 1, items: [book[0], invalid] }));
  assert.equal(partial.items.length, 1);
  assert.equal(partial.recovered, true);
});

test('a large failed worksheet cannot grow the local wrong-answer book indefinitely', () => {
  const questions = Array.from({ length: MAX_MISTAKES + 20 }, (_, i) => ({
    ...question,
    id: String(i),
    expression: `${i} + 1`,
    answer: String(i + 1),
  }));
  const book = recordWorksheetResults(
    [],
    { options, questions },
    { results: questions.map((q) => ({ id: q.id, expected: q.answer, correct: false })) },
    now,
  );
  assert.equal(book.length, MAX_MISTAKES);
  assert.equal(new Set(book.map((item) => item.key)).size, MAX_MISTAKES);
});

test('operator, difficulty, and mastery filters combine', () => {
  const book = recordWorksheetResults([], worksheet, grade(false), now);
  assert.equal(filterMistakes(book, { operator: '+', difficulty: 'basic', status: 'pending' }).length, 1);
  assert.equal(filterMistakes(book, { operator: '*', difficulty: 'basic' }).length, 0);
  assert.equal(filterMistakes(book, { status: 'resolved' }).length, 0);
  assert.equal(filterMistakes(book, { difficulty: 'advanced' }).length, 0);
});

test('the challenge leaderboard excludes hints, expired rounds, and malformed data', () => {
  const input = {
    id: 'round-1',
    date: now,
    level: 1,
    elapsed: 15_000,
    numbers: [1, 2, 3, 4],
    assisted: false,
  };
  const records = recordChallenge([], input);
  assert.equal(records.length, 1);
  assert.deepEqual(decodeChallenges(encodeChallenges(records)).items, records);
  assert.deepEqual(recordChallenge(records, { ...input, assisted: true }), records);
  assert.deepEqual(recordChallenge(records, { ...input, elapsed: challengeLimit(1) + 1 }), records);
  assert.deepEqual(recordChallenge(records, { ...input, numbers: [1, 2, 3, 999] }), records);
  const ranked = recordChallenge(records, { ...input, id: 'round-2', level: 2, elapsed: 45_000 });
  assert.equal(ranked[0].level, 2);
  assert.equal(recordChallenge(ranked, { ...input, id: 'round-2', level: 2, elapsed: 20_000 }).length, 2);
  assert.equal(decodeChallenges('{broken').recovered, true);
});

test('local storage recovery rejects malformed options, duplicates and invalid question metadata', () => {
  const good = recordWorksheetResults([], worksheet, grade(false), now)[0];
  for (const item of [
    null,
    [],
    {},
    { ...good, options: { impossible: true } },
    { ...good, firstSeen: 'not-a-date' },
    { ...good, question: { ...question, answer: '' } },
    { ...good, misses: -1 },
    { ...good, resolved: 'no' },
  ]) {
    assert.deepEqual(decodeMistakes(JSON.stringify({ version: 1, items: [item] })), {
      items: [],
      recovered: true,
    });
  }
  const duplicated = decodeMistakes(JSON.stringify({ version: 1, items: [good, good] }));
  assert.equal(duplicated.items.length, 1);
  assert.equal(duplicated.recovered, true);
  assert.equal(
    JSON.parse(encodeMistakes(Array.from({ length: MAX_MISTAKES + 1 }, () => good))).items.length,
    MAX_MISTAKES,
  );
  const missingCanonical = { ...good, question: { ...good.question } };
  delete missingCanonical.question.canonical;
  assert.equal(
    decodeMistakes(JSON.stringify({ version: 1, items: [missingCanonical] })).items[0].question.canonical,
    question.expression,
  );
  assert.deepEqual(
    recordWorksheetResults(
      [],
      worksheet,
      { results: [{ id: 'absent', expected: '0', correct: false }] },
      now,
    ),
    [],
  );
  assert.throws(() => recordWorksheetResults([], worksheet, grade(false), 'bad date'), TypeError);
});

test('the explicit difficulty heuristic and notation normalization are predictable', () => {
  assert.equal(mistakeIdentity({ expression: '8 × 3 ÷ 1 − 0', kind: 'normal' }), 'normal:8*3/1-0');
  assert.equal(mistakeIdentity({ expression: '9 / 4', kind: 'remainder' }), 'remainder:9/4');
  for (const update of [{ fractions: true }, { allowNegative: true }, { operatorCount: 3 }, { max: 1001 }])
    assert.equal(questionDifficulty({ ...options, ...update }), 'advanced');
  for (const update of [{ operatorCount: 2 }, { parentheses: true }, { max: 21 }])
    assert.equal(questionDifficulty({ ...options, ...update }), 'intermediate');
  assert.equal(questionDifficulty(options), 'basic');
  const book = recordWorksheetResults([], worksheet, grade(false), now);
  assert.equal(filterMistakes(book).length, 1);
  assert.equal(filterMistakes(book, { operator: 'all', difficulty: 'all', status: 'all' }).length, 1);
  const mastered = recordWorksheetResults(book, worksheet, grade(true), later);
  assert.equal(filterMistakes(mastered, { status: 'resolved' }).length, 1);
});

test('rankings remain bounded and safely recover invalid or repeated persisted results', () => {
  const input = { id: 'base', date: now, level: 1, elapsed: 15_000, numbers: [1, 2, 3, 4], assisted: false };
  let records = [];
  for (let index = 0; index < MAX_CHALLENGE_RECORDS + 5; index++)
    records = recordChallenge(records, { ...input, id: String(index), elapsed: index * 1000 });
  assert.equal(records.length, MAX_CHALLENGE_RECORDS);
  assert.equal(records[0].elapsed, 0);
  assert.equal(JSON.parse(encodeChallenges([...records, input])).items.length, MAX_CHALLENGE_RECORDS);
  for (const invalid of [
    null,
    {},
    { ...input, id: '' },
    { ...input, date: 'bad' },
    { ...input, level: 0 },
    { ...input, elapsed: -1 },
    { ...input, numbers: null },
    { ...input, numbers: [1, 2, 3] },
    { ...input, assisted: true },
  ])
    assert.equal(decodeChallenges(JSON.stringify({ version: 1, items: [invalid] })).items.length, 0);
  const duplicates = decodeChallenges(JSON.stringify({ version: 1, items: [input, input] }));
  assert.equal(duplicates.items.length, 1);
  assert.equal(duplicates.recovered, true);
  assert.equal(challengeLimit(-10), 180_000);
  assert.equal(challengeLimit(100), 60_000);
  assert.equal(challengeLimit(NaN), 180_000);
});
