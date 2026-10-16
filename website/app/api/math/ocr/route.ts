import { getOCRStatus, handleOCRRequest } from '../../../../lib/math-ocr.mjs';

export async function GET() {
  return Response.json(getOCRStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  return handleOCRRequest(request);
}
