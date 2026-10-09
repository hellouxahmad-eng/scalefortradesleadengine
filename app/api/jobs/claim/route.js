import { claimNextJob } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

function authOk(req) {
  const t = process.env.WORKER_TOKEN;
  if (!t) return true;
  return req.headers.get('x-worker-token') === t;
}

export async function POST(req) {
  if (!authOk(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json((await claimNextJob()) || null);
}
