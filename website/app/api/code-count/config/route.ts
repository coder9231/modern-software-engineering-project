import { getConfig } from '../../../../lib/code-count-service.mjs';

export function GET() {
  return Response.json(getConfig(), { headers: { 'Cache-Control': 'no-store' } });
}
