/** Exact arithmetic shared by the browser, API, worksheet generator and 24-point game. */
export class MathError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MathError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const fail = (code, message, details) => { throw new MathError(code, message, details); };
const abs = (n) => n < 0n ? -n : n;
function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function rational(n, d = 1n) {
  if (d === 0n) fail('division_by_zero', '除数不能为零。');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
const format = (v) => v.d === 1n ? String(v.n) : `${v.n}/${v.d}`;
const equal = (a, b) => a.n === b.n && a.d === b.d;
function operate(op, a, b) {
  switch (op) {
    case '+': return rational(a.n * b.d + b.n * a.d, a.d * b.d);
    case '-': return rational(a.n * b.d - b.n * a.d, a.d * b.d);
    case '*': return rational(a.n * b.n, a.d * b.d);
    case '/': return rational(a.n * b.d, a.d * b.n);
    default: return fail('invalid_expression', '不支持的运算符。');
  }
}
function numberValue(text) {
  if (!text.includes('.')) return rational(BigInt(text));
  const [whole, fractional] = text.split('.');
  return rational(BigInt((whole || '0') + fractional), 10n ** BigInt(fractional.length));
}

const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, 'u+': 3, 'u-': 3 };
function tokenize(expression) {
  if (typeof expression !== 'string' || expression.length === 0 || expression.length > 256)
    fail('invalid_expression', '算式须为 1–256 个字符。');
  const text = expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('（', '(').replaceAll('）', ')');
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const c = text[index];
    if (/\s/u.test(c)) { index++; continue; }
    if ('+-*/()'.includes(c)) { tokens.push({ type: c, text: c }); index++; }
    else {
      const match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(text.slice(index));
      if (!match) fail('invalid_expression', '算式仅支持数字、四则运算符及括号。');
      if (match[0].replace('.', '').length > 9) fail('invalid_expression', '单个数字最多包含 9 位数字。');
      tokens.push({ type: 'number', text: match[0] });
      index += match[0].length;
    }
    if (tokens.length > 64) fail('invalid_expression', '算式最多包含 64 个记号。');
  }
  if (tokens.length === 0) fail('invalid_expression', '请输入算式。');
  return tokens;
}

/** Dijkstra's shunting-yard algorithm: infix tokens -> reverse Polish notation. */
function parse(expression) {
  const tokens = tokenize(expression);
  const output = [], stack = [];
  let operandExpected = true, binaryCount = 0, unaryCount = 0;
  for (const token of tokens) {
    if (token.type === 'number') {
      if (!operandExpected) fail('invalid_expression', '数字之间缺少运算符。');
      output.push(token.text); operandExpected = false;
    } else if (token.type === '(') {
      if (!operandExpected) fail('invalid_expression', '括号前缺少运算符。');
      stack.push('('); operandExpected = true;
    } else if (token.type === ')') {
      if (operandExpected) fail('invalid_expression', '括号内缺少操作数。');
      while (stack.length && stack.at(-1) !== '(') output.push(stack.pop());
      if (stack.pop() !== '(') fail('invalid_expression', '左右括号不匹配。');
      operandExpected = false;
    } else {
      let op = token.type;
      if (operandExpected) {
        if (op !== '+' && op !== '-') fail('invalid_expression', '运算符前缺少操作数。');
        op = `u${op}`; unaryCount++;
      } else {
        binaryCount++;
        if (binaryCount > 12) fail('invalid_expression', '算式最多包含 12 个二元运算符。');
      }
      const rightAssociative = op.startsWith('u');
      while (stack.length && stack.at(-1) !== '(' &&
        (precedence[stack.at(-1)] > precedence[op] || (!rightAssociative && precedence[stack.at(-1)] === precedence[op]))) output.push(stack.pop());
      stack.push(op); operandExpected = true;
    }
  }
  if (operandExpected) fail('invalid_expression', '算式末尾缺少操作数。');
  while (stack.length) {
    const op = stack.pop();
    if (op === '(') fail('invalid_expression', '左右括号不匹配。');
    output.push(op);
  }
  return { tokens, rpn: output, binaryCount, unaryCount };
}

function evaluateParsed(parsed, constraints) {
  const stack = [];
  for (const token of parsed.rpn) {
    if (token === 'u-' || token === 'u+') {
      const a = stack.pop();
      if (!a) fail('invalid_expression', '缺少操作数。');
      const v = token === 'u-' ? rational(-a.value.n, a.value.d) : a.value;
      if (constraints && !constraints.allowNegative && v.n < 0n) fail('negative_intermediate', '不允许出现负数。');
      stack.push({ value: v, node: token === 'u-' ? { op: 'neg', child: a.node } : a.node });
    } else if (Object.hasOwn(precedence, token)) {
      const b = stack.pop(), a = stack.pop();
      if (!a || !b) fail('invalid_expression', '缺少操作数。');
      const value = operate(token, a.value, b.value);
      if (constraints && !constraints.allowNegative && value.n < 0n) fail('negative_intermediate', '不允许负数中间结果。');
      if (constraints?.divisionMode === 'exact' && token === '/' && value.d !== 1n) fail('non_exact_division', '当前配置要求除法整除。');
      stack.push({ value, node: { op: token, left: a.node, right: b.node } });
    } else {
      const value = numberValue(token);
      stack.push({ value, node: { op: 'number', value } });
    }
  }
  if (stack.length !== 1) fail('invalid_expression', '算式不完整。');
  return stack[0];
}

export function evaluateExpression(expression) {
  const parsed = parse(expression);
  const { value } = evaluateParsed(parsed);
  return { answer: format(value), numerator: String(value.n), denominator: String(value.d), rpn: parsed.rpn };
}

function canonical(node) {
  if (node.op === 'number') return `n:${format(node.value)}`;
  if (node.op === 'neg') return `neg(${canonical(node.child)})`;
  if (node.op === '+' || node.op === '*') {
    const children = [];
    const collect = (child) => {
      if (child.op === node.op) { collect(child.left); collect(child.right); }
      else children.push(canonical(child));
    };
    collect(node.left); collect(node.right);
    return `${node.op}(${children.sort().join(',')})`;
  }
  return `${node.op}(${canonical(node.left)},${canonical(node.right)})`;
}

function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_options', `${name}须为对象。`);
}
function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('invalid_options', `${name}须为 ${min}–${max} 之间的整数。`);
  return value;
}
function boolean(value, name) {
  if (typeof value !== 'boolean') fail('invalid_options', `${name}须为布尔值。`);
  return value;
}
function seedValue(seed) {
  if (seed !== undefined) {
    if (typeof seed !== 'string' || seed.length === 0 || seed.length > 64 || /[\u0000-\u001f\u007f]/u.test(seed)) fail('invalid_options', '随机种子须为 1–64 个可见字符。');
    return seed;
  }
  const random = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(random);
  else { random[0] = Math.floor(Math.random() * 0x100000000); random[1] = Math.floor(Math.random() * 0x100000000); }
  return Array.from(random, (v) => v.toString(16).padStart(8, '0')).join('');
}
function randomSource(seed) {
  let state = 2166136261;
  for (const c of seed) { state ^= c.codePointAt(0); state = Math.imul(state, 16777619); }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let v = Math.imul(state ^ state >>> 15, 1 | state);
    v ^= v + Math.imul(v ^ v >>> 7, 61 | v);
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  };
}

export function normalizeOptions(options = {}) {
  record(options, '配置');
  const allowed = new Set(['count', 'min', 'max', 'operators', 'operatorCount', 'parentheses', 'allowNegative', 'fractions', 'divisionMode', 'resultMin', 'resultMax', 'denominatorMax', 'seed']);
  if (Object.keys(options).some((key) => !allowed.has(key))) fail('invalid_options', '包含未知的出题配置。');
  if (Object.values(options).some((value) => value === null)) fail('invalid_options', '配置不能为 null。');
  const result = {
    count: integer(options.count ?? 20, '题目数量', 1, 10000),
    min: integer(options.min ?? 0, '最小操作数', -1000000, 1000000),
    max: integer(options.max ?? 100, '最大操作数', -1000000, 1000000),
    operators: options.operators ?? ['+', '-'],
    operatorCount: integer(options.operatorCount ?? 2, '运算符数量', 1, 4),
    parentheses: boolean(options.parentheses ?? false, '括号开关'),
    allowNegative: boolean(options.allowNegative ?? false, '负数开关'),
    fractions: boolean(options.fractions ?? false, '分数开关'),
    divisionMode: options.divisionMode ?? 'exact',
    resultMin: integer(options.resultMin ?? 0, '最小答案', -1000000000, 1000000000),
    resultMax: integer(options.resultMax ?? 100, '最大答案', -1000000000, 1000000000),
    denominatorMax: integer(options.denominatorMax ?? 12, '最大分母', 2, 12),
    seed: seedValue(options.seed),
  };
  if (result.min > result.max || result.resultMin > result.resultMax) fail('invalid_options', '最小值不能大于最大值。');
  if (!Array.isArray(result.operators) || result.operators.length < 1 || result.operators.length > 4 || result.operators.some((op) => !['+', '-', '*', '/'].includes(op)) || new Set(result.operators).size !== result.operators.length)
    fail('invalid_options', '请选择不重复的四则运算符。');
  result.operators = [...result.operators];
  if (!['exact', 'fraction', 'remainder'].includes(result.divisionMode)) fail('invalid_options', '除法模式无效。');
  if (!result.allowNegative && result.min < 0) fail('invalid_options', '关闭负数时，操作数不能为负。');
  if (result.divisionMode === 'remainder' && (result.operators.length !== 1 || result.operators[0] !== '/' || result.operatorCount !== 1 || result.fractions || result.min < 0 || result.allowNegative))
    fail('invalid_options', '余数模式仅支持非负整数的单次除法，请仅选除号、1 个运算符，并关闭分数和负数。');
  // A literal fraction is itself division; exact mode would reject the literal before it can be an operand.
  if (result.fractions && result.divisionMode === 'exact') result.divisionMode = 'fraction';
  return result;
}

function inBounds(value, options) {
  return value.n >= BigInt(options.resultMin) * value.d && value.n <= BigInt(options.resultMax) * value.d;
}
function makeExpression(options, random) {
  const randint = (low, high) => low + Math.floor(random() * (high - low + 1));
  const numbers = Array.from({ length: options.operatorCount + 1 }, () => {
    if (options.fractions) {
      const d = randint(2, options.denominatorMax);
      // Bounds describe the value of each operand, rather than its numerator.
      const n = randint(options.min * d, options.max * d);
      const v = rational(BigInt(n), BigInt(d));
      return v.d === 1n ? (v.n < 0n ? `(${v.n})` : String(v.n)) : `(${v.n}/${v.d})`;
    }
    const n = randint(options.min, options.max);
    return n < 0 ? `(${n})` : String(n);
  });
  const operators = Array.from({ length: options.operatorCount }, () => options.operators[randint(0, options.operators.length - 1)]);
  if (!options.parentheses) return numbers.map((n, i) => i === 0 ? n : `${operators[i - 1]} ${n}`).join(' ');
  const tree = (start, end) => {
    if (end - start === 1) return numbers[start];
    const split = randint(start + 1, end - 1);
    return `(${tree(start, split)} ${operators[split - 1]} ${tree(split, end)})`;
  };
  return tree(0, numbers.length).slice(1, -1);
}

/** Construct some exact-division candidates directly instead of rejecting almost all random trees. */
function makeExactExpression(options, random) {
  const randint = (low, high) => low + Math.floor(random() * (high - low + 1));
  const operandText = (n) => n < 0 ? `(${n})` : String(n);
  const pick = (low, high) => {
    if (low > high) return null;
    let n = randint(low, high);
    // The ordinary random-tree branch still covers zero. This branch prefers useful nonzero work.
    if (n === 0 && low !== high) {
      if (high > 0 && (low >= 0 || random() < 0.5)) n = randint(Math.max(low, 1), high);
      else n = randint(low, Math.min(high, -1));
    }
    return n;
  };
  const limit = Math.max(1, Math.abs(options.resultMin), Math.abs(options.resultMax));
  const divisor = (value) => {
    if (value === 0n) return pick(options.min, options.max);
    const found = new Set();
    const add = (n) => {
      if (Number.isSafeInteger(n) && n !== 0 && n >= options.min && n <= options.max && value % BigInt(n) === 0n) found.add(n);
    };
    if (options.max - options.min <= 256) {
      for (let n = options.min; n <= options.max; n++) add(n);
    } else {
      // Bounded factor search: no trial division up to sqrt(large intermediate values).
      const magnitude = abs(value);
      add(1); add(-1); add(Number(magnitude)); add(-Number(magnitude));
      for (let n = 2; n <= 64 && BigInt(n) * BigInt(n) <= magnitude; n++) {
        if (magnitude % BigInt(n) !== 0n) continue;
        const other = Number(magnitude / BigInt(n));
        add(n); add(-n); add(other); add(-other);
      }
      for (let attempt = 0; attempt < 8; attempt++) add(randint(options.min, options.max));
    }
    const candidates = [...found];
    if (!candidates.length) return null;
    const proper = candidates.filter((n) => Math.abs(n) > 1);
    const pool = proper.length && random() < 0.8 ? proper : candidates;
    return pool[randint(0, pool.length - 1)];
  };
  const first = pick(options.min, options.max);
  let expression = operandText(first), value = rational(BigInt(first));
  for (let step = 0; step < options.operatorCount; step++) {
    const offset = randint(0, options.operators.length - 1);
    let built = false;
    for (let attempt = 0; attempt < options.operators.length; attempt++) {
      const op = options.operators[(offset + attempt) % options.operators.length];
      let n = null, reverse = false;
      const current = Number(value.n);
      if (op === '/') {
        // A numerator k*v divided by an existing v is also exact, and adds varied tree shapes.
        if (options.parentheses && value.n !== 0n && random() < 0.35) {
          let low = Math.ceil(options.min / current), high = Math.floor(options.max / current);
          if (current < 0) [low, high] = [Math.ceil(options.max / current), Math.floor(options.min / current)];
          const multiplier = pick(low, high);
          if (multiplier !== null) {
            const candidate = current * multiplier;
            if (Number.isSafeInteger(candidate) && candidate >= options.min && candidate <= options.max && BigInt(candidate) % value.n === 0n) {
              n = candidate; reverse = true;
            }
          }
        }
        if (n === null) n = divisor(value.n);
      } else {
        let low = options.min, high = options.max;
        if (op === '*' && current !== 0) {
          const factorLimit = Math.floor(limit / Math.abs(current));
          low = Math.max(low, -factorLimit); high = Math.min(high, factorLimit);
        } else if (op === '+') {
          low = Math.max(low, Math.ceil(-limit - current));
          high = Math.min(high, Math.floor(limit - current));
          if (!options.allowNegative) low = Math.max(low, Math.ceil(-current));
        } else if (op === '-') {
          low = Math.max(low, Math.ceil(current - limit));
          high = Math.min(high, Math.floor(current + limit));
          if (!options.allowNegative) high = Math.min(high, Math.floor(current));
        }
        n = pick(low, high);
        if (n === null) n = pick(options.min, options.max);
      }
      if (n === null || (op === '/' && !reverse && n === 0)) continue;
      const next = reverse ? operate(op, rational(BigInt(n)), value) : operate(op, value, rational(BigInt(n)));
      if ((!options.allowNegative && next.n < 0n) || next.d !== 1n) continue;
      const literal = operandText(n);
      if (options.parentheses) expression = reverse ? `(${literal} ${op} ${expression})` : `(${expression} ${op} ${literal})`;
      else expression = `${expression} ${op} ${literal}`;
      value = next; built = true; break;
    }
    if (!built) return null;
  }
  return options.parentheses ? expression.slice(1, -1) : expression;
}

export function generateWorksheet(options = {}) {
  const normalized = normalizeOptions(options);
  const random = randomSource(normalized.seed);
  const seen = new Set(), questions = [];
  const stallLimit = Math.max(500, Math.min(4000, normalized.count * 2));
  let attempts = 0, stalled = 0;
  const maxAttempts = normalized.count * 80 + 2000;
  while (questions.length < normalized.count && attempts < maxAttempts && stalled < stallLimit) {
    attempts++; stalled++;
    const directed = normalized.divisionMode === 'exact' && normalized.operators.includes('/') && random() < 0.6;
    const expression = (directed ? makeExactExpression(normalized, random) : null) ?? makeExpression(normalized, random);
    try {
      const parsed = parse(expression);
      let answer, key;
      if (normalized.divisionMode === 'remainder') {
        const operands = parsed.tokens.filter((t) => t.type === 'number').map((t) => BigInt(t.text));
        const [a, b] = operands;
        if (b === 0n) continue;
        const quotient = rational(a / b);
        if (!inBounds(quotient, normalized)) continue;
        answer = `${a / b} R ${a % b}`;
        key = `remainder(${a},${b})`;
      } else {
        const evaluated = evaluateParsed(parsed, normalized);
        if (!inBounds(evaluated.value, normalized)) continue;
        answer = format(evaluated.value);
        key = canonical(evaluated.node);
      }
      if (seen.has(key)) continue;
      seen.add(key); stalled = 0;
      questions.push({ id: String(questions.length + 1), expression, answer, kind: normalized.divisionMode === 'remainder' ? 'remainder' : 'normal', canonical: key });
    } catch (error) {
      if (!(error instanceof MathError) || !['division_by_zero', 'negative_intermediate', 'non_exact_division'].includes(error.code)) throw error;
    }
  }
  if (questions.length !== normalized.count) fail('insufficient_unique', `在尝试上限内找到 ${questions.length} 道不重复的题目，未能达到请求的 ${normalized.count} 道。请扩大数值或答案范围、增加运算符，或减少题量。`, { requested: normalized.count, generated: questions.length, attempts });
  return { seed: normalized.seed, options: normalized, questions };
}

function remainderAnswer(expression) {
  const parsed = parse(expression);
  if (parsed.unaryCount || parsed.binaryCount !== 1 || parsed.rpn.at(-1) !== '/' || parsed.tokens.some((t) => t.type === 'number' && !/^\d+$/.test(t.text)))
    fail('invalid_questions', '余数题须为非负整数的单次除法。');
  const [a, b] = parsed.tokens.filter((t) => t.type === 'number').map((t) => BigInt(t.text));
  if (b === 0n) fail('division_by_zero', '除数不能为零。');
  return { quotient: a / b, remainder: a % b, answer: `${a / b} R ${a % b}` };
}
function submittedAnswer(text) {
  // Exact reduced results can be longer than the nine-digit operands allowed in an exercise.
  // Keep that parser bound for arbitrary expressions, but accept bounded integer/fraction answers.
  const literal = /^([+-]?\d{1,128})(?:\s*\/\s*([+-]?\d{1,128}))?$/.exec(text);
  return literal ? rational(BigInt(literal[1]), literal[2] === undefined ? 1n : BigInt(literal[2])) : evaluateParsed(parse(text)).value;
}
export function gradeWorksheet(input) {
  record(input, '批改参数');
  const { questions, answers } = input;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10000) fail('invalid_questions', '批改题目须为 1–10000 道。');
  if (!answers || typeof answers !== 'object') fail('invalid_answers', '答案须为对象或数组。');
  const ids = new Set();
  let answered = 0, correct = 0;
  const results = questions.map((question, index) => {
    if (!question || typeof question !== 'object' || typeof question.id !== 'string' || question.id.length < 1 || question.id.length > 64 || ids.has(question.id) || !['normal', 'remainder'].includes(question.kind ?? 'normal')) fail('invalid_questions', '题目编号须唯一，题目类型须有效。');
    ids.add(question.id);
    const value = Array.isArray(answers) ? answers[index] : (Object.hasOwn(answers, question.id) ? answers[question.id] : undefined);
    if (value !== undefined && typeof value !== 'string') fail('invalid_answers', '每道题的答案须为字符串。');
    if ((value?.length ?? 0) > 256) fail('invalid_answers', '单题答案最多 256 个字符。');
    const submitted = (value ?? '').trim();
    const remainder = question.kind === 'remainder' ? remainderAnswer(question.expression) : null;
    const expected = remainder ? remainder.answer : evaluateExpression(question.expression).answer;
    const row = { id: question.id, expression: question.expression, submitted, expected, correct: false };
    if (!submitted) { row.message = '未作答'; return row; }
    answered++;
    try {
      if (remainder) {
        const match = /^(\d+)\s*(?:r|余数?|…|\.{3})\s*(\d+)$/iu.exec(submitted);
        row.correct = match ? BigInt(match[1]) === remainder.quotient && BigInt(match[2]) === remainder.remainder : /^\d+$/.test(submitted) && remainder.remainder === 0n && BigInt(submitted) === remainder.quotient;
        if (!match && !/^\d+$/.test(submitted)) row.message = '余数答案请填写“商 R 余数”，例如 2 R 1。';
      } else row.correct = format(submittedAnswer(submitted)) === expected;
    } catch (error) {
      if (!(error instanceof MathError)) throw error;
      row.message = '答案格式无效';
    }
    if (row.correct) correct++;
    return row;
  });
  return { total: questions.length, answered, correct, accuracy: correct / questions.length, results };
}

function validate24Numbers(numbers) {
  if (!Array.isArray(numbers) || numbers.length !== 4 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 13)) fail('invalid_numbers', '24 点须提供 4 个 1–13 之间的整数。');
}
export function solve24(numbers) {
  validate24Numbers(numbers);
  const failed = new Set();
  const search = (items) => {
    if (items.length === 1) return equal(items[0].value, rational(24n)) ? items[0].expression : null;
    const key = items.map((item) => format(item.value)).sort().join('|');
    if (failed.has(key)) return null;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const rest = items.filter((_, index) => index !== i && index !== j);
      const candidates = [['+', a, b], ['*', a, b], ['-', a, b], ['-', b, a], ['/', a, b], ['/', b, a]];
      const values = new Set();
      for (const [op, left, right] of candidates) {
        if (op === '/' && right.value.n === 0n) continue;
        const value = operate(op, left.value, right.value), candidateKey = format(value);
        if (values.has(candidateKey)) continue;
        values.add(candidateKey);
        const answer = search([...rest, { value, expression: `(${left.expression} ${op} ${right.expression})` }]);
        if (answer) return answer;
      }
    }
    failed.add(key); return null;
  };
  const answer = search(numbers.map((n) => ({ value: rational(BigInt(n)), expression: String(n) })));
  return answer?.slice(1, -1) ?? null;
}
export function create24Puzzle(options = {}) {
  record(options, '24 点配置');
  if (Object.keys(options).some((key) => key !== 'seed')) fail('invalid_options', '24 点配置仅支持随机种子。');
  const seed = seedValue(options.seed), random = randomSource(seed);
  for (let attempt = 0; attempt < 256; attempt++) {
    const numbers = Array.from({ length: 4 }, () => 1 + Math.floor(random() * 13));
    if (solve24(numbers) !== null) return { numbers, seed };
  }
  return { numbers: [3, 3, 8, 8], seed };
}
export function check24(numbers, expression) {
  validate24Numbers(numbers);
  let parsed;
  try {
    parsed = parse(expression);
    const { value } = evaluateParsed(parsed);
    const actual = parsed.tokens.filter((token) => token.type === 'number');
    const counts = new Map();
    for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
    let matching = actual.length === 4 && parsed.binaryCount === 3 && parsed.unaryCount === 0 && actual.every((token) => /^\d+$/.test(token.text));
    for (const token of actual) {
      const n = Number(token.text), remaining = counts.get(n) ?? 0;
      if (!remaining) matching = false;
      else counts.set(n, remaining - 1);
    }
    if (!matching) return { correct: false, answer: format(value), message: '请将给定的 4 个整数各用一次，仅使用四则运算和括号。', rpn: parsed.rpn };
    const correct = equal(value, rational(24n));
    return { correct, answer: format(value), message: correct ? '正确！结果为 24。' : `当前结果为 ${format(value)}，请继续尝试。`, rpn: parsed.rpn };
  } catch (error) {
    if (!(error instanceof MathError)) throw error;
    return { correct: false, answer: '', message: error.message, rpn: parsed?.rpn ?? [] };
  }
}
