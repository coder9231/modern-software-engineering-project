export const OCR_LIMITS: Readonly<{ maxImageBytes: number; maxQuestions: number }>;
export function getOCRStatus(environment?: Record<string, string | undefined>): {
  configured: boolean; provider: string; requiresAccessCode: boolean; maxImageBytes: number; maxQuestions: number; message: string;
};
export function handleOCRRequest(request: Request, dependencies?: {
  environment?: Record<string, string | undefined>; fetchImpl?: typeof fetch;
}): Promise<Response>;
