// State store for the dashboard API.
// If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, state lives in Supabase
// (cloud mode — works on Vercel). Otherwise it falls back to a local JSON file
// (dev mode with zero credentials). All functions are async.
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupa = !!(SUPA_URL && SUPA_KEY);
const supa = useSupa ? createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
  // Opt every query out of Next.js's fetch cache so counts and leads are always live.
  global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) },
}) : null;

const now = () => new Date().toISOString();

// ---------- local JSON fallback ----------
const DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DIR, 'state.json');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function lread() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { jobs: [], leads: [] }; } }
function lsave(s) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(s)); }

// ---------- api ----------
export async function listJobs() {
  if (useSupa) {
    const { data } = await supa.from('jobs').select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
  return lread().jobs.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
}

export async function createJob({ search_term, location, max_results, render_mockups = true, filters = null }) {
  if (useSupa) {
    const { data, error } = await supa.from('jobs')
      .insert({ search_term, location, max_results, render_mockups, filters, status: 'queued' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const s = lread();
  const job = { id: uid(), search_term, location, max_results, render_mockups, filters, status: 'queued', raw_count: 0, qualified_count: 0, stage: null, error: null, created_at: now(), updated_at: now() };
  s.jobs.push(job); lsave(s); return job;
}

export async function claimNextJob() {
  if (useSupa) {
    const { data } = await supa.from('jobs').select('id').eq('status', 'queued')
      .order('created_at', { ascending: true }).limit(1);
    if (!data || !data.length) return null;
    const { data: upd } = await supa.from('jobs')
      .update({ status: 'scraping', stage: 'starting', updated_at: now() })
      .eq('id', data[0].id).eq('status', 'queued').select();
    return (upd && upd.length) ? upd[0] : null;
  }
  const s = lread();
  const job = s.jobs.filter(j => j.status === 'queued').sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!job) return null;
  job.status = 'scraping'; job.stage = 'starting'; job.updated_at = now(); lsave(s); return job;
}

export async function updateJob(id, fields) {
  if (useSupa) {
    const { data } = await supa.from('jobs').update({ ...fields, updated_at: now() }).eq('id', id).select().single();
    return data || null;
  }
  const s = lread(); const j = s.jobs.find(x => x.id === id); if (!j) return null;
  Object.assign(j, fields, { updated_at: now() }); lsave(s); return j;
}

export async function listLeads(job_id) {
  if (useSupa) {
    const { data } = await supa.from('leads').select('*').eq('job_id', job_id).order('created_at', { ascending: true });
    return data || [];
  }
  return lread().leads.filter(l => l.job_id === job_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Global leads filtered by a stat scope (across every job), newest activity first.
// Powers the clickable "Emails sent" / "Replies" / failures counters.
export async function listLeadsScope(scope) {
  if (useSupa) {
    let q = supa.from('leads').select('*');
    if (scope === 'replied') q = q.not('replied_at', 'is', null).order('replied_at', { ascending: false });
    else if (scope === 'emailed') q = q.eq('status', 'emailed').order('emailed_at', { ascending: false });
    else if (scope === 'send_failed') q = q.eq('status', 'send_failed').order('created_at', { ascending: false });
    else return [];
    const { data } = await q.limit(300);
    return data || [];
  }
  let rows = lread().leads.slice();
  if (scope === 'replied') rows = rows.filter(l => l.replied_at);
  else if (scope === 'emailed') rows = rows.filter(l => l.status === 'emailed');
  else if (scope === 'send_failed') rows = rows.filter(l => l.status === 'send_failed');
  else return [];
  return rows;
}

function phoneKey(phone) {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

export async function addLead(lead) {
  const phone_key = phoneKey(lead.phone);
  if (useSupa) {
    // Dedupe: skip if a lead with the same phone already exists (any job)
    if (phone_key) {
      const { data: dup } = await supa.from('leads').select('id').eq('phone_key', phone_key).limit(1);
      if (dup && dup.length) return { duplicate: true };
    }
    const { data, error } = await supa.from('leads').insert({ status: 'qualified', ...lead, phone_key }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const s = lread();
  if (phone_key && s.leads.some(l => l.phone_key === phone_key)) return { duplicate: true };
  const row = { id: uid(), created_at: now(), status: 'qualified', mockup_url: null, phone_key, ...lead };
  s.leads.push(row); lsave(s); return row;
}

// Mark leads for sending — only ones that already have a mockup (mockup_ready),
// so nothing gets re-emailed. Pass an id (one lead) or job_id (all ready in a job).
export async function requestSend({ id, job_id }) {
  // Re-sendable = has a mockup and isn't already sent: mockup_ready OR a prior send_failed (retry).
  const sendable = ['mockup_ready', 'send_failed'];
  if (useSupa) {
    let q = supa.from('leads').update({ status: 'send_requested', send_error: null }).in('status', sendable);
    if (id) q = q.eq('id', id); else if (job_id) q = q.eq('job_id', job_id); else return { updated: 0 };
    const { data } = await q.select('id');
    return { updated: (data || []).length };
  }
  const s = lread(); let n = 0;
  s.leads.forEach(l => {
    if (sendable.includes(l.status) && ((id && l.id === id) || (job_id && l.job_id === job_id))) { l.status = 'send_requested'; l.send_error = null; n++; }
  });
  lsave(s); return { updated: n };
}

// Global counts for the dashboard header: total emails sent, replies received,
// and current send failures. Cheap COUNT queries (head: true fetches no rows).
export async function getStats() {
  if (useSupa) {
    const c = async (b) => (await b).count || 0;
    const [emailed, replied, send_failed] = await Promise.all([
      c(supa.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'emailed')),
      c(supa.from('leads').select('id', { count: 'exact', head: true }).not('replied_at', 'is', null)),
      c(supa.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'send_failed')),
    ]);
    return { emailed, replied, send_failed };
  }
  const s = lread();
  return {
    emailed: s.leads.filter(l => l.status === 'emailed').length,
    replied: s.leads.filter(l => l.replied_at).length,
    send_failed: s.leads.filter(l => l.status === 'send_failed').length,
  };
}

export async function updateLead(id, fields) {
  if (useSupa) {
    const { data } = await supa.from('leads').update(fields).eq('id', id).select().single();
    return data || null;
  }
  const s = lread(); const l = s.leads.find(x => x.id === id); if (!l) return null;
  Object.assign(l, fields); lsave(s); return l;
}

// Reply messages saved by the Mac sender's reply checker (private Storage bucket "replies").
export async function getReplies() {
  if (!useSupa) return {};
  const { data, error } = await supa.storage.from('replies').download('replies.json');
  if (error || !data) return {};
  try { return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8')); } catch { return {}; }
}
