export type Language =
  'C' | 'C++' | 'Java' | 'JavaScript' | 'TypeScript' | 'Python' | 'Go' | 'Rust' | 'C#' | 'CSS' | 'JSON';
export interface Counts {
  total: number;
  code: number;
  comment: number;
  blank: number;
}
export const LANGUAGES: readonly Readonly<{ name: Language; extensions: readonly string[] }>[];
export function detectLanguage(filePath: string): Language | null;
export function analyzeText(text: string, language: Language): Counts;
export interface LineExplanation {
  line: number;
  text: string;
  kind: 'code' | 'comment' | 'blank';
  reason: 'code' | 'comment' | 'whitespace' | 'mixed' | 'literal';
}
export interface LineAnalysis {
  counts: Counts;
  lines: LineExplanation[];
  method: 'parser' | 'scanner';
}
export function explainJavaScript(text: string): LineAnalysis;
