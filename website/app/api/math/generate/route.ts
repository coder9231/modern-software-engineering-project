import { handleMathRequest } from '../../../../lib/math-service.mjs';

export async function POST(request: Request) { return handleMathRequest(request, 'generate'); }
