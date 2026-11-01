/* ================= Maya's take: one honest verdict per listing =================
   What she did (links, photos, email/PDF, comps, repairs, your buy box, the formula), what didn't work and why,
   how sure she is about the offer, and the next step: negotiate, ask for more, or run the Opus in-depth analysis. */
const LEVEL_RANK={light:1,moderate:2,full:3};
function levelOf(a){const l=String((a&&a.level)||'').toLowerCase();return l.includes('gut')?'full':l.includes('light')?'light':l?'moderate':null}
function inMyAreas(d){
  const T=typeof mkTargets==='function'?mkTargets():[];if(!T.length)return null;
  const z=String(d.zip||'').slice(0,5),city=String(d.city||'').toLowerCase();if(!z&&!city)return null;
  return T.some(t=>(t.type==='zip'&&t.key===z)||(Array.isArray(t.zips)&&z&&t.zips.includes(z))||(city&&String(t.label||t.key||'').toLowerCase().includes(city)));
}
function mayaWorking(d){const id=d.id;return ['links:','research:','deep:','depth:','send:'].some(k=>state.busy[k+id])||Object.keys(state.busy).some(k=>k.startsWith('mail:')&&(d.seenMsgIds||[]).includes(k.slice(5)))||!!d.checking||!!(d.linkFill&&d.linkFill.pending)}
function mayaTake(d){
  const c=calc(d);const n=negName();const steps=[];const miss=[];let score=0;
  const add=(ok,label,detail,fix)=>steps.push({ok,label,detail,fix});
  /* 1. the email and its PDF */
  const mails=(d.seenMsgIds||[]).map(id=>state.mail.emails[id]).filter(Boolean);const pdfWait=mails.filter(m=>(m.docs||0)>0&&!m.docRead);
  const pdfs=(d.docs||[]).length;const big=(d.docSkipped||[]).filter(x=>x.why==='too_big');
  if(d.source==='wholesaler'||ins(d).length)add(pdfWait.length?null:big.length&&!pdfs?false:true,'Email'+(pdfs||pdfWait.length||big.length?' and PDF':''),
    pdfWait.length?`The PDF hasn’t been read yet; ${n} reads it on the next Gmail check.`:big.length&&!pdfs?`The PDF is too big for your Gmail script. Update the script (Connect → Gmail).`:`Read every line${pdfs?` and the ${pdfs>1?pdfs+' PDFs':'PDF'} (${(d.docs||[]).map(x=>x.pages?x.pages+' pages':'').filter(Boolean).join(', ')||'all pages'})`:''}.`);
  /* 2. links */
  const links=typeof dealLinks==='function'?dealLinks(d):[];const lf=d.linkFill||{};
  if(links.length){const ok=(lf.ok||[]).length,bad=(lf.robot||[]).length+(lf.blocked||[]).length+(lf.noAccess||[]).length;
    if(!lf.at)add(null,'Links',`${links.length} link${links.length>1?'s':''} not opened yet${gmailOn()?'':' (connect Gmail so she can)'}.`);
    else add(bad?(ok?null:false):true,'Links',`Opened ${ok||lf.opened||0} of ${links.length}${bad?`; ${bad} couldn’t be opened (${[(lf.robot||[]).length?'asks “not a robot”':'',(lf.noAccess||[]).length?'photo folder not shared':'',(lf.blocked||[]).length?'site blocks robots':''].filter(Boolean).join(', ')})`:''}${(lf.filled||[]).length?`; filled in ${lf.filled.join(', ')}`:''}.`,bad?'links':null)}
  /* 3. photos */
  const ph=photoCount(d);
  if(ph)add(ph>=6?true:null,'Photos',`${ph} photo${ph>1?'s':''}${ph<6?' (few: interiors may be missing)':''}.`);
  else{add(false,'Photos','No photos yet.','photos');miss.push('photos')}
  /* 4. ARV from comps */
  const R=d.research;const sold=(d.comps||[]).filter(x=>(x.status||'sold')==='sold');const reno=sold.filter(x=>x.reno!==false).length;
  let arvPts=0;
  if(!d.arv){add(false,'ARV (comps)',R?'Research ran but found no usable sold comps.':researchWhy(d),R?'opus':'research');miss.push('a checked ARV')}
  else if(d.arvSource==='you'&&!arvTheirs(d)){arvPts=2;add(true,'ARV (comps)',`${money(d.arv)}: your number.`)}
  else if(d.arvSource==='comps'||(R&&sold.length>=3&&!arvTheirs(d)&&d.arvSource!=='maya')){arvPts=2;add(true,'ARV (comps)',`${money(d.arv)} from ${sold.length} sold comp${sold.length===1?'':'s'}${reno?` (${reno} renovated)`:''}.`)}
  else if(d.arvSource==='maya'){arvPts=1;add(null,'ARV (comps)',`${money(d.arv)} is ${n}’s estimate: few good sold comps nearby, so it’s rough.`,'opus');miss.push('more sold comps')}
  else{add(false,'ARV (comps)',`${money(d.arv)} is the wholesaler’s claim, not checked yet. ${R?'':researchWhy(d)}`,R?'opus':'research');miss.push('a checked ARV')}
  /* 5. repairs */
  const a=d.analysis;let rehPts=0;
  if(d.deepErr&&!a){add(false,'Repairs',`The repair inspection didn’t finish (${d.deepErr.msg}).`,'opus');miss.push('a repair estimate')}
  else if(a&&d.rehab){const seen=a.photos||0,ns=(a.notSeen||[]).length;rehPts=seen>=6&&ns<=2?2:1;
    add(rehPts===2?true:null,'Repairs',`${money(d.rehab)} from a photo inspection${seen?` of ${seen} photo${seen>1?'s':''}`:' of the listing'} (${a.level||'report'})${ns?`; not seen: ${a.notSeen.slice(0,4).join(', ')}`:''}.`,rehPts===2?null:'photos');if(rehPts<2)miss.push('photos of '+((a.notSeen||[]).slice(0,2).join(' and ')||'the inside'))}
  else if(d.rehab&&d.rehabSource==='you'){rehPts=2;add(true,'Repairs',`${money(d.rehab)}: your number.`)}
  else if(d.rehab&&rehabTheirs(d)){add(false,'Repairs',`${money(d.rehab)} is the wholesaler’s claim, not checked.${ph?` ${n} prices repairs from the photos after research.`:''}`,ph?'opus':'photos');miss.push('a checked repair estimate')}
  else if(d.rehab){rehPts=1;add(null,'Repairs',`${money(d.rehab)} (no inspection yet).`)}
  else{add(false,'Repairs','No repair estimate yet.',ph?'opus':'photos');miss.push('a repair estimate')}
  /* 6. your buy box */
  const box=[];const cap=boxCap();const L=curList(d);
  if(L==null)box.push([null,'no asking price yet']);else if(cap&&L>cap)box.push([false,`asking ${moneyK(L)} is over your ${moneyK(cap)} cap`]);else box.push([true,`asking ${moneyK(L)}${cap?` is under your ${moneyK(cap)} cap`:''}`]);
  const area=inMyAreas(d);if(area!=null)box.push([area,area?'in your markets':`${d.city||d.zip} isn’t one of your markets`]);
  const pt=d.propertyType||'single_family';box.push([pt==='single_family'?true:null,pt==='single_family'?'single-family':(PROP_TYPES[pt]||pt).toLowerCase()+' (you buy single-family)']);
  const lv=levelOf(a);const maxLv=(state.settings.buy||{}).rehabMax||'moderate';if(lv)box.push([LEVEL_RANK[lv]<=LEVEL_RANK[maxLv],lv==='full'?'full gut (heavier than your cosmetic-to-medium rehab)':lv==='light'?'light rehab':'medium rehab']);
  const boxBad=box.some(x=>x[0]===false);
  add(boxBad?false:box.some(x=>x[0]===null)?null:true,'Your buy box',box.map(x=>x[1]).join(' · ').replace(/^./,m=>m.toUpperCase())+'.');
  /* 7. the formula */
  if(c.ready){const wsx=c.strat==='wholesale';
    const f=wsx?`ARV ${moneyK(c.A)} × ${(state.settings.buy.wsBuyerPct||70)}% − repairs ${moneyK(c.R)} − your fee ${moneyK(state.settings.buy.wsFee||0)}`:`ARV ${moneyK(c.A)} minus selling costs, repairs ${moneyK(c.R)}, holding ${moneyK(c.H)} and your ${(state.settings.buy.targetRoi||0)}% return / ${moneyK(state.settings.buy.minProfit||0)} profit`;
    if(c.dead)add(false,'Offer math',`${f} leaves nothing: no deal at this ARV.`);
    else add(true,'Offer math',`${f} → most you pay ${money(c.mao)}${c.capByThem?' (capped at what they said they’d take)':''}; open at ${money(c.opening)}${L?`; asking is ${L<=c.mao?'within it':pct((L-c.mao)/L,0)+' over it'}`:''}.`)}
  else add(false,'Offer math','Needs an ARV before there’s a number.');
  /* how sure */
  if(hasStreet(d))score++;else miss.unshift('the street address');if(L!=null)score++;
  score+=arvPts+rehPts;const conf=arvPts>=1&&rehPts>=1&&score>=5?'high':score>=3&&arvPts>=1?'medium':'low';
  let verdict;
  if(mayaWorking(d))verdict='working';
  else if((c.ready&&c.dead)||(cap&&L!=null&&L>cap&&leadSect(d)==='new')||(boxBad&&lv==='full'))verdict='nofit';
  else verdict=conf==='high'?'ready':conf==='medium'?'close':'thin';
  return {c,steps,conf,verdict,miss:[...new Set(miss)],score};
}
function researchWhy(d){const n=negName();const cap=(state.settings.research||{}).dailyMax??3;
  return d.researchErr?`Research didn’t finish (${d.researchErr.msg}).`:d.researchSkip==='cap'?`Research is waiting: ${n} already did today’s ${cap} automatic ones (Settings → research limit). She does it tomorrow, or press Research now.`:d.researchSkip==='over'?'Not researched: over your price cap.':d.researchSkip==='price'?'Not researched: asking is far above your ceiling.':!hasStreet(d)?'Needs a street address before research.':!(state.settings.research||{}).auto?'Automatic research is off.':'Research hasn’t run yet.'}
const TAKE_LABEL={working:['purple','Working on it'],ready:['green','Ready to negotiate'],close:['amber','Almost there'],thin:['orange','Not enough info'],nofit:['red','Not a fit']};
function takeTag(d){if(d.example)return '';const t=mayaTake(d);const [c,l]=TAKE_LABEL[t.verdict];return `<span class="tag ${c}">${t.verdict==='working'?'<span class="spin sm"></span>':''}${l}</span>`}
function verdictCard(d){
  if(d.example)return '';const t=mayaTake(d);const n=esc(negName());const c=t.c;const [cls,label]=TAKE_LABEL[t.verdict];
  const icon=s=>s.ok===true?`<span class="vk ok" aria-label="done">${ico('check')}</span>`:s.ok===false?`<span class="vk bad" aria-label="problem">${ico('close')}</span>`:`<span class="vk mid" aria-label="partly">!</span>`;
  const fixBtn=f=>f==='opus'?`<button class="btn sm" data-act="in-depth" ${state.busy['depth:'+d.id]||!aiOn()?'disabled':''}>${ico('spark')}In-depth (Opus)</button>`:f==='research'?`<button class="btn sm" data-act="research" ${state.busy['research:'+d.id]||!aiOn()?'disabled':''}>${ico('search')}Research now</button>`:f==='photos'?`<button class="btn sm" data-act="ask-for-photos" ${!aiOn()?'disabled':''}>${ico('camera')}Ask them for photos</button>`:f==='links'?`<a class="btn sm" href="#links">${ico('link')}See the links</a>`:'';
  const missTxt=t.miss.length?t.miss.slice(0,3).join(', '):'';
  const rec=t.verdict==='working'?`${n} is still working through this one (links, research or the photo inspection). This updates when she’s done.`
    :t.verdict==='ready'?`<b>She’s confident in the number.</b> Open at <b>${money(c.opening)}</b> and don’t go above <b>${money(c.mao)}</b>.`
    :t.verdict==='close'?`<b>Close, but not solid yet.</b> Still missing: ${esc(missTxt)}. Ask the wholesaler, or run the in-depth analysis (Opus, about $0.50–1.50) to firm up the ARV and repairs before you negotiate.`
    :t.verdict==='thin'?`<b>Not enough to trust an offer yet.</b> Missing: ${esc(missTxt||'checked numbers')}. Run the in-depth analysis (Opus, about $0.50–1.50); it opens every link, finds the sold comps and prices the repairs from the photos.`
    :c.ready&&c.dead?`<b>The numbers don’t work.</b> At this ARV and repair cost there’s no price that hits your return. Pass, or ask for better numbers.`
    :`<b>Outside your buy box.</b> ${esc(t.steps.find(s=>s.label==='Your buy box').detail)} Pass, or open low if you want to try.`;
  const actions=t.verdict==='ready'&&!ourCount(d)?`<button class="btn primary sm" data-act="ai-opening" ${!aiOn()?'disabled':''}>${ico('spark')}Draft opening offer · ${moneyK(c.opening)}</button>`
    :['close','thin'].includes(t.verdict)?`${fixBtn('opus')}${t.miss.some(m=>/photo/.test(m))?fixBtn('photos'):''}`:'';
  return `<section class="card take ${cls}" id="maya-take"><div class="card-head"><span class="ci ${cls==='orange'?'amber':cls}">${ico('spark')}</span><div><h2>${n}’s take</h2><p>Everything she checked on this listing, and how sure she is</p></div><div class="ch-r"><span class="pill ${cls==='slate'?'':cls}">${label}</span>${t.verdict!=='working'?`<span class="small muted">Confidence: <b>${t.conf}</b></span>`:''}</div></div>
    <p class="take-rec">${rec}</p>${actions?`<div class="row" style="gap:8px;flex-wrap:wrap">${actions}</div>`:''}
    <ul class="take-steps">${t.steps.map(s=>`<li>${icon(s)}<div><b>${esc(s.label)}</b><span class="small">${esc(s.detail)}</span></div>${s.ok!==true&&s.fix&&!(actions&&['opus','photos'].includes(s.fix))?fixBtn(s.fix):''}</li>`).join('')}</ul></section>`;
}
