export type Operator = '+' | '-' | '*' | '/';
export type DivisionMode = 'exact' | 'fraction' | 'remainder';
export interface MathOptions {
  count?: number;
  min?: number;
  max?: number;
  operators?: Operator[];
  operatorCount?: number;
  parentheses?: boolean;
  allowNegative?: boolean;
  fractions?: boolean;
  divisionMode?: DivisionMode;
  resultMin?: number;
  resultMax?: number;
  denominatorMax?: number;
  seed?: string;
}
export type NormalizedOptions = Required<MathOptions>;
export interface Evaluation {
  answer: string;
  numerator: string;
  denominator: string;
  rpn: string[];
}
export interface Question {
  id: string;
  expression: string;
  answer: string;
  kind: 'normal' | 'remainder';
  canonical: string;
}
export interface Worksheet {
  seed: string;
  options: NormalizedOptions;
  questions: Question[];
}
export interface GradeQuestion {
  id: string;
  expression: string;
  kind?: 'normal' | 'remainder';
  answer?: string;
  canonical?: string;
}
export interface GradeResult {
  id: string;
  expression: string;
  submitted: string;
  expected: string;
  correct: boolean;
  message?: string;
}
export interface GradeReport {
  total: number;
  answered: number;
  correct: number;
  /** Ratio in [0, 1], including unanswered questions in the denominator. */
  accuracy: number;
  results: GradeResult[];
}
export interface Puzzle24 { numbers: number[]; seed: string }
export interface Check24Result { correct: boolean; answer: string; message: string; rpn: string[] }
export class MathError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}
export function normalizeOptions(options?: MathOptions): NormalizedOptions;
export function evaluateExpression(expression: string): Evaluation;
export function generateWorksheet(options?: MathOptions): Worksheet;
export function gradeWorksheet(input: { questions: GradeQuestion[]; answers: Record<string, string> | string[] }): GradeReport;
export function solve24(numbers: number[]): string | null;
export function create24Puzzle(options?: { seed?: string }): Puzzle24;
export function check24(numbers: number[], expression: string): Check24Result;
