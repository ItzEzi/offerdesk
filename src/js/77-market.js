/* ================= market data (Redfin, refreshed weekly by a GitHub job) ================= */
const MKT_BASES=['https://raw.githubusercontent.com/ItzEzi/offerdesk/data/market/','market/'];
const MKT={idx:null,idxAt:0,base:null,states:{},loading:{},failed:{}};
async function mktFetch(path){
  const bases=MKT.base?[MKT.base]:MKT_BASES;
  for(const b of bases){try{const r=await fetch(b+path,{cache:'no-cache'});if(r.ok){const j=await r.json();MKT.base=b;return j}}catch(e){}}
  return null;
}
async function marketIndex(){
  if(MKT.idx&&Date.now()-MKT.idxAt<6*3600e3)return MKT.idx;
  if(!MKT.idx&&MKT.idxFail&&Date.now()-MKT.idxFail<30*60e3)return null;
  const j=await mktFetch('index.json?d='+isoDay());if(j){MKT.idx=j;MKT.idxAt=Date.now()}else MKT.idxFail=Date.now();return MKT.idx;
}
async function loadMarketState(st){
  st=String(st||'').toUpperCase();if(!/^[A-Z]{2}$/.test(st))return null;
  if(MKT.states[st])return MKT.states[st];if(MKT.failed[st]&&Date.now()-MKT.failed[st]<30*60e3)return null;
  if(MKT.loading[st])return MKT.loading[st];
  MKT.loading[st]=(async()=>{const idx=await marketIndex();const f=idx&&idx.files&&idx.files[st];if(!f){MKT.failed[st]=Date.now();return null}
    const zips=await mktFetch(f.zips+'?v='+encodeURIComponent(idx.redfinUpdated||idx.updated||''));const metros=f.metros?await mktFetch(f.metros+'?v='+encodeURIComponent(idx.updated||'')):null;
    if(!zips){MKT.failed[st]=Date.now();return null}MKT.states[st]={zips,metros};return MKT.states[st]})().finally(()=>{delete MKT.loading[st]});
  return MKT.loading[st];
}
function zipOf(d){const m=String(d.zip||'').match(/\d{5}/)||String(d.address||'').match(/\b(\d{5})(?:-\d{4})?\b\s*$/);return m?m[0].slice(0,5):null}
function stateOf(d){const s=String(d.state||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(s)?s:null}
function marketFor(d){const st=stateOf(d),z=zipOf(d);if(!st||!z)return null;const S=MKT.states[st];if(!S||!S.zips||!S.zips.zips)return null;const Z=S.zips.zips[z];if(!Z)return {none:true,zip:z,state:st,S};
  const metro=Z.metro&&S.metros&&S.metros.metros?S.metros.metros[Z.metro]:null;return {zip:z,state:st,Z,metro,S}}
async function ensureMarket(d){if(!d)return;const st=stateOf(d);if(!st||MKT.states[st])return;const r=await loadMarketState(st);if(r){const m=marketFor(d);if(m&&m.Z&&m.Z.l&&m.Z.l.dom!=null&&d.zipAvgDom==null&&d.zipDomAuto!==m.Z.l.dom){d.zipDomAuto=m.Z.l.dom;saveDeal(d,true)}render()}}
const zipDom=d=>d.zipAvgDom??d.zipDomAuto??null;
function marketFacts(d){
  const m=marketFor(d);if(!m||!m.Z)return '';const l=m.Z.l||{};const S=m.S.zips;
  const yo=v=>v==null?'':` (${v>=0?'+':''}${Math.round(v*10)/10}% a year)`;
  return `ZIP ${m.zip} market, single-family homes (Redfin, 3 months to ${S.periodEnd||'latest'}): median sale ${money(l.price)}${yo(l.priceYoy)}, ${l.ppsf?'$'+Math.round(l.ppsf)+'/sqft':'?'}${yo(l.ppsfYoy)}, median ${l.dom??'?'} days on market, sale-to-list ${l.stl!=null?l.stl+'%':'?'}, ${l.mos!=null?l.mos+' months of supply':'supply unknown'}, ${l.sold??'?'} sold${l.pdPct!=null?`, ${Math.round(l.pdPct)}% of active listings had a price drop`:''}.`;
}
function mktTone(l){if(l.mos==null)return null;return l.mos<3?['Seller’s market','green']:l.mos<=6?['Balanced market','blue']:['Buyer’s market','orange']}
function spark(vals,cls){const v=(vals||[]).map(x=>x==null?null:+x);const f=v.filter(x=>x!=null);if(f.length<2)return '';const lo=Math.min(...f),hi=Math.max(...f),W=120,H=30;const X=i=>i/(v.length-1)*W,Y=x=>H-3-(hi===lo?.5:(x-lo)/(hi-lo))*(H-6);
  let p='';v.forEach((x,i)=>{if(x==null)return;p+=(p?'L':'M')+X(i).toFixed(1)+','+Y(x).toFixed(1)});return `<svg class="spark ${cls||''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${p}"/></svg>`}
function marketCard(d,c){
  const st=stateOf(d),z=zipOf(d);if(!st||!z)return '';const m=marketFor(d);
  if(!m){return MKT.failed[st]?'':`<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Loading Redfin data…</p></div></div></section>`}
  if(m.none)return `<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Redfin has no single-family data for this ZIP</p></div></div></section>`;
  const l=m.Z.l||{},s=m.Z.s||{},S=m.S.zips;const tone=mktTone(l);
  const k=(lab,val,sub,sp,cls)=>`<div class="kpi ${cls||''}"><span class="lab">${lab}</span><span class="val">${val}</span>${sub?`<span class="sub">${sub}</span>`:''}${sp||''}</div>`;
  const yy=v=>v==null?'':`<span style="color:${v>=0?'var(--t-green)':'var(--t-red)'}">${v>=0?'+':''}${(Math.round(v*10)/10)}% YoY</span>`;
  let arvNote='';
  if(c.ready&&d.sqft&&l.ppsf){const a=c.A/d.sqft;const r=a/l.ppsf-1;arvNote=`<div class="note ${r>.45?'red':r<-.05?'amber':'green'}">Your ARV is <b>$${Math.round(a)}/sqft</b>, ${r>=0?Math.round(r*100)+'% above':Math.round(-r*100)+'% below'} this ZIP’s median sale ($${Math.round(l.ppsf)}/sqft). ${r>.45?'That’s optimistic: renovated homes usually sell 10–35% above the median. Back it with strong comps.':r<-.05?'That’s below the median, which is conservative for a renovated house. Check your comps; you may be leaving room.':'That fits a renovated house in this ZIP.'}</div>`}
  const mt=m.metro;const wk=mt&&mt.l;
  return `<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Single-family homes · Redfin, 3 months to ${esc(S.periodEnd||'')} · ${esc(m.Z.metro||'')}</p></div><div class="ch-r">${tone?`<span class="pill ${tone[1]}">${tone[0]}</span>`:''}</div></div>
  <div class="kpis">${k('Median sale price',money(l.price),yy(l.priceYoy),spark(s.price,'blue'))}${k('Price per sqft',l.ppsf?'$'+Math.round(l.ppsf):'—',yy(l.ppsfYoy),spark(s.ppsf,'blue'))}${k('Median days on market',l.dom!=null?l.dom+' days':'—',l.stl!=null?`Sale-to-list ${l.stl}%`:'',spark(s.dom,'amber'))}${k('Months of supply',l.mos!=null?l.mos:'—',`${l.sold??'—'} sold · ${(l.inv??l.active)??'—'} for sale${l.pdPct!=null?` · ${Math.round(l.pdPct)}% cut price`:''}`,spark(s.mos,'amber'))}</div>
  ${arvNote}
  ${wk?`<p class="small muted"><b>${esc(m.Z.metro)}</b>, last 4 weeks (updated ${esc(mt.periodEnd||'')}): median sale ${money(wk.price)}${wk.priceYoy!=null?` (${wk.priceYoy>=0?'+':''}${Math.round(wk.priceYoy*10)/10}% YoY)`:''}, ${wk.dom??'?'} days on market, pending sales ${wk.pendYoy!=null?(wk.pendYoy>=0?'+':'')+Math.round(wk.pendYoy)+'% YoY':'—'}, new listings ${wk.newYoy!=null?(wk.newYoy>=0?'+':'')+Math.round(wk.newYoy)+'% YoY':'—'}.</p>`:''}
  <p class="xs muted">Redfin publishes ZIP data monthly and metro data weekly; OfferDesk checks for new data every week.</p></section>`;
}
/* market-based risk adjustments for the deal score */
function marketMods(d,c){const m=marketFor(d);if(!m||!m.Z)return [];const l=m.Z.l||{};const out=[];
  if(l.mos!=null&&l.mos>=6)out.push([`Slow ZIP: ${l.mos} months of supply`,-5]);
  if(l.priceYoy!=null&&l.priceYoy<=-5)out.push([`ZIP prices down ${Math.round(-l.priceYoy)}% in a year`,-4]);
  if(c.ready&&d.sqft&&l.ppsf&&c.A/d.sqft>l.ppsf*1.45)out.push(['ARV far above the ZIP’s $/sqft',-6]);
  return out}
