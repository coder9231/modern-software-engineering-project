import test from 'node:test';
import assert from 'node:assert/strict';
import { explainExpression, evaluateExpression, generateWorksheet } from '@se-lab/core/math';

test('explains precedence and parentheses in exact evaluation order', () => {
  const normal = explainExpression('8 + 12 ÷ 3');
  assert.equal(normal.initial, '8 + (12 ÷ 3)');
  assert.deepEqual(
    normal.steps.map((step) => [step.calculation, step.result, step.after]),
    [
      ['12 ÷ 3', '4', '8 + 4'],
      ['8 + 4', '12', '12'],
    ],
  );
  const bracketed = explainExpression('(8 + 12) / (5 - 1)');
  assert.deepEqual(
    bracketed.steps.map((step) => step.result),
    ['20', '4', '5'],
  );
  assert.equal(bracketed.steps[0].after, '20 ÷ (5 - 1)');
  assert.equal(bracketed.answer, '5');
});

test('keeps subtraction/division order, unary signs and rational results exact', () => {
  assert.deepEqual(
    explainExpression('20 / 2 / 5').steps.map((s) => s.result),
    ['10', '2'],
  );
  assert.deepEqual(
    explainExpression('10 - 3 - 2').steps.map((s) => s.result),
    ['7', '5'],
  );
  const signed = explainExpression('-(2 + 3) * -2');
  assert.deepEqual(
    signed.steps.map((s) => s.operation),
    ['+', 'neg', 'neg', '*'],
  );
  assert.equal(signed.answer, '10');
  assert.equal(explainExpression('1/3 + 1/6').answer, '1/2');
  assert.equal(explainExpression('0.1 + 0.2').answer, '3/10');
  assert.equal(explainExpression('+4').steps.length, 0);
  assert.equal(explainExpression('42').answer, '42');
});

test('remainder explanations match grading notation and include a check', () => {
  const result = explainExpression('7 / 3', 'remainder');
  assert.equal(result.answer, '2 R 1');
  assert.equal(result.steps[0].check, '3 × 2 + 1 = 7');
  assert.equal(explainExpression('0 / 3', 'remainder').answer, '0 R 0');
  assert.throws(() => explainExpression('1+2', 'remainder'));
  assert.throws(() => explainExpression('7/0', 'remainder'));
  assert.throws(() => explainExpression('1+2', 'unknown'));
});

test('rejects the same invalid expressions as the evaluator', () => {
  for (const source of ['1 / 0', '(1+2', 'fetch(1)', '2 ** 3', ''])
    assert.throws(() => explainExpression(source));
});

test('generated worksheets retain answers and deterministic output after tracing', () => {
  const options = {
    count: 40,
    seed: 'trace-regression',
    operators: ['+', '-', '*', '/'],
    parentheses: true,
    allowNegative: true,
    divisionMode: 'fraction',
  };
  const worksheet = generateWorksheet(options);
  for (const question of worksheet.questions) {
    const report = explainExpression(question.expression);
    assert.equal(report.answer, question.answer);
    assert.equal(report.steps.at(-1).after, question.answer);
    for (const step of report.steps) {
      assert.equal(evaluateExpression(step.before).answer, report.answer);
      assert.equal(evaluateExpression(step.after).answer, report.answer);
      assert.equal(evaluateExpression(step.calculation).answer, step.result);
    }
  }
  assert.deepEqual(generateWorksheet(options), worksheet);
});
