/* ================= Maya 24/7 (the Gmail script runs her when no device is open) ================= */
const WK={status:null,at:0,err:'',busy:false};
async function workerRefresh(){
  if(!cloudOn()||WK.busy)return;WK.busy=true;
  try{const r=await bridge('worker_status',{},cm().acct);WK.status=r;WK.err=''}catch(e){WK.status=null;WK.err=bridgeErr(e)}
  finally{WK.busy=false;WK.at=Date.now();render()}
}
async function workerToggle(on){
  const a=acctList().find(x=>x.id===cm().acct);if(!a){toast('Turn on cloud save first.');return}
  state.busy.worker={label:on?`Turning on ${negName()} 24/7…`:'Turning it off…'};render();
  try{const r=await bridge('worker_setup',{on,acct:a.id,url:a.url,every:5},a.id);if(!r.ok)throw {code:'bridge_err',message:r.error||'error'};
    state.settings.worker={on:!!on,at:nowISO()};fullAuto(!!on);saveSettings();
    toast(on?`${negName()} 24/7 is on, and she’s fully automatic: she sends offers, replies and follow-ups herself, within your limits. She still stops for you near your ceiling.`:`${negName()} 24/7 is off. She’ll draft and wait for you to press Send.`,7000);WK.at=0;await workerRefresh()}
  catch(e){toast(bridgeErr(e),6200)}finally{delete state.busy.worker;render()}
}
/* 24/7 means fully automatic: autopilot on for every open deal (wholesaler deals too), drafts already waiting get sent */
function fullAuto(on){const A=state.settings.auto;
  if(on){A.enabled=true;A.newDealsOn=true;A.wsAuto=true;for(const d of Object.values(state.deals)){if(d.example||d.optedOut||!['new','sent','negotiating'].includes(d.stage||'new'))continue;d.autopilot=true}persist('deals')}
  else{A.enabled=false;A.wsAuto=false}}
function workerCardHTML(){
  const n=esc(negName());const head=(pill)=>`<div class="card-head"><span class="ci grad">${ico('bolt')}</span><div><h2>${n} 24/7</h2><p>Fully automatic: sends offers, answers, follows up and pulls in new deals, even with every device closed</p></div><div class="ch-r">${pill||''}</div></div>`;
  if(!cloudOn())return `<section class="conn-card" id="conn-247">${head('<span class="pill slate">Off</span>')}<p class="small">Turn on cloud save above first. ${n} 24/7 runs inside the same Gmail script, using your cloud copy of the desk.</p></section>`;
  if(!WK.busy&&Date.now()-WK.at>90e3)setTimeout(workerRefresh,0);
  const info=acctInfo(cm().acct)||{};const old=(info.version||1)<4||/older version/.test(WK.err);
  const s=WK.status||{};const on=!!s.on;const w=state.conn.worker;const last=s.last||null;
  const pill=old?'<span class="pill orange">Update the script</span>':on?'<span class="pill green">On</span>':'<span class="pill slate">Off</span>';
  const lastLine=w?`Last worked ${ago(w.at)}: ${[w.sent?`${w.sent} sent`:'',w.replies?`${w.replies} repl${w.replies===1?'y':'ies'} in`:'',w.campaign?`${w.campaign} campaign email${w.campaign===1?'':'s'}`:'',w.needs?`${w.needs} waiting for you`:'',w.imported?`${w.imported} new deal${w.imported===1?'':'s'}`:''].filter(Boolean).join(', ')||'nothing needed doing'}.`:'';
  return `<section class="conn-card" id="conn-247">${head(pill)}
    ${old?`<div class="note amber">Your Gmail script is an older version. Copy the bridge code again (Gmail card, step 2), paste it over the old code in Apps Script, then Deploy → Manage deployments → Edit → New version → Deploy, and click Allow when Google asks. Then press Test on the Gmail card.</div>`:''}
    <ul class="small" style="margin:0 0 10px;padding-left:18px;display:grid;gap:4px">
      <li>Every 5 minutes your Gmail script takes a quick look: is a device open? any new email? anything due? Most checks take a second.</li>
      <li>When there’s work and no device has OfferDesk open, it runs ${n}: opening offers, replies within your limits, follow-ups, campaign emails, new wholesaler deals, and the morning brief data. You don’t press Send; she still stops for you near your ceiling.</li>
      <li>Deep photo inspections and web research wait for the next time you open OfferDesk (they take longer than Google allows per step).</li></ul>
    ${on?`<p class="small"><b>Last check:</b> ${s.lastTick?ago(new Date(s.lastTick).toISOString()):'not yet'}${s.next&&s.next>Date.now()?` · next planned work ${fmtWhen(new Date(s.next).toISOString())}`:''}${s.left!=null?` · ${s.left} emails left today`:''}</p>${lastLine?`<p class="small">${esc(lastLine)}</p>`:''}${last&&last.warn&&last.warn.length?`<div class="note amber small">${esc(last.warn.slice(0,2).join(' · '))}</div>`:''}`:''}
    ${WK.err&&!old?`<div class="note amber small">${esc(WK.err)}</div>`:''}
    <div class="row" style="gap:8px">${old?'':on?`<button class="btn sm" data-act="worker-off" ${state.busy.worker?'disabled':''}>Turn off</button><button class="btn ghost sm" data-act="worker-refresh">${ico('refresh')}Refresh</button>`:`<button class="btn primary sm" data-act="worker-on" ${state.busy.worker?'disabled':''}>${ico('bolt')}Turn on ${n} 24/7</button>`}${busyHTML('worker',false)}</div>
    <p class="xs muted">Free on Google’s side: a regular Gmail account gets 90 minutes of script time a day, Google Workspace 6 hours. Claude usage is the same as when OfferDesk is open.</p></section>`;
}
