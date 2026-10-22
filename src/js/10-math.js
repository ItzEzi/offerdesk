/* ================= deal helpers ================= */
/* buy box: emailed deals asking more than his cap are kept but tucked away (hidden by default, not researched, not counted as new) */
const boxCap=()=>+((state.settings.research||{}).maxPrice)||0;
const overBox=d=>{const c=boxCap();if(!c||!d||d.source!=='wholesaler'||d.example||d.starred||d.favorite||!['new','sent'].includes(d.stage||'new'))return false;const p=curList(d);return p!=null&&p>c};
function curList(d){const h=d.priceHistory||[];return h.length?h[h.length-1].price:(d.listPrice??null)}
function origList(d){const h=d.priceHistory||[];return h.length?h[0].price:(d.listPrice??null)}
const priceDropped=d=>(d.priceHistory||[]).length>1&&curList(d)<origList(d);
const outs=d=>(d.thread||[]).filter(t=>t.dir==='out');
const ins=d=>(d.thread||[]).filter(t=>t.dir==='in');
const lastAt=a=>a.length?a[a.length-1].at:null;
function lastOurPrice(d){const o=(d.offers||[]).filter(x=>x.by==='us');return o.length?o[o.length-1].price:null}
function lastTheirPrice(d){const o=(d.offers||[]).filter(x=>x.by==='them');return o.length?o[o.length-1].price:null}
function firstOfferAt(d){const o=(d.offers||[]).find(x=>x.by==='us');return o?o.at:(outs(d)[0]||{}).at||null}
const ourCount=d=>(d.offers||[]).filter(x=>x.by==='us').length;
function replyWaiting(d){const li=lastAt(ins(d)),lo=lastAt(outs(d));return !!li&&(!lo||li>lo)&&!['dead','closed'].includes(d.stage)&&!d.optedOut&&!(d.source==='wholesaler'&&!lo)}
function followDue(d){
  if(!d.follow||d.optedOut||['dead','closed','contract'].includes(d.stage)||replyWaiting(d)||d.draft)return null;
  const days=state.settings.followDays||[2,5,10,20];if(d.follow.step>=days.length)return null;
  const due=new Date(d.follow.base).getTime()+days[d.follow.step]*DAY;
  return {due,step:d.follow.step,overdue:Date.now()>=due};
}
function dom(d){if(d.listedDate)return daysSince(d.listedDate);if(d.domAtAdd!=null)return d.domAtAdd+(daysSince(d.created)||0);return null}
const stratOf=d=>d.strategy||state.settings.buy.strategy;
function offerStatus(d){
  if(d.stage==='dead')return ['Archived','slate'];
  if(d.stage==='closed')return ['Closed','blue'];
  if(d.stage==='contract')return ['Under contract','green'];
  if(d.draft&&!ourCount(d))return ['Draft ready','purple'];
  if(ins(d).length&&ourCount(d))return ['Responded','green'];
  if(ourCount(d))return ['Offer sent','slate'];
  return ['Not sent','amber'];
}
const mlsOf=d=>MLS_STATUS[d.mlsStatus||(d.source==='wholesaler'?'off_market':'for_sale')]||MLS_STATUS.unknown;

/* ================= ceiling math ================= */
function calc(d){
  const s=state.settings.buy;const strat=stratOf(d);
  const roi=((d.targetRoi??s.targetRoi)||0)/100;
  const A=d.arv||null,R=d.rehab||0,L=curList(d);
  const b=(s.buyCostPct||0)/100,sc=(s.sellCostPct||0)/100,H=(s.holdCostMonthly||0)*(s.holdMonths||0);
  const c={strat,A,R,L,H,b,sc,roi,ready:!!A};
  if(!A)return c;
  c.net=A*(1-sc);
  const maoRoi=(c.net/(1+roi)-R-H)/(1+b);
  const maoProfit=(c.net-R-H-(s.minProfit||0))/(1+b);
  c.flipBinding=maoRoi<=maoProfit?'roi':'profit';
  c.maoFlip=Math.max(0,floor500(Math.min(maoRoi,maoProfit)));
  c.buyerMax=A*(s.wsBuyerPct||70)/100-R;
  c.maoWs=Math.max(0,floor500(c.buyerMax-(s.wsFee||0)));
  c.maoCalc=strat==='wholesale'?c.maoWs:c.maoFlip;
  c.locked=d.lockedMao>0;
  c.mao=c.locked?d.lockedMao:c.maoCalc;
  let open=floor500(c.mao*(1-(s.anchorGap||0)/100));
  if(L)open=Math.min(open,floor500(L*.97));
  c.opening=Math.max(0,open);
  c.target=d.targetPrice>0?d.targetPrice:round500(c.opening+(c.mao-c.opening)*((s.targetPct??40)/100));
  c.flipAt=P=>{if(P==null)return null;const cost=P*(1+b)+R+H;const profit=c.net-cost;return {cost,profit,roi:cost>0?profit/cost:null}};
  c.wsAt=P=>P==null?null:{fee:c.buyerMax-P};
  c.resultAt=P=>{if(P==null)return null;if(strat==='wholesale'){const f=c.buyerMax-P;return {val:f,label:money(f)+' fee',ok:f>=0}}const r=c.flipAt(P);return {val:r.profit,label:money(r.profit)+' · '+pct(r.roi,1)+' ROI',ok:r.profit>=0}};
  c.dead=c.mao<=0;
  const cr=state.settings.creative;c.sfCap=floor500(c.mao*(1+(cr.maxOverPct||0)/100));
  const w=weightedArv(d);
  if(w&&w.arv){const d2=Object.assign({},d,{arv:w.arv,lockedMao:null});const tmp=calcBase(d2);c.compArv=w.arv;c.compCeiling=tmp}
  return c;
}
function calcBase(d){const s=state.settings.buy;const strat=stratOf(d);const roi=((d.targetRoi??s.targetRoi)||0)/100;const A=d.arv,R=d.rehab||0;const b=s.buyCostPct/100,sc=s.sellCostPct/100,H=s.holdCostMonthly*s.holdMonths;const net=A*(1-sc);
  if(strat==='wholesale')return Math.max(0,floor500(A*s.wsBuyerPct/100-R-s.wsFee));
  return Math.max(0,floor500(Math.min((net/(1+roi)-R-H)/(1+b),(net-R-H-s.minProfit)/(1+b))))}
function walkLines(d,c){
  const s=state.settings.buy;
  if(c.strat==='wholesale')return [['After-repair value',c.A],[`Your buyer pays up to ${s.wsBuyerPct}% of ARV`,-(c.A-c.A*s.wsBuyerPct/100)],['Repairs',-c.R],['Your assignment fee',-(c.buyerMax-c.maoWs)],['Max allowable offer',c.maoWs,'total']];
  const profit=c.net-c.R-c.H-c.maoFlip*(1+c.b);
  return [['After-repair value',c.A],[`Selling costs (${s.sellCostPct}%)`,-(c.A*c.sc)],['Repairs',-c.R],[`Holding (${s.holdMonths} mo × ${money(s.holdCostMonthly)})`,-c.H],[`Your profit at ceiling (${pct(profit/(c.maoFlip*(1+c.b)+c.R+c.H),0)} ROI)`,-profit],[`Buying costs (${s.buyCostPct}%)`,-(c.maoFlip*c.b)],['Max allowable offer',c.maoFlip,'total']];
}
function nextLadder(d,c){
  const last=lastOurPrice(d);if(last==null)return c.opening;
  const n=ourCount(d),rounds=state.settings.buy.maxRounds||4;
  if(n>=rounds-1)return Math.max(last,c.mao);
  const fr=[.5,.35,.25,.2][Math.min(n-1,3)];
  return Math.max(last,Math.min(c.mao,round500(last+(c.mao-last)*fr)));
}
function verdict(d,c){
  const L=curList(d);
  if(!c.ready)return {cls:'slate',text:'Needs ARV'};
  if(c.dead)return {cls:'red',text:'No deal at this ARV'};
  if(L==null)return {cls:'slate',text:'Ceiling '+moneyK(c.mao)};
  if(L<=c.mao)return {cls:'green',text:'Works at ask'};
  const gap=(L-c.mao)/L;return {cls:gap<=.12?'amber':'red',text:pct(gap,0)+' over ceiling'};
}
function weightedArv(d){const g=compGrid(d);const arv=(d.arvMode==='median'?g.median:g.smart)||g.smart||g.median;if(!arv)return null;return {arv,parts:g.rows.map(r=>({share:r.share||0})),g}}
/* ---------- comps: appraiser-style grid ---------- */
const median=a=>{const s=a.filter(v=>v!=null&&isFinite(v)).sort((p,q)=>p-q);if(!s.length)return null;const k=Math.floor(s.length/2);return s.length%2?s[k]:(s[k-1]+s[k])/2};
function compGrid(d){
  const S=d.sqft||null,B=d.beds??null,Ba=d.baths??null;
  const rows=(d.comps||[]).map((x,i)=>{
    const st=x.status||'sold';const price=x.price>0?x.price:null;const psf=price&&x.sqft?price/x.sqft:null;
    const adj=[];let total=0;
    if(price&&S&&x.sqft&&psf&&x.sqft!==S){const v=Math.round((S-x.sqft)*psf*0.4/100)*100;if(v){adj.push(['Size',v]);total+=v}}
    if(price&&B!=null&&x.beds!=null&&B!==x.beds){const v=Math.round((B-x.beds)*price*0.03/100)*100;adj.push(['Beds',v]);total+=v}
    if(price&&Ba!=null&&x.baths!=null&&Ba!==x.baths){const v=Math.round((Ba-x.baths)*price*0.04/100)*100;adj.push(['Baths',v]);total+=v}
    const adjPrice=price!=null?price+total:null;const net=price?Math.abs(total)/price:null;
    const ageMo=x.soldDate?Math.max(0,(Date.now()-new Date(x.soldDate).getTime())/(30*DAY)):null;
    let m=100;
    m-=x.dist!=null?Math.min(30,x.dist*30):8;
    if(st==='sold')m-=ageMo!=null?Math.min(25,Math.max(0,ageMo-3)*2.5):8;
    if(S&&x.sqft)m-=Math.min(20,Math.abs(x.sqft-S)/S*60);
    if(B!=null&&x.beds!=null)m-=Math.min(10,Math.abs(B-x.beds)*5);
    if(Ba!=null&&x.baths!=null)m-=Math.min(8,Math.abs(Ba-x.baths)*4);
    if(net!=null&&net>.15)m-=Math.min(10,(net-.15)*50);
    m=Math.max(1,Math.round(m));
    const reno=x.reno!==false;const use=st==='sold'&&reno&&!x.skip&&adjPrice>0;
    return {i,x,st,price,psf,adj,total,adjPrice,net,match:m,ageMo,reno,use,share:0};
  });
  const used=rows.filter(r=>r.use);let smart=null;
  if(used.length){let tw=0,tv=0;for(const r of used){r.w=Math.pow(r.match/100,2);tw+=r.w;tv+=r.w*r.adjPrice}for(const r of used)r.share=r.w/tw;smart=floor500(tv/tw)}
  const medPsf=median(used.map(r=>r.psf));const med=medPsf&&S?floor500(medPsf*S):(used.length?floor500(median(used.map(r=>r.price))):null);
  const sup=used.slice().sort((a,b)=>b.match-a.match)[0]||null;
  const asIs=rows.filter(r=>r.st==='sold'&&!r.reno&&!r.x.skip&&r.psf);const fs=rows.filter(r=>(r.st==='for_sale'||r.st==='pending')&&r.psf&&!r.x.skip);
  const vals=used.map(r=>r.adjPrice);let cv=null;
  if(vals.length>1){const mean=vals.reduce((a,b)=>a+b,0)/vals.length;cv=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length-1))/mean}
  const close=used.filter(r=>(r.x.dist==null||r.x.dist<=0.75)&&(r.ageMo==null||r.ageMo<=9)).length;
  const conf=!used.length?null:used.length>=4&&close>=3&&cv!=null&&cv<=.10?'high':used.length>=3&&cv!=null&&cv<=.18?'medium':'low';
  return {rows,used,smart,median:med,medPsf,sup,asIsPsf:median(asIs.map(r=>r.psf)),asIsN:asIs.length,fsPsf:median(fs.map(r=>r.psf)),fsN:fs.length,cv,conf};
}
/* ---------- market signal: has the market been refusing this house? ---------- */
function marketSignal(d){
  if(d.source==='wholesaler')return null;
  const h=d.priceHistory||[];let cuts=0;for(let i=1;i<h.length;i++)if(h[i].price<h[i-1].price)cuts++;
  const o=origList(d),L=curList(d);const drop=o&&L&&o>L?(o-L)/o:0;const dm=dom(d);const avg=zipDom(d);
  const rejection=(cuts>=2&&drop>=.10&&dm!=null&&dm>=90)||(drop>=.2&&dm!=null&&dm>=60);
  const stale=!rejection&&((cuts>=1&&dm!=null&&dm>=(avg||60))||(dm!=null&&(avg?dm>=avg*2:dm>=120)));
  if(!rejection&&!stale)return null;
  const parts=[];if(cuts)parts.push(`${cuts} price cut${cuts>1?'s':''}`);if(drop>=.01)parts.push(`−${Math.round(drop*100)}% from ${money(o)}`);if(dm!=null)parts.push(`~${dm} days on market${avg?` (ZIP average ${avg})`:''}`);
  return {level:rejection?'rejection':'stale',cuts,drop,dom:dm,text:parts.join(', ')};
}
function amort(P,ratePct,years){const n=years*12;if(!P||!n)return 0;const r=ratePct/100/12;return r===0?P/n:P*r/(1-Math.pow(1+r,-n))}
function ceilingCheck(text,d,c,cap){
  if(!c.ready||!text)return [];
  const allowed=[curList(d),origList(d),d.listPrice,c.A,d.rehab,d.wsClaims&&d.wsClaims.arv,d.wsClaims&&d.wsClaims.rehab,...(d.priceHistory||[]).map(p=>p.price),...(d.offers||[]).filter(o=>o.by==='them').map(o=>o.price),...(d.comps||[]).map(x=>x.price)].filter(v=>v!=null&&isFinite(v));
  const lim=cap||c.mao;const bad=[];const re=/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kKmM])?(?![\w])/g;let m;
  while((m=re.exec(text))){let v=parseFloat(m[1].replace(/,/g,''));if(m[2])v*=/k/i.test(m[2])?1e3:1e6;v=Math.round(v);
    if(v>lim&&v<c.A*1.6&&!allowed.some(a=>Math.abs(a-v)<=Math.max(600,a*.006)))bad.push(v)}
  return [...new Set(bad)];
}
const OPTOUT=/\b(unsubscribe|remove me|do not (?:contact|text|email|call)|don'?t (?:contact|text|email|call)|stop (?:texting|emailing|contacting|messaging)|take me off|opt(?:-| )?out)\b/i;
function looksOptOut(text,ch){if(!text)return false;if(ch==='sms'&&/^\s*stop\s*\.?\s*$/i.test(text))return true;return OPTOUT.test(text)}

/* ================= seller finance & rental ================= */
function sfDefaults(d,c){const cr=state.settings.creative;const price=c.ready?c.sfCap:(curList(d)||0);const downPct=cr.maxDownPct;const rate=cr.maxRate;const payment=Math.round(amort(price*(1-downPct/100),rate,cr.termYears));return {price,downPct,rate,payment,rent:d.rent||d.rentEst||0,expenses:state.settings.rental.taxInsMonthly+Math.round(((d.rent||d.rentEst||0))*(state.settings.rental.maintPct+state.settings.rental.vacancyPct)/100)}}
function sfCalc(d,c){
  const v=Object.assign(sfDefaults(d,c),d.sf||{});
  const down=v.price*v.downPct/100,P=v.price-down,r=v.rate/100/12,T=v.payment||0;
  const interest1=P*r,principal1=T-interest1;
  let months=null;if(T>0){if(r===0)months=P/T;else if(T>interest1)months=-Math.log(1-r*P/T)/Math.log(1+r)}
  const totalSeller=months!=null?down+T*months:null;
  const cf=(v.rent||0)-T-(v.expenses||0);
  const cashIn=down+(d.rehab||0)+v.price*.02;
  const ask=curList(d)||null;
  return {v,down,P,T,interest1,principal1,months,years:months!=null?months/12:null,totalSeller,overAsk:ask&&totalSeller!=null?totalSeller-ask:null,overAskPct:ask&&totalSeller!=null?(totalSeller-ask)/ask:null,cf,annual:cf*12,cashIn,coc:cashIn>0?cf*12/cashIn:null,roiDown:down>0?cf*12/down:null};
}
function rentalCalc(d,c,P){
  const R=state.settings.rental;const rent=d.rent||d.rentEst||null;if(!rent)return null;
  const price=P!=null?P:(lastOurPrice(d)??(c&&c.ready?c.opening:null)??curList(d)??0);
  const closing=Math.round(price*.03);const allIn=price+(d.rehab||0)+closing;
  const taxMo=d.taxYr!=null?d.taxYr/12:null,insMo=d.insMo!=null?d.insMo:null;
  const fixed=taxMo!=null||insMo!=null?(taxMo||0)+(insMo||0):R.taxInsMonthly;
  const hoa=d.hoa||0,mgmt=rent*R.mgmtPct/100,reserve=rent*(R.maintPct+R.vacancyPct)/100;
  const opex=fixed+hoa+mgmt+reserve,noi=rent-opex;
  const gross=allIn>0?rent*12/allIn:null,netYield=allIn>0?noi*12/allIn:null;
  /* BRRRR: hard money buys and fixes it, then a 30-year refi pays the hard money off */
  const months=state.settings.buy.holdMonths||5;const hmLoan=price+(d.rehab||0);
  const hmCost=Math.round(hmLoan*((R.hmPoints??2)/100+(R.hmRate??11)/100*months/12));
  const allInB=allIn+hmCost;const refi=c&&c.ready?Math.round(c.A*R.refiLtv/100):null;
  const refiNet=refi!=null?Math.round(refi*(1-(R.refiCostPct??2)/100)):null;const left=refiNet!=null?allInB-refiNet:null;
  const pay=refi?amort(refi,R.refiRate,30):null;const cfRefi=pay!=null?noi-pay:null;const piti=pay!=null?pay+fixed:null;
  const coc=left!=null&&left>0&&cfRefi!=null?cfRefi*12/left:null;
  return {rent,price,closing,allIn,fixed,hoa,mgmt,reserve,opex,noi,gross,netYield,cap:netYield,onePct:allIn>0?rent/allIn:null,hmCost,allInB,refi,refiNet,left,pay,piti,cfRefi,coc,infinite:left!=null&&left<=0&&cfRefi!=null&&cfRefi>0};
}

/* ================= deal score (0-100) and best exit ================= */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scoreMap=(v,t)=>v==null||!isFinite(v)||!(t>0)?0:v>=t?80+Math.min(20,(v/t-1)*40):Math.max(0,v/t*80);
function stratScores(d,c,P){
  const s=state.settings.buy;const out={};
  const f=c.flipAt(P);out.flip={score:Math.round(Math.min(scoreMap(f.roi,c.roi||.2),scoreMap(f.profit,s.minProfit||30000))),profit:f.profit,roi:f.roi};
  const fee=c.buyerMax-P;out.wholesale={score:Math.round(scoreMap(fee,s.wsFee||10000)),fee};
  const r=rentalCalc(d,c,P);
  if(r){out.rental={score:Math.round(scoreMap(r.netYield,.10)),yield:r.netYield,noi:r.noi};
    let b;if(r.left<=0)b=r.cfRefi>=150?96:r.cfRefi>=0?84:50;else{b=80-(r.left/r.allInB)*200;if(r.cfRefi<0)b-=25;else if(r.cfRefi<100)b-=8}
    out.brrrr={score:Math.round(clamp(b,0,100)),left:r.left,cf:r.cfRefi,infinite:r.infinite}}
  return out;
}
function scoreMods(d,c){
  const mods=[];const g=compGrid(d);
  if(g.conf==='medium')mods.push(['Comps back the ARV with medium confidence',-4]);
  else if(g.conf==='low')mods.push(['Few or scattered comps behind the ARV',-8]);
  else if(!g.conf)mods.push(d.arvSource==='wholesaler'?['ARV is only the wholesaler’s claim',-15]:['No comps behind the ARV yet',-10]);
  const lvl=String((d.analysis&&d.analysis.level)||'').toLowerCase();if(lvl.includes('gut'))mods.push(['Full-gut rehab',-5]);
  if(d.rehab&&c.A&&d.rehab/c.A>.4)mods.push(['Repairs over 40% of ARV',-5]);
  const ms=marketSignal(d);if(ms&&ms.level==='rejection')mods.push(['Market rejection: resale risk',-8]);
  mods.push(...marketMods(d,c));
  return mods;
}
const STRAT_LABEL={flip:'Fix & flip',wholesale:'Wholesale',brrrr:'BRRRR',rental:'Rental (all cash)'};
function dealScore(d,P0,full){
  const c=calc(d);if(!c.ready)return null;
  const L=curList(d);const basis=P0!=null?P0:(lastTheirPrice(d)??L??c.mao);if(basis==null)return null;
  const mods=scoreMods(d,c);const modSum=mods.reduce((a,m)=>a+m[1],0);
  const at=P=>{const st=stratScores(d,c,P);const best=Object.entries(st).sort((a,b)=>b[1].score-a[1].score)[0];return {st,best:best[0],score:clamp(Math.round(best[1].score+modSum),0,100)}};
  const r=at(basis);const grade=r.score>=85?['Bonanza','green']:r.score>=80?['Strong','green']:r.score>=65?['Workable','blue']:r.score>=50?['Thin','amber']:['Pass','red'];
  const out={score:r.score,best:r.best,strat:r.st,mods,basis,grade};
  if(full){
    let lo=0,hi=Math.max(basis,L||0,c.A||0);if(at(lo).score<80)out.at80=null;else{for(let k=0;k<22;k++){const mid=(lo+hi)/2;if(at(mid).score>=80)lo=mid;else hi=mid}out.at80=floor500(lo)}
  }
  return out;
}
/* ================= lead tags (inbox) ================= */
function dealTags(d){
  const c=calc(d);const L=curList(d);const t=[];const txt=((d.description||'')+' '+((d.wsClaims&&d.wsClaims.terms)||'')).toLowerCase();
  const rent=d.rent||d.rentEst;
  if(c.ready&&L&&L<c.A*.5)t.push('half');
  if(/seller financ|owner financ|seller carry|owner carry/.test(txt))t.push('sf');
  if(/subject[- ]to|sub[- ]to\b|sub2/.test(txt))t.push('subto');
  const spread=c.ready&&L?c.A-L-(d.rehab||0):null;
  if(spread!=null&&spread>=100000)t.push('s100');
  if(spread!=null&&spread>=200000)t.push('s200');
  if(d.lotSqft&&d.lotSqft>=21780)t.push('acre');
  if(L&&d.sqft&&L/d.sqft<50)t.push('psf');
  if(d.lotSqft&&d.sqft&&d.lotSqft/d.sqft>=8)t.push('under');
  if(d.source!=='wholesaler'&&priceDropped(d)&&(origList(d)-curList(d))/origList(d)>=.1)t.push('disc');
  if(c.ready&&L&&rent&&c.A*.75>=L+(d.rehab||0))t.push('brrrr');
  if(c.ready&&L&&L<=c.maoFlip)t.push('flip');
  if(rent&&L&&rent>=.01*(L+(d.rehab||0)))t.push('one');
  if(rent&&L){const noi=rent*(1-.4);const pay=amort((L+(d.rehab||0))*.75,7.5,30);if(noi-pay>0)t.push('cf')}
  return t;
}
const TAGDEFS=[
  {id:'half',label:'<50% ARV',icon:'trend',c:'green'},{id:'sf',label:'Seller Finance',icon:'shield',c:'blue'},{id:'subto',label:'Sub-To',icon:'swap',c:'pink'},
  {id:'s100',label:'+100K Spread',icon:'trend',c:'purple'},{id:'s200',label:'+200K Spread',icon:'trend',c:'purple'},{id:'acre',label:'>0.5 acre',icon:'acre',c:'green'},
  {id:'psf',label:'<$50/sqft',icon:'tag',c:'amber'},{id:'under',label:'Underbuilt',icon:'building',c:'orange'},{id:'disc',label:'Discounted MLS',icon:'down',c:'teal'},
  {id:'brrrr',label:'BRRRR',icon:'flame',c:'orange'},{id:'flip',label:'Fix & Flip',icon:'hammer',c:'red'},{id:'one',label:'1% Rule',icon:'dollar',c:'blue'},{id:'cf',label:'Cash Flow+',icon:'wallet',c:'teal'}];
const TAG_BY_ID=Object.fromEntries(TAGDEFS.map(t=>[t.id,t]));

/* counts used by the shell, the brief and Maya 24/7 */
function counts(){
  const ds=Object.values(state.deals);
  return {
    reply:ds.filter(d=>replyWaiting(d)&&!d.draft&&!(d.autopilot&&state.settings.auto.enabled)).length,
    draft:ds.filter(d=>d.draft&&!['dead','closed'].includes(d.stage)).length,
    follow:ds.filter(d=>{const f=followDue(d);return f&&f.overdue}).length,
    ws:ds.filter(d=>d.source==='wholesaler'&&d.stage==='new'&&!d.reviewed&&!overBox(d)).length,
    newMail:Object.values(state.mail.emails).filter(e=>e.status==='new').length,
    live:ds.filter(d=>['sent','negotiating'].includes(d.stage)).length,
    contract:ds.filter(d=>d.stage==='contract').length,
    auto:ds.filter(d=>d.autopilot&&!['dead','closed'].includes(d.stage)).length
  };
}
