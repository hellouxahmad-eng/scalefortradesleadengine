import { listJobs, createJob, updateJob } from '../../../lib/store';

export const dynamic = 'force-dynamic';

function authOk(req) {
  const t = process.env.WORKER_TOKEN;
  if (!t) return true; // open locally; set WORKER_TOKEN to lock writes
  return req.headers.get('x-worker-token') === t;
}

// Sanitize the per-job filter overrides from the dashboard.
function cleanFilters(f) {
  if (!f || typeof f !== 'object') return null;
  const num = (v, max) => { const n = Number(v); return isFinite(n) ? Math.max(0, max ? Math.min(max, n) : n) : 0; };
  return {
    minRating: num(f.minRating, 5),
    minReviews: Math.round(num(f.minReviews)),
    minPhotos: Math.round(num(f.minPhotos)),
    weakSitesOnly: !!f.weakSitesOnly,
    requireEmail: !!f.requireEmail,
  };
}

export async function GET() {
  return Response.json(await listJobs());
}

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const search_term = String(b.search_term || '').trim();
  const location = String(b.location || '').trim();
  const max_results = Math.min(Math.max(parseInt(b.max_results) || 30, 1), 120);
  const render_mockups = b.render_mockups !== false;
  const filters = cleanFilters(b.filters);
  if (!search_term || !location) {
    return Response.json({ error: 'search_term and location are required' }, { status: 400 });
  }
  try {
    return Response.json(await createJob({ search_term, location, max_results, render_mockups, filters }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  if (!authOk(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ error: 'id required' }, { status: 400 });
  const { id, ...fields } = b;
  const j = await updateJob(id, fields);
  return j ? Response.json(j) : Response.json({ error: 'not found' }, { status: 404 });
}
