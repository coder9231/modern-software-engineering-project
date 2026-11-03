export type OCRProgress = { phase: 'preparing' | 'recognizing'; progress: number };
export type OCRText = { text: string; confidence: number; rows: number; uncertain: number[] };
export class BrowserOCRError extends Error {
  readonly code: string;
  constructor(code: string);
}
export const BROWSER_OCR_LIMITS: Readonly<{ maxBytes: number; maxPixels: number; maxRows: number }>;
export function prepareBrowserOCRText(raw: string, confidence?: number): OCRText;
export function getBrowserOCRStatus(options?: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ available: boolean }>;
export function recognizeBrowserImage(
  image: Blob,
  options?: { signal?: AbortSignal; onProgress?: (progress: OCRProgress) => void; timeoutMs?: number },
): Promise<OCRText>;
