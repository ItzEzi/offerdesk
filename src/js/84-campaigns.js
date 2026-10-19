/* ================= Bulk campaigns: many listings, one paced send queue ================= */
/* A campaign holds listings (from a Redfin CSV or pasted addresses). Each gets quick numbers from the ZIP's
   market data, Maya finds the listing agent, and on launch every listing becomes a deal with an opening offer.
   The queue sends at a human pace (daily cap, gap, local business hours), from a device or from Maya 24/7. */
const CP_STATUS={new:['New','slate'],skip:['Skipped','slate'],dup:['Already a deal','slate'],nocontact:['No email','amber'],ready:['Ready','blue'],queued:['Queued','purple'],sent:['Sent','green'],failed:['Failed','red'],needs:['Needs you','orange']};
const CP_RULES={minDom:0,maxList:null,houseOnly:true,renoPct:15,rehabPsf:30,minOfferPct:45,maxPerDay:40,gapMin:8,start:8,end:18,weekends:false,mode:'maya',template:'',autopilot:true,followUps:true};
const CP_TEMPLATE=`Subject: Cash offer on {street}

Hi {first},

I’m reaching out about {street}. We buy houses for cash and can offer {offer}, as-is, closing in {closeDays} days with no financing or appraisal contingency.

From what we can see it needs around {rehab} of work to sell near {arv}, which is how we got to our number.

Is the seller open to a cash offer? Happy to put it in writing.`;
const ST_TZ={AL:'America/Chicago',AK:'America/Anchorage',AZ:'America/Phoenix',AR:'America/Chicago',CA:'America/Los_Angeles',CO:'America/Denver',CT:'America/New_York',DE:'America/New_York',DC:'America/New_York',FL:'America/New_York',GA:'America/New_York',HI:'Pacific/Honolulu',ID:'America/Boise',IL:'America/Chicago',IN:'America/Indiana/Indianapolis',IA:'America/Chicago',KS:'America/Chicago',KY:'America/New_York',LA:'America/Chicago',ME:'America/New_York',MD:'America/New_York',MA:'America/New_York',MI:'America/Detroit',MN:'America/Chicago',MS:'America/Chicago',MO:'America/Chicago',MT:'America/Denver',NE:'America/Chicago',NV:'America/Los_Angeles',NH:'America/New_York',NJ:'America/New_York',NM:'America/Denver',NY:'America/New_York',NC:'America/New_York',ND:'America/Chicago',OH:'America/New_York',OK:'America/Chicago',OR:'America/Los_Angeles',PA:'America/New_York',RI:'America/New_York',SC:'America/New_York',SD:'America/Chicago',TN:'America/Chicago',TX:'America/Chicago',UT:'America/Denver',VT:'America/New_York',VA:'America/New_York',WA:'America/Los_Angeles',WV:'America/New_York',WI:'America/Chicago',WY:'America/Denver',PR:'America/Puerto_Rico'};
const ST_OFF={'America/New_York':-5,'America/Detroit':-5,'America/Indiana/Indianapolis':-5,'America/Chicago':-6,'America/Denver':-7,'America/Boise':-7,'America/Phoenix':-7,'America/Los_Angeles':-8,'America/Anchorage':-9,'Pacific/Honolulu':-10,'America/Puerto_Rico':-4};
function localClock(st,t){
  const tz=ST_TZ[String(st||'').toUpperCase()]||'America/Chicago';const at=new Date(t||Date.now());
  try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23',weekday:'short'}).formatToParts(at).map(x=>[x.type,x.value]));return {hour:+p.hour%24,dow:p.weekday,tz}}
  catch(e){const d=new Date(at.getTime()+(ST_OFF[tz]||-6)*3600e3);return {hour:d.getUTCHours(),dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()],tz}}
}
const cpList=()=>Object.values(state.campaigns||{}).sort((a,b)=>String(b.created).localeCompare(String(a.created)));
const cpCur=()=>state.campaigns&&state.campaigns[state.cp.id]||null;
function saveCampaign(c,quiet){c.updated=nowISO();state.campaigns[c.id]=c;persist('campaigns');if(!quiet)render()}
function newCampaign(name){
  const c={id:uid('cp'),name:name||`Campaign ${cpList().length+1}`,created:nowISO(),status:'draft',rules:Object.assign({},CP_RULES,{template:CP_TEMPLATE}),items:[],log:[]};
  saveCampaign(c,true);state.cp.id=c.id;render();return c;
}
const dncSet=()=>new Set((state.settings.dnc||[]).map(x=>String(x).toLowerCase()));
function addDnc(v){v=String(v||'').trim().toLowerCase();if(!v)return;const L=state.settings.dnc=state.settings.dnc||[];if(!L.includes(v)){L.push(v);persist('settings')}}

/* ---- listings in ---- */
function cpItemsFromCSV(text){
  const recs=csvRecords(text);const out=[];
  for(const o of recs){
    const addr=col(o,['address','street address','property address','street','site address']);if(!addr)continue;
    const url=col(o,['url']);const status=csvStatus(o);
    out.push({k:uid('i'),addr:addr.trim(),city:col(o,['city']),st:(col(o,['state or province','state'])||'').trim().toUpperCase().slice(0,2),zip:(col(o,['zip or postal code','zip','zip code','postal code']).match(/\d{5}/)||[''])[0],
      price:parseNum(col(o,['price','list price','listing price','asking price'])),beds:parseNum(col(o,['beds','bedrooms','bd'])),baths:parseNum(col(o,['baths','bathrooms','total baths','ba'])),
      sqft:parseNum(col(o,['square feet','sqft','sq ft','living area'])),lot:parseNum(col(o,['lot size','lot sqft'])),year:parseNum(col(o,['year built'])),dom:parseNum(col(o,['days on market','dom'])),
      hoa:parseNum(col(o,['hoa/month','hoa'])),type:col(o,['property type','type']),mls:col(o,['mls#','mls','mls number']),url:/^https?:\/\//.test(url)?url:'',lat:parseNum(col(o,['latitude','lat'])),lng:parseNum(col(o,['longitude','lng','lon'])),
      listed:status,status:'new',why:''});
  }
  return out;
}
function cpItemsFromLines(text){
  return String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,300).map(line=>{
    const url=(line.match(/https?:\/\/\S+/)||[''])[0];const rest=line.replace(url,'').trim();
    const m=rest.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i);
    return {k:uid('i'),addr:(m?m[1]:rest)||'',city:m?m[2].trim():'',st:m?m[3].toUpperCase():'',zip:m&&m[4]?m[4]:'',url,price:parseNum((rest.match(/\$\s?[\d,.]+k?/i)||[''])[0]),status:'new',why:'',listed:'for_sale'};
  }).filter(x=>x.addr||x.url);
}
async function cpAddItems(c,items){
  const have=new Set(c.items.map(i=>normAddr(i.addr)+'|'+i.zip));let n=0;
  for(const it of items){const key=normAddr(it.addr)+'|'+it.zip;if(have.has(key))continue;have.add(key);c.items.push(it);n++}
  if(c.items.length>500)c.items=c.items.slice(0,500);
  await cpPrice(c);saveCampaign(c);return n;
}
/* quick numbers: ARV from the ZIP's single-family $/sqft (Redfin) plus a renovation premium; rehab per sqft */
async function cpPrice(c){
  const states=[...new Set(c.items.map(i=>i.st).filter(s=>/^[A-Z]{2}$/.test(s)))];
  for(const st of states){try{await loadMarketState(st)}catch(e){}}
  const R=c.rules;const deals=Object.values(state.deals);const known=new Set(deals.map(d=>normAddr(streetOf(d.address))+'|'+(d.zip||'')));const dnc=dncSet();
  for(const it of c.items){
    if(['queued','sent','failed','needs'].includes(it.status))continue;
    const S=MKT.states[it.st];const Z=S&&S.zips&&S.zips.zips&&S.zips.zips[it.zip];const ppsf=Z&&Z.l&&Z.l.ppsf;
    it.ppsf=ppsf||null;it.arv=it.sqft&&ppsf?round500(it.sqft*ppsf*(1+(R.renoPct||0)/100)):null;it.arvRough=!it.arv;
    if(!it.arv&&it.price)it.arv=round500(it.price*1.25);
    it.rehab=it.sqft?round500(it.sqft*(R.rehabPsf||0)):null;
    const tmp={arv:it.arv,rehab:it.rehab||0,listPrice:it.price,priceHistory:[]};const k=calc(tmp);
    it.mao=k.ready?k.mao:null;it.offer=k.ready?k.opening:null;it.offerPct=it.offer&&it.price?it.offer/it.price:null;
    let why='';
    if(known.has(normAddr(it.addr)+'|'+(it.zip||'')))it.status='dup';
    else{
      if(it.listed&&it.listed!=='for_sale')why='not for sale ('+it.listed+')';
      else if(R.houseOnly&&it.type&&!/single|house|residential/i.test(it.type))why=it.type;
      else if(R.minDom&&(it.dom??0)<R.minDom)why=`${it.dom??0} days on market`;
      else if(R.maxList&&it.price>R.maxList)why='over your max price';
      else if(!it.offer)why='numbers don’t work';
      else if(R.minOfferPct&&it.offerPct!=null&&it.offerPct*100<R.minOfferPct)why=`offer would be ${Math.round(it.offerPct*100)}% of list`;
      else if(it.agent&&it.agent.email&&dnc.has(it.agent.email.toLowerCase()))why='agent asked not to be contacted';
      it.status=why?'skip':it.agent&&it.agent.email?'ready':it.look==='done'||it.look==='fail'?'nocontact':'new';
    }
    it.why=it.status==='skip'?why:it.status==='dup'?'already in your listings':'';
  }
}

/* ---- Maya finds the listing agent ---- */
function promptAgent(it){
  return `Find the listing agent for this home that is for sale now: ${[it.addr,it.city,it.st,it.zip].filter(Boolean).join(', ')}${it.mls?` (MLS# ${it.mls})`:''}.
${it.url?`Listing page: ${it.url}\n`:''}Use web search, and web fetch on listing pages (Redfin, Realtor.com, Homes.com, the brokerage site, the agent's own site). Many sites block bots; move on when one does.
Only report an email address or phone number you actually saw on a page for this agent. Never guess an email from a pattern.
Reply with only JSON: {"name":"agent name or null","brokerage":"or null","email":"or null","phone":"or null","source":"URL where you found the email or phone, or null","confidence":"high|medium|low"}`;
}
async function cpFindAgents(c){
  if(!aiOn()){toast(aiErr({code:'no_ai'}),5200);return}
  const todo=c.items.filter(i=>['new','nocontact'].includes(i.status)&&i.look!=='busy'&&!(i.agent&&i.agent.email)).slice(0,120);
  if(!todo.length){toast('Every listing that fits already has a contact or was looked up.');return}
  const key='cp-agents:'+c.id;const ctl=new AbortController();let done=0,found=0;
  state.busy[key]={label:`${negName()} is finding agents: 0 of ${todo.length}…`,ctl};render();
  const work=async it=>{
    if(ctl.signal.aborted)return;it.look='busy';
    try{const r=await apiTools(promptAgent(it),{signal:ctl.signal,maxTokens:1200,tools:WEB_TOOLS(4)});const j=parseLoose(r.text)||{};
      const email=/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(j.email||'').trim())?String(j.email).trim().toLowerCase():'';
      it.agent={name:String(j.name||'').trim(),brokerage:String(j.brokerage||'').trim(),email,phone:String(j.phone||'').trim(),src:String(j.source||''),conf:String(j.confidence||'')};
      it.look='done';if(email)found++}
    catch(e){it.look=e&&e.code==='cancelled'?null:'fail'}
    done++;if(state.busy[key])state.busy[key].label=`${negName()} is finding agents: ${done} of ${todo.length} (${found} emails)…`;render();
  };
  try{const q=todo.slice();await Promise.all([0,1,2].map(async()=>{while(q.length&&!ctl.signal.aborted)await work(q.shift())}))}
  finally{delete state.busy[key];todo.forEach(i=>{if(i.look==='busy')i.look=null});await cpPrice(c);saveCampaign(c);
    toast(`Found ${found} agent email${found===1?'':'s'} for ${done} listing${done===1?'':'s'}.`,4200)}
}
function cpCallList(c){
  const rows=c.items.filter(i=>i.agent&&i.agent.phone&&!i.agent.email&&i.status!=='skip');
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['Address,City,State,ZIP,List price,Our offer,Agent,Brokerage,Phone,Listing'].concat(rows.map(i=>[i.addr,i.city,i.st,i.zip,i.price,i.offer,i.agent.name,i.agent.brokerage,i.agent.phone,i.url].map(q).join(','))).join('\n');
  saveFile(`${c.name.replace(/[^\w-]+/g,'-')}-call-list.csv`,csv,'text/csv');
}

/* ---- launch: every ready listing becomes a deal waiting in the queue ---- */
function cpLaunch(c){
  const ready=c.items.filter(i=>i.status==='ready');if(!ready.length){toast('No listings are ready. Each needs an agent email and numbers that work.');return}
  const R=c.rules;let n=0;
  for(const it of ready){
    const d=newDeal({address:it.addr,city:it.city||'',state:it.st||'',zip:it.zip||'',listPrice:it.price,beds:it.beds,baths:it.baths,sqft:it.sqft,lotSqft:it.lot,year:it.year,domAtAdd:it.dom,
      listingUrl:it.url||'',mlsId:it.mls||'',lat:it.lat,lng:it.lng,propertyType:'single_family',source:'mls',arv:it.arv,arvSource:'market',rehab:it.rehab,rehabSource:'estimate',
      agent:{name:it.agent.name||'',email:it.agent.email,phone:it.agent.phone||'',brokerage:it.agent.brokerage||''},autopilot:!!R.autopilot,campaign:{id:c.id,k:it.k}});
    state.deals[d.id]=d;it.dealId=d.id;it.status='queued';it.queuedAt=nowISO();n++;
  }
  c.status='running';c.launched=c.launched||nowISO();(c.log=c.log||[]).unshift({at:nowISO(),t:`Launched ${n} listings`});
  persist('deals');saveCampaign(c);toast(`${n} listings queued. ${negName()} sends up to ${R.maxPerDay} a day, ${R.start}:00–${R.end}:00 their time.`,5200);
  if(!state.settings.auto.enabled&&R.autopilot)logActivity(null,'info','Campaign replies need autopilot on (Connect → Maya) to be answered automatically.');
}
function cpFill(tpl,d,c){
  const k=calc(d);const p=state.settings.profile,n=state.settings.neg,b=state.settings.buy;
  const sig=[n.name,(n.title||'Acquisitions Manager')+(p.company?', '+p.company:''),p.phone,p.email].filter(Boolean).join('\n');
  const map={first:firstName(d),street:streetOf(d.address),city:d.city||'',offer:money(k.opening),arv:moneyK(k.A),rehab:moneyK(d.rehab),list:money(curList(d)),closeDays:b.closeDays,company:p.company||'',name:n.name};
  let t=String(tpl||CP_TEMPLATE).replace(/\{(\w+)\}/g,(m,x)=>map[x]!=null?String(map[x]):m);
  let subject='Cash offer on '+streetOf(d.address);const sm=t.match(/^\s*Subject:\s*(.+)\n+/i);if(sm){subject=sm[1].trim();t=t.slice(sm[0].length)}
  let body=t.trim()+'\n\n'+sig;if(n.optOutLine)body+='\n\nPrefer not to get offers from us? Reply ‘remove’ and we won’t contact you again.';
  return {subject,body,sms:`Hi ${firstName(d)}, ${n.name} here${p.company?' with '+p.company:''}. We can pay ${money(k.opening)} cash for ${streetOf(d.address)}, as-is, close in ${b.closeDays} days. Open to it? – ${n.name}`};
}
const sentToday=c=>c.items.filter(i=>i.sentAt&&isoDay(i.sentAt)===isoDay()).length;
function cpNextSlot(c){
  const R=c.rules;const last=c.items.reduce((m,i)=>i.sentAt&&i.sentAt>m?i.sentAt:m,'');
  const gap=(R.gapMin??8)*60e3*(c.jitter||1);return last?new Date(last).getTime()+gap:0;
}
function cpCanSendNow(c,it){
  const R=c.rules;const lc=localClock(it.st);
  if(!R.weekends&&(lc.dow==='Sat'||lc.dow==='Sun'))return false;
  return lc.hour>=(R.start??8)&&lc.hour<(R.end??18);
}
/* one step of the queue: called every tick (device every 3 min, Maya 24/7 every 5) */
async function campaignTick(){
  if(!gmailOn()||!aiOn())return 0;let sent=0;
  const quota=state.conn.mailQuota;if(quota&&quota.left!=null&&quota.left<20&&quota.day===isoDay())return 0;
  const todayAgents=new Set(cpList().flatMap(c=>c.items.filter(i=>i.sentAt&&isoDay(i.sentAt)===isoDay()&&i.agent).map(i=>i.agent.email)));
  for(const c of cpList()){
    if(c.status!=='running'||timeUp())continue;
    if(sentToday(c)>=(c.rules.maxPerDay||40))continue;
    if(Date.now()<cpNextSlot(c))continue;
    const q=c.items.filter(i=>i.status==='queued');if(!q.length){if(!c.items.some(i=>i.status==='needs')){c.status='done';(c.log=c.log||[]).unshift({at:nowISO(),t:'Every listing was sent'});saveCampaign(c,true)}continue}
    const it=q.find(i=>cpCanSendNow(c,i)&&!todayAgents.has(i.agent&&i.agent.email));if(!it)continue;
    const d=state.deals[it.dealId];
    if(!d||d.optedOut||['dead','closed'].includes(d.stage)||ourCount(d)){it.status=d&&ourCount(d)?'sent':'skip';it.why=it.why||(d?'':'deal was deleted');saveCampaign(c,true);continue}
    if(!d.draft){
      if(c.rules.mode==='template'){const f=cpFill(c.rules.template,d,c);const k=calc(d);setDraft(d.id,{kind:'opening',action:'opening',price:k.opening,email:{subject:f.subject,body:f.body},sms:f.sms,why:'Campaign template'})}
      else await aiOpening(d.id,true);
    }
    const dd=state.deals[d.id];if(!dd||!dd.draft||!String(dd.draft.email&&dd.draft.email.body||'').trim()){if(dd&&dd.draft)dd.draft=null;it.tries=(it.tries||0)+1;if(it.tries>=3){it.status='failed';it.why=`${negName()} couldn’t write the opening`}saveCampaign(c,true);continue}
    const why=draftSafety(dd);
    if(why.length){it.status='needs';it.why=why.join(', ');dd.needsYou=it.why;saveDeal(dd,true);saveCampaign(c,true);continue}
    if(await sendEmailNow(dd.id,true)){
      const d2=state.deals[dd.id];if(d2&&d2.draft&&d2.draft.sent&&d2.draft.sent.email){d2.draft=null;saveDeal(d2,true)}
      it.status='sent';it.sentAt=nowISO();c.jitter=.7+Math.random()*.6;todayAgents.add(it.agent&&it.agent.email);sent++;
      logActivity(dd.id,'sent',`${negName()} sent the campaign opening on ${streetOf(dd.address)} at ${money(((dd.offers||[]).slice(-1)[0]||{}).price)}.`)}
    else{it.tries=(it.tries||0)+1;if(it.tries>=3){it.status='failed';it.why='email didn’t send 3 times'}}
    saveCampaign(c,true);
  }
  return sent;
}
function cpStats(c){
  const ds=c.items.map(i=>i.dealId&&state.deals[i.dealId]).filter(Boolean);
  const replied=ds.filter(d=>ins(d).length).length;const sent=c.items.filter(i=>i.status==='sent').length;
  return {total:c.items.length,ready:c.items.filter(i=>i.status==='ready').length,queued:c.items.filter(i=>i.status==='queued').length,sent,replied,
    neg:ds.filter(d=>d.stage==='negotiating').length,contract:ds.filter(d=>['contract','closed'].includes(d.stage)).length,needs:c.items.filter(i=>i.status==='needs').length,
    nocontact:c.items.filter(i=>i.status==='nocontact').length,lookup:c.items.filter(i=>i.status==='new').length,skip:c.items.filter(i=>['skip','dup'].includes(i.status)).length,
    rate:sent?replied/sent:null,today:sentToday(c)};
}

/* ---- page ---- */
function viewCampaigns(){
  const L=cpList();if(!state.cp.id&&L.length)state.cp.id=L[0].id;const c=cpCur();
  const tot=L.reduce((a,x)=>{const s=cpStats(x);a.sent+=s.sent;a.rep+=s.replied;a.q+=s.queued;return a},{sent:0,rep:0,q:0});
  const head=hero('g-camp','Campaigns','Send opening offers to many listings at once, at a human pace',`<span>${ico('send')}${tot.sent} sent · ${tot.q} queued</span><span>${ico('chat')}${tot.rep} replies</span>`,
    `<button class="btn" data-act="cp-new">${ico('plus')}New campaign</button>`);
  const tabs=L.length?`<div class="cp-tabs" role="tablist">${L.map(x=>{const s=cpStats(x);return `<button role="tab" aria-selected="${c&&c.id===x.id}" data-act="cp-open" data-id="${x.id}"><b>${esc(x.name)}</b><span class="xs muted">${x.status==='running'?'Sending':x.status==='paused'?'Paused':x.status==='done'?'Done':'Draft'} · ${s.sent}/${s.total} sent${s.replied?` · ${s.replied} replies`:''}</span></button>`}).join('')}</div>`:'';
  if(!c)return `<div class="wrap page">${head}${cpEmptyHTML()}</div>`;
  return `<div class="wrap page">${head}${tabs}${cpEditorHTML(c)}</div>`;
}
function cpRedfinLinks(c){
  const chip=(z,cls,label)=>`<a class="qchip ${cls}" href="https://www.redfin.com/zipcode/${z}" target="_blank" rel="noopener">${esc(label||z)}</a>`;
  const own=c&&c.market&&(c.market.zips||[]).length?`<p class="small" style="margin:0 0 6px"><b>${esc(c.market.label)}</b>: best ZIPs for you, open each on Redfin, filter, then Download All</p><div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">${c.market.zips.slice(0,10).map(z=>chip(z.z||z,'purple',(z.z||z)+(z.city?' · '+z.city:''))).join('')}</div>`:'';
  const T=(state.settings.markets||{}).targets||[];const zips=[...new Set(T.filter(t=>t.type==='zip').map(t=>t.key))];
  const mz=T.filter(t=>t.type==='metro').map(t=>{const R=DISC.data?mkCompute():null;const m=R&&R.byKey[t.key];return {label:t.label,zips:m?m.zips.slice(0,3).map(o=>o.z):(t.zips||[]).slice(0,1)}});
  if(!own&&!zips.length&&!mz.length)return `<p class="small muted">Tip: on the <a href="#markets">Markets</a> page, open a metro and press <b>Start a campaign here</b>, or star target markets; their Redfin links show up here.</p>`;
  return own+(zips.length||mz.length?`<div class="row" style="gap:6px;flex-wrap:wrap">${zips.slice(0,12).map(z=>chip(z,'blue',z+' on Redfin')).join('')}${mz.slice(0,6).flatMap(m=>m.zips.map(z=>chip(z,'blue',`${m.label.split(',')[0]} ${z}`))).join('')}</div>`:'');
}
function cpEmptyHTML(){
  return `<section class="card"><div class="card-head"><span class="ci blue">${ico('send')}</span><div><h2>How a campaign works</h2><p>About 10 minutes to set up, then ${esc(negName())} sends on her own</p></div></div>
  <ol class="cp-steps"><li><b>Pull listings.</b> On Redfin, search a target area, set your filters (houses, price, days on market), then use <b>Download All</b> under the results. Upload that file here, or paste addresses.</li>
  <li><b>Check the numbers.</b> Each listing gets a quick ARV from its ZIP’s sold $/sqft plus a renovation premium, a rehab estimate, your ceiling and an opening offer. Weak ones are skipped.</li>
  <li><b>Find the agents.</b> ${esc(negName())} looks up each listing agent’s email. Listings with only a phone go on a call list.</li>
  <li><b>Launch.</b> Each listing becomes a deal with a personal opening offer, sent from your Gmail at a human pace during the agent’s business hours. Replies go to autopilot or to you.</li></ol>
  ${cpRedfinLinks()}<button class="btn primary" data-act="cp-new" style="margin-top:12px">${ico('plus')}Start a campaign</button></section>`;
}
function cpEditorHTML(c){
  const R=c.rules;const s=cpStats(c);const n=esc(negName());const busyA=state.busy['cp-agents:'+c.id];const locked=c.status==='running';
  const f=state.cp.filter||'all';const items=c.items.filter(i=>f==='all'||(f==='skip'?['skip','dup'].includes(i.status):i.status===f));
  const sortK=state.cp.sort||'offerPct';const sorted=items.slice().sort((a,b)=>sortK==='dom'?(b.dom??-1)-(a.dom??-1):sortK==='price'?(a.price??1e12)-(b.price??1e12):(b.offerPct??-1)-(a.offerPct??-1));
  const chip=(k,l,v)=>`<button class="qchip ${f===k?'blue':'ghostchip'}" data-act="cp-filter" data-v="${k}">${l} <b>${v}</b></button>`;
  const rows=sorted.slice(0,state.cp.show||80).map(i=>{const st=CP_STATUS[i.status]||CP_STATUS.new;const d=i.dealId&&state.deals[i.dealId];
    return `<tr class="${['skip','dup'].includes(i.status)?'off':''}"><td><b>${esc(i.addr)}</b><div class="xs muted">${esc([i.city,i.st,i.zip].filter(Boolean).join(', '))}${i.beds?` · ${i.beds}/${i.baths??'?'}`:''}${i.sqft?` · ${numFmt(i.sqft)} sqft`:''}${i.url?` · <a href="${esc(i.url)}" target="_blank" rel="noopener">listing</a>`:''}</div></td>
    <td class="r tnum">${moneyK(i.price)}<div class="xs muted">${i.dom!=null?i.dom+'d':''}</div></td><td class="r tnum">${moneyK(i.arv)}${i.arvRough?'<div class="xs" style="color:var(--t-amber)">rough</div>':''}</td><td class="r tnum">${moneyK(i.rehab)}</td>
    <td class="r tnum"><b>${moneyK(i.offer)}</b><div class="xs muted">${i.offerPct!=null?Math.round(i.offerPct*100)+'% of list':''}</div></td>
    <td style="min-width:190px">${i.agent&&(i.agent.email||i.agent.phone||i.agent.name)?`<div class="small"><b>${esc(i.agent.name||'Agent')}</b>${i.agent.brokerage?` <span class="muted">· ${esc(i.agent.brokerage)}</span>`:''}</div><div class="xs">${esc(i.agent.email||'')}${i.agent.phone?` <span class="muted">${esc(i.agent.phone)}</span>`:''}</div>`:i.look==='busy'?'<span class="xs muted">Looking…</span>':''}
      ${!locked&&!['sent','queued'].includes(i.status)?`<input class="input xs-input" data-cp-agent="${i.k}" placeholder="agent@email.com" value="${esc((i.agent&&i.agent.email)||'')}" aria-label="Agent email for ${esc(i.addr)}">`:''}</td>
    <td><span class="tag ${st[1]}">${st[0]}</span>${i.why?`<div class="xs muted">${esc(i.why)}</div>`:''}${d?`<div class="xs"><a href="#deal/${d.id}">${ins(d).length?'Replied · ':''}open deal</a></div>`:''}</td>
    <td class="c">${!['sent','queued'].includes(i.status)?`<button class="iconx" data-act="cp-del" data-k="${i.k}" aria-label="Remove ${esc(i.addr)}">${ico('close')}</button>`:''}</td></tr>`}).join('');
  const lookN=c.items.filter(i=>['new','nocontact'].includes(i.status)&&!(i.agent&&i.agent.email)).length;
  const phoneOnly=c.items.filter(i=>i.agent&&i.agent.phone&&!i.agent.email&&i.status!=='skip').length;
  return `<section class="card" id="cp-head"><div class="card-head"><span class="ci blue">${ico('send')}</span><div><input class="input cp-name" data-cp="name" value="${esc(c.name)}" aria-label="Campaign name"><p>${c.status==='running'?`Sending · ${s.today} today of ${R.maxPerDay}`:c.status==='paused'?'Paused':c.status==='done'?'Finished':'Draft · not sending yet'}${c.launched?` · launched ${fmtDate(c.launched)}`:''}</p></div>
    <div class="ch-r">${c.status==='running'?`<button class="btn sm" data-act="cp-pause">${ico('pause')}Pause</button>`:c.status==='paused'?`<button class="btn sm primary" data-act="cp-resume">${ico('send')}Resume</button>`:''}<button class="btn ghost sm" data-act="cp-delete" aria-label="Delete campaign">${ico('trash')}</button></div></div>
    <div class="kpis cp-kpis">${[['Listings',s.total,''],['Ready',s.ready,'blue'],['Queued',s.queued,'purple'],['Sent',s.sent,'green'],['Replies',s.replied+(s.rate!=null?` · ${pct(s.rate,0)}`:''),''],['Negotiating',s.neg,''],['Under contract',s.contract,'green']].map(([l,v,cl])=>`<div class="kpi ${cl}"><span class="lab">${l}</span><span class="val">${v}</span></div>`).join('')}</div>
    ${s.needs?`<div class="note amber">${s.needs} opening${s.needs>1?'s':''} need you (price above your limits or flagged). Open the deal to review.</div>`:''}</section>

  <section class="card" id="cp-in"><div class="card-head"><span class="ci teal">${ico('upload')}</span><div><h2>1. Listings</h2><p>Redfin: search an area → <b>Download All</b> → drop the file here. Or paste addresses or links, one per line.</p></div></div>
    ${cpRedfinLinks(c)}
    <div class="cp-drop" data-drop="cp"><input type="file" accept=".csv,text/csv" id="cp-file" data-cp-csv="${c.id}" aria-label="Upload a Redfin CSV"><label for="cp-file" class="btn sm">${ico('upload')}Upload CSV</label><span class="small muted">or</span>
    <textarea class="input" id="cp-paste" data-draft rows="2" placeholder="123 Main St, Dayton, OH 45410&#10;https://www.redfin.com/…">${esc(state.drafts['cp-paste']||'')}</textarea><button class="btn sm" data-act="cp-paste">Add</button></div></section>

  <section class="card" id="cp-rules"><div class="card-head"><span class="ci amber">${ico('dollar')}</span><div><h2>2. Numbers and filters</h2><p>Your buy box (Connect → Buy box) sets the ceiling; these set the quick ARV and rehab</p></div></div>
    <div class="cp-grid">${[['renoPct','Renovated premium over ZIP $/sqft (%)'],['rehabPsf','Rehab $ per sqft'],['minDom','Min. days on market'],['maxList','Max list price'],['minOfferPct','Skip if offer is under % of list']].map(([k,l])=>`<label class="field"><span>${l}</span><input class="input tnum" data-cp="rules.${k}" data-t="num" value="${R[k]??''}" inputmode="numeric" ${locked?'disabled':''}></label>`).join('')}
    <label class="check"><input type="checkbox" data-cp="rules.houseOnly" data-t="bool" ${R.houseOnly?'checked':''} ${locked?'disabled':''}><span>Single-family houses only</span></label></div></section>

  <section class="card" id="cp-list"><div class="card-head"><span class="ci purple">${ico('listings')}</span><div><h2>3. Agents</h2><p>${n} finds each listing agent’s email with web search (roughly 5–10¢ of Claude usage per listing). Only emails she actually saw on a page.</p></div>
    <div class="ch-r">${lookN&&!locked?`<button class="btn primary sm" data-act="cp-agents" ${busyA?'disabled':''}>${ico('search')}Find ${lookN} agent${lookN>1?'s':''}</button>`:''}${phoneOnly?`<button class="btn sm" data-act="cp-calls">${ico('download')}Call list (${phoneOnly})</button>`:''}</div></div>
    ${busyHTML('cp-agents:'+c.id)}
    ${c.items.length?`<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">${chip('all','All',s.total)}${chip('ready','Ready',s.ready)}${chip('new','Need lookup',s.lookup)}${chip('nocontact','No email',s.nocontact)}${chip('queued','Queued',s.queued)}${chip('sent','Sent',s.sent)}${chip('needs','Needs you',s.needs)}${chip('skip','Skipped',s.skip)}
      <span class="spacer"></span><select class="input sm-select" id="cp-sort" aria-label="Sort"><option value="offerPct" ${sortK==='offerPct'?'selected':''}>Best offer % first</option><option value="dom" ${sortK==='dom'?'selected':''}>Longest on market</option><option value="price" ${sortK==='price'?'selected':''}>Cheapest</option></select></div>
    <div class="tbl-wrap" data-keep-scroll id="cp-tbl"><table class="tbl cp-tbl"><thead><tr><th>Listing</th><th class="r">List</th><th class="r">Quick ARV</th><th class="r">Rehab</th><th class="r">Opening</th><th>Agent</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="8" class="muted">Nothing here.</td></tr>'}</tbody></table></div>
    ${items.length>(state.cp.show||80)?`<button class="btn sm ghost" data-act="cp-more">Show more</button>`:''}`:'<p class="small muted">Add listings above.</p>'}</section>

  <section class="card" id="cp-send"><div class="card-head"><span class="ci green">${ico('send')}</span><div><h2>4. Message and sending</h2><p>From ${esc(sendEmail()||'your Gmail')} · at most one email per agent per day</p></div></div>
    <div class="seg" role="group" aria-label="Message">${[['maya',`${n} writes each one`],['template','One template']].map(([k,l])=>`<button data-act="cp-mode" data-v="${k}" aria-pressed="${R.mode===k}">${l}</button>`).join('')}</div>
    ${R.mode==='template'?`<label class="field" style="margin-top:10px"><span>Template: {first} {street} {offer} {arv} {rehab} {list} {closeDays}. Your signature and opt-out line are added.</span><textarea class="input" rows="9" data-cp="rules.template" data-t="text">${esc(R.template||CP_TEMPLATE)}</textarea></label>`:`<p class="small muted" style="margin-top:8px">${n} writes a short, personal opening for each listing (about 1¢ each) using its facts and your numbers.</p>`}
    <div class="cp-grid" style="margin-top:10px">${[['maxPerDay','Max emails a day'],['gapMin','Minutes between emails'],['start','Send from (their local hour)'],['end','Until (hour)']].map(([k,l])=>`<label class="field"><span>${l}</span><input class="input tnum" data-cp="rules.${k}" data-t="num" value="${R[k]??''}" inputmode="numeric"></label>`).join('')}
    <label class="check"><input type="checkbox" data-cp="rules.weekends" data-t="bool" ${R.weekends?'checked':''}><span>Send on weekends</span></label>
    <label class="check"><input type="checkbox" data-cp="rules.autopilot" data-t="bool" ${R.autopilot?'checked':''}><span>Autopilot handles replies (within your limits)</span></label></div>
    <p class="xs muted">A regular Gmail account can send about 100 emails a day through the script; Google Workspace about 1,500. Keep room for replies.</p>
    ${c.status==='draft'?`<button class="btn primary" data-act="cp-launch" ${s.ready?'':'disabled'}>${ico('send')}Launch ${s.ready} listing${s.ready===1?'':'s'}</button>`:c.status!=='done'&&s.ready?`<button class="btn sm" data-act="cp-launch">${ico('plus')}Add ${s.ready} more to the queue</button>`:''}
    ${(c.log||[]).length?`<details id="cp-log"><summary>Log</summary><ul class="xs">${c.log.slice(0,20).map(l=>`<li>${esc(fmtWhen(l.at))}: ${esc(l.t)}</li>`).join('')}</ul></details>`:''}</section>`;
}
