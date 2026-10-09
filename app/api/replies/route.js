import { getReplies } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getReplies());
  } catch (e) {
    return Response.json({ error: e.message });
  }
}
