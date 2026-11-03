/** @typedef {import('./learning-types.mjs').LearningOptions} LearningOptions */
/** @typedef {import('./learning-types.mjs').LearningQuestion} LearningQuestion */
/** @typedef {import('./learning-types.mjs').Mistake} Mistake */
/** @typedef {import('./learning-types.mjs').ChallengeRecord} ChallengeRecord */
import { normalizeOptions } from '@se-lab/core/math';

export const MISTAKE_STORAGE_KEY = 'se-lab-math-mistakes-v1';
export const CHALLENGE_STORAGE_KEY = 'se-lab-24-leaderboard-v1';
export const MAX_MISTAKES = 500;
export const MAX_CHALLENGE_RECORDS = 30;
const MAX_STORAGE_CHARACTERS = 1_000_000;

/** Editable teaching examples, not statements about an official curriculum. */
/** @type {Array<{id:string,zh:string,en:string,options:Partial<LearningOptions>}>} */
const presets = [
  {
    id: 'primary-1',
    zh: '小学一年级 · 10以内加减',
    en: 'Primary 1 · Addition / subtraction to 10',
    options: { min: 0, max: 10, operators: ['+', '-'], operatorCount: 1, resultMax: 20 },
  },
  {
    id: 'primary-2',
    zh: '小学二年级 · 20以内加减',
    en: 'Primary 2 · Addition / subtraction to 20',
    options: { min: 0, max: 20, operators: ['+', '-'], operatorCount: 1, resultMax: 100 },
  },
  {
    id: 'primary-3',
    zh: '小学三年级 · 乘除口算',
    en: 'Primary 3 · Multiplication / division',
    options: { min: 1, max: 9, operators: ['*', '/'], operatorCount: 1, resultMax: 81 },
  },
  {
    id: 'primary-4',
    zh: '小学四年级 · 混合运算',
    en: 'Primary 4 · Mixed operations',
    options: {
      min: 0,
      max: 100,
      operators: ['+', '-', '*', '/'],
      operatorCount: 2,
      parentheses: true,
      resultMax: 200,
    },
  },
  {
    id: 'primary-5',
    zh: '小学五年级 · 简单分数',
    en: 'Primary 5 · Simple fractions',
    options: {
      min: 0,
      max: 20,
      operators: ['+', '-', '*', '/'],
      operatorCount: 1,
      fractions: true,
      divisionMode: 'fraction',
      denominatorMax: 6,
      resultMax: 100,
    },
  },
  {
    id: 'primary-6',
    zh: '小学六年级 · 分数混合',
    en: 'Primary 6 · Mixed fractions',
    options: {
      min: 0,
      max: 30,
      operators: ['+', '-', '*', '/'],
      operatorCount: 2,
      parentheses: true,
      fractions: true,
      divisionMode: 'fraction',
      denominatorMax: 12,
      resultMax: 200,
    },
  },
  {
    id: 'junior',
    zh: '初中口算 · 有理数',
    en: 'Junior · Signed rational arithmetic',
    options: {
      min: -20,
      max: 20,
      operators: ['+', '-', '*', '/'],
      operatorCount: 3,
      parentheses: true,
      allowNegative: true,
      divisionMode: 'fraction',
      resultMin: -200,
      resultMax: 200,
    },
  },
];
/** @type {LearningOptions} */
const defaults = {
  count: 20,
  min: 0,
  max: 100,
  operators: ['+', '-'],
  operatorCount: 2,
  parentheses: false,
  allowNegative: false,
  fractions: false,
  divisionMode: 'exact',
  resultMin: 0,
  resultMax: 100,
  denominatorMax: 12,
};
export const TEACHING_PRESETS = Object.freeze(
  presets.map((item) => Object.freeze({ ...item, options: Object.freeze({ ...defaults, ...item.options }) })),
);

/** @param {string} id */
export function presetOptions(id) {
  const preset = TEACHING_PRESETS.find((item) => item.id === id);
  return preset ? { ...preset.options, operators: [...preset.options.operators] } : null;
}

/** This is a transparent UI heuristic, not an assessment of a learner. */
/** @param {LearningOptions} options @returns {import('./learning-types.mjs').Difficulty} */
export function questionDifficulty(options) {
  if (options.fractions || options.allowNegative || options.operatorCount >= 3 || options.max > 1000)
    return 'advanced';
  if (options.operatorCount > 1 || options.parentheses || options.max > 20) return 'intermediate';
  return 'basic';
}

/** @param {Pick<LearningQuestion,'kind'|'expression'>} question */
export function mistakeIdentity(question) {
  return `${question.kind === 'remainder' ? 'remainder' : 'normal'}:${question.expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replace(/\s+/gu, '')}`;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @param {number} [limit] @returns {value is string} */
const text = (value, limit = 256) => typeof value === 'string' && value.length > 0 && value.length <= limit;
/** @param {unknown} value @returns {value is string} */
const date = (value) => text(value, 40) && Number.isFinite(Date.parse(value));
/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
const integer = (value, min, max) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** @param {unknown} value @returns {value is string} */
const expression = (value) => text(value) && /^[\d\s.+\-*/()×÷−（）]+$/u.test(value);

/** @param {unknown} value @returns {Mistake|null} */
function sanitizeMistake(value) {
  if (
    !record(value) ||
    !record(value.question) ||
    !expression(value.question.expression) ||
    !text(value.question.answer, 128) ||
    (value.question.kind !== 'normal' && value.question.kind !== 'remainder') ||
    !date(value.firstSeen) ||
    !date(value.lastSeen) ||
    !integer(value.misses, 1, 1_000_000) ||
    typeof value.resolved !== 'boolean'
  )
    return null;
  let options;
  try {
    options = normalizeOptions(/** @type {import('./math/core.mjs').MathOptions} */ (value.options));
  } catch {
    return null;
  }
  /** @type {LearningQuestion} */
  const question = {
    id: 'stored',
    expression: value.question.expression,
    answer: value.question.answer,
    kind: value.question.kind,
    canonical:
      typeof value.question.canonical === 'string'
        ? value.question.canonical.slice(0, 1024)
        : value.question.expression,
  };
  return {
    key: mistakeIdentity(question),
    question,
    options,
    difficulty: questionDifficulty(options),
    firstSeen: value.firstSeen,
    lastSeen: value.lastSeen,
    misses: value.misses,
    resolved: value.resolved,
  };
}

/** @template T @param {unknown} raw @param {(value:unknown)=>T|null} sanitize @param {number} limit @returns {{items:T[],recovered:boolean}} */
function decode(raw, sanitize, limit) {
  if (raw === null || raw === '') return { items: [], recovered: false };
  if (typeof raw !== 'string' || raw.length > MAX_STORAGE_CHARACTERS) return { items: [], recovered: true };
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(raw);
    if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items))
      return { items: [], recovered: true };
    /** @type {unknown[]} */
    const entries = parsed.items;
    const items = entries
      .slice(0, limit)
      .map(sanitize)
      .filter((item) => item !== null);
    return { items, recovered: items.length !== parsed.items.length };
  } catch {
    return { items: [], recovered: true };
  }
}

/** @param {string|null} raw */
export function decodeMistakes(raw) {
  const decoded = decode(raw, sanitizeMistake, MAX_MISTAKES);
  const unique = new Map(decoded.items.map((item) => [item.key, item]));
  return {
    items: [...unique.values()],
    recovered: decoded.recovered || unique.size !== decoded.items.length,
  };
}

/** @param {Mistake[]} items */
export function encodeMistakes(items) {
  return JSON.stringify({ version: 1, items: items.slice(0, MAX_MISTAKES) });
}

/** Collect misses and mark mastered entries using the server's fresh grade. */
/** @param {Mistake[]} previous @param {{questions:LearningQuestion[],options:LearningOptions}} worksheet @param {{results:{id:string,expected:string,correct:boolean}[]}} grade @param {string} [now] */
export function recordWorksheetResults(previous, worksheet, grade, now = new Date().toISOString()) {
  if (!date(now)) throw new TypeError('A valid result timestamp is required');
  const questions = new Map(worksheet.questions.map((question) => [question.id, question]));
  const book = new Map(previous.map((item) => [item.key, item]));
  for (const result of grade.results) {
    const question = questions.get(result.id);
    if (!question) continue;
    const key = mistakeIdentity(question);
    const existing = book.get(key);
    if (result.correct) {
      if (existing) book.set(key, { ...existing, resolved: true, lastSeen: now });
      continue;
    }
    const item = sanitizeMistake({
      question: { ...question, answer: result.expected },
      options: worksheet.options,
      firstSeen: existing?.firstSeen || now,
      lastSeen: now,
      misses: Math.min(1_000_000, (existing?.misses || 0) + 1),
      resolved: false,
    });
    if (item) {
      book.delete(key);
      book.set(key, item);
      if (book.size > MAX_MISTAKES) {
        const oldest = book.keys().next().value;
        if (oldest !== undefined) book.delete(oldest);
      }
    }
  }
  return [...book.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, MAX_MISTAKES);
}

/** @param {Mistake[]} items @param {{operator?:string,difficulty?:string,status?:string}} [filters] */
export function filterMistakes(items, filters = {}) {
  return items.filter(
    (item) =>
      (filters.difficulty === undefined ||
        filters.difficulty === 'all' ||
        item.difficulty === filters.difficulty) &&
      (filters.operator === undefined ||
        filters.operator === 'all' ||
        item.question.expression
          .replaceAll('×', '*')
          .replaceAll('÷', '/')
          .replaceAll('−', '-')
          .includes(filters.operator)) &&
      (filters.status === undefined ||
        filters.status === 'all' ||
        (filters.status === 'resolved' ? item.resolved : !item.resolved)),
  );
}

/** @param {number} level */
export function challengeLimit(level) {
  const index = Number.isFinite(level) ? Math.min(4, Math.max(0, Math.floor(level) - 1)) : 0;
  return [180, 150, 120, 90, 60][index] * 1000;
}

/** @param {unknown} value @returns {ChallengeRecord|null} */
function sanitizeChallenge(value) {
  if (
    !record(value) ||
    !text(value.id, 100) ||
    !date(value.date) ||
    !integer(value.level, 1, 5) ||
    !integer(value.elapsed, 0, challengeLimit(value.level)) ||
    !Array.isArray(value.numbers) ||
    value.numbers.length !== 4 ||
    value.numbers.some((number) => !integer(number, 1, 13)) ||
    value.assisted !== false
  )
    return null;
  return {
    id: value.id,
    date: value.date,
    level: value.level,
    elapsed: value.elapsed,
    numbers: value.numbers.filter((number) => typeof number === 'number'),
    assisted: false,
  };
}

/** @param {ChallengeRecord[]} items */
const sortChallenges = (items) =>
  items
    .sort((a, b) => b.level - a.level || a.elapsed - b.elapsed || b.date.localeCompare(a.date))
    .slice(0, MAX_CHALLENGE_RECORDS);

/** @param {string|null} raw */
export function decodeChallenges(raw) {
  const decoded = decode(raw, sanitizeChallenge, MAX_CHALLENGE_RECORDS);
  const unique = new Map(decoded.items.map((item) => [item.id, item]));
  return {
    items: sortChallenges([...unique.values()]),
    recovered: decoded.recovered || unique.size !== decoded.items.length,
  };
}

/** @param {ChallengeRecord[]} previous @param {{id:string,date:string,level:number,elapsed:number,numbers:number[],assisted:boolean}} input */
export function recordChallenge(previous, input) {
  const item = sanitizeChallenge(input);
  return item
    ? sortChallenges([item, ...previous.filter((previousItem) => previousItem.id !== item.id)])
    : previous;
}

/** @param {ChallengeRecord[]} items */
export function encodeChallenges(items) {
  return JSON.stringify({ version: 1, items: items.slice(0, MAX_CHALLENGE_RECORDS) });
}
