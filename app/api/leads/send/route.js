import { requestSend } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

// Auth is handled by middleware (dashboard password or worker token).
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  if (b.id) return Response.json(await requestSend({ id: b.id }));
  if (b.job_id) return Response.json(await requestSend({ job_id: b.job_id }));
  return Response.json({ error: 'id or job_id required' }, { status: 400 });
}
