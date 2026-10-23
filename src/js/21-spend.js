/* ================= what Maya spends on your Anthropic account =================
   Every Claude call returns how many tokens it used; OfferDesk prices it with Anthropic's published rates
   (platform.claude.com/docs/en/about-claude/pricing) and adds it up per device per day, so devices and
   Maya 24/7 never overwrite each other. Anthropic has no API for the prepaid balance, so you type your balance
   once (Console → Billing) and OfferDesk subtracts what Maya spends after that. */
const PRICE={ /* USD per million tokens */
  'claude-haiku-5-5':{i:0.10,o:0.50,i2:0.50,o2:2.50,tier:100000},
  'claude-sonnet-5-5':{i:2,o:10},
  'claude-opus-5-5':{i:4,o:20}
};
const SEARCH_USD=0.01; /* $10 per 1,000 web searches */
function spendKind(model){return /haiku/.test(model)?'quick':/opus/.test(model)?'big':'main'}
function callCost(model,u,searches){
  if(!u)return 0;const P=PRICE[model]||PRICE['claude-sonnet-5-5'];
  const inp=(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0);const hi=P.tier&&inp>P.tier;
  return inp/1e6*(hi?P.i2:P.i)+(u.output_tokens||0)/1e6*(hi?P.o2:P.o)+(searches||0)*SEARCH_USD;
}
function addSpend(model,u,searches){
  try{
    const usd=callCost(model,u,searches);if(!(usd>0))return;
    state.spend=state.spend||{};const day=isoDay();const id=DEVICE_ID+'_'+day;
    const r=state.spend[id]||(state.spend[id]={dev:DEVICE_ID,day,usd:0,calls:0,by:{}});
    r.usd=+(r.usd+usd).toFixed(6);r.calls++;const k=spendKind(model);r.by[k]=+((r.by[k]||0)+usd-(searches||0)*SEARCH_USD).toFixed(6);
    if(searches)r.by.search=+((r.by.search||0)+searches*SEARCH_USD).toFixed(6);
    const cut=isoDay(new Date(Date.now()-120*DAY).toISOString());for(const [k2,v] of Object.entries(state.spend))if(!v||String(v.day)<cut)delete state.spend[k2];
    state.noCredit=null;persist('spend');
  }catch(e){}
}
function spendSince(day){let t=0;for(const r of Object.values(state.spend||{}))if(r&&String(r.day)>=day)t+=+r.usd||0;return t}
function spendBy(days){const from=isoDay(new Date(Date.now()-(days-1)*DAY).toISOString());const by={quick:0,main:0,big:0,search:0};let t=0,calls=0;
  for(const r of Object.values(state.spend||{})){if(!r||String(r.day)<from)continue;t+=+r.usd||0;calls+=r.calls||0;for(const k of Object.keys(by))by[k]+=+((r.by||{})[k])||0}
  return {t,calls,by}}
/* what's left: the balance you typed minus what Maya spent since */
function creditLeft(){const B=state.settings.billing||{};if(B.balance==null||!B.day)return null;return +B.balance-(spendSince(B.day)-(+B.base||0))}
function setBalance(v){const n=parseNum(v);const B=state.settings.billing=state.settings.billing||{};
  if(n==null||n<0){delete B.balance;delete B.day;delete B.base}else{B.balance=n;B.day=isoDay();B.base=+spendSince(B.day).toFixed(6);B.at=nowISO()}saveSettings()}
const usd=n=>n==null?'—':(n>0&&n<0.005?'<$0.01':'$'+(Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
/* the money bit inside Maya's pill in the top bar */
function meterBit(){
  const left=creditLeft();const today=spendBy(1).t;
  if(state.noCredit)return {cls:'low',txt:'Out of credits',title:'Your Anthropic account is out of credits'};
  if(left!=null)return {cls:left<2?'low':left<5?'mid':'',txt:usd(Math.max(0,left))+' left',title:`Estimated Anthropic credit left · ${usd(today)} spent today`};
  return {cls:'',txt:usd(today)+' today',title:`What ${negName()} spent today. Add your balance in Connect to see what’s left.`};
}
function spendCardHTML(){
  const n=esc(negName());const left=creditLeft();const B=state.settings.billing||{};const d1=spendBy(1),d7=spendBy(7),d30=spendBy(30);
  const lab={quick:'Reading emails and pages (Haiku)',main:'Offers, replies and chat (Sonnet)',big:'Deep research and photo checks (Opus)',search:'Web searches'};
  const rows=Object.keys(lab).filter(k=>d30.by[k]>0.0005).map(k=>`<tr style="cursor:default"><td>${lab[k]}</td><td class="r tnum">${usd(d30.by[k])}</td></tr>`).join('');
  const pct=left!=null&&B.balance?Math.max(0,Math.min(100,left/B.balance*100)):null;
  return `<section class="conn-card" id="conn-spend"><div class="card-head"><span class="ci green">${ico('bolt')}</span><div><h2>What ${n} costs you</h2><p>Counted from every call she makes, at Anthropic’s published prices</p></div><div class="ch-r">${left!=null?`<span class="pill ${left<2?'red':left<5?'orange':'green'}">${usd(Math.max(0,left))} left</span>`:''}</div></div>
    ${state.noCredit?`<div class="note red small"><b>Your Anthropic account is out of credits.</b> ${n} can’t read emails or send anything until you add more at console.anthropic.com → Billing.</div>`:''}
    ${pct!=null?`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${B.balance}" aria-valuenow="${Math.max(0,left).toFixed(2)}" aria-label="Credit left"><span style="width:${pct}%" class="${left<2?'low':left<5?'mid':''}"></span></div><p class="small">${usd(Math.max(0,left))} left of the ${usd(+B.balance)} you had on ${fmtDate(B.at||B.day)}.${left<2?' Add credits soon so she doesn’t stop.':''}</p>`:''}
    <div class="row" style="gap:18px;flex-wrap:wrap"><span><b class="tnum">${usd(d1.t)}</b> <span class="small muted">today</span></span><span><b class="tnum">${usd(d7.t)}</b> <span class="small muted">last 7 days</span></span><span><b class="tnum">${usd(d30.t)}</b> <span class="small muted">last 30 days · ${d30.calls} calls</span></span></div>
    ${rows?`<div class="tbl-wrap"><table class="tbl" style="min-width:320px"><tbody>${rows}</tbody></table></div>`:''}
    <label class="field" style="max-width:360px"><span>Your Anthropic credit balance right now (Console → Billing)</span><input class="input tnum" id="st-balance" data-act-change="set-balance" value="${B.balance!=null?B.balance:''}" placeholder="e.g. 18.50" inputmode="decimal"></label>
    <p class="xs muted">Anthropic doesn’t let apps read your balance, so type it here once and OfferDesk subtracts what ${n} spends from then on. Update it whenever you add credits. The Billing page in your Anthropic Console is always the exact number; the morning brief email isn’t counted here.</p></section>`;
}
