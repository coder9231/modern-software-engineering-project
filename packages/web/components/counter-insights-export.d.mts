import type { ReportComparison } from '@se-lab/core/quality';
export interface Counts {
  total: number;
  code: number;
  comment: number;
  blank: number;
}
export interface ComparisonRow {
  kind: 'added' | 'removed' | 'changed';
  path: string;
  language: string;
  before: Counts;
  after: Counts;
  delta: Counts;
}
export function comparisonFileRows(comparison: ReportComparison): ComparisonRow[];
export function safeCsvCell(value: string | number): string;
export function comparisonToCsv(comparison: ReportComparison): string;
