/* ================= Room at the table: good numbers, few investors, a good future ================= */
/* Food = deals (the strategy score, plus old houses, older owners, stuck homes).
   Eaters = investors already there (rented single-family share and how fast it rose, how hot listings sell,
   metro size, Redfin's investor share). Future = jobs, people moving in, incomes, prices and rents. */
const CENS={rows:0,meta:null};
const ROOM_W={food:30,room:45,future:25};
const ROOM_SUB={
  food:['Food (deals)','The strategy score (sales, speed, exit, trend, motivated sellers) plus old houses, older owners and stuck homes.'],
  room:['Few eaters','The opposite of competition: fewer houses already owned by investors, slower growth in investor ownership, listings that don’t get snapped up, a smaller and less famous metro.'],
  future:['Future','County jobs over 2 years, population and people moving in since 2020, income growth, $/sqft over 2 years, rent growth.']
};
function joinCensus(c,byZip){
  if(!c||!Array.isArray(c.rows)||!Array.isArray(c.cols))return;
  const C=c.cols,ci={};(c.ccols||[]).forEach((k,i)=>ci[k]=i);const cs=c.counties||{};let n=0;
  for(const r of c.rows){const o=byZip[r[0]];if(!o)continue;n++;
    for(let i=1;i<C.length;i++){const k=C[i];o[k==='pop'?'zpop':k==='pop0'?'zpop0':k]=r[i]}
    const cr=o.cty&&cs[o.cty];
    if(cr){o.cPopG=cr[ci.popG];o.cPopYoy=cr[ci.popYoy];o.cMig=cr[ci.mig];o.cPop=cr[ci.pop];o.cJobYoy=cr[ci.jobYoy];o.cJob2y=cr[ci.job2y];o.cName=cr[ci.name]}}
  CENS.rows=n;CENS.mpop=null;CENS.meta={acsYear:c.acsYear,baseYear:c.baseYear,popVintage:c.popVintage,qcew:c.qcew};
}
const roomOn=()=>CENS.rows>1000;
function mkLens(){return mkSet().lens==='room'&&roomOn()?'room':'stats'}
/* percentile of v among the ZIPs that fit the box (0 = lowest) */
function prFn(vals){
  const s=vals.filter(v=>v!=null&&isFinite(v)).sort((a,b)=>a-b);const n=s.length;if(n<25)return ()=>null;
  return v=>{if(v==null||!isFinite(v))return null;let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(s[m]<v)lo=m+1;else hi=m}let e=lo;while(e<n&&s[e]===v)e++;return (lo+e)/2/n};
}
function wavg(pairs,minCov=.4){let s=0,t=0,all=0;for(const [v,w] of pairs){all+=w;if(v!=null&&isFinite(v)){s+=v*w;t+=w}}return t&&t/all>=minCov?s/t:null}
const gPct=(a,b)=>a!=null&&b?(a/b-1)*100:null;
const inflowOf=o=>o.sfr!=null&&o.sfr0!=null?o.sfr-o.sfr0:null;
const incGOf=o=>gPct(o.inc,o.inc0);
const jobOf=o=>o.cJob2y!=null?o.cJob2y:o.cJobYoy!=null?o.cJobYoy*2:null;
function metroPops(D){const m={};for(const o of D.rows)if(o.zpop)m[o.mk]=(m[o.mk]||0)+o.zpop;return m}
function roomCompute(zips,D){
  if(!roomOn()||!zips.length)return false;
  const P={};const col=(k,f)=>{P[k]=prFn(zips.map(f))};
  col('sfr',o=>o.sfr);col('inflow',inflowOf);col('stl',o=>o.stl);col('above',o=>o.above);col('off2w',o=>o.off2w);col('dom',o=>o.dom);
  col('old',o=>o.yb!=null?-o.yb:null);col('aged',o=>o.own75);col('stuck',o=>o.ovac);
  const mpop=CENS.mpop||(CENS.mpop=metroPops(D));
  for(const o of zips){
    const fund=o.score!=null?o.score/100:null;
    const ps=P.stuck(o.ovac);/* some stuck homes = motivated owners; a lot = a rough area */
    const food=wavg([[fund,60],[P.old(o.yb!=null?-o.yb:null),15],[P.aged(o.own75),15],[ps==null?null:Math.min(ps,o.ovac>15?.4:1),10]],.6);
    const pd=P.dom(o.dom);const heat=wavg([[P.stl(o.stl),1],[P.above(o.above),1],[P.off2w(o.off2w),1],[pd!=null?1-pd:null,1]]);
    const inv=D.investors[o.metro];const mp=o.mk[0]==='~'?null:mpop[o.mk];
    const eaters=wavg([[P.sfr(o.sfr),25],[P.inflow(inflowOf(o)),25],[heat,25],[mp?lin(Math.log(mp),Math.log(120e3),Math.log(4e6)):(o.mk[0]==='~'?0:null),15],[inv&&inv.share!=null?lin(inv.share,10,30):null,10]],.5);
    const future=wavg([[lin(jobOf(o),-2,6),25],[lin(o.cPopG,-4,8),15],[lin(o.cMig,-4,6),15],[lin(incGOf(o),8,40),15],[lin(o.ppsf2y,-5,15),20],[lin(o.zoriYoy,-1,5),10]]);
    let room=null;
    if(food!=null&&eaters!=null){room=(ROOM_W.food*food+ROOM_W.room*(1-eaters)+ROOM_W.future*(future??.5));
      /* you still have to sell the finished house */
      if((o.dom!=null&&o.dom>100)||(o.stl!=null&&o.stl<91))room*=.85;
      if(o.ppsf2y!=null&&o.ppsf2y<-8)room*=.85;
      room=Math.round(room)}
    o.rm={food,eaters,future,heat,room};
  }
  return true;
}
function roomMetro(zs){
  const w=o=>Math.max(1,o.sold||1);const W=zs.reduce((s,o)=>s+w(o),0);
  const avg=f=>{let s=0,t=0;for(const o of zs){const v=f(o);if(v!=null&&isFinite(v)){s+=v*w(o);t+=w(o)}}return t/W>=.3?s/t:null};
  return {food:avg(o=>o.rm&&o.rm.food),eaters:avg(o=>o.rm&&o.rm.eaters),future:avg(o=>o.rm&&o.rm.future),heat:avg(o=>o.rm&&o.rm.heat),
    sfr:avg(o=>o.sfr),inflow:avg(inflowOf),yb:avg(o=>o.yb),own75:avg(o=>o.own75),ovac:avg(o=>o.ovac),inc:avg(incGOf),popG:avg(o=>o.cPopG),mig:avg(o=>o.cMig),job:avg(jobOf),
    p2y:avg(o=>o.ppsf2y),rentG:avg(o=>o.zoriYoy),pop:CENS.mpop&&zs[0]&&zs[0].mk[0]!=='~'?CENS.mpop[zs[0].mk]:null};
}
const compWord=e=>e==null?'—':e<.3?'Low':e<.45?'Moderate':e<.6?'Busy':'Crowded';
const compCls=e=>e==null?'':e<.3?'green':e<.45?'blue':e<.6?'amber':'red';
const p100=v=>v==null?null:Math.round(v*100);
function roomBars(rm){
  return `<div class="mk-bars">${['room','food','future'].map(k=>{const v=k==='room'?(rm.eaters==null?null:1-rm.eaters):rm[k];return `<div class="mk-bar" title="${esc(ROOM_SUB[k][1])}"><span class="lab">${ROOM_SUB[k][0]} <span class="muted">· ${ROOM_W[k]}%</span></span><span class="track"><i style="width:${v==null?0:Math.round(v*100)}%"></i></span><b class="tnum">${v==null?'n/a':Math.round(v*100)}</b></div>`}).join('')}</div>`;
}
const sg1=v=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
function roomFacts(x,isZip){
  const rows=[
    ['Houses already rented out',x.sfr!=null?`${pctv(x.sfr)} of single-family homes${x.inflow!=null?` · ${sg1(x.inflow)} pts in ${CENS.meta&&CENS.meta.baseYear?CENS.meta.acsYear-CENS.meta.baseYear:5} yrs`:''}`:'—','Rented single-family homes are mostly investor-owned. High or rising means investors are already here.'],
    ['How hot listings sell',x.heat!=null?`${compWord(x.heat)} (${p100(x.heat)}/100)`:'—','Sale-to-list, share sold over asking, share under contract in 2 weeks, days on market, against other ZIPs in your box.'],
    ['Metro size',x.pop?`${numFmt(x.pop)} people`:isZip?'—':'Outside metro areas','Bigger, famous metros draw out-of-state investors and funds.'],
    ['Typical house built',x.yb?String(Math.round(x.yb)):'—','Older houses need more work: more fixer-uppers.'],
    ['Owners aged 75+',x.own75!=null?pctv(x.own75,1):'—','Estates and downsizing ahead: future off-market sellers.'],
    ['Jobs (county), 2 years',x.job!=null?sgn(x.job):'—','BLS covered employment.'],
    ['Population since 2020',x.popG!=null?`${sgn(x.popG)}${x.mig!=null?` · people moving in ${sgn(x.mig)}`:''}`:'—','Census population estimates; moving in = net domestic migration.'],
    ['Household income, 5 yrs',x.inc!=null?sgn(x.inc,0):'—','Census ACS, not adjusted for inflation.'],
    ['$/sqft, 2 years',x.p2y!=null?sgn(x.p2y):'—','Redfin single-family.']];
  return rows.map(([a,b,t])=>`<div title="${esc(t)}"><span class="small muted">${a}</span><b class="tnum">${b}</b></div>`).join('');
}
/* scatter: competition (x) vs food + future (y), one dot per metro */
function mkRoomChart(R){
  const ms=R.metros.filter(m=>m.key[0]!=='~'&&m.rm&&m.rm.eaters!=null&&m.rm.food!=null).sort((a,b)=>b.sold-a.sold).slice(0,160);
  if(ms.length<5)return '';
  const narrow=window.innerWidth<640;const W=narrow?560:1000,H=narrow?520:440,L=narrow?40:46,Rr=narrow?10:14,T=16,B=narrow?50:44;const iw=W-L-Rr,ih=H-T-B;
  const opp=m=>.6*m.rm.food+.4*(m.rm.future??.5);
  const xs=ms.map(m=>m.rm.eaters),ys=ms.map(opp);
  const x0=Math.max(0,Math.min(...xs)-.03),x1=Math.min(1,Math.max(...xs)+.03),y0=Math.max(0,Math.min(...ys)-.03),y1=Math.min(1,Math.max(...ys)+.03);
  const X=v=>L+(v-x0)/(x1-x0)*iw,Y=v=>T+(1-(v-y0)/(y1-y0))*ih;
  const mx=median(xs),my=median(ys);const maxS=Math.max(...ms.map(m=>m.sold));
  const rad=m=>3+9*Math.sqrt(m.sold/maxS);
  const top=[...ms].sort((a,b)=>b.score-a.score).slice(0,8);const topSet=new Set(top.map(m=>m.key));
  const sel=state.mk.metro;
  const dots=[...ms].sort((a,b)=>topSet.has(a.key)-topSet.has(b.key)||b.sold-a.sold).map(m=>{const cx=X(m.rm.eaters),cy=Y(opp(m));const on=sel===m.key;
    return `<circle class="rc-dot${topSet.has(m.key)?' top':''}${on?' sel':''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad(m).toFixed(1)}" style="fill:${mkColor(m.score,isDark())}" data-act="mk-metro" data-k="${esc(m.key)}"><title>${esc(m.label)}: room ${m.score} · competition ${compWord(m.rm.eaters).toLowerCase()} · ${numFmt(m.sold)} sales</title></circle>`}).join('');
  /* place labels so they don't run into each other: try right, left, above, below */
  const fs=narrow?19:11.5,placed=[];
  const labels=top.map(m=>{const cx=X(m.rm.eaters),cy=Y(opp(m));const r=rad(m);const t=m.label.split(',')[0].split('-')[0];const tw=t.length*fs*.64+6;
    const tries=[[cx+r+4,cy+fs*.35,'start'],[cx-r-4,cy+fs*.35,'end'],[cx-tw/2,cy-r-5,'start'],[cx-tw/2,cy+r+fs,'start'],[cx+r+4,cy-fs*.6,'start'],[cx+r+4,cy+fs*1.2,'start']];
    const box=([x,y,a])=>{const x0=a==='end'?x-tw:x;return [x0,y-fs*.85,x0+tw,y+fs*.2]};
    const dotsAround=top.filter(o=>o!==m).map(o=>{const ox=X(o.rm.eaters),oy=Y(opp(o)),rr=rad(o)+3;return [ox-rr,oy-rr,ox+rr,oy+rr]});
    const pad=fs*.5;const hit=b=>b[0]<L||b[2]>W-2||b[1]<T||[...placed,...dotsAround].some(q=>b[0]-pad<q[2]&&b[2]+pad>q[0]&&b[1]<q[3]&&b[3]>q[1]);
    const pick=tries.find(c=>!hit(box(c)))||tries[0];placed.push(box(pick));
    return `<text class="rc-lab" x="${pick[0].toFixed(1)}" y="${pick[1].toFixed(1)}" text-anchor="${pick[2]}">${esc(t)}</text>`}).join('');
  const qx=X(mx),qy=Y(my);
  return `<section class="card" id="mk-room"><div class="card-head"><span class="ci green">${ico('target')}</span><div><h2>Food vs. eaters</h2><p>Each dot is a metro (biggest ${ms.length} by sales). Up = more deals and a better future. Left = fewer investors already there. Bigger dot = more sales.</p></div></div>
  <div class="rc-wrap"><svg class="rc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter chart of metros: competition against deals and future">
    <rect class="rc-q" x="${L}" y="${T}" width="${(qx-L).toFixed(1)}" height="${(qy-T).toFixed(1)}"/>
    <text class="rc-qlab" x="${L+8}" y="${T+16}">More food, fewer eaters</text>
    <text class="rc-qlab dim" x="${L+iw-8}" y="${T+16}" text-anchor="end">Good deals, crowded table</text>
    <text class="rc-qlab dim" x="${L+8}" y="${T+ih-8}">Quiet, thin pickings</text>
    <line class="rc-mid" x1="${qx.toFixed(1)}" x2="${qx.toFixed(1)}" y1="${T}" y2="${T+ih}"/><line class="rc-mid" x1="${L}" x2="${L+iw}" y1="${qy.toFixed(1)}" y2="${qy.toFixed(1)}"/>
    <line class="rc-axis" x1="${L}" x2="${L+iw}" y1="${T+ih}" y2="${T+ih}"/><line class="rc-axis" x1="${L}" x2="${L}" y1="${T}" y2="${T+ih}"/>
    <text class="rc-ax" x="${L+iw/2}" y="${H-12}" text-anchor="middle">${narrow?'← fewer investors · more investors →':'Competition: fewer investors  ←  →  more investors'}</text>
    <text class="rc-ax" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">Deals + future</text>
    ${dots}${labels}</svg></div>
  <p class="xs muted">The 8 best for room at the table are labeled. Click a dot to open that metro. Lines mark the middle of the pack.</p></section>`;
}
