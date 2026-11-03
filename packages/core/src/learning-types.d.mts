export interface LearningOptions {
  count: number;
  min: number;
  max: number;
  operators: string[];
  operatorCount: number;
  parentheses: boolean;
  allowNegative: boolean;
  fractions: boolean;
  divisionMode: 'exact' | 'fraction' | 'remainder';
  resultMin: number;
  resultMax: number;
  denominatorMax: number;
  seed?: string;
}
export interface LearningQuestion {
  id: string;
  expression: string;
  answer: string;
  kind: 'normal' | 'remainder';
  canonical: string;
}
export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export interface Mistake {
  key: string;
  question: LearningQuestion;
  options: LearningOptions;
  difficulty: Difficulty;
  firstSeen: string;
  lastSeen: string;
  misses: number;
  resolved: boolean;
}
export interface ChallengeRecord {
  id: string;
  date: string;
  level: number;
  elapsed: number;
  numbers: number[];
  assisted: false;
}
export const MISTAKE_STORAGE_KEY: string;
export const CHALLENGE_STORAGE_KEY: string;
export const MAX_MISTAKES: number;
export const MAX_CHALLENGE_RECORDS: number;
export const TEACHING_PRESETS: readonly { id: string; zh: string; en: string; options: LearningOptions }[];
export function presetOptions(id: string): LearningOptions | null;
export function questionDifficulty(options: LearningOptions): Difficulty;
export function mistakeIdentity(question: Pick<LearningQuestion, 'kind' | 'expression'>): string;
export function decodeMistakes(raw: string | null): { items: Mistake[]; recovered: boolean };
export function encodeMistakes(items: Mistake[]): string;
export function recordWorksheetResults(
  previous: Mistake[],
  worksheet: { questions: LearningQuestion[]; options: LearningOptions },
  grade: { results: { id: string; expected: string; correct: boolean }[] },
  now?: string,
): Mistake[];
export function filterMistakes(
  items: Mistake[],
  filters?: { operator?: string; difficulty?: string; status?: string },
): Mistake[];
export function challengeLimit(level: number): number;
export function decodeChallenges(raw: string | null): { items: ChallengeRecord[]; recovered: boolean };
export function recordChallenge(
  previous: ChallengeRecord[],
  input: { id: string; date: string; level: number; elapsed: number; numbers: number[]; assisted: boolean },
): ChallengeRecord[];
export function encodeChallenges(items: ChallengeRecord[]): string;
