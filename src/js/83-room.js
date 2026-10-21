/* ================= Room at the table: how much food is LEFT after the other eaters ================= */
/* A metro is a table and its listings are the food. What matters is not how many investors sit there, but how much
   they leave: listings in your price range that nobody grabbed in the first two weeks, every month (and the ones
   that had to cut their price). Then: can you still sell the finished house (exit), and is the area growing (future)?
   Investor signs (houses already rented out, metro size) are shown for background only. */
const CENS={rows:0,meta:null};
const ROOM_W={left:35,share:20,exit:20,future:25};
const ROOM_SUB={
  left:['Food left over','Listings a month in your price range that are NOT under contract within 2 weeks: the ones the other investors and buyers didn’t grab. Full marks at 150+ a month for a metro (20+ for a ZIP).'],
  share:['Share left over','Of all new listings, the share still available after 2 weeks. Higher = the eaters leave more on the table.'],
  exit:['Resale','Renovated houses still sell: days on market, months of supply, sale-to-list.'],
  future:['Future','County jobs over 2 years, population and people moving in since 2020, income growth, $/sqft over 2 years, rent growth.']
};
function joinCensus(c,byZip){
  if(!c||!Array.isArray(c.rows)||!Array.isArray(c.cols))return;
  const C=c.cols,ci={};(c.ccols||[]).forEach((k,i)=>ci[k]=i);const cs=c.counties||{};let n=0;
  for(const r of c.rows){const o=byZip[r[0]];if(!o)continue;n++;
    for(let i=1;i<C.length;i++){const k=C[i];o[k==='pop'?'zpop':k==='pop0'?'zpop0':k]=r[i]}
    const cr=o.cty&&cs[o.cty];
    if(cr){o.cPopG=cr[ci.popG];o.cPopYoy=cr[ci.popYoy];o.cMig=cr[ci.mig];o.cPop=cr[ci.pop];o.cJobYoy=cr[ci.jobYoy];o.cJob2y=cr[ci.job2y];o.cName=cr[ci.name]}}
  CENS.rows=n;CENS.mpop=null;CENS.moff=null;CENS.meta={acsYear:c.acsYear,baseYear:c.baseYear,popVintage:c.popVintage,qcew:c.qcew};
}
const roomOn=()=>CENS.rows>1000;
function mkLens(){return mkSet().lens==='room'&&roomOn()?'room':'stats'}
function wavg(pairs,minCov=.4){let s=0,t=0,all=0;for(const [v,w] of pairs){all+=w;if(v!=null&&isFinite(v)){s+=v*w;t+=w}}return t&&t/all>=minCov?s/t:null}
const gPct=(a,b)=>a!=null&&b?(a/b-1)*100:null;
const inflowOf=o=>o.sfr!=null&&o.sfr0!=null?o.sfr-o.sfr0:null;
const incGOf=o=>gPct(o.inc,o.inc0);
const jobOf=o=>o.cJob2y!=null?o.cJob2y:o.cJobYoy!=null?o.cJobYoy*2:null;
const logLin=(v,a,b)=>v==null||!isFinite(v)?null:v<=0?0:lin(Math.log(v),Math.log(a),Math.log(b));
function metroPops(D){const m={};for(const o of D.rows)if(o.zpop)m[o.mk]=(m[o.mk]||0)+o.zpop;return m}
/* typical "under contract within 2 weeks" share per metro, for small ZIPs Redfin leaves blank */
function metroOff(D){const g={};for(const o of D.rows)if(o.off2w!=null)(g[o.mk]=g[o.mk]||[]).push(o.off2w);const m={};for(const k in g)m[k]=median(g[k]);m['']=median(D.rows.map(o=>o.off2w));return m}
/* the food for one ZIP: new listings a month, and how many of them are still there after 2 weeks */
function zipFood(o,D){
  const moff=CENS.moff||(CENS.moff=metroOff(D));
  const newMo=o.newl!=null?o.newl/3:o.sold!=null?o.sold/3*1.15:null;
  const off=o.off2w!=null?o.off2w:(moff[o.mk]!=null?moff[o.mk]:moff['']);
  const left=newMo!=null&&off!=null?newMo*(1-off/100):null;
  const cut=o.inv!=null&&o.pdPct!=null?o.inv*o.pdPct/100:null;
  return {newMo,off,left,cut,estOff:o.off2w==null};
}
const exitOf=o=>wavg([[lin(o.dom,90,25),1],[o.mos==null?null:o.mos<=4?1:1-lin(o.mos,4,8),1],[lin(o.stl,92,99),1]],.34);
const futureOf=o=>wavg([[lin(jobOf(o),-2,6),25],[lin(o.cPopG,-4,8),15],[lin(o.cMig,-4,6),15],[lin(incGOf(o),8,40),15],[lin(o.ppsf2y,-5,15),20],[lin(o.zoriYoy,-1,5),10]]);
function roomScore(L,S,E,F,mos,p2y,full){
  if(L==null)return null;
  let r=ROOM_W.left*logLin(L,full?10:1,full?150:20)+ROOM_W.share*(S==null?.5:lin(S,.4,.85))+ROOM_W.exit*(E??.5)+ROOM_W.future*(F??.5);
  /* rotten food: too many unsold houses, or prices falling hard */
  if(mos!=null&&mos>8)r*=.85;
  if(p2y!=null&&p2y<-8)r*=.85;
  return Math.round(r);
}
function roomCompute(zips,D){
  if(!roomOn()||!zips.length)return false;
  CENS.mpop=CENS.mpop||metroPops(D);
  for(const o of zips){
    const f=zipFood(o,D);const exit=exitOf(o);const future=futureOf(o);
    const share=f.newMo?f.left/f.newMo:null;
    o.rm={...f,share,exit,future,room:roomScore(f.left,share,exit,future,o.mos,o.ppsf2y,false)};
  }
  return true;
}
function roomMetro(zs){
  const w=o=>Math.max(1,o.sold||1);const W=zs.reduce((s,o)=>s+w(o),0);
  const avg=f=>{let s=0,t=0;for(const o of zs){const v=f(o);if(v!=null&&isFinite(v)){s+=v*w(o);t+=w(o)}}return t/W>=.3?s/t:null};
  const sum=f=>{let s=0,n=0;for(const o of zs){const v=f(o);if(v!=null&&isFinite(v)){s+=v;n++}}return n?s:null};
  const left=sum(o=>o.rm&&o.rm.left),newMo=sum(o=>o.rm&&o.rm.newMo),cut=sum(o=>o.rm&&o.rm.cut);
  const share=left!=null&&newMo?left/newMo:null;const exit=avg(o=>o.rm&&o.rm.exit),future=avg(o=>o.rm&&o.rm.future);
  const mos=avg(o=>o.mos),p2y=avg(o=>o.ppsf2y);
  return {left,newMo,cut,share,exit,future,mos,p2y,room:roomScore(left,share,exit,future,mos,p2y,true),
    sfr:avg(o=>o.sfr),inflow:avg(inflowOf),yb:avg(o=>o.yb),own75:avg(o=>o.own75),inc:avg(incGOf),popG:avg(o=>o.cPopG),mig:avg(o=>o.cMig),job:avg(jobOf),
    full:true,rentG:avg(o=>o.zoriYoy),dom:avg(o=>o.dom),off:avg(o=>o.rm&&o.rm.off),pop:CENS.mpop&&zs[0]&&zs[0].mk[0]!=='~'?CENS.mpop[zs[0].mk]:null};
}
const p100=v=>v==null?null:Math.round(v*100);
const leftN=v=>v==null?'—':v>=10?numFmt(Math.round(v)):v.toFixed(1);
const leftTag=x=>x&&x.left!=null?`<span class="tag ${x.share>=.7?'green':x.share>=.55?'blue':'amber'}">~${leftN(x.left)} left a month</span>`:'';
function roomBars(rm){
  const v={left:logLin(rm.left,rm.full?10:1,rm.full?150:20),share:rm.share==null?null:lin(rm.share,.4,.85),exit:rm.exit,future:rm.future};
  return `<div class="mk-bars">${['left','share','exit','future'].map(k=>`<div class="mk-bar" title="${esc(ROOM_SUB[k][1])}"><span class="lab">${ROOM_SUB[k][0]} <span class="muted">· ${ROOM_W[k]}%</span></span><span class="track"><i style="width:${v[k]==null?0:Math.round(v[k]*100)}%"></i></span><b class="tnum">${v[k]==null?'n/a':Math.round(v[k]*100)}</b></div>`).join('')}</div>`;
}
const sg1=v=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
function roomFacts(x,isZip){
  const rows=[
    ['New listings a month',x.newMo!=null?`~${leftN(x.newMo)}`:'—','Redfin, single-family, in the ZIPs that fit your box (3-month average).'],
    ['Grabbed within 2 weeks',x.off!=null?`${Math.round(x.off)}%${x.estOff?' (metro typical)':''}`:'—','Share of listings under contract within 2 weeks: what the eaters take fast.'],
    ['Left over a month',x.left!=null?`~${leftN(x.left)}${x.share!=null?` (${Math.round(x.share*100)}%)`:''}`:'—','Listings still available after 2 weeks: the food left on the table for you.'],
    ['With a price cut right now',x.cut!=null?`~${leftN(x.cut)}`:'—','Active listings that already cut their price: sellers who didn’t get their number.'],
    ['Jobs (county), 2 years',x.job!=null?sgn(x.job):'—','BLS covered employment.'],
    ['Population since 2020',x.popG!=null?`${sgn(x.popG)}${x.mig!=null?` · people moving in ${sgn(x.mig)}`:''}`:'—','Census population estimates; moving in = net domestic migration.'],
    ['Household income, 5 yrs',x.inc!=null?sgn(x.inc,0):'—','Census ACS, not adjusted for inflation.'],
    ['$/sqft, 2 years',x.p2y!=null?sgn(x.p2y):'—','Redfin single-family.'],
    ['Investor signs (background)',x.sfr!=null?`${pctv(x.sfr)} of houses rented out${x.pop?` · ${numFmt(Math.round(x.pop/1000))}K people`:''}`:'—','Rented single-family houses are mostly investor-owned. Shown for background; it doesn’t change the score.'],
    ['Typical house built',x.yb?String(Math.round(x.yb)):'—','Older houses need more work: more fixer-uppers.']];
  return rows.map(([a,b,t])=>`<div title="${esc(t)}"><span class="small muted">${a}</span><b class="tnum">${b}</b></div>`).join('');
}
/* chart: share left over (x) vs food left over each month (y, log), one dot per metro */
function mkRoomChart(R){
  const ms=R.metros.filter(m=>m.key[0]!=='~'&&m.rm&&m.rm.left>0&&m.rm.share!=null).sort((a,b)=>b.sold-a.sold).slice(0,160);
  if(ms.length<5)return '';
  const narrow=window.innerWidth<640;const W=narrow?560:1000,H=narrow?520:440,L=narrow?48:56,Rr=narrow?10:14,T=16,B=narrow?50:44;const iw=W-L-Rr,ih=H-T-B;
  const xs=ms.map(m=>m.rm.share),ys=ms.map(m=>Math.log10(m.rm.left));
  const x0=Math.max(0,Math.min(...xs)-.03),x1=Math.min(1,Math.max(...xs)+.03),y0=Math.min(...ys)-.08,y1=Math.max(...ys)+.08;
  const X=v=>L+(v-x0)/(x1-x0)*iw,Y=v=>T+(1-(v-y0)/(y1-y0))*ih;
  const mx=median(xs),my=median(ys);const maxS=Math.max(...ms.map(m=>m.sold));
  const rad=m=>3+9*Math.sqrt(m.sold/maxS);
  const top=[...ms].sort((a,b)=>b.score-a.score).slice(0,8);const topSet=new Set(top.map(m=>m.key));
  const sel=state.mk.metro;const P=m=>[X(m.rm.share),Y(Math.log10(m.rm.left))];
  const dots=[...ms].sort((a,b)=>topSet.has(a.key)-topSet.has(b.key)||b.sold-a.sold).map(m=>{const [cx,cy]=P(m);const on=sel===m.key;
    return `<circle class="rc-dot${topSet.has(m.key)?' top':''}${on?' sel':''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad(m).toFixed(1)}" style="fill:${mkColor(m.score,isDark())}" data-act="mk-metro" data-k="${esc(m.key)}"><title>${esc(m.label)}: room ${m.score} · ~${leftN(m.rm.left)} listings left over a month (${Math.round(m.rm.share*100)}%)</title></circle>`}).join('');
  const fs=narrow?19:11.5,placed=[];
  const labels=top.map(m=>{const [cx,cy]=P(m);const r=rad(m);const t=m.label.split(',')[0].split('-')[0];const tw=t.length*fs*.64+6;
    const tries=[[cx+r+4,cy+fs*.35,'start'],[cx-r-4,cy+fs*.35,'end'],[cx-tw/2,cy-r-5,'start'],[cx-tw/2,cy+r+fs,'start'],[cx+r+4,cy-fs*.6,'start'],[cx+r+4,cy+fs*1.2,'start']];
    const box=([x,y,a])=>{const x0=a==='end'?x-tw:x;return [x0,y-fs*.85,x0+tw,y+fs*.2]};
    const dotsAround=top.filter(o=>o!==m).map(o=>{const [ox,oy]=P(o),rr=rad(o)+3;return [ox-rr,oy-rr,ox+rr,oy+rr]});
    const pad=fs*.5;const hit=b=>b[0]<L||b[2]>W-2||b[1]<T||[...placed,...dotsAround].some(q=>b[0]-pad<q[2]&&b[2]+pad>q[0]&&b[1]<q[3]&&b[3]>q[1]);
    const pick=tries.find(c=>!hit(box(c)))||tries[0];placed.push(box(pick));
    return `<text class="rc-lab" x="${pick[0].toFixed(1)}" y="${pick[1].toFixed(1)}" text-anchor="${pick[2]}">${esc(t)}</text>`}).join('');
  const qx=X(mx),qy=Y(my);
  const ticks=[10,20,50,100,200,500,1000,2000].filter(v=>Math.log10(v)>=y0&&Math.log10(v)<=y1).map(v=>`<text class="rc-tick" x="${L-6}" y="${(Y(Math.log10(v))+4).toFixed(1)}" text-anchor="end">${v>=1000?v/1000+'K':v}</text><line class="rc-grid" x1="${L}" x2="${L+iw}" y1="${Y(Math.log10(v)).toFixed(1)}" y2="${Y(Math.log10(v)).toFixed(1)}"/>`).join('');
  return `<section class="card" id="mk-room"><div class="card-head"><span class="ci green">${ico('target')}</span><div><h2>Food left on the table</h2><p>Each dot is a metro (biggest ${ms.length} by sales). Up = more listings a month that nobody grabbed in 2 weeks. Right = the eaters leave a bigger share. Bigger dot = more sales.</p></div></div>
  <div class="rc-wrap"><svg class="rc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter chart of metros: share of listings left over against listings left over each month">
    ${ticks}
    <rect class="rc-q" x="${qx.toFixed(1)}" y="${T}" width="${(L+iw-qx).toFixed(1)}" height="${(qy-T).toFixed(1)}"/>
    <text class="rc-qlab" x="${L+iw-8}" y="${T+16}" text-anchor="end">Lots of food left</text>
    <text class="rc-qlab dim" x="${L+8}" y="${T+16}">Big table, hungry eaters</text>
    <text class="rc-qlab dim" x="${L+iw-8}" y="${T+ih-8}" text-anchor="end">Small table, few eaters</text>
    <line class="rc-mid" x1="${qx.toFixed(1)}" x2="${qx.toFixed(1)}" y1="${T}" y2="${T+ih}"/><line class="rc-mid" x1="${L}" x2="${L+iw}" y1="${qy.toFixed(1)}" y2="${qy.toFixed(1)}"/>
    <line class="rc-axis" x1="${L}" x2="${L+iw}" y1="${T+ih}" y2="${T+ih}"/><line class="rc-axis" x1="${L}" x2="${L}" y1="${T}" y2="${T+ih}"/>
    <text class="rc-ax" x="${L+iw/2}" y="${H-12}" text-anchor="middle">${narrow?'Share left over after 2 weeks →':'Share of new listings still available after 2 weeks  →  more left over'}</text>
    <text class="rc-ax" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">Listings left over a month</text>
    ${dots}${labels}</svg></div>
  <p class="xs muted">The 8 best for room at the table are labeled. Click a dot to open that metro. Lines mark the middle of the pack. Counts are for ZIPs that fit your box.</p></section>`;
}
