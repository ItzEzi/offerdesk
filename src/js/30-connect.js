/* ================= photos (IndexedDB) ================= */
const photoObjURL={};
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img'));i.src=src})}
async function downscale(blob,max,q,thumbMax){
  const url=URL.createObjectURL(blob);
  try{
    const img=await loadImg(url);const s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*s));cv.height=Math.max(1,Math.round(img.naturalHeight*s));
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    const out=await new Promise(r=>cv.toBlob(r,'image/jpeg',q));
    const ts=Math.min(1,thumbMax/Math.max(cv.width,cv.height));const tc=document.createElement('canvas');tc.width=Math.max(1,Math.round(cv.width*ts));tc.height=Math.max(1,Math.round(cv.height*ts));
    tc.getContext('2d').drawImage(cv,0,0,tc.width,tc.height);
    return {blob:out,thumb:tc.toDataURL('image/jpeg',.72),w:cv.width,h:cv.height};
  }finally{URL.revokeObjectURL(url)}
}
async function addPhotoBlobs(dealId,blobs,source){
  const d=state.deals[dealId];if(!d)return 0;
  if(!IDB.db){toast('Photos need browser storage, which isn’t available here.');return 0}
  d.photoIds=d.photoIds||[];let n=0;
  for(const f of blobs){
    if(f.type&&!/^image\//.test(f.type))continue;
    if(d.photoIds.length>=24)break;
    try{const {blob,thumb,w,h}=await downscale(f,1400,.82,180);const id=uid('ph');
      await IDB.put('photos',{id,dealId,blob,w,h,source:source||'upload',at:nowISO()});
      d.photoIds.push(id);photoObjURL[id]=URL.createObjectURL(blob);if(!d.thumb)d.thumb=thumb;n++}catch(e){}
  }
  saveDeal(d);return n;
}
function addPhotoUrls(dealId,urls){
  const d=state.deals[dealId];if(!d)return 0;d.photoUrls=d.photoUrls||[];let n=0;
  for(const u of urls){const s=String(u||'').trim();if(!/^https:\/\/\S+$/i.test(s)||d.photoUrls.includes(s))continue;if(d.photoUrls.length>=24)break;d.photoUrls.push(s);n++}
  if(n&&!d.thumb&&!(d.photoIds||[]).length)d.thumbUrl=d.photoUrls[0];
  saveDeal(d);return n;
}
async function removePhoto(dealId,pid){
  const d=state.deals[dealId];if(!d)return;
  if(pid.startsWith('url:')){const u=pid.slice(4);d.photoUrls=(d.photoUrls||[]).filter(x=>x!==u);if(d.thumbUrl===u)d.thumbUrl=d.photoUrls[0]||null}
  else{d.photoIds=(d.photoIds||[]).filter(x=>x!==pid);if(IDB.db)IDB.del('photos',pid).catch(()=>{});if(photoObjURL[pid]){URL.revokeObjectURL(photoObjURL[pid]);delete photoObjURL[pid]}
    if(!d.photoIds.length)d.thumb=null;else{try{const r=await IDB.get('photos',d.photoIds[0]);if(r&&r.blob)d.thumb=(await downscale(r.blob,180,.72,180)).thumb}catch(e){}}}
  saveDeal(d);
}
async function ensurePhotoUrls(dealId){
  const d=state.deals[dealId];if(!d||!IDB.db)return;let changed=false;
  for(const id of d.photoIds||[]){if(photoObjURL[id])continue;try{const r=await IDB.get('photos',id);if(r&&r.blob){photoObjURL[id]=URL.createObjectURL(r.blob);changed=true}}catch(e){}}
  if(changed)render();
}
async function photoItemsForAI(d){
  const items=[];
  for(const id of (d.photoIds||[]).slice(0,12)){try{const r=await IDB.get('photos',id);if(r&&r.blob)items.push(r.blob)}catch(e){}}
  for(const u of (d.photoUrls||[]).slice(0,Math.max(0,12-items.length)))items.push({url:u});
  return items;
}
const photoCount=d=>(d.photoIds||[]).length+(d.photoUrls||[]).length;
function thumbSrc(d){return d.thumb||d.thumbUrl||null}
function b64ToBlob(b64,type){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:type||'image/jpeg'})}

/* ================= activity ================= */
function logActivity(dealId,kind,text){
  state.activity.unshift({id:uid('a'),at:nowISO(),dealId,kind,text});state.activity=state.activity.slice(0,300);persist('activity');
}
const unseenCount=()=>state.activity.filter(a=>!state.conn.seenAt||a.at>state.conn.seenAt).length;

/* ================= Gmail + texting bridge ================= */
/* Several Gmail accounts can be connected (e.g. company + personal). Maya reads from all of them and sends from one. */
function acctList(){const s=secrets();let a=Array.isArray(s.accounts)?s.accounts:null;if(!a){a=[];if(s.bridgeUrl)a.push({id:'g1',url:s.bridgeUrl})}return a}
function saveAccts(a){const s=secrets();s.accounts=a;delete s.bridgeUrl;lsSet(SECRET_KEY,JSON.stringify(s))}
const acctInfo=id=>(state.conn.accounts||{})[id]||null;
const connectedAccts=()=>acctList().filter(a=>a.url&&acctInfo(a.id)&&acctInfo(a.id).email);
function sendAcct(){const c=connectedAccts();return c.find(a=>a.id===state.settings.conn.sendAccount)||c[0]||null}
const sendInfo=()=>{const a=sendAcct();return (a&&acctInfo(a.id))||{}};
const sendEmail=()=>sendInfo().email||'';
const gmailOn=()=>!!sendAcct();
const textMode=()=>state.settings.conn.phone||'manual';
const smsOn=()=>textMode()==='twilio'&&gmailOn()&&!!sendInfo().twilio;
const gvOn=()=>textMode()==='gvoice'&&gmailOn();
async function bridge(action,payload,acctId){
  const a=acctId?acctList().find(x=>x.id===acctId):sendAcct();if(!a||!a.url)throw {code:'no_bridge'};
  let res;try{res=await fetch(a.url,{method:'POST',body:JSON.stringify(Object.assign({key:bridgeKey(),action},payload||{}))})}catch(e){throw {code:'bridge_net'}}
  const t=await res.text();let j;try{j=JSON.parse(t)}catch(e){throw {code:'bridge_bad',message:t.slice(0,160)}}
  if(!j.ok)throw {code:'bridge_err',message:j.error||'error'};
  return j;
}
function bridgeErr(e){
  const c=e&&e.code,m=e&&e.message;
  if(c==='no_bridge')return 'Connect Gmail first (Connect → Gmail).';
  if(c==='bridge_net')return 'Couldn’t reach your Gmail bridge. Check the URL and your internet.';
  if(c==='bridge_bad')return 'That URL didn’t answer like OfferDesk Bridge. Use the Web app URL ending in /exec, with access set to Anyone.';
  if(m==='wrong_secret')return 'The bridge rejected the secret. Copy the bridge code from Connect again and redeploy it.';
  if(m==='twilio_not_set')return 'Twilio isn’t saved in your bridge yet.';
  if(m==='no_recipient')return 'Add their email in Details first.';
  if(m==='unknown_action')return 'Your bridge is an older version. Copy the new bridge code from Connect and redeploy.';
  return 'Bridge error: '+(m||'unknown');
}
function parseFrom(s){const m=String(s||'').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);return m?{name:m[1].trim(),email:m[2].trim().toLowerCase()}:{name:'',email:String(s||'').trim().toLowerCase()}}
const digits10=s=>String(s||'').replace(/\D/g,'').slice(-10);
function e164(s){const d=String(s||'').replace(/\D/g,'');if(d.length===10)return '+1'+d;if(d.length===11&&d[0]==='1')return '+'+d;return d.length>6?'+'+d:''}
function stripQuoted(t){let s=String(t||'');for(const re of [/\n\s*On [^\n]{0,200}wrote:\s*\n/i,/\n-{2,}\s*Original Message\s*-{2,}/i,/\n\s*From: [^\n]+\n\s*(Sent|Date): /i,/\n>/]){const i=s.search(re);if(i>20)s=s.slice(0,i)}return s.trim().slice(0,4000)}
function buildQuery(defaultOnly){
  const c=state.settings.conn;if(!defaultOnly&&c.gmailQuery&&c.gmailQuery.trim())return c.gmailQuery.trim();
  const emails=(state.settings.wholesalers||[]).map(w=>(w.email||'').trim()).filter(Boolean).slice(0,40);
  const parts=['label:wholesalers'];if(emails.length)parts.push('from:('+emails.join(' OR ')+')');
  parts.push('("ARV" (assignment OR "off market" OR "off-market" OR wholesale OR "cash buyers"))');
  return 'newer_than:14d -from:me -in:sent -from:txt.voice.google.com ('+parts.join(' OR ')+')';
}
const byDate=(a,b)=>String(a.date||a.at).localeCompare(String(b.date||b.at));
const byUpdated=(a,b)=>String(b.updated).localeCompare(String(a.updated));
async function syncWholesalerEmails(acct){
  const r=await bridge('search',{query:buildQuery(),max:30},acct.id);let n=0;
  const seen=new Set(Object.values(state.deals).flatMap(d=>d.seenMsgIds||[]));
  const agentEmails=new Set(Object.values(state.deals).filter(d=>d.source!=='wholesaler').map(d=>((d.agent&&d.agent.email)||'').trim().toLowerCase()).filter(Boolean));
  for(const m of r.messages||[]){if(state.mail.emails[m.id]||seen.has(m.id))continue;if(agentEmails.has(parseFrom(m.from).email))continue;if(connectedAccts().some(a=>(acctInfo(a.id).email||'').toLowerCase()===parseFrom(m.from).email))continue;state.mail.emails[m.id]=Object.assign({},m,{status:'new',acct:acct.id});n++}
  saveMail();
  if(n&&state.settings.conn.autoImport&&aiOn()){for(const m of Object.values(state.mail.emails).filter(x=>x.status==='new').sort(byDate).reverse().slice(0,8))await importEmail(m.id,true)}
  return n;
}
function chooseDeal(cands,m){
  if(cands.length<2)return cands[0];
  const byThread=cands.find(d=>d.gmailThreadId&&d.gmailThreadId===m.threadId);if(byThread)return byThread;
  const txt=((m.subject||'')+' '+(m.body||'')).toLowerCase();
  const byAddr=cands.find(d=>{const num=streetOf(d.address).split(/\s+/)[0];return num&&/\d/.test(num)&&txt.includes(num.toLowerCase())});
  return byAddr||cands.sort(byUpdated)[0];
}
function receive(d,msg){
  d.thread=d.thread||[];d.thread.push(Object.assign({id:uid('m')},msg));d.thread.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  if(['new','sent'].includes(d.stage))d.stage='negotiating';
  if(looksOptOut(msg.text,msg.channel)){d.optedOut=true;d.draft=null;logActivity(d.id,'warn',`${streetOf(d.address)}: they asked not to be contacted. ${negName()} stopped.`)}
  else logActivity(d.id,'reply',`${(d.agent&&d.agent.name)||'The agent'} replied by ${msg.channel==='sms'?'text':'email'} on ${streetOf(d.address)}.`);
  d.needsYou=null;
}
async function syncReplies(acct){
  const live=Object.values(state.deals).filter(d=>['sent','negotiating','contract'].includes(d.stage)&&!d.optedOut&&d.agent&&d.agent.email&&outs(d).length);
  if(!live.length)return 0;
  const emails=[...new Set(live.map(d=>d.agent.email.trim().toLowerCase()))];let n=0;
  for(let i=0;i<emails.length;i+=15){
    const chunk=emails.slice(i,i+15);
    const r=await bridge('search',{query:'newer_than:30d -from:me from:('+chunk.join(' OR ')+')',max:40},acct.id);
    for(const m of (r.messages||[]).sort(byDate)){
      const em=parseFrom(m.from).email;
      const cands=live.filter(d=>d.agent.email.trim().toLowerCase()===em&&!(d.seenMsgIds||[]).includes(m.id));
      const d=chooseDeal(cands,m);if(!d)continue;
      d.seenMsgIds=(d.seenMsgIds||[]).concat(m.id).slice(-200);
      if(String(m.date)<String(outs(d)[0].at)){saveDeal(d,true);continue}
      receive(d,{dir:'in',channel:'email',subject:m.subject||'',text:stripQuoted(m.body),at:m.date,gmailId:m.id,inbox:acctInfo(acct.id).email});
      if(!d.gmailThreadId||(d.gmailAccount!==sendAcct().id&&acct.id===sendAcct().id)){d.gmailThreadId=m.threadId;d.gmailAccount=acct.id}
      saveDeal(d,true);n++;
    }
  }
  return n;
}
function gvNumber(m){const f=parseFrom(m.from);const lp=f.email.split('@')[0]||'';const dg=lp.split('.')[0].replace(/\D/g,'');if(dg.length>=10)return dg.slice(-10);const s=(m.subject||'').replace(/\D/g,'');return s.length>=10?s.slice(-10):null}
function gvBody(t){let s=String(t||'');const cut=s.search(/\n\s*(YOUR ACCOUNT|HELP CENTER|HELP FORUM|To respond to this text message|Google LLC)/i);if(cut>0)s=s.slice(0,cut);return s.replace(/<https?:[^>]+>/g,'').trim()}
function matchPhone(num){return Object.values(state.deals).filter(d=>d.agent&&d.agent.phone&&digits10(d.agent.phone)===num&&!['dead','closed'].includes(d.stage)).sort(byUpdated)[0]}
async function syncTexts(){
  let n=0;state.mail.texts=state.mail.texts||[];
  if(smsOn()){
    const r=await bridge('sms_inbox',{since:state.mail.lastSms||''});
    for(const m of r.messages||[]){
      if(String(m.at)>String(state.mail.lastSms||''))state.mail.lastSms=m.at;
      const d=matchPhone(digits10(m.from));
      if(d){if((d.seenMsgIds||[]).includes(m.sid))continue;d.seenMsgIds=(d.seenMsgIds||[]).concat(m.sid).slice(-200);receive(d,{dir:'in',channel:'sms',text:m.body||'',at:m.at});saveDeal(d,true);n++}
      else if(!state.mail.texts.some(t=>t.sid===m.sid)){state.mail.texts.push({sid:m.sid,from:m.from,body:m.body||'',at:m.at,status:'new'});n++}
    }
  }else if(gvOn()){
    const r=await bridge('search',{query:'from:txt.voice.google.com newer_than:14d',max:30});
    for(const m of (r.messages||[]).sort(byDate)){
      const num=gvNumber(m);if(!num)continue;const body=gvBody(m.body);const d=matchPhone(num);
      if(d){if((d.seenMsgIds||[]).includes(m.id))continue;d.seenMsgIds=(d.seenMsgIds||[]).concat(m.id).slice(-200);d.gvThreadId=m.threadId;
        if(firstOfferAt(d)&&String(m.date)<String(firstOfferAt(d))){saveDeal(d,true);continue}
        receive(d,{dir:'in',channel:'sms',text:body,at:m.date});saveDeal(d,true);n++}
      else if(!state.mail.texts.some(t=>t.sid===m.id)){state.mail.texts.push({sid:m.id,from:'+1'+num,body,at:m.date,status:'new',threadId:m.threadId});n++}
    }
  }
  saveMail();return n;
}
async function syncAll(manual){
  if(!gmailOn()){if(manual)toast('Connect Gmail first (Connect → Gmail).');return}
  if(state.syncing)return;state.syncing=true;render();
  try{
    let e=0,r=0;const fails=[];
    for(const a of connectedAccts()){try{e+=await syncWholesalerEmails(a);r+=await syncReplies(a)}catch(err){fails.push(acctInfo(a.id).email+': '+bridgeErr(err))}}
    if(fails.length&&fails.length===connectedAccts().length)throw {code:'bridge_err',message:fails.join(' / ')};
    if(fails.length)logActivity(null,'warn','Gmail check failed for '+fails.join(' / '));
    const t=(smsOn()||gvOn())?await syncTexts():0;
    state.mail.lastSync=nowISO();saveMail();persist('deals');
    if(manual||r||t)toast(`Checked: ${r} new repl${r===1?'y':'ies'}, ${e} new wholesaler email${e===1?'':'s'}${smsOn()||gvOn()?`, ${t} new text${t===1?'':'s'}`:''}`,3800);
  }catch(err){if(manual)toast(bridgeErr(err),5200);else logActivity(null,'warn','Gmail check failed: '+bridgeErr(err))}
  finally{state.syncing=false;render()}
}
const ownThread=d=>d.gmailThreadId&&(!d.gmailAccount||d.gmailAccount===(sendAcct()||{}).id)?d.gmailThreadId:null;
const canEmail=d=>gmailOn()&&!!(((d.agent&&d.agent.email)||'').trim()||ownThread(d));
function canText(d){if(smsOn())return !!e164(d.agent&&d.agent.phone);if(gvOn())return !!d.gvThreadId;return false}
function senderName(){const n=state.settings.neg,p=state.settings.profile;return n.senderName||(p.name?`${n.name} | ${p.company||p.name}`:n.name)}
async function sendEmailNow(id,quiet){
  const d=state.deals[id];const dr=d&&d.draft;if(!dr)return false;const to=((d.agent&&d.agent.email)||'').trim();
  if(!to&&!ownThread(d)){if(!quiet)toast('Add their email in Details first.');return false}
  const key='send:'+id;state.busy[key]={label:'Sending from '+sendEmail()+'…'};render();
  try{const r=await bridge('send',{to,subject:(dr.email&&dr.email.subject)||'',body:(dr.email&&dr.email.body)||'',threadId:ownThread(d),name:senderName()});
    const dd=state.deals[id];if(r.threadId){dd.gmailThreadId=r.threadId;dd.gmailAccount=sendAcct().id}if(r.messageId)dd.seenMsgIds=(dd.seenMsgIds||[]).concat(r.messageId).slice(-200);
    markSent(id,'email');if(!quiet)toast('Email sent from '+sendEmail());return true}
  catch(e){const m=bridgeErr(e);if(quiet)logActivity(id,'warn',`Email on ${streetOf(d.address)} failed: ${m}`);else toast(m,5200);return false}
  finally{delete state.busy[key];render()}
}
async function sendTextNow(id,quiet){
  const d=state.deals[id];const dr=d&&d.draft;if(!dr||!dr.sms)return false;
  const key='send:'+id;state.busy[key]={label:'Sending the text…'};render();
  try{
    if(smsOn()){const to=e164(d.agent&&d.agent.phone);if(!to)throw {code:'bridge_err',message:'no_phone'};await bridge('sms_send',{to,body:dr.sms})}
    else if(gvOn()&&d.gvThreadId){await bridge('send',{threadId:d.gvThreadId,body:dr.sms})}
    else throw {code:'bridge_err',message:'no_text_channel'};
    markSent(id,'sms');if(!quiet)toast('Text sent');return true}
  catch(e){const m=e&&e.message==='no_phone'?'Add their phone number in Details first.':e&&e.message==='no_text_channel'?'Texting isn’t connected for this deal.':bridgeErr(e);if(quiet)logActivity(id,'warn',`Text on ${streetOf(d.address)} failed: ${m}`);else toast(m,5200);return false}
  finally{delete state.busy[key];render()}
}

/* ================= autopilot ================= */
const AUTO_OK=new Set(['opening','counter','hold','creative','followup']);
function draftSafety(d){
  const c=calc(d);const dr=d.draft;const why=[];if(!dr)return ['no draft'];
  const act=dr.action||dr.kind;if(!AUTO_OK.has(act))why.push(ACTION_LABEL[act]||act);
  const cap=act==='creative'?c.sfCap:c.mao;
  const over=[...ceilingCheck(dr.email&&dr.email.body,d,c,cap),...ceilingCheck(dr.sms,d,c,cap)];
  if(over.length)why.push('mentions '+[...new Set(over)].map(money).join(', '));
  if(dr.price!=null&&dr.price>cap)why.push('price above ceiling');
  else if(dr.price!=null&&act!=='creative'&&c.mao&&dr.price>c.mao*state.settings.buy.escalatePct/100)why.push(`above ${state.settings.buy.escalatePct}% of your ceiling`);
  if((dr.flags||[]).some(f=>f.cls==='red'))why.push('flagged');
  return why;
}
async function autoSend(d){
  const dr=d.draft;const lastIn=ins(d).slice(-1)[0];
  const pref=dr.kind==='opening'?state.settings.auto.openingChannel:(lastIn&&lastIn.channel==='sms'?'sms':'email');
  const order=pref==='both'?['email','sms']:pref==='sms'?['sms','email']:['email','sms'];
  let sent=0;
  for(const ch of order){
    if(!state.deals[d.id].draft)break;
    if(ch==='email'&&canEmail(d)&&dr.email&&dr.email.body){if(await sendEmailNow(d.id,true))sent++}
    else if(ch==='sms'&&canText(d)&&dr.sms){if(await sendTextNow(d.id,true))sent++}
    if(sent&&pref!=='both')break;
  }
  const dd=state.deals[d.id];if(sent&&dd.draft){dd.draft=null;saveDeal(dd,true)}
  return sent>0;
}
async function autopilotRun(manual){
  if(!state.settings.auto.enabled){if(manual)toast('Turn autopilot on first.');return}
  if(!aiOn()){if(manual)toast(aiErr({code:'no_ai'}));return}
  if(state.autoRunning)return;state.autoRunning=true;render();
  let openings=state.settings.auto.maxOpenings||5,acted=0;
  try{
    for(const id of Object.keys(state.deals)){
      const d=state.deals[id];if(!d||!d.autopilot||d.optedOut||d.example||['dead','closed','contract'].includes(d.stage))continue;
      const c=calc(d);if(!c.ready||c.dead)continue;
      if(!(canEmail(d)||canText(d)))continue;
      if(d.draft)continue;
      if(!ourCount(d)){if(openings<=0)continue;await aiOpening(id,true)}
      else if(replyWaiting(d))await aiReply(id,null,true);
      else{const f=followDue(d);if(f&&f.overdue&&state.settings.auto.followUps)await aiFollow(id,false,true);else continue}
      const dd=state.deals[id];if(!dd||!dd.draft)continue;
      const why=draftSafety(dd);const act=dd.draft.action||dd.draft.kind;const price=dd.draft.price;
      if(why.length){dd.needsYou=why.join(', ');saveDeal(dd,true);logActivity(id,'needs',`${negName()} drafted a ${(ACTION_LABEL[act]||'reply').toLowerCase()} for ${streetOf(dd.address)} and is waiting for you: ${dd.needsYou}.`);continue}
      if(await autoSend(dd)){acted++;if(act==='opening')openings--;logActivity(id,'sent',`${negName()} sent ${act==='opening'?'the opening offer':act==='followup'?'a follow-up':'a '+(ACTION_LABEL[act]||'reply').toLowerCase()} on ${streetOf(dd.address)}${price?' at '+money(price):''}.`)}
    }
    if(manual)toast(acted?`${negName()} handled ${acted} deal${acted>1?'s':''}.`:`Nothing for ${negName()} to send right now.`);
  }finally{state.autoRunning=false;persist('deals');render()}
}
async function tick(manual){
  if(gmailOn()&&(state.settings.conn.autoCheck||manual))await syncAll(manual);
  if(state.settings.auto.enabled)await autopilotRun(false);
}
