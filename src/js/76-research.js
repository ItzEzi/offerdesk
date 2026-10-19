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
const SKIP_LINK=/unsubscribe|optout|opt-out|manage.?preferences|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com\/|tiktok\.com|youtube\.com\/(?:channel|@)|calendly\.com|mailto:|list-manage\.com\/(?:unsubscribe|profile)/i;
function dealLinks(d){
  const set=new Set();const add=u=>{u=String(u||'').trim().replace(/[)>.,;]+$/,'');if(/^https?:\/\/\S+$/i.test(u)&&!SKIP_LINK.test(u)&&u.length<500)set.add(u)};
  (d.links||[]).forEach(add);if(d.listingUrl)add(d.listingUrl);
  const first=(d.thread||[]).find(t=>t.dir==='in');if(first)(String(first.text||'').match(/https?:\/\/[^\s"'<>]+/g)||[]).forEach(add);
  return [...set].filter(u=>!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)).slice(0,6);
}
function promptResearch(d,ctx){
  const c=calc(d);const ws=d.wsClaims||{};const isWs=d.source==='wholesaler';
  const where=[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ');
  return `You are ${negName()}, an acquisitions analyst for a real estate investor (flips, BRRRR, wholesale). Research this property so the investor knows everything that matters before making an offer. Use web search, and open the links below with web fetch when useful. Use only what you actually find, and name the source for each fact. If a site blocks you, say so and use search instead. Do not guess.

Property: ${where||'unknown address'}
${isWs?`A wholesaler sent this deal. Their claims: asking ${money(ws.asking??curList(d))}, ARV ${money(ws.arv)}, repairs ${money(ws.rehab)}, rent ${money(ws.rent)}${ws.terms?', terms: '+ws.terms:''}.`:`Listed at ${money(curList(d))}.`} Beds/baths/sqft/year on file: ${d.beds??'?'} / ${d.baths??'?'} / ${d.sqft??'?'} / ${d.year??'?'}.
${(d.description||'').slice(0,1200)}
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
Our current ARV on file is ${money(c.A)}; give your own view of ARV from the comps.

Finish with only this JSON (no text after it):
{"facts":{"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other|null","source":"url"},
"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null,"url":"source url"}],
"comps":[{"addr":"street, city","price":number,"soldDate":"YYYY-MM-DD","sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"status":"sold|for_sale|pending","reno":true|false|null,"url":""}],
"rent":{"value":number|null,"why":"one sentence","source":"url"},
"arv":{"value":number|null,"low":number|null,"high":number|null,"why":"one or two sentences"},
"claimsCheck":[{"claim":"what they say","found":"what you found","verdict":"matches|off|unverified"}],
"redFlags":["..."],"couldNotOpen":["urls you could not read"],
"summary":"three or four plain sentences for the investor: is this worth pursuing and why"}`;
}
async function openLinks(id,links){
  const d=state.deals[id];const pages=[],blocked=[];let photos=0;if(!gmailOn()||!links.length)return {pages,blocked,photos};
  for(const u of links.slice(0,5)){
    let r;try{r=await bridge('fetch_url',{url:u})}catch(e){blocked.push(u);continue}
    if(r.kind==='blocked'){blocked.push(u);continue}
    if((r.kind==='drive_folder'||r.kind==='drive_file')&&(r.images||[]).length){
      const blobs=[];for(const im of r.images.slice(0,Math.max(0,16-photoCount(state.deals[id])))){try{const x=await bridge('drive_image',{id:im.id});if(x.data)blobs.push(b64ToBlob(x.data,x.type))}catch(e){}}
      if(blobs.length)photos+=await addPhotoBlobs(id,blobs,'link');continue}
    if(r.kind==='image'){photos+=addPhotoUrls(id,[u]);continue}
    if(r.kind==='page'){if(r.text)pages.push({url:u,title:r.title||'',text:r.text});
      const imgs=(r.images||[]).filter(x=>!/logo|icon|sprite|avatar|badge|favicon|placeholder|pixel|banner|staticmap|maps\.googleapis/i.test(x));
      if(imgs.length&&photoCount(state.deals[id])<6)photos+=addPhotoUrls(id,imgs.slice(0,12))}
  }
  return {pages,blocked,photos};
}
async function researchDeal(id,quiet){
  const d=state.deals[id];if(!d)return;if(!aiOn()){if(!quiet)toast(aiErr({code:'no_ai'}),5200);return}
  if(state.busy['research:'+id])return;
  const links=dealLinks(d);const before=photoCount(d);
  state.busy['research:'+id]={label:links.length&&gmailOn()?`${negName()} is opening the links…`:`${negName()} is researching ${streetOf(d.address)}…`};render();
  let got;try{got=await openLinks(id,links)}catch(e){got={pages:[],blocked:[],photos:0}}finally{delete state.busy['research:'+id]}
  const dd=state.deals[id];if(!dd)return;
  const res=await runAI('research:'+id,`${negName()} is researching ${streetOf(dd.address)}: history, comps and the numbers…`,(ai,signal)=>apiTools(promptResearch(dd,{links,pages:got.pages,blocked:got.blocked}),{signal,model:bigModel(),maxTokens:9000}),quiet);
  if(!res)return;let j;try{j=parseLoose(res.text)}catch(e){if(!quiet)toast(aiErr(e),5200);return}
  const d2=state.deals[id];if(!d2)return;
  applyResearch(d2,j,res,got);
  saveDeal(d2);logActivity(id,'info',`${negName()} researched ${streetOf(d2.address)}: ${(j.comps||[]).length} comps, ${(j.history||[]).length} history events${got.photos?`, ${got.photos} photos from the links`:''}.`);
  const fresh=photoCount(d2)>before;
  if(photoCount(d2)&&(fresh||!d2.analysis))await aiDeep(id,true);
  if(!quiet)toast(`Research done${got.photos?` · ${got.photos} photos pulled from the links`:''}.`,4200);
}
function applyResearch(d,j,res,got){
  const f=j.facts||{};for(const k of ['beds','baths','sqft','lotSqft','year']){const v=parseNum(f[k]);if(v!=null&&d[k]==null)d[k]=v}
  const hist=(Array.isArray(j.history)?j.history:[]).map(e=>({date:e.date?isoDay(e.date):'',event:HEV[e.event]?e.event:'other',price:parseNum(e.price),url:String(e.url||''),src:'web'})).filter(e=>e.date&&!isNaN(new Date(e.date)));
  d.history=d.history||[];for(const e of hist)if(!d.history.some(x=>isoDay(x.date)===e.date&&x.event===e.event))d.history.push(e);
  const have=new Set((d.comps||[]).map(x=>normAddr(x.addr)));const comps=(Array.isArray(j.comps)?j.comps:[]).filter(x=>parseNum(x.price)&&x.addr&&!have.has(normAddr(x.addr))&&normAddr(x.addr)!==normAddr(streetOf(d.address)));
  d.comps=(d.comps||[]).concat(comps.slice(0,12).map(x=>({addr:String(x.addr),price:parseNum(x.price),soldDate:x.soldDate?isoDay(x.soldDate):'',sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),dist:parseNum(x.dist),status:COMP_ST[x.status]?x.status:'sold',reno:x.reno===false?false:true,url:String(x.url||''),web:true})));
  const rv=j.rent&&parseNum(j.rent.value);if(rv&&!d.rent)d.rentEst=rv;
  d.research={at:nowISO(),summary:String(j.summary||''),claims:(j.claimsCheck||[]).slice(0,12).map(x=>({claim:String(x.claim||''),found:String(x.found||''),verdict:['matches','off','unverified'].includes(x.verdict)?x.verdict:'unverified'})),
    redFlags:(j.redFlags||[]).map(String).slice(0,10),arv:j.arv||null,rent:j.rent||null,couldNotOpen:[...new Set([...(j.couldNotOpen||[]).map(String),...(got.blocked||[]),...(res.failed||[]).map(x=>x.url)])].slice(0,8),
    sources:(res.sources||[]).slice(0,14),searches:res.searches||0,photos:got.photos||0,comps:comps.length,events:hist.length};
}
function researchCard(d){
  const R=d.research;const n=esc(negName());const busy=state.busy['research:'+d.id];const links=dealLinks(d);
  const vt={matches:['Matches','green'],off:['Off','red'],unverified:['Unverified','slate']};
  if(!R)return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>She opens the deal’s links, pulls the photos, finds the history and recent sales, and checks every number</p></div><div class="ch-r"><button class="btn primary" data-act="research" ${busy||!aiOn()?'disabled':''}>${ico('spark')}Research this deal</button></div></div>${busyHTML('research:'+d.id)}
    <p class="small muted">${links.length?`${links.length} link${links.length>1?'s':''} found with this deal${gmailOn()?'':' (connect Gmail so she can open Google Drive photo folders)'}. `:''}Takes about a minute and usually costs 10–30¢ on your Anthropic account. Zillow and Realtor.com block robots, so for those she uses web search instead.</p></section>`;
  const arv=R.arv&&parseNum(R.arv.value);
  return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>${fmtWhen(R.at)} · ${R.sources.length} source${R.sources.length===1?'':'s'}${R.comps?` · ${R.comps} comps added`:''}${R.events?` · ${R.events} history events`:''}${R.photos?` · ${R.photos} photos`:''}</p></div><div class="ch-r"><button class="btn sm" data-act="research" ${busy?'disabled':''}>${ico('refresh')}Run again</button></div></div>${busyHTML('research:'+d.id)}
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
async function drainResearch(){if(RQ.running)return;RQ.running=true;try{while(RQ.list.length){const id=RQ.list.shift();if(state.deals[id])await researchDeal(id,true)}}finally{RQ.running=false}}
function askPhotosDraft(id){
  const d=state.deals[id];const a=d&&d.analysis;if(!a)return;const miss=(a.notSeen||[]).slice(0,6);if(!miss.length)return;
  const who=firstName(d);const n=state.settings.neg;const p=state.settings.profile;
  const body=`Hi ${who},\n\nThanks for sending ${streetOf(d.address)}. Before we put numbers on it, could you send photos of: ${miss.join(', ')}? That's what we need to price the repairs properly.\n\nThanks,\n${n.name}\n${n.title||'Acquisitions Manager'}${p.company?', '+p.company:''}${p.phone?'\n'+p.phone:''}`;
  setDraft(id,{kind:'custom',action:'custom',price:null,email:{subject:`Photos for ${streetOf(d.address)}?`,body},sms:`Hi ${who}, could you send photos of ${miss.slice(0,3).join(', ')} for ${streetOf(d.address)}? Thanks – ${n.name}`,why:`${negName()} couldn’t see these in the photos: ${miss.join(', ')}.`});
  state.mayaTab='chat';toast('Draft ready in the panel on the right.');
}
