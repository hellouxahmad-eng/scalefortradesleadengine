import { getStats } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getStats());
  } catch (e) {
    return Response.json({ emailed: 0, replied: 0, send_failed: 0, error: e.message });
  }
}
