/* ================= Listings ================= */
const SPECIAL=[
  ['target','In my target markets',d=>!!dealTarget(d)],['campaign','From a campaign',d=>!!d.campaign],
  ['reply','Reply waiting',d=>replyWaiting(d)],['draft','Draft ready',d=>draftOpen(d)],['star','Starred',d=>!!d.starred],
  ['drop','Price dropped',d=>priceDropped(d)],['stale','Stale (2× ZIP avg days)',d=>{const x=dom(d);return x!=null&&x>=Math.max(60,2*(zipDom(d)||45))}],
  ['flip','Works as flip',(d,c)=>c.ready&&curList(d)!=null&&curList(d)<=c.maoFlip],['ws','Works as wholesale',(d,c)=>c.ready&&curList(d)!=null&&curList(d)<=c.maoWs],
  ['half','Ask under 50% of ARV',(d,c)=>c.ready&&curList(d)!=null&&curList(d)<c.A*.5],['one','1% rule',d=>{const r=d.rent||d.rentEst;return r&&curList(d)&&r>=.01*(curList(d)+(d.rehab||0))}],
  ['photos','Has photos',d=>photoCount(d)>0],['noarv','Missing ARV',d=>!d.arv],['s80','Deal score 80+',d=>{const S=dealScore(d);return !!S&&S.score>=80}],['reject','Market rejection',d=>{const m=marketSignal(d);return !!m&&m.level==='rejection'}],['over','Emailed deals over your buy box',d=>overBox(d)]];
function listFilter(){
  const f=state.lf;const q=f.q.trim().toLowerCase();
  return Object.values(state.deals).filter(d=>{
    if(q&&!([d.address,d.city,d.state,d.zip,d.agent&&d.agent.name,d.wholesalerName].join(' ').toLowerCase().includes(q)))return false;
    if(f.source!=='all'&&(f.source==='wholesaler')!==(d.source==='wholesaler'))return false;
    if(f.stage!=='all'&&(d.stage||'new')!==f.stage)return false;
    if(f.status!=='all'&&offerStatus(d)[0]!==f.status)return false;
    if(f.sentiment!=='all'&&(d.sentiment||'none')!==f.sentiment)return false;
    if(f.type!=='all'&&(d.propertyType||'single_family')!==f.type)return false;
    if(f.beds!=='any'&&!((d.beds||0)>=+f.beds))return false;
    if(f.state!=='all'&&(d.state||'')!==f.state)return false;
    if(f.autopilot!=='all'&&(!!d.autopilot)!==(f.autopilot==='on'))return false;
    if(f.price!=='any'){const L=curList(d)||0;const [a,b]=f.price.split('-').map(Number);if(L<a||(b&&L>=b))return false}
    if(f.special!=='over'&&overBox(d))return false;
    if(checking(d))return false;
    if(f.special!=='all'){const s=SPECIAL.find(x=>x[0]===f.special);if(s&&!s[2](d,calc(d)))return false}
    return true;
  }).sort((a,b)=>(a.example?1:0)-(b.example?1:0)||(b.starred?1:0)-(a.starred?1:0)||String(b.updated).localeCompare(String(a.updated)));
}
function fsel(id,val,opts,label){const on=val!=='all'&&val!=='any';return `<select class="fsel ${on?'on':''}" id="${id}" data-lf="${id.replace('lf-','')}" aria-label="${esc(label)}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(val)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`}
function viewListings(){
  const all=Object.values(state.deals);const list=listFilter();const f=state.lf;const mode=state.settings.ui.listMode||'list';
  const autoN=all.filter(d=>d.autopilot&&!['dead','closed'].includes(d.stage)).length;const open=all.filter(d=>!['dead','closed'].includes(d.stage)).length;
  const offers=all.filter(d=>['sent','negotiating'].includes(d.stage)).length;
  const right=`<div class="h-stat"><b class="tnum">${offers}</b><span>offers out</span></div><div class="h-stat"><b class="tnum">${all.filter(d=>replyWaiting(d)).length}</b><span>replies waiting</span></div>${state.settings.auto.enabled?`<button class="btn-ghost-w" data-act="run-auto" ${state.autoRunning?'disabled':''}>${ico('bolt')}${state.autoRunning?'Working…':'Run '+esc(negName())+' now'}</button>`:''}<button class="btn-white" data-act="add-deal">${ico('plus')}Add listing</button>`;
  const head=hero('g-list','Listings Overview','Offer management for every property you’re working',`<span>${ico('bolt')}${autoN} of ${open} listings on autopilot${state.settings.auto.enabled?'':' (autopilot is off)'}</span>`,right);
  const states=[...new Set(all.map(d=>d.state).filter(Boolean))].sort();
  const anyF=f.q||['source','stage','status','sentiment','type','state','special','autopilot'].some(k=>f[k]!=='all')||f.beds!=='any'||f.price!=='any';
  const filters=`<div class="searchbar">${ico('search')}<input id="lf-q" type="search" placeholder="Search by address, city, ZIP or agent…" value="${esc(f.q)}" aria-label="Search listings"></div>
  <div class="filters">
    ${fsel('lf-source',f.source,[['all','All sources'],['mls','On-market'],['wholesaler','Wholesaler']],'Source')}
    ${fsel('lf-state',f.state,[['all','All states'],...states.map(s=>[s,s])],'State')}
    ${fsel('lf-price',f.price,[['any','Price'],['0-100000','Under $100K'],['100000-200000','$100K–200K'],['200000-300000','$200K–300K'],['300000-0','$300K+']],'Price')}
    ${fsel('lf-beds',f.beds,[['any','Beds & baths'],['1','1+ beds'],['2','2+ beds'],['3','3+ beds'],['4','4+ beds']],'Beds')}
    ${fsel('lf-type',f.type,[['all','Property type'],...Object.entries(PROP_TYPES)],'Property type')}
    ${fsel('lf-stage',f.stage,[['all','All stages'],...STAGES.map(s=>[s.id,s.label])],'Stage')}
    ${fsel('lf-status',f.status,[['all','All statuses'],...['Not sent','Draft ready','Offer sent','Responded','Under contract','Closed','Archived'].map(s=>[s,s])],'Offer status')}
    ${fsel('lf-sentiment',f.sentiment,[['all','Sentiment'],...Object.entries(SENTIMENT).map(([k,v])=>[k,v[0]]),['none','Not rated']],'Sentiment')}
    ${fsel('lf-autopilot',f.autopilot,[['all','Autopilot'],['on','Autopilot on'],['off','Autopilot off']],'Autopilot')}
    ${fsel('lf-special',f.special,[['all','Special'],...SPECIAL.map(s=>[s[0],s[1]])],'Special filters')}
    ${anyF?`<button class="clear" data-act="clear-lf">${ico('close')}Clear all</button>`:''}
    <span class="spacer"></span>
    <div class="viewtog" role="group" aria-label="View"><button data-act="list-mode" data-v="list" aria-pressed="${mode==='list'}">${ico('listings')}List</button><button data-act="list-mode" data-v="kanban" aria-pressed="${mode==='kanban'}">${ico('kanban')}Kanban</button></div>
  </div>`;
  if(!all.length)return `<div class="wrap page">${head}${emptyHTML('listings','No listings yet','Paste a listing from Zillow, Redfin or the MLS and '+esc(negName())+' fills in the details.',`<button class="btn primary" data-act="add-deal">${ico('plus')}Add listing</button>`)}</div>`;
  const body=mode==='kanban'?kanbanHTML(list):tableHTML(list);
  return `<div class="wrap page">${head}${filters}${body}</div>`;
}
function tableHTML(list){
  const per=50;const pages=Math.max(1,Math.ceil(list.length/per));const pg=Math.min(state.page,pages);const slice=list.slice((pg-1)*per,pg*per);
  const pager=`<div class="pager"><span>Showing ${slice.length?((pg-1)*per+1)+'–'+((pg-1)*per+slice.length):0} of ${list.length} listing${list.length===1?'':'s'}</span>${pages>1?`<div class="pg">${Array.from({length:pages},(_,i)=>`<button data-act="page" data-v="${i+1}" aria-current="${i+1===pg}">${i+1}</button>`).join('')}</div>`:''}</div>`;
  if(!list.length)return pager+`<div class="note">No listings match these filters.</div>`;
  const rows=slice.map(d=>{const c=calc(d);const os=offerStatus(d);const ms=mlsOf(d);const sent=firstOfferAt(d);const nIn=ins(d).length;const sn=SENTIMENT[d.sentiment];
    return `<tr data-act="open" data-id="${d.id}"${d.example?' class="is-ex"':''}>
    <td class="c">${switchHTML(d.autopilot,'autopilot',d.id,'Autopilot for '+streetOf(d.address))}</td>
    <td><div class="prop">${thumbHTML(d)}<div><b>${esc(streetOf(d.address)||'Untitled')}${d.example?'<span class="tag ex">Fake · practice</span>':''}${d.starred?`<span style="color:var(--s-amber)">${icoFill('star')}</span>`:''}${nIn?`<span class="cnt" title="${nIn} message${nIn>1?'s':''} from them">${nIn}</span>`:''}</b><span class="ps">${esc([d.city,d.state,d.zip].filter(Boolean).join(', '))}${d.source==='wholesaler'?' · wholesaler':''}</span></div></div></td>
    <td><b style="font-weight:650">${esc(((d.agent&&d.agent.name)||d.wholesalerName||'—').replace(/\s*\(example\)/i,''))}</b><div class="xs muted">${esc((d.agent&&d.agent.email)||(d.agent&&d.agent.phone)||'')}</div></td>
    <td class="r ask tnum">${money(curList(d))}${priceDropped(d)?`<span class="drop-ic" title="Price dropped from ${money(origList(d))}">${ico('down')}</span>`:''}</td>
    <td class="r offer tnum">${money(lastOurPrice(d)??(d.draft&&d.draft.price))}</td>
    <td class="r ceil tnum">${c.ready?money(c.mao):'—'}</td>
    <td class="c">${(()=>{const S=c.ready?dealScore(d):null;return S?`<span class="scorepill ${S.grade[1]}" title="${esc(S.grade[0]+' · best exit '+STRAT_LABEL[S.best])}">${S.score}</span>`:'<span class="muted">—</span>'})()}</td>
    <td class="c tnum">${d.beds??'—'}</td><td class="c tnum">${d.baths??'—'}</td><td class="r tnum">${numFmt(d.sqft)}</td>
    <td>${sent?`<b style="font-weight:650">${fmtDate(sent)}</b><div class="xs muted">${ago(sent)}</div>`:'<span class="muted">—</span>'}</td>
    <td><span class="pill ${os[1]}">${os[0]}</span></td>
    <td class="c">${sn?`<span class="sent-ic" style="background:var(--b-${sn[1]});color:var(--t-${sn[1]})" title="${sn[0]}">${ico('chat')}</span>`:'<span class="muted">—</span>'}</td>
    <td><span class="pill ${ms[1]}">${ms[0]}</span></td>
    <td class="c"><button class="btn ghost sm" data-act="open" data-id="${d.id}" aria-label="Open">${ico('eye')}</button></td></tr>`}).join('');
  return pager+`<div class="tbl-wrap" id="tbl-wrap" data-keep-scroll><table class="tbl" style="min-width:1300px"><thead><tr><th>AI Autopilot</th><th>Property</th><th>Agent / wholesaler</th><th class="r">Asking</th><th class="r">Offered</th><th class="r">Ceiling</th><th class="c">Score</th><th class="c">Beds</th><th class="c">Baths</th><th class="r">Sqft</th><th>Offer sent</th><th>Offer status</th><th class="c">Sentiment</th><th>MLS status</th><th class="c">View</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function kanbanHTML(list){
  return `<div class="board" id="board" data-keep-scroll>${STAGES.map(s=>{const items=list.filter(d=>(d.stage||'new')===s.id);
    return `<section class="col" data-stage="${s.id}"><div class="col-head" style="background:${s.color}">${esc(s.label)}<span class="n">${items.length}</span></div><div class="col-sub">${ico('spark')}${esc(s.sub)}</div><div class="col-body">${items.map(kcardHTML).join('')||'<div class="col-empty">Drop cards here</div>'}</div></section>`}).join('')}</div>`;
}
function kcardHTML(d){
  const c=calc(d);const ms=mlsOf(d);const their=lastTheirPrice(d);const lastC=lastAt(d.thread||[]);
  return `<article class="kcard${d.example?' is-ex':''}" draggable="true" data-id="${d.id}">
    <div class="k1"><button class="addr" data-act="open" data-id="${d.id}" title="${esc(d.address)}">${esc(streetOf(d.address)||'Untitled')}${d.city?', '+esc(d.city):''}</button><button class="btn ghost sm" data-act="star" data-id="${d.id}" aria-label="Star" style="padding:2px;color:${d.starred?'var(--s-amber)':'var(--muted)'}">${d.starred?icoFill('star'):ico('star')}</button></div>
    <div class="meta">${d.beds??'?'} bd • ${d.baths??'?'} ba • ${numFmt(d.sqft)} sqft <span class="mini-tag" style="background:var(--b-${ms[1]});color:var(--t-${ms[1]})">${ms[0]}</span>${d.example?'<span class="tag ex">Fake · practice</span>':''}</div>
    <div class="meta">${d.source==='wholesaler'?'Wholesaler':'Agent'}: <b style="color:var(--ink-2)">${esc(((d.agent&&d.agent.name)||d.wholesalerName||'—').replace(/\s*\(example\)/i,''))}</b></div>
    <div class="metrics"><div class="metric"><span>${their!=null?'Agent':'Asking'}</span><b>${moneyK(their??curList(d))}</b>${their!=null?`<em>orig ${moneyK(curList(d))}</em>`:''}</div><div class="metric offer"><span>Offer</span><b>${moneyK(lastOurPrice(d)??(c.ready?c.opening:null))}</b>${lastOurPrice(d)==null&&c.ready?'<em>planned</em>':''}</div><div class="metric mao"><span>MAO</span><b>${c.ready?moneyK(c.mao):'—'}</b></div></div>
    ${d.needsYou&&draftOpen(d)?`<div class="knote">${ico('bolt')} Needs you: ${esc(d.needsYou)}</div>`:draftOpen(d)?`<div class="knote" style="background:var(--b-purple);color:var(--t-purple)">Draft ready: ${esc(ACTION_LABEL[d.draft.action||d.draft.kind]||'message')}</div>`:replyWaiting(d)?`<div class="knote" style="background:var(--b-blue);color:var(--t-blue)">Reply waiting</div>`:''}
    <div class="meta">${ico('calendar')}${lastC?fmtDate(lastC):'No contact yet'}${replyWaiting(d)?` <span style="color:var(--t-green)">${ico('chat')}</span>`:''}</div>
    <input class="qnote" id="qn-${d.id}" data-qnote="${d.id}" value="${esc(d.quickNote||'')}" placeholder="+ Quick note" aria-label="Quick note">
    <div class="kfoot">${switchHTML(d.autopilot,'autopilot',d.id,'Autopilot')}<span>Autopilot</span><button class="chatbtn" data-act="open-chat" data-id="${d.id}">${ico('chat')}Chat with ${esc(negName())}</button></div>
  </article>`;
}

/* ================= Inbox Leads ================= */
function leadList(){
  const L=state.leads;const q=L.q.trim().toLowerCase();
  return Object.values(state.deals).filter(d=>d.source==='wholesaler').filter(d=>{
    if(!L.showPassed&&d.stage==='dead')return false;
    if(!L.showOver&&overBox(d))return false;
    if(checking(d))return false;
    if(q&&!([d.address,d.city,d.zip,d.wholesalerName].join(' ').toLowerCase().includes(q)))return false;
    if(L.fav&&!d.favorite)return false;
    if(L.type!=='all'&&(d.propertyType||'single_family')!==L.type)return false;
    if(L.tag&&!dealTags(d).includes(L.tag))return false;
    return true;
  }).sort((a,b)=>(a.example?1:0)-(b.example?1:0)||String(b.receivedAt||b.created).localeCompare(String(a.receivedAt||a.created)));
}
function viewLeads(){
  const all=Object.values(state.deals).filter(d=>d.source==='wholesaler'&&d.stage!=='dead');const list=leadList();const n=esc(negName());
  const counts={};for(const d of all)for(const t of dealTags(d))counts[t]=(counts[t]||0)+1;
  const newMail=Object.values(state.mail.emails).filter(e=>e.status==='new').sort(byDate).reverse();
  const right=`<button class="btn-ghost-w" data-act="deep-all">${ico('spark')}Deep analysis</button>${gmailOn()?`<button class="btn-white" data-act="sync" ${state.syncing?'disabled':''}>${ico('refresh')}${state.syncing?'Checking…':'Check Gmail'}</button>`:`<a class="btn-white" href="#settings/connections">${ico('mail')}Connect Gmail</a>`}`;
  const meta=gmailOn()?`<span><span class="dot on"></span>Pulling from ${esc(connectedAccts().map(a=>acctInfo(a.id).email).join(' + '))}</span>${state.mail.lastSync?`<span>${ico('refresh')}Checked ${ago(state.mail.lastSync)}</span>`:''}<span>${ico('spark')}${state.settings.conn.autoImport?n+' extracts new deals automatically':'Auto-extract is off'}</span>`:`<span><span class="dot warn"></span>Gmail not connected: paste emails below for now</span>`;
  const head=hero('g-leads','Inbox Leads (off market)',`Wholesale deals from your inbox — ${n} extracts and analyzes each one`,meta,right,`<span class="tagcount">${ico('tag')}${all.length} deal${all.length===1?'':'s'}</span>`);
  const mailHTML=newMail.length?`<section class="card"><div class="card-head"><span class="ci orange">${ico('mail')}</span><div><h2>${newMail.length} new email${newMail.length>1?'s':''} to process</h2><p>From your wholesaler search in Gmail</p></div><div class="ch-r"><button class="btn primary sm" data-act="mail-import-all"${state.pullAll?' disabled':''}>${state.pullAll?`<span class="spin"></span>Reading ${state.pullAll.i} of ${state.pullAll.n}…`:`${ico('spark')}Pull out all`}</button></div></div><div class="mailbox">${newMail.slice(0,6).map(m=>{const f=parseFrom(m.from);return `<div class="mail-row"><div style="min-width:0"><div class="row" style="gap:6px"><b>${esc(f.name||f.email)}</b><span class="xs muted">${fmtWhen(m.date)}</span>${m.atts?`<span class="tag blue">${ico('image')}${m.atts} photo${m.atts>1?'s':''}</span>`:''}</div><div class="subj">${esc(m.subject||'(no subject)')}</div><div class="small muted snip">${esc((m.body||'').replace(/\s+/g,' ').slice(0,170))}</div>${busyHTML('mail:'+m.id,false)}</div><div class="row"><button class="btn sm primary" data-act="mail-import" data-id="${esc(m.id)}">${ico('spark')}Pull out deal</button><button class="btn sm ghost" data-act="mail-ignore" data-id="${esc(m.id)}">Ignore</button></div></div>`}).join('')}${newMail.length>6?`<p class="small muted">and ${newMail.length-6} more…</p>`:''}</div></section>`:'';
  const ms=gmailOn()?mailStats():null;
  const oldBr=gmailOn()&&connectedAccts().some(a=>+((acctInfo(a.id)||{}).version||1)<6);
  const brHTML=oldBr?`<div class="note amber row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><span class="small"><b>Update your Gmail script (2 minutes).</b> The new version lets ${n} get the photos people attach to emails (phone photos were too big before), see links on pictures, and follow them to the property.</span><a class="btn sm" href="#settings/connections">${ico('mail')}Show me how</a></div>`:'';
  const chk=Object.values(state.deals).filter(checking).length;
  const chkHTML=chk?`<div class="note purple row" style="gap:10px"><span class="spin"></span><span class="small">${n} is opening the links on ${chk} new deal${chk>1?'s':''} to get the address and numbers. ${chk>1?'They show':'It shows'} up here when she’s done.</span></div>`:'';
  const recapHTML=ms&&(ms.read||ms.waiting)?`<div class="note blue row" id="mail-recap" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><span class="small">${ico('mail')} ${esc(mailRecap(ms))}</span>${ms.noDeal||ms.gone?`<button class="btn sm" data-act="mail-reread" ${state.pullAll||!aiOn()?'disabled':''}>${ico('refresh')}Read the ones with no deal again</button>`:''}</div>`:'';
  const texts=(state.mail.texts||[]).filter(t=>t.status==='new');
  const textsHTML=texts.length?`<section class="card"><div class="card-head"><span class="ci teal">${ico('sms')}</span><div><h2>${texts.length} text${texts.length>1?'s':''} from unknown numbers</h2><p>Wholesalers often text deals. Pull them out the same way.</p></div></div><div class="mailbox">${texts.slice(-6).reverse().map(t=>`<div class="mail-row"><div style="min-width:0"><div class="row" style="gap:6px"><b class="tnum">${esc(t.from)}</b><span class="xs muted">${fmtWhen(t.at)}</span></div><div class="snip">${esc(t.body)}</div>${busyHTML('text:'+t.sid,false)}</div><div class="row"><button class="btn sm primary" data-act="text-import" data-id="${esc(t.sid)}">${ico('spark')}Pull out deal</button><button class="btn sm ghost" data-act="text-ignore" data-id="${esc(t.sid)}">Ignore</button></div></div>`).join('')}</div></section>`:'';
  const paste=`<details class="card" ${gmailOn()?'':'open'}><summary>${ico('doc')} Paste an email or text instead</summary><textarea class="input" id="inbox-paste" data-draft rows="5" placeholder="Paste the whole wholesaler email or text blast. ${n} pulls out the address, price, ARV and repair claims, terms and the deadline.">${esc(state.drafts['inbox-paste']||'')}</textarea><div class="row"><button class="btn primary" data-act="inbox-extract">${ico('spark')}Pull out the deal</button>${busyHTML('inbox',false)}</div></details>`;
  const tiles=`<div class="tagtiles">${TAGDEFS.map(t=>`<button class="ttile" data-act="lead-tag" data-v="${t.id}" aria-pressed="${state.leads.tag===t.id}"><span class="ic" style="background:var(--b-${t.c});color:var(--t-${t.c})">${ico(t.icon)}</span><b>${counts[t.id]||0}</b><span>${esc(t.label)}</span></button>`).join('')}</div>`;
  const favN=all.filter(d=>d.favorite).length;const overN=all.filter(overBox).length;
  const filt=`<div class="filters"><div class="searchbar" style="flex:1;min-width:220px">${ico('search')}<input id="leads-q" type="search" placeholder="Search leads…" value="${esc(state.leads.q)}" aria-label="Search leads"></div>${`<select class="fsel ${state.leads.type!=='all'?'on':''}" id="leads-type" aria-label="Property type"><option value="all">Property type</option>${Object.entries(PROP_TYPES).map(([k,v])=>`<option value="${k}" ${state.leads.type===k?'selected':''}>${v}</option>`).join('')}</select>`}<button class="fchip" data-act="lead-fav" aria-pressed="${state.leads.fav}">${ico('star')}Favorites <span class="cnt">${favN}</span></button><button class="fchip" data-act="lead-passed" aria-pressed="${!!state.leads.showPassed}">Show passed</button>${overN?`<button class="fchip" data-act="lead-over" aria-pressed="${!!state.leads.showOver}" title="Asking more than your buy box (${moneyK(boxCap())}); change it in Connect → Gmail">Over ${moneyK(boxCap())} <span class="cnt">${overN}</span></button>`:''}${state.leads.tag||state.leads.q||state.leads.fav||state.leads.type!=='all'?`<button class="clear" data-act="clear-leads">${ico('close')}Clear all</button>`:''}</div>`;
  const rows=list.map(d=>{const c=calc(d);const tags=dealTags(d);const rent=d.rent||d.rentEst;const v=verdict(d,c);
    const arvSrc=d.arvSource==='maya'?'<span class="tag purple">'+n+'’s est</span>':d.arvSource==='comps'?'<span class="tag green">Comps</span>':d.arvSource==='wholesaler'?'<span class="tag orange">Wholesaler</span>':'';
    return `<tr data-act="open" data-id="${d.id}"${d.example?' class="is-ex"':''}><td><div class="prop">${thumbHTML(d)}<div><b>${esc(streetOf(d.address))}${d.example?'<span class="tag ex">Fake · practice</span>':''}</b><span class="ps">${d.beds??'?'} bd · ${d.baths??'?'} ba · ${numFmt(d.sqft)} sqft · ${esc(PROP_TYPES[d.propertyType]||'Single family')}</span>${(w=>w?`<span class="tag ${w.c}" style="margin-top:3px">${esc(w.t)}</span>`:'')(noAddrWhy(d))}</div></div></td>
    <td class="r tnum"><b>${money(curList(d))}</b></td>
    <td class="r tnum">${d.arv?`<b>${money(d.arv)}</b><div>${arvSrc}</div>`:'<span class="tag amber">No data</span>'}</td>
    <td class="r tnum">${money(d.rehab)}</td><td class="r tnum">${rent?money(rent):'—'}</td>
    <td class="r ceil tnum">${c.ready?money(c.mao):'—'}<div><span class="tag ${v.cls}">${esc(v.text)}</span></div></td>
    <td><div class="row" style="gap:4px;max-width:240px">${tags.slice(0,4).map(t=>`<span class="tag ${TAG_BY_ID[t].c}">${esc(TAG_BY_ID[t].label)}</span>`).join('')||'<span class="muted">—</span>'}</div></td>
    <td>${esc((d.wholesalerName||'').replace(/\s*\(example\)/i,''))}</td><td class="tnum">${fmtDate(d.receivedAt||d.created)}</td>
    <td><div class="row" style="flex-wrap:nowrap;gap:2px"><button class="btn ghost sm" data-act="fav" data-id="${d.id}" aria-label="Favorite" style="color:${d.favorite?'var(--s-amber)':'var(--muted)'}">${d.favorite?icoFill('star'):ico('star')}</button><button class="btn ghost sm" data-act="deep" data-id="${d.id}" aria-label="Analyze with ${n}" title="Analyze photos and condition">${ico('bolt')}</button><button class="btn ghost sm" data-act="ws-pass" data-id="${d.id}" aria-label="Pass" title="Pass on this deal">${ico('trash')}</button></div>${busyHTML('deep:'+d.id,false)}</td></tr>`}).join('');
  const table=list.length?`<div class="tbl-wrap" id="leads-wrap" data-keep-scroll><table class="tbl" style="min-width:1180px"><thead><tr><th>Property</th><th class="r">Asking price</th><th class="r">ARV</th><th class="r">Rehab</th><th class="r">Est. rent</th><th class="r">Your ceiling</th><th>Deal tags</th><th>Wholesaler</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyHTML('leads',all.length?'No leads match':'No wholesaler deals yet',all.length?'Try clearing the filters.':gmailOn()?'Check Gmail, or label deal emails “Wholesalers” in Gmail so they get picked up.':'Connect Gmail and deals land here automatically, or paste an email above.','');
  return `<div class="wrap page">${head}${brHTML}${chkHTML}${recapHTML}${mailHTML}${textsHTML}${paste}${tiles}${filt}${table}</div><button class="fab" data-act="ask-fab">${ico('spark')}Ask ${n}</button>`;
}
