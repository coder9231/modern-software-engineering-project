import {
  MathError, normalizeOptions, generateWorksheet, gradeWorksheet,
  evaluateExpression, create24Puzzle, check24, solve24,
} from './math/core.mjs';
import { HttpError, readJsonRequest } from './code-count-service.mjs';

export { readJsonRequest };
export const MATH_LIMITS = Object.freeze({ maxQuestions: 10_000 });
const plainObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function fail(message, code = 'invalid_request') { throw new HttpError(code, message); }
function object(value, allowed, label = '请求') {
  if (!plainObject(value)) fail(`${label}须为对象。`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${label}包含未知字段。`);
  return value;
}
function text(value, label, maximum = 256) {
  if (typeof value !== 'string' || !value.length || value.length > maximum || value.includes('\0')) {
    fail(`${label}须为 1–${maximum} 个字符。`);
  }
  return value;
}

export function getMathConfig(environment = globalThis.process?.env ?? {}) {
  const defaults = normalizeOptions({ seed: 'se-lab-default' });
  delete defaults.seed;
  return {
    defaults,
    limits: { ...MATH_LIMITS },
    rules: [
      '默认每题 2 个运算符，操作数及答案为 0～100 的整数，支持自定义数量、运算符和范围。',
      '先用调度场算法转为逆波兰表达式，再使用整数分子、分母精确求值；不会执行输入内容。',
      '按算式结构去重，加法和乘法的交换、结合变形视为重复；单次最多生成 10000 道题。',
      '固定随机种子可以复现同一套题；在尝试上限内未找到所需题量时返回错误，不以重复题补足。',
      '关闭负数时不允许负数中间结果；除法可选择整除、分数或独立的带余数除法。',
      '批改根据算式重新计算标准答案；分数及等值小数按精确数值比较，带余数答案使用“商 R 余数”。',
      '24 点要求给定的 4 个整数各使用一次，仅允许四则运算和括号。',
    ],
    ocr: {
      configured: ['OPENAI_API_KEY', 'OCR_ACCESS_TOKEN'].every((name) => typeof environment[name] === 'string' && Boolean(environment[name].trim())),
      provider: 'openai',
      requiresAccessCode: true,
    },
  };
}

export function generateMathWorksheet(payload) {
  object(payload, ['options']);
  return generateWorksheet(payload.options ?? {});
}

export function gradeMathWorksheet(payload) {
  object(payload, ['questions', 'answers']);
  if (!Array.isArray(payload.questions) || !payload.questions.length || payload.questions.length > MATH_LIMITS.maxQuestions) {
    fail('批改题目须为 1–10000 道。', 'invalid_questions');
  }
  const ids = new Set();
  const questions = payload.questions.map((question) => {
    object(question, ['id', 'expression', 'kind', 'answer', 'canonical'], '题目');
    const id = text(question.id, '题目编号', 64);
    if (/[\u0000-\u001f\u007f]/u.test(id) || ids.has(id)) fail('题目编号须唯一且不能包含控制字符。', 'invalid_questions');
    ids.add(id);
    const expression = text(question.expression, '算式');
    if (!['normal', 'remainder'].includes(question.kind)) fail('题目类型须为 normal 或 remainder。', 'invalid_questions');
    if (question.answer !== undefined) text(question.answer, '附带答案');
    if (question.canonical !== undefined) text(question.canonical, '算式结构', 1024);
    // Client answers and fingerprints are display metadata, never a grading authority.
    return { id, expression, kind: question.kind };
  });
  if (!plainObject(payload.answers) || Object.keys(payload.answers).length > MATH_LIMITS.maxQuestions) {
    fail('答案须为题号到答案文本的对象。', 'invalid_answers');
  }
  const answers = Object.create(null);
  for (const [id, answer] of Object.entries(payload.answers)) {
    if (!ids.has(id)) fail('答案包含不存在的题号。', 'invalid_answers');
    if (typeof answer !== 'string' || answer.length > 256 || answer.includes('\0')) fail('单题答案须为不超过 256 个字符的文本。', 'invalid_answers');
    answers[id] = answer;
  }
  return gradeWorksheet({ questions, answers });
}

export function evaluateMathExpression(payload) {
  object(payload, ['expression']);
  return evaluateExpression(text(payload.expression, '算式'));
}

export function play24(payload) {
  if (!plainObject(payload)) fail('请求须为对象。');
  if (payload.action === 'new') {
    object(payload, ['action', 'seed']);
    return create24Puzzle(payload.seed === undefined ? {} : { seed: payload.seed });
  }
  if (payload.action === 'check') {
    object(payload, ['action', 'numbers', 'expression']);
    return check24(payload.numbers, text(payload.expression, '算式'));
  }
  if (payload.action === 'hint') {
    object(payload, ['action', 'numbers']);
    return { solution: solve24(payload.numbers) };
  }
  fail('24 点操作须为 new、check 或 hint。');
}

export function mathErrorJSON(error) {
  const known = error instanceof MathError || error instanceof HttpError;
  return Response.json({ error: {
    code: known ? error.code : 'internal_error',
    message: known ? error.message : '数学服务暂时不可用，请稍后重试。',
  } }, {
    status: error instanceof HttpError ? error.status : error instanceof MathError ? 400 : 500,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const OPERATIONS = Object.freeze({
  generate: generateMathWorksheet,
  grade: gradeMathWorksheet,
  evaluate: evaluateMathExpression,
  '24': play24,
});

/** The API and tests share the same bounded JSON and error boundary. */
export async function handleMathRequest(request, operation) {
  try {
    const handler = OPERATIONS[operation];
    if (!Object.hasOwn(OPERATIONS, operation)) throw new Error('Unknown mathematical operation');
    return Response.json(handler(await readJsonRequest(request)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return mathErrorJSON(error); }
}
