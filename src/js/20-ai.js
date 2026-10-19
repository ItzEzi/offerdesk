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
  const model=opts.modelTier==='quick'?'claude-haiku-5-5':(sec.model||'claude-sonnet-5-5');
  let res;
  try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':sec.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:opts.maxTokens||3000,messages:merged})})}
  catch(e){if(e&&e.name==='AbortError')throw {code:'cancelled'};throw {code:'network'}}
  if(!res.ok){let j={};try{j=await res.json()}catch(e){}const m=(j.error&&j.error.message)||res.statusText||'';
    throw {code:res.status===401||res.status===403?'bad_key':res.status===429?'rate_limited':/credit|billing|balance/i.test(m)?'no_credit':res.status===404?'bad_model':/image/i.test(m)?'image_rejected':res.status>=500?'upstream_error':'api_error',message:m}}
  const j=await res.json();const text=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  if(!text)throw {code:'empty_completion'};
  return {text,truncated:j.stop_reason==='max_tokens'};
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
  if(c==='bad_key')return 'Anthropic rejected your API key. Check it in Connect.';
  if(c==='no_credit')return 'Your Anthropic account is out of credits. Add credits in the Anthropic Console.';
  if(c==='bad_model')return 'That model isn’t available on your API key. Pick another in Connect.';
  if(c==='network')return 'Couldn’t reach Anthropic. Check your internet connection.';
  if(c==='rate_limited')return 'Anthropic says slow down for a minute. Try again shortly.';
  if(c==='invalid_json')return `${n}’s answer came back garbled. Try again.`;
  if(c==='image_rejected')return 'One of the photos couldn’t be read. Remove it and try again.';
  return (e&&e.message)?'Claude error: '+e.message:'Couldn’t reach Claude. Try again.';
}
async function runAI(key,label,fn,quiet){
  if(state.busy[key])return null;
  if(!aiOn()){if(!quiet)toast(aiErr({code:'no_ai'}),5200);return null}
  const ctl=new AbortController();
  state.busy[key]={label,ctl};render();
  try{return await fn(AI,ctl.signal)}
  catch(e){const m=aiErr(e);if(m&&!quiet)toast(m,5200);if(quiet&&m)logActivity(null,'warn',m);return null}
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
    dom(d)!=null?`Days on market: ${dom(d)}${d.zipAvgDom?` (ZIP average ${d.zipAvgDom})`:''}`:'',
    `Our ARV: ${money(c.A)}. Our repair estimate: ${money(d.rehab)}.`,
    a&&a.summary?`Photo inspection summary: ${a.summary} Level: ${a.level||'?'}.`:'',
    d.description?`Listing description: ${d.description.slice(0,1500)}`:'',
    d.instructions?`Investor's standing instructions for this deal (follow them): ${d.instructions.slice(0,800)}`:'',
    d.notes?`Investor's private notes (context only, never quote): ${d.notes.slice(0,1200)}`:''
  ].filter(Boolean).join('\n');
}
function compsText(d){const cs=(d.comps||[]).filter(x=>x.price);if(!cs.length)return 'No comps entered.';return cs.slice(0,6).map(x=>`- ${x.addr||'comp'}: sold ${money(x.price)}${x.sqft?`, ${x.sqft} sqft ($${Math.round(x.price/x.sqft)}/sqft)`:''}${x.dist!=null?`, ${x.dist} mi away`:''}${x.soldDate?`, sold ${x.soldDate}`:''}${x.reno===false?', not renovated':', renovated'}`).join('\n')}
function threadText(d){return (d.thread||[]).slice(-14).map(t=>`[${fmtDate(t.at)} · ${t.dir==='out'?'US':t.dir==='in'?'THEM':'NOTE'} via ${t.channel}${t.price?` · number: ${money(t.price)}`:''}] ${(t.subject?t.subject+' — ':'')+(t.text||'').slice(0,1200)}`).join('\n')||'(no messages yet)'}
function signRules(){
  const p=state.settings.profile,n=state.settings.neg;
  return `Sign every message as "${n.name}" on behalf of ${p.name||'the investor'}${p.company?' at '+p.company:''}.${p.phone?' Phone: '+p.phone+'.':''}${p.email?' Email: '+p.email+'.':''}
Tone: ${TONES[n.tone]||TONES.friendly}. Plain US English. No emojis, no hype.
Never invent facts about the property, the comps, the seller or the buyer.${n.disclose?` Do not claim to be human. If anyone asks whether they are dealing with a person or an AI, say you are an AI assistant working for ${p.name||'the investor'}, who approves your limits.`:''}${n.optOutLine?' End every email with one short line: "Prefer not to get offers from us? Reply ‘remove’ and we won’t contact you again."':''}`;
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
function promptDeep(d,nPhotos){
  return `You are ${negName()}, an acquisitions analyst for a fix-and-flip and wholesale investor in Dallas–Fort Worth. ${nPhotos?`${nPhotos} listing photo(s) are attached. Look at them carefully, room by room.`:'No photos were provided; rely on the text and say what needs a site visit.'} Produce an inspection-style condition report, a rehab scope priced at current DFW contractor rates (labor plus materials) to a clean mid-grade resale finish, and value estimates.

Property: ${[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ')||'unknown'}; ${PROP_TYPES[d.propertyType]||'house'}; ${d.beds??'?'} bed / ${d.baths??'?'} bath; ${d.sqft??'?'} sqft; lot ${d.lotSqft??'?'} sqft; built ${d.year??'?'}.
Asking/list price: ${money(curList(d))}.
Listing description: ${(d.description||'none').slice(0,2500)}
Investor notes: ${(d.notes||'none').slice(0,1000)}
Comps the investor entered:
${compsText(d)}

Rules: rate a system only from what you can see or what the text says, otherwise "unknown". If no comps were entered, your ARV is a rough estimate from the asking price, location and condition: give a low/high range and mark confidence low. Whole dollars only.

Reply with only JSON:
{"condition":{"structure":{"rating":"good|fair|poor|unknown","notes":""},"roof":{"rating":"","notes":""},"exterior":{"rating":"","notes":""},"kitchen":{"rating":"","notes":""},"bathrooms":{"rating":"","notes":""},"living_bedrooms":{"rating":"","notes":""},"flooring":{"rating":"","notes":""},"mechanicals":{"rating":"","notes":""}},
"level":"light refresh|moderate rehab|full gut","summary":"two sentences","suggestions":["specific renovation suggestions"],
"rehabLines":[{"item":"","detail":"","cost":number}],"contingencyPct":number,
"arv":{"value":number|null,"low":number|null,"high":number|null,"confidence":"low|medium|high","why":"one sentence"},
"rent":{"value":number|null,"why":"one sentence"},
"audience":"home buyer|investor|mixed","audienceConfidence":"low|medium|high","motivation":"distressed property|motivated seller|stale listing|estate or probate|tired landlord|retail listing",
"redFlags":["..."],"verify":["things to check on site"],"rooms":{"bedrooms":number|null,"bathrooms":number|null},"photoNotes":"what the photos showed and did not show"}`;
}
const P_WHOLESALE=t=>`Extract the property deal or deals from this wholesaler email or text. Use null for anything not stated. Numbers are plain numbers in dollars or square feet.

Reply with only JSON: {"deals":[{"address":"street address","city":"","state":"","zip":"","asking":number|null,"arv":number|null,"rehab":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"rent":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","occupancy":"vacant|occupied|unknown","terms":"cash only, seller finance, subject-to, etc. or null","deadline":"text or null","access":"text or null","photoLinks":["any image or photo-album URLs"],"description":"one or two sentences about condition and the pitch","redFlags":["claims that look inflated, missing info, pressure tactics"]}],"wholesaler":{"name":"","company":"","email":"","phone":""}}

Message:
"""${t.slice(0,12000)}"""`;
const P_LISTING=t=>`Extract this property listing (copied from Zillow, Redfin, Realtor.com or the MLS). Use null for anything not stated. Numbers are plain numbers.

Reply with only JSON: {"address":"street","city":"","state":"","zip":"","listPrice":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","mlsStatus":"for_sale|pending|sold|off_market","mlsId":"","daysOnMarket":number|null,"listedDate":"YYYY-MM-DD or null","rent":number|null,"description":"the listing remarks, trimmed","agent":{"name":"","email":"","phone":"","brokerage":""},"priceHistory":[{"date":"YYYY-MM-DD","price":number}],"photoUrls":["direct image URLs if present"]}

Listing:
"""${t.slice(0,14000)}"""`;
const P_COMPS=(t,d)=>`These are sold comparable sales copied for the subject property at ${streetOf(d.address)||'unknown'} (${d.sqft||'?'} sqft). Extract each sold comp. Use null for unknowns. dist is miles from the subject if given.

Reply with only JSON: {"comps":[{"addr":"","price":number,"sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"soldDate":"YYYY-MM-DD or null","reno":true|false|null}]}

Text:
"""${t.slice(0,12000)}"""`;
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
