/* ================= Maya's morning brief ================= */
/* The app works out what matters; the Google script emails it every morning (even with no device open). */
function buildBrief(){
  const ds=Object.values(state.deals).filter(d=>!d.example&&!['dead','closed'].includes(d.stage));const now=Date.now();
  const a=d=>streetOf(d.address)||'Untitled deal';const k=counts();
  const needs=ds.filter(d=>d.needsYou&&d.draft).map(d=>({id:d.id,addr:a(d),why:d.needsYou,their:lastTheirPrice(d),draft:d.draft.price??null}));
  const replies=ds.filter(d=>replyWaiting(d)&&!(d.needsYou&&d.draft)).map(d=>({id:d.id,addr:a(d),at:lastAt(ins(d)),their:lastTheirPrice(d)}));
  const follow=ds.filter(d=>{const f=followDue(d);return f&&f.overdue&&!(d.autopilot&&state.settings.auto.enabled)}).map(d=>({id:d.id,addr:a(d),step:followDue(d).step+1}));
  const scored=ds.map(d=>{const S=dealScore(d,null,true);return S?{d,S}:null}).filter(Boolean).sort((x,y)=>y.S.score-x.S.score);
  const top=scored.filter(x=>x.S.score>=65||(x.S.at80&&x.S.at80>=x.S.basis*.85)).slice(0,5).map(({d,S})=>({id:d.id,addr:a(d),score:S.score,grade:S.grade[0],best:STRAT_LABEL[S.best],basis:S.basis,at80:S.at80,source:d.source}));
  const newDeals=ds.filter(d=>now-new Date(d.created).getTime()<=36*3600e3).map(d=>{const S=dealScore(d);return {id:d.id,addr:a(d),src:d.source==='wholesaler'?(d.wholesalerName||'wholesaler'):'listing',asking:curList(d),score:S?S.score:null}});
  const drops=ds.filter(d=>{const h=d.priceHistory||[];return h.length>1&&h[h.length-1].price<h[h.length-2].price&&now-new Date(h[h.length-1].date).getTime()<=8*DAY}).map(d=>{const h=d.priceHistory;return {id:d.id,addr:a(d),from:h[h.length-2].price,to:h[h.length-1].price}});
  const contract=ds.filter(d=>d.stage==='contract').map(d=>({id:d.id,addr:a(d)}));
  const agents=[...new Set(ds.filter(d=>ourCount(d)&&d.agent&&d.agent.email).map(d=>d.agent.email.trim().toLowerCase()))].slice(0,60);
  const statsLine=`${k.live} live offers · ${k.auto} on autopilot · ${contract.length} under contract`;
  return {at:nowISO(),neg:negName(),url:ONLINE_URL,needs,replies,follow,top,newDeals,drops,contract,agents,statsLine};
}
async function pushBrief(force){
  if(!cloudOn())return false;const b=buildBrief();const h=hashOf(Object.assign({},b,{at:0}));const c=cm();
  if(!force&&c.h.brief===h&&Date.now()-(c.briefAt||0)<6*3600e3)return true;
  for(let i=0;i<2;i++){
    const r=await bridge('cloud_put',{parts:{brief:{base:c.revs.brief||0,data:{t:Date.now(),v:b}}}},c.acct);
    if(r.revs&&r.revs.brief){c.revs.brief=r.revs.brief;c.h.brief=h;c.briefAt=Date.now();saveCM();return true}
    if(r.conflicts&&r.conflicts.brief!=null)c.revs.brief=r.conflicts.brief;else break;
  }
  return false;
}
function briefTo(){return ((state.settings.notify||{}).email||state.settings.profile.email||'').trim()}
async function briefSync(){
  const B=state.settings.brief||{};if(!cloudOn())return;
  const want=JSON.stringify({on:!!B.on,hour:B.hour??8,tz:B.tz||Intl.DateTimeFormat().resolvedOptions().timeZone,email:briefTo()});
  if(cm().briefSetup===want)return;
  try{const r=await bridge('brief_setup',JSON.parse(want),cm().acct);if(r.ok){cm().briefSetup=want;saveCM()}}catch(e){logActivity(null,'warn','Couldn’t schedule the morning brief: '+bridgeErr(e))}
}
function briefCardHTML(){
  const b=buildBrief();const n=esc(negName());const B=state.settings.brief||{};
  const li=(x,t)=>`<li><a href="#deal/${x.id}">${esc(x.addr)}</a>${t?` <span class="muted">· ${t}</span>`:''}</li>`;
  const parts=[];
  if(b.top.length)parts.push(`<div><b>Worth a look</b><ul>${b.top.map(x=>li(x,`score ${x.score} (${esc(x.best)})${x.at80&&x.at80<x.basis?` · 80+ at ${moneyK(x.at80)}`:''}`)).join('')}</ul></div>`);
  if(b.newDeals.length)parts.push(`<div><b>New since yesterday</b><ul>${b.newDeals.slice(0,5).map(x=>li(x,`${esc(x.src)}${x.score!=null?` · score ${x.score}`:''}`)).join('')}</ul></div>`);
  if(b.drops.length)parts.push(`<div><b>Price drops this week</b><ul>${b.drops.slice(0,5).map(x=>li(x,`${moneyK(x.from)} → ${moneyK(x.to)}`)).join('')}</ul></div>`);
  const sched=!cloudOn()?`Turn on <a href="#settings/connections/conn-cloud">cloud save</a> and ${n} emails this to you every morning, even when no device is open.`:B.on?`${n} emails this to ${esc(briefTo()||'you')} every day at ${B.hour??8}:00.`:`The morning email is off (Settings → ${n} & you).`;
  return `<section class="card" id="brief"><div class="card-head"><span class="ci amber">${ico('spark')}</span><div><h2>${n}’s morning brief</h2><p>${esc(b.statsLine)}</p></div>${cloudOn()&&briefTo()?`<div class="ch-r"><button class="btn sm" data-act="brief-test" ${state.busy.brief?'disabled':''}>${ico('mail')}Email it to me now</button></div>`:''}</div>
  ${busyHTML('brief',false)}
  ${parts.length?`<div class="brief-cols">${parts.join('')}</div>`:`<p class="small muted">Nothing stands out yet. As deals come in, the best-scoring ones, new deals and price drops show up here.</p>`}
  <p class="xs muted">${sched}</p></section>`;
}
function briefSettingsHTML(){
  const B=state.settings.brief||{};const n=esc(negName());const tz=B.tz||Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `<section class="card" id="brief-settings"><div class="card-head"><span class="ci amber">${ico('clock')}</span><div><h2>Morning brief</h2><p>${n} emails you what needs attention and the deals worth a look</p></div><div class="ch-r">${switchHTML(!!B.on,'brief-toggle',null,'Morning brief')}</div></div>
  <div class="grid-fields"><label class="field"><span>Send at</span><select class="input" id="st-brief-hour" data-fs="brief.hour" data-t="num">${Array.from({length:24},(_,h)=>`<option value="${h}" ${(B.hour??8)===h?'selected':''}>${(h%12||12)+':00 '+(h<12?'AM':'PM')}</option>`).join('')}</select></label><label class="field"><span>Time zone</span><input class="input" id="st-brief-tz" data-fs="brief.tz" data-t="text" value="${esc(B.tz||'')}" placeholder="${esc(tz)}"></label></div>
  <p class="small muted">${!cloudOn()?`Needs cloud save (Connect → Cloud save): your Google script reads your desk from Drive and sends the email even when no device is open.`:briefTo()?`Goes to ${esc(briefTo())} (the email in “${n} pings you”). It also checks your Gmail for agent replies that came in overnight.`:`Add your email in “${n} pings you” above.`}</p></section>`;
}
