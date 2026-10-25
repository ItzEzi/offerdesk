/* ================= listing history ================= */
const HEV={listed:['Listed','blue'],price_cut:['Price cut','red'],price_up:['Price raised','orange'],pending:['Pending','amber'],contingent:['Contingent','amber'],back_on_market:['Back on market','blue'],sold:['Sold','green'],delisted:['Delisted','slate'],relisted:['Relisted','blue'],listed_rent:['Listed for rent','purple'],rented:['Rented','purple'],other:['Event','slate']};
const bigModel=()=>{const m=(state.settings.ai||{}).bigModel;return m==='same'?undefined:(m||'claude-opus-5-5')};
function histEvents(d){
  const ev=(d.history||[]).filter(e=>e&&e.date&&!isNaN(new Date(e.date))).map(e=>Object.assign({},e,{date:isoDay(e.date)}));
  const ph=(d.priceHistory||[]).filter(p=>p&&p.date&&p.price);
  ph.forEach((p,i)=>{const date=isoDay(p.date);const kind=i===0?'listed':p.price<ph[i-1].price?'price_cut':p.price>ph[i-1].price?'price_up':null;if(!kind)return;
    const near=x=>Math.abs(new Date(x.date)-new Date(date))<=5*DAY;
    if(!ev.some(x=>near(x)&&(x.event===kind||(kind==='listed'&&x.event==='relisted'))&&(x.price==null||Math.abs(x.price-p.price)<=1000)))ev.push({date,event:kind,price:p.price,src:'listing'})});
  ev.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let last=null;for(const e of ev){if(e.price&&['listed','relisted','price_cut','price_up','back_on_market'].includes(e.event)){e.delta=last!=null&&e.event!=='listed'&&e.event!=='relisted'?e.price-last:null;last=e.price}if(e.event==='sold')last=null}
  return ev;
}
function historyInsights(d){
  const ev=histEvents(d);if(!ev.length)return [];const out=[];const L=curList(d);const now=Date.now();const ms=x=>new Date(x).getTime();
  const sales=ev.filter(e=>e.event==='sold'&&e.price);const lastSale=sales[sales.length-1];
  if(lastSale){
    const after=ev.filter(e=>['listed','relisted'].includes(e.event)&&e.price&&e.date>lastSale.date&&ms(e.date)-ms(lastSale.date)<=460*DAY);const flip=after.find(e=>e.price>=lastSale.price*1.2);
    const yrs=(now-ms(lastSale.date))/(365*DAY);
    if(flip){const m=Math.max(1,Math.round((ms(flip.date)-ms(lastSale.date))/(30*DAY)));out.push({k:'flip',cls:'purple',text:`Flip pattern: sold for ${money(lastSale.price)} on ${fmtDate(lastSale.date)}, then listed at ${money(flip.price)} ${m} month${m===1?'':'s'} later (+${Math.round((flip.price/lastSale.price-1)*100)}%). It’s likely already renovated, and the seller’s cost is roughly that purchase plus their rehab.`})}
    else out.push({k:'sale',cls:yrs>=10?'green':'slate',text:`Last sold for ${money(lastSale.price)} on ${fmtDate(lastSale.date)} (${yrs<1?Math.max(1,Math.round(yrs*12))+' months':Math.round(yrs)+' years'} ago)${L?`. Today’s asking is ${L>=lastSale.price?'+':'−'}${Math.abs(Math.round((L/lastSale.price-1)*100))}% vs that sale`:''}.${yrs>=10?' Long ownership usually means lots of equity: a good fit for a discount or seller financing.':''}`});
  }
  const lastList=[...ev].reverse().find(e=>['listed','relisted'].includes(e.event));
  if(lastList){const cuts=ev.filter(e=>e.event==='price_cut'&&e.date>=lastList.date);if(cuts.length){const tot=cuts.reduce((a,e)=>a+Math.abs(e.delta||0),0);out.push({k:'cuts',cls:'red',text:`${cuts.length} price cut${cuts.length>1?'s':''} since it was listed on ${fmtDate(lastList.date)}${tot?`, ${money(tot)} in total`:''}. The seller is chasing the market.`})}}
  const relists=ev.filter(e=>['delisted','relisted','back_on_market'].includes(e.event)&&now-ms(e.date)<=3*365*DAY).length;
  if(relists>=2)out.push({k:'relist',cls:'orange',text:`Pulled and relisted ${relists} times in the last 3 years: it has struggled to sell. Ask what went wrong before.`});
  const pend=ev.filter(e=>['pending','contingent'].includes(e.event));const lp=pend[pend.length-1];
  if(lp&&!ev.some(e=>e.event==='sold'&&e.date>=lp.date)&&ev.some(e=>e.date>lp.date&&['back_on_market','price_cut','relisted','listed'].includes(e.event)))out.push({k:'fell',cls:'orange',text:`Went under contract on ${fmtDate(lp.date)} and came back on the market: a deal fell through (inspection or financing?). Ask the agent why.`});
  const rent=[...ev].reverse().find(e=>['listed_rent','rented'].includes(e.event));
  if(rent&&now-ms(rent.date)<=3*365*DAY)out.push({k:'rent',cls:'blue',text:`${rent.event==='rented'?'Rented':'Listed for rent'}${rent.price?' at '+money(rent.price)+'/mo':''} on ${fmtDate(rent.date)}. Possibly a tired landlord, and a real rent number for your rental math.`});
  return out;
}
function historyCard(d){
  const ev=histEvents(d);const ins=historyInsights(d);const n=esc(negName());const busy=state.busy['research:'+d.id]||state.busy['hist:'+d.id];
  let svg='';
  if(ev.length){
    const T=e=>dateOf(e.date).getTime();const t0=T(ev[0]),t1=Math.max(Date.now(),T(ev[ev.length-1]));
    const W=Math.round(Math.min(760,Math.max(330,(window.innerWidth||800)-(window.innerWidth<720?64:330)))),l=18,r=18;
    /* the axis is time-based but squeezes long quiet gaps (marked ≈) and spreads out clusters, so recent activity stays readable */
    const kt=[...new Set([...ev.map(T),t1])].sort((a,b)=>a-b);const YR=365*DAY,BRK=2*YR;
    const eff=[0];for(let i=1;i<kt.length;i++)eff.push(eff[i-1]+Math.min(kt[i]-kt[i-1],YR));const tot=eff[eff.length-1]||1;
    const kp=kt.map((t,i)=>l+(W-l-r)*(kt.length>1?.55*eff[i]/tot+.45*i/(kt.length-1):0));
    const X=t=>{if(kt.length<2||t<=kt[0])return kp[0];for(let i=1;i<kt.length;i++)if(t<=kt[i])return kp[i-1]+(kp[i]-kp[i-1])*(t-kt[i-1])/((kt[i]-kt[i-1])||1);return kp[kp.length-1]};
    const lab=e=>(HEV[e.event]||HEV.other)[0]+(e.price?' '+(/rent/.test(e.event)?money(e.price)+'/mo':moneyK(e.price)):'');
    const md=e=>{const x=dateOf(e.date);return x.toLocaleDateString('en-US',{month:'short'})+' ’'+String(x.getFullYear()).slice(2)};
    /* lanes: 1 above, 1 below, 2 above, 2 below; each label takes the first lane where it fits */
    const LANES=[[-1,1],[1,1],[-1,2],[1,2],[-1,3],[1,3]];const used=LANES.map(()=>[]);
    const placed=ev.map(e=>{const x=X(T(e));const w=Math.max(lab(e).length*6.3,md(e).length*5.6)+10;
      let anchor='middle',a=x-w/2;if(a<2){anchor='start';a=Math.max(2,x-6)}else if(x+w/2>W-2){anchor='end';a=Math.min(W-2,x+6)-w}
      const b=a+w;let li=LANES.findIndex((_,k)=>used[k].every(([p,q])=>b<=p||a>=q));if(li<0)li=LANES.length-1;used[li].push([a,b]);
      return {e,x,anchor,ax:anchor==='start'?a:anchor==='end'?b:x,lane:LANES[li]}});
    const upN=Math.max(1,...placed.filter(p=>p.lane[0]<0).map(p=>p.lane[1])),dnN=Math.max(1,...placed.filter(p=>p.lane[0]>0).map(p=>p.lane[1]));
    const y0=14+upN*30,H=y0+24+dnN*30;
    svg=`<svg viewBox="0 0 ${W} ${H}" class="htl" role="img" aria-label="Listing history timeline"><line x1="${l}" x2="${W-r}" y1="${y0}" y2="${y0}" class="htl-axis"/>`;
    let lastTick=-99;for(let y=new Date(t0).getFullYear()+1;y<=new Date(t1).getFullYear();y++){const t=new Date(y,0,1).getTime();const i=kt.findIndex(k=>k>=t);if(i>0&&kt[i]-kt[i-1]>BRK)continue;const x=X(t);if(x-lastTick<38||x>W-r-44)continue;lastTick=x;svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0-5}" y2="${y0+5}" class="htl-axis"/><text x="${(x+3).toFixed(1)}" y="${y0+14}" class="htl-yr">${y}</text>`}
    for(let i=1;i<kt.length;i++)if(kt[i]-kt[i-1]>BRK){const x=(kp[i-1]+kp[i])/2;svg+=`<g class="htl-brk"><rect x="${(x-7).toFixed(1)}" y="${y0-7}" width="14" height="14"/><path d="M${(x-6).toFixed(1)} ${y0+5}l5-10M${(x+1).toFixed(1)} ${y0+5}l5-10"/></g><text x="${x.toFixed(1)}" y="${y0+16}" text-anchor="middle" class="htl-yr">${Math.round((kt[i]-kt[i-1])/YR)} yrs</text>`}
    svg+=`<circle cx="${W-r}" cy="${y0}" r="3" class="htl-now"/><text x="${W-r}" y="${y0+14}" text-anchor="end" class="htl-yr">Today</text>`;
    placed.forEach(({e,x,anchor,ax,lane})=>{const h=HEV[e.event]||HEV.other;const up=lane[0]<0;const ly=up?y0-14-(lane[1]-1)*30:y0+24+(lane[1]-1)*30+10;
      svg+=`<g class="htl-ev ${h[1]}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${up?ly+3:ly-11}" class="htl-stem"/><circle cx="${x.toFixed(1)}" cy="${y0}" r="6"/><text x="${ax.toFixed(1)}" y="${up?ly-11:ly}" text-anchor="${anchor}" class="htl-lab">${esc(lab(e))}</text><text x="${ax.toFixed(1)}" y="${up?ly:ly+11}" text-anchor="${anchor}" class="htl-date">${esc(md(e))}</text><title>${esc(fmtDate(e.date)+' · '+h[0]+(e.price?' '+money(e.price):'')+(e.note?' · '+e.note:''))}</title></g>`});
    svg+='</svg>';
  }
  const rows=ev.slice().reverse().map(e=>{const h=HEV[e.event]||HEV.other;const k=(d.history||[]).findIndex(x=>x.date&&isoDay(x.date)===e.date&&x.event===e.event&&(x.price||null)===(e.price||null));
    return `<tr style="cursor:default"><td class="tnum">${esc(fmtDate(e.date))}</td><td><span class="tag ${h[1]}">${h[0]}</span>${e.note?` <span class="xs muted">${esc(e.note)}</span>`:''}</td><td class="r tnum">${money(e.price)}</td><td class="r tnum">${e.delta?`<span style="color:${e.delta<0?'var(--t-red)':'var(--t-orange)'}">${e.delta<0?'−':'+'}${money(Math.abs(e.delta)).replace('−','')}</span>`:''}</td><td class="xs muted">${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.src||'source')}</a>`:esc(e.src==='listing'?'this listing':e.src==='web'?'found online':e.src||'you')}</td><td>${k>=0?`<button class="btn ghost sm" data-act="hist-del" data-i="${k}" aria-label="Remove event">${ico('close')}</button>`:''}</td></tr>`}).join('');
  const add=state.histAdd?`<div class="row" style="align-items:flex-end"><label class="field" style="width:150px"><span>Date</span><input class="input" type="date" id="he-date" data-draft value="${esc(state.drafts['he-date']||'')}"></label><label class="field" style="width:170px"><span>What happened</span><select class="input" id="he-ev" data-draft>${Object.entries(HEV).map(([k,v])=>`<option value="${k}" ${(state.drafts['he-ev']||'listed')===k?'selected':''}>${v[0]}</option>`).join('')}</select></label><label class="field" style="width:130px"><span>Price</span><input class="input tnum" id="he-price" data-draft value="${esc(state.drafts['he-price']||'')}" inputmode="numeric"></label><button class="btn primary sm" data-act="hist-save">Add</button></div>`:'';
  const paste=state.histPaste?`<textarea class="input" id="hist-text" data-draft rows="4" placeholder="Paste the “Price history” section from Zillow or the “Property history” from Redfin">${esc(state.drafts['hist-text']||'')}</textarea><div class="row"><button class="btn primary sm" data-act="hist-parse">Read history</button></div>`:'';
  return `<section class="card" id="history"><div class="card-head"><span class="ci blue">${ico('clock')}</span><div><h2>Listing history</h2><p>What happened to this property before you showed up</p></div><div class="ch-r">${aiOn()?`<button class="btn sm" data-act="research" ${busy?'disabled':''}>${ico('spark')}${n} looks it up</button>`:''}<button class="btn sm" data-act="hist-paste-toggle">${ico('copy')}Paste history</button><button class="btn sm" data-act="hist-add-toggle">${ico('plus')}Add event</button></div></div>
  ${busyHTML('research:'+d.id)}${busyHTML('hist:'+d.id)}${add}${paste}
  ${ins.map(x=>`<div class="note ${x.cls==='slate'?'':x.cls}">${esc(x.text)}</div>`).join('')}
  ${ev.length?`<div class="tbl-wrap" style="border:0">${svg}</div><details id="hist-all" ${ev.length<=6?'open':''}><summary>All ${ev.length} event${ev.length>1?'s':''}</summary><div class="tbl-wrap" style="margin-top:8px"><table class="tbl" style="min-width:560px"><thead><tr><th>Date</th><th>Event</th><th class="r">Price</th><th class="r">Change</th><th>Source</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></details>`:`<p class="small muted">No history yet. Paste Zillow’s “Price history” (or Redfin’s “Property history”), or let ${n} look it up: past sales, price cuts, failed contracts and flips tell you how motivated the seller is.</p>`}
  </section>`;
}

/* ================= Maya's research (links, web, comps, claims check) ================= */
const SKIP_LINK=/unsubscribe|optout|opt-out|manage.?preferences|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|\/\/(?:www\.)?x\.com\/|tiktok\.com|youtube\.com\/(?:channel|@)|calendly\.com|mailto:|list-manage\.com\/(?:unsubscribe|profile)/i;
function dealLinks(d){
  const set=new Set();const add=u=>{u=String(u||'').trim().replace(/[)>.,;]+$/,'');if(/^https?:\/\/\S+$/i.test(u)&&!SKIP_LINK.test(u)&&u.length<2000)set.add(u)};
  (d.links||[]).forEach(add);if(d.listingUrl)add(d.listingUrl);
  /* the email's other links only when the email was about this one house (an alert listing 8 houses has 8 houses' links) */
  const multi=d.linksOnly||(d.seenMsgIds||[]).some(id=>((state.mail.emails[id]||{}).dealIds||[]).length>1);
  const first=(d.thread||[]).find(t=>t.dir==='in');if(first&&!multi)(String(first.text||'').match(/https?:\/\/[^\s"'<>]+/g)||[]).forEach(add);
  return [...set].filter(u=>!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)).slice(0,6);
}
function promptResearch(d,ctx){
  const c=calc(d);const ws=d.wsClaims||{};const isWs=d.source==='wholesaler';
  const where=[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ');
  return `You are ${negName()}, an acquisitions analyst for a real estate investor (flips, BRRRR, wholesale). Research this property so the investor knows everything that matters before making an offer. Use web search, and open the links below with web fetch when useful. Use only what you actually find, and name the source for each fact. If a site blocks you, say so and use search instead. Do not guess.

Property: ${where||'unknown address'}
${isWs?`A wholesaler sent this deal. Their claims: asking ${money(ws.asking??curList(d))}, ARV ${money(ws.arv)}, repairs ${money(ws.rehab)}, rent ${money(ws.rent)}${ws.terms?', terms: '+ws.terms:''}.`:`Listed at ${money(curList(d))}.`} Beds/baths/sqft/year on file: ${d.beds??'?'} / ${d.baths??'?'} / ${d.sqft??'?'} / ${d.year??'?'}.
${(ws.comps||[]).length?`The wholesaler cited these sales as comps. Check each one (did it sell, when, for how much, its size, and whether it is really comparable: new construction, fully renovated, much bigger or smaller, a different kind of street) and report it in claimsCheck:\n${ws.comps.map(c=>'- '+compClaimText(c)).join('\n')}\n`:''}${(d.description||'').slice(0,1200)}
${ins(d).length?`What they wrote to us (newest last):\n${ins(d).slice(-4).map(t=>'--- '+String(t.text||'').slice(0,1500)).join('\n')}`:''}
${ctx.links.length?`Links that came with the deal (open the ones that help):\n${ctx.links.map(u=>'- '+u).join('\n')}`:''}
${ctx.pages.length?`Pages we already opened for you (trimmed):\n${ctx.pages.map(p=>`--- ${p.url} (${p.title||''})\n${p.text.slice(0,6000)}`).join('\n')}`:''}
${ctx.blocked.length?`These links blocked our robot: ${ctx.blocked.join(', ')}`:''}

Find:
1. Property facts from public sources (listing sites, county records): beds, baths, living sqft, lot, year built, type.
2. The property's history: every listing, price change, pending, sale, delisting, relisting and rental you can find, with dates and prices.
3. Recently sold comparable homes: within about 1 mile, sold in the last 12 months, similar size and beds. Include address, price, sale date, sqft, beds, baths, distance if shown, the listing URL, and whether the listing says renovated/updated (reno true) or as-is/needs work (reno false). Five to eight good ones beats many weak ones.
4. A market rent estimate with the source.
5. Check every number the ${isWs?'wholesaler':'listing'} gives against what you found.
6. Red flags: flood zone, foundation, fire, tenant-occupied, HOA, code violations, unpermitted work, auctions or liens, anything odd in the history.
Our current ARV on file is ${money(c.A)}${arvTheirs(d)?' (that is the wholesaler’s claim, not checked)':''}; give your own ARV from the renovated sold comps, and say in \"why\" which comps it rests on.

Finish with only this JSON (no text after it):
{"facts":{"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other|null","source":"url"},
"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null,"url":"source url"}],
"comps":[{"addr":"street, city","price":number,"soldDate":"YYYY-MM-DD","sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"status":"sold|for_sale|pending","reno":true|false|null,"url":""}],
"rent":{"value":number|null,"why":"one sentence","source":"url"},
"arv":{"value":number|null,"low":number|null,"high":number|null,"why":"one or two sentences"},
"claimsCheck":[{"claim":"what they say","found":"what you found","verdict":"matches|off|unverified"}],
"sellerLowest":{"price":number|null,"quote":"their exact words, if they said the lowest price they would take (e.g. 'with a cash offer we can probably accept 47,000')"},
"redFlags":["..."],"couldNotOpen":["urls you could not read"],
"summary":"three or four plain sentences for the investor: is this worth pursuing and why"}`;
}
const LINKCACHE=new Map();
async function openLinks(id,links,opts){
  opts=opts||{};const d=state.deals[id];const pages=[],blocked=[],noAccess=[],why={};let photos=0;if(!gmailOn()||!links.length)return {pages,blocked,photos,noAccess,why};
  for(const u of links.slice(0,5)){
    let r;const hit=LINKCACHE.get(u);
    if(hit&&!opts.fresh&&Date.now()-hit.t<30*60*1000)r=hit.r;else{try{r=await bridge('fetch_url',{url:u});LINKCACHE.set(u,{t:Date.now(),r})}catch(e){blocked.push(u);continue}}
    if(r.kind==='page'&&ROBOT_PAGE.test(String(r.title||'')+' '+String(r.text||'').slice(0,600)))r=Object.assign({},r,{kind:'blocked',status:'robot_check'});
    if(r.kind==='blocked'){blocked.push(u);why[u]=r.status;if(r.status==='drive_no_access')noAccess.push(u);
      /* the page is blocked, but the web address it led to often spells out the street address */
      const hops=(r.hops||[]).filter(x=>x&&x!==u);if(hops.length)pages.push({url:u,title:'(blocked page: only the web address it led to is known)',text:'This link led to: '+hops.join(' then '),redirectOnly:true});
      continue}
    if((r.kind==='drive_folder'||r.kind==='drive_file')&&(r.images||[]).length){
      /* each Drive photo only once, even when research opens the same folder later */
      const dd=state.deals[id];const seen=new Set(dd.driveSeen||[]);const todo=r.images.filter(im=>!seen.has(im.id)).slice(0,Math.max(0,16-photoCount(dd)));
      const blobs=[];for(const im of todo){try{const x=await bridge('drive_image',{id:im.id});if(x.data){blobs.push(b64ToBlob(x.data,x.type));seen.add(im.id)}}catch(e){}}
      if(state.deals[id])state.deals[id].driveSeen=[...seen].slice(-200);
      if(blobs.length)photos+=await addPhotoBlobs(id,blobs,'link');continue}
    if(r.kind==='image'){photos+=addPhotoUrls(id,[u]);continue}
    if(r.kind==='page'){if(r.text)pages.push({url:u,title:r.title||'',text:r.text});
      const imgs=(r.images||[]).filter(x=>!/logo|icon|sprite|avatar|badge|favicon|placeholder|pixel|banner|staticmap|maps\.googleapis/i.test(x));
      if(opts.pagePhotos!==false&&imgs.length&&photoCount(state.deals[id])<6)photos+=addPhotoUrls(id,imgs.slice(0,12))}
  }
  return {pages,blocked,photos,noAccess,why};
}
const ROBOT_PAGE=/just a moment|attention required|verify you are human|are you a robot|checking your browser|security check|captcha/i;
/* ================= opening a new deal's links right away =================
   Alert and wholesaler emails often leave things out (no street address, no ARV) and link to the property page or a Google Drive
   photo folder instead. Maya opens those links through the Gmail script (it follows tracking redirects and can open Drive folders
   shared with you or with anyone who has the link), pulls the photos, and fills in what the email left out from the page. */
function hasStreet(d){const s=streetOf(d&&d.address);return /^\d+[a-z]?(-\d+)?\s+\S/i.test(s)&&!/unknown/i.test(s)}
const missingInfo=d=>!hasStreet(d)||curList(d)==null||!/^\d{5}/.test(String(d.zip||''))||d.beds==null||d.sqft==null||d.arv==null;
const P_LINKPAGE=(d,pages)=>`A wholesaler or deal-alert email linked to these pages about a property. Fill in what the email left out, using only what the pages actually say. Use null for anything not on the pages. Numbers are plain numbers in dollars or square feet. If a page shows several properties, use only the one that matches the email (same city, ZIP, price or details); if none clearly matches, set "samePropertyAsEmail" to false.

What the email gave: ${JSON.stringify({address:d.address,city:d.city,state:d.state,zip:d.zip,asking:curList(d),arv:d.arv,rehab:d.rehab,beds:d.beds,baths:d.baths,sqft:d.sqft,year:d.year})}

Reply with only JSON: {"samePropertyAsEmail":true|false,"address":"street address with the house number, or null","city":"","state":"","zip":"","asking":number|null,"arv":number|null,"rehab":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"rent":number|null,"occupancy":"vacant|occupied|unknown","description":"one or two sentences on condition and the pitch, or null","photoLinks":["direct image URLs of this house, at most 12"]}

${pages.map(p=>`Page: ${p.url}\nTitle: ${p.title}\n"""${String(p.text||'').slice(0,14000)}"""`).join('\n\n')}`;
function applyLinkPage(d,j,src){
  const filled=[];const num=k=>parseNum(j[k]);
  const street=String(j.address||'').trim();
  if(!hasStreet(d)&&hasStreet({address:street})){d.address=street;filled.push('address')}
  if(!d.city&&j.city){d.city=String(j.city);filled.push('city')}
  if(!/^\d{5}/.test(String(d.zip||''))&&/^\d{5}/.test(String(j.zip||''))){d.zip=String(j.zip).slice(0,5);filled.push('ZIP')}
  if(!d.state)d.state=String(j.state||'').trim().toUpperCase().slice(0,2)||zipState(d.zip)||'';
  if(/^\d{5}/.test(String(d.zip||''))&&zipState(d.zip)&&d.state!==zipState(d.zip)&&filled.includes('ZIP'))d.state=zipState(d.zip);
  const ask=num('asking');if(curList(d)==null&&ask){d.listPrice=ask;d.priceHistory=[{date:nowISO(),price:ask}];d.wsClaims=Object.assign({},d.wsClaims,{asking:ask});filled.push('price')}
  const arv=num('arv');if(d.arv==null&&arv){d.arv=arv;d.arvSource='wholesaler';d.wsClaims=Object.assign({},d.wsClaims,{arv});filled.push('ARV')}
  const reh=num('rehab');if(d.rehab==null&&reh){d.rehab=reh;d.wsClaims=Object.assign({},d.wsClaims,{rehab:reh});filled.push('repairs')}
  for(const [k,l] of [['beds','beds'],['baths','baths'],['sqft','sq ft'],['lotSqft','lot'],['year','year built'],['rent','rent']]){const v=num(k);if(d[k]==null&&v!=null){d[k]=v;filled.push(l)}}
  if(!d.description&&j.description){d.description=String(j.description);filled.push('description')}
  if(['vacant','occupied'].includes(j.occupancy)&&!(d.wsClaims||{}).occupancy)d.wsClaims=Object.assign({},d.wsClaims,{occupancy:j.occupancy});
  const ph=(Array.isArray(j.photoLinks)?j.photoLinks:[]).map(String).filter(u=>/^https:\/\//i.test(u)&&!/logo|icon|sprite|avatar|badge|favicon|placeholder|pixel|staticmap/i.test(u));
  const n=ph.length?addPhotoUrls(d.id,ph.slice(0,12)):0;if(n)filled.push(n+' photo'+(n>1?'s':''));
  return filled;
}
async function fillFromLinks(id,quiet,fresh){
  const d=state.deals[id];if(!d||d.example)return null;
  const links=dealLinks(d);
  if(!links.length){delete d.checking;d.linkFill={at:nowISO(),none:true};saveDeal(d,true);return d.linkFill}
  if(!gmailOn()){delete d.checking;d.linkFill={pending:true,needGmail:true};saveDeal(d,true);if(!quiet)toast('Connect Gmail first: Maya opens links through your Gmail script.',5200);return d.linkFill}
  if(state.busy['links:'+id])return null;
  state.busy['links:'+id]={label:`${negName()} is opening the links…`};render();
  let got;try{got=await openLinks(id,links.slice(0,4),{pagePhotos:false,fresh:fresh==null?!quiet:fresh})}catch(e){got={pages:[],blocked:[],photos:0,noAccess:[],why:{}}}finally{delete state.busy['links:'+id];render()}
  let dd=state.deals[id];if(!dd)return null;let filled=[],other=false;
  if(got.photos)filled.push(got.photos+' Drive photo'+(got.photos>1?'s':''));
  const zip5=String(dd.zip||'').slice(0,5),city=String(dd.city||'').toLowerCase(),ask=curList(dd);
  const about=p=>{const t=String(p.text||'');const lt=t.toLowerCase();
    if(p.redirectOnly){const slug=lt.replace(/[^a-z0-9]+/g,' ');return /\b\d+\s+[a-z]/.test(slug)&&((zip5&&slug.includes(zip5))||(city&&slug.includes(city.replace(/[^a-z0-9]+/g,' '))))}
    if(t.length<120)return false;
    return (zip5&&lt.includes(zip5))||(city&&lt.includes(city))||(ask&&(t.includes(String(ask))||t.includes(Number(ask).toLocaleString('en-US'))))||(!zip5&&!city&&!ask)};
  const useful=got.pages.filter(about).slice(0,2).map(p=>Object.assign({},p,{text:String(p.text).slice(0,8000)}));
  if(!useful.length&&got.pages.some(p=>!p.redirectOnly&&String(p.text||'').length>=120))other=true;
  const sig=(s=>{let x=0;for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return x.toString(36)})(useful.map(p=>p.url+':'+p.text).join('|'));const prevSig=(dd.linkFill||{}).sig;
  if(useful.length&&missingInfo(dd)&&aiOn()&&sig!==prevSig){
    const res=await runAI('links:'+id,`${negName()} is reading the property page…`,(ai,signal)=>ai.json(P_LINKPAGE(dd,useful),{signal,modelTier:'quick',maxTokens:2000}),true);
    dd=state.deals[id];if(!dd)return null;
    if(res&&res.samePropertyAsEmail===false)other=true;else if(res)filled=filled.concat(applyLinkPage(dd,res));
  }
  const tries=((dd.linkFill||{}).tries||0)+1;delete dd.checking;
  dd.linkFill={at:nowISO(),tries,sig,opened:got.pages.filter(p=>!p.redirectOnly).length,robot:got.blocked.filter(u=>got.why[u]==='robot_check').slice(0,6),blocked:got.blocked.filter(u=>!got.noAccess.includes(u)&&got.why[u]!=='robot_check').slice(0,6),noAccess:got.noAccess.slice(0,6),filled,other};
  saveDeal(dd,true);
  if(filled.length)logActivity(id,'info',`${negName()} opened the links for ${streetOf(dd.address)} and filled in: ${filled.join(', ')}.`);
  render();
  if(!quiet)toast(filled.length?`Filled in from the link: ${filled.join(', ')}.`:got.noAccess.length?'That Google Drive folder isn’t shared with you. Ask the wholesaler to share it.':got.pages.length?'Opened the link, but it didn’t add anything new.':'Couldn’t open the links (the site may block robots).',5200);
  return dd.linkFill;
}
function noAddrWhy(d){
  if(!d||d.example||hasStreet(d))return null;const lf=d.linkFill||{};const n=negName();
  if(state.busy['links:'+d.id]||checking(d))return {c:'purple',t:`${n} is opening the link`};
  if((lf.robot||[]).length)return {c:'amber',t:'Site wants a human: paste the address'};
  if(!dealLinks(d).length)return {c:'slate',t:'No link in the email'};
  if((lf.noAccess||[]).length)return {c:'amber',t:'Photo folder not shared'};
  if((lf.blocked||[]).length)return {c:'amber',t:'Link blocked: paste the address'};
  if(lf.at)return {c:'slate',t:'Link had no address'};
  return {c:'slate',t:`Waiting for ${n} to open the link`};
}
/* what happened when Maya opened the links, on the deal page (empty when there is nothing to say) */
function linkCard(d){
  if(d.example)return '';const lf=d.linkFill||{};const links=dealLinks(d);const n=esc(negName());const busy=state.busy['links:'+d.id];
  const short=u=>esc(String(u).replace(/^https?:\/\/(www\.)?/,'').slice(0,48));const out=[];
  const btn=label=>links.length?`<button class="btn sm" data-act="fill-links" ${busy||!aiOn()?'disabled':''}>${ico('link')}${label}</button>`:'';
  if(!hasStreet(d)&&!(lf.robot||[]).length)out.push(`<div class="note amber row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>No street address yet.</b> ${links.length?(lf.at?`${n} opened the links but didn’t find it. Ask the wholesaler, or type it into Details below.`:`${n} can open the link that came with this deal and fill it in.`):'The email didn’t include one or a link to the property. Ask the wholesaler, or type it into Details below.'}</span>${btn(lf.at?'Try the links again':'Open the links and fill it in')}</div>`);
  if(lf.pending&&!gmailOn())out.push(`<div class="note amber">Connect Gmail (Connect → Gmail) so ${n} can open this deal’s links. She opens them through your Gmail script.</div>`);
  if((lf.filled||[]).length)out.push(`<div class="note green small">${ico('check')} Filled in from the link: ${lf.filled.map(esc).join(', ')}.</div>`);
  if(lf.other)out.push(`<p class="xs muted">The page showed a different house, so nothing was copied from it.</p>`);
  if((lf.noAccess||[]).length)out.push(`<div class="note amber small"><b>Photo folder not shared with you:</b> ${lf.noAccess.map(short).join(' · ')}. Ask the wholesaler to share it with your Gmail or set it to “Anyone with the link”. ${n} tries again on her own, or press <span style="white-space:nowrap">${btn('Try the links again')}</span></div>`);
  if((lf.robot||[]).length&&!hasStreet(d))out.push(`<div class="note amber small"><b>The site asks to prove you’re human</b> (an “I’m not a robot” box). ${n} isn’t allowed to click those, so this one is on you: ${lf.robot.slice(0,2).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">open the ${lf.robot.length>1?['first','second'][i]+' ':''}link</a>`).join(' · ')}, then paste the address here.
    <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><input class="input" id="lk-addr" data-fd="address" placeholder="e.g. 1234 W 5th Ave" style="flex:1;min-width:200px" aria-label="Street address"></div></div>`);
  else if((lf.robot||[]).length)out.push(`<p class="xs muted">${lf.robot.length} link${lf.robot.length>1?'s':''} asked to prove you’re human, so ${n} skipped ${lf.robot.length>1?'them':'it'}.</p>`);
  if((lf.blocked||[]).length)out.push(`<p class="xs muted">Couldn’t open: ${lf.blocked.map(short).join(' · ')} (the site blocks robots or needs a login). Open it yourself and paste the details if they matter.</p>`);
  if(!out.length&&!busy)return '';
  return `<section class="card" id="links"><div class="card-head"><span class="ci blue">${ico('link')}</span><div><h2>${hasStreet(d)?'Links from the email':'No address yet · links from the email'}</h2><p>${links.length} link${links.length===1?'':'s'} · ${n} opens them, pulls Google Drive photos and fills in what the email left out</p></div></div>${busyHTML('links:'+d.id,false)}${out.join('')}</section>`;
}
/* after a deal comes in: open its links first, then research (so research has the address) */
const LQ={list:[],running:false};
function afterNewDeal(id){
  const d=state.deals[id];if(!d)return;
  const capR=boxCap();const p=curList(d);const inBox=!capR||p==null||p<=capR;
  if(inBox&&dealLinks(d).length&&!d.linkFill){
    if(!gmailOn()){d.linkFill={pending:true};saveDeal(d,true);return}
    if(missingInfo(d))d.checking=Date.now();
    if(WORKER.on){d.linkFill={pending:true};saveDeal(d,true);return}
    saveDeal(d,true);if(!LQ.list.includes(id))LQ.list.push(id);drainLinks();return}
  maybeResearch(id);
}
/* automatic research costs real money (big model + web searches), so it is rationed:
   only deals inside the buy box whose asking isn't already well over his ceiling, and at most dailyMax a day (default 3) */
function researchVerdict(d){
  const S=state.settings.research||{};if(!S.auto||!aiOn())return 'off';
  const capR=boxCap();const p=curList(d);if(capR&&p!=null&&p>capR)return 'over';
  if(!hasStreet(d))return 'address';
  const c=calc(d);if(c.ready&&p!=null&&c.mao&&p>c.mao*1.15)return 'price';
  const day=new Date().toISOString().slice(0,10);const used=(S.autoDay&&S.autoDay.day===day)?S.autoDay.n:0;
  if(used>=(S.dailyMax==null?3:+S.dailyMax))return 'cap';
  return 'ok';
}
function maybeResearch(id){const d=state.deals[id];if(!d||d.research||WORKER.on)return;
  const v=researchVerdict(d);if(v!=='ok'){if(v==='price'||v==='cap'||v==='address'){d.researchSkip=v;saveDeal(d,true)}return}
  const S=state.settings.research;const day=new Date().toISOString().slice(0,10);
  S.autoDay={day,n:((S.autoDay&&S.autoDay.day===day)?S.autoDay.n:0)+1};saveSettings();delete d.researchSkip;
  if(!RQ.list.includes(id))RQ.list.push(id);drainResearch()}
async function drainLinks(){if(LQ.running)return;LQ.running=true;try{while(LQ.list.length){const id=LQ.list.shift();const d=state.deals[id];if(d){const retry=!!(d.linkFill&&d.linkFill.at);await fillFromLinks(id,true,retry);if(state.deals[id]&&state.deals[id].checking){delete state.deals[id].checking;saveDeal(state.deals[id],true)}maybeResearch(id)}}}finally{LQ.running=false;render()}}
/* deals the 24/7 worker brought in, and older deals still missing a street address: open their links on this device */
const bridgeV=acctId=>+((acctInfo(acctId||(sendAcct()||{}).id)||{}).version||1);
const relinkKey=m=>bridgeV(m.acct)>=5?'relinked5':'relinked';
async function relinkEmails(ids){for(const id of ids){const m=state.mail.emails[id];const k=m&&relinkKey(m);if(!m||m[k])continue;m[k]=nowISO();
  if(k==='relinked5'){try{const r=await bridge('message',{id},m.acct||undefined);if(r&&r.body)m.body=r.body}catch(e){}}
  saveMail();try{await importEmail(id,true)}catch(e){}}}
function resumeLinks(){
  if(WORKER.on)return;
  if(!gmailOn()||!aiOn()){for(const d of Object.values(state.deals))if(d.checking){delete d.checking;saveDeal(d,true)}return}
  const reread=[];
  for(const d of Object.values(state.deals)){if(d.example||d.source!=='wholesaler'||!['new','sent'].includes(d.stage||'new')||overBox(d)){if(d.checking){delete d.checking;saveDeal(d,true)}continue}
    const lf=d.linkFill;const links=dealLinks(d).length;
    const due=lf&&lf.at&&(lf.tries||1)<3&&Date.now()-new Date(lf.at).getTime()>12*3600*1000&&(!hasStreet(d)||(lf.noAccess||[]).length);
    if(links&&((lf&&lf.pending)||d.checking||(!lf&&!hasStreet(d))||due)){if(!LQ.list.includes(d.id))LQ.list.push(d.id)}
    else{if(d.checking){delete d.checking;saveDeal(d,true)}
      if(!hasStreet(d)&&(!links||(lf&&lf.at)))for(const mid of d.seenMsgIds||[]){const m=state.mail.emails[mid];if(m&&m.body&&!m[relinkKey(m)]&&!reread.includes(mid))reread.push(mid)}}}
  drainLinks();
  if(reread.length)relinkEmails(reread.slice(0,10));
}
async function researchDeal(id,quiet,auto,opts){opts=opts||{};
  const d=state.deals[id];if(!d)return;if(!aiOn()){if(!quiet)toast(aiErr({code:'no_ai'}),5200);return}
  if(state.busy['research:'+id])return;
  const links=dealLinks(d);const before=photoCount(d);
  state.busy['research:'+id]={label:links.length&&gmailOn()?`${negName()} is opening the links…`:`${negName()} is researching ${streetOf(d.address)}…`};render();
  let got;try{got=await openLinks(id,links)}catch(e){got={pages:[],blocked:[],photos:0}}finally{delete state.busy['research:'+id]}
  const dd=state.deals[id];if(!dd)return;
  const res=await runAI('research:'+id,`${negName()} is researching ${streetOf(dd.address)}: history, comps and the numbers…`,(ai,signal)=>apiTools(promptResearch(dd,{links,pages:got.pages,blocked:got.blocked}),{signal,model:auto?undefined:(opts.model||bigModel()),maxTokens:auto?6000:9000,tools:auto?WEB_TOOLS(4):undefined}),quiet);
  if(!res)return;let j;try{j=parseLoose(res.text)}catch(e){if(!quiet)toast(aiErr(e),5200);return}
  const d2=state.deals[id];if(!d2)return;
  applyResearch(d2,j,res,got);
  saveDeal(d2);logActivity(id,'info',`${negName()} researched ${streetOf(d2.address)}: ${(j.comps||[]).length} comps, ${(j.history||[]).length} history events${got.photos?`, ${got.photos} photos from the links`:''}.`);
  const fresh=photoCount(d2)>before;
  if(!auto&&!opts.noDeep&&photoCount(d2)&&(fresh||!d2.analysis))await aiDeep(id,true);
  if(auto&&photoCount(d2)&&!d2.analysis)await aiDeep(id,true,secrets().model||'claude-sonnet-5-5');
  if(!quiet&&!opts.noDeep)toast(`Research done${got.photos?` · ${got.photos} photos pulled from the links`:''}.`,4200);
}
function applyResearch(d,j,res,got){
  const f=j.facts||{};for(const k of ['beds','baths','sqft','lotSqft','year']){const v=parseNum(f[k]);if(v!=null&&d[k]==null)d[k]=v}
  const hist=(Array.isArray(j.history)?j.history:[]).map(e=>({date:e.date?isoDay(e.date):'',event:HEV[e.event]?e.event:'other',price:parseNum(e.price),url:String(e.url||''),src:'web'})).filter(e=>e.date&&!isNaN(new Date(e.date)));
  d.history=d.history||[];for(const e of hist)if(!d.history.some(x=>isoDay(x.date)===e.date&&x.event===e.event))d.history.push(e);
  const have=new Set((d.comps||[]).map(x=>normAddr(x.addr)));const comps=(Array.isArray(j.comps)?j.comps:[]).filter(x=>parseNum(x.price)&&x.addr&&!have.has(normAddr(x.addr))&&normAddr(x.addr)!==normAddr(streetOf(d.address)));
  d.comps=(d.comps||[]).concat(comps.slice(0,12).map(x=>({addr:String(x.addr),price:parseNum(x.price),soldDate:x.soldDate?isoDay(x.soldDate):'',sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),dist:parseNum(x.dist),status:COMP_ST[x.status]?x.status:'sold',reno:x.reno===false?false:true,url:String(x.url||''),web:true})));
  const rv=j.rent&&parseNum(j.rent.value);if(rv&&!d.rent)d.rentEst=rv;
  const ra=j.arv&&parseNum(j.arv.value);
  if(ra&&(arvTheirs(d)||!d.arv||['maya','comps'].includes(d.arvSource))){if(arvTheirs(d)&&d.arv)d.wsClaims=Object.assign({},d.wsClaims,{arv:(d.wsClaims||{}).arv??d.arv});
    d.arv=floor500(ra);d.arvSource=(d.comps||[]).length?'comps':'maya';d.arvWhy=String(j.arv.why||'').slice(0,400);
    const g=compGrid(d);const used=g.rows.filter(r=>r.use).length;const gv=g.smart;
    if(used>=3&&gv&&Math.abs(gv-d.arv)/d.arv>0.10){const lo=Math.min(gv,d.arv);d.arvWhy=`${negName()} read ${money(floor500(ra))} from the comps; the comps math (size, beds and baths adjusted, ${used} renovated sales) says ${money(gv)}. Using the lower, ${money(lo)}, to be safe. `+d.arvWhy;d.arv=lo}}
  const sl=j.sellerLowest&&parseNum(j.sellerLowest.price);if(sl&&sl>0){const cur=parseNum((d.wsClaims||{}).accept);if(cur==null||sl<cur||(sl===cur&&!(d.wsClaims||{}).acceptQuote))d.wsClaims=Object.assign({},d.wsClaims,{accept:sl,acceptQuote:String(j.sellerLowest.quote||'').slice(0,200)})}
  d.research={at:nowISO(),summary:String(j.summary||''),claims:(j.claimsCheck||[]).slice(0,12).map(x=>({claim:String(x.claim||''),found:String(x.found||''),verdict:['matches','off','unverified'].includes(x.verdict)?x.verdict:'unverified'})),
    redFlags:(j.redFlags||[]).map(String).slice(0,10),arv:j.arv||null,rent:j.rent||null,couldNotOpen:[...new Set([...(j.couldNotOpen||[]).map(String),...(got.blocked||[]),...(res.failed||[]).map(x=>x.url)])].slice(0,8),
    sources:(res.sources||[]).slice(0,14),searches:res.searches||0,photos:got.photos||0,comps:comps.length,events:hist.length};
}
/* ================= In-depth analysis: Opus 5.5, only when you press it =================
   Photos from the emails and links, then Opus research (history, sold comps, its own ARV, the seller's lowest price),
   then an Opus inspection that prices every repair line with a reason. The numbers update from Maya's own work. */
async function inDepth(id){
  const d=state.deals[id];if(!d)return;if(!aiOn()){toast(aiErr({code:'no_ai'}),5200);return}
  const key='depth:'+id;if(state.busy[key])return;const n=negName();const before=spendBy(1).t;
  const step=l=>{state.busy[key]={label:l};render()};
  try{
    step(`${n} is gathering the photos from the emails and links…`);
    try{await pullDealAttachments(id,true)}catch(e){}
    if(gmailOn()&&dealLinks(state.deals[id]||{}).length){try{await fillFromLinks(id,true,true)}catch(e){}}
    step(`${n} is researching with Opus 5.5: sale history, sold comps and her own ARV…`);
    await researchDeal(id,true,false,{model:'claude-opus-5-5',noDeep:true});
    const pc=photoCount(state.deals[id]||{});
    step(pc?`${n} is inspecting ${pc} photo${pc>1?'s':''} with Opus 5.5 and pricing every repair…`:`${n} has no photos, so she’s estimating repairs from the description with Opus 5.5…`);
    await aiDeep(id,true,'claude-opus-5-5');
  }finally{delete state.busy[key];render()}
  const dd=state.deals[id];if(!dd)return;const c=calc(dd);const errs=state.aiErrs||{};
  const err=errs['research:'+id]||errs['deep:'+id]||null;
  dd.depth={at:nowISO(),arv:dd.arv,arvSource:dd.arvSource,arvWhy:dd.arvWhy||'',rehab:dd.rehab,rehabSource:dd.rehabSource,comps:(dd.comps||[]).filter(x=>x.web).length,photos:photoCount(dd),floor:c.floor,mao:c.mao,opening:c.opening,capByThem:!!c.capByThem,cost:+(spendBy(1).t-before).toFixed(4),err};
  saveDeal(dd);logActivity(id,'info',`${n} finished the in-depth analysis of ${streetOf(dd.address)} (about ${usd(dd.depth.cost)}).`);
  toast(err?`In-depth analysis partly done: ${err}`:`In-depth analysis done (${usd(dd.depth.cost)}). ARV ${money(dd.arv)}, repairs ${money(dd.rehab)}, ceiling ${money(c.mao)}, opening ${money(c.opening)}.`,8000);
}
function depthHTML(d){
  const D=d.depth;const n=esc(negName());const busy=state.busy['depth:'+d.id];if(!D&&!busy)return '';
  const c=calc(d);const comps=(d.comps||[]).filter(x=>x.web).length;
  return `<div class="depth">${busy?busyHTML('depth:'+d.id,false):''}${D?`<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><b>In-depth analysis</b><span class="xs muted">${fmtWhen(D.at)} · Opus 5.5 · cost ${usd(D.cost)}</span></div>
    <ul class="small" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
      <li><b>ARV ${money(d.arv)}</b> ${d.arvSource==='comps'?`from ${comps} sold comp${comps===1?'':'s'} (listed below)`:d.arvSource==='maya'?`${n}’s estimate (few good comps found)`:arvTheirs(d)?'is still the wholesaler’s claim: no usable comps found':'(your number)'}${d.arvWhy?`. ${esc(d.arvWhy)}`:''}${(d.wsClaims||{}).arv&&!arvTheirs(d)?` The wholesaler said ${money(d.wsClaims.arv)}.`:''}</li>
      <li><b>Repairs ${money(d.rehab)}</b> ${d.rehabSource==='maya'?`from ${D.photos?D.photos+' photo'+(D.photos>1?'s':''):'the description (no photos yet)'}, line by line in the inspection below`:rehabTheirs(d)?'is still the wholesaler’s claim':'(your number)'}</li>
      ${c.floor!=null&&(d.wsClaims||{}).accept?`<li><b>They’d take ${money(d.wsClaims.accept)}</b>${d.wsClaims.acceptQuote?`: “${esc(d.wsClaims.acceptQuote)}”`:''}</li>`:''}
      <li><b>Ceiling ${money(c.mao)}</b>${c.capByThem?` (capped at what they’d take; your numbers allow ${money(c.maoNumbers)})`:''} · <b>opening offer ${money(c.opening)}</b></li></ul>
    ${D.err?`<div class="note amber small">Part of it didn’t finish: ${esc(D.err)}</div>`:''}`:''}</div>`;
}
function researchCard(d){
  const R=d.research;const n=esc(negName());const busy=state.busy['research:'+d.id];const links=dealLinks(d);
  const vt={matches:['Matches','green'],off:['Off','red'],unverified:['Unverified','slate']};
  if(!R)return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>She opens the deal’s links, pulls the photos, finds the history and recent sales, and checks every number</p></div><div class="ch-r"><button class="btn primary" data-act="in-depth" ${busy||state.busy['depth:'+d.id]||!aiOn()?'disabled':''}>${ico('spark')}In-depth analysis (Opus)</button></div></div>${busyHTML('research:'+d.id)}${depthHTML(d)}
    ${d.researchSkip==='price'?`<p class="small">${n} didn’t research this one on her own: the asking is already well above your ceiling, so it isn’t worth paying for.</p>`:d.researchSkip==='cap'?`<p class="small">${n} skipped this one: she already did today’s ${(state.settings.research||{}).dailyMax??3} automatic researches. Press the button if you want it.</p>`:d.researchSkip==='address'&&!hasStreet(d)?`<p class="small">${n} will research this once it has a street address (research without one can’t find the history or nearby sales).</p>`:''}
    <p class="small muted">${links.length?`${links.length} link${links.length>1?'s':''} found with this deal${gmailOn()?'':' (connect Gmail so she can open Google Drive photo folders)'}. `:''}In-depth analysis uses Opus 5.5: it pulls the photos, finds the sale history and sold comps for its own ARV, and prices every repair from the photos. It takes a couple of minutes and roughly 50¢–$1; the meter shows the exact cost. Zillow and Realtor.com block robots, so for those she uses web search instead.</p></section>`;
  const arv=R.arv&&parseNum(R.arv.value);
  return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>${fmtWhen(R.at)} · ${R.sources.length} source${R.sources.length===1?'':'s'}${R.comps?` · ${R.comps} comps added`:''}${R.events?` · ${R.events} history events`:''}${R.photos?` · ${R.photos} photos`:''}</p></div><div class="ch-r"><button class="btn sm primary" data-act="in-depth" ${busy||state.busy['depth:'+d.id]?'disabled':''}>${ico('spark')}In-depth analysis (Opus)</button></div></div>${busyHTML('research:'+d.id)}${depthHTML(d)}
  ${R.summary?`<p>${esc(R.summary)}</p>`:''}
  ${arv?`<div class="row"><span class="chip">${n}’s ARV view <b>${money(arv)}</b>${R.arv.low?` (${moneyK(R.arv.low)}–${moneyK(R.arv.high)})`:''}</span>${R.arv.why?`<span class="small muted">${esc(R.arv.why)}</span>`:''}</div>`:''}
  ${R.claims.length?`<div class="tbl-wrap"><table class="tbl" style="min-width:620px"><thead><tr><th>They say</th><th>${n} found</th><th>Verdict</th></tr></thead><tbody>${R.claims.map(x=>`<tr style="cursor:default"><td>${esc(x.claim)}</td><td>${esc(x.found)}</td><td><span class="tag ${vt[x.verdict][1]}">${vt[x.verdict][0]}</span></td></tr>`).join('')}</tbody></table></div>`:''}
  ${R.redFlags.length?`<div class="note red"><b>Red flags:</b> ${R.redFlags.map(esc).join(' · ')}</div>`:''}
  ${R.couldNotOpen.length?`<p class="xs muted">Couldn’t open: ${R.couldNotOpen.map(u=>esc(u.replace(/^https?:\/\//,'').slice(0,60))).join(' · ')}. Paste the page text into the listing if it matters.</p>`:''}
  ${R.sources.length?`<details id="rs-src"><summary>Sources (${R.sources.length})</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${R.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title||s.url).slice(0,90))}</a></li>`).join('')}</ul></details>`:''}
  <p class="xs muted">Comps and history found online are marked as such. Check the important ones before you rely on them.</p></section>`;
}
/* new wholesaler deals get researched one at a time in the background */
const RQ={list:[],running:false};
function queueResearch(id){if(WORKER.on)return;/* web research is slow; the next device that opens does it */if(!RQ.list.includes(id))RQ.list.push(id);drainResearch()}
async function drainResearch(){if(RQ.running)return;RQ.running=true;try{while(RQ.list.length){const id=RQ.list.shift();if(state.deals[id])await researchDeal(id,true,true)}}finally{RQ.running=false}}
function askPhotosDraft(id){
  const d=state.deals[id];const a=d&&d.analysis;if(!a)return;const miss=(a.notSeen||[]).slice(0,6);if(!miss.length)return;
  const who=firstName(d);const n=state.settings.neg;const p=state.settings.profile;
  const body=`Hi ${who},\n\nThanks for sending ${streetOf(d.address)}. Before we put numbers on it, could you send photos of: ${miss.join(', ')}? That's what we need to price the repairs properly.\n\nThanks,\n${n.name}\n${n.title||'Acquisitions Manager'}${p.company?', '+p.company:''}${p.phone?'\n'+p.phone:''}`;
  setDraft(id,{kind:'custom',action:'custom',price:null,email:{subject:`Photos for ${streetOf(d.address)}?`,body},sms:`Hi ${who}, could you send photos of ${miss.slice(0,3).join(', ')} for ${streetOf(d.address)}? Thanks – ${n.name}`,why:`${negName()} couldn’t see these in the photos: ${miss.join(', ')}.`});
  state.mayaTab='chat';toast('Draft ready in the panel on the right.');
}
