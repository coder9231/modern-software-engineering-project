import { analyzeUploads, errorJSON, readJsonRequest } from '../../../lib/code-count-service.mjs';

export async function POST(request: Request) {
  try {
    const report = analyzeUploads(await readJsonRequest(request));
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorJSON(error); }
}
