import { listLeads, listLeadsScope, addLead, updateLead } from '../../../lib/store';

export const dynamic = 'force-dynamic';

function authOk(req) {
  const t = process.env.WORKER_TOKEN;
  if (!t) return true;
  return req.headers.get('x-worker-token') === t;
}

export async function GET(req) {
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');
  if (scope) return Response.json(await listLeadsScope(scope));
  const job_id = url.searchParams.get('job_id');
  return Response.json(job_id ? await listLeads(job_id) : []);
}

export async function POST(req) {
  if (!authOk(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
  try {
    return Response.json(await addLead(b));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  if (!authOk(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ error: 'id required' }, { status: 400 });
  const { id, ...fields } = b;
  const l = await updateLead(id, fields);
  return l ? Response.json(l) : Response.json({ error: 'not found' }, { status: 404 });
}
