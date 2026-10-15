import { errorJSON, getDemoReport } from '../../../../lib/code-count-service.mjs';

export function GET() {
  try {
    return Response.json(getDemoReport(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorJSON(error); }
}
