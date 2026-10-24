/* ================= secrets (kept in this browser only) ================= */
const SECRET_KEY='od.secrets';
function secrets(){try{return JSON.parse(lsGet(SECRET_KEY)||'{}')||{}}catch(e){return {}}}
function setSecret(k,v){const s=secrets();if(v==null||v==='')delete s[k];else s[k]=v;lsSet(SECRET_KEY,JSON.stringify(s));if(k!=='bridgeKey')cloudTrack('secrets')}
function bridgeKey(){let k=secrets().bridgeKey;if(!k){const a=new Uint8Array(18);try{crypto.getRandomValues(a)}catch(e){for(let i=0;i<a.length;i++)a[i]=Math.random()*256|0}k=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');setSecret('bridgeKey',k)}return k}
const aiOn=()=>!!secrets().apiKey;

/* ================= Claude API (Maya's brain + eyes) ================= */
function blobToB64(blob){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(blob)})}
async function imageBlock(item){
  if(item&&item.url)return {type:'image',source:{type:'url',url:item.url}};
  const blob=item&&item.blob?item.blob:item;
  return {type:'image',source:{type:'base64',media_type:blob.type&&/^image\/(jpeg|png|webp|gif)$/.test(blob.type)?blob.type:'image/jpeg',data:await blobToB64(blob)}};
}
async function apiText(input,opts){
  opts=opts||{};const sec=secrets();if(!sec.apiKey)throw {code:'no_ai'};
  const msgs=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:m.content}));
  const merged=[];for(const m of msgs){const l=merged[merged.length-1];if(l&&l.role===m.role)l.content+='\n\n'+m.content;else merged.push(Object.assign({},m))}
  if(merged[0]&&merged[0].role!=='user')merged.unshift({role:'user',content:'(start)'});
  if(opts.images&&opts.images.length){const last=merged[merged.length-1];const blocks=[];for(const f of opts.images)blocks.push(await imageBlock(f));last.content=[...blocks,{type:'text',text:last.content}]}
  const model=opts.model||(opts.modelTier==='quick'?'claude-haiku-5-5':(sec.model||'claude-sonnet-5-5'));
  let res;
  try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':sec.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:opts.maxTokens||3000,messages:merged})})}
  catch(e){if(e&&e.name==='AbortError')throw {code:'cancelled'};throw {code:'network'}}
  if(!res.ok)throw await apiFail(res);
  const j=await res.json();addSpend(model,j.usage,0);const text=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  if(!text)throw {code:'empty_completion'};
  return {text,truncated:j.stop_reason==='max_tokens'};
}
async function apiFail(res){let j={};try{j=await res.json()}catch(e){}const m=(j.error&&j.error.message)||res.statusText||'';const st=res.status;
  return {code:res.status===401||res.status===403?'bad_key':res.status===429?'rate_limited':/credit|billing|balance/i.test(m)?'no_credit':res.status===404?'bad_model':/image/i.test(m)?'image_rejected':res.status>=500?'upstream_error':'api_error',message:m,status:st}}
/* a call where Claude may search the web and open pages (server tools); continues paused turns */
const WEB_TOOLS=(n)=>[{type:'web_search_20250305',name:'web_search',max_uses:n||6},{type:'web_fetch_20250910',name:'web_fetch',max_uses:n||6,max_content_tokens:12000}];
async function apiTools(prompt,opts){
  opts=opts||{};const sec=secrets();if(!sec.apiKey)throw {code:'no_ai'};
  const model=opts.model||sec.model||'claude-sonnet-5-5';let messages=[{role:'user',content:prompt}];
  const sources=new Map(),fetchUrl={},failed=[];let text='',searches=0;
  for(let round=0;round<5;round++){
    let res;try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':sec.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:opts.maxTokens||8000,messages,tools:opts.tools||WEB_TOOLS()})})}
    catch(e){if(e&&e.name==='AbortError')throw {code:'cancelled'};throw {code:'network'}}
    if(!res.ok)throw await apiFail(res);
    const j=await res.json();const blocks=j.content||[];addSpend(model,j.usage,+((j.usage||{}).server_tool_use||{}).web_search_requests||0);
    for(const b of blocks){
      if(b.type==='server_tool_use'){if(b.name==='web_fetch'&&b.input&&b.input.url)fetchUrl[b.id]=b.input.url;if(b.name==='web_search')searches++}
      if(b.type==='web_search_tool_result'&&Array.isArray(b.content))for(const r of b.content)if(r&&r.url&&!sources.has(r.url))sources.set(r.url,r.title||r.url);
      if(b.type==='web_fetch_tool_result'){const c=b.content||{};if(c.type==='web_fetch_result'&&c.url)sources.set(c.url,(c.content&&c.content.title)||c.url);else if(fetchUrl[b.tool_use_id])failed.push({url:fetchUrl[b.tool_use_id],why:c.error_code||'error'})}
    }
    text=blocks.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
    if(j.stop_reason==='pause_turn'){messages=[...messages,{role:'assistant',content:blocks}];continue}
    break;
  }
  if(!text)throw {code:'empty_completion'};
  return {text,sources:[...sources].map(([url,title])=>({url,title})),failed,searches};
}
function parseLoose(t){
  try{return JSON.parse(t)}catch(e){}
  const f=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(f){try{return JSON.parse(f[1])}catch(e){}}
  const a=Math.min(...['{','['].map(c=>{const i=t.indexOf(c);return i<0?Infinity:i}));const b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
  if(isFinite(a)&&a<b){try{return JSON.parse(t.slice(a,b+1))}catch(e){}}
  throw {code:'invalid_json',text:t};
}
const AI={text:(input,opts)=>apiText(input,opts),json:async(input,opts)=>parseLoose((await apiText(input,opts)).text)};
function aiErr(e){
  const c=e&&e.code;const n=negName();
  if(c==='cancelled')return null;
  if(c==='no_ai')return `${n} needs your Anthropic API key. Add it in Connect → ${n}’s brain.`;
  if(c==='bad_key')return `Anthropic rejected your API key${e&&e.message?` (“${String(e.message).slice(0,140)}”)`:''}. In Connect → ${n}’s brain, paste a fresh key from console.anthropic.com → API keys, then press Test.`;
  if(c==='no_credit')return 'Your Anthropic account has no credits. The API is pay-as-you-go: add credits at console.anthropic.com → Billing, then try again.';
  if(c==='bad_model')return 'That model isn’t available on your API key. Pick another in Connect.';
  if(c==='network')return 'Couldn’t reach Anthropic. If your internet works, the usual cause is an Anthropic account with no credits or a key that was turned off: check console.anthropic.com → Billing and API keys.';
  if(c==='rate_limited')return 'Anthropic says slow down for a minute. Try again shortly.';
  if(c==='invalid_json')return `${n}’s answer came back in a shape OfferDesk couldn’t read, so nothing was added from that email.`;
  if(c==='image_rejected')return 'One of the photos couldn’t be read. Remove it and try again.';
  if(c==='empty_completion')return 'Claude sent back an empty answer. Try again.';
  if(c==='upstream_error')return `Anthropic’s servers had a problem${e.status?' (HTTP '+e.status+')':''}. Try again in a minute.`;
  return (e&&e.message)?`Claude error${e.status?' (HTTP '+e.status+')':''}: ${e.message}`:`Couldn’t reach Claude${c?' ('+c+')':''}. Try again.`;
}
async function runAI(key,label,fn,quiet){
  const errs=state.aiErrs||(state.aiErrs={});
  if(state.busy[key]){errs[key]='Maya was already reading that one.';return null}
  if(!aiOn()){errs[key]=aiErr({code:'no_ai'});if(!quiet)toast(errs[key],5200);return null}
  const ctl=new AbortController();
  state.busy[key]={label,ctl};render();
  delete errs[key];
  try{return await fn(AI,ctl.signal)}
  catch(e){if(e&&e.code==='no_credit')state.noCredit=Date.now();const m=aiErr(e);errs[key]=m||'Stopped.';if(m&&!quiet)toast(m,5200);if(quiet&&m)logActivity(null,'warn',m);return null}
  finally{delete state.busy[key];render()}
}
function busyHTML(key,stop=true){const b=state.busy[key];if(!b)return '';return `<div class="busy"><div class="spin"></div><span>${esc(b.label)}</span>${stop&&b.ctl?`<button class="btn ghost sm" data-act="stop-ai" data-key="${esc(key)}">Stop</button>`:''}</div>`}

/* ================= prompts ================= */
function dealFacts(d,c){
  const L=curList(d);const a=d.analysis;
  return [
    `Address: ${[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ')||'unknown'}`,
    `Source: ${d.source==='wholesaler'?'off-market deal from a wholesaler':'listed on the MLS (on-market)'}; status ${mlsOf(d)[0]}`,
    `Current ${d.source==='wholesaler'?'asking':'list'} price: ${money(L)}${priceDropped(d)?` (originally ${money(origList(d))})`:''}`,
    `Type / beds / baths / sqft / lot / year: ${PROP_TYPES[d.propertyType]||'house'} / ${d.beds??'?'} / ${d.baths??'?'} / ${d.sqft??'?'} / ${d.lotSqft??'?'} sqft lot / ${d.year??'?'}`,
    dom(d)!=null?`Days on market: ${dom(d)}${zipDom(d)?` (ZIP median ${zipDom(d)})`:''}`:'',
    `Our ARV: ${money(c.A)}. Our repair estimate: ${money(d.rehab)}.`,
    a&&a.summary?`Photo inspection summary: ${a.summary} Level: ${a.level||'?'}.`:'',
    d.description?`Listing description: ${d.description.slice(0,1500)}`:'',
    d.instructions?`Investor's standing instructions for this deal (follow them): ${d.instructions.slice(0,800)}`:'',
    d.notes?`Investor's private notes (context only, never quote): ${d.notes.slice(0,1200)}`:'',
    (()=>{const h=historyInsights(d);const ev=histEvents(d);return ev.length?`Property history (oldest first): ${ev.slice(-14).map(e=>`${e.date} ${(HEV[e.event]||HEV.other)[0].toLowerCase()}${e.price?' '+money(e.price):''}`).join('; ')}.${h.length?' What it means: '+h.map(x=>x.text).join(' '):''}`:''})(),
    marketFacts(d),
    (()=>{const ms=marketSignal(d);return ms?`Negotiation leverage: ${ms.text}. ${ms.level==='rejection'?'The market has been refusing this house at these prices; buyers are not paying the ask.':'The listing is stale; the seller is likely getting flexible.'} You may point to the time on market and the price history, politely.`:''})()
  ].filter(Boolean).join('\n');
}
function compsText(d){const cs=(d.comps||[]).filter(x=>x.price);if(!cs.length)return 'No comps entered.';return cs.slice(0,6).map(x=>`- ${x.addr||'comp'}: sold ${money(x.price)}${x.sqft?`, ${x.sqft} sqft ($${Math.round(x.price/x.sqft)}/sqft)`:''}${x.dist!=null?`, ${x.dist} mi away`:''}${x.soldDate?`, sold ${x.soldDate}`:''}${x.reno===false?', not renovated':', renovated'}`).join('\n')}
function threadText(d){return (d.thread||[]).slice(-14).map(t=>`[${fmtDate(t.at)} · ${t.dir==='out'?'US':t.dir==='in'?'THEM':'NOTE'} via ${t.channel}${t.price?` · number: ${money(t.price)}`:''}] ${(t.subject?t.subject+' — ':'')+(t.text||'').slice(0,1200)}`).join('\n')||'(no messages yet)'}
function signRules(){
  const p=state.settings.profile,n=state.settings.neg;
  const title=(n.title||'Acquisitions Manager').trim();const sig=[n.name,title].filter(Boolean);
  return `You are ${n.name}, ${title}${p.company?' at '+p.company:''}. Write in the first person as ${n.name}; say "we" or "our team" for the buyer. Never write "on behalf of" and never introduce yourself as an assistant.
End every email with this signature, one item per line: ${sig.map(x=>'"'+x+'"').join(', ')}. End texts with "– ${n.name}".
Tone: ${TONES[n.tone]||TONES.friendly}. Plain US English. No emojis, no hype.
Never invent facts about the property, the comps, the seller or the buyer.${n.disclose?` Do not claim to be human. If anyone asks whether they are dealing with a person or an AI, say honestly that you are an AI acquisitions agent working for ${p.name||'the buyer'}${p.company?' at '+p.company:''}, who approves your limits.`:''}${n.optOutLine?' End every email with one short line: "Prefer not to get offers from us? Reply ‘remove’ and we won’t contact you again."':''}`;
}
const counterpart=d=>d.source==='wholesaler'?'the wholesaler':'the listing agent';
function firstName(d){const n=((d.agent&&d.agent.name)||'').replace(/\(example\)/i,'').trim();return n.split(/\s+/)[0]||'there'}
function promptOpening(d,c){
  const s=state.settings.buy;
  return `You write offers for a real estate investor. Draft the FIRST cash offer on this property to ${counterpart(d)} (${(d.agent&&d.agent.name)||'name unknown'}).

${dealFacts(d,c)}
Our comps:
${compsText(d)}

The offer:
- Price: exactly ${money(c.opening)}. This is the only offer number you may state. Never mention or hint at a maximum, ceiling or budget.
- Terms: all cash, as-is, close in ${s.closeDays} days, ${s.optionDays}-day option period, ${money(s.emd)} earnest money.
- Walk the math in one or two sentences so the number reads as reasoned, not a lowball: ARV around ${moneyK(c.A)}, repairs around ${moneyK(d.rehab)}, plus holding, closing and resale costs.${(d.comps||[]).length?' You may cite one or two of the comps.':''}
- End with one easy question that invites a reply (for example what matters most to the seller on timing).
- Open the email with "Hi ${firstName(d)},".
- Email: 80 to 150 words with a short subject line that includes the street address. SMS: under 320 characters, same price and terms in brief.
${signRules()}

Reply with only JSON: {"email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptReply(d,c,next,instruction){
  const s=state.settings,cr=s.creative,last=lastOurPrice(d),theirs=lastTheirPrice(d);
  const sf=d.sfSaved?`Saved seller-finance terms to use if you go creative: price ${money(d.sfSaved.price)}, ${d.sfSaved.downPct}% down, ${money(d.sfSaved.payment)}/month, ${d.sfSaved.rate}% interest.`:'';
  return `You negotiate real estate purchases for an investor. Read the conversation and the newest message from the other side, choose the next move, and draft the reply.

${dealFacts(d,c)}
Our comps:
${compsText(d)}

Numbers from the investor's model (do not change them):
- Our ceiling (maximum allowable cash offer): ${money(c.mao)}. SECRET: never state it, hint at it, or offer above it in cash.
- Our target landing price: ${money(c.target)}.
- Our last offer: ${money(last)}. Offers made so far: ${ourCount(d)} of a planned ${s.buy.maxRounds}.
- Their last stated number: ${theirs!=null?money(theirs):'none yet'}.
- Suggested next cash counter on our concession ladder: ${money(next)}. You may hold at ${money(last)} or counter anywhere from ${money(last)} up to ${money(c.mao)}. Smaller moves are better. Do not move twice in a row without them moving.
- ${cr.enabled?`Creative option: seller financing at a price up to ${money(c.sfCap)}, down payment up to ${cr.maxDownPct}%, interest up to ${cr.maxRate}%, ${cr.termYears}-year amortization. ${sf} Use it only when they will not come down on price but might accept terms.`:'Creative financing is not allowed on this deal.'}
${instruction?`\nTHE INVESTOR'S INSTRUCTION FOR THIS MESSAGE (follow it within the limits above): ${instruction}\n`:''}
Conversation so far (oldest first):
${threadText(d)}

Choose one action:
- "counter": a new cash price; state it in the message.
- "hold": keep our current price, walk the math again, ask what the seller needs.
- "accept": their number is at or below our ceiling; say we can work with it and move toward a contract.
- "creative": propose seller-finance terms within the limits above.
- "ask_owner": they are close but above our ceiling, or something unusual came up; draft a short holding reply and tell the investor what decision is needed.
- "walk": far apart after several rounds; step back politely and leave the door open.
- "stop": they asked not to be contacted; draft only a one-line acknowledgment.
When you counter or hold, walk the math in one or two sentences so the number reads as reasoned: our ARV, the repairs, holding, closing and resale costs, and the margin an investor needs, arriving at our number. Never reveal the ceiling.
If they claim a higher value, defend our ARV with the comps above. Also judge their sentiment.

${signRules()}

Reply with only JSON:
{"action":"counter|hold|accept|creative|ask_owner|walk|stop","price":number or null,"theirCounter":number or null,"sentiment":"warm|neutral|cold|hostile","sellerSignals":["short phrases"],"summary":"one sentence: what they said","why":"one or two sentences to the investor explaining this move","terms":"seller-finance terms if action is creative, else empty","email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptFollow(d,c,price,priceDrop){
  const since=daysSince(lastAt(outs(d)));const step=(d.follow&&d.follow.step)||0;
  return `You write follow-ups for a real estate investor. ${counterpart(d)} has not answered our last message for ${since??'a few'} days. Draft follow-up number ${step+1}.

${dealFacts(d,c)}

Conversation so far (oldest first):
${threadText(d)}

${priceDrop?`The price just dropped to ${money(curList(d))}. Use the drop as the reason to reconnect. Our offer is now ${money(price)}.`:`Our offer stands at ${money(price)}. Do not raise it.`}
Take a different angle from earlier messages; do not repeat them. Keep the email under 90 words and the SMS under 220 characters. Never mention a maximum or budget.
${signRules()}

Reply with only JSON: {"email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptChat(d,c,msg){
  const hist=(d.mayaChat||[]).slice(-10).map(m=>(m.role==='user'?'INVESTOR: ':'MAYA: ')+m.content).join('\n');
  return `You are ${negName()}, the acquisitions assistant for ${state.settings.profile.name||'an investor'}. The investor is talking to you about one deal. Answer briefly and concretely, like a sharp analyst. If the investor asks you to message the agent or gives a negotiation instruction, also write that message as a draft.

${dealFacts(d,c)}
Our comps:
${compsText(d)}
Numbers: ceiling ${money(c.mao)} (the investor knows it; never put it in a draft), opening ${money(c.opening)}, target ${money(c.target)}, our last offer ${money(lastOurPrice(d))}, their last ${money(lastTheirPrice(d))}.

Conversation with ${counterpart(d)} (oldest first):
${threadText(d)}

Earlier chat with the investor:
${hist||'(none)'}

INVESTOR: ${msg}

Rules for any draft: never offer above ${money(c.mao)} cash; seller finance only up to ${money(c.sfCap)} with at most ${state.settings.creative.maxDownPct}% down.
${signRules()}

Reply with only JSON: {"answer":"what you say to the investor, 1 to 5 sentences","draft":null or {"action":"counter|hold|accept|creative|followup|custom","price":number or null,"email":{"subject":"...","body":"..."},"sms":"..."}}`;
}
const REHAB_BOOK=[
  ['paint_int','Interior paint','per sqft of living area',2.75],['paint_ext','Exterior paint','per sqft of living area',2.25],
  ['lvp','LVP flooring, installed','per sqft',4.5],['carpet','Carpet, installed','per sqft',3],['tile','Tile floor, installed','per sqft',9],['drywall','Drywall and texture repair','per sqft',2],
  ['kitchen_light','Kitchen refresh (paint cabinets, counters, hardware)','each',9000],['kitchen_mid','Kitchen remodel, mid-grade','each',22000],['kitchen_full','Kitchen full gut','each',35000],
  ['bath_light','Bathroom refresh','each',3500],['bath_mid','Bathroom remodel','each',9000],['bath_full','Bathroom full gut','each',14000],
  ['appliances','Appliance package','each',3500],['lighting','Lighting and fixtures','per house',2000],['int_door','Interior door','each',250],['ext_door','Exterior door','each',1200],['windows','Window','each',650],
  ['roof','Roof replacement (shingle)','per sqft of living area',6.5],['hvac','HVAC system','each',9500],['water_heater','Water heater','each',1800],['panel','Electrical panel','each',3000],
  ['rewire','Rewire','per sqft',7],['repipe','Plumbing repipe','per sqft',6],['foundation','Foundation repair allowance','each',9000],['siding','Siding repair','per house',4000],
  ['fence','Fence','per linear ft',35],['landscaping','Landscaping and cleanup','per house',2500],['permits','Permits, dumpster, misc','per house',1500]];
function rehabBook(){const o=(state.settings.rehab&&state.settings.rehab.costs)||{};return REHAB_BOOK.map(([key,label,unit,cost])=>({key,label,unit,cost:o[key]!=null&&isFinite(o[key])?o[key]:cost,def:cost}))}
function promptDeep(d,nPhotos){
  const R=state.settings.rehab||{};const book=rehabBook();const where=[d.city,d.state].filter(Boolean).join(', ')||'the property’s area';
  return `You are ${negName()}, an acquisitions analyst for a fix-and-flip, BRRRR and wholesale investor. ${nPhotos?`${nPhotos} listing photo(s) are attached, numbered 1 to ${nPhotos} in the order given. Study every one closely before you conclude anything.`:'No photos were provided; rely on the text and say what needs a site visit.'}

Work in this order:
1. Photo log. For each photo: which room or area it shows, and what you can actually see: materials and their era (for example "oak cabinets, laminate counters, about 1995"), condition, damage, and anything that drives cost. Do not describe what is not visible.
2. Condition by area, rated only from what you saw or what the text says. Anything not shown is "unknown" and goes in notSeen.
3. Rehab quantities from the investor's cost book below. Do not invent prices. For each item needed, give the cost-book key and a quantity: square feet for per-sqft items (base them on the ${d.sqft||'unknown'} sqft living area unless the photos show otherwise), a count for "each" items, and 1 for per-house items. For areas you could not see, include a sensible allowance and mark seen false.
Cost book (key: item, price, unit):
${book.map(b=>`- ${b.key}: ${b.label}, ${money(b.cost)} ${b.unit}`).join('\n')}
4. Anything that is not in the cost book goes in customLines with your best cost for ${where}.
${R.notes?`The investor's own notes on repair pricing (follow them): ${String(R.notes).slice(0,800)}\n`:''}
Property: ${[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ')||'unknown'}; ${PROP_TYPES[d.propertyType]||'house'}; ${d.beds??'?'} bed / ${d.baths??'?'} bath; ${d.sqft??'?'} sqft; lot ${d.lotSqft??'?'} sqft; built ${d.year??'?'}.
Asking/list price: ${money(curList(d))}.
Listing description: ${(d.description||'none').slice(0,2500)}
Investor notes: ${(d.notes||'none').slice(0,1000)}
Comps the investor has:
${compsText(d)}
${(()=>{const m=marketFacts(d);return m?m+'\n':''})()}
Rules: whole dollars only. If there are few or no comps, your ARV is a rough estimate: give a low/high range and mark confidence low. Renovated homes in a ZIP usually sell above the ZIP's median $/sqft.

Reply with only JSON:
{"photoLog":[{"photo":1,"area":"kitchen|bathroom|bedroom|living|exterior|roof|yard|garage|mechanical|other","sees":"what is visible","condition":"good|fair|poor","flags":["cost signals"]}],
"condition":{"structure":{"rating":"good|fair|poor|unknown","notes":""},"roof":{"rating":"","notes":""},"exterior":{"rating":"","notes":""},"kitchen":{"rating":"","notes":""},"bathrooms":{"rating":"","notes":""},"living_bedrooms":{"rating":"","notes":""},"flooring":{"rating":"","notes":""},"mechanicals":{"rating":"","notes":""}},
"notSeen":["areas with no photo, e.g. roof, HVAC, second bathroom"],
"level":"light refresh|moderate rehab|full gut","summary":"two sentences","suggestions":["specific renovation suggestions"],
"rehabItems":[{"key":"cost book key","qty":number,"why":"short reason","seen":true}],"customLines":[{"item":"","detail":"","cost":number}],"contingencyPct":number,
"arv":{"value":number|null,"low":number|null,"high":number|null,"confidence":"low|medium|high","why":"one sentence"},
"rent":{"value":number|null,"why":"one sentence"},
"audience":"home buyer|investor|mixed","audienceConfidence":"low|medium|high","motivation":"distressed property|motivated seller|stale listing|estate or probate|tired landlord|retail listing",
"redFlags":["..."],"verify":["things to check on site"],"rooms":{"bedrooms":number|null,"bathrooms":number|null},"photoNotes":"what the photos showed and did not show"}`;
}
const P_WHOLESALE=t=>`Extract the property deal or deals from this wholesaler email or text. Use null for anything not stated. Numbers are plain numbers in dollars or square feet.

Put up to 3 URLs that show each property (its own listing or deal page first, then Google Drive or Dropbox photo folders, deal pages, video tours, Zillow or Redfin links) in "links", and up to 2 direct image URLs in "photoLinks". Long links are shortened to tokens like [link3]: copy the token exactly as a link. Alert emails often put the link on the property's picture, written as [picture link: ...] next to that house's details: that link belongs to that house, so list it first in its "links". Skip unsubscribe, social media, calendar and "upgrade" links. "acceptPrice" is the lowest price they say they would take, if they say one (for example "with a cash offer we can probably accept 47,000" means 47000); otherwise null. An alert email can list many properties: include every one, keep each description under 25 words and at most 2 red flags, so the whole answer stays short.

Reply with only JSON: {"deals":[{"address":"street address","city":"","state":"","zip":"","asking":number|null,"arv":number|null,"rehab":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"rent":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","occupancy":"vacant|occupied|unknown","acceptPrice":number|null,"terms":"cash only, seller finance, subject-to, etc. or null","deadline":"text or null","access":"text or null","photoLinks":["direct image URLs"],"links":["URLs that show the property"],"description":"one or two sentences about condition and the pitch","redFlags":["claims that look inflated, missing info, pressure tactics"]}],"wholesaler":{"name":"","company":"","email":"","phone":""}}

Message:
"""${t.slice(0,16000)}"""`;
const P_LISTING=t=>`Extract this property listing (copied from Zillow, Redfin, Realtor.com or the MLS). Use null for anything not stated. Numbers are plain numbers.

Reply with only JSON: {"address":"street","city":"","state":"","zip":"","listPrice":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","mlsStatus":"for_sale|pending|sold|off_market","mlsId":"","daysOnMarket":number|null,"listedDate":"YYYY-MM-DD or null","rent":number|null,"description":"the listing remarks, trimmed","agent":{"name":"","email":"","phone":"","brokerage":""},"priceHistory":[{"date":"YYYY-MM-DD","price":number}],"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null}],"photoUrls":["direct image URLs if present"]}
priceHistory is only the current listing's prices. history is the full property history if shown (Zillow "Price history", Redfin "Property history"), including past sales and rentals from earlier years.

Listing:
"""${t.slice(0,14000)}"""`;
const P_COMPS=(t,d)=>`These are sold comparable sales copied for the subject property at ${streetOf(d.address)||'unknown'} (${d.sqft||'?'} sqft). Extract each sold comp. Use null for unknowns. dist is miles from the subject if given.

Include homes for sale or pending too if listed, with their status. reno is false when the text says the home sold as-is, needs work, or is a fixer.

Reply with only JSON: {"comps":[{"addr":"","price":number,"sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"soldDate":"YYYY-MM-DD or null","status":"sold|for_sale|pending","reno":true|false|null}]}

Text:
"""${t.slice(0,12000)}"""`;
const P_RENTCOMPS=(t,d)=>`These are rental listings or recent leases near the subject property at ${streetOf(d.address)||'unknown'} (${d.beds??'?'} bed, ${d.sqft||'?'} sqft). Extract each rental. Use null for unknowns. dist is miles from the subject if given.

Reply with only JSON: {"rentals":[{"addr":"","rent":number,"beds":number|null,"baths":number|null,"sqft":number|null,"dist":number|null}]}

Text:
"""${t.slice(0,12000)}"""`;
const P_HISTORY=(t,d)=>`This is the price, sale and listing history of the property at ${streetOf(d.address)||'unknown'} (copied from Zillow, Redfin, Realtor.com or the MLS). Extract every event in it. Use null for unknown prices.

Reply with only JSON: {"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null,"note":"short note if useful"}]}

Text:
\"\"\"${t.slice(0,12000)}\"\"\"`;
const QUICK=[
  {id:'drop',label:'Drop this deal',c:'red'},
  {id:'harder',label:'Push harder',c:'orange',ins:'Push harder. Be firmer than the ladder suggests: hold our number or move by a small amount only, and lean on the repair costs and days on market.'},
  {id:'pause',label:'Pause this one',c:'orange'},
  {id:'creative',label:'Go creative',c:'purple',ins:'Go creative: pitch seller financing within the limits, using the saved terms if any. Explain how the seller nets more overall.'},
  {id:'firm',label:'Stand firm + wait',c:'orange',ins:'Stand firm at our current number. Restate it briefly with the math and let them come back to us. No new price.'},
  {id:'callme',label:'Ask them to call me',c:'green',ins:'Ask the agent to call the investor directly at his phone number to talk it through. Keep our current number.'},
  {id:'schedule',label:'Schedule a call',c:'green',ins:'Propose a short phone call and offer two or three specific time slots in the next two business days (Central Time).'},
  {id:'time',label:'Buy me some time',c:'blue',ins:'Buy some time politely: say we are reviewing the numbers with our contractor and will come back by a specific day within 48 hours. No new price.'},
  {id:'resend',label:'Resend the offer',c:'blue',ins:'Resend our current offer cleanly and briefly, with terms, in case it got buried.'},
  {id:'checkin',label:'Send a check-in',c:'blue',ins:'Send a short, friendly check-in asking where things stand. No new price.'},
  {id:'feedback',label:'Ask for seller feedback',c:'blue',ins:'Ask what the seller thought of our offer and what would need to be true for them to accept: price, timing, or terms.'}
];

/* ---- is the key actually working? (a real 1-word call to each model OfferDesk uses) ---- */
async function testKey(){
  if(!aiOn())return;const key='ai-test';if(state.busy[key])return;state.busy[key]={label:'Asking Anthropic if your key works…'};render();
  const sec=secrets();const models=[...new Set([sec.model||'claude-sonnet-5-5','claude-haiku-5-5'])];const res={};let ok=true,msg='';
  for(const m of models){try{await apiText('Reply with the single word OK.',{model:m,maxTokens:5});res[m]='ok'}catch(e){ok=false;res[m]=e&&e.code||'error';if(!msg)msg=aiErr(e)||'';if(e&&['bad_key','no_credit','network'].includes(e.code))break}}
  state.conn.aiCheck={ok,at:nowISO(),msg,models:res,key:String(sec.apiKey||'').slice(-6)};delete state.busy[key];saveConn();render();
  toast(ok?`Your key works. ${negName()} is ready.`:msg,ok?3200:7000);
}
function keyState(){const c=state.conn.aiCheck;if(!aiOn())return 'none';if(!c||c.key!==String(secrets().apiKey||'').slice(-6))return 'untested';return c.ok?'ok':'bad'}
function keyPill(){const k=keyState();return k==='ok'?'<span class="pill green">Working</span>':k==='bad'?'<span class="pill red">Not working</span>':k==='untested'?'<span class="pill orange">Saved, not tested</span>':'<span class="pill orange">Not set up</span>'}
function keyNote(){const k=keyState();const c=state.conn.aiCheck||{};
  if(k==='ok')return `<div class="note green small">Tested ${ago(c.at)}: Anthropic accepted the key${Object.keys(c.models||{}).length>1?' for every model OfferDesk uses':''}.</div>`;
  if(k==='bad')return `<div class="note red small"><b>Tested ${ago(c.at)}: not working.</b> ${esc(c.msg||'')}${c.models?`<br><span class="xs">${Object.entries(c.models).map(([m,v])=>`${esc(m.replace('claude-','').replace(/-/g,' '))}: ${v==='ok'?'works':esc(v)}`).join(' · ')}</span>`:''}</div>`;
  if(k==='untested')return `<div class="note amber small">The key is saved but hasn’t been checked with Anthropic yet. Press <b>Test key</b>.</div>`;
  return '';
}
