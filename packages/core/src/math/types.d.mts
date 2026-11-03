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
export interface Puzzle24 {
  numbers: number[];
  seed: string;
}
export interface Check24Result {
  correct: boolean;
  answer: string;
  message: string;
  rpn: string[];
}
export interface GenerationProgress {
  generated: number;
  requested: number;
  attempts: number;
}
export interface GenerationControls {
  signal?: AbortSignal;
  /** Called for accepted questions and at least once per 128 attempts. */
  onProgress?: (progress: GenerationProgress) => void;
}
export interface WorksheetGenerationSummary extends GenerationProgress {
  seed: string;
  options: NormalizedOptions;
}
