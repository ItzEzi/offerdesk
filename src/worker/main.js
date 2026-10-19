/* ---- Maya 24/7 entry point: one run of the same work an open device does every few minutes ---- */
function toast() {}
function render() {}
function doRender() {}
function go() {}
function cloudBits() {}
function deviceLabel() { return 'Maya 24/7 (your Gmail script)'; }
function workerNextDue() {
  let t = Infinity; const now = Date.now();
  if (state.settings.auto.enabled && state.settings.auto.followUps) for (const d of Object.values(state.deals)) { if (!d.autopilot || d.example) continue; const f = followDue(d); if (f && f.due < t) t = f.due; }
  for (const c of cpList()) {
    const q = c.items.filter(i => i.status === 'queued'); if (c.status !== 'running' || !q.length) continue;
    t = Math.min(t, q.some(i => cpCanSendNow(c, i)) ? Math.max(now + 60e3, cpNextSlot(c)) : now + 30 * 60e3);
  }
  return isFinite(t) ? Math.max(t, now + 60e3) : null;
}
async function workerRun(cfg) {
  const t0 = Date.now(); const since = new Date(t0).toISOString();
  WORKER.on = true; WORKER.deadline = cfg.deadline || t0 + 270e3;
  const out = { ok: false, at: since, sent: 0, replies: 0, needs: 0, campaign: 0, imported: 0, warn: [], skipped: '' };
  try {
    localStorage.setItem(SECRET_KEY, JSON.stringify({ accounts: [{ id: cfg.acct, url: cfg.url }], bridgeKey: cfg.key }));
    localStorage.setItem(SYNC_KEY, JSON.stringify({ on: true, acct: cfg.acct }));
    CM = null; cloudBaseline();
    if (!(await cloudSync())) throw new Error('cloud sync failed: ' + (CM.err || 'unknown'));
    state.loaded = true;
    if (!Object.keys(state.deals).length && !cpList().length) { out.skipped = 'no deals yet'; out.ok = true; return out; }
    if (!(await cloudLease())) { const L = CM.lease || {}; out.skipped = 'active device: ' + (L.label || 'another device'); out.ok = true; return out; }
    const before = Object.keys(state.deals).length;
    if (gmailOn() && state.settings.conn.autoCheck !== false && !timeUp()) await syncAll(false);
    if (state.settings.auto.enabled && aiOn() && !timeUp()) await autopilotRun(false);
    if (!timeUp() && cpList().some(c => c.status === 'running')) out.campaign = await campaignTick();
    try { await pushBrief(); } catch (e) {}
    const acts = state.activity.filter(a => a.at >= since);
    out.sent = acts.filter(a => a.kind === 'sent').length; out.replies = acts.filter(a => a.kind === 'reply').length; out.needs = acts.filter(a => a.kind === 'needs').length;
    out.warn = acts.filter(a => a.kind === 'warn').map(a => a.text).slice(0, 5); out.imported = Math.max(0, Object.keys(state.deals).length - before);
    out.nextDue = workerNextDue();
    state.conn.worker = { at: nowISO(), sent: out.sent, replies: out.replies, needs: out.needs, campaign: out.campaign, imported: out.imported, nextDue: out.nextDue };
    saveConn(); flushAll(); await cloudSync();
    try { await bridge('lease', { device: DEVICE_ID, release: true }, CM.acct); } catch (e) {}
    out.ok = true;
  } catch (e) { out.warn.push(String((e && (e.message || e.code)) || e)); }
  finally { WORKER.on = false; __timers.length = 0; }
  return out;
}
