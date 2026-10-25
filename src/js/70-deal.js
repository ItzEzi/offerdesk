/* ================= Deal page ================= */
function viewDeal(){
  const d=cur();if(!d)return '';const c=calc(d);const n=esc(negName());
  const ms=mlsOf(d);const os=offerStatus(d);const L=curList(d);
  const autoLive=d.autopilot&&state.settings.auto.enabled;
  const head=`<div class="deal-head"><div style="min-width:0"><a class="backbtn" href="#listings">${ico('back')}Back to listings</a>
    <div class="deal-title"><h1>${esc(streetOf(d.address)||'Untitled deal')}</h1>${d.autopilot?`<span class="tag purple">${ico('bolt')}Autopilot ${autoLive?'ON':'set (master switch off)'}</span>`:''}${ins(d).length&&ourCount(d)?'<span class="tag green">Replied</span>':''}${d.example?'<span class="tag ex">Fake · practice</span>':''}${d.optedOut?'<span class="tag red">Opted out</span>':''}${scoreTag(d)}</div>
    ${d.example?`<div class="ex-banner" role="note">${ico('practice')}Fake practice deal. Made up for training, not a real property or offer.</div>`:''}<p class="muted" style="margin-top:4px">${esc([d.city,d.state,d.zip].filter(Boolean).join(', '))}${d.autopilot?` · ${autoLive?(approveMode()?n+' drafts on her own; you press Send':n+' replies automatically within your limits'):'Turn on autopilot in Connect for '+n+' to act'}`:''}</p></div>
    <div class="row"><label class="small muted" for="deal-stage" style="font-weight:700">Stage</label><select class="fsel" id="deal-stage" aria-label="Stage">${STAGES.map(s=>`<option value="${s.id}" ${d.stage===s.id?'selected':''}>${s.label}</option>`).join('')}</select>
    <button class="btn" data-act="star" data-id="${d.id}" style="color:${d.starred?'var(--s-amber)':'inherit'}">${d.starred?icoFill('star'):ico('star')}${d.starred?'Starred':'Star'}</button>
    ${c.ready&&!['dead','closed'].includes(d.stage)?`<button class="btn primary" data-act="offer-preview">${ico('send')}${ourCount(d)?'Preview next offer':'Preview offer'}</button>`:''}<button class="btn" data-act="in-depth" ${state.busy['depth:'+d.id]||!aiOn()?'disabled':''}>${ico('spark')}${state.busy['depth:'+d.id]?'Analyzing…':'In-depth analysis'}</button><button class="btn" data-act="one-pager">${ico('doc')}One-pager</button><a class="btn" href="#report/${d.id}">${ico('doc')}Lender report</a><button class="btn" data-act="practice-deal">${ico('practice')}Practice call</button></div></div>`;
  const dm=dom(d);
  const band=`<div class="band"><div class="bl"><span class="bic">${ico(d.source==='wholesaler'?'leads':'building')}</span><div><div style="font-size:12px;opacity:.85;font-weight:700">${d.source==='wholesaler'?'Wholesale deal':'MLS listing'}</div><b>${ms[0]}</b></div></div>${d.mlsId?`<span class="bchip">ID: ${esc(d.mlsId)}</span>`:''}${dm!=null?`<span class="bchip">${dm} days on market</span>`:''}${(()=>{const ms=marketSignal(d);return ms?`<span class="bchip warn">${ico('down')}${ms.level==='rejection'?'Market rejection':'Stale listing'}</span>`:''})()}${zipDom(d)?`<span class="bchip">ZIP median ${zipDom(d)} days</span>`:''}${dealTarget(d)?`<span class="bchip good">${ico('target')}Target market</span>`:''}${d.campaign&&state.campaigns[d.campaign.id]?`<a class="bchip" href="#campaigns" data-act="cp-open" data-id="${d.campaign.id}">${ico('send')}${esc(state.campaigns[d.campaign.id].name)}</a>`:''}<span class="bchip">${os[0]}</span><span class="spacer"></span>
    <a class="btn-ghost-w" href="https://www.zillow.com/homes/${encodeURIComponent([streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(' '))}_rb/" target="_blank" rel="noopener">${ico('link')}Zillow</a>${d.listingUrl?`<a class="btn-ghost-w" href="${esc(d.listingUrl)}" target="_blank" rel="noopener">${ico('link')}View listing</a>`:''}<a class="btn-ghost-w" href="https://www.google.com/maps/search/${encodeURIComponent([streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(' '))}" target="_blank" rel="noopener">${ico('pin')}Map</a></div>`;
  const main=[...(hasStreet(d)?[historyCard(d),linkCard(d)]:[linkCard(d),historyCard(d)]),overviewCard(d,c),researchCard(d),stripHTML(d),conversationCard(d,c),autopilotCard(d,c),numbersCard(d,c),scoreCard(d,c),marketCard(d,c),eyesCard(d,c),compsCard(d,c),sfCard(d,c),rentalCard(d,c),timelineCard(d,c),detailsCard(d,c),mapCard(d)].join('');
  return `<div class="wrap page">${head}${band}<div class="deal-grid"><div class="main-col">${main}</div><aside class="rail-col" id="rail-col" data-keep-scroll>${mayaPanel(d,c)}</aside></div></div>`;
}
function photoNote(d){
  const sk=d.attSkipped||[];if(!sk.length)return '';const cnt=w=>sk.filter(x=>x.why===w).reduce((a,x)=>a+(x.n||1),0);const out=[];
  if(cnt('old_script'))out.push(`The email had ${cnt('old_script')} photo${cnt('old_script')>1?'s':''}, but your Gmail script couldn’t send ${cnt('old_script')>1?'them':'it'} (phone photos are too big for the old version). <a href="#settings/connections">Update your Gmail script</a> and ${esc(negName())} pulls ${cnt('old_script')>1?'them':'it'} in.`);
  if(cnt('too_big'))out.push(`${cnt('too_big')} photo${cnt('too_big')>1?'s were':' was'} over 10 MB and skipped.`);
  if(cnt('heic'))out.push(`${cnt('heic')} iPhone photo${cnt('heic')>1?'s':''} (HEIC) couldn’t be converted. Ask them to send JPGs.`);
  return out.length?`<div class="note amber small">${ico('camera')} ${out.join(' ')}</div>`:'';
}
function overviewCard(d,c){
  const first=(d.photoIds||[]).map(id=>photoObjURL[id]).find(Boolean)||(d.photoUrls||[])[0];
  const offer=lastOurPrice(d)??(d.draft&&d.draft.price)??(c.ready?c.opening:null);
  return `<section class="card"><div class="card-head"><span class="ci green">${ico('home')}</span><div><h2>Property overview</h2><p>Key details and where the numbers stand</p></div></div>
  ${first?heroPhotoHTML(d)||`<img class="hero-photo" src="${esc(first)}" alt="Front of ${esc(streetOf(d.address))}">`:`<button class="dropzone" data-act="goto" data-v="eyes" style="cursor:pointer;background:none">${ico('camera')}<b>Add photos</b><span class="small">${esc(negName())} looks at them and writes the inspection report and rehab estimate</span></button>`}
  ${photoNote(d)}
  <div class="tiles"><div class="tile green"><span class="lab">${d.source==='wholesaler'?'Asking price':'List price'}</span><span class="val">${money(curList(d))}</span><span class="sub">${(d.wsClaims||{}).accept?`They’d take ${money(d.wsClaims.accept)}`:priceDropped(d)?`Down from ${money(origList(d))}`:'Current asking price'}</span></div>
  <div class="tile blue"><span class="lab">Offer amount</span><span class="val" style="color:var(--t-blue)">${money(offer)}</span><span class="sub">${lastOurPrice(d)!=null?'Your last offer':'Planned opening offer'}</span></div>
  <div class="tile orange"><span class="lab">Est. rehab cost</span><span class="val" style="color:var(--t-orange)">${money(d.rehab)}</span><span class="sub">${d.rehabSource==='maya'?esc(negName())+'’s estimate':rehabTheirs(d)?'Wholesaler’s claim, not checked':'Your estimate'}</span></div>
  <div class="tile ceil"><span class="lab">Effective MAO</span><span class="val">${c.ready?money(c.mao):'—'}</span><span class="sub">${c.capByThem?'Capped at what they’d take':c.locked?'Locked by you':'From your buy box'}</span></div></div>
  <div class="facts">${[['building',PROP_TYPES[d.propertyType]||'Single family','Property type'],['bed',d.beds??'—','Bedrooms'],['bath',d.baths??'—','Bathrooms'],['ruler',numFmt(d.sqft),'Sq ft'],['acre',d.lotSqft?numFmt(d.lotSqft):'—','Lot sq ft'],['calendar',d.year||'—','Year built']].map(([i,v,l])=>`<div class="fact">${ico(i)}<div><b>${esc(v)}</b><span>${l}</span></div></div>`).join('')}</div>
  ${d.description?`<div><b style="font-size:14px">Property description</b><p class="small" style="margin-top:4px;color:var(--ink-2)">${esc(d.description)}</p></div>`:''}</section>`;
}
function stripHTML(d){
  const a=d.analysis;const aud=a&&a.audience?`${a.audience}${a.audienceConfidence?' ('+a.audienceConfidence+')':''}`:null;
  return `<div class="strip3"><div class="sbox"><span class="lab">Marketing audience</span><span class="v">${ico('user')}${aud?esc(aud.replace(/^./,m=>m.toUpperCase())):'<span class="muted">Run an inspection</span>'}</span></div>
  <div class="sbox"><span class="lab">Deal motivation</span><span class="v" style="color:var(--t-orange)">${ico('flame')}${a&&a.motivation?esc(a.motivation.replace(/^./,m=>m.toUpperCase())):'<span class="muted">Run an inspection</span>'}</span></div>
  <div class="sbox"><span class="lab">Your instructions to ${esc(negName())}</span><textarea data-dict id="d-instr" data-fd="instructions" rows="1" placeholder="e.g. Don’t go above 150K, seller is an estate">${esc(d.instructions||'')}</textarea></div></div>`;
}
function conversationCard(d,c){
  const th=(d.thread||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));const n=negName();const agent=((d.agent&&d.agent.name)||counterpart(d)).replace(/\s*\(example\)/i,'');
  const k=state.logKind;
  const msgs=th.map(t=>{const out=t.dir==='out',note=t.dir==='note';const who=out?(t.by==='you'?'You':n):note?'Note':agent;
    const title=note?'Call note':`${t.channel==='sms'?'Text':t.channel==='call'?'Call':'Email'} from ${who} to ${out?agent:(t.by==='you'?'':n)}`.replace(/ to $/,'');
    return `<div class="msgc ${t.dir}"><div class="mh"><span class="mi" style="background:${out?'var(--s-purple)':note?'var(--s-slate)':'var(--s-green)'}">${ico(t.channel==='sms'?'sms':t.channel==='call'||note?'phone':'mail')}</span>${esc(title)}${t.price!=null?`<span class="tag ${out?'blue':'green'} tnum">${money(t.price)}</span>`:''}<span class="when">${fmtWhen(t.at)}</span><button class="btn ghost sm" data-act="del-msg" data-mid="${t.id}" aria-label="Delete message">${ico('close')}</button></div>${t.subject?`<div class="subj">Subject: ${esc(t.subject)}</div>`:''}<div class="body">${esc(t.text)}</div></div>`}).join('');
  return `<section class="card" id="conversation"><div class="card-head"><span class="ci purple">${ico('chat')}</span><div><h2>Conversation</h2><p>Email, texts and calls in one thread · newest first</p></div></div>
  ${th.length?`<div class="thread">${msgs}</div>`:`<p class="small muted">No messages yet. ${esc(n)} drafts the opening offer from the panel on the right.</p>`}
  <details ${th.length?'':'open'}><summary>${ico('plus')} Log a message, reply or call note</summary><div style="display:grid;gap:10px;margin-top:10px">
    <div class="seg" role="group" aria-label="Kind">${[['in','Their reply'],['out','Something I sent'],['note','Call note']].map(([v,l])=>`<button data-act="log-kind" data-k="${v}" aria-pressed="${k===v}">${l}</button>`).join('')}</div>
    <div class="grid-fields">${k!=='note'?`<label class="field"><span>Channel</span><select class="input" id="log-ch" data-draft>${[['email','Email'],['sms','Text'],['call','Call']].map(([v,l])=>`<option value="${v}" ${(state.drafts['log-ch']||'email')===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}<label class="field"><span>Number named (optional)</span><input class="input tnum" id="log-price" data-draft value="${esc(state.drafts['log-price']||'')}" placeholder="e.g. 199,990" inputmode="numeric"></label></div>
    <textarea data-dict class="input" id="log-text" data-draft rows="4" placeholder="${k==='in'?'Paste their email or text':k==='out'?'What you sent':'What was said'}">${esc(state.drafts['log-text']||'')}</textarea>
    <div class="row">${k==='in'?`<button class="btn primary" data-act="log" data-ask="1">${ico('spark')}Log it and ask ${esc(n)}</button>`:''}<button class="btn" data-act="log" data-ask="0">Just log it</button></div></div></details></section>`;
}
function autopilotCard(d,c){
  const n=esc(negName());const master=state.settings.auto.enabled;
  const stepNow=!ourCount(d)?0:ins(d).length?2:1;const step=d.stage==='contract'||d.stage==='closed'?3:stepNow;
  const st=[['Outreach','Opening offer'],['Follow-up','Until they answer'],['Negotiate','Within your ceiling'],['Close','You sign the contract']];
  const ch=[canEmail(d)?'email':null,canText(d)?'text':null].filter(Boolean);
  const status=!d.autopilot?'Off':!master?'Waiting: master switch is off':!aiOn()?'Waiting: add your API key':!ch.length?'Waiting: no way to reach them (add their email, connect Gmail or texting)':!c.ready?'Waiting: needs an ARV':d.needsYou?'Paused for you: '+esc(d.needsYou):d.optedOut?'Stopped: they opted out':'Active';
  return `<section class="auto" id="autopilot"><div class="ah"><span class="ci grad">${ico('bolt')}</span><div><h3>AI Autopilot ${d.autopilot?`<span class="tag ${status==='Active'?'green':'amber'}">${status==='Active'?'Active':'Waiting'}</span>`:''}</h3><p class="small muted">${n} sends the offer, follows up and negotiates on her own, and stops for you on anything big.</p></div><span class="spacer"></span><span class="small" style="font-weight:700">${d.autopilot?'Enabled':'Disabled'}</span>${switchHTML(d.autopilot,'autopilot',d.id,'Autopilot')}</div>
  <div class="steps4">${st.map(([a,b],i)=>`<div class="step4 ${i<step?'done':i===step&&d.autopilot?'now':''}">${i<step?'✓ ':''}${a}<span>${b}</span></div>`).join('')}</div>
  <div class="row small"><span><b>Status:</b> ${status}</span><span class="spacer"></span><span><b>Reaches them by:</b> ${ch.length?ch.join(' + '):'—'}</span><span><b>Final price:</b> ${d.stage==='contract'||d.stage==='closed'?money(lastOurPrice(d)):'Not set yet'}</span></div></section>`;
}
function numbersCard(d,c){
  const n=esc(negName());const w=weightedArv(d);
  const box=(lab,inner,hint,cls)=>`<div class="numbox ${cls||''}"><span class="lab">${lab}</span>${inner}${hint?`<span class="hint">${hint}</span>`:''}</div>`;
  const inp=(id,path,val,ph)=>`<input class="tnum" id="${id}" data-fd="${path}" data-t="num" value="${val??''}" placeholder="${ph||''}" inputmode="numeric">`;
  const wl=c.ready?walkLines(d,c):[];const L=curList(d),their=lastTheirPrice(d),ours=lastOurPrice(d);
  const atRow=(lab,P)=>{if(P==null||!c.ready)return '';const r=c.resultAt(P);return `<tr><td>${lab} <span class="tnum">${money(P)}</span></td><td style="color:${r.ok?'var(--t-green)':'var(--t-red)'};font-weight:700">${r.label}</td></tr>`};
  return `<section class="card" id="numbers"><div class="card-head"><span class="ci teal">${ico('dollar')}</span><div><h2>${n}’s numbers</h2><p>The live valuation ${n} negotiates from</p></div><div class="ch-r"><div class="seg" role="group" aria-label="Strategy">${[['flip','Flip'],['wholesale','Wholesale']].map(([v,l])=>`<button data-act="strat" data-v="${v}" aria-pressed="${c.strat===v}">${l}</button>`).join('')}</div></div></div>
  <div class="numgrid">
    ${box('ARV (after-repair value)'+(d.arvSource?` <span class="tag ${d.arvSource==='maya'?'purple':d.arvSource==='comps'?'green':'orange'}">${d.arvSource==='maya'?n+'’s est':d.arvSource==='comps'?'Comps':arvTheirs(d)?'Wholesaler':'You'}</span>`:''),inp('n-arv','arv',d.arv,'e.g. 250000'),arvTheirs(d)?`Their claim, not checked. Run In-depth analysis for ${n}’s own ARV from comps.`:d.arvWhy?esc(d.arvWhy)+((d.wsClaims||{}).arv?` (wholesaler said ${moneyK(d.wsClaims.arv)})`:''):d.analysis&&d.analysis.arv&&d.analysis.arv.low?`${n}’s range ${moneyK(d.analysis.arv.low)}–${moneyK(d.analysis.arv.high)} (${esc(d.analysis.arv.confidence||'low')} confidence)`:'')}
    ${box('Rehab cost',inp('n-rehab','rehab',d.rehab,'e.g. 40000'),d.rehabSource==='maya'?'From '+n+'’s inspection (see the line items below)':rehabTheirs(d)?'Wholesaler’s claim, not checked':'')}
    ${box('Comp-derived ceiling',`<span class="val">${c.compCeiling!=null?money(c.compCeiling):'Not set'}</span>`,w?`Comps point to ARV ${money(w.arv)} <button class="btn ghost sm" data-act="use-arv" data-v="${w.arv}">Use</button>`:'Add comps below')}
    ${box(`${ico('lock')}Locked MAO (authorized)`,inp('n-lock','lockedMao',d.lockedMao,'Not set'),'Overrides the calculation when set')}
    ${box(`${ico('target')}Target price`,inp('n-target','targetPrice',d.targetPrice,c.ready?String(c.target):''),c.ready?`Default ${money(c.target)} (${state.settings.buy.targetPct}% of the way from opening to ceiling)`:'')}
    ${box('Effective MAO',`<span class="val">${c.ready?money(c.mao):'Needs ARV'}</span>`,c.ready?(c.capByThem?`Your numbers allow ${money(c.maoNumbers)}, but they said they’d take ${money(c.floor)}, so that’s the most ${n} pays`:c.locked?'Your locked number':`Calculated (${c.strat==='wholesale'?'wholesale':'flip, '+(c.flipBinding==='profit'?'min profit':'target ROI')})`):'', 'eff')}
  </div>
  ${railHTML(d,c,false)}
  ${c.ready?`<div class="split"><div><b>Walk the math</b><table class="walk" style="width:100%;margin-top:6px"><tbody>${wl.map(([l,v,t])=>`<tr class="${t||''}"><td>${esc(l)}</td><td>${money(v)}</td></tr>`).join('')}</tbody></table>${c.locked?`<p class="small muted" style="margin-top:6px">You locked the MAO at ${money(c.mao)}, so ${n} uses that instead.</p>`:''}</div>
  <div><b>Your result at…</b><table class="walk" style="width:100%;margin-top:6px"><tbody>${atRow(d.source==='wholesaler'?'Asking':'List',L)}${atRow('Their last',their)}${atRow('Your last',ours)}${atRow('Target',c.target)}${atRow('Ceiling',c.mao)}</tbody></table><p class="small muted" style="margin-top:6px">${n} opens at <b>${money(c.opening)}</b> and never offers above <b class="ceil">${money(c.mao)}</b> in cash.</p></div></div>`:`<div class="note amber">Enter an ARV (or run ${n}’s inspection) to compute the ceiling.</div>`}
  ${c.ready&&c.dead?`<div class="note red">At this ARV and rehab there’s no price that hits your target. Pass, or check the numbers.</div>`:''}</section>`;
}
function eyesCard(d,c){
  const n=esc(negName());const a=d.analysis;const cnt=photoCount(d);
  const thumbs=[...(d.photoIds||[]).map(id=>({id,src:photoObjURL[id]})),...(d.photoUrls||[]).map(u=>({id:'url:'+u,src:u}))];
  const vidx=id=>dealPhotos(d).findIndex(p=>p.id===id);
  const gallery=thumbs.length?`<div class="gallery">${thumbs.map(t=>`<div class="ph">${t.src?`<button class="ph-open" data-act="ph-open" data-i="${Math.max(0,vidx(t.id))}" aria-label="Open photo full screen"><img src="${esc(t.src)}" alt="" loading="lazy"></button>`:''}<button class="x" data-act="photo-del" data-pid="${esc(t.id)}" aria-label="Remove photo">${ico('close')}</button></div>`).join('')}</div>`:'';
  const lines=d.rehabLines||[];const sub=lines.reduce((s,x)=>s+(x.cost||0),0);const tot=Math.round(sub*(1+(d.rehabCont??10)/100));
  let report='';
  if(a){
    const C=a.condition||{};const areas=[['structure','Structure'],['roof','Roof'],['exterior','Exterior'],['kitchen','Kitchen'],['bathrooms','Bathrooms'],['living_bedrooms','Living & bedrooms'],['flooring','Flooring'],['mechanicals','Mechanicals']];
    const lvl=String(a.level||'').toLowerCase();const lc=lvl.includes('light')?'green':lvl.includes('gut')?'red':'amber';
    report=`<div class="row"><span class="pill ${lc==='green'?'green':lc==='red'?'red':'orange'}">${esc(a.level||'Report')}</span><span class="small muted">${a.photos?`From ${a.photos} photo${a.photos>1?'s':''}`:'From the listing text only'} · ${fmtWhen(a.at)}${a.model?` · ${/opus/.test(a.model)?'Opus 5.5':/haiku/.test(a.model)?'Haiku 5.5':'Sonnet 5.5'}`:''}</span></div>
    ${a.summary?`<p>${esc(a.summary)}</p>`:''}
    ${(a.notSeen||[]).length?`<div class="note amber row" style="justify-content:space-between"><span><b>Not in the photos:</b> ${a.notSeen.map(esc).join(', ')}. Those repair lines are allowances.</span><button class="btn sm" data-act="ask-photos">${ico('mail')}Ask for these photos</button></div>`:''}
    ${(a.photoLog||[]).length?`<details id="plog"><summary>What ${n} saw in each photo (${a.photoLog.length})</summary><div class="plog">${a.photoLog.map(p=>{const ref=(a.photoRefs||[])[(p.photo||1)-1];const tid=ref?(ref.startsWith('url:')?null:ref):(d.photoIds||[])[(p.photo||1)-1];const src=ref?(ref.startsWith('url:')?ref.slice(4):photoObjURL[ref]):tid?photoObjURL[tid]:(d.photoUrls||[])[(p.photo||1)-1-(d.photoIds||[]).length];
      const vi=dealPhotos(d).findIndex(x=>x.src===src);const nm=vi>=0?photoMarks(d,dealPhotos(d)[vi].id).length:0;
      return `<div class="plog-row">${src&&vi>=0?`<button class="ph-open plog-open" data-act="ph-open" data-i="${vi}" aria-label="Open this photo full screen"><img src="${esc(src)}" alt="" loading="lazy">${nm?`<span class="plog-mk">${nm} marked</span>`:''}</button>`:src?`<img src="${esc(src)}" alt="" loading="lazy">`:`<span class="plog-n">${esc(p.photo)}</span>`}<div><b>${esc(String(p.area||'').replace(/^./,m=>m.toUpperCase()))}</b>${p.condition?` <span class="rate ${['good','fair','poor'].includes(p.condition)?p.condition:'unknown'}"><i></i>${esc(p.condition)}</span>`:''}<p class="small">${esc(p.sees||'')}</p>${(p.flags||[]).length?`<span class="xs muted">${p.flags.map(esc).join(' · ')}</span>`:''}</div></div>`}).join('')}</div></details>`:''}
    <div class="insp">${areas.map(([k,l])=>{const v=C[k]||{};const r=['good','fair','poor'].includes(v.rating)?v.rating:'unknown';return `<div class="insp-item"><div class="row" style="justify-content:space-between"><b>${l}</b><span class="rate ${r}"><i></i>${r==='unknown'?'Not visible':r}</span></div><span class="small muted">${esc(v.notes||'—')}</span></div>`}).join('')}</div>
    ${(a.suggestions||[]).length?`<div><b>Renovation suggestions</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${a.suggestions.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:''}
    <div class="kpis">${a.arv&&a.arv.value?`<div class="kpi purple"><span class="lab">${n}’s ARV estimate</span><span class="val">${money(a.arv.value)}</span><span class="sub">${a.arv.low?moneyK(a.arv.low)+'–'+moneyK(a.arv.high)+' · ':''}${esc(a.arv.confidence||'low')} confidence${a.arv.why?' · '+esc(a.arv.why):''}</span><button class="btn sm" data-act="use-arv" data-v="${floor500(a.arv.value)}" data-src="maya" style="justify-self:start;margin-top:4px">Use as ARV</button></div>`:''}
    ${a.rent&&a.rent.value?`<div class="kpi blue"><span class="lab">Rent estimate</span><span class="val">${money(a.rent.value)}<span class="small">/mo</span></span><span class="sub">${esc(a.rent.why||'')}</span><button class="btn sm" data-act="use-rent" data-v="${Math.round(a.rent.value)}" style="justify-self:start;margin-top:4px">Use as rent</button></div>`:''}
    <div class="kpi"><span class="lab">Rooms seen</span><span class="val">${(a.rooms&&a.rooms.bedrooms)??'?'} bd / ${(a.rooms&&a.rooms.bathrooms)??'?'} ba</span><span class="sub">${esc(a.photoNotes||'')}</span></div></div>
    ${(a.redFlags||[]).length?`<div class="note red"><b>Red flags:</b> ${a.redFlags.map(esc).join(' · ')}</div>`:''}
    ${(a.verify||[]).length?`<div class="note amber"><b>Check on site:</b> ${a.verify.map(esc).join(' · ')}</div>`:''}`;
  }
  return `<section class="card" id="eyes"><div class="card-head"><span class="ci grad">${ico('eye')}</span><div><h2>${n}’s eyes · AI inspection report</h2><p>Drop listing photos; ${n} reads each room and prices the rehab</p></div><div class="ch-r"><button class="btn primary" data-act="deep" data-id="${d.id}">${ico('spark')}${a?'Re-run':'Run'} inspection${cnt?` (${cnt} photo${cnt>1?'s':''})`:''}</button></div></div>
  ${busyHTML('deep:'+d.id)}
  ${gallery}
  <div class="dropzone" id="dropzone" data-drop="${d.id}">${ico('upload')}<span><b>Drop photos here</b>, paste them (Ctrl+V), or <label for="ph-file" style="color:var(--brand-ink);font-weight:700;cursor:pointer">browse</label></span><input type="file" id="ph-file" data-photos="${d.id}" accept="image/*" multiple hidden><span class="xs">Up to 24 photos. Saved on this computer.</span>
  <div class="row" style="width:100%;max-width:560px"><input class="input" id="ph-url" data-draft value="${esc(state.drafts['ph-url']||'')}" placeholder="Or paste photo links (one per line or comma-separated)" style="flex:1"><button class="btn sm" data-act="photo-urls">Add links</button></div></div>
  ${report}
  ${lines.length?`<div><b>Rehab scope</b><div class="tbl-wrap" style="margin-top:6px"><table class="tbl" style="min-width:520px"><thead><tr><th>Item</th><th>Detail</th><th class="r">Cost</th><th></th></tr></thead><tbody>${lines.map((x,i)=>`<tr style="cursor:default"><td><input class="input" id="rl-i${i}" data-fd="rehabLines.${i}.item" value="${esc(x.item)}"></td><td><input class="input" id="rl-d${i}" data-fd="rehabLines.${i}.detail" value="${esc(x.detail)}"></td><td><input class="input tnum" id="rl-c${i}" data-fd="rehabLines.${i}.cost" data-t="num" value="${x.cost??''}" style="width:104px"></td><td><button class="btn ghost sm" data-act="rehab-del" data-i="${i}" aria-label="Remove line">${ico('close')}</button></td></tr>`).join('')}</tbody></table></div>
  <div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="rehab-add">${ico('plus')}Add line</button><label class="field" style="width:130px"><span>Contingency %</span><input class="input tnum" id="rl-cont" data-fd="rehabCont" data-t="num" value="${d.rehabCont??10}"></label><span>Total with contingency: <b class="tnum">${money(tot)}</b></span><button class="btn sm" data-act="use-rehab" data-v="${tot}">Use as rehab cost</button></div></div>`:`<button class="btn ghost sm" data-act="rehab-add" style="justify-self:start">${ico('plus')}Build the scope line by line</button>`}</section>`;
}
function sfCard(d,c){
  if(!c.ready)return '';const s=sfCalc(d,c);const v=s.v;const n=esc(negName());const healthy=s.cf>=250;
  const sl=(id,label,val,min,max,step,fmt)=>`<div class="sl"><div class="slh"><span>${label}</span><b>${fmt}</b></div><input type="range" id="${id}" data-sf="${id.slice(3)}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const pMax=Math.max(10000,Math.round((curList(d)||c.sfCap)*1.4/1000)*1000);
  return `<section class="card" id="sf"><div class="card-head"><span class="ci purple">${ico('dollar')}</span><div><h2>Seller finance simulator</h2><p>For when cash won’t get it done</p></div><div class="ch-r">${d.sfSaved?`<span class="tag green">${ico('check')}Saved for ${n}</span>`:''}<button class="btn sm" data-act="sf-save">${ico('check')}Save as offer</button><button class="btn ghost sm" data-act="sf-reset">Reset</button></div></div>
  <div class="slider-row">${sl('sf-price','SF price',v.price,0,pMax,500,money(v.price))}${sl('sf-downPct','Down payment',v.downPct,0,30,0.5,v.downPct+'% · '+money(s.down))}${sl('sf-payment','Monthly payment',v.payment,0,Math.max(3000,Math.round(v.payment*2.5)),5,money(v.payment))}${sl('sf-rate','Interest rate',v.rate,0,10,0.1,(+v.rate).toFixed(1)+'%')}</div>
  <div class="grid-fields"><label class="field"><span>Rent / month</span><input class="input tnum" id="sf-rent-in" data-fd="sf.rent" data-t="num" value="${v.rent||''}"></label><label class="field"><span>Taxes, insurance, upkeep / month</span><input class="input tnum" id="sf-exp-in" data-fd="sf.expenses" data-t="num" value="${v.expenses||''}"></label></div>
  <div class="note amber">${ico('bolt')} First month: ${money(s.T)} = ${money(Math.max(0,s.principal1))} principal + ${money(s.interest1)} interest · Payoff: ${s.years!=null?s.years.toFixed(1)+' years':'never at this payment (raise it above '+money(s.interest1)+')'}</div>
  <div class="kpis"><div class="kpi ${healthy?'green':'red'}"><div class="k-top"><span class="lab">Monthly cash flow</span><span class="tag ${healthy?'green':'red'}">${healthy?'Healthy':'Thin'}</span></div><span class="val">${money(s.cf)}</span><span class="sub">${healthy?'Above':'Below'} the $250 line</span></div>
  <div class="kpi blue"><div class="k-top"><span class="lab">Annual cash flow</span><span class="tag blue">Annual</span></div><span class="val">${money(s.annual)}</span><span class="sub">Monthly × 12</span></div>
  <div class="kpi purple"><div class="k-top"><span class="lab">Return on cash</span><span class="tag purple">ROI</span></div><span class="val">${pct(s.coc,1)}</span><span class="sub">Annual cash flow ÷ cash in (${money(s.cashIn)})</span></div>
  <div class="kpi solid"><div class="k-top"><span class="lab">Total to the seller</span>${s.overAskPct!=null?`<span class="tag" style="background:rgba(255,255,255,.22);color:#fff">${s.overAskPct>=0?'+':''}${pct(s.overAskPct,1)}</span>`:''}</div><span class="val">${money(s.totalSeller)}</span><span class="sub">${s.overAsk!=null?`${money(Math.abs(s.overAsk))} ${s.overAsk>=0?'more':'less'} than the ${money(curList(d))} asking price`:'Down + all payments'}</span></div></div>
  <div class="split"><div class="formula"><b>Numbers behind it</b><span>Down payment: ${money(s.down)}</span><span>Financed: ${money(s.P)}</span><span>Monthly payment: ${money(s.T)}</span><span>Payoff: ${s.years!=null?s.years.toFixed(1)+' years':'—'}</span><span>Cash in: ${money(s.cashIn)} (down + repairs + 2% closing)</span></div>
  <div class="formula"><b>Formulas</b><ul style="margin:0;padding:0"><li>Cash flow = rent − payment − expenses</li><li>Annual cash flow = monthly × 12</li><li>Return on cash = annual cash flow ÷ cash in</li><li>Total to seller = down + payment × months to payoff</li></ul></div></div>
  <p class="small muted">“Save as offer” hands these terms to ${n} for her next creative pitch. Nothing is sent.</p></section>`;
}
function timelineCard(d,c){
  const t0=d.listedDate||(d.domAtAdd!=null?new Date(new Date(d.created).getTime()-d.domAtAdd*DAY).toISOString():d.created);
  const day=iso=>Math.max(0,(new Date(iso).getTime()-new Date(t0).getTime())/DAY);
  const ev=[];
  (d.priceHistory||[]).forEach((p,i)=>ev.push({lane:0,x:day(p.date),label:(i?'':'Listed ')+moneyK(p.price),kind:'price'}));
  (d.thread||[]).forEach(t=>{if(t.dir!=='note')ev.push({lane:t.dir==='out'?1:2,x:day(t.at),label:t.price?moneyK(t.price):t.channel,kind:t.dir})});
  const todayX=day(nowISO());const maxX=Math.max(todayX,zipDom(d)||0,...ev.map(e=>e.x))+4;
  const W=700,H=176,l=58,r=16,X=v=>l+v/maxX*(W-l-r);const ys=[40,86,130];const step=maxX>180?30:maxX>90?14:maxX>40?7:5;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deal timeline in days on market">`;
  ['Price','You','Them'].forEach((nm,i)=>svg+=`<line class="lane" x1="${l}" x2="${W-r}" y1="${ys[i]}" y2="${ys[i]}"/><text x="4" y="${ys[i]+4}">${nm}</text>`);
  for(let v=0;v<=maxX;v+=step)svg+=`<text x="${X(v)}" y="${H-6}" text-anchor="middle">${Math.round(v)}d</text>`;
  if(zipDom(d))svg+=`<line x1="${X(zipDom(d))}" x2="${X(zipDom(d))}" y1="18" y2="${H-22}" stroke="var(--s-amber)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${X(zipDom(d))+4}" y="13" style="fill:var(--t-amber)">ZIP avg ${zipDom(d)}d</text>`;
  svg+=`<line x1="${X(todayX)}" x2="${X(todayX)}" y1="18" y2="${H-22}" stroke="var(--ink)" stroke-width="1"/><text x="${X(todayX)-4}" y="13" text-anchor="end">Today · ${Math.round(todayX)}d</text>`;
  ev.forEach(e=>{const x=X(e.x),y=ys[e.lane];
    if(e.kind==='price')svg+=`<rect x="${x-5}" y="${y-5}" width="10" height="10" transform="rotate(45 ${x} ${y})" fill="var(--s-green)"/>`;
    else if(e.kind==='out')svg+=`<circle cx="${x}" cy="${y}" r="6" fill="var(--s-blue)"/>`;
    else svg+=`<circle cx="${x}" cy="${y}" r="5.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`;
    svg+=`<text x="${x}" y="${y-10}" text-anchor="middle">${esc(e.label)}</text>`});
  svg+='</svg>';
  const crossed=zipDom(d)&&todayX>zipDom(d);
  return `<section class="card tl" id="timeline"><div class="card-head"><span class="ci slate">${ico('clock')}</span><div><h2>Deal timeline</h2><p>Offers, replies and price changes in days on market</p></div><div class="ch-r"><button class="btn sm" data-act="price-drop">Log a price change</button></div></div><div class="tbl-wrap" style="border:0">${svg}</div>
  ${crossed?`<div class="note amber">Past the ZIP average by ${Math.round(todayX-zipDom(d))} days. Sellers often get flexible here; a good moment to follow up.</div>`:''}
  ${!zipDom(d)?'<p class="small muted">Add the ZIP’s average days on market in Details (or it fills in from Redfin market data) to see when this seller crosses it.</p>':''}</section>`;
}
function detailsCard(d,c){
  const a=d.agent||{};const isWs=d.source==='wholesaler';const ck=d.checklist||{};
  const items=[['emd','Earnest money delivered to title'],['option','Option period end date noted'],['inspect','Inspection or walkthrough done'],['buyer',isWs||c.strat==='wholesale'?'End buyer lined up':'Contractor bids in'],['disclose','Wholesale disclosure sent to buyer and seller (many states require it when assigning)'],['title','Title commitment reviewed']];
  const f=(id,path,label,val,type,extra)=>`<label class="field"><span>${label}</span><input class="input ${type==='num'?'tnum':''}" id="${id}" data-fd="${path}" ${type==='num'?'data-t="num"':''} value="${esc(val??'')}" ${extra||''}></label>`;
  return `<section class="card" id="details"><div class="card-head"><span class="ci slate">${ico('user')}</span><div><h2>Details</h2><p>Contact, property facts and notes ${esc(negName())} reads</p></div><div class="ch-r"><div class="seg" role="group" aria-label="Source">${[['mls','On-market'],['wholesaler','Wholesaler']].map(([v,l])=>`<button data-act="source" data-v="${v}" aria-pressed="${(d.source||'mls')===v}">${l}</button>`).join('')}</div></div></div>
  <div class="grid-fields">${f('ag-name','agent.name',isWs?'Wholesaler':'Listing agent',a.name)}${f('ag-email','agent.email','Email',a.email,'','inputmode="email"')}${f('ag-phone','agent.phone','Phone',a.phone,'','inputmode="tel"')}${f('ag-brk','agent.brokerage',isWs?'Company':'Brokerage',a.brokerage)}</div>
  <div class="grid-fields">${f('pd-address','address','Street address',d.address)}${f('pd-city','city','City',d.city)}${f('pd-state','state','State',d.state)}${f('pd-zip','zip','ZIP',d.zip)}
  ${f('pd-list','_list',isWs?'Asking price':'List price',curList(d),'num')}${f('pd-beds','beds','Beds',d.beds,'num')}${f('pd-baths','baths','Baths',d.baths,'num')}${f('pd-sqft','sqft','Sq ft',d.sqft,'num')}${f('pd-lot','lotSqft','Lot sq ft',d.lotSqft,'num')}${f('pd-year','year','Year built',d.year,'num')}
  <label class="field"><span>Property type</span><select class="input" id="pd-type" data-fd="propertyType">${Object.entries(PROP_TYPES).map(([k,v])=>`<option value="${k}" ${(d.propertyType||'single_family')===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="field"><span>MLS status</span><select class="input" id="pd-mls" data-fd="mlsStatus">${Object.entries(MLS_STATUS).map(([k,v])=>`<option value="${k}" ${(d.mlsStatus||'')===k?'selected':''}>${v[0]}</option>`).join('')}</select></label>
  ${f('pd-mlsid','mlsId','MLS ID',d.mlsId)}${f('pd-zipdom','zipAvgDom','ZIP avg days on market',d.zipAvgDom,'num',d.zipDomAuto?'placeholder="'+d.zipDomAuto+' (Redfin)"':'')}
  <label class="field"><span>Listed on</span><input class="input" type="date" id="pd-listed" data-fd="listedDate" data-t="date" value="${esc(d.listedDate?isoDay(d.listedDate):'')}"></label>${f('pd-url','listingUrl','Listing link',d.listingUrl)}</div>
  <label class="field"><span>Listing description</span><textarea class="input" id="pd-desc" data-fd="description" rows="3">${esc(d.description)}</textarea></label>
  <label class="field"><span>Private notes ${esc(negName())} reads (never quoted)</span><textarea data-dict class="input" id="pd-notes" data-fd="notes" rows="3" placeholder="Seller situation, what the agent said on the phone…">${esc(d.notes)}</textarea></label>
  ${isWs&&d.wsClaims?`<div class="note"><b>What the wholesaler claimed:</b> ${[['Asking',d.wsClaims.asking],['They’d take',d.wsClaims.accept],['ARV',d.wsClaims.arv],['Repairs',d.wsClaims.rehab],['Rent',d.wsClaims.rent]].filter(x=>x[1]!=null).map(([l,v])=>l+' '+money(v)).join(' · ')}${d.wsClaims.terms?' · Terms: '+esc(d.wsClaims.terms):''}${d.wsClaims.deadline?' · Deadline: '+esc(d.wsClaims.deadline):''}${d.wsClaims.access?' · Access: '+esc(d.wsClaims.access):''}${(d.wsClaims.redFlags||[]).length?`<br><b>Check:</b> ${d.wsClaims.redFlags.map(esc).join(' · ')}`:''}${(d.wsClaims.notes||[]).length?`<br><b>Also in the email:</b> ${d.wsClaims.notes.map(esc).join(' · ')}`:''}</div>`:''}
  ${['contract','closed'].includes(d.stage)?`<div><b>Contract checklist</b>${items.map(([k,l])=>`<label class="check"><input type="checkbox" id="ck-${k}" data-fd="checklist.${k}" data-t="bool" ${ck[k]?'checked':''}><span>${esc(l)}</span></label>`).join('')}</div>`:''}
  <div class="row"><button class="btn danger" data-act="delete-deal">${ico('trash')}Delete deal</button></div></section>`;
}
function mapCard(d){
  const q=[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ');if(!q)return '';
  return `<section class="card" id="map"><div class="card-head"><span class="ci red">${ico('pin')}</span><div><h2>Property location</h2><p>${esc(q)}</p></div></div><iframe class="map" title="Map of ${esc(q)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed"></iframe></section>`;
}

/* ---------- Maya action panel ---------- */
function mayaPanel(d,c){
  const n=esc(negName());const tab=state.mayaTab;const key='deal:'+d.id;
  const chat=(d.mayaChat||[]).slice(-30);
  const busyAny=state.busy[key]||state.busy['chat:'+d.id];
  let body='';
  if(tab==='chat'){
    body=`<div class="chatlog" id="chatlog" data-stick="1">${chat.length?chat.map(m=>`<div class="bub ${m.role==='user'?'me':''}"><span class="who">${m.role==='user'?'You':n}</span>${esc(m.content)}</div>`).join(''):`<div class="bub"><span class="who">${n}</span>Ask me anything about this deal, or tap an action. I’ll draft the message and you approve it${d.autopilot&&state.settings.auto.enabled?' (on autopilot I send safe ones myself)':''}.</div>`}${state.busy['chat:'+d.id]?`<div class="bub"><span class="who">${n}</span><span class="muted">thinking…</span></div>`:''}</div>
    <div class="qchips">${QUICK.map(q=>`<button class="qchip ${q.c}" data-act="quick" data-q="${q.id}" ${busyAny?'disabled':''}>${esc(q.label)}</button>`).join('')}</div>
    <div class="chat-in"><textarea data-dict class="input" id="maya-msg" data-draft rows="2" placeholder="Chat with ${n} about this property…">${esc(state.drafts['maya-msg']||'')}</textarea><button class="send-btn" data-act="maya-send" aria-label="Send to ${n}" ${busyAny?'disabled':''}>${ico('send')}</button></div>`;
  }else{
    const isSms=tab==='sms';
    const can=isSms?canText(d):canEmail(d);
    body=`<div style="padding:12px 16px;display:grid;gap:10px">${isSms?`<p class="small muted">${smsOn()?'Texts go out from your Twilio number.':gvOn()?(d.gvThreadId?'Replies go out through Google Voice.':'Google Voice can only reply after they text you first.'):'Texting isn’t automatic yet: copy the text and send it from your phone, or connect Twilio in Connect.'}</p>`:`<p class="small muted">${gmailOn()?`Sends from ${esc(sendEmail())}${ownThread(d)?', in the same thread':''}.`:'Connect Gmail to send from here.'}</p>`}
      ${isSms?'':`<input class="input" id="cmp-subj" data-draft placeholder="Subject" value="${esc(state.drafts['cmp-subj']||('Re: '+streetOf(d.address)))}">`}
      <textarea class="input" data-dict id="${isSms?'cmp-sms':'cmp-body'}" data-draft rows="${isSms?3:6}" placeholder="Write your own ${isSms?'text':'email'} to ${esc(counterpart(d))}">${esc(state.drafts[isSms?'cmp-sms':'cmp-body']||'')}</textarea>
      <div class="row"><button class="btn primary sm" data-act="compose-send" data-ch="${isSms?'sms':'email'}" ${can?'':'disabled'}>${ico('send')}Send ${isSms?'text':'email'}</button><button class="btn sm" data-act="compose-log" data-ch="${isSms?'sms':'email'}">I sent it myself</button>${busyHTML('send:'+d.id,false)}</div></div>`;
  }
  const next=nextStepHTML(d,c);
  return `<div class="maya"><div class="maya-head"><span class="avatar lg">${n[0]||'M'}</span><div><h3>Actions</h3><p>Take action on this property with ${n}</p></div><span class="spacer"></span>${switchHTML(d.autopilot,'autopilot',d.id,'Autopilot')}</div>
  <div class="maya-tabs" role="tablist">${[['chat','AI Chat','spark'],['sms','SMS','sms'],['email','Email','mail']].map(([t,l,i])=>`<button role="tab" data-act="maya-tab" data-v="${t}" aria-selected="${tab===t}">${ico(i)}${l}</button>`).join('')}</div>
  ${body}${busyHTML(key)}${d.draft?draftHTML(d,c):next}</div>`;
}
function nextStepHTML(d,c){
  const n=esc(negName());if(d.optedOut)return `<div class="draft"><div class="note red">They asked not to be contacted. ${n} won’t draft anything else. <button class="btn ghost sm" data-act="undo-optout">That’s wrong, undo</button></div></div>`;
  if(!c.ready)return `<div class="draft"><div class="note amber">Add the ARV and rehab in ${n}’s numbers (or run the inspection) so she knows your ceiling.</div></div>`;
  if(c.dead||state.busy['deal:'+d.id])return '';
  const f=followDue(d);const b=[];
  if(!ourCount(d))b.push(`<button class="btn primary" data-act="ai-opening">${ico('spark')}Draft opening offer · ${moneyK(c.opening)}</button>`);
  else if(replyWaiting(d))b.push(`<button class="btn primary" data-act="ai-reply">${ico('spark')}Ask ${n} how to answer</button>`);
  else{if(f)b.push(`<button class="btn ${f.overdue?'primary':''}" data-act="ai-follow">${ico('spark')}Draft follow-up #${f.step+1}${f.overdue?'':' (due '+fmtDate(new Date(f.due).toISOString())+')'}</button>`);b.push(`<button class="btn" data-act="ai-reply">${ico('spark')}Ask ${n} for the next move</button>`)}
  return `<div class="draft"><div class="row">${b.join('')}</div></div>`;
}
function draftHTML(d,c){
  const dr=d.draft;const n=esc(negName());const act=dr.action||dr.kind;
  const cap=act==='creative'?c.sfCap:c.mao;
  const over=[...ceilingCheck(dr.email&&dr.email.body,d,c,cap,dr),...ceilingCheck(dr.sms,d,c,cap,dr)];
  const priceOver=isOfferDraft(dr)&&dr.price!=null&&c.ready&&dr.price>cap;const guarded=!!(over.length||priceOver);
  const flags=(dr.flags||[]).map(f=>`<div class="note ${f.cls==='green'?'green':f.cls==='red'?'red':'amber'}">${esc(f.text)}</div>`).join('');
  const guard=!guarded?'':cap<=0?`<div class="note red"><b>Ceiling guard:</b> at this ARV (${money(c.A)}) and repairs (${money(d.rehab)}) no price hits your target, so your ceiling is $0 and ${n} shouldn’t offer anything yet. Check the ARV and repairs (In-depth analysis), or step back instead.</div>`:`<div class="note red"><b>Ceiling guard:</b> this offer ${priceOver?`is ${money(dr.price)}`:`mentions ${[...new Set(over)].map(money).join(', ')}`}, above your ${act==='creative'?'seller-finance cap':'ceiling'} of ${money(cap)}. Edit it before sending.</div>`;
  const sent=dr.sent||{};const ce=canEmail(d),ct=canText(d);const to=d.agent||{};
  const mail=`mailto:${encodeURIComponent(to.email||'')}?subject=${encodeURIComponent((dr.email&&dr.email.subject)||'')}&body=${encodeURIComponent((dr.email&&dr.email.body)||'')}`;
  const sms=`sms:${encodeURIComponent(to.phone||'')}?&body=${encodeURIComponent(dr.sms||'')}`;
  return `<div class="draft" id="draft"><div class="draft-h"><span class="pill purple">${esc(ACTION_LABEL[act]||'Draft')}</span><b>${n}’s draft${dr.price!=null?` · <span class="tnum">${money(dr.price)}</span>`:''}</b><span class="spacer"></span><span class="xs muted">${ago(dr.at)}</span></div>
    ${d.needsYou?`<div class="note amber"><b>Waiting for your OK:</b> ${esc(d.needsYou)}</div>`:''}
    ${dr.summary?`<p class="small"><span class="muted">They said:</span> ${esc(dr.summary)}</p>`:''}
    ${dr.why?`<p class="small"><span class="muted">Why:</span> ${esc(dr.why)}</p>`:''}
    ${dr.terms?`<p class="small"><span class="muted">Terms:</span> ${esc(dr.terms)}</p>`:''}
    ${(dr.signals||[]).length?`<div class="row" style="gap:4px">${dr.signals.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div>`:''}
    ${flags}${guard}
    <label class="field"><span>Offer price in this message</span><input class="input tnum" id="dr-price" data-fd="draft.price" data-t="num" value="${dr.price??''}" inputmode="numeric"></label>
    <label class="field"><span>Email subject</span><input class="input" id="dr-subj" data-fd="draft.email.subject" value="${esc(dr.email&&dr.email.subject)}"></label>
    <label class="field"><span>Email</span><textarea class="input" id="dr-body" data-fd="draft.email.body" rows="8">${esc(dr.email&&dr.email.body)}</textarea></label>
    <div class="row">${ce&&!sent.email?`<button class="btn sm primary" data-act="send-email" ${guarded?'disabled':''}>${ico('mail')}Send email</button>`:''}${!ce&&!sent.email?`<a class="btn sm" href="${esc(mail)}" target="_blank" rel="noopener">${ico('mail')}Open in mail app</a>`:''}<button class="btn sm" data-act="copy" data-src="dr-body">${ico('copy')}Copy</button><button class="btn sm ghost" data-act="mark-sent" data-ch="email" ${sent.email?'disabled':''}>${ico('check')}${sent.email?'Sent':'I sent it myself'}</button></div>
    <label class="field"><span>Text (${(dr.sms||'').length} chars)</span><textarea class="input" id="dr-sms" data-fd="draft.sms" rows="3">${esc(dr.sms)}</textarea></label>
    <div class="row">${ct&&!sent.sms?`<button class="btn sm primary" data-act="send-sms" ${guarded?'disabled':''}>${ico('sms')}Send text</button>`:''}${!ct&&!sent.sms?`<a class="btn sm" href="${esc(sms)}">${ico('sms')}Open in texts</a>`:''}<button class="btn sm" data-act="copy" data-src="dr-sms">${ico('copy')}Copy</button><button class="btn sm ghost" data-act="mark-sent" data-ch="sms" ${sent.sms?'disabled':''}>${ico('check')}${sent.sms?'Sent':'I sent it myself'}</button></div>
    ${guarded?`<button class="btn sm ghost danger" data-act="send-force" style="justify-self:start">I checked it. Send anyway</button>`:''}
    ${busyHTML('send:'+d.id,false)}
    <div class="row" style="border-top:1px solid var(--line);padding-top:10px">${act==='accept'?'<button class="btn green sm" data-act="to-contract">Move to under contract</button>':''}<button class="btn ghost sm" data-act="redraft">${ico('refresh')}Redraft</button><button class="btn ghost sm" data-act="discard-draft">${sent.email||sent.sms?'Done':'Discard'}</button></div></div>`;
}
