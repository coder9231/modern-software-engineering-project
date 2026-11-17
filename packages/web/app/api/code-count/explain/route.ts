import { explainCodeUpload, errorJSON, readJsonRequest } from '../../../../lib/code-count-service.mjs';

export async function POST(request: Request) {
  try {
    return Response.json(explainCodeUpload(await readJsonRequest(request)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorJSON(error);
  }
}
