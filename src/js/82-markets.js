/* ================= Market Discovery: every US ZIP ranked for how you invest ================= */
const DISC={data:null,loading:null,err:'',weekly:null,byZip:{}};
const MK_STRATS={flip:'Fix & flip',wholesale:'Wholesale',brrrr:'BRRRR / rental'};
/* what each strategy cares about (weights add to 100) */
const MK_W={
  flip:{volume:20,speed:20,exit:15,trend:20,supply:10,leverage:10,stability:5},
  wholesale:{volume:20,leverage:20,investors:15,speed:15,trend:10,supply:10,yield:10},
  brrrr:{yield:35,trend:15,volume:10,supply:10,leverage:10,speed:10,stability:5,exit:5}
};
const MK_SUB={
  volume:['Sales volume','Homes sold in the last 3 months. More sales means more deals and easier exits.'],
  speed:['Speed','Median days on market.'],
  exit:['Exit strength','Sale-to-list ratio and share of homes under contract within 2 weeks.'],
  trend:['Price trend','Change in median price and $/sqft over a year.'],
  supply:['Balance','Months of supply. 2.5 to 5 months is the sweet spot for buying and selling.'],
  leverage:['Motivated sellers','Share of listings with a price cut, and listings pulled off the market.'],
  stability:['Deal stability','Share of pending sales that fall through (lower is better).'],
  yield:['Rent yield','Yearly rent ÷ median sale price (HUD 3-bed rent, else Zillow typical rent).'],
  investors:['Investor demand','Investors’ share of home purchases in the metro: the cash buyers you sell to.']
};
const mkSet=()=>state.settings.markets;
function mkStrat(){const s=mkSet().strategy;if(MK_W[s])return s;const b=state.settings.buy.strategy;return b==='wholesale'?'wholesale':(b==='brrrr'||b==='rental')?'brrrr':'flip'}
function mkStates(){return new Set(String(mkSet().states||'').toUpperCase().split(/[^A-Z]+/).filter(x=>/^[A-Z]{2}$/.test(x)))}
const mkLabel=k=>!k?'':k[0]==='~'?`Outside metro areas, ${k.slice(1)}`:k.replace(/\s+metro area$/i,'');
/* HUD's small-area rent has floors that overstate rent in the cheapest ZIPs, so cap it near Zillow's typical rent when both exist */
const mkRent=o=>o.fmr3!=null&&o.zori!=null?Math.min(o.fmr3,Math.round(o.zori*1.3)):o.fmr3??o.zori??null;
const mkYield=o=>{const r=mkRent(o);return r&&o.price?r*12/o.price:null};

async function loadDiscover(){
  if(DISC.data)return DISC.data;if(DISC.loading)return DISC.loading;
  DISC.err='';
  DISC.loading=(async()=>{
    const idx=await marketIndex();const f=idx&&idx.discover&&idx.discover.file;
    if(!f){DISC.err=idx?'The market data job hasn’t published the national table yet. It runs every Wednesday.':'Couldn’t reach the market data. Check your connection and reload.';return null}
    const [j,wk]=await Promise.all([mktFetch(f+'?v='+encodeURIComponent(idx.updated||'')),mktFetch('metros.json?v='+encodeURIComponent(idx.updated||''))]);
    if(!j||!Array.isArray(j.rows)){DISC.err='Couldn’t load the market data. Check your connection and reload.';return null}
    const C=j.cols;const rows=[];const byZip={};
    for(const r of j.rows){const o={};for(let i=0;i<C.length;i++)o[C[i]]=r[i];o.metro=j.metros[o.mi]||'';o.mk=o.metro||'~'+o.st;byZip[o.z]=o;if(o.price)rows.push(o)}
    DISC.data={...j,rows};DISC.byZip=byZip;DISC.weekly=wk&&wk.metros||{};
    return DISC.data;
  })().catch(()=>{DISC.err='Couldn’t load the market data. Check your connection and reload.';return null}).finally(()=>{DISC.loading=null;render()});
  return DISC.loading;
}

/* ---- scoring ---- */
const lin=(v,a,b)=>v==null||!isFinite(v)?null:Math.max(0,Math.min(1,(v-a)/(b-a)));
const avgN=(...a)=>{const f=a.filter(x=>x!=null);return f.length?f.reduce((s,x)=>s+x,0)/f.length:null};
function mkSubs(o,inv){
  const mos=o.mos;const k=Math.min(1,(o.sold||0)/20);/* few sales = noisy medians: pull those toward neutral */
  const shrink=v=>v==null?null:.5+(v-.5)*k;
  return {
    volume:o.sold!=null?lin(Math.log(Math.max(o.sold,1)),Math.log(4),Math.log(60)):null,
    speed:shrink(lin(o.dom,95,18)),
    exit:shrink(avgN(lin(o.stl,93,100),lin(o.off2w,8,45))),
    trend:shrink(avgN(lin(o.priceYoy,-8,6),lin(o.ppsfYoy,-8,6))),
    supply:mos==null?null:mos<=2.5?.4+.6*lin(mos,.8,2.5):mos<=5?1:1-lin(mos,5,9),
    leverage:avgN(lin(o.pdPct,12,45),lin(o.delist,4,18)),
    stability:lin(o.cancel,28,8),
    yield:lin(mkYield(o),.06,.13),
    investors:inv&&inv.share!=null?lin(inv.share,10,30):null
  };
}
function mkScore(subs,w){let s=0,t=0,all=0;for(const k in w){all+=w[k];if(subs[k]!=null){s+=subs[k]*w[k];t+=w[k]}}if(!t)return null;let sc=s/t*100;const cov=t/all;if(cov<.6)sc*=.85+cov*.25;return Math.round(sc)}
function mkMetroState(k,zs){if(k[0]==='~')return k.slice(1);const m=k.match(/,\s*([A-Z]{2})\b/);return m?m[1]:(zs[0]&&zs[0].st)||''}
let MKC={key:'',res:null};
function mkCompute(){
  const D=DISC.data;if(!D)return null;const M=mkSet();const st=mkStrat();const w=MK_W[st];const states=mkStates();
  const key=[st,M.minPrice,M.maxPrice,M.minSold,[...states].join(','),D.updated].join('|');
  if(MKC.key===key)return MKC.res;
  const zips=[];
  for(const o of D.rows){
    const pass=o.price>=(+M.minPrice||0)&&o.price<=(+M.maxPrice||1e12)&&(o.sold||0)>=(+M.minSold||0)&&(!states.size||states.has(o.st))&&(st!=='brrrr'||mkRent(o)!=null);
    o.pass=pass;o.score=null;if(!pass)continue;
    o.subs=mkSubs(o,D.investors[o.metro]);o.score=mkScore(o.subs,w);if(o.score!=null)zips.push(o);
  }
  const g={};for(const o of zips)(g[o.mk]=g[o.mk]||[]).push(o);
  const metros=Object.entries(g).map(([k,zs])=>{
    zs.sort((a,b)=>b.score-a.score);const top=zs.slice(0,5);const avgTop=top.reduce((s,o)=>s+o.score,0)/top.length;const depth=Math.min(1,zs.length/12);
    const med=f=>median(zs.map(f));
    return {key:k,label:mkLabel(k),st:mkMetroState(k,zs),zips:zs,n:zs.length,score:Math.round(avgTop*.55+median(zs.map(o=>o.score))*.3+depth*15),sold:zs.reduce((s,o)=>s+(o.sold||0),0),
      price:med(o=>o.price),dom:med(o=>o.dom),yoy:med(o=>o.priceYoy),cuts:med(o=>o.pdPct),cancel:med(o=>o.cancel),yld:med(mkYield),inv:D.investors[k]||null};
  }).sort((a,b)=>b.score-a.score||b.sold-a.sold);
  metros.forEach((m,i)=>m.rank=i+1);
  MKC={key,res:{zips,metros,strat:st,w,byKey:Object.fromEntries(metros.map(m=>[m.key,m]))}};return MKC.res;
}
const mkGrade=s=>s==null?'':s>=80?'green':s>=65?'blue':s>=50?'amber':'red';
const mkPill=s=>s==null?'<span class="muted">—</span>':`<span class="scorepill ${mkGrade(s)}">${s}</span>`;
const sgn=(v,d=1)=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d)+'%';
const pctv=(v,d=0)=>v==null||!isFinite(v)?'—':(+v).toFixed(d)+'%';

/* ---- targets ---- */
const mkTargets=()=>mkSet().targets||[];
const isTarget=(type,key)=>mkTargets().some(t=>t.type===type&&t.key===key);
function dealTarget(d){
  const T=mkTargets();if(!T.length||!d)return null;const z=zipOf(d);
  if(z&&T.some(t=>t.type==='zip'&&t.key===z))return 'zip';
  if(z&&T.some(t=>t.type==='metro'&&(t.zips||[]).includes(z)))return 'metro';
  let m=z&&DISC.byZip[z]?DISC.byZip[z].mk:null;if(!m){const mm=marketFor(d);m=mm&&mm.Z&&mm.Z.metro||null}
  return m&&T.some(t=>t.type==='metro'&&t.key===m)?'metro':null;
}
function mkStar(type,key){
  const M=mkSet();M.targets=M.targets||[];const i=M.targets.findIndex(t=>t.type===type&&t.key===key);
  if(i>=0)M.targets.splice(i,1);
  else{const o=type==='zip'?DISC.byZip[key]:null;M.targets.push({type,key,label:type==='zip'?`${key}${o&&o.city?' · '+o.city+', '+o.st:''}`:mkLabel(key),metro:o?o.mk:undefined,zips:type==='metro'?Object.values(DISC.byZip).filter(x=>x.mk===key).map(x=>x.z):undefined,at:Date.now()})}
  saveSettings();
}
const starBtn=(type,key)=>{const on=isTarget(type,key);return `<button class="starbtn ${on?'on':''}" data-act="mk-star" data-type="${type}" data-k="${esc(key)}" aria-pressed="${on}" aria-label="${on?'Remove from':'Add to'} target markets" title="${on?'Remove from':'Add to'} target markets">${ico('star')}</button>`};

/* ---- page ---- */
function viewMarkets(){
  const D=DISC.data;const M=mkSet();const st=mkStrat();const R=D?mkCompute():null;const src=D&&D.sources||{};
  const meta=D?`<span>${ico('trend')}Redfin, 3 months to ${esc(D.periodEnd||'')}</span><span>${ico('home')}Rents: HUD ${esc(src.safmr||'—')} + Zillow ${esc(src.zori||'—')}</span><span>${ico('refresh')}Updated weekly</span>`:'';
  const head=hero('g-markets','Market Discovery','Every US ZIP ranked for how you invest. Set your strategy and budget, then dig into the best metros.',meta,
    R?`<div class="h-stat"><b>${numFmt(R.zips.length)}</b><span>ZIPs fit your box</span></div><div class="h-stat"><b>${numFmt(R.metros.length)}</b><span>markets</span></div>`:'');
  if(!D)return `<div class="wrap page">${head}<section class="card">${DISC.err?`<div class="note amber">${esc(DISC.err)}</div><button class="btn sm" data-act="mk-reload">${ico('refresh')}Try again</button>`:`<div class="busy"><div class="spin"></div><span>Loading market data for every US ZIP…</span></div>`}</section></div>`;
  return `<div class="wrap page">${head}${mkControls(st,M)}${mkTargetsCard(R)}
  <div class="mk-grid">${mkMapCard(R)}${mkMetrosCard(R)}</div>
  ${state.mk.metro&&R.byKey[state.mk.metro]?mkMetroCard(R.byKey[state.mk.metro],R):state.mk.metro?`<section class="card" id="mk-metro"><div class="note">No ZIPs in ${esc(mkLabel(state.mk.metro))} fit your filters right now. Widen the price range or lower the minimum sales.</div><button class="btn sm" data-act="mk-us">Back to all markets</button></section>`:''}
  ${mkMemoCard(R)}
  <p class="xs muted" style="padding:0 4px">Sources: Redfin Data Center (single-family, rolling 3 months; metro weekly; investor purchases), Zillow Observed Rent Index, HUD Small Area Fair Market Rents, GeoNames (CC BY 4.0). Scores are a starting point for research, not a verdict.</p></div>`;
}
function mkControls(st,M){
  const w=MK_W[st];
  return `<section class="card" id="mk-controls"><div class="mk-ctl">
    <div class="field"><span>Strategy</span><div class="seg" role="group" aria-label="Strategy">${Object.entries(MK_STRATS).map(([k,l])=>`<button data-act="mk-strat" data-v="${k}" aria-pressed="${st===k}">${l}</button>`).join('')}</div></div>
    <label class="field"><span>Median price from</span><input class="input tnum" id="mk-min" data-fs="markets.minPrice" data-t="num" value="${M.minPrice??''}" inputmode="numeric" placeholder="0"></label>
    <label class="field"><span>to</span><input class="input tnum" id="mk-max" data-fs="markets.maxPrice" data-t="num" value="${M.maxPrice??''}" inputmode="numeric" placeholder="any"></label>
    <label class="field"><span>Min. homes sold (3 mo)</span><input class="input tnum" id="mk-sold" data-fs="markets.minSold" data-t="num" value="${M.minSold??''}" inputmode="numeric"></label>
    <label class="field mk-states"><span>Only these states</span><input class="input" id="mk-states" data-fs="markets.states" data-t="text" value="${esc(M.states||'')}" placeholder="All states, or e.g. TX, OH, IN" autocomplete="off"></label>
  </div>
  <p class="small muted" style="margin-top:10px"><b>${MK_STRATS[st]} score weighs:</b> ${Object.entries(w).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${MK_SUB[k][0].toLowerCase()} ${v}%`).join(' · ')}</p></section>`;
}
function mkTargetsCard(R){
  const T=mkTargets();if(!T.length)return '';
  const deals=Object.values(state.deals).filter(d=>!d.example&&dealTarget(d)).length;
  return `<section class="card" id="mk-targets"><div class="card-head"><span class="ci green">${ico('target')}</span><div><h2>Your target markets</h2><p>${deals?`${deals} of your deals are in these markets. `:''}Deals here get a “Target market” tag.</p></div></div>
  <div class="mk-tchips">${T.map(t=>{const sc=t.type==='metro'?(R.byKey[t.key]||{}).score:(DISC.byZip[t.key]||{}).score;return `<span class="mk-tchip"><button class="linkbtn" data-act="${t.type==='metro'?'mk-metro':'mk-zip'}" data-k="${esc(t.key)}">${esc(t.label)}</button>${sc!=null?mkPill(sc):''}<button class="iconx" data-act="mk-star" data-type="${t.type}" data-k="${esc(t.key)}" aria-label="Remove ${esc(t.label)}">${ico('close')}</button></span>`}).join('')}</div></section>`;
}
function mkMapCard(R){
  const sel=state.mk.metro?R.byKey[state.mk.metro]:null;
  return `<section class="card mk-mapcard" id="mk-map"><div class="card-head"><span class="ci blue">${ico('pin')}</span><div><h2>${sel?esc(sel.label):'Where the fit is'}</h2><p>${sel?`${sel.n} ZIPs fit · click a dot for details`:'Each dot is a ZIP that fits your box, shaded by score'}</p></div>${sel?`<div class="ch-r"><button class="btn sm" data-act="mk-us">${ico('back')}Whole US</button></div>`:''}</div>
  <div class="mk-mapwrap"><canvas id="mk-canvas" role="img" aria-label="Map of ZIP scores${sel?' in '+esc(sel.label):' across the US'}"></canvas><div class="mk-tip" id="mk-tip" hidden></div></div>
  <div class="mk-legend"><span class="xs muted">Score: 30 or less</span><span class="mk-ramp" aria-hidden="true"></span><span class="xs muted">90+</span><span class="spacer"></span><span class="mk-nofit"><i></i>doesn’t fit your box</span></div></section>`;
}
function mkMetrosCard(R){
  const n=state.mk.show||25;const list=R.metros.slice(0,n);
  const rows=list.map(m=>`<tr data-act="mk-metro" data-k="${esc(m.key)}" class="${state.mk.metro===m.key?'sel':''}"><td class="tnum muted">${m.rank}</td><td><b>${esc(m.label)}</b><div class="xs muted">${m.n} ZIP${m.n>1?'s':''} fit · ${numFmt(m.sold)} sales</div></td><td class="c">${mkPill(m.score)}</td><td class="r tnum">${moneyK(m.price)}</td><td class="r tnum">${m.dom!=null?Math.round(m.dom)+'d':'—'}</td><td class="r tnum">${sgn(m.yoy)}</td><td class="r tnum">${pctv(m.cuts)}</td><td class="r tnum">${m.yld!=null?pct(m.yld,1):'—'}</td><td class="r tnum">${m.inv?pctv(m.inv.share):'—'}</td><td class="c">${starBtn('metro',m.key)}</td></tr>`).join('');
  return `<section class="card mk-metros" id="mk-metros"><div class="card-head"><span class="ci purple">${ico('stats')}</span><div><h2>Best markets for ${esc(MK_STRATS[R.strat].toLowerCase())}</h2><p>Score blends its best 5 ZIPs, its typical ZIP, and how many ZIPs fit</p></div></div>
  ${R.metros.length?`<div class="tbl-wrap" data-keep-scroll id="mk-mtbl"><table class="tbl mk-tbl"><thead><tr><th>#</th><th>Market</th><th class="c">Score</th><th class="r">Median</th><th class="r">Days</th><th class="r">Price YoY</th><th class="r">Price cuts</th><th class="r">Rent yield</th><th class="r">Investors</th><th class="c"><span class="sr">Target</span></th></tr></thead><tbody>${rows}</tbody></table></div>
  ${R.metros.length>n?`<button class="btn sm ghost" data-act="mk-more" style="margin-top:8px">Show ${Math.min(25,R.metros.length-n)} more</button>`:''}`:`<div class="note">Nothing fits. Widen the price range, lower the minimum sales, or clear the state filter.</div>`}</section>`;
}
function mkBars(subs,w){
  return `<div class="mk-bars">${Object.entries(w).sort((a,b)=>b[1]-a[1]).map(([k,wt])=>{const v=subs[k];return `<div class="mk-bar" title="${esc(MK_SUB[k][1])}"><span class="lab">${MK_SUB[k][0]} <span class="muted">· ${wt}%</span></span><span class="track"><i style="width:${v==null?0:Math.round(v*100)}%"></i></span><b class="tnum">${v==null?'n/a':Math.round(v*100)}</b></div>`}).join('')}</div>`;
}
function mkMetroCard(m,R){
  const wk=DISC.weekly&&DISC.weekly[m.key];const l=wk&&wk.l;
  const avgSubs={};Object.keys(R.w).forEach(k=>{avgSubs[k]=avgN(...m.zips.slice(0,5).map(o=>o.subs[k]))});
  const z=state.mk.zip&&DISC.byZip[state.mk.zip]&&DISC.byZip[state.mk.zip].mk===m.key?DISC.byZip[state.mk.zip]:null;
  const rows=m.zips.slice(0,60).map(o=>`<tr data-act="mk-zip" data-k="${o.z}" class="${z&&z.z===o.z?'sel':''}"><td><b class="tnum">${o.z}</b><div class="xs muted">${esc(o.city||'')}${o.county?' · '+esc(o.county):''}</div></td><td class="c">${mkPill(o.score)}</td><td class="r tnum">${moneyK(o.price)}</td><td class="r tnum">${o.ppsf?'$'+o.ppsf:'—'}</td><td class="r tnum">${o.dom??'—'}</td><td class="r tnum">${o.sold??'—'}</td><td class="r tnum">${sgn(o.priceYoy)}</td><td class="r tnum">${pctv(o.pdPct)}</td><td class="r tnum">${mkRent(o)?money(mkRent(o)):'—'}</td><td class="r tnum">${mkYield(o)!=null?pct(mkYield(o),1):'—'}</td><td class="c">${starBtn('zip',o.z)}</td></tr>`).join('');
  return `<section class="card" id="mk-metro"><div class="card-head"><span class="ci teal">${ico('building')}</span><div><h2>${esc(m.label)} <span class="muted" style="font-weight:600">#${m.rank}</span></h2><p>${m.n} ZIPs fit your box · ${numFmt(m.sold)} single-family sales in 3 months</p></div><div class="ch-r">${mkPill(m.score)}${starBtn('metro',m.key)}</div></div>
  <div class="split"><div>${mkBars(avgSubs,R.w)}<p class="xs muted">Average of its top 5 ZIPs. Hover a bar for what it measures.</p></div>
  <div class="mk-facts">${[['Median sale price',moneyK(m.price)],['Median days on market',m.dom!=null?Math.round(m.dom)+' days':'—'],['Price change, 1 year',sgn(m.yoy)],['Listings with a price cut',pctv(m.cuts)],['Pending sales that cancel',pctv(m.cancel)],['Rent yield (gross)',m.yld!=null?pct(m.yld,1):'—'],['Investor share of purchases',m.inv?`${pctv(m.inv.share,1)} (${m.inv.yoy!=null?sgn(m.inv.yoy,0)+' yr':''}, ${esc(m.inv.q||'')})`:'— (Redfin covers the ~40 largest metros)']].map(([a,b])=>`<div><span class="small muted">${a}</span><b class="tnum">${b}</b></div>`).join('')}
  ${l?`<div class="mk-wk"><span class="small muted">Whole metro, last 4 weeks (to ${esc(wk.periodEnd||'')})</span><b class="small">Pending sales ${l.pendYoy!=null?sgn(l.pendYoy,0):'—'} · new listings ${l.newYoy!=null?sgn(l.newYoy,0):'—'} · active ${l.activeYoy!=null?sgn(l.activeYoy,0):'—'} vs a year ago · ${l.mos??'—'} months of supply</b></div>`:''}</div></div>
  ${z?mkZipDetail(z,R):''}
  <h3 class="mk-h3">ZIPs that fit, best first</h3>
  <div class="tbl-wrap" data-keep-scroll id="mk-ztbl"><table class="tbl mk-tbl"><thead><tr><th>ZIP</th><th class="c">Score</th><th class="r">Median</th><th class="r">$/sqft</th><th class="r">Days</th><th class="r">Sold</th><th class="r">YoY</th><th class="r">Cuts</th><th class="r">Rent (est.)</th><th class="r">Yield</th><th class="c"><span class="sr">Target</span></th></tr></thead><tbody>${rows}</tbody></table></div>
  ${m.zips.length>60?`<p class="xs muted">Showing the best 60 of ${m.zips.length}.</p>`:''}</section>`;
}
function mkZipDetail(o,R){
  const S=MKT.states[o.st];const Z=S&&S.zips&&S.zips.zips&&S.zips.zips[o.z];const s=Z&&Z.s;
  if(!S&&!MKT.failed[o.st])loadMarketState(o.st).then(()=>render());
  const rentLine=[o.fmr3?`HUD fair market rent, 3-bed: <b>${money(o.fmr3)}</b>/mo`:'',o.zori?`Zillow typical rent: <b>${money(o.zori)}</b>/mo${o.zoriYoy!=null?` (${sgn(o.zoriYoy)} a year)`:''}`:''].filter(Boolean).join(' · ');
  return `<div class="mk-zip" id="mk-zip"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>${o.z} · ${esc(o.city||'')}, ${o.st}${o.county?` <span class="muted" style="font-weight:600">${esc(o.county)} County</span>`:''}</h3>
    <p class="small muted">${moneyK(o.price)} median · $${o.ppsf??'—'}/sqft · ${o.dom??'—'} days · ${o.sold??'—'} sold, ${o.active??'—'} active · sale-to-list ${pctv(o.stl,1)} · ${o.mos??'—'} months of supply${o.cancel!=null?` · ${pctv(o.cancel)} of pendings cancel`:''}</p>
    ${rentLine?`<p class="small">${rentLine}</p>`:''}${(()=>{const m=R.byKey[o.mk];return m&&m.price&&o.price<m.price*.6?`<p class="small" style="color:var(--t-amber)">Median is ${Math.round(o.price/m.price*100)}% of the metro’s typical fitting ZIP. Cheap ZIPs can hide tough blocks and weak rents: check it street by street before buying.</p>`:''})()}</div><div class="row" style="flex-wrap:nowrap">${mkPill(o.score)}${starBtn('zip',o.z)}<button class="btn ghost sm" data-act="mk-zip" data-k="" aria-label="Close">${ico('close')}</button></div></div>
  <div class="split" style="margin-top:8px"><div>${mkBars(o.subs||{},R.w)}</div><div class="mk-sparks">${s?[['Median sale price',s.price,'blue'],['$/sqft',s.ppsf,'blue'],['Days on market',s.dom,'amber']].map(([a,v,c])=>`<div><span class="xs muted">${a}, 2 years</span>${spark(v,c)}</div>`).join(''):'<span class="xs muted">Loading 2-year trend…</span>'}
    <div class="row" style="gap:8px;margin-top:6px"><a class="btn sm" href="https://www.redfin.com/zipcode/${o.z}" target="_blank" rel="noopener">${ico('link')}Homes on Redfin</a><a class="btn sm" href="https://www.zillow.com/homes/${o.z}_rb/" target="_blank" rel="noopener">${ico('link')}Zillow</a></div></div></div></div>`;
}

/* ---- map (canvas dot map; contiguous US, or zoomed to a metro) ---- */
const MKMAP={pts:[],w:0,h:0};
const MK_RAMP=['#cde2fb','#b7d3f6','#9ec5f4','#86b6ef','#6da7ec','#5598e7','#3987e5','#2a78d6','#256abf','#1c5cab','#184f95','#104281','#0d366b'];
function isDark(){const t=document.documentElement.dataset.theme;return t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)}
function mkColor(score,dark){const t=Math.max(0,Math.min(1,(score-30)/60));const R=dark?MK_RAMP.slice(0,12).reverse():MK_RAMP;return R[Math.round(t*(R.length-1))]}
const mkXY=(lat,lng)=>[(lng+125)*0.788,(50-lat)];/* equirectangular, scaled for ~38°N */
function drawMarketMap(){
  const cv=document.getElementById('mk-canvas');const D=DISC.data;if(!cv||!D)return;const R=mkCompute();
  const wrap=cv.parentElement;const W=Math.max(280,wrap.clientWidth);const sel=state.mk.metro;
  let pool=D.rows.filter(o=>o.lat!=null);
  let bx;if(sel){const zs=pool.filter(o=>o.mk===sel);if(zs.length){const xs=zs.map(o=>mkXY(o.lat,o.lng));bx=[Math.min(...xs.map(p=>p[0])),Math.min(...xs.map(p=>p[1])),Math.max(...xs.map(p=>p[0])),Math.max(...xs.map(p=>p[1]))];const pw=Math.max(.6,bx[2]-bx[0]),ph=Math.max(.4,bx[3]-bx[1]);bx=[bx[0]-pw*.12,bx[1]-ph*.12,bx[2]+pw*.12,bx[3]+ph*.12]}}
  if(!bx){bx=[0,0,46.3,26.2];pool=pool.filter(o=>o.lng>-125&&o.lng<-66&&o.lat>24&&o.lat<50)}
  const bw=bx[2]-bx[0],bh=bx[3]-bx[1];const H=Math.round(Math.min(W*0.62,Math.max(220,W*bh/bw)));
  const sc=Math.min(W/bw,H/bh);const ox=(W-bw*sc)/2,oy=(H-bh*sc)/2;
  const dpr=window.devicePixelRatio||1;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const dark=isDark();const cs=getComputedStyle(document.documentElement);const faint=cs.getPropertyValue('--line-strong').trim()||'#ccc';const ring=cs.getPropertyValue('--surface').trim()||'#fff';
  const zoom=!!sel;const rNo=zoom?2.6:1.05,rYes=zoom?Math.max(4,Math.min(7,W/120)):Math.max(1.7,W/420);
  const P=o=>{const [x,y]=mkXY(o.lat,o.lng);return [ox+(x-bx[0])*sc,oy+(y-bx[1])*sc]};
  g.globalAlpha=zoom?.7:.55;g.fillStyle=faint;
  for(const o of pool){if(o.pass&&o.score!=null)continue;const [x,y]=P(o);if(x<-5||y<-5||x>W+5||y>H+5)continue;g.fillRect(x-rNo/2,y-rNo/2,rNo,rNo)}
  g.globalAlpha=1;const yes=pool.filter(o=>o.pass&&o.score!=null).sort((a,b)=>a.score-b.score);MKMAP.pts=[];
  for(const o of yes){const [x,y]=P(o);if(x<-8||y<-8||x>W+8||y>H+8)continue;g.beginPath();g.arc(x,y,rYes,0,7);g.fillStyle=mkColor(o.score,dark);g.fill();if(zoom){g.lineWidth=1.5;g.strokeStyle=ring;g.stroke()}MKMAP.pts.push([x,y,o])}
  if(state.mk.zip){const o=DISC.byZip[state.mk.zip];if(o&&o.lat!=null){const [x,y]=P(o);g.beginPath();g.arc(x,y,rYes+5,0,7);g.lineWidth=2.5;g.strokeStyle=cs.getPropertyValue('--ink').trim()||'#111';g.stroke()}}
  if(zoom){const top=yes.slice(-6);g.font='700 11px '+getComputedStyle(document.body).fontFamily;g.lineJoin='round';
    for(const o of top){const [x,y]=P(o);const t=o.z+(o.city?' '+o.city:'');const tw=g.measureText(t).width;const tx=x+tw+rYes+6>W?x-rYes-4-tw:x+rYes+4;g.lineWidth=3.5;g.strokeStyle=ring;g.strokeText(t,tx,y+4);g.fillStyle=cs.getPropertyValue('--ink').trim()||'#111';g.fillText(t,tx,y+4)}}
  MKMAP.w=W;MKMAP.h=H;
  const lg=document.querySelector('.mk-ramp');if(lg)lg.style.background=`linear-gradient(90deg,${(dark?MK_RAMP.slice(0,12).reverse():MK_RAMP).join(',')})`;
  const tip=document.getElementById('mk-tip');
  const hit=e=>{const r=cv.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;let best=null,bd=(zoom?14:9)**2;for(const p of MKMAP.pts){const d=(p[0]-x)**2+(p[1]-y)**2;if(d<bd){bd=d;best=p}}return best};
  cv.onmousemove=e=>{const p=hit(e);if(!p){tip.hidden=true;cv.style.cursor='';return}const o=p[2];cv.style.cursor='pointer';tip.hidden=false;
    tip.innerHTML=`<b>${o.z} · ${esc(o.city||'')}, ${o.st}</b><span>Score ${o.score} · ${moneyK(o.price)} · ${o.dom??'—'} days · ${o.sold??'—'} sold</span><span class="muted">${esc(mkLabel(o.mk))}</span>`;
    const tx=Math.min(p[0]+12,W-tip.offsetWidth-4),ty=p[1]+12+tip.offsetHeight>H?p[1]-tip.offsetHeight-10:p[1]+12;tip.style.left=Math.max(4,tx)+'px';tip.style.top=Math.max(4,ty)+'px'};
  cv.onmouseleave=()=>{tip.hidden=true};
  cv.onclick=e=>{const p=hit(e);if(!p)return;tip.hidden=true;const o=p[2];state.mk.metro=o.mk;state.mk.zip=o.z;render();setTimeout(()=>{const el=document.getElementById('mk-zip')||document.getElementById('mk-metro');if(el)el.scrollIntoView({block:'start',behavior:'smooth'})},90)};
}

/* ---- Maya's market memo (Opus + web search) ---- */
function mkCandidates(R){
  const tm=mkTargets().filter(t=>t.type==='metro').map(t=>R.byKey[t.key]).filter(Boolean);
  const tz=mkTargets().filter(t=>t.type==='zip').map(t=>DISC.byZip[t.key]).filter(o=>o&&R.byKey[o.mk]).map(o=>R.byKey[o.mk]);
  const set=[...new Map([...tm,...tz].map(m=>[m.key,m])).values()];
  for(const m of R.metros){if(set.length>=6)break;if(!set.includes(m)&&m.key[0]!=='~')set.push(m)}
  return set.slice(0,8);
}
function promptMarkets(R,cands){
  const M=mkSet();const st=R.strat;const D=DISC.data;
  const line=m=>`- ${m.label} (rank #${m.rank}, score ${m.score}): ${m.n} ZIPs fit, ${m.sold} single-family sales in 3 months, median ${money(m.price)}, ${m.dom!=null?Math.round(m.dom):'?'} days on market, price ${sgn(m.yoy)} a year, ${pctv(m.cuts)} of listings cut price, ${pctv(m.cancel)} of pendings cancel, gross rent yield ${m.yld!=null?pct(m.yld,1):'?'}${m.inv?`, investors ${pctv(m.inv.share,1)} of purchases`:''}. Best ZIPs: ${m.zips.slice(0,4).map(o=>`${o.z} ${o.city||''} (score ${o.score}, ${moneyK(o.price)}, ${o.dom??'?'}d, ${o.sold??'?'} sold, rent ${mkRent(o)?money(mkRent(o)):'?'})`).join('; ')}.`;
  return `You are ${negName()}, the acquisitions analyst for a real estate investor. He hasn't picked a market yet and wants the best place to start. Strategy: ${MK_STRATS[st]}. Buy box: ZIPs with a median single-family price of ${money(+M.minPrice||0)}–${M.maxPrice?money(+M.maxPrice):'any'}.${M.states?` He is only looking at: ${M.states}.`:''}
${M.notes?`What he told you about himself: """${String(M.notes).slice(0,1500)}"""`:''}

OfferDesk's data (Redfin ${D.periodEnd}, single-family, rolling 3 months; rents from HUD 3-bed fair market rent or Zillow's typical rent):
${cands.map(line).join('\n')}

Use web search for current facts that change the answer for this strategy in these markets, for example: landlord-tenant law and eviction timelines, property tax rates, insurance costs and flood or storm risk, rules on wholesaling and assigning contracts (licensing, disclosures), big employers arriving or leaving, and any recent news that moves prices. Name the source for each fact. Skip generic advice that applies everywhere.

Rank the markets for him. Pick 1–3 to start with and say plainly if any should be avoided. Be concrete and short.
Reply with only JSON:
{"summary":"2-3 sentences","picks":[{"market":"name exactly as listed","verdict":"start here|strong backup|maybe|avoid","why":["short reason with a number"],"risks":["short"],"checkFirst":["what to verify before buying there"],"startZips":["ZIP"]}],"nextSteps":["concrete step"]}`;
}
async function mkMemo(){
  const R=mkCompute();if(!R)return;if(!aiOn()){toast(aiErr({code:'no_ai'}),5200);return}
  const cands=mkCandidates(R);if(!cands.length){toast('Nothing fits your filters yet.');return}
  const res=await runAI('mk-memo',`${negName()} is comparing ${cands.length} markets and checking the news…`,(ai,signal)=>apiTools(promptMarkets(R,cands),{signal,model:bigModel(),maxTokens:9000}));
  if(!res)return;let j;try{j=parseLoose(res.text)}catch(e){toast('Maya’s answer came back garbled. Try again.',5200);return}
  mkSet().memo={at:Date.now(),strat:R.strat,summary:String(j.summary||''),picks:(Array.isArray(j.picks)?j.picks:[]).slice(0,8).map(p=>({market:String(p.market||''),verdict:String(p.verdict||''),why:[].concat(p.why||[]).map(String).slice(0,5),risks:[].concat(p.risks||[]).map(String).slice(0,5),checkFirst:[].concat(p.checkFirst||[]).map(String).slice(0,5),startZips:[].concat(p.startZips||[]).map(x=>String(x).replace(/\D/g,'').slice(0,5)).filter(x=>x.length===5).slice(0,6)})),
    nextSteps:[].concat(j.nextSteps||[]).map(String).slice(0,6),sources:(res.sources||[]).slice(0,14),model:bigModel()||state.settings.model,cands:cands.map(m=>m.key)};
  saveSettings();logActivity(null,'info',`${negName()} compared ${cands.length} markets for ${MK_STRATS[R.strat].toLowerCase()}.`);
}
const MK_VERDICT={'start here':'green','strong backup':'blue','maybe':'amber','avoid':'red'};
function mkMemoCard(R){
  const M=mkSet();const memo=M.memo;const n=esc(negName());const busy=state.busy['mk-memo'];const cands=mkCandidates(R);
  const keyOf=name=>{const m=R.metros.find(x=>x.label.toLowerCase()===String(name).toLowerCase())||R.metros.find(x=>String(name).toLowerCase().includes(x.label.toLowerCase().split(',')[0]));return m&&m.key};
  const body=memo?`<p class="small muted">${new Date(memo.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${esc(MK_STRATS[memo.strat]||'')}${memo.model&&/opus/.test(memo.model)?' · Opus 5.5':''}${memo.strat!==R.strat?' · <b>made for a different strategy</b>':''}</p>
    ${memo.summary?`<p>${esc(memo.summary)}</p>`:''}
    <div class="mk-picks">${memo.picks.map(p=>{const k=keyOf(p.market);return `<div class="mk-pick"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;gap:8px"><b>${k?`<button class="linkbtn" data-act="mk-metro" data-k="${esc(k)}">${esc(p.market)}</button>`:esc(p.market)}</b><span class="tag ${MK_VERDICT[p.verdict]||''}">${esc(p.verdict)}</span></div>
      ${p.why.length?`<ul>${p.why.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${p.risks.length?`<p class="xs"><b>Risks:</b> ${p.risks.map(esc).join(' · ')}</p>`:''}${p.checkFirst.length?`<p class="xs"><b>Check first:</b> ${p.checkFirst.map(esc).join(' · ')}</p>`:''}
      ${p.startZips.length?`<div class="row" style="gap:6px">${p.startZips.map(z=>DISC.byZip[z]?`<button class="qchip blue" data-act="mk-zip" data-k="${z}">${z}${DISC.byZip[z].city?' · '+esc(DISC.byZip[z].city):''}</button>`:`<span class="tag">${z}</span>`).join('')}</div>`:''}</div>`}).join('')}</div>
    ${memo.nextSteps.length?`<h3 class="mk-h3">Next steps</h3><ol class="small">${memo.nextSteps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}
    ${memo.sources&&memo.sources.length?`<details id="mk-src"><summary>Sources (${memo.sources.length})</summary><ul class="xs">${memo.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title||s.url)}</a></li>`).join('')}</ul></details>`:''}`:'';
  return `<section class="card" id="mk-memo"><div class="card-head"><span class="ci pink">${ico('spark')}</span><div><h2>${n}’s take</h2><p>${n} compares ${cands.length?cands.slice(0,3).map(m=>esc(m.label.split(',')[0])).join(', ')+(cands.length>3?` and ${cands.length-3} more`:''):'your top markets'} and checks laws, taxes, insurance and news</p></div>
    <div class="ch-r">${aiOn()?`<button class="btn primary sm" data-act="mk-memo" ${busy?'disabled':''}>${ico('spark')}${memo?'Run again':'Compare markets'}</button>`:`<a class="btn sm" href="#settings/connections">Add your API key</a>`}</div></div>
  <label class="field"><span>Anything ${n} should know (where you have buyers, cash, team, deal-breakers)</span><textarea class="input" id="mk-notes" data-fs="markets.notes" data-t="text" rows="2" placeholder="e.g. I invest remotely, I know cash buyers in one metro, budget up to $60K per deal">${esc(M.notes||'')}</textarea></label>
  ${busyHTML('mk-memo')}${body}</section>`;
}
