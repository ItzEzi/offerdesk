/* ================= Practice: a call brief before every call, hidden objectives that decide the score ================= */
const PR_STAGES={
  first:['First call','You’re calling about the listing before making any offer'],
  offer_sent:['Following up on your offer','You emailed a written cash offer a few days ago and haven’t heard back'],
  countered:['They countered','The agent came back with a counter; you’re calling to negotiate'],
  price_cut:['Price just dropped','The listing just had a price cut; you’re calling to re-engage']
};
/* how low the seller will really go, relative to YOUR ceiling, so a good call can actually get there */
const PR_FLOOR={tough:[.98,1.12],stale:[.86,1.0],wholesaler:[.92,1.06],offended:[.95,1.08]};
const PR_METROS=['Dayton, OH','Cleveland, OH','Indianapolis, IN','Kansas City, MO','St. Louis, MO','Memphis, TN','Birmingham, AL','Columbus, OH','Toledo, OH','Detroit, MI','Fort Worth, TX','San Antonio, TX','Jacksonville, FL','Akron, OH','Oklahoma City, OK','Tulsa, OK','Louisville, KY','Pittsburgh, PA'];
const PR_GRADE=s=>s>=85?['Closer','green']:s>=70?['Solid call','blue']:s>=50?['Getting there','amber']:['Rough call','red'];
function pickCaseMarket(){
  const T=(state.settings.markets||{}).targets||[];const t=T[Math.floor(Math.random()*T.length)];
  if(t){const o=t.type==='zip'?DISC.byZip[t.key]:null;return {label:t.type==='zip'?`${t.key}${o&&o.city?' ('+o.city+', '+o.st+')':''}`:t.label,zip:t.type==='zip'?t.key:(t.zips||[])[Math.floor(Math.random()*Math.max(1,(t.zips||[]).length))]||'',from:'your target markets'}}
  return {label:PR_METROS[Math.floor(Math.random()*PR_METROS.length)],zip:'',from:'a typical investor market'};
}
const HIDDEN_SPEC=`"agentReputation":"one sentence an investor might hear about this agent before calling",
"painPoints":["3-5 things the investor can see or was told (listing facts, condition, days on market, cuts). Facts only, no guesses about the seller's private situation"],
"hidden":{"seller":{"situation":"why they are selling (the investor does not know this)","pressure":"their timeline and money pressure","wants":"what would move them besides price"},
 "secrets":["2-3 facts the agent knows and shares only if the investor asks the right question with some rapport (for example a failed buyer's inspection, the seller already bought another house, a lien)"],
 "objectives":[{"id":"o1","goal":"something a great investor would achieve or uncover on THIS call","unlock":"exactly what the investor must ask or do for the agent to reveal or agree to it","points":15}]},
"otherInterest":"what the agent can truthfully say about other buyers (may be none)"`;
function promptCase(persona,stage,mk,zipFacts){
  const P=PERSONAS[persona];const b=state.settings.buy;
  return `Create a realistic, made-up practice case for a real estate investor who buys houses to ${STRAT_LABEL[b.strategy]||'flip'}. It must read like a real deal file: specific, internally consistent numbers, nothing generic.
Market: ${mk.label}${mk.zip?` (ZIP ${mk.zip})`:''}.${zipFacts?` Real ZIP data to stay consistent with: ${zipFacts}`:''}
The other side is a ${persona==='wholesaler'?'wholesaler':'listing agent'}: ${P.brief}.
Where the deal stands: ${PR_STAGES[stage][1]}.
Make a single-family house that needs work (so an investor deal makes sense): list price, condition, a short price history matching the days on market, 3–4 recent sold comps nearby (at least two renovated) that support an ARV, and a rehab budget by line item.
Hidden objectives: exactly 4, points adding up to 60, specific to this case and this agent (for example: uncover the real reason for selling, learn the seller's deadline, get the agent to name a number first, get a commitment to present a written offer today, trade a fast close or rent-back for price, find out about the failed buyer). One may be a trap to avoid (for example: never reveal your maximum).
Use invented street names and invented people. No real company names.
Reply with only JSON:
{"property":{"street":"123 Example St","city":"","state":"two letters","zip":"","beds":3,"baths":1.5,"sqft":1300,"lotSqft":5000,"year":1955,"condition":"2-3 sentences on what is dated or broken","remarks":"2 sentences of MLS-style listing remarks"},
"listPrice":0,"originalListPrice":0,"daysOnMarket":0,
"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|pending|back_on_market|sold","price":0,"note":"short"}],
"comps":[{"address":"","soldDate":"YYYY-MM-DD","price":0,"sqft":0,"beds":3,"baths":2,"condition":"renovated|average|as-is","distance":0.3}],
"arv":0,"arvWhy":"one sentence","rehabItems":[{"item":"","cost":0}],
"agent":{"name":"first and last","brokerage":"fictional","style":"one sentence on how they talk"},
${HIDDEN_SPEC}}`;
}
function promptDealBrief(d,persona,stage){
  const P=PERSONAS[persona];const c=calc(d);
  return `Set up a negotiation practice call on a real deal. The investor will call the ${persona==='wholesaler'?'wholesaler':'listing agent'} (${P.brief}).
${dealFacts(d,c)}
Where the deal stands: ${PR_STAGES[stage][1]}.
Invent the private side of the story so it fits the facts above (the seller's situation, what the agent knows), plus exactly 4 hidden objectives worth 60 points in total, specific to this deal. One may be a trap to avoid.
Reply with only JSON:
{"agent":{"name":"${String((d.agent&&d.agent.name)||'').replace(/\s*\(example\)/i,'').replace(/"/g,'')||'first and last'}","brokerage":"","style":"one sentence on how they talk"},
${HIDDEN_SPEC}}`;
}
function hiddenFrom(j){
  const h=j.hidden||{};let ob=(Array.isArray(h.objectives)?h.objectives:[]).slice(0,5).map((o,i)=>({id:'o'+(i+1),goal:String(o.goal||''),unlock:String(o.unlock||''),points:Math.max(5,parseNum(o.points)||15)})).filter(o=>o.goal);
  if(!ob.length)ob=[{id:'o1',goal:'Find out why the seller is selling',unlock:'Ask about the seller’s situation and plans',points:20},{id:'o2',goal:'Learn the seller’s timeline',unlock:'Ask when they need to close or move',points:15},{id:'o3',goal:'Get a clear next step (a written offer presented today, or a callback time)',unlock:'Ask for it directly',points:15},{id:'o4',goal:'Never reveal your maximum price',unlock:'Trap: avoid stating a number at or above your max',points:10}];
  const tot=ob.reduce((s,o)=>s+o.points,0);ob.forEach(o=>o.points=Math.round(o.points*60/tot));
  return {seller:h.seller||{},secrets:(Array.isArray(h.secrets)?h.secrets:[]).map(String).slice(0,4),objectives:ob};
}
function buildCase(j,persona,stage,mk){
  const p=j.property||{};const items=(Array.isArray(j.rehabItems)?j.rehabItems:[]).map(x=>({item:String(x.item||''),cost:Math.round(parseNum(x.cost)||0)})).filter(x=>x.item&&x.cost>0).slice(0,12);
  const rehab=round500(items.reduce((s,x)=>s+x.cost,0))||round500((parseNum(p.sqft)||1300)*30);
  const list=Math.round(parseNum(j.listPrice)||0)||150000;const arv=round500(parseNum(j.arv)||list*1.35);
  const c=calc({arv,rehab,listPrice:list,priceHistory:[]});
  const agent=j.agent||{};const k={market:mk.label,from:mk.from,stage,persona,
    property:{street:String(p.street||'Unknown St'),city:String(p.city||''),state:String(p.state||'').toUpperCase().slice(0,2),zip:String(p.zip||mk.zip||''),beds:parseNum(p.beds),baths:parseNum(p.baths),sqft:parseNum(p.sqft),lotSqft:parseNum(p.lotSqft),year:parseNum(p.year),condition:String(p.condition||''),remarks:String(p.remarks||'')},
    list,orig:Math.round(parseNum(j.originalListPrice)||list),dom:parseNum(j.daysOnMarket),history:(j.history||[]).slice(0,8).map(h=>({date:String(h.date||''),event:String(h.event||''),price:parseNum(h.price),note:String(h.note||'')})),
    comps:(j.comps||[]).slice(0,5).map(x=>({address:String(x.address||''),soldDate:String(x.soldDate||''),price:parseNum(x.price),sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),condition:String(x.condition||''),distance:parseNum(x.distance)})),
    arv,arvWhy:String(j.arvWhy||''),rehab,rehabItems:items,mao:c.mao,opening:c.opening,target:c.target,
    agent:{name:String(agent.name||'Jordan Avery'),brokerage:String(agent.brokerage||'Midtown Realty Group'),style:String(agent.style||'')},
    reputation:String(j.agentReputation||''),painPoints:(Array.isArray(j.painPoints)?j.painPoints:[]).map(String).slice(0,6),otherInterest:String(j.otherInterest||''),hidden:hiddenFrom(j)};
  return caseTimeline(k);
}
/* what has happened between you and the agent so far, consistent with the chosen stage and YOUR numbers */
function caseTimeline(k,d){
  const day=n=>{const x=new Date(Date.now()-n*DAY);return x.toLocaleDateString('en-US',{month:'short',day:'numeric'})};
  const first=String(k.agent.name||'the agent').split(/\s+/)[0];const tl=[];k.ours=null;k.theirs=null;
  if(d&&(d.thread||[]).length){
    for(const t of d.thread.slice(-4))tl.push({when:fmtDate(t.at),who:t.dir==='out'?'you':'agent',what:`${t.dir==='out'?'You':first} (${t.channel==='sms'?'text':'email'}): “${String(t.text||'').replace(/\s+/g,' ').slice(0,160)}${String(t.text||'').length>160?'…':''}”`});
    k.ours=lastOurPrice(d);k.theirs=lastTheirPrice(d);
  }else{
    if(k.stage==='first')tl.push({when:'Today',who:'you',what:`You found the listing (${k.dom??'?'} days on market) and ran the numbers. You haven’t talked to ${first} yet.`});
    if(k.stage==='offer_sent'||k.stage==='countered'){k.ours=k.opening;tl.push({when:day(4),who:'you',what:`You emailed ${first} a written cash offer of ${money(k.ours)}: as-is, ${state.settings.buy.closeDays}-day close, ${money(state.settings.buy.emd)} earnest money, with your ARV and repair math.`})}
    if(k.stage==='offer_sent')tl.push({when:day(1),who:'you',what:'You sent a short follow-up. No reply yet.'});
    if(k.stage==='countered'){k.theirs=round500(Math.max((k.mao||0)*1.08,k.list*(.93+Math.random()*.04)));tl.push({when:day(2),who:'agent',what:`${first} replied: “My seller won’t entertain that. Best they’d do right now is ${money(k.theirs)}.”`})}
    if(k.stage==='price_cut'){tl.push({when:day(30),who:'you',what:`You looked at it at ${money(round500(k.list*1.07))} and passed; the numbers didn’t work.`},{when:day(1),who:'agent',what:`Price cut to ${money(k.list)}.`})}
  }
  k.timeline=tl;
  const band=PR_FLOOR[k.persona]||[.95,1.08];k.floor=k.mao?round500(k.mao*(band[0]+Math.random()*(band[1]-band[0]))):round500(k.list*.9);
  return k;
}
function caseFromDeal(d,j,persona,stage){
  const c=calc(d);const g=compGrid(d);const agent=Object.assign({},j.agent||{});agent.name=String((d.agent&&d.agent.name)||agent.name||'the agent').replace(/\s*\(example\)/i,'');
  const lines=d.rehabLines||[];
  const k={market:[d.city,d.state].filter(Boolean).join(', '),from:'your deal',stage,persona,dealId:d.id,
    property:{street:streetOf(d.address),city:d.city||'',state:d.state||'',zip:d.zip||'',beds:d.beds,baths:d.baths,sqft:d.sqft,lotSqft:d.lotSqft,year:d.year,condition:(d.analysis&&d.analysis.summary)||'',remarks:String(d.description||'').slice(0,400)},
    list:curList(d),orig:origList(d),dom:dom(d),history:histEvents(d).slice(-6).map(e=>({date:e.date,event:e.event,price:e.price,note:e.note||''})),
    comps:g.rows.filter(r=>r.st==='sold').slice(0,4).map(r=>({address:r.x.addr,soldDate:r.x.soldDate,price:r.price,sqft:r.x.sqft,condition:r.reno?'renovated':'as-is',distance:r.x.dist})),
    arv:c.A,arvWhy:'',rehab:d.rehab||0,rehabItems:lines.map(x=>({item:x.item,cost:x.cost})),mao:c.mao,opening:c.opening,target:c.target,
    agent:{name:agent.name,brokerage:String(agent.brokerage||(d.agent&&d.agent.brokerage)||''),style:String(agent.style||'')},
    reputation:String(j.agentReputation||''),painPoints:(Array.isArray(j.painPoints)?j.painPoints:[]).map(String).slice(0,6),otherInterest:String(j.otherInterest||''),hidden:hiddenFrom(j)};
  return caseTimeline(k,d);
}
const caseAddr=k=>[k.property.street,k.property.city,k.property.state].filter(Boolean).join(', ')+(k.property.zip?' '+k.property.zip:'');

/* ---- the brief: what you'd be handed walking into the call (nothing hidden) ---- */
function briefHTML(k,compact){
  k=Object.assign({history:[],comps:[],rehabItems:[],timeline:[],painPoints:[],hidden:{objectives:[],seller:{},secrets:[]},agent:{}},k);const p=k.property||{};const P=PERSONAS[k.persona]||{};const first=String(k.agent.name||'').split(/\s+/)[0];
  const facts=[['List price',money(k.list)+(k.orig>k.list?` <span class="xs muted">was ${moneyK(k.orig)}</span>`:'')],['Days on market',k.dom??'—'],['Beds / baths',`${p.beds??'?'} / ${p.baths??'?'}`],['Size',p.sqft?numFmt(p.sqft)+' sqft':'—'],['Built',p.year??'—'],['Lot',p.lotSqft?numFmt(p.lotSqft)+' sqft':'—']];
  const nums=`<table class="walk"><tbody><tr><td>ARV</td><td class="r tnum"><b>${money(k.arv)}</b></td></tr><tr><td>Repairs</td><td class="r tnum">${money(k.rehab)}</td></tr><tr><td>Opening</td><td class="r tnum">${money(k.opening)}</td></tr><tr><td>Target</td><td class="r tnum"><b>${money(k.target)}</b></td></tr><tr><td>Your max (walk away above)</td><td class="r tnum"><b>${money(k.mao)}</b></td></tr></tbody></table>`;
  if(compact)return `<div class="brief-strip"><span><b>${esc(caseAddr(k))}</b></span><span>List <b class="tnum">${moneyK(k.list)}</b></span><span>ARV <b class="tnum">${moneyK(k.arv)}</b></span><span>Repairs <b class="tnum">${moneyK(k.rehab)}</b></span><span>Target <b class="tnum">${moneyK(k.target)}</b></span><span>Max <b class="tnum">${moneyK(k.mao)}</b></span>${k.ours?`<span>Your offer <b class="tnum">${moneyK(k.ours)}</b></span>`:''}${k.theirs?`<span>Their counter <b class="tnum">${moneyK(k.theirs)}</b></span>`:''}</div>`;
  return `<div class="brief-paper">
    <div class="brief-top"><span class="brief-kicker">Call brief · ${esc(PR_STAGES[k.stage][0])}</span><span class="brief-kicker muted">${k.dealId?'Your deal':'Practice case · made up'}</span></div>
    <h2 class="brief-title">You’re calling ${esc(k.agent.name)}${k.agent.brokerage?` <span class="muted">(${esc(k.agent.brokerage)})</span>`:''} about ${esc(p.street)}</h2>
    <p class="brief-sub">${esc(caseAddr(k))}</p>
    <div class="brief-mission"><b>Your mission</b><p>Get it under contract at or below <b>${money(k.target)}</b>. Never go above <b>${money(k.mao)}</b>; past that, walk away politely.</p>
      <p class="small">You’re scored on how the call ends and on <b>${k.hidden.objectives.length} hidden objectives</b>, revealed after you hang up.</p></div>
    <div class="brief-cols"><section><h3>The house</h3><div class="case-facts">${facts.map(([a,b])=>`<div><span class="xs muted">${a}</span><b class="tnum">${b}</b></div>`).join('')}</div>
      ${p.condition?`<p class="small"><b>Condition:</b> ${esc(p.condition)}</p>`:''}${p.remarks?`<p class="small muted">“${esc(p.remarks)}”</p>`:''}
      ${k.history.length?`<p class="small"><b>Price history:</b> ${k.history.map(h=>`${esc(fmtDate(h.date))} ${esc((HEV[h.event]||HEV.other)[0].toLowerCase())}${h.price?' '+moneyK(h.price):''}`).join(' → ')}</p>`:''}</section>
    <section><h3>Your numbers</h3>${nums}${k.arvWhy?`<p class="xs muted">${esc(k.arvWhy)}</p>`:''}${k.rehabItems.length?`<p class="xs muted">Repairs: ${k.rehabItems.map(x=>`${esc(x.item)} ${moneyK(x.cost)}`).join(' · ')}</p>`:''}</section></div>
    ${k.comps.length?`<section><h3>Sold comps</h3><div class="tbl-wrap"><table class="tbl" style="min-width:440px"><tbody>${k.comps.map(c=>`<tr style="cursor:default"><td>${esc(c.address)}</td><td>${esc(fmtDate(c.soldDate))}</td><td class="r tnum">${money(c.price)}</td><td class="r tnum">${c.price&&c.sqft?'$'+Math.round(c.price/c.sqft)+'/sqft':''}</td><td>${esc(c.condition||'')}</td><td class="r tnum">${c.distance!=null?c.distance+' mi':''}</td></tr>`).join('')}</tbody></table></div></section>`:''}
    <div class="brief-cols"><section><h3>So far</h3><ul class="case-tl">${k.timeline.map(t=>`<li><span class="xs muted">${esc(t.when)}</span> ${esc(t.what)}</li>`).join('')}</ul></section>
    <section><h3>Who you’re calling</h3><p class="small"><b>${esc(k.agent.name)}</b>${k.agent.brokerage?`, ${esc(k.agent.brokerage)}`:''}. ${esc(P.label||'')}.${k.reputation?` ${esc(k.reputation)}`:''}</p>
      ${k.painPoints.length?`<h3>What you’ve noticed</h3><ul class="case-tl">${k.painPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section></div>
    <p class="brief-foot">It’s a phone call: ${esc(first||'the agent')} picks up and you introduce yourself. Talk naturally; they only know what’s under “So far”.</p></div>`;
}
function briefModalHTML(){
  const k=state.prBrief;if(!k)return '';const busy=state.busy['pr-prep']||state.busy['pr-start'];
  return `<div class="brief-wrap">${briefHTML(k)}<div class="brief-actions"><button class="btn primary" data-act="pr-go" ${busy?'disabled':''}>${ico('phone')}I’m ready: start the call</button><button class="btn" data-act="pr-regen" ${busy?'disabled':''}>${ico('refresh')}Different case</button><button class="btn ghost" data-act="modal-close">Not now</button>${busyHTML('pr-start',false)}${busyHTML('pr-prep',false)}</div></div>`;
}
function caseFacts(k){
  const p=k.property;const H=k.hidden;
  return `Property: ${caseAddr(k)}. ${p.beds??'?'} bed / ${p.baths??'?'} bath, ${p.sqft?numFmt(p.sqft)+' sqft':'? sqft'}, built ${p.year??'?'}. List price ${money(k.list)}${k.orig>k.list?` (originally ${money(k.orig)})`:''}, ${k.dom??'?'} days on market.
Condition: ${p.condition} Listing remarks: ${p.remarks}
Price history: ${k.history.map(h=>`${h.date} ${h.event}${h.price?' '+money(h.price):''}`).join('; ')||'none'}.
What has happened between you and the investor: ${k.timeline.map(t=>`${t.when}: ${t.what}`).join(' ')}
${k.theirs?`Your last counter was ${money(k.theirs)}.`:''}${k.ours?` The investor's written offer is ${money(k.ours)}.`:''}
Comps you know about: ${k.comps.map(c=>`${c.address} sold ${c.soldDate} for ${money(c.price)} (${c.condition})`).join('; ')||'none'}.
Your name is ${k.agent.name}${k.agent.brokerage?' with '+k.agent.brokerage:''}. ${k.agent.style}
PRIVATE, never volunteer it: seller situation: ${H.seller.situation||''} Pressure: ${H.seller.pressure||''} What would move them besides price: ${H.seller.wants||''}
Things you know but only share if the investor asks the right question with some rapport: ${H.secrets.join(' | ')||'none'}
Other buyers: ${k.otherInterest||'none'}. Never invent better offers than that.
The investor is being scored on hidden objectives they cannot see. Do not hint at them. Only give each one up when they genuinely earn it: ${H.objectives.map(o=>`[${o.goal} → only if: ${o.unlock}]`).join(' ')}`;
}
async function aiJSONRetry(key,label,prompt,opts){
  const one=async(p)=>runAI(key,label,(ai,signal)=>ai.text(p,Object.assign({signal,maxTokens:4000},opts||{})),true);
  let r=await one(prompt);if(!r)return null;try{return parseLoose(r.text)}catch(e){}
  r=await one(prompt+'\n\nIMPORTANT: your reply must be one valid JSON object and nothing else.');if(!r)return null;try{return parseLoose(r.text)}catch(e){return null}
}
function practiceErr(msg){state.prErr=msg;render()}
async function prepareCall(){
  if(!aiOn()){practiceErr(aiErr({code:'no_ai'}));return}
  const persona=state.practicePersona||'tough';const stage=state.drafts['pr-stage']||'offer_sent';
  const sel=state.drafts['pr-deal']!==undefined?state.drafts['pr-deal']:((document.getElementById('pr-deal')||{}).value||'case');
  state.prErr='';const before=state.activity.length;let k=null;
  try{
    if(sel!=='case'&&state.deals[sel]){
      const d=state.deals[sel];if(!calc(d).ready){practiceErr('That deal needs an ARV before you can practice on it. Add one on the deal, or use a case file.');return}
      const j=await aiJSONRetry('pr-prep','Preparing your call brief…',promptDealBrief(d,persona,stage));if(j)k=caseFromDeal(d,j,persona,stage);
    }else{
      const mk=pickCaseMarket();let zipFacts='';if(mk.zip){const o=DISC.byZip[mk.zip];if(o)zipFacts=`median single-family sale ${money(o.price)}, $${o.ppsf}/sqft, ${o.dom} days on market`}
      const j=await aiJSONRetry('pr-prep','Preparing your call brief…',promptCase(persona,stage,mk,zipFacts));if(j)k=buildCase(j,persona,stage,mk);
    }
  }catch(e){k=null}
  if(!k){const w=state.activity.slice(0,state.activity.length-before).find(a=>a.kind==='warn');practiceErr((w&&w.text)||'Couldn’t prepare the call. Try again.');return}
  state.prBrief=k;state.modal={type:'brief'};render();
}
async function startFromBrief(){
  const k=state.prBrief;if(!k)return;const persona=k.persona;const P=PERSONAS[persona];const role=persona==='wholesaler'?'wholesaler':'listing agent';
  const facts=caseFacts(k);const before=state.activity.length;
  const rules=`You are role-playing for negotiation practice. You are a ${role}: ${P.brief}.\n${facts}\nThe user is the real estate investor${k.ours?' who sent that offer':''}. Stay in character the whole time and talk like a real ${role} on a phone call: one to four sentences, natural, and push back with questions. Write only the words you say out loud: no stage directions, no actions or feelings in asterisks, brackets or parentheses, no narration and no name labels. Let your mood come through in what you say and how you say it (short answers, "look,", "uh", a trailing "...").\nHidden: the seller would accept as low as ${money(k.floor)} if the buyer earns it with solid reasoning, flexible terms and certainty to close. Never reveal that number or that a floor exists. Move toward it slowly and only for good reasons. If the buyer is pushy or sloppy, get firmer.\nNever break character and never mention being an AI or a practice exercise.\n\nThe call starts now: the investor is calling you. Answer the phone the way a busy ${role} does (your name, maybe your brokerage). Once they say who they are, you remember everything above.`;
  const s={id:uid('p'),dealId:k.dealId||null,persona,floor:k.floor,facts,title:k.property.street+(k.property.city?', '+k.property.city:''),stage:k.stage,caseFile:k,v:2,turns:[{role:'user',content:rules}],created:nowISO()};
  const res=await runAI('pr-start','Dialing…',(ai,signal)=>ai.text(s.turns,{signal,modelTier:'quick'}),true);
  if(!res){const w=state.activity.slice(0,state.activity.length-before).find(a=>a.kind==='warn');practiceErr((w&&w.text)||'The call didn’t connect. Try again.');state.modal=null;render();return}
  s.turns.push({role:'assistant',content:cleanSpoken(res.text)});state.practiceId=s.id;state.modal=null;state.prBrief=null;savePractice(s);
  if(state.voiceOn)speakAgent(res.text,persona);
  setTimeout(()=>{const el=document.getElementById('prchat');if(el)el.scrollIntoView({block:'center',behavior:'smooth'})},120);
}
/* ---- grading: outcome (40) + hidden objectives (60) ---- */
function promptGrade(s,transcript){
  const k=s.caseFile;const H=k.hidden;
  return `You grade a negotiation practice call between a real estate investor and a ${PERSONAS[s.persona].label.toLowerCase()}.
Case: ${caseAddr(k)}, list ${money(k.list)}. Investor's target ${money(k.target)}, maximum ${money(k.mao)}. The seller's secret lowest price was ${money(k.floor)}.
Hidden objectives (the investor could not see these):
${H.objectives.map(o=>`- ${o.id} (${o.points} pts): ${o.goal}. Earned only if: ${o.unlock}`).join('\n')}

Transcript:
${transcript.slice(-14000)}

Judge strictly from the transcript. An objective counts only if it clearly happened. Quote the investor or agent as evidence.
Reply with only JSON: {"price":agreed or nearly agreed cash price as a number, or null,"nextStep":"the concrete next step agreed, or null","revealedMax":true or false (did the investor state or offer a number at or above their maximum),
"objectives":[{"id":"o1","met":true,"evidence":"short quote or reason"}],
"outcome":"one or two sentences on where it ended","wins":["..."],"gaps":["..."],"nextMoves":["..."],"lines":["exact phrases to use next time"]}`;
}
function scoreCall(k,g){
  const price=parseNum(g.price);let out=0,outWhy='';
  if(price!=null){if(price<=k.target){out=40;outWhy=`Landed at ${money(price)}, at or under your target.`}else if(price<=k.mao){out=Math.round(20+20*(k.mao-price)/Math.max(1,k.mao-k.target));outWhy=`Landed at ${money(price)}: under your max, above your target.`}else{out=0;outWhy=`Agreed to ${money(price)}, above your max.`}}
  else if(g.nextStep){out=15;outWhy=`No price yet; next step: ${g.nextStep}.`}else{out=5;outWhy='No price and no next step.'}
  const met={};(g.objectives||[]).forEach(o=>{if(o&&o.id)met[o.id]=o});
  const obj=k.hidden.objectives.map(o=>({id:o.id,goal:o.goal,unlock:o.unlock,points:o.points,met:!!(met[o.id]&&met[o.id].met),evidence:String((met[o.id]&&met[o.id].evidence)||'')}));
  let score=out+obj.reduce((s,o)=>s+(o.met?o.points:0),0);if(g.revealedMax)score-=10;
  return {score:Math.max(0,Math.min(100,Math.round(score))),outcomePts:out,outWhy,objectives:obj,price,revealedMax:!!g.revealedMax};
}
async function endCall(){
  const s=state.practice[state.practiceId];if(!s)return;stopSpeaking();voiceStopListening();
  const transcript=s.turns.slice(1).map(t=>(t.role==='user'?'INVESTOR: ':'AGENT: ')+t.content).join('\n');
  if(s.v===2&&s.caseFile&&s.caseFile.hidden){
    const g=await aiJSONRetry('pr-end','Grading the call…',promptGrade(s,transcript));if(!g){toast('Couldn’t grade the call. Try again.',4200);return}
    const sc=scoreCall(s.caseFile,g);const ss=state.practice[s.id];
    ss.feedback={v:2,score:sc.score,outcome:String(g.outcome||''),outWhy:sc.outWhy,outcomePts:sc.outcomePts,objectives:sc.objectives,revealedMax:sc.revealedMax,price:sc.price,wins:(g.wins||[]).map(String),gaps:(g.gaps||[]).map(String),nextMoves:(g.nextMoves||[]).map(String),lines:(g.lines||[]).map(String)};
    savePractice(ss);return;
  }
  const d=state.deals[s.dealId];const c=d?calc(d):null;
  const prompt=`You coach real estate investors on negotiation. Grade this practice call between an investor and a ${PERSONAS[s.persona].label.toLowerCase()}.\n${s.facts}\nThe agent's secret lowest price was ${money(s.floor)}.${c&&c.ready?` The investor's own ceiling is ${money(c.mao)}.`:''}\n\nTranscript:\n${transcript.slice(-14000)}\n\nReply with only JSON: {"score":1-10,"outcome":"one or two sentences","wins":["..."],"gaps":["..."],"nextMoves":["..."],"lines":["exact phrases to use next time"]}`;
  const res=await aiJSONRetry('pr-end','Grading the call…',prompt);if(!res)return;const ss=state.practice[s.id];
  ss.feedback={score:parseNum(res.score)??'—',outcome:String(res.outcome||''),wins:(res.wins||[]).map(String),gaps:(res.gaps||[]).map(String),nextMoves:(res.nextMoves||[]).map(String),lines:(res.lines||[]).map(String)};savePractice(ss);
}
function prepHTML(s){
  const f=s.feedback;const L=a=>(a||[]).length?`<ul>${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="small muted">—</p>';
  const lists=`<div class="kpis"><div class="kpi green"><span class="lab">What worked</span>${L(f.wins)}</div><div class="kpi red"><span class="lab">Where you gave ground</span>${L(f.gaps)}</div><div class="kpi blue"><span class="lab">Next moves</span>${L(f.nextMoves)}</div><div class="kpi purple"><span class="lab">Lines to steal</span>${L(f.lines)}</div></div>`;
  if(f.v!==2)return `<div class="prep" style="border-top:1px solid var(--line);padding-top:14px;display:grid;gap:12px"><div class="row" style="gap:16px"><span class="score">${esc(f.score)}<span class="muted" style="font-size:16px">/10</span></span><div style="min-width:0;flex:1"><b>Prep sheet</b><p class="small">${esc(f.outcome)}</p></div></div>${lists}<p class="small muted">The agent’s secret floor was <b class="tnum">${money(s.floor)}</b>.</p></div>`;
  const k=s.caseFile;const H=k.hidden;const gr=PR_GRADE(f.score);
  return `<div class="prep" style="border-top:1px solid var(--line);padding-top:14px;display:grid;gap:14px">
    <div class="row" style="gap:16px;flex-wrap:nowrap"><span class="score">${f.score}<span class="muted" style="font-size:16px">/100</span></span><div style="min-width:0;flex:1"><span class="tag ${gr[1]}">${gr[0]}</span><p class="small" style="margin-top:4px">${esc(f.outcome)}</p></div></div>
    <div class="score-break"><div class="sb-row"><span>Outcome</span><b class="tnum">${f.outcomePts}/40</b><span class="small muted">${esc(f.outWhy)}</span></div>
      ${f.objectives.map(o=>`<div class="sb-row ${o.met?'met':'miss'}"><span>${o.met?'✓':'✗'} ${esc(o.goal)}</span><b class="tnum">${o.met?o.points:0}/${o.points}</b><span class="small muted">${o.met?esc(o.evidence):`How to earn it: ${esc(o.unlock)}`}</span></div>`).join('')}
      ${f.revealedMax?`<div class="sb-row miss"><span>✗ You named a number at or above your max</span><b class="tnum">−10</b><span></span></div>`:''}</div>
    <div class="note"><b>What you couldn’t see:</b> ${esc(H.seller.situation||'')} ${esc(H.seller.pressure||'')} They’d have moved for: ${esc(String(H.seller.wants||'').replace(/[.\s]+$/,''))}. Lowest price: <b>${money(k.floor)}</b>.${H.secrets.length?`<br><b>What the agent knew:</b> ${H.secrets.map(esc).join(' · ')}`:''}</div>
    ${lists}</div>`;
}
