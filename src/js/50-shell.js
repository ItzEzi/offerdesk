/* ================= render core ================= */
let rq=false;
function render(){if(rq)return;rq=true;requestAnimationFrame(()=>{rq=false;doRender()})}
function doRender(){
  const ae=document.activeElement;
  const fid=ae&&ae.id&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)?ae.id:null;
  const fval=fid?ae.value:null;let sel=null;try{if(fid&&ae.type!=='number'&&ae.type!=='range')sel=[ae.selectionStart,ae.selectionEnd]}catch(e){}
  const scrolls={};document.querySelectorAll('[data-keep-scroll]').forEach(el=>{if(el.id)scrolls[el.id]=[el.scrollTop,el.scrollLeft]});
  const opens={};document.querySelectorAll('details[id]').forEach(el=>{opens[el.id]=el.open});
  const y=window.scrollY;
  $('#topbar').innerHTML=topbarHTML();
  $('#alertbar').innerHTML=alertHTML();
  $('#main').innerHTML=state.loaded?viewHTML():`<div class="wrap page"><div class="busy"><div class="spin"></div>Opening your desk…</div></div>`;
  $('#modal-root').innerHTML=modalHTML();
  for(const [id,[t,l]] of Object.entries(scrolls)){const el=document.getElementById(id);if(el){el.scrollTop=t;el.scrollLeft=l}}
  for(const [id,o] of Object.entries(opens)){const el=document.getElementById(id);if(el)el.open=o}
  window.scrollTo(0,y);
  if(fid){const el=document.getElementById(fid);if(el){if(el.type!=='checkbox'&&el.type!=='file'&&el.value!==fval)el.value=fval;el.focus({preventScroll:true});try{if(sel&&sel[0]!=null)el.setSelectionRange(sel[0],sel[1])}catch(e){}}}
  document.querySelectorAll('[data-stick]').forEach(el=>el.scrollTop=el.scrollHeight);
  const n=counts();const tot=n.reply+n.draft;document.title=(tot?`(${tot}) `:'')+'OfferDesk';
}
function viewHTML(){
  switch(state.view){case 'listings':return viewListings();case 'leads':return viewLeads();case 'deal':return viewDeal();case 'practice':return viewPractice();case 'stats':return viewStats();case 'settings':return viewSettings();default:return viewDashboard()}
}
function counts(){
  const ds=Object.values(state.deals);
  return {
    reply:ds.filter(d=>replyWaiting(d)&&!d.draft&&!(d.autopilot&&state.settings.auto.enabled)).length,
    draft:ds.filter(d=>d.draft&&!['dead','closed'].includes(d.stage)).length,
    follow:ds.filter(d=>{const f=followDue(d);return f&&f.overdue}).length,
    ws:ds.filter(d=>d.source==='wholesaler'&&d.stage==='new'&&!d.reviewed).length,
    newMail:Object.values(state.mail.emails).filter(e=>e.status==='new').length,
    live:ds.filter(d=>['sent','negotiating'].includes(d.stage)).length,
    contract:ds.filter(d=>d.stage==='contract').length,
    auto:ds.filter(d=>d.autopilot&&!['dead','closed'].includes(d.stage)).length
  };
}

/* ================= top bar, alert, bell ================= */
function topbarHTML(){
  const k=counts();const n=esc(negName());
  const items=[['dashboard','Dashboard','dashboard',k.reply+k.draft],['listings','Listings','listings',0],['leads','Inbox Leads','leads',k.ws+k.newMail],['practice','Practice','practice',0],['stats','Stats','stats',0],['settings','Connect','settings',(aiOn()&&gmailOn())?0:1]];
  const live=state.settings.auto.enabled&&aiOn();
  const st=!aiOn()?['warn','needs a key']:live?['live','autopilot on']:['on','ready'];
  const cur=state.view==='deal'?'listings':state.view;
  const unseen=unseenCount();
  return `<div class="wrap">
    <a class="logo" href="#dashboard" aria-label="OfferDesk home"><span class="logo-mark">${ico('logo')}</span><span>Offer<b>Desk</b></span></a>
    <nav class="nav" aria-label="Main">${items.map(([v,l,ic,c])=>`<a href="#${v}" ${cur===v?'aria-current="page"':''}>${ico(ic)}${l}${c?`<span class="nb">${c}</span>`:''}</a>`).join('')}</nav>
    <div class="top-right">
      <a class="maya-pill" href="#settings/connections" title="${n}: ${st[1]}"><span class="avatar">${n[0]||'M'}</span><span class="dot ${st[0]}"></span><span class="lbl">${n} · ${st[1]}</span></a>
      ${cloudOn()?`<a class="icon-btn cloud-btn" href="#settings/connections/conn-cloud" aria-label="Cloud save" title="Cloud save">${ico('cloud')}<span data-cloud-dot class="dot ${cloudDotCls()}"></span></a>`:''}
      <button class="icon-btn" data-act="bell" aria-label="Activity" aria-expanded="${state.bellOpen}">${ico('bell')}${unseen?`<span class="count">${unseen>99?'99+':unseen}</span>`:''}</button>
      ${state.bellOpen?bellHTML():''}
    </div></div>`;
}
const ACT_STYLE={sent:['send','var(--s-purple)'],reply:['chat','var(--s-green)'],needs:['bolt','var(--s-orange)'],deal:['leads','var(--s-blue)'],warn:['close','var(--s-red)'],info:['spark','var(--s-slate)']};
function bellHTML(){
  const list=state.activity.slice(0,30);
  return `<div class="bell-pop" role="dialog" aria-label="Activity"><div class="bh"><b>${esc(negName())}’s activity</b>${state.settings.auto.enabled?'<span class="tag purple">Autopilot on</span>':'<span class="tag">Autopilot off</span>'}</div>
  ${list.length?list.map(a=>{const s=ACT_STYLE[a.kind]||ACT_STYLE.info;return `<button class="act-row" ${a.dealId&&state.deals[a.dealId]?`data-act="open" data-id="${a.dealId}"`:''}><span class="ai" style="background:${s[1]}">${ico(s[0])}</span><span><span class="small" style="display:block">${esc(a.text)}</span><span class="xs muted">${ago(a.at)}</span></span></button>`}).join(''):`<p class="small muted" style="padding:16px">Nothing yet. When ${esc(negName())} sends offers or agents reply, it shows up here.</p>`}</div>`;
}
function alertHTML(){
  const k=counts();const n=esc(negName());const parts=[];
  if(location.protocol==='file:')return `<div class="alertbar"><div class="wrap">${ico('refresh')} This is a downloaded copy that won\u2019t update. Use the online version instead: <a href="${ONLINE_URL}" target="_blank" rel="noopener" style="text-transform:none;letter-spacing:0">${ONLINE_URL.replace('https://','')}</a></div></div>`;
  if(!aiOn())return `<div class="alertbar"><div class="wrap">${ico('bolt')} ${n} needs your Anthropic API key before she can work. <a href="#settings/connections">Connect ›</a></div></div>`;
  if(k.reply)parts.push(`${k.reply} agent${k.reply>1?'s':''} replied — your turn to respond`);
  const needs=Object.values(state.deals).filter(d=>d.needsYou&&d.draft).length;
  if(needs)parts.push(`${needs} draft${needs>1?'s':''} waiting for your OK`);
  else if(k.draft)parts.push(`${k.draft} draft${k.draft>1?'s':''} ready to send`);
  if(!parts.length)return '';
  return `<div class="alertbar"><div class="wrap">${ico('chat')} ${parts.join(' · ')} <a href="#dashboard">Review ›</a></div></div>`;
}
function hero(cls,title,sub,meta,right,extra){return `<section class="hero ${cls}"><div><h1>${title}${extra||''}</h1>${sub?`<p class="sub">${sub}</p>`:''}${meta?`<div class="meta">${meta}</div>`:''}</div>${right?`<div class="h-right">${right}</div>`:''}</section>`}
function emptyHTML(icon,title,text,btns){return `<div class="empty"><span class="card-head"><span class="ci grad">${ico(icon)}</span></span><h3>${title}</h3><p class="muted" style="max-width:62ch">${text}</p>${btns?`<div class="row" style="justify-content:center">${btns}</div>`:''}</div>`}
function switchHTML(on,act,id,label){return `<button class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label||'Autopilot')}" data-act="${act}" ${id?`data-id="${id}"`:''}></button>`}
function thumbHTML(d,cls){const s=thumbSrc(d);return s?`<img class="thumb ${cls||''}" src="${esc(s)}" alt="" loading="lazy">`:`<span class="thumb ${cls||''}">${ico('home')}</span>`}

/* ================= dashboard ================= */
function viewDashboard(){
  const ds=Object.values(state.deals);const k=counts();const n=esc(negName());const p=state.settings.profile;
  const h=new Date().getHours();const greet=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  const offered=ds.filter(d=>ourCount(d)&&!d.example);const replied=offered.filter(d=>ins(d).some(m=>m.at>firstOfferAt(d)));
  const meta=`<span><span class="dot ${aiOn()?(state.settings.auto.enabled?'live':'on'):'warn'}"></span>${n} ${aiOn()?(state.settings.auto.enabled?'on autopilot':'ready'):'needs a key'}</span><span><span class="dot ${gmailOn()?'on':'warn'}"></span>Gmail ${gmailOn()?'connected':'not connected'}</span><span><span class="dot ${smsOn()||gvOn()?'on':''}"></span>Texts ${smsOn()?'via Twilio':gvOn()?'via Google Voice':'from your phone'}</span><span><span class="dot ${cloudOn()?(cm().err?'warn':'on'):''}"></span>Cloud ${cloudOn()?'save on':'save off'}</span>${state.mail.lastSync?`<span>${ico('refresh')}Checked ${ago(state.mail.lastSync)}</span>`:''}`;
  const right=`<div class="h-stat"><b class="tnum">${k.live}</b><span>live offers</span></div><div class="h-stat"><b class="tnum">${offered.length?pct(replied.length/offered.length,0):'—'}</b><span>reply rate</span></div>${gmailOn()?`<button class="btn-ghost-w" data-act="sync" ${state.syncing?'disabled':''}>${ico('refresh')}${state.syncing?'Checking…':'Check now'}</button>`:''}<button class="btn-white" data-act="add-deal">${ico('plus')}Add listing</button>`;
  const head=hero('g-dash',`${greet}${p.name?', '+esc(p.name.split(' ')[0]):''}`,`Here’s where every offer stands and what needs you.`,meta,right);
  const setup=setupHTML();
  const tiles=[['Replies waiting',k.reply,'chat','blue','#dashboard/needs'],['Drafts to approve',k.draft,'edit','purple','#dashboard/needs'],['Follow-ups due',k.follow,'clock','amber','#dashboard/needs'],['On autopilot',k.auto,'bolt','pink','#listings'],['Under contract',k.contract,'check','green','#listings'],['New wholesaler deals',k.ws,'leads','orange','#leads']];
  const strip=`<div class="statstrip">${tiles.map(([l,v,i,c,href])=>`<a class="sstat" href="${href}"><span class="ic" style="background:var(--b-${c});color:var(--t-${c})">${ico(i)}</span><span><b class="tnum">${v}</b><span>${l}</span></span></a>`).join('')}</div>`;
  if(!ds.length)return `<div class="wrap page">${head}${setup}${emptyHTML('home','No deals on your desk yet',`Add a listing (paste it from Zillow or Redfin and ${n} reads it), or connect Gmail so wholesaler deals land here on their own.`,`<button class="btn primary" data-act="add-deal">${ico('plus')}Add your first listing</button><a class="btn" href="#leads">Inbox Leads</a>`)}</div>`;
  const todo=[];
  for(const d of ds){
    if(d.draft&&!['dead','closed'].includes(d.stage))todo.push({d,c:d.needsYou?'orange':'purple',pri:d.needsYou?0:1,label:d.needsYou?`${negName()} needs your OK: ${d.needsYou}`:`Draft ready: ${ACTION_LABEL[d.draft.action||d.draft.kind]||'message'}${d.draft.price!=null?' at '+money(d.draft.price):''}`,btn:'Review'});
    else if(replyWaiting(d))todo.push({d,c:'blue',pri:0,label:`Reply waiting · ${(ins(d).slice(-1)[0]||{}).channel==='sms'?'text':'email'} ${ago(lastAt(ins(d)))}${d.autopilot&&state.settings.auto.enabled?` · ${negName()} will answer`:''}`,btn:`Ask ${negName()}`});
    const f=followDue(d);if(f&&f.overdue&&!(d.autopilot&&state.settings.auto.enabled))todo.push({d,c:'amber',pri:2,label:`Follow-up #${f.step+1} due · no reply in ${daysSince(lastAt(outs(d)))} days`,btn:'Draft follow-up'});
    if(d.source==='wholesaler'&&d.stage==='new'&&!d.reviewed)todo.push({d,c:'orange',pri:3,label:`New wholesaler deal · ${verdict(d,calc(d)).text}`,btn:'Review'});
  }
  todo.sort((a,b)=>a.pri-b.pri);
  const todoHTML=todo.length?`<div class="todo">${todo.slice(0,12).map(t=>`<div class="todo-row">${thumbHTML(t.d)}<div class="what"><b>${esc(streetOf(t.d.address)||'Untitled deal')}</b><span class="small"><span class="tag ${t.c}">${esc(t.label)}</span></span></div><button class="btn sm ${t.pri===0?'primary':''}" data-act="open" data-id="${t.d.id}">${esc(t.btn)}</button></div>`).join('')}</div>`:`<div class="note green">Nothing needs you right now. ${state.settings.auto.enabled?`${n} is working the pipeline.`:'Turn on autopilot and '+n+' works the pipeline for you.'}</div>`;
  const acts=state.activity.slice(0,8);
  const feed=acts.length?`<div class="todo">${acts.map(a=>{const s=ACT_STYLE[a.kind]||ACT_STYLE.info;return `<button class="act-row" style="border:1px solid var(--line);border-radius:12px" ${a.dealId&&state.deals[a.dealId]?`data-act="open" data-id="${a.dealId}"`:''}><span class="ai" style="background:${s[1]}">${ico(s[0])}</span><span><span class="small" style="display:block">${esc(a.text)}</span><span class="xs muted">${ago(a.at)}</span></span></button>`}).join('')}</div>`:`<p class="small muted">${n}’s sends, agents’ replies and new deals show up here.</p>`;
  const live=ds.filter(d=>['sent','negotiating'].includes(d.stage));
  const liveHTML=live.length?`<section class="card"><div class="card-head"><span class="ci blue">${ico('trend')}</span><div><h2>Live offers</h2><p>Blue dot: your offer · ring: their number · red line: your ceiling</p></div></div><div class="tbl-wrap" style="border:0"><table class="tbl" style="min-width:720px"><thead><tr><th>Property</th><th class="r">Asking</th><th class="r">Your last</th><th class="r">Their last</th><th class="r">Ceiling</th><th style="width:32%">Where it stands</th></tr></thead><tbody>${live.map(d=>{const c=calc(d);return `<tr data-act="open" data-id="${d.id}"><td><div class="prop">${thumbHTML(d)}<div><b>${esc(streetOf(d.address))}</b><span class="ps">${esc(STAGE_LABEL[d.stage])}</span></div></div></td><td class="r ask tnum">${moneyK(curList(d))}</td><td class="r offer tnum">${moneyK(lastOurPrice(d))}</td><td class="r tnum">${moneyK(lastTheirPrice(d))}</td><td class="r ceil tnum">${c.ready?moneyK(c.mao):'—'}</td><td>${railHTML(d,c,true)}</td></tr>`}).join('')}</tbody></table></div></section>`:'';
  return `<div class="wrap page">${head}${setup}${briefCardHTML()}${strip}<div class="split"><section class="card" id="needs"><div class="card-head"><span class="ci orange">${ico('bolt')}</span><div><h2>Needs you</h2><p>Replies, drafts and follow-ups, most urgent first</p></div></div>${todoHTML}</section><section class="card"><div class="card-head"><span class="ci grad">${ico('spark')}</span><div><h2>${n}’s activity</h2><p>What she did and what came in</p></div></div>${feed}</section></div>${liveHTML}</div>`;
}
function setupHTML(){
  const steps=[[aiOn(),`Give ${esc(negName())} a brain`,'Add your Anthropic API key','#settings/connections'],[gmailOn(),'Connect Gmail','So she can send emails and read replies','#settings/connections'],[cloudOn(),'Turn on cloud save','Your desk on every device, saved in Google Drive','#settings/connections/conn-cloud'],[smsOn()||gvOn(),'Connect texting','Twilio or Google Voice for automatic texts','#settings/connections'],[!!state.settings.profile.phone&&!!state.settings.profile.name,'Fill in your details','Name and US phone for signatures','#settings/maya'],[state.settings.auto.enabled,'Turn on autopilot','She sends, follows up and negotiates for you','#settings/autopilot']];
  const done=steps.filter(s=>s[0]).length;if(done===steps.length)return '';
  return `<section class="card"><div class="card-head"><span class="ci purple">${ico('check')}</span><div><h2>Get set up</h2><p>${done} of ${steps.length} done</p></div></div><div class="opts">${steps.map(([ok,t,s,href])=>`<a class="opt" href="${href}" style="text-decoration:none;color:inherit;${ok?'opacity:.6':''}"><b>${ok?'✓ ':''}${t}</b><span class="small muted">${s}</span></a>`).join('')}</div></section>`;
}

/* ================= price rail ================= */
function railHTML(d,c,mini){
  if(!c.ready)return mini?'<span class="small muted">Needs ARV</span>':`<div class="note">Add an ARV to set your ceiling.</div>`;
  const L=curList(d),our=(d.offers||[]).filter(o=>o.by==='us'),their=(d.offers||[]).filter(o=>o.by==='them');
  const vals=[c.opening,c.mao,L,...our.map(o=>o.price),...their.map(o=>o.price)].filter(v=>v!=null&&v>0);
  let lo=Math.min(...vals),hi=Math.max(...vals);const pad=(hi-lo)*.06||hi*.05;lo-=pad;hi+=pad;
  const X=v=>(v-lo)/(hi-lo)*100;const xs=v=>X(v).toFixed(2)+'%';
  let h=`<div class="rail ${mini?'rail-mini':''}" ${mini?'style="padding:0"':''}><div class="rail-track"><div class="rail-zone" style="left:${xs(Math.min(c.opening,c.mao))};width:${Math.abs(X(c.mao)-X(c.opening)).toFixed(2)}%"></div>`;
  if(!our.length)h+=`<i class="rail-pin open" style="left:${xs(c.opening)}" title="Opening ${money(c.opening)}"></i>`;
  our.forEach(o=>h+=`<i class="rail-pin ours" style="left:${xs(o.price)}" title="You ${money(o.price)}"></i>`);
  their.forEach(o=>h+=`<i class="rail-pin theirs" style="left:${xs(o.price)}" title="Them ${money(o.price)}"></i>`);
  if(L)h+=`<i class="rail-pin list" style="left:${xs(L)}" title="Asking ${money(L)}"></i>`;
  h+=`<i class="rail-ceil" style="left:${xs(c.mao)}" title="Ceiling ${money(c.mao)}"></i></div>`;
  if(!mini){
    const labs=[{v:c.mao,t:'Ceiling',cls:'c',pos:'top',p:0}];
    if(L)labs.push({v:L,t:'Asking',pos:'top',p:1});
    if(their.length)labs.push({v:their[their.length-1].price,t:'Them',pos:'top',p:2});
    if(our.length)labs.push({v:our[our.length-1].price,t:'You',pos:'bot',p:0});
    labs.push({v:c.opening,t:'Opening',pos:'bot',p:our.length?2:0});
    labs.push({v:c.target,t:'Target',pos:'bot',p:1});
    for(const pos of ['top','bot']){
      const kept=[];labs.filter(l=>l.pos===pos).sort((a,b)=>a.p-b.p).forEach(l=>{if(kept.every(k=>Math.abs(X(k.v)-X(l.v))>20))kept.push(l)});
      kept.forEach(l=>{const x=X(l.v);const al=x<9?' l':x>91?' rr':'';h+=`<span class="rail-lab ${pos}${al} ${l.cls||''}" style="left:${x.toFixed(2)}%">${l.t} <b>${moneyK(l.v)}</b></span>`});
    }
  }
  return h+'</div>';
}
