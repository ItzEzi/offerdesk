/* ================= deal helpers ================= */
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
function weightedArv(d){
  const S=d.sqft;const rows=(d.comps||[]).filter(x=>x.price>0);if(!rows.length)return null;
  let tw=0,tv=0;const parts=[];
  for(const x of rows){
    const val=S&&x.sqft?x.price/x.sqft*S:x.price;
    const wd=1/(1+(x.dist??0.5)/0.35);
    const age=x.soldDate?Math.max(0,(Date.now()-new Date(x.soldDate).getTime())/(30*DAY)):6;
    const wa=1/(1+age/6);const ws=S&&x.sqft?1/(1+Math.abs(x.sqft-S)/S*3):0.7;const wr=x.reno===false?0.3:1;
    const w=wd*wa*ws*wr;tw+=w;tv+=w*val;parts.push({w,val});
  }
  return {arv:floor500(tv/tw),parts:parts.map(p=>({...p,share:p.w/tw}))};
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
function rentalCalc(d,c){
  const R=state.settings.rental;const rent=d.rent||d.rentEst||null;if(!rent)return null;
  const price=lastTheirPrice(d)||curList(d)||0;const allIn=price+(d.rehab||0)+price*.03;
  const opex=R.taxInsMonthly+rent*(R.mgmtPct+R.maintPct+R.vacancyPct)/100;
  const noi=rent-opex;const cap=allIn>0?noi*12/allIn:null;
  const refi=c.ready?c.A*R.refiLtv/100:null;const left=refi!=null?allIn-refi:null;
  const pay=refi?amort(refi,R.refiRate,30):null;const cfRefi=pay!=null?noi-pay:null;
  return {rent,price,allIn,opex,noi,cap,onePct:allIn>0?rent/allIn:null,refi,left,pay,cfRefi};
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
