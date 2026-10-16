import { getMathConfig, mathErrorJSON } from '../../../../lib/math-service.mjs';

export async function GET() {
  try {
    return Response.json(getMathConfig(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return mathErrorJSON(error); }
}
