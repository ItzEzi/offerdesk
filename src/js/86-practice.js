/* ================= Practice case files: a realistic (made-up) deal with history, so every call has context ================= */
const PR_STAGES={
  first:['First call','You’re calling about the listing before making any offer'],
  offer_sent:['Following up on your offer','You emailed a written cash offer a few days ago and haven’t heard back'],
  countered:['They countered','The agent came back with a counter; you’re calling to negotiate'],
  price_cut:['Price just dropped','The listing just had a price cut; you’re calling to re-engage']
};
/* how low the seller will really go, relative to YOUR ceiling, so a good call can actually get there */
const PR_FLOOR={tough:[.98,1.12],stale:[.86,1.0],wholesaler:[.92,1.06],offended:[.95,1.08]};
const PR_METROS=['Dayton, OH','Cleveland, OH','Indianapolis, IN','Kansas City, MO','St. Louis, MO','Memphis, TN','Birmingham, AL','Columbus, OH','Toledo, OH','Detroit, MI','Fort Worth, TX','San Antonio, TX','Jacksonville, FL','Akron, OH','Oklahoma City, OK','Tulsa, OK','Louisville, KY','Pittsburgh, PA'];
function pickCaseMarket(){
  const T=(state.settings.markets||{}).targets||[];const t=T[Math.floor(Math.random()*T.length)];
  if(t){const o=t.type==='zip'?DISC.byZip[t.key]:null;return {label:t.type==='zip'?`${t.key}${o&&o.city?' ('+o.city+', '+o.st+')':''}`:t.label,zip:t.type==='zip'?t.key:(t.zips||[])[Math.floor(Math.random()*Math.max(1,(t.zips||[]).length))]||'',from:'your target markets'}}
  return {label:PR_METROS[Math.floor(Math.random()*PR_METROS.length)],zip:'',from:'a typical investor market'};
}
function promptCase(persona,stage,mk,zipFacts){
  const P=PERSONAS[persona];const b=state.settings.buy;
  return `Create a realistic, made-up practice case for a real estate investor who buys houses to ${STRAT_LABEL[b.strategy]||'flip'}. It must feel like a real deal file: specific, internally consistent numbers, nothing generic.
Market: ${mk.label}${mk.zip?` (ZIP ${mk.zip})`:''}.${zipFacts?` Real ZIP data to stay consistent with: ${zipFacts}`:''}
The other side is a ${persona==='wholesaler'?'wholesaler':'listing agent'}: ${P.brief}.
Where the deal stands: ${PR_STAGES[stage][1]}.
Make a single-family house that needs work (so an investor deal makes sense): list price, condition, a short price history that matches the days on market, 3–4 recent sold comps nearby (at least two renovated) that support an ARV, and a rehab budget by line item.
Use invented street names and invented people. No real company names; brokerage names must sound plausible but be fictional.
Reply with only JSON:
{"property":{"street":"123 Example St","city":"","state":"two letters","zip":"","beds":3,"baths":1.5,"sqft":1300,"lotSqft":5000,"year":1955,"condition":"2-3 sentences on what is dated or broken","remarks":"2 sentences of MLS-style listing remarks"},
"listPrice":0,"originalListPrice":0,"daysOnMarket":0,
"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|pending|back_on_market|sold","price":0,"note":"short"}],
"comps":[{"address":"","soldDate":"YYYY-MM-DD","price":0,"sqft":0,"beds":3,"baths":2,"condition":"renovated|average|as-is","distance":0.3}],
"arv":0,"arvWhy":"one sentence","rehabItems":[{"item":"","cost":0}],
"agent":{"name":"first and last","brokerage":"fictional","style":"one sentence on how they talk"},
"seller":{"situation":"why they are selling (hidden from the investor)","pressure":"their timeline and money pressure (hidden)","wants":"what terms would move them besides price (hidden)"},
"otherInterest":"what the agent can truthfully say about other buyers (may be none)"}`;
}
function buildCase(j,persona,stage,mk){
  const p=j.property||{};const items=(Array.isArray(j.rehabItems)?j.rehabItems:[]).map(x=>({item:String(x.item||''),cost:Math.round(parseNum(x.cost)||0)})).filter(x=>x.item&&x.cost>0).slice(0,12);
  const rehab=round500(items.reduce((s,x)=>s+x.cost,0))||round500((parseNum(p.sqft)||1300)*30);
  const list=round500(parseNum(j.listPrice)||0);const arv=round500(parseNum(j.arv)||list*1.35);
  const deal={arv,rehab,listPrice:list,priceHistory:[]};const c=calc(deal);
  const day=n=>{const d=new Date(Date.now()-n*DAY);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})};
  const agent=j.agent||{};const first=String(agent.name||'the agent').split(/\s+/)[0];
  const tl=[];let theirs=null;let ours=null;
  const cutHist=(j.history||[]).filter(h=>h&&h.event==='price_cut');
  if(stage==='first')tl.push({when:'Today',who:'you',what:`You found the listing (${parseNum(j.daysOnMarket)||'?'} days on market) and ran the numbers. You haven’t contacted ${first} yet.`});
  if(stage==='offer_sent'||stage==='countered'){ours=c.opening;tl.push({when:day(4),who:'you',what:`Emailed ${first} a written cash offer of ${money(ours)}: as-is, ${state.settings.buy.closeDays}-day close, ${money(state.settings.buy.emd)} earnest money, with your ARV and repair math.`})}
  if(stage==='offer_sent')tl.push({when:day(1),who:'you',what:`Sent a short follow-up. No reply yet.`});
  if(stage==='countered'){theirs=round500(Math.max(c.mao*1.08,list*(.93+Math.random()*.04)));tl.push({when:day(2),who:'agent',what:`${first} replied: “My seller won’t entertain that. Best they’d do right now is ${money(theirs)}.”`})}
  if(stage==='price_cut'){const prev=round500(list*1.07);tl.push({when:day(30),who:'you',what:`You looked at it at ${money(prev)} and passed; the numbers didn’t work.`},{when:day(1),who:'agent',what:`Price cut to ${money(list)}.`})}
  const band=PR_FLOOR[persona]||[.95,1.08];const floor=c.ready?round500(c.mao*(band[0]+Math.random()*(band[1]-band[0]))):round500(list*.9);
  return {market:mk.label,from:mk.from,stage,persona,property:{street:String(p.street||'Unknown St'),city:String(p.city||''),state:String(p.state||'').toUpperCase().slice(0,2),zip:String(p.zip||mk.zip||''),beds:parseNum(p.beds),baths:parseNum(p.baths),sqft:parseNum(p.sqft),lotSqft:parseNum(p.lotSqft),year:parseNum(p.year),condition:String(p.condition||''),remarks:String(p.remarks||'')},
    list,orig:round500(parseNum(j.originalListPrice)||list),dom:parseNum(j.daysOnMarket),history:(j.history||[]).slice(0,8).map(h=>({date:String(h.date||''),event:String(h.event||''),price:parseNum(h.price),note:String(h.note||'')})),
    comps:(j.comps||[]).slice(0,5).map(x=>({address:String(x.address||''),soldDate:String(x.soldDate||''),price:parseNum(x.price),sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),condition:String(x.condition||''),distance:parseNum(x.distance)})),
    arv,arvWhy:String(j.arvWhy||''),rehab,rehabItems:items,mao:c.mao,opening:c.opening,target:c.target,ours,theirs,floor,
    agent:{name:String(agent.name||'Jordan Avery'),brokerage:String(agent.brokerage||'Midtown Realty Group'),style:String(agent.style||'')},seller:j.seller||{},otherInterest:String(j.otherInterest||''),timeline:tl,cuts:cutHist.length};
}
const caseAddr=k=>[k.property.street,k.property.city,k.property.state].filter(Boolean).join(', ')+(k.property.zip?' '+k.property.zip:'');
function caseFacts(k){
  const p=k.property;
  return `Property: ${caseAddr(k)}. ${p.beds??'?'} bed / ${p.baths??'?'} bath, ${p.sqft?numFmt(p.sqft)+' sqft':'? sqft'}, built ${p.year??'?'}. List price ${money(k.list)}${k.orig>k.list?` (originally ${money(k.orig)})`:''}, ${k.dom??'?'} days on market.
Condition: ${p.condition} Listing remarks: ${p.remarks}
Price history: ${k.history.map(h=>`${h.date} ${h.event}${h.price?' '+money(h.price):''}`).join('; ')||'none'}.
What has happened between you and the investor: ${k.timeline.map(t=>`${t.when}: ${t.what}`).join(' ')}
${k.theirs?`Your last counter was ${money(k.theirs)}.`:''}${k.ours?` The investor's written offer is ${money(k.ours)}.`:''}
Comps you know about: ${k.comps.map(c=>`${c.address} sold ${c.soldDate} for ${money(c.price)} (${c.condition})`).join('; ')}.
Your name is ${k.agent.name} with ${k.agent.brokerage}. ${k.agent.style}
Hidden seller situation (use it to decide how to move, reveal only bits of it, and only if the investor earns it by asking good questions): ${k.seller.situation||''} ${k.seller.pressure||''} What would move them besides price: ${k.seller.wants||''}
Other buyers: ${k.otherInterest||'none'}. Never invent better offers than that.`;
}
function caseCardHTML(k,reveal,open){
  const p=k.property;const n=esc(negName());
  const facts=[['List price',money(k.list)+(k.orig>k.list?` <span class="xs muted">was ${moneyK(k.orig)}</span>`:'')],['Days on market',k.dom??'—'],['Beds / baths',`${p.beds??'?'} / ${p.baths??'?'}`],['Size',p.sqft?numFmt(p.sqft)+' sqft':'—'],['Built',p.year??'—'],['Lot',p.lotSqft?numFmt(p.lotSqft)+' sqft':'—']];
  return `<details class="case" id="pr-case" ${open?'open':''}><summary><span class="tag pink">Case file</span> <b>${esc(caseAddr(k))}</b> <span class="xs muted">· made up for practice · ${esc(k.from)}</span></summary>
  <div class="case-body">
    <div class="case-facts">${facts.map(([a,b])=>`<div><span class="xs muted">${a}</span><b class="tnum">${b}</b></div>`).join('')}</div>
    <p class="small"><b>Condition:</b> ${esc(p.condition)}</p><p class="small muted">“${esc(p.remarks)}”</p>
    <div class="split"><div><h4>Your numbers</h4><table class="walk"><tbody>
      <tr><td>ARV</td><td class="r tnum"><b>${money(k.arv)}</b></td></tr><tr><td>Rehab</td><td class="r tnum">${money(k.rehab)}</td></tr>
      <tr><td>Your max (from your buy box)</td><td class="r tnum"><b>${money(k.mao)}</b></td></tr><tr><td>Opening</td><td class="r tnum">${money(k.opening)}</td></tr><tr><td>Target</td><td class="r tnum">${money(k.target)}</td></tr></tbody></table>
      <p class="xs muted">${esc(k.arvWhy)}</p></div>
    <div><h4>Repairs</h4><table class="walk"><tbody>${k.rehabItems.map(x=>`<tr><td>${esc(x.item)}</td><td class="r tnum">${money(x.cost)}</td></tr>`).join('')}</tbody></table></div></div>
    <h4>Sold comps</h4><div class="tbl-wrap"><table class="tbl" style="min-width:480px"><thead><tr><th>Address</th><th>Sold</th><th class="r">Price</th><th class="r">Sqft</th><th class="r">$/sqft</th><th>Condition</th><th class="r">Distance</th></tr></thead><tbody>${k.comps.map(c=>`<tr style="cursor:default"><td>${esc(c.address)}</td><td>${esc(fmtDate(c.soldDate))}</td><td class="r tnum">${money(c.price)}</td><td class="r tnum">${numFmt(c.sqft)}</td><td class="r tnum">${c.price&&c.sqft?'$'+Math.round(c.price/c.sqft):'—'}</td><td>${esc(c.condition)}</td><td class="r tnum">${c.distance!=null?c.distance+' mi':''}</td></tr>`).join('')}</tbody></table></div>
    <h4>Price history</h4><p class="small">${k.history.map(h=>`${esc(fmtDate(h.date))}: ${esc((HEV[h.event]||HEV.other)[0])}${h.price?' '+money(h.price):''}`).join(' → ')||'—'}</p>
    <h4>So far</h4><ul class="case-tl">${k.timeline.map(t=>`<li><span class="xs muted">${esc(t.when)}</span> ${esc(t.what)}</li>`).join('')}</ul>
    <p class="small"><b>Agent:</b> ${esc(k.agent.name)}, ${esc(k.agent.brokerage)}. <b>Your goal:</b> get it under contract at or below ${money(k.target)}, never above ${money(k.mao)}.</p>
    ${reveal?`<div class="note"><b>What you couldn’t see:</b> ${esc(k.seller.situation||'')} ${esc(k.seller.pressure||'')} They’d have moved for: ${esc(k.seller.wants||'')}. Lowest price: <b>${money(k.floor)}</b>.</div>`:''}
  </div></details>`;
}
async function practiceCase(persona,stage){
  const mk=pickCaseMarket();let zipFacts='';
  if(mk.zip){const o=DISC.byZip[mk.zip];if(o)zipFacts=`median single-family sale ${money(o.price)}, $${o.ppsf}/sqft, ${o.dom} days on market`}
  const res=await runAI('pr-start','Building a case file…',(ai,signal)=>ai.json(promptCase(persona,stage,mk,zipFacts),{signal}));
  return res?buildCase(res,persona,stage,mk):null;
}
async function practiceStart(){
  const persona=state.practicePersona||'tough';const stage=state.drafts['pr-stage']||'offer_sent';
  const sel=state.drafts['pr-deal']!==undefined?state.drafts['pr-deal']:((document.getElementById('pr-deal')||{}).value||'case');
  let k=null,d=null,facts,floor,title;
  if(sel==='case'||!state.deals[sel]){k=await practiceCase(persona,stage);if(!k)return;facts=caseFacts(k);floor=k.floor;title=k.property.street+(k.property.city?', '+k.property.city:'')}
  else{
    d=state.deals[sel];const c=calc(d);const P=PERSONAS[persona];
    const band=PR_FLOOR[persona]||[.95,1.08];floor=c.ready?round500(c.mao*(band[0]+Math.random()*(band[1]-band[0]))):round500((curList(d)||0)*(P.band[0]+Math.random()*(P.band[1]-P.band[0])));
    const offers=(d.offers||[]).map(o=>`${fmtDate(o.at)} ${o.by==='us'?'investor offered':'agent asked'} ${money(o.price)}`).join('; ');
    facts=`Property: ${[streetOf(d.address),d.city,d.state].filter(Boolean).join(', ')}. ${persona==='wholesaler'?'Asking':'List price'} ${money(curList(d))}. ${d.beds??'?'} bed / ${d.baths??'?'} bath, ${d.sqft??'?'} sqft. ${dom(d)!=null?dom(d)+' days on market. ':''}${d.description?'Condition: '+String(d.description).slice(0,600):''}
Where things stand: ${PR_STAGES[stage][1]}.${offers?' Offers so far: '+offers+'.':''}${d.agent&&d.agent.name?` Your name is ${d.agent.name.replace(/\s*\(example\)/i,'')}.`:''}`;
    title=streetOf(d.address);
  }
  const P=PERSONAS[persona];const role=persona==='wholesaler'?'wholesaler':'listing agent';
  const rules=`You are role-playing for negotiation practice. You are a ${role}: ${P.brief}.\n${facts}\nThe user is the real estate investor${k&&k.ours?' who sent that offer':''}. Stay in character the whole time and talk like a real ${role} on a phone call: one to four sentences, natural, and push back with questions. Write only the words you say out loud: no stage directions, no actions or feelings in asterisks, brackets or parentheses, no narration and no name labels. Let your mood come through in what you say and how you say it (short answers, "look,", "uh", a trailing "...").\nHidden: the seller would accept as low as ${money(floor)} if the buyer earns it with solid reasoning, flexible terms and certainty to close. Never reveal that number or that a floor exists. Move toward it slowly and only for good reasons. If the buyer is pushy or sloppy, get firmer.\nNever break character and never mention being an AI or a practice exercise.\n\nThe call starts now: the investor is calling you. Answer the phone the way a busy ${role} does (your name, maybe your brokerage). Once they say who they are, you remember everything above.`;
  const s={id:uid('p'),dealId:d?d.id:null,persona,floor,facts,title,stage,caseFile:k,turns:[{role:'user',content:rules}],created:nowISO()};
  const res=await runAI('pr-start','Dialing…',(ai,signal)=>ai.text(s.turns,{signal,modelTier:'quick'}));
  if(!res)return;s.turns.push({role:'assistant',content:cleanSpoken(res.text)});state.practiceId=s.id;savePractice(s);if(state.voiceOn)speakAgent(res.text,persona);
}
