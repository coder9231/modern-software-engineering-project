import type { Counts, Language } from '@se-lab/core/counter';
export interface QualityOptions {
  minBlockLines?: number;
  maxBlocks?: number;
}
export interface QualitySource {
  path: string;
  language: Language;
  content: string;
}
export interface Occurrence {
  path: string;
  startLine: number;
  endLine: number;
}
export interface Duplication {
  analyzedLines: number;
  duplicateLines: number;
  ratio: number;
  blocks: { lines: number; occurrences: Occurrence[] }[];
  truncated: boolean;
}
export interface QualityReport {
  version: 1;
  language: Language;
  counts: Counts;
  commentRatio: number;
  complexity: {
    method: 'lexical-file-estimate';
    estimate: number | null;
    decisionPoints: number | null;
    decisions: Record<string, number>;
  };
  duplication: Duplication | null;
  warnings: string[];
}
export interface ProjectQualityReport {
  version: number;
  files: (QualityReport & { path: string })[];
  duplication: Duplication;
  excludedFiles: string[];
  method: string;
}
export interface FileCounts extends Counts {
  path: string;
  language: string;
}
export interface Totals extends Counts {
  files: number;
}
export interface ComparisonReport {
  input?: string;
  totals: Totals;
  files: FileCounts[];
}
export interface ReportComparison {
  version: number;
  before: { input: string; totals: Totals };
  after: { input: string; totals: Totals };
  delta: Totals;
  files: {
    added: FileCounts[];
    removed: FileCounts[];
    changed: {
      path: string;
      before: FileCounts;
      after: FileCounts;
      delta: Counts;
      languageChanged: boolean;
    }[];
    unchanged: number;
  };
  languages: { language: string; before: Totals; after: Totals; delta: Totals }[];
  warnings: string[];
}
export const MAX_QUALITY_SOURCE_CHARS: number;
export function analyzeQuality(text: string, language: Language, options?: QualityOptions): QualityReport;
export function analyzeProjectQuality(
  sources: QualitySource[],
  options?: QualityOptions,
): ProjectQualityReport;
export function compareReports(before: unknown, after: unknown): ReportComparison;
