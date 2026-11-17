'use client';

import { useState } from 'react';
import type { CalculationExplanation } from '@se-lab/core/math';

export default function MathStepExplanation({
  explanation,
  language,
}: {
  explanation: CalculationExplanation;
  language: 'zh' | 'en';
}) {
  const [revealed, setRevealed] = useState(0);
  const [hinted, setHinted] = useState(false);
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const next = explanation.steps[revealed];
  const complete = revealed === explanation.steps.length;
  const instruction =
    next?.operation === 'remainder'
      ? t(
          '求整数商，再计算余数；余数必须小于除数。',
          'Find the integer quotient and remainder; the remainder must be smaller than the divisor.',
        )
      : next?.operation === 'neg'
        ? t('先算括号内的值，再取相反数。', 'Evaluate the inner value, then take its opposite.')
        : t(
            '按括号和优先级，计算下面的子式；减法和除法保持左右顺序。',
            'Following parentheses and precedence, calculate this part; preserve operand order for subtraction and division.',
          );
  return (
    <div className="math-step-explanation">
      <p>
        {t(
          '先括号，再乘除，最后加减；同级运算从左到右。下方补充括号以标明运算结构。',
          'Parentheses first, then multiplication and division, then addition and subtraction. Equal-precedence operations run left to right. Added parentheses show the structure.',
        )}
      </p>
      <div className="math-step-current" aria-label={t('当前算式', 'Current expression')} aria-live="polite">
        {revealed ? explanation.steps[revealed - 1].after : explanation.initial}
      </div>
      {next && hinted && (
        <aside className="math-step-hint" aria-live="polite">
          <p>{instruction}</p>
          <strong>{next.calculation}</strong>
        </aside>
      )}
      <div className="math-step-actions">
        {next &&
          (!hinted ? (
            <button className="math-btn math-btn-soft" onClick={() => setHinted(true)}>
              {t('提示下一步', 'Hint for next step')}
            </button>
          ) : (
            <button
              className="math-btn math-btn-primary"
              onClick={() => {
                setRevealed(revealed + 1);
                setHinted(false);
              }}
            >
              {t('显示这一步', 'Reveal this step')}
            </button>
          ))}
        {!complete && (
          <button
            className="math-btn math-btn-soft"
            onClick={() => {
              setRevealed(explanation.steps.length);
              setHinted(false);
            }}
          >
            {t('显示全部步骤', 'Reveal all steps')}
          </button>
        )}
        {revealed > 0 && (
          <button
            className="math-btn math-btn-soft"
            onClick={() => {
              setRevealed(0);
              setHinted(false);
            }}
          >
            {t('重新提示', 'Start again')}
          </button>
        )}
      </div>
      <p aria-live="polite">
        {t(
          `已展开 ${revealed} / ${explanation.steps.length} 步`,
          `${revealed} / ${explanation.steps.length} steps revealed`,
        )}
      </p>
      <ol className="math-calculation-steps">
        {explanation.steps.slice(0, revealed).map((step, index) => (
          <li key={index}>
            <strong>
              {step.calculation} = {step.result}
            </strong>
            <p>
              {t('算式变为：', 'Expression becomes: ')}
              {step.after}
            </p>
            {step.check && (
              <p>
                {t('验算：', 'Check: ')}
                {step.check}
              </p>
            )}
          </li>
        ))}
      </ol>
      {complete && (
        <p className="math-step-answer">
          {t('最终结果：', 'Final result: ')}
          <b>{explanation.answer}</b>
        </p>
      )}
      <details className="math-step-rpn">
        <summary>{t('查看计算原理', 'How the evaluator works')}</summary>
        <code>RPN: {explanation.rpn.join(' ')}</code>
        <p>
          {t(
            '将算式转为逆波兰表达式后，按栈顺序精确计算。所有步骤复用同一套整数分子、分母运算。',
            'The expression is converted to reverse Polish notation and evaluated with a stack. Every step uses the same exact rational arithmetic.',
          )}
        </p>
      </details>
    </div>
  );
}
