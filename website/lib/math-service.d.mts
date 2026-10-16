import {
  normalizeOptions, generateWorksheet, gradeWorksheet, evaluateExpression,
  create24Puzzle, check24, solve24,
} from './math/core.mjs';
export { readJsonRequest } from './code-count-service.mjs';
export const MATH_LIMITS: Readonly<{ maxQuestions: number }>;
export interface MathConfig {
  defaults: Omit<ReturnType<typeof normalizeOptions>, 'seed'>;
  limits: { maxQuestions: number };
  rules: string[];
  ocr: { configured: boolean; provider: 'openai'; requiresAccessCode: true };
}
export function getMathConfig(environment?: Record<string, string | undefined>): MathConfig;
export function generateMathWorksheet(payload: unknown): ReturnType<typeof generateWorksheet>;
export function gradeMathWorksheet(payload: unknown): ReturnType<typeof gradeWorksheet>;
export function evaluateMathExpression(payload: unknown): ReturnType<typeof evaluateExpression>;
export function play24(payload: unknown): ReturnType<typeof create24Puzzle> | ReturnType<typeof check24> | { solution: ReturnType<typeof solve24> };
export function mathErrorJSON(error: unknown): Response;
export function handleMathRequest(request: Request, operation: 'generate' | 'grade' | 'evaluate' | '24'): Promise<Response>;
