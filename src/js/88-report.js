/* ================= Lender-style deal report (print / PDF / email) ================= */
const lenderSet=()=>Object.assign({purchasePct:90,rehabPct:100,points:2,rate:11,termMonths:12,maxLtv:70,dscrRate:7.5,experience:''},state.settings.lender||{});
function reportPrice(d,c){const r=d.report||{};return r.price??d.contractPrice??lastOurPrice(d)??(c.ready?c.opening:null)??curList(d)}
function lenderNums(d){
  const c=calc(d);const s=state.settings.buy;const L=Object.assign(lenderSet(),(d.report||{}).loan||{});
  const P=reportPrice(d,c)||0,R=d.rehab||0,A=c.A||0,months=(d.report&&d.report.months)||s.holdMonths||5;
  const buy=Math.round(P*(s.buyCostPct||0)/100),hold=Math.round((s.holdCostMonthly||0)*months);
  const want=P*L.purchasePct/100+R*L.rehabPct/100,cap=A?A*L.maxLtv/100:Infinity;const loan=Math.max(0,round500(Math.min(want,cap)));const capped=want>cap;
  const points=Math.round(loan*L.points/100),interest=Math.round(loan*L.rate/100*months/12);
  const total=P+buy+R+hold+points+interest,cash=total-loan;const sell=Math.round(A*(s.sellCostPct||0)/100);const profit=A-sell-total;
  const roi=cash>0?profit/cash:null;const ann=roi!=null&&months?roi*12/months:null;
  const at=(dA,dR,dM)=>{const a=A*(1+dA),r=R*(1+dR),m=months+dM;const i=Math.round(loan*L.rate/100*m/12),h=Math.round((s.holdCostMonthly||0)*m);const t=P+buy+r+h+points+i;return Math.round(a-a*(s.sellCostPct||0)/100-t)};
  const stress=[['ARV 10% lower',at(-.1,0,0)],['Rehab 20% over budget',at(0,.2,0)],['3 extra months',at(0,0,3)],['All three',at(-.1,.2,3)]];
  const rc=rentalCalc(d,c,P);const dscr=rc&&rc.piti?rc.rent/rc.piti:null;
  const breakeven=A?Math.round(total+sell):null;/* ARV the deal needs to break even */
  return {c,L,P,R,A,months,buy,hold,loan,capped,points,interest,total,cash,sell,profit,roi,ann,ltc:P+R?loan/(P+R):null,ltv:A?loan/A:null,stress,rc,dscr,breakeven,beDrop:A&&breakeven?1-breakeven/A:null};
}
function reportRisks(d,n){
  const out=[];const g=compGrid(d);const sig=marketSignal(d);const m=marketFor(d);const l=m&&m.Z&&m.Z.l;
  if(!g.used.length)out.push(['ARV has no sold comps behind it','Add 3+ renovated sold comps within a mile before closing.']);
  else if(g.conf==='low')out.push([`ARV confidence is low (${g.used.length} comp${g.used.length>1?'s':''})`,'Get a broker opinion of value or an appraisal before the rehab draw schedule.']);
  if(n.beDrop!=null&&n.beDrop<.08)out.push([`Thin cushion: the deal breaks even if the ARV is ${pct(n.beDrop,0)} lower`,'Negotiate the price down or trim the scope.']);
  if(n.R&&n.A&&n.R/n.A>.35)out.push(['Heavy rehab relative to value','Line-item bids from two contractors and a 10–15% contingency.']);
  if(d.analysis&&(d.analysis.notSeen||[]).length)out.push([`Not inspected from photos: ${d.analysis.notSeen.slice(0,4).join(', ')}`,'Covered by allowances in the budget; confirm at the walkthrough or inspection.']);
  if(sig)out.push([sig.level==='rejection'?'The market has rejected this listing (cuts and long days on market)':'Stale listing','Supports the discount; price the resale conservatively.']);
  if(l&&l.mos!=null&&l.mos>=6)out.push([`Slow ZIP: ${l.mos} months of supply`,'Plan for a longer sale; budget extra holding months.']);
  if(l&&l.priceYoy!=null&&l.priceYoy<=-4)out.push([`ZIP prices down ${Math.abs(l.priceYoy)}% over a year`,'Use the low end of the comps for the ARV.']);
  if(n.dscr!=null&&n.dscr<1.1)out.push([`Rental exit is tight (DSCR ${n.dscr.toFixed(2)})`,'Flip is the primary exit; the rental is a fallback only.']);
  return out;
}
function promptLender(d,n){
  const c=n.c;const g=compGrid(d);
  return `Write the summary section of a lender package for a short-term (hard money) loan. The reader is a private or hard money lender deciding whether to fund it. Be factual and specific, no hype, plain US English.
${dealFacts(d,c)}
Loan: purchase ${money(n.P)}, rehab ${money(n.R)}, loan ${money(n.loan)} (${pct(n.ltc,0)} of cost, ${pct(n.ltv,0)} of ARV), ${n.L.rate}% + ${n.L.points} points, ${n.months} months. Borrower cash in: ${money(n.cash)}.
Exit: resale at ${money(n.A)}, profit ${money(n.profit)} (${pct(n.roi,0)} on cash). Breakeven ARV ${money(n.breakeven)}. ${n.rc?`Rent ${money(n.rc.rent)}/mo, refi ${money(n.rc.refi)}, DSCR ${n.dscr?n.dscr.toFixed(2):'?'}.`:''}
Comps used: ${g.used.length}, confidence ${g.conf||'none'}.${(()=>{const m=marketFacts(d);return m?' '+m:''})()}
Borrower: ${state.settings.profile.name||''}${state.settings.profile.company?', '+state.settings.profile.company:''}. Experience: ${lenderSet().experience||'not stated'}.
Reply with only JSON: {"summary":"3-4 sentences: the property, the plan, why the numbers work","exitPlan":"2 sentences: primary exit and backup exit","risks":[{"risk":"","mitigant":""}],"timeline":[{"step":"","weeks":"e.g. 0-2"}]}`;
}
async function aiLenderMemo(id){
  const d=state.deals[id];if(!d)return;const n=lenderNums(d);
  const res=await runAI('rep:'+id,`${negName()} is writing the lender summary…`,(ai,signal)=>ai.json(promptLender(d,n),{signal,model:bigModel(),maxTokens:3000}));
  if(!res||!state.deals[id])return;const dd=state.deals[id];
  dd.lenderMemo={at:nowISO(),summary:String(res.summary||''),exitPlan:String(res.exitPlan||''),risks:(Array.isArray(res.risks)?res.risks:[]).slice(0,8).map(r=>({risk:String(r.risk||''),mitigant:String(r.mitigant||'')})),timeline:(Array.isArray(res.timeline)?res.timeline:[]).slice(0,8).map(t=>({step:String(t.step||''),weeks:String(t.weeks||'')}))};
  saveDeal(dd);
}
async function reportPhotos(d,max){const out=[];for(const pid of (d.photoIds||[]).slice(0,max)){try{const r=await IDB.get('photos',pid);if(r&&r.blob)out.push({src:photoObjURL[pid]||URL.createObjectURL(r.blob),blob:r.blob,id:pid})}catch(e){}}for(const u of (d.photoUrls||[]).slice(0,Math.max(0,max-out.length)))out.push({src:u,url:u});return out}
/* the report body (used on screen, for print, and for the lender email) */
function reportBodyHTML(d,photos,forEmail){
  const n=lenderNums(d);const c=n.c;const p=state.settings.profile;const g=compGrid(d);const M=d.lenderMemo;const m=marketFor(d);const l=m&&m.Z&&m.Z.l;
  const img=(ph,i)=>forEmail?(ph.url?`<img src="${esc(ph.url)}" alt="" style="width:100%;border-radius:8px">`:`<img src="cid:ph${i}" alt="" style="width:100%;border-radius:8px">`):`<img src="${esc(ph.src)}" alt="">`;
  const kv=rows=>`<table class="rt">${rows.filter(Boolean).map(([a,b,strong])=>`<tr><td>${a}</td><td class="r">${strong?'<b>'+b+'</b>':b}</td></tr>`).join('')}</table>`;
  const ins=historyInsights(d);const ev=histEvents(d);const lines=d.rehabLines||[];const sub=lines.reduce((s,x)=>s+(x.cost||0),0);
  const risks=[...(M&&M.risks?M.risks.map(r=>[r.risk,r.mitigant]):[]),...reportRisks(d,n)];
  return `<div class="rep">
  <header class="rep-head"><div><div class="rep-kicker">Loan request · deal summary</div><h1>${esc(streetOf(d.address))}</h1><div class="rep-sub">${esc([d.city,d.state,d.zip].filter(Boolean).join(', '))} · ${PROP_TYPES[d.propertyType]||'Single family'} · ${d.beds??'?'} bd / ${d.baths??'?'} ba · ${d.sqft?numFmt(d.sqft)+' sqft':''}${d.year?' · built '+d.year:''}</div></div>
    <div class="rep-by"><b>${esc(p.name||'')}</b>${p.company?'<br>'+esc(p.company):''}${p.phone?'<br>'+esc(p.phone):''}${p.email?'<br>'+esc(p.email):''}<br><span class="muted">${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</span></div></header>
  ${photos.length?`<div class="rep-cover">${img(photos[0],0)}</div>`:''}
  <section class="rep-ask"><div class="rep-tiles">${[['Loan request',money(n.loan),n.capped?`capped at ${n.L.maxLtv}% of ARV`:`${n.L.purchasePct}% of purchase + ${n.L.rehabPct}% of rehab`],['Purchase',money(n.P),''],['Rehab budget',money(n.R),lines.length?`${lines.length} line items`:''],['ARV',money(n.A),g.used.length?`${g.used.length} sold comps · ${g.conf||''} confidence`:''],['Loan to cost',pct(n.ltc,0),''],['Loan to ARV',pct(n.ltv,0),''],['Borrower cash in',money(n.cash),''],['Projected profit',money(n.profit),n.roi!=null?`${pct(n.roi,0)} on cash · ${n.months} months`:'']].map(([a,b,s])=>`<div class="rep-tile"><span>${a}</span><b>${b}</b>${s?`<em>${s}</em>`:''}</div>`).join('')}</div></section>
  ${M&&M.summary?`<section><h2>Summary</h2><p>${esc(M.summary)}</p>${M.exitPlan?`<p><b>Exit:</b> ${esc(M.exitPlan)}</p>`:''}</section>`:''}
  <section class="rep-2"><div><h2>Sources and uses</h2>${kv([['Purchase price',money(n.P)],['Closing costs (buy)',money(n.buy)],['Rehab',money(n.R)],[`Holding (${n.months} mo)`,money(n.hold)],[`Points (${n.L.points}%)`,money(n.points)],[`Interest (${n.L.rate}%, ${n.months} mo)`,money(n.interest)],['Total project cost',money(n.total),1],['Loan',money(n.loan)],['Borrower cash',money(n.cash),1]])}</div>
    <div><h2>Exit</h2>${kv([['Resale (ARV)',money(n.A)],[`Selling costs (${state.settings.buy.sellCostPct}%)`,'−'+money(n.sell)],['Total project cost','−'+money(n.total)],['Profit',money(n.profit),1],['Return on cash',pct(n.roi,0)],['Annualized',pct(n.ann,0)],['Breakeven resale price',money(n.breakeven)],['Cushion before a loss',pct(n.beDrop,0)]])}
    ${n.rc?`<h3>Backup exit: rent and refinance</h3>${kv([['Market rent',money(n.rc.rent)+'/mo'],[`Refi at ${state.settings.rental.refiLtv}% of ARV`,money(n.rc.refi)],['Pays off the loan',n.rc.refiNet!=null&&n.rc.refiNet>=n.loan?'Yes':'No ('+money(n.loan-(n.rc.refiNet||0))+' short)'],['Monthly payment + taxes/insurance',money(n.rc.piti)],['DSCR (rent ÷ PITI)',n.dscr?n.dscr.toFixed(2):'—',1],['Cash flow after refi',money(n.rc.cfRefi)+'/mo']])}`:''}</div></section>
  <section><h2>Stress test</h2><table class="rt rt-wide"><thead><tr><th>Scenario</th><th class="r">Profit</th></tr></thead><tbody><tr><td>Base case</td><td class="r"><b>${money(n.profit)}</b></td></tr>${n.stress.map(([a,v])=>`<tr><td>${a}</td><td class="r" style="color:${v<0?'var(--t-red,#B42318)':'inherit'}">${money(v)}</td></tr>`).join('')}</tbody></table></section>
  ${g.rows.length?`<section><h2>Comparable sales</h2><p class="muted small">ARV ${money(n.A)}${d.arvSource==='comps'?' from the weighted comps':''}. Adjustments: size at 40% of $/sqft, ±3% per bedroom, ±4% per bathroom.</p>
    <table class="rt rt-wide"><thead><tr><th>Address</th><th>Sold</th><th class="r">Price</th><th class="r">Sqft</th><th class="r">$/sqft</th><th class="r">Distance</th><th class="r">Adjusted</th><th class="r">Match</th></tr></thead><tbody>${g.rows.filter(r=>r.st==='sold').slice(0,8).map(r=>`<tr${r.use?'':' class="muted"'}><td>${esc(r.x.addr)}${r.reno?'':' <em>(as-is)</em>'}</td><td>${esc(fmtDate(r.x.soldDate))}</td><td class="r">${money(r.price)}</td><td class="r">${numFmt(r.x.sqft)}</td><td class="r">${r.psf?'$'+Math.round(r.psf):'—'}</td><td class="r">${r.x.dist!=null?r.x.dist+' mi':'—'}</td><td class="r">${money(r.adjPrice)}</td><td class="r">${r.match}%</td></tr>`).join('')}</tbody></table>
    ${!forEmail&&d.lat&&g.used.length?`<div class="rep-map">${compMapSVG(d,g)}</div>`:''}</section>`:''}
  ${lines.length?`<section><h2>Scope of work</h2><table class="rt rt-wide"><thead><tr><th>Item</th><th>Detail</th><th class="r">Cost</th></tr></thead><tbody>${lines.map(x=>`<tr><td>${esc(x.item)}</td><td class="muted">${esc(x.detail||'')}</td><td class="r">${money(x.cost)}</td></tr>`).join('')}<tr><td colspan="2">Contingency (${d.rehabCont??10}%)</td><td class="r">${money(Math.round(sub*(d.rehabCont??10)/100))}</td></tr><tr><td colspan="2"><b>Total</b></td><td class="r"><b>${money(Math.round(sub*(1+(d.rehabCont??10)/100)))}</b></td></tr></tbody></table>${d.analysis&&d.analysis.summary?`<p class="small"><b>Condition:</b> ${esc(d.analysis.summary)}</p>`:''}</section>`:''}
  ${M&&M.timeline&&M.timeline.length?`<section><h2>Timeline</h2><table class="rt rt-wide"><tbody>${M.timeline.map(t=>`<tr><td>${esc(t.step)}</td><td class="r">${esc(t.weeks)} wk</td></tr>`).join('')}</tbody></table></section>`:''}
  <section class="rep-2"><div><h2>Market</h2>${l?kv([[`ZIP ${m.zip} median sale`,money(l.price)+(l.priceYoy!=null?` (${l.priceYoy>=0?'+':''}${l.priceYoy}% yr)`:'')],['Median $/sqft',l.ppsf?'$'+l.ppsf:'—'],['Median days on market',l.dom??'—'],['Months of supply',l.mos??'—'],['Homes sold (3 mo)',l.sold??'—']]).replace('</table>',`</table><p class="muted small">Redfin, single-family, 3 months to ${esc(m.S.zips.periodEnd||'')}.</p>`):'<p class="muted small">No ZIP market data loaded.</p>'}</div>
    <div><h2>Property history</h2>${ev.length?`<table class="rt">${ev.slice(-6).reverse().map(e=>`<tr><td>${esc(fmtDate(e.date))}</td><td>${esc((HEV[e.event]||HEV.other)[0])}</td><td class="r">${money(e.price)}</td></tr>`).join('')}</table>`:'<p class="muted small">No history on file.</p>'}${ins.length?`<ul class="small">${ins.map(x=>`<li>${esc(x.text)}</li>`).join('')}</ul>`:''}</div></section>
  <section><h2>Risks and how they’re handled</h2><table class="rt rt-wide"><tbody>${risks.map(([a,b])=>`<tr><td>${esc(a)}</td><td class="muted">${esc(b)}</td></tr>`).join('')||'<tr><td>No major risks flagged by the numbers.</td></tr>'}</tbody></table></section>
  ${photos.length>1?`<section><h2>Photos</h2><div class="rep-photos">${photos.slice(1,9).map((ph,i)=>img(ph,i+1)).join('')}</div></section>`:''}
  <section><h2>Borrower</h2><p>${esc(p.name||'')}${p.company?', '+esc(p.company):''}. ${esc(lenderSet().experience||'')}</p></section>
  <p class="rep-foot">Prepared by the borrower from public records, listing data and their own estimates. Not an appraisal. Figures are projections and should be verified.</p></div>`;
}
function viewReport(){
  const d=state.deals[state.dealId];if(!d)return '<div class="wrap page"><p>Deal not found.</p></div>';
  const n=lenderNums(d);const L=n.L;const busy=state.busy['rep:'+d.id]||state.busy['repmail:'+d.id];
  if(!state.repPhotos||state.repPhotos.id!==d.id){state.repPhotos={id:d.id,list:[]};reportPhotos(d,9).then(list=>{if(state.repPhotos&&state.repPhotos.id===d.id){state.repPhotos.list=list;render()}})}
  if(!d.lat&&(d.comps||[]).length)geocodeDeal(d).then(ok=>{if(ok){saveDeal(d,true);render()}});
  const field=(k,l,v)=>`<label class="field"><span>${l}</span><input class="input tnum" data-fd="report.loan.${k}" data-t="num" value="${v??''}" inputmode="decimal"></label>`;
  const panel=`<section class="card no-print rep-panel"><div class="card-head"><span class="ci blue">${ico('doc')}</span><div><h2>Lender report</h2><p>Set the loan terms, add ${esc(negName())}’s summary, then save as PDF or email it</p></div>
    <div class="ch-r"><a class="btn ghost sm" href="#deal/${d.id}">${ico('back')}Back to deal</a></div></div>
    <div class="cp-grid"><label class="field"><span>Purchase price</span><input class="input tnum" data-fd="report.price" data-t="num" value="${(d.report||{}).price??''}" placeholder="${n.P||''}" inputmode="numeric"></label>
    ${field('purchasePct','Loan % of purchase',L.purchasePct)}${field('rehabPct','Loan % of rehab',L.rehabPct)}${field('maxLtv','Max % of ARV',L.maxLtv)}${field('rate','Rate %',L.rate)}${field('points','Points',L.points)}
    <label class="field"><span>Months</span><input class="input tnum" data-fd="report.months" data-t="num" value="${(d.report||{}).months??''}" placeholder="${state.settings.buy.holdMonths||5}" inputmode="numeric"></label></div>
    <label class="field" style="margin-top:8px"><span>Your experience, for lenders (saved for every report)</span><input class="input" data-fs="lender.experience" data-t="text" value="${esc(lenderSet().experience)}" placeholder="e.g. Second flip; working with a licensed GC; 25% down ready"></label>
    <div class="row" style="gap:8px;margin-top:10px">${aiOn()?`<button class="btn sm" data-act="rep-ai" ${busy?'disabled':''}>${ico('spark')}${d.lenderMemo?'Rewrite':'Write'} the summary</button>`:''}<button class="btn primary sm" data-act="rep-print">${ico('download')}Save as PDF / print</button>
    ${gmailOn()?`<input class="input" id="rep-to" data-draft value="${esc(state.drafts['rep-to']||'')}" placeholder="lender@email.com" style="max-width:240px" inputmode="email" aria-label="Lender email"><button class="btn sm" data-act="rep-mail" ${busy?'disabled':''}>${ico('mail')}Email it</button>`:''}</div>
    ${busyHTML('rep:'+d.id)}${busyHTML('repmail:'+d.id,false)}${!c_ready(d)?`<div class="note amber">Add an ARV on the deal first.</div>`:''}</section>`;
  return `<div class="wrap page rep-page"><style>${REPORT_CSS}</style>${panel}<article class="card rep-card">${reportBodyHTML(d,(state.repPhotos&&state.repPhotos.list)||[],false)}</article></div>`;
}
const c_ready=d=>calc(d).ready;
const REPORT_CSS=`.rep{font-family:Arial,Helvetica,sans-serif;color:#141A2E;font-size:13px;line-height:1.45}.rep h1{font-size:24px;margin:2px 0}.rep h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #E4E7F0;padding-bottom:4px}.rep h3{font-size:13px;margin:12px 0 4px}
.rep-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.rep-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3E5BF6}.rep-sub{color:#566080}.rep-by{text-align:right;font-size:12px}
.rep-cover img{width:100%;max-height:340px;object-fit:cover;border-radius:10px;margin:12px 0}
.rep-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.rep-tile{border:1px solid #E4E7F0;border-radius:10px;padding:9px 11px;display:grid;gap:2px}.rep-tile span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#667090}.rep-tile b{font-size:18px}.rep-tile em{font-style:normal;font-size:11px;color:#667090}
.rep-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
.rt{width:100%;border-collapse:collapse}.rt td,.rt th{padding:5px 6px;border-bottom:1px solid #EEF0F6;text-align:left;vertical-align:top}.rt th{font-size:11px;color:#667090}.rt .r{text-align:right;white-space:nowrap}.rt tr.muted td{color:#98A0B8}
.rep-photos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.rep-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px}
.rep-map svg{max-width:100%;height:auto}.rep .muted{color:#667090}.rep .small{font-size:12px}.rep-foot{font-size:11px;color:#98A0B8;margin-top:18px}`;
async function emailReport(id){
  const d=state.deals[id];const to=(state.drafts['rep-to']||'').trim();if(!d)return;
  if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)){toast('Add the lender’s email first.');return}
  const key='repmail:'+id;state.busy[key]={label:'Emailing the report…'};render();
  try{
    const photos=await reportPhotos(d,9);const inline={};let i=0;
    for(const ph of photos){if(ph.blob){inline['ph'+i]={type:ph.blob.type||'image/jpeg',data:await blobToB64(ph.blob)}}i++}
    const body=reportBodyHTML(d,photos,true);const p=state.settings.profile;
    const html=`<div style="max-width:820px;margin:0 auto"><style>${REPORT_CSS}</style>${body}</div>`;
    const pdfHtml=`<html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body>${reportBodyHTML(d,photos.filter(x=>x.url),true)}</body></html>`;
    const r=await bridge('send',{to,subject:`Loan request: ${streetOf(d.address)}${d.city?', '+d.city:''}`,body:`Loan request for ${streetOf(d.address)}. The full report is below and attached as a PDF.\n\n${p.name||''}${p.phone?' · '+p.phone:''}`,html,inline,pdfHtml,pdfName:`${streetOf(d.address).replace(/[^\w]+/g,'-')}-loan-request.pdf`,name:p.name||senderName()});
    if(r.left!=null){state.conn.mailQuota={left:r.left,day:isoDay()};saveConn()}
    logActivity(id,'sent',`Lender report for ${streetOf(d.address)} emailed to ${to}${r.pdf===false?' (without the PDF: your Gmail script is an older version)':''}.`);toast('Report sent to '+to);
  }catch(e){toast(bridgeErr(e),5200)}finally{delete state.busy[key];render()}
}
