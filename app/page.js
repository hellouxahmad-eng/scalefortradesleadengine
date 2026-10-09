'use client';
import { useEffect, useMemo, useState } from 'react';

function Badge({ status }) {
  return <span className={`badge ${status}`}>{String(status || '').replace('_', ' ')}</span>;
}

function jobProgress(job) {
  if (job.status === 'done') return 100;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(job.stage || '');
  if (m) { const [, i, t] = m; return t > 0 ? Math.round((i / t) * 100) : 5; }
  if (job.status === 'scraping' || job.status === 'rendering') return 8;
  return 0;
}

// Tag each reply so the important ones stand out.
function replyTag(m) {
  if (m.auto || !String(m.text || '').trim()) return { k: 'auto', label: 'Auto-reply' };
  if (m.optOut) return { k: 'optout', label: 'Opt-out' };
  const t = String(m.text).toLowerCase();
  if (/(no thank|not interested|we('re| are) good|i'?m good|already have|just (had|built)|made (it|my website|our own)|pointless)/.test(t)) return { k: 'no', label: 'Not interested' };
  if (/(interested|how much|cost|price|pricing|call|when is good|located|tell me more|more info|send (me|over)|let'?s|sounds good|yes\b|admin access|starting point)/.test(t)) return { k: 'hot', label: 'Interested' };
  return { k: 'neutral', label: 'Reply' };
}

function RepliesView({ leads, replies }) {
  const cards = leads
    .map(l => ({ l, msgs: replies[l.id] || [] }))
    .map(c => ({ ...c, tags: c.msgs.map(replyTag), last: c.msgs.length ? c.msgs[c.msgs.length - 1].date : (c.l.replied_at || '') }))
    .sort((a, b) => (b.tags.some(t => t.k === 'hot') - a.tags.some(t => t.k === 'hot')) || String(b.last).localeCompare(String(a.last)));
  const hot = cards.filter(c => c.tags.some(t => t.k === 'hot')).length;
  return (
    <div className="replies">
      <div className="replies-sum">{cards.length} businesses replied{hot ? <> · <b>{hot} interested</b>, answer these first</> : null}</div>
      {cards.map(({ l, msgs, tags }) => (
        <div key={l.id} className={`reply-card ${tags.some(t => t.k === 'hot') ? 'hot' : ''}`}>
          <div className="reply-head">
            {l.mockup_url ? <a href={l.mockup_url} target="_blank" rel="noreferrer"><img className="thumb" src={l.mockup_url} alt="mockup" /></a> : null}
            <div>
              <div className="biz">{l.name}</div>
              <div className="reply-meta">{l.email}{l.city ? ' · ' + l.city : ''}{l.phone ? ' · ' + l.phone : ''}{l.sent_from ? ' · sent from ' + l.sent_from.split('@')[0] : ''}</div>
            </div>
          </div>
          {msgs.length ? msgs.map((m, i) => (
            <div key={m.id || i} className="reply-msg">
              <div className="reply-msg-head">
                <span className={`rtag ${tags[i].k}`}>{tags[i].label}</span>
                <span>{m.fromName ? m.fromName + ' ' : ''}&lt;{m.from}&gt;</span>
                <span className="reply-when">{new Date(m.date).toLocaleString()} · in {String(m.inbox).split('@')[0]}@</span>
              </div>
              <div className="reply-text">{String(m.text || '').trim() || '(no message text, likely an automated system email)'}</div>
            </div>
          )) : <div className="reply-msg"><div className="reply-text muted">Reply detected but the message text is older than 21 days or not yet loaded.</div></div>}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [replies, setReplies] = useState({});
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({ search_term: '', location: '', max_results: 30, leads_only: false });
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    minRatingOn: true, minRating: 4.0,
    minReviewsOn: true, minReviews: 1,
    minPhotosOn: true, minPhotos: 2,
    weakSitesOnly: false,
    requireEmail: true,
  });
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ emailed: 0, replied: 0, send_failed: 0 });
  const [scope, setScope] = useState(null); // null = show active job; else 'emailed'|'replied'|'send_failed' (global)
  const setF = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  // Poll jobs
  useEffect(() => {
    let on = true;
    const load = async () => {
      try {
        const d = await (await fetch('/api/jobs')).json();
        if (on && Array.isArray(d)) { setJobs(d); setActive(a => a || (d[0] && d[0].id) || null); }
      } catch {}
    };
    load();
    const t = setInterval(load, 1500);
    return () => { on = false; clearInterval(t); };
  }, []);

  // Poll leads: a global stat scope (replied/emailed/failed) when one is picked, else the active job
  useEffect(() => {
    const url = scope ? ('/api/leads?scope=' + scope) : (active ? ('/api/leads?job_id=' + active) : null);
    if (!url) { setLeads([]); return; }
    let on = true;
    const load = async () => {
      try {
        const d = await (await fetch(url)).json();
        if (on && Array.isArray(d)) setLeads(d);
      } catch {}
    };
    load();
    const t = setInterval(load, 2000);
    return () => { on = false; clearInterval(t); };
  }, [active, scope]);

  // Reply texts, loaded while the Replies view is open
  useEffect(() => {
    if (scope !== 'replied') return;
    let on = true;
    const load = async () => { try { const d = await (await fetch('/api/replies')).json(); if (on && d && !d.error) setReplies(d); } catch {} };
    load();
    const t = setInterval(load, 30000);
    return () => { on = false; clearInterval(t); };
  }, [scope]);

  // Poll global stats (emails sent, replies, failures)
  useEffect(() => {
    let on = true;
    const load = async () => { try { const d = await (await fetch('/api/stats')).json(); if (on && d) setStats(d); } catch {} };
    load();
    const t = setInterval(load, 3000);
    return () => { on = false; clearInterval(t); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.search_term.trim() || !form.location.trim()) return;
    setBusy(true);
    const flt = {
      minRating: filters.minRatingOn ? Number(filters.minRating) || 0 : 0,
      minReviews: filters.minReviewsOn ? parseInt(filters.minReviews) || 0 : 0,
      minPhotos: filters.minPhotosOn ? parseInt(filters.minPhotos) || 0 : 0,
      weakSitesOnly: !!filters.weakSitesOnly,
      requireEmail: !!filters.requireEmail,
    };
    const res = await fetch('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, render_mockups: !form.leads_only, filters: flt }),
    });
    const job = await res.json().catch(() => ({}));
    setBusy(false);
    if (job && job.id) { setActive(job.id); setJobs(prev => [job, ...prev]); setForm(f => ({ ...f, search_term: '' })); }
    else alert(job.error || 'Could not create job');
  };

  const sendLead = async (id) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: 'send_requested' } : l));
    await fetch('/api/leads/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  };
  const sendAll = async () => {
    if (!active) return;
    const sendable = l => l.status === 'mockup_ready' || l.status === 'send_failed';
    const n = leads.filter(sendable).length;
    if (!n || !confirm(`Queue ${n} lead${n > 1 ? 's' : ''} to send?`)) return;
    setLeads(prev => prev.map(l => sendable(l) ? { ...l, status: 'send_requested' } : l));
    await fetch('/api/leads/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: active }) });
  };

  const activeJob = jobs.find(j => j.id === active);
  const running = jobs.filter(j => j.status === 'scraping' || j.status === 'rendering').length;
  const mockupCount = useMemo(() => leads.filter(l => l.mockup_url).length, [leads]);
  const sendableCount = useMemo(() => leads.filter(l => l.status === 'mockup_ready' || l.status === 'send_failed').length, [leads]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-in">
          <div className="logo">S</div>
          <h1>Scale for Trades</h1>
          <span className="sub">Lead Engine</span>
          <span className="spacer" />
          <span className="live"><span className="pulse" />{running ? `${running} running` : 'idle'}</span>
        </div>
      </div>

      <div className="wrap">
        <div className="hero">
          <h2>Find leads</h2>
          <p>Type a niche and a city. Qualified businesses stream in below as they are found.</p>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div>
                <label>Search term</label>
                <input placeholder="hvac contractor" value={form.search_term}
                  onChange={e => setForm({ ...form, search_term: e.target.value })} />
              </div>
              <div>
                <label>Location</label>
                <input placeholder="Dallas, TX" value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label>Max</label>
                <input type="number" min="1" max="120" value={form.max_results}
                  onChange={e => setForm({ ...form, max_results: e.target.value })} />
              </div>
              <button className="go" disabled={busy}>{busy ? 'Starting…' : 'Find leads'}</button>
            </div>
            <div className="form-extras">
              <label className="leads-only">
                <input type="checkbox" checked={form.leads_only}
                  onChange={e => setForm({ ...form, leads_only: e.target.checked })} />
                <span>Leads only — skip mockup rendering (faster and cheaper)</span>
              </label>
              <button type="button" className="filter-toggle" onClick={() => setShowFilters(s => !s)}>
                {showFilters ? '▾' : '▸'} Filters
                <span className="filter-summary">{[
                  filters.minRatingOn && `★ ${filters.minRating}+`,
                  filters.minReviewsOn && `${filters.minReviews}+ reviews`,
                  filters.minPhotosOn && `${filters.minPhotos}+ photos`,
                  filters.weakSitesOnly && 'weak sites only',
                  filters.requireEmail && 'has email',
                ].filter(Boolean).join('  ·  ') || 'none'}</span>
              </button>
            </div>
            {showFilters && (
              <div className="filters-panel">
                <div className="filter-num">
                  <label className="fchk"><input type="checkbox" checked={filters.minRatingOn} onChange={e => setF('minRatingOn', e.target.checked)} /> Rating ≥</label>
                  <input className="fnum" type="number" step="0.1" min="0" max="5" value={filters.minRating} disabled={!filters.minRatingOn} onChange={e => setF('minRating', e.target.value)} />
                </div>
                <div className="filter-num">
                  <label className="fchk"><input type="checkbox" checked={filters.minReviewsOn} onChange={e => setF('minReviewsOn', e.target.checked)} /> Reviews ≥</label>
                  <input className="fnum" type="number" min="0" value={filters.minReviews} disabled={!filters.minReviewsOn} onChange={e => setF('minReviews', e.target.value)} />
                </div>
                <div className="filter-num">
                  <label className="fchk"><input type="checkbox" checked={filters.minPhotosOn} onChange={e => setF('minPhotosOn', e.target.checked)} /> Photos ≥</label>
                  <input className="fnum" type="number" min="0" value={filters.minPhotos} disabled={!filters.minPhotosOn} onChange={e => setF('minPhotos', e.target.value)} />
                </div>
                <label className="fchk wide"><input type="checkbox" checked={filters.weakSitesOnly} onChange={e => setF('weakSitesOnly', e.target.checked)} /> Weak / DIY sites only (Wix, GoDaddy, none)</label>
                <label className="fchk wide"><input type="checkbox" checked={filters.requireEmail} onChange={e => setF('requireEmail', e.target.checked)} /> Require a findable email</label>
              </div>
            )}
          </form>
        </div>

        <div className="stats">
          <div className="stat"><div className="n">{jobs.length}</div><div className="l">Jobs</div></div>
          <div className="stat"><div className="n">{running}</div><div className="l">Running</div></div>
          <div className="stat"><div className="n">{leads.length}</div><div className="l">Leads in view</div></div>
          <div className={`stat clickable ${scope === 'emailed' ? 'on' : ''}`} onClick={() => setScope(scope === 'emailed' ? null : 'emailed')}>
            <div className="n">{stats.emailed}</div>
            <div className="l">Emails sent {stats.send_failed ? <span className="stat-sub" onClick={(e) => { e.stopPropagation(); setScope(scope === 'send_failed' ? null : 'send_failed'); }}>· {stats.send_failed} failed</span> : null}</div>
          </div>
          <div className={`stat clickable ${scope === 'replied' ? 'on' : ''}`} onClick={() => setScope(scope === 'replied' ? null : 'replied')}>
            <div className="n">{stats.replied}</div><div className="l">Replies →</div>
          </div>
        </div>

        <div className="cols">
          <div>
            <div className="section-title">Jobs</div>
            {jobs.length === 0 && <div className="empty"><div className="big">No jobs yet</div>Run a search above to start.</div>}
            {jobs.map(j => (
              <div key={j.id} className={`job ${j.id === active ? 'active' : ''}`} onClick={() => setActive(j.id)}>
                <div className="t">{j.search_term}</div>
                <div className="m"><span>{j.location}</span><Badge status={j.status} /></div>
                <div className="m">
                  <span>{j.qualified_count || 0} qualified{j.raw_count ? ` · ${j.raw_count} scanned` : ''}</span>
                  {(j.status === 'scraping' || j.status === 'rendering') && <span>{j.stage}</span>}
                </div>
                {(j.status === 'scraping' || j.status === 'rendering') &&
                  <div className="bar"><i style={{ width: jobProgress(j) + '%' }} /></div>}
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="title">
                {scope
                  ? (scope === 'replied' ? 'Replied' : scope === 'emailed' ? 'Emails sent' : 'Send failed')
                  : (activeJob ? `${activeJob.search_term} · ${activeJob.location}` : 'Leads')}
              </span>
              <div className="ph-actions">
                <span className="note">
                  {scope ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}` :
                    (activeJob && (activeJob.status === 'scraping' || activeJob.status === 'rendering')
                      ? <><span className="spinner" />{activeJob.stage || activeJob.status}</>
                      : `${leads.length} leads · ${mockupCount} mockups`)}
                </span>
                {scope
                  ? <button className="sendall" onClick={() => setScope(null)}>← Back to jobs</button>
                  : (sendableCount > 0 && <button className="sendall" onClick={sendAll}>Send {sendableCount} ready</button>)}
              </div>
            </div>
            {leads.length === 0 ? (
              <div className="empty">
                <div className="big">{scope ? 'None yet' : (activeJob ? 'Waiting for the first lead…' : 'Select a job')}</div>
                {scope ? `No ${scope === 'replied' ? 'replies' : scope === 'emailed' ? 'sent emails' : 'failures'} yet.` : (activeJob ? 'Leads appear here the moment they qualify.' : 'Or run a new search.')}
              </div>
            ) : scope === 'replied' ? (
              <RepliesView leads={leads} replies={replies} />
            ) : (
              <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Mockup</th><th>Business</th><th>Email</th><th>Phone</th><th>Website</th><th>City</th><th>Platform</th><th>Rating</th><th>Sent from</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id}>
                      <td>
                        {l.mockup_url
                          ? <a href={l.mockup_url} target="_blank" rel="noreferrer"><img className="thumb" src={l.mockup_url} alt="mockup" /></a>
                          : l.status === 'rendering'
                            ? <div className="thumb-wrap"><span className="spinner" /></div>
                            : <div className="thumb-wrap" style={{ color: '#c2c9d3', fontSize: 12 }}>—</div>}
                      </td>
                      <td className="biz">{l.name}</td>
                      <td className="email">{l.email || '—'}</td>
                      <td className="nowrap">{l.phone || '—'}</td>
                      <td>
                        {l.website
                          ? <a className="email" href={l.website.startsWith('http') ? l.website : 'https://' + l.website} target="_blank" rel="noreferrer">{l.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
                          : '—'}
                      </td>
                      <td className="nowrap">{l.city || '—'}</td>
                      <td>{l.platform || '—'}</td>
                      <td className="rating">{l.rating ? <>{l.rating} <span className="star">★</span></> : '—'}</td>
                      <td className="nowrap sentfrom">{l.sent_from && l.sent_from !== 'suppressed' ? l.sent_from.split('@')[0] : '—'}</td>
                      <td>
                        <div className="statuscell">
                          <Badge status={l.status} />
                          {l.replied_at && <span className="badge replied">replied</span>}
                          {l.status === 'mockup_ready' && <button className="send-btn" onClick={() => sendLead(l.id)}>Send</button>}
                          {l.status === 'send_failed' && <button className="send-btn retry" onClick={() => sendLead(l.id)}>Retry</button>}
                        </div>
                        {l.status === 'send_failed' && l.send_error && <div className="send-err" title={l.send_error}>{l.send_error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
