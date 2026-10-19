/* ================= deal operations ================= */
function newDeal(o){
  const at=nowISO();
  const d=Object.assign({id:uid('d'),created:at,updated:at,stage:'new',source:'mls',thread:[],offers:[],priceHistory:[],comps:[],state:'',autopilot:!!state.settings.auto.newDealsOn,mayaChat:[]},o);
  if(o.listPrice!=null&&!(o.priceHistory||[]).length)d.priceHistory=[{date:o.listedDate||at,price:o.listPrice}];
  return d;
}
function pushMsg(d,m){d.thread=d.thread||[];d.thread.push(Object.assign({id:uid('m'),at:nowISO()},m))}
function ensureWholesaler(w){
  if(!w||!(w.email||w.name||w.phone))return;
  const list=state.settings.wholesalers=state.settings.wholesalers||[];
  const hit=list.find(x=>(w.email&&x.email&&x.email.toLowerCase()===w.email.toLowerCase())||(w.phone&&x.phone&&digits10(x.phone)===digits10(w.phone))||(w.name&&x.name&&x.name.toLowerCase()===w.name.toLowerCase()));
  if(hit){for(const k of ['name','company','email','phone'])if(!hit[k]&&w[k])hit[k]=w[k]}
  else list.push({name:w.name||'',company:w.company||'',email:w.email||'',phone:w.phone||''});
  persist('settings');
}
function exampleDeals(){
  const iso=(dd,hh)=>new Date(Date.now()-((dd||0)*24+(hh||0))*36e5).toISOString();
  const base={state:'TX',comps:[],priceHistory:[],offers:[],thread:[],example:true,mayaChat:[],autopilot:false};
  const list=[
    Object.assign({},base,{id:'ex-lakeview',address:'2418 Lakeview Dr (example)',city:'Garland',zip:'75040',source:'mls',mlsStatus:'for_sale',propertyType:'single_family',stage:'negotiating',created:iso(8),updated:iso(2),listPrice:229900,
      priceHistory:[{date:iso(80),price:239900},{date:iso(30),price:229900}],listedDate:iso(80),zipAvgDom:48,arv:262000,rehab:46000,sqft:1420,lotSqft:8100,beds:3,baths:2,year:1968,rent:1950,
      description:'Brick 3/2 on a corner lot. Original kitchen and baths, roof about 15 years old, HVAC 2014. Vacant, easy to show.',
      agent:{name:'Dana Whitfield (example)',email:'',phone:'',brokerage:'Example Realty'},sentiment:'neutral',
      offers:[{at:iso(6),price:130500,by:'us'},{at:iso(2),price:199000,by:'them'}],
      thread:[{id:'m1',at:iso(6),dir:'out',channel:'email',subject:'Cash offer: 2418 Lakeview Dr',text:'Hi Dana, we’d like to offer $130,500 cash, as-is, closing in 14 days. ARV is around $262K on renovated sales nearby and repairs run about $46K (kitchen, baths, roof, HVAC), plus holding and resale costs. What matters most to your seller on timing?',price:130500},
        {id:'m2',at:iso(2),dir:'in',channel:'sms',text:'Seller is at 199k. Can do a 30 day close if that helps.',price:199000}],
      comps:[{addr:'2507 Ridge Oak Dr',price:268000,sqft:1480,dist:0.3,soldDate:isoDay(iso(68)),reno:true},{addr:'1902 Pinecrest Ln',price:255000,sqft:1390,dist:0.5,soldDate:isoDay(iso(139)),reno:true},{addr:'2230 Shady Brook',price:172000,sqft:1410,dist:0.4,soldDate:isoDay(iso(91)),reno:false}],
      follow:{base:iso(6),step:0},quickNote:'Seller may take terms. Ask about the foundation report.'}),
    Object.assign({},base,{id:'ex-sunnyvale',address:'815 Sunnyvale Ct (example)',city:'Mesquite',zip:'75149',source:'wholesaler',mlsStatus:'off_market',propertyType:'single_family',stage:'new',created:iso(0,3),updated:iso(0,3),listPrice:145000,priceHistory:[{date:iso(0,3),price:145000}],
      arv:240000,rehab:55000,beds:3,baths:2,sqft:1350,lotSqft:23000,year:1979,rent:1750,description:'Vacant 3/2 on half an acre, needs full cosmetic rehab. Wholesaler says new roof 2021. Seller open to owner financing.',
      wholesalerName:'Lone Star Deals (example)',agent:{name:'Lone Star Deals (example)',email:'',phone:'',brokerage:''},arvSource:'wholesaler',
      wsClaims:{asking:145000,arv:240000,rehab:35000,terms:'cash or seller finance',deadline:'Offers by Friday 5pm',access:'Lockbox, call for code',redFlags:['Repair estimate looks light for a full cosmetic rehab','No comps attached'],occupancy:'vacant'},
      thread:[{id:'m3',at:iso(0,3),dir:'in',channel:'email',text:'(example) HOT DEAL Mesquite 3/2 on 0.53 acre, asking $145K, ARV $240K, needs ~$35K. Vacant, lockbox. Seller open to owner finance. Offers by Friday 5pm.'}]}),
    Object.assign({},base,{id:'ex-bluebonnet',address:'4410 Bluebonnet Ln (example)',city:'Irving',zip:'75061',source:'mls',mlsStatus:'for_sale',propertyType:'single_family',stage:'sent',created:iso(9),updated:iso(5),listPrice:205000,priceHistory:[{date:iso(60),price:205000}],listedDate:iso(60),zipAvgDom:41,
      arv:250000,rehab:38000,beds:3,baths:1.5,sqft:1290,lotSqft:7400,year:1962,agent:{name:'Marcus Lee (example)',email:'',phone:'',brokerage:'Example Group'},
      offers:[{at:iso(5),price:128500,by:'us'}],thread:[{id:'m4',at:iso(5),dir:'out',channel:'email',subject:'Cash offer: 4410 Bluebonnet Ln',text:'Hi Marcus, offering $128,500 cash, as-is, 14-day close…',price:128500}],follow:{base:iso(5),step:1}})
  ];
  return Object.fromEntries(list.map(d=>[d.id,d]));
}
function applyAnalysisFlags(d){}

/* ---------- extraction ---------- */
async function extractDeals(text,meta,busyKey,quiet){
  meta=meta||{};
  const res=await runAI(busyKey,`${negName()} is reading that message…`,(ai,signal)=>ai.json(P_WHOLESALE(text),{signal,modelTier:'quick'}),quiet);
  if(!res)return null;
  const list=Array.isArray(res.deals)?res.deals:res.address?[res]:[];
  const w=Object.assign({},res.wholesaler||{});
  if(meta.fromEmail&&!w.email)w.email=meta.fromEmail;if(meta.fromName&&!w.name)w.name=meta.fromName;if(meta.phone&&!w.phone)w.phone=meta.phone;
  if(!list.length)return {deals:[],w};
  ensureWholesaler(w);
  const made=[];
  for(const x of list){
    const asking=parseNum(x.asking);
    const d=newDeal({source:'wholesaler',mlsStatus:'off_market',address:String(x.address||'Unknown address'),city:x.city||'',state:x.state||'TX',zip:String(x.zip||''),listPrice:asking,arv:parseNum(x.arv),arvSource:parseNum(x.arv)?'wholesaler':null,rehab:parseNum(x.rehab),beds:parseNum(x.beds),baths:parseNum(x.baths),sqft:parseNum(x.sqft),lotSqft:parseNum(x.lotSqft),year:parseNum(x.year),rent:parseNum(x.rent),propertyType:PROP_TYPES[x.propertyType]?x.propertyType:'single_family',description:String(x.description||''),
      wholesalerName:w.name||w.company||'',agent:{name:w.name||'',email:w.email||'',phone:w.phone||'',brokerage:w.company||''},
      wsClaims:{asking,arv:parseNum(x.arv),rehab:parseNum(x.rehab),rent:parseNum(x.rent),terms:x.terms||'',deadline:x.deadline||'',access:x.access||'',redFlags:(x.redFlags||[]).map(String),occupancy:x.occupancy||''},
      gmailThreadId:meta.threadId||null,gmailAccount:meta.acct||null,gvThreadId:meta.gvThreadId||null,seenMsgIds:meta.msgId?[meta.msgId]:[],receivedAt:meta.at||nowISO(),autopilot:false});
    pushMsg(d,{dir:'in',channel:meta.channel||'email',text:text.slice(0,4000),at:meta.at||nowISO()});
    const links=(x.photoLinks||[]).filter(u=>/\.(jpe?g|png|webp)(\?|$)/i.test(u));if(links.length){d.photoUrls=links.slice(0,12);d.thumbUrl=links[0]}
    d.links=[...new Set([...(x.links||[]),...(x.photoLinks||[]).filter(u=>!/\.(jpe?g|png|webp)(\?|$)/i.test(u))].map(String))].slice(0,8);
    state.deals[d.id]=d;saveDeal(d,true);made.push(d.id);
    logActivity(d.id,'deal',`New wholesaler deal: ${streetOf(d.address)} from ${w.name||w.company||'a wholesaler'}${asking?' at '+money(asking):''}.`);
  }
  render();
  if(state.settings.research&&state.settings.research.auto&&aiOn())made.forEach(queueResearch);
  return {deals:made,w};
}
async function importEmail(id,quiet){
  const m=state.mail.emails[id];if(!m)return;const f=parseFrom(m.from);
  const r=await extractDeals(`From: ${m.from}\nSubject: ${m.subject||''}\n\n${m.body||''}`,{fromEmail:f.email,fromName:f.name,threadId:m.threadId,acct:m.acct,msgId:m.id,at:m.date,channel:'email'},'mail:'+id,quiet);
  if(!r)return;const mm=state.mail.emails[id];if(mm){mm.status=r.deals.length?'imported':'nodeal';mm.dealIds=r.deals}saveMail();
  if(r.deals.length===1&&(m.atts||0)>0){try{const a=await bridge('attachments',{id:m.id,max:8},m.acct||undefined);const blobs=(a.files||[]).map(x=>b64ToBlob(x.data,x.type));if(blobs.length)await addPhotoBlobs(r.deals[0],blobs,'email')}catch(e){}}
  render();if(!quiet)toast(r.deals.length?`Added ${r.deals.length} deal${r.deals.length>1?'s':''}`:'No property found in that email.');
}

/* ---------- Maya's drafts ---------- */
function setDraft(id,draft){const d=state.deals[id];if(!d)return;d.draft=Object.assign({at:nowISO(),flags:[],letterPrice:draft.price??null},draft);d.needsYou=null;saveDeal(d)}
async function aiOpening(id,quiet){
  const d=state.deals[id];const c=calc(d);
  const res=await runAI('deal:'+id,`${negName()} is writing the opening offer…`,(ai,signal)=>ai.json(promptOpening(d,c),{signal}),quiet);
  if(!res||!state.deals[id])return;
  setDraft(id,{kind:'opening',action:'opening',price:c.opening,email:{subject:String(res.email&&res.email.subject||''),body:String(res.email&&res.email.body||'')},sms:String(res.sms||''),why:`Opening at ${money(c.opening)}: ${state.settings.buy.anchorGap}% under your ceiling, leaving room for ${state.settings.buy.maxRounds-1} counters.`});
}
async function aiReply(id,instruction,quiet,label){
  const d=state.deals[id];const c=calc(d);const next=nextLadder(d,c);const last=lastOurPrice(d);
  const res=await runAI('deal:'+id,label||`${negName()} is reading the thread and working out the next move…`,(ai,signal)=>ai.json(promptReply(d,c,next,instruction),{signal}),quiet);
  if(!res)return;const dd=state.deals[id];if(!dd)return;
  const s=state.settings.buy;const flags=[];
  let action=String(res.action||'hold');if(!ACTION_LABEL[action])action='hold';
  let price=parseNum(res.price);const theirs=parseNum(res.theirCounter);
  const cap=action==='creative'?c.sfCap:c.mao;
  if(theirs!=null){
    const li=[...(dd.thread||[])].reverse().find(t=>t.dir==='in');
    if(li&&li.price==null){li.price=theirs;dd.offers=dd.offers||[];if(lastTheirPrice(dd)!==theirs)dd.offers.push({at:li.at,price:theirs,by:'them'})}
    if(theirs<=c.mao){const r=c.resultAt(theirs);flags.push({cls:'green',text:`Their number ${money(theirs)} is under your ceiling: ${r.label} at their price.`})}
  }
  if(price!=null&&price>cap){flags.push({cls:'red',text:`${negName()} suggested ${money(price)}, above your ${action==='creative'?'seller-finance cap':'ceiling'}. Capped at ${money(cap)}; check the wording.`});price=cap}
  if(price!=null&&last!=null&&price<last&&action==='counter')flags.push({cls:'amber',text:`This counter (${money(price)}) is below your last offer of ${money(last)}. Going backwards can cost trust.`});
  if(price!=null&&action!=='creative'&&c.mao&&price>c.mao*(s.escalatePct/100))flags.push({cls:'amber',text:`This is above ${s.escalatePct}% of your ceiling. Your call before it goes out.`});
  if(action==='stop')dd.optedOut=true;
  if(action==='hold'&&price==null)price=last;
  if(SENTIMENT[res.sentiment])dd.sentiment=res.sentiment;
  if(dd.stage==='new'||dd.stage==='sent')dd.stage='negotiating';
  dd.lastAction=action;
  dd.draft={kind:'reply',action,price,theirCounter:theirs,signals:Array.isArray(res.sellerSignals)?res.sellerSignals.slice(0,6).map(String):[],summary:String(res.summary||''),why:String(res.why||''),terms:String(res.terms||''),email:{subject:String(res.email&&res.email.subject||''),body:String(res.email&&res.email.body||'')},sms:String(res.sms||''),flags,at:nowISO(),instruction:instruction||null,letterPrice:price};
  dd.needsYou=null;saveDeal(dd);
}
async function aiFollow(id,priceDrop,quiet){
  const d=state.deals[id];const c=calc(d);const last=lastOurPrice(d);
  let price=last;if(priceDrop&&c.ready){price=Math.min(c.mao,Math.max(last||0,nextLadder(d,c)))}
  const res=await runAI('deal:'+id,`${negName()} is writing the follow-up…`,(ai,signal)=>ai.json(promptFollow(d,c,price,priceDrop),{signal}),quiet);
  if(!res||!state.deals[id])return;
  setDraft(id,{kind:'followup',action:'followup',price,email:{subject:String(res.email&&res.email.subject||''),body:String(res.email&&res.email.body||'')},sms:String(res.sms||''),why:priceDrop?`List price dropped to ${money(curList(d))}. ${price!==last?`Moving your offer to ${money(price)} gives them a reason to answer.`:'Holding your offer.'}`:`No reply in ${daysSince(lastAt(outs(d)))} days. Holding at ${money(price)}.`});
}
async function aiChat(id,msg){
  const d=state.deals[id];const c=calc(d);
  d.mayaChat=d.mayaChat||[];d.mayaChat.push({role:'user',content:msg,at:nowISO()});saveDeal(d);
  const res=await runAI('chat:'+id,`${negName()} is thinking…`,(ai,signal)=>ai.json(promptChat(d,c,msg),{signal}));
  const dd=state.deals[id];if(!dd)return;
  if(!res){dd.mayaChat.push({role:'assistant',content:'(No answer. Try again.)',at:nowISO()});saveDeal(dd);return}
  dd.mayaChat.push({role:'assistant',content:String(res.answer||'Done.'),at:nowISO()});dd.mayaChat=dd.mayaChat.slice(-40);
  const dr=res.draft;
  if(dr&&(dr.email||dr.sms)){
    let price=parseNum(dr.price);const act=ACTION_LABEL[dr.action]?dr.action:'custom';const cap=act==='creative'?c.sfCap:c.mao;const flags=[];
    if(price!=null&&price>cap){flags.push({cls:'red',text:`Capped at ${money(cap)}: ${negName()} suggested ${money(price)}.`});price=cap}
    dd.draft={kind:'chat',action:act,price,letterPrice:price,email:{subject:String(dr.email&&dr.email.subject||''),body:String(dr.email&&dr.email.body||'')},sms:String(dr.sms||''),why:'Drafted from your chat instruction.',flags,at:nowISO()};
    dd.needsYou=null;
  }
  saveDeal(dd);
}
async function quickAction(id,qa){
  const d=state.deals[id];if(!d)return;
  if(qa==='pause'){d.autopilot=false;saveDeal(d);logActivity(id,'info',`Autopilot paused on ${streetOf(d.address)}.`);toast('Autopilot paused for this deal');return}
  if(qa==='drop'){state.modal={type:'confirm',title:'Drop this deal?',text:`It moves to Archived and autopilot stops. ${negName()} can draft a polite step-back message for you to send.`,yes:'Drop it',yes2:'Drop and draft a goodbye',run:()=>{const dd=state.deals[id];dd.stage='dead';dd.autopilot=false;dd.draft=null;saveDeal(dd)},run2:()=>{const dd=state.deals[id];dd.stage='dead';dd.autopilot=false;saveDeal(dd);if(ourCount(dd))aiReply(id,'Step back politely: thank them, say the numbers do not work for us right now, and leave the door open if anything changes. No new price.')}};render();return}
  const q=QUICK.find(x=>x.id===qa);if(!q)return;
  const c=calc(d);if(!c.ready){toast('Add an ARV first so '+negName()+' knows your ceiling.');return}
  if(!ourCount(d)&&qa!=='creative'){toast('Send the opening offer first.');return}
  d.mayaChat=d.mayaChat||[];d.mayaChat.push({role:'user',content:q.label,at:nowISO()});saveDeal(d,true);
  await aiReply(id,q.ins,false,`${negName()}: ${q.label.toLowerCase()}…`);
  const dd=state.deals[id];if(dd&&dd.draft){dd.mayaChat.push({role:'assistant',content:`Draft ready below${dd.draft.price?' at '+money(dd.draft.price):''}. ${dd.draft.why||''}`.trim(),at:nowISO()});saveDeal(dd)}
}
async function aiDeep(id,quiet){
  const d=state.deals[id];if(!d)return;
  const items=await photoItemsForAI(d);
  const model=bigModel();
  const res=await runAI('deep:'+id,`${negName()} is studying ${items.length?items.length+' photo'+(items.length>1?'s':''):'the listing'}${model&&/opus/.test(model)?' with Opus':''}…`,(ai,signal)=>ai.json(promptDeep(d,items.length),{signal,images:items,maxTokens:8000,model}),quiet);
  if(!res)return;const dd=state.deals[id];if(!dd)return;
  dd.analysis=Object.assign({},res,{at:nowISO(),photos:items.length,model:model||secrets().model||'claude-sonnet-5-5'});
  const book=Object.fromEntries(rehabBook().map(b=>[b.key,b]));const short=u=>/sqft/.test(u)?'sqft':/linear/.test(u)?'ft':/house/.test(u)?'':'';
  const fromBook=(Array.isArray(res.rehabItems)?res.rehabItems:[]).filter(x=>book[x.key]&&parseNum(x.qty)>0).map(x=>{const b=book[x.key];const q=parseNum(x.qty);return {item:b.label,detail:`${/house/.test(b.unit)?'':numFmt(q)+(short(b.unit)?' '+short(b.unit):'')+' × '+(b.cost<100&&b.cost%1?'$'+b.cost.toFixed(2):money(b.cost))+' · '}${String(x.why||'')}${x.seen===false?' (not in photos: allowance)':''}`,cost:Math.round(q*b.cost),key:x.key,qty:q,seen:x.seen!==false}});
  const custom=(Array.isArray(res.customLines)?res.customLines:[]).filter(x=>parseNum(x.cost)).map(x=>({item:String(x.item||''),detail:String(x.detail||''),cost:parseNum(x.cost)}));
  const lines=fromBook.length||custom.length?[...fromBook,...custom]:(Array.isArray(res.rehabLines)?res.rehabLines.map(x=>({item:String(x.item||''),detail:String(x.detail||''),cost:parseNum(x.cost)})):[]);
  if(lines.length){dd.rehabLines=lines;dd.rehabCont=parseNum(res.contingencyPct)??10;
    const tot=Math.round(dd.rehabLines.reduce((a,x)=>a+(x.cost||0),0)*(1+(dd.rehabCont||0)/100));if(!dd.rehab||dd.rehabSource==='maya'){dd.rehab=tot;dd.rehabSource='maya'}}
  const av=res.arv&&parseNum(res.arv.value);if(av&&(!dd.arv||dd.arvSource==='maya')){dd.arv=floor500(av);dd.arvSource='maya'}
  const rv=res.rent&&parseNum(res.rent.value);if(rv&&!dd.rent)dd.rentEst=rv;
  if(res.rooms){if(!dd.beds&&parseNum(res.rooms.bedrooms))dd.beds=parseNum(res.rooms.bedrooms);if(!dd.baths&&parseNum(res.rooms.bathrooms))dd.baths=parseNum(res.rooms.bathrooms)}
  saveDeal(dd);logActivity(id,'info',`${negName()} finished the inspection of ${streetOf(dd.address)}: ${res.level||'report ready'}.`);
  if(!quiet)toast('Inspection report ready');
}
async function deepAll(){
  const list=Object.values(state.deals).filter(d=>!d.analysis&&!['dead','closed'].includes(d.stage)&&!d.example).slice(0,10);
  if(!list.length){toast('Every open deal already has an inspection.');return}
  toast(`${negName()} is analyzing ${list.length} deal${list.length>1?'s':''}…`);
  for(const d of list)await aiDeep(d.id,true);
  toast('Deep analysis done');
}

/* ---------- sending / logging ---------- */
function markSent(id,ch){
  const d=state.deals[id];const dr=d&&d.draft;if(!dr)return;
  const at=nowISO();dr.sent=dr.sent||{};
  pushMsg(d,{dir:'out',channel:ch,subject:ch==='email'?(dr.email&&dr.email.subject)||'':'',text:ch==='email'?(dr.email&&dr.email.body)||'':dr.sms||'',price:dr.price??null,kind:dr.kind,by:'maya'});
  if(!dr.recorded){
    dr.recorded=true;
    const priceChanged=dr.price!=null&&dr.price!==lastOurPrice(d);
    if(priceChanged&&dr.action!=='hold'&&dr.action!=='walk'){d.offers=d.offers||[];d.offers.push({at,price:dr.price,by:'us'})}
    if(dr.kind==='followup'&&!priceChanged){d.follow=d.follow||{base:at,step:0};d.follow.step++}
    else d.follow={base:at,step:0};
    if(d.stage==='new')d.stage=ins(d).length&&d.source!=='wholesaler'?'negotiating':'sent';
    if(dr.action==='walk')d.follow={base:at,step:(state.settings.followDays||[]).length-1};
    if(dr.action==='accept')d.stage='negotiating';
  }
  dr.sent[ch]=true;d.needsYou=null;
  if(dr.sent.email&&dr.sent.sms)d.draft=null;
  saveDeal(d);
}
function logMessage(id,ask){
  const d=state.deals[id];const text=(state.drafts['log-text']||'').trim();const k=state.logKind;
  if(!text){toast('Paste or type the message first.');return}
  const ch=k==='note'?'note':(state.drafts['log-ch']||'email');
  const price=parseNum(state.drafts['log-price']);
  if(k==='in')receive(d,{dir:'in',channel:ch,text,price,at:nowISO()});else pushMsg(d,{dir:k==='note'?'note':'out',channel:k==='note'?'call':ch,text,price});
  if(price!=null&&k!=='note'){d.offers=d.offers||[];d.offers.push({at:nowISO(),price,by:k==='in'?'them':'us'});if(k==='out')d.follow={base:nowISO(),step:0}}
  if(k==='out'&&d.stage==='new')d.stage='sent';
  state.drafts['log-text']='';state.drafts['log-price']='';
  saveDeal(d);
  if(ask&&k==='in'&&!d.optedOut&&calc(d).ready)aiReply(id);
  else if(ask&&k==='in'&&!calc(d).ready)toast(`Logged. Add an ARV so ${negName()} has a ceiling to work with.`,4200);
}
function saveFile(name,text,type){const b=text instanceof Blob?text:new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}

/* ---------- one-pager for buyers ---------- */
async function onePager(id){
  const d=state.deals[id];const c=calc(d);const imgs=[];
  for(const pid of (d.photoIds||[]).slice(0,4)){try{const r=await IDB.get('photos',pid);if(r&&r.blob)imgs.push('data:image/jpeg;base64,'+await blobToB64(r.blob))}catch(e){}}
  for(const u of (d.photoUrls||[]).slice(0,Math.max(0,4-imgs.length)))imgs.push(u);
  const a=d.analysis;const p=state.settings.profile;
  const price=lastTheirPrice(d)||curList(d);const prof=c.ready?c.resultAt(price):null;
  const rows=[['Asking',money(curList(d))],['ARV',money(c.A)],['Est. repairs',money(d.rehab)],['Beds / baths',`${d.beds??'?'} / ${d.baths??'?'}`],['Sq ft',numFmt(d.sqft)],['Lot',d.lotSqft?numFmt(d.lotSqft)+' sqft':'—'],['Year built',d.year||'—'],['Est. rent',money(d.rent||d.rentEst)]];
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(streetOf(d.address))} — deal sheet</title>
<style>body{font-family:"Plus Jakarta Sans",system-ui,Arial,sans-serif;margin:0;color:#141A2E;background:#fff}.w{max-width:860px;margin:0 auto;padding:28px}.top{background:linear-gradient(115deg,#3E5BF6,#8B3DFF);color:#fff;border-radius:16px;padding:22px}h1{margin:0;font-size:26px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.t{border:1px solid #E4E7F0;border-radius:12px;padding:12px}.t b{display:block;font-size:20px}.t span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#667090}.ph{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}.ph img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px}table{width:100%;border-collapse:collapse}td{padding:8px 4px;border-bottom:1px solid #E4E7F0}td:last-child{text-align:right;font-weight:700}.btn{display:inline-block;margin-top:18px;padding:10px 16px;border-radius:10px;background:#141A2E;color:#fff;border:0;font-weight:700;cursor:pointer}@media print{.btn{display:none}}@media(max-width:600px){.g{grid-template-columns:1fr 1fr}}</style></head><body><div class="w">
<div class="top"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${d.source==='wholesaler'?'Off-market deal':'Investment opportunity'}</div><h1>${esc(streetOf(d.address))}</h1><div>${esc([d.city,d.state,d.zip].filter(Boolean).join(', '))}</div></div>
<div class="g"><div class="t"><span>Price</span><b>${money(price)}</b></div><div class="t"><span>ARV</span><b>${money(c.A)}</b></div><div class="t"><span>Repairs</span><b>${money(d.rehab)}</b></div><div class="t"><span>${c.strat==='wholesale'?'Spread':'Profit'}</span><b>${prof?money(prof.val):'—'}</b></div></div>
${imgs.length?`<div class="ph">${imgs.map(s=>`<img src="${esc(s)}" alt="">`).join('')}</div>`:''}
<table>${rows.map(r=>`<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>
${a&&a.summary?`<h3>Condition</h3><p>${esc(a.summary)}</p>${(a.suggestions||[]).length?`<ul>${a.suggestions.slice(0,6).map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:''}`:''}
${(d.comps||[]).length?`<h3>Sold comps</h3><table>${d.comps.map(x=>`<tr><td>${esc(x.addr)}${x.soldDate?' · '+esc(x.soldDate):''}</td><td>${money(x.price)}</td></tr>`).join('')}</table>`:''}
${d.description?`<h3>Description</h3><p>${esc(d.description)}</p>`:''}
<p style="margin-top:22px;color:#667090;font-size:13px">Contact ${esc(p.name||'')}${p.company?' · '+esc(p.company):''}${p.phone?' · '+esc(p.phone):''}${p.email?' · '+esc(p.email):''}</p>
<button class="btn" onclick="window.print()">Print or save as PDF</button></div></body></html>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  const w=window.open(url,'_blank');
  if(!w)saveFile(streetOf(d.address).replace(/[^\w]+/g,'-')+'-deal-sheet.html',html,'text/html');
}
