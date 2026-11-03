import type {
  MathOptions,
  NormalizedOptions,
  Evaluation,
  Worksheet,
  Question,
  GradeQuestion,
  GradeReport,
  Puzzle24,
  Check24Result,
  GenerationControls,
  WorksheetGenerationSummary,
} from './types.mjs';
export type * from './types.mjs';
export class MathError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}
export function normalizeOptions(options?: MathOptions): NormalizedOptions;
export function evaluateExpression(expression: string): Evaluation;
export function generateWorksheet(options?: MathOptions): Worksheet;
export function generateWorksheetStream(
  options?: MathOptions,
  controls?: GenerationControls,
): Generator<Question, WorksheetGenerationSummary, void>;
export function gradeWorksheet(input: {
  questions: GradeQuestion[];
  answers: Record<string, string> | string[];
}): GradeReport;
export function solve24(numbers: number[]): string | null;
export function create24Puzzle(options?: { seed?: string }): Puzzle24;
export function check24(numbers: number[], expression: string): Check24Result;
