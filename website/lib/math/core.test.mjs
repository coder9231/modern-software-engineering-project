import test from 'node:test';
import assert from 'node:assert/strict';
import { MathError, evaluateExpression, generateWorksheet, normalizeOptions, gradeWorksheet, solve24, create24Puzzle, check24 } from './core.mjs';

const hasCode = (code) => (error) => error instanceof MathError && error.code === code;

test('shunting-yard respects precedence, left associativity, parentheses and unary signs', () => {
  assert.deepEqual(evaluateExpression('8 - 6 / 3 * 2'), { answer: '4', numerator: '4', denominator: '1', rpn: ['8', '6', '3', '/', '2', '*', '-'] });
  assert.equal(evaluateExpression('(8 - 6) / (3 * 2)').answer, '1/3');
  assert.equal(evaluateExpression('8/4/2').answer, '1');
  assert.deepEqual(evaluateExpression('-(1 + 2) * --3').rpn, ['1', '2', '+', 'u-', '3', 'u-', 'u-', '*']);
  assert.equal(evaluateExpression('-(1 + 2) * --3').answer, '-9');
  assert.equal(evaluateExpression('1/-2').answer, '-1/2');
  assert.equal(evaluateExpression('（2＋3）'.replace('＋', '+') + '×4−6÷2').answer, '17');
});

test('fractions and decimal answers stay exact, reduced and serializable', () => {
  assert.equal(evaluateExpression('1/3 + 1/6').answer, '1/2');
  assert.equal(evaluateExpression('0.1 + 0.2').answer, '3/10');
  assert.equal(evaluateExpression('.5 + 0.25').answer, '3/4');
  assert.equal(evaluateExpression('1 / (-2)').answer, '-1/2');
  assert.equal(evaluateExpression('999999999 * 999999999').answer, '999999998000000001');
  assert.doesNotThrow(() => JSON.stringify(evaluateExpression('1/3')));
});

test('parser rejects malformed syntax, injection, excessive tokens and division by zero', () => {
  for (const expression of ['', ' ', '1 +', '()', '(1+2', '1+2)', '2(3)', '1 2', '1 ** 2', '1e3', 'NaN', 'Math.random()', 'globalThis.x=1', 'alert(1)', '1;2', '1000000000', '1'.repeat(257), '1+'.repeat(13) + '1'])
    assert.throws(() => evaluateExpression(expression), hasCode('invalid_expression'), expression);
  assert.throws(() => evaluateExpression('1/(2-2)'), hasCode('division_by_zero'));
  assert.throws(() => evaluateExpression('-'.repeat(64) + '1'), hasCode('invalid_expression'));
});

test('worksheet seeds replay exactly and generation normalizes options without mutating them', () => {
  const options = { seed: 'course-2026', count: 30, operators: ['+', '-'] };
  const first = generateWorksheet(options), second = generateWorksheet(options);
  assert.deepEqual(first, second);
  assert.deepEqual(options, { seed: 'course-2026', count: 30, operators: ['+', '-'] });
  assert.notDeepEqual(first.questions, generateWorksheet({ ...options, seed: 'another-seed' }).questions);
  assert.equal(first.options.operatorCount, 2);
  for (const question of first.questions) {
    const result = evaluateExpression(question.expression);
    assert.equal(question.answer, result.answer);
    assert.ok(Number(result.numerator) >= 0 && Number(result.numerator) <= 100);
    assert.equal(result.rpn.filter((v) => ['+', '-'].includes(v)).length, 2);
  }
});

test('generates 10000 structurally unique default expressions with correct bounded answers', () => {
  const sheet = generateWorksheet({ count: 10000, seed: 'ten-thousand-unique' });
  assert.equal(sheet.questions.length, 10000);
  assert.equal(new Set(sheet.questions.map((q) => q.canonical)).size, 10000);
  assert.equal(new Set(sheet.questions.map((q) => q.expression)).size, 10000);
  for (const question of sheet.questions) {
    assert.equal(evaluateExpression(question.expression).answer, question.answer);
    assert.ok(Number(question.answer) >= 0 && Number(question.answer) <= 100);
    const intermediates = [];
    for (const token of evaluateExpression(question.expression).rpn) {
      if (token === '+' || token === '-') {
        const b = intermediates.pop(), a = intermediates.pop();
        const value = token === '+' ? a + b : a - b;
        assert.ok(value >= 0, question.expression);
        intermediates.push(value);
      } else intermediates.push(Number(token));
    }
  }
});

test('commutative and associative additions are structurally deduplicated', () => {
  // Two possible sums: 0+0 and 0+1. 1+0 is the same question, and 1+1 is out of bounds.
  const small = generateWorksheet({ count: 2, min: 0, max: 1, operators: ['+'], operatorCount: 1, resultMax: 1, seed: 'dedup' });
  assert.deepEqual(new Set(small.questions.map((q) => q.answer)), new Set(['0', '1']));
  assert.throws(() => generateWorksheet({ count: 3, min: 0, max: 1, operators: ['+'], operatorCount: 1, resultMax: 1, seed: 'dedup' }), hasCode('insufficient_unique'));
  const associative = generateWorksheet({ count: 4, min: 0, max: 1, operators: ['+'], operatorCount: 2, parentheses: true, seed: 'assoc' });
  assert.deepEqual(new Set(associative.questions.map((q) => q.answer)), new Set(['0', '1', '2', '3']));
  assert.throws(() => generateWorksheet({ count: 5, min: 0, max: 1, operators: ['+'], operatorCount: 2, parentheses: true, seed: 'assoc' }), hasCode('insufficient_unique'));
});

test('negative intermediate results are rejected when negative results are disabled', () => {
  assert.throws(() => generateWorksheet({ count: 1, min: 1, max: 1, operators: ['-'], operatorCount: 3, parentheses: false, resultMin: -10, resultMax: 10, seed: 'negative' }), hasCode('insufficient_unique'));
  const sheet = generateWorksheet({ count: 1, min: 1, max: 1, operators: ['-'], operatorCount: 3, allowNegative: true, resultMin: -10, resultMax: 10, seed: 'negative' });
  assert.equal(sheet.questions[0].answer, '-2');
});

test('fraction operands, negative operands and parentheses are evaluated using exact arithmetic', () => {
  const sheet = generateWorksheet({ count: 25, min: -8, max: 8, fractions: true, allowNegative: true, parentheses: true, operators: ['+', '-', '*', '/'], operatorCount: 3, divisionMode: 'fraction', resultMin: -20, resultMax: 20, seed: 'fractions' });
  assert.ok(sheet.questions.some((q) => q.answer.includes('/')));
  for (const question of sheet.questions) assert.equal(evaluateExpression(question.expression).answer, question.answer);
  assert.equal(normalizeOptions({ fractions: true }).divisionMode, 'fraction');
});

test('exact division generator emits no fractional division results and zero divisor is excluded', () => {
  const sheet = generateWorksheet({ count: 20, min: 0, max: 20, operators: ['/'], operatorCount: 1, divisionMode: 'exact', seed: 'exact' });
  for (const question of sheet.questions) {
    assert.equal(evaluateExpression(question.expression).denominator, '1');
    assert.ok(!question.expression.endsWith('/ 0'));
  }
  assert.throws(() => generateWorksheet({ count: 1, min: 0, max: 0, operators: ['/'], operatorCount: 1, seed: 'zero' }), hasCode('insufficient_unique'));
});

test('constructive exact division fills feasible low-acceptance configurations without zero padding', () => {
  for (const count of [300, 1000]) {
    const options = { count, operators: ['/', '*'], operatorCount: 4, parentheses: true, min: 0, max: 100, seed: 'edge-config-review' };
    const sheet = generateWorksheet(options);
    assert.equal(sheet.questions.length, count);
    assert.equal(new Set(sheet.questions.map((q) => q.canonical)).size, count);
    assert.deepEqual(sheet, generateWorksheet(options));
    assert.ok(sheet.questions.filter((q) => q.answer !== '0').length >= count * 0.8);
    assert.ok(new Set(sheet.questions.map((q) => q.answer)).size >= 15);
    assert.ok(sheet.questions.some((q) => q.expression.includes('/')));
    assert.ok(sheet.questions.some((q) => q.expression.includes('*')));
    for (const question of sheet.questions) {
      const stack = [];
      const evaluated = evaluateExpression(question.expression);
      assert.equal(evaluated.answer, question.answer);
      assert.equal(evaluated.denominator, '1');
      assert.ok(Number(question.answer) >= 0 && Number(question.answer) <= 100);
      assert.equal(evaluated.rpn.filter((token) => token === '*' || token === '/').length, 4);
      for (const token of evaluated.rpn) {
        if (token === '*' || token === '/') {
          const b = stack.pop(), a = stack.pop();
          if (token === '/') { assert.notEqual(b, 0); assert.equal(a % b, 0); }
          stack.push(token === '/' ? a / b : a * b);
        } else {
          assert.ok(Number(token) >= 0 && Number(token) <= 100);
          stack.push(Number(token));
        }
      }
    }
  }
});

test('remainder mode has real quotient/remainder answers and can be graded', () => {
  const sheet = generateWorksheet({ count: 20, min: 0, max: 10, operators: ['/'], operatorCount: 1, divisionMode: 'remainder', seed: 'remainders' });
  for (const question of sheet.questions) {
    assert.equal(question.kind, 'remainder');
    const [a, b] = question.expression.split('/').map(Number);
    assert.equal(question.answer, `${Math.floor(a / b)} R ${a % b}`);
  }
  const report = gradeWorksheet({ questions: [{ id: 'a', expression: '7 / 3', kind: 'remainder' }, { id: 'b', expression: '8 / 4', kind: 'remainder' }, { id: 'c', expression: '7 / 3', kind: 'remainder' }], answers: { a: '2余1', b: '2', c: '2 R 2' } });
  assert.equal(report.correct, 2);
  assert.equal(report.results[0].expected, '2 R 1');
  assert.throws(() => generateWorksheet({ divisionMode: 'remainder' }), hasCode('invalid_options'));
  assert.throws(() => generateWorksheet({ divisionMode: 'remainder', operators: ['/'], operatorCount: 1, allowNegative: true }), hasCode('invalid_options'));
});

test('invalid or impossible configurations fail with a bounded, actionable error', () => {
  for (const options of [{ count: 0 }, { count: 10001 }, { count: 1.5 }, { min: 2, max: 1 }, { min: -1 }, { min: 1000001 }, { resultMin: 2, resultMax: 1 }, { operators: [] }, { operators: ['+', '+'] }, { operators: ['%'] }, { operatorCount: 5 }, { denominatorMax: 1 }, { parentheses: 1 }, { fractions: null }, { divisionMode: 'decimal' }, { seed: '' }, { seed: '\n' }, { count: 10, unknown: 2 }])
    assert.throws(() => generateWorksheet(options), hasCode('invalid_options'), JSON.stringify(options));
  assert.throws(() => generateWorksheet({ count: 10000, min: 1, max: 1, operators: ['+'], seed: 'impossible' }), (error) => hasCode('insufficient_unique')(error) && error.details.generated === 1 && error.details.attempts < 5000);
});

test('grading accepts equivalent rational answers, records missing/invalid answers, and recomputes expected values', () => {
  const questions = [
    { id: '1', expression: '1/4+1/4', kind: 'normal', answer: '999' },
    { id: '2', expression: '2+2', kind: 'normal' },
    { id: '3', expression: '3+3', kind: 'normal' },
    { id: '4', expression: '4+4', kind: 'normal' },
  ];
  const report = gradeWorksheet({ questions, answers: { 1: '0.5', 2: '2*2', 3: '', 4: 'eval(8)' } });
  assert.equal(report.total, 4);
  assert.equal(report.answered, 3);
  assert.equal(report.correct, 2);
  assert.equal(report.accuracy, 0.5);
  assert.equal(report.results[0].expected, '1/2');
  assert.equal(report.results[2].message, '未作答');
  assert.equal(report.results[3].message, '答案格式无效');
  assert.equal(gradeWorksheet({ questions: questions.slice(0, 1), answers: ['2/4'] }).correct, 1);
  assert.throws(() => gradeWorksheet({ questions: [...questions, questions[0]], answers: {} }), hasCode('invalid_questions'));
  assert.throws(() => gradeWorksheet({ questions, answers: { 1: 0.5 } }), hasCode('invalid_answers'));
});

test('large reduced fraction answers remain gradeable without relaxing exercise input limits', () => {
  const sheet = generateWorksheet({ count: 100, seed: 'large-fraction-answer', operators: ['+', '-', '*', '/'], fractions: true, parentheses: true, operatorCount: 4 });
  const grade = gradeWorksheet({ questions: sheet.questions, answers: Object.fromEntries(sheet.questions.map((q) => [q.id, q.answer])) });
  assert.equal(grade.correct, 100);
  const expression = '1 / (999999999 * 999999999)';
  const answer = evaluateExpression(expression).answer;
  assert.equal(gradeWorksheet({ questions: [{ id: 'long', expression }], answers: { long: answer } }).correct, 1);
  assert.equal(gradeWorksheet({ questions: [{ id: 'long', expression }], answers: { long: answer + ' + 0' } }).correct, 0);
});

test('24-point solver reuses exact fraction arithmetic and reports unsolvable inputs', () => {
  const answer = solve24([3, 3, 8, 8]);
  assert.equal(typeof answer, 'string');
  assert.equal(check24([3, 3, 8, 8], answer).correct, true);
  assert.equal(evaluateExpression(answer).answer, '24');
  assert.equal(solve24([1, 1, 1, 1]), null);
  assert.throws(() => solve24([0, 1, 2, 3]), hasCode('invalid_numbers'));
  assert.throws(() => solve24([1, 2, 3]), hasCode('invalid_numbers'));
});

test('24-point checker demands the four exact integers once and disallows manufactured numbers', () => {
  assert.equal(check24([1, 2, 3, 4], '(1+2+3)*4').correct, true);
  assert.equal(check24([3, 3, 8, 8], '8/(3-8/3)').correct, true);
  for (const expression of ['24', '1*2*3*4+0', '1*2*3*4*1', '1*2*3*4+3-3', '-1*-2*3*4', '1.0*2*3*4', '1*2*3*4+alert(1)'])
    assert.equal(check24([1, 2, 3, 4], expression).correct, false, expression);
  assert.equal(check24([1, 2, 3, 4], '1+2+3+4').answer, '10');
});

test('seeded 24-point puzzles replay and always have a verifiable solution', () => {
  assert.deepEqual(create24Puzzle({ seed: 'game-24' }), create24Puzzle({ seed: 'game-24' }));
  for (let i = 0; i < 20; i++) {
    const puzzle = create24Puzzle({ seed: `game-${i}` });
    assert.equal(check24(puzzle.numbers, solve24(puzzle.numbers)).correct, true);
  }
});
