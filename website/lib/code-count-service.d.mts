export interface Counts { total: number; code: number; comment: number; blank: number }
export interface FileCounts extends Counts { path: string; language: string }
export interface Report {
  version: 1;
  input: string;
  generatedAt: string;
  totals: Counts & { files: number };
  languages: (Counts & { language: string; files: number })[];
  files: FileCounts[];
  skipped: { path: string; reason: string }[];
  errors: { path: string; message: string }[];
}
export interface Config {
  languages: { name: string; extensions: string[] }[];
  defaultExcludes: string[];
  limits: { maxFilesPerBatch: number; maxBytesPerBatch: number; maxFileBytes: number };
  rules: string[];
}
export class HttpError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}
export const LIMITS: Readonly<Config['limits']>;
export const MAX_REQUEST_BYTES: number;
export function getConfig(): Config;
export function analyzeUploads(payload: unknown): Report;
export function getDemoReport(): Report;
export function exportReport(payload: unknown): { body: string; contentType: string; filename: string };
export function readJsonRequest(request: Request): Promise<unknown>;
export function errorJSON(error: unknown): Response;
