import { errorJSON, exportReport, readJsonRequest } from '../../../../lib/code-count-service.mjs';

export async function POST(request: Request) {
  try {
    const result = exportReport(await readJsonRequest(request));
    return new Response(result.body, { headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return errorJSON(error); }
}
