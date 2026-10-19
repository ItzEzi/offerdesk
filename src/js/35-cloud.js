/* ================= cloud save (Google Drive, through the bridge) ================= */
/* Data is split into parts (deals in 8 shards, emails in 4) saved as files in an "OfferDesk Cloud" Drive folder.
   Every item remembers when it last changed; when two devices disagree, the newer change wins (deletions too).
   Photos are saved as image files. Background work (Gmail checks, autopilot) runs on one device at a time. */
const DEVICE_ID=(()=>{let d=lsGet('od.device');if(!d){d=uid('dv');lsSet('od.device',d)}return d})();
function deviceLabel(){const u=navigator.userAgent||'';const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android':/Mac OS X/.test(u)?'Mac':/Windows/.test(u)?'Windows':/CrOS/.test(u)?'Chromebook':/Linux/.test(u)?'Linux':'a device';const br=/Edg\//.test(u)?'Edge':/OPR\//.test(u)?'Opera':/Firefox\/|FxiOS/.test(u)?'Firefox':/Chrome\/|CriOS/.test(u)?'Chrome':/Safari\//.test(u)?'Safari':'Browser';return br+' on '+os}
function hashStr(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+'.'+s.length}
const hashOf=v=>hashStr(JSON.stringify(v===undefined?null:v));
function shardOf(id,n){if(n<2)return 0;let h=0;const s=String(id);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h%n}
const COLS={
  deals:{n:8,key:'deals',get:()=>state.deals,set:m=>{state.deals=m}},
  practice:{n:1,key:'practice',get:()=>state.practice,set:m=>{state.practice=m}},
  campaigns:{n:1,key:'campaigns',get:()=>state.campaigns,set:m=>{state.campaigns=m}},
  emails:{n:4,key:'mail',get:()=>state.mail.emails,set:m=>{state.mail.emails=m}},
  texts:{n:1,key:'mail',get:()=>Object.fromEntries((state.mail.texts||[]).filter(t=>t&&t.sid).map(t=>[t.sid,t])),set:m=>{state.mail.texts=Object.values(m).sort((a,b)=>String(a.at).localeCompare(String(b.at)))}}
};
const WHOLES={
  settings:{key:'settings',get:()=>state.settings,set:v=>{state.settings=deepMerge(DEFAULTS,v||{})}},
  conn:{key:'conn',get:()=>state.conn,set:v=>{state.conn=v&&typeof v==='object'?v:{}}},
  secrets:{key:'secrets',get:()=>{const s=secrets();return {apiKey:s.apiKey||'',model:s.model||'',elevenKey:s.elevenKey||'',accounts:acctList()}},
    set:v=>{v=v||{};const s=secrets();if(v.apiKey)s.apiKey=v.apiKey;else delete s.apiKey;if(v.model)s.model=v.model;else delete s.model;if(v.elevenKey)s.elevenKey=v.elevenKey;else delete s.elevenKey;
      const acc=(Array.isArray(v.accounts)?v.accounts:[]).filter(a=>a&&a.id);const mine=acctList().find(a=>a.id===cm().acct);if(mine&&!acc.some(a=>a.id===mine.id))acc.unshift(mine);
      s.accounts=acc;delete s.bridgeUrl;lsSet(SECRET_KEY,JSON.stringify(s))}}
};
const range=(p,n)=>Array.from({length:n},(_,i)=>p+i);
const PARTS=[...range('deals',8),'practice','campaigns',...range('emails',4),'texts','settings','conn','secrets','mailmeta','activity'];
const KEY_PARTS={deals:range('deals',8),practice:['practice'],campaigns:['campaigns'],mail:[...range('emails',4),'texts','mailmeta'],activity:['activity'],settings:['settings'],conn:['conn'],secrets:['secrets']};
const partOf=(c,id)=>COLS[c].n>1?c+shardOf(id,COLS[c].n):c;
function parsePart(P){const m=String(P).match(/^([a-z]+)(\d*)$/);return {c:m[1],i:m[2]===''?0:+m[2]}}
function keyOfPart(P){const {c}=parsePart(P);return COLS[c]?COLS[c].key:WHOLES[c]?WHOLES[c].key:c==='mailmeta'?'mail':c}
const mailMeta=()=>({lastSync:state.mail.lastSync||null,lastSms:state.mail.lastSms||''});
const actIds=()=>(state.activity||[]).map(a=>a.id).join(',');

/* sync bookkeeping, kept per device */
const SYNC_KEY='od.sync';let CM=null;
function cm(){if(!CM){let o=null;try{o=JSON.parse(lsGet(SYNC_KEY)||'null')}catch(e){}CM=Object.assign({on:false,acct:null,base:false,joined:false,revs:{},s:{},h:{},tomb:{},dirty:{},up:{},last:null,err:'',lease:null,folderUrl:'',email:''},o||{})}return CM}
let cmT;function saveCM(){clearTimeout(cmT);cmT=setTimeout(()=>lsSet(SYNC_KEY,JSON.stringify(CM)),400)}
function saveCMNow(){clearTimeout(cmT);if(CM)lsSet(SYNC_KEY,JSON.stringify(CM))}
function cloudOn(){const m=cm();return !!(m.on&&m.acct&&acctList().some(a=>a.id===m.acct&&a.url))}
const cloudInfo=()=>acctInfo(cm().acct)||{};

/* change tracking: called after every local save */
function detectCol(c,now){
  const items=COLS[c].get()||{};const seen=new Set();
  for(const id of Object.keys(items)){const k=c+'/'+id;seen.add(k);const h=hashOf(items[id]);if(CM.h[k]!==h){CM.h[k]=h;CM.s[k]=now;delete CM.tomb[k];CM.dirty[partOf(c,id)]=1}}
  const pre=c+'/';for(const k of Object.keys(CM.h)){if(k.startsWith(pre)&&!seen.has(k)){const id=k.slice(pre.length);delete CM.h[k];delete CM.s[k];CM.tomb[k]=now;CM.dirty[partOf(c,id)]=1}}
}
function detectWhole(w,now){const h=hashOf(WHOLES[w].get());if(CM.h[w]!==h){CM.h[w]=h;CM.s[w]=now;CM.dirty[w]=1}}
function detectFlag(P,val){const h=hashOf(val);if(CM.h[P]!==h){CM.h[P]=h;CM.dirty[P]=1}}
function cloudTrack(key){
  if(!cloudOn()||!cm().base)return;const now=Date.now();
  if(key==='deals'||key==='practice'||key==='campaigns')detectCol(key,now);
  else if(key==='mail'){detectCol('emails',now);detectCol('texts',now);detectFlag('mailmeta',mailMeta())}
  else if(key==='activity')detectFlag('activity',actIds());
  else if(WHOLES[key])detectWhole(key,now);
  saveCM();if(Object.keys(CM.dirty).length)schedulePush();
}
/* starting point: what's here now counts as "old" (time 0), so the cloud wins any tie */
function cloudBaseline(){
  const m=cm();m.h={};m.s={};m.tomb={};m.dirty={};m.revs={};m.up={};m.joined=false;m.err='';
  for(const c of Object.keys(COLS)){const items=COLS[c].get()||{};for(const id of Object.keys(items))m.h[c+'/'+id]=hashOf(items[id])}
  for(const w of Object.keys(WHOLES))m.h[w]=hashOf(WHOLES[w].get());
  m.h.mailmeta=hashOf(mailMeta());m.h.activity=hashOf(actIds());
  for(const P of PARTS)m.dirty[P]=1;m.base=true;saveCMNow();
}
function pruneTombs(){const cut=Date.now()-60*DAY;for(const [k,t] of Object.entries(CM.tomb))if(t<cut)delete CM.tomb[k]}

/* what this device would save for one part */
function localDoc(P){
  const {c,i}=parsePart(P);
  if(COLS[c]){const C=COLS[c];const all=C.get()||{};const items={},tomb={};const pre=c+'/';
    for(const id of Object.keys(all))if(shardOf(id,C.n)===i)items[id]={t:CM.s[pre+id]||0,v:all[id]};
    for(const [k,t] of Object.entries(CM.tomb))if(k.startsWith(pre)){const id=k.slice(pre.length);if(shardOf(id,C.n)===i)tomb[id]=t}
    return {items,tomb}}
  if(WHOLES[c])return {t:CM.s[c]||0,v:WHOLES[c].get()};
  if(c==='mailmeta')return mailMeta();
  if(c==='activity')return {items:state.activity||[]};
  return null;
}
/* merge one part from the cloud into this device; says whether this device changed and whether the cloud needs our copy */
function mergeApply(P,R,dropEx){
  const {c,i}=parsePart(P);
  if(COLS[c]){
    const C=COLS[c];R=R||{};const RI=R.items||{},RT=R.tomb||{};const live=C.get()||{};const pre=c+'/';let changed=false,push=false;
    const ids=new Set(Object.keys(RI).concat(Object.keys(RT)));
    for(const id of Object.keys(live))if(shardOf(id,C.n)===i)ids.add(id);
    for(const k of Object.keys(CM.tomb))if(k.startsWith(pre)){const id=k.slice(pre.length);if(shardOf(id,C.n)===i)ids.add(id)}
    for(const id of ids){
      const k=pre+id,li=live[id],ri=RI[id],has=li!==undefined;const lt=has?(CM.s[k]||0):-1;const lTomb=CM.tomb[k],rTomb=RT[id];
      if(dropEx&&c==='deals'&&has&&li&&li.example&&!ri){delete live[id];delete CM.h[k];delete CM.s[k];changed=true;continue}
      const tomb=Math.max(lTomb==null?-1:lTomb,rTomb==null?-1:rTomb);
      let useR=false,best=-1;
      if(has&&ri){useR=!(lt>ri.t);best=useR?ri.t:lt}else if(ri){useR=true;best=ri.t}else if(has)best=lt;
      if(best>=0&&best>tomb){
        if(useR){if(!has||hashOf(ri.v)!==CM.h[k]){live[id]=ri.v;changed=true}CM.h[k]=hashOf(live[id]);CM.s[k]=ri.t;delete CM.tomb[k]}
        else if(!ri||ri.t<lt)push=true;
      }else if(tomb>=0){
        if(has){delete live[id];changed=true}
        delete CM.h[k];delete CM.s[k];CM.tomb[k]=tomb;
        if(ri||rTomb==null||rTomb<tomb)push=true;
      }
    }
    if(changed)C.set(live);
    return {changed,push};
  }
  if(WHOLES[c]){
    const W=WHOLES[c];const lt=CM.s[c]||0;
    if(!R||typeof R!=='object'||R.t==null)return {changed:false,push:true};
    if(lt>R.t)return {changed:false,push:true};
    let changed=false;if(hashOf(R.v)!==CM.h[c]){W.set(R.v);changed=true}
    CM.h[c]=hashOf(W.get());CM.s[c]=R.t;return {changed,push:false};
  }
  if(c==='mailmeta'){
    R=R||{};const L=mailMeta();const mx=(a,b)=>String(a||'')>String(b||'')?a:b;
    const M={lastSync:mx(L.lastSync,R.lastSync)||null,lastSms:mx(L.lastSms,R.lastSms)||''};
    const changed=M.lastSync!==L.lastSync||M.lastSms!==L.lastSms;if(changed){state.mail.lastSync=M.lastSync;state.mail.lastSms=M.lastSms}
    CM.h.mailmeta=hashOf(M);return {changed,push:M.lastSync!==(R.lastSync||null)||M.lastSms!==(R.lastSms||'')};
  }
  if(c==='activity'){
    const L=state.activity||[];const RA=(R&&Array.isArray(R.items))?R.items:[];const lids=new Set(L.map(a=>a.id)),rids=new Set(RA.map(a=>a&&a.id));
    const merged=L.concat(RA.filter(a=>a&&a.id&&!lids.has(a.id))).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,300);
    const changed=merged.some(a=>!lids.has(a.id));if(changed)state.activity=merged;
    CM.h.activity=hashOf(actIds());return {changed,push:merged.some(a=>!rids.has(a.id))};
  }
  return {changed:false,push:false};
}

/* one sync: ask which parts changed in the cloud, merge them, save ours */
const CS={p:null,again:false,timer:null};
function schedulePush(ms){clearTimeout(CS.timer);CS.timer=setTimeout(()=>{if(CS.p){CS.again=true;return}cloudSync()},ms||2500)}
function cloudSync(manual){
  if(!cloudOn())return Promise.resolve(false);
  if(CS.p){CS.again=true;return CS.p}
  CS.p=runCloudSync(manual).finally(()=>{CS.p=null;if(CS.again){CS.again=false;schedulePush(1200)}});
  return CS.p;
}
async function runCloudSync(manual){
  state.cloudSyncing=true;cloudBits();const changed=new Set();let ok=false;const errBefore=CM.err;
  try{
    for(let round=0;round<4;round++){flushAll();if(!(await cloudRound(changed)))break}
    CM.joined=true;CM.last=nowISO();CM.err='';ok=true;
  }catch(e){CM.err=bridgeErr(e);if(manual)toast('Cloud save: '+CM.err,5200)}
  finally{
    state.cloudSyncing=false;saveCMNow();
    if(changed.size&&state.view==='deal'&&state.dealId&&!state.deals[state.dealId])go('listings');
    if(changed.size||manual||CM.err!==errBefore)render();else cloudBits();
  }
  if(ok)photoSync();
  return ok;
}
async function cloudRound(changed){
  pruneTombs();
  const meta=await bridge('cloud_meta',{},CM.acct);
  CM.lease=meta.lease||null;if(meta.folderUrl)CM.folderUrl=meta.folderUrl;if(meta.email)CM.email=meta.email;
  const rr=meta.revs||{};
  const pull=PARTS.filter(P=>(rr[P]||0)!==(CM.revs[P]||0));const got={};
  for(let i=0;i<pull.length;i+=4){const r=await bridge('cloud_get',{names:pull.slice(i,i+4)},CM.acct);Object.assign(got,r.parts||{})}
  const dropEx=!CM.joined&&Object.keys(got).some(P=>/^deals\d/.test(P)&&got[P]&&got[P].data&&Object.keys(got[P].data.items||{}).length);
  const toPush=[];const touched=new Set();
  for(const P of PARTS){
    const g=got[P];
    if(g){const res=mergeApply(P,g.data,dropEx);CM.revs[P]=g.rev||0;if(res.changed){changed.add(keyOfPart(P));touched.add(keyOfPart(P))}if(res.push)toPush.push(P);else delete CM.dirty[P]}
    else if(CM.dirty[P])toPush.push(P);
  }
  for(const k of touched)if(k!=='secrets')writeKey(k);
  if(!toPush.length)return false;
  let conflict=false,batch={},size=0;
  const send=async()=>{const r=await bridge('cloud_put',{parts:batch},CM.acct);for(const [P,rev] of Object.entries(r.revs||{})){CM.revs[P]=rev;delete CM.dirty[P]}if(r.conflicts&&Object.keys(r.conflicts).length)conflict=true;batch={};size=0};
  for(const P of toPush){const data=localDoc(P);const n=JSON.stringify(data).length;if(size&&size+n>2.5e6)await send();batch[P]={base:CM.revs[P]||0,data};size+=n}
  if(Object.keys(batch).length)await send();
  saveCMNow();return conflict;
}

/* photos: saved as images in the Drive folder's "photos" subfolder */
const PS={busy:false,miss:{}};
function blobB64(b){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]||'');fr.onerror=()=>rej(fr.error);fr.readAsDataURL(b)})}
async function photoSync(){
  if(!cloudOn()||!IDB.db||PS.busy)return;PS.busy=true;let got=0;
  try{
    const ref=new Map();for(const d of Object.values(state.deals))for(const id of d.photoIds||[])ref.set(id,d.id);
    const local=new Set(await IDB.tx('photos','readonly',s=>s.getAllKeys()));CM.up=CM.up||{};
    const needUp=[...ref.keys()].some(id=>local.has(id)&&!CM.up[id]);
    const needDown=[...ref.keys()].some(id=>!local.has(id)&&!(PS.miss[id]>Date.now()-5*60e3));
    const gcDue=Date.now()-(CM.photoGc||0)>30*60e3;
    if(!needUp&&!needDown&&!gcDue)return;
    const list=(await bridge('photo_list',{},CM.acct)).photos||[];const cloud=new Set(list.map(p=>p.id));CM.up=Object.fromEntries(list.map(p=>[p.id,1]));
    for(const [id,dealId] of ref){
      if(local.has(id)&&!cloud.has(id)){const r=await IDB.get('photos',id);if(r&&r.blob){await bridge('photo_put',{id,type:r.blob.type||'image/jpeg',data:await blobB64(r.blob),meta:{dealId:r.dealId||dealId,w:r.w,h:r.h,source:r.source,at:r.at}},CM.acct);CM.up[id]=1}}
      else if(!local.has(id)){
        if(!cloud.has(id)){PS.miss[id]=Date.now();continue}
        try{const r=await bridge('photo_get',{id},CM.acct);const m=r.meta||{};await IDB.put('photos',{id,dealId:m.dealId||dealId,blob:b64ToBlob(r.data,r.type),w:m.w,h:m.h,source:m.source||'cloud',at:m.at||nowISO()});delete PS.miss[id];got++}catch(e){PS.miss[id]=Date.now()}
      }
    }
    if(gcDue){const old=list.filter(p=>!ref.has(p.id)&&Date.now()-new Date(p.at).getTime()>3600e3).map(p=>p.id);if(old.length){await bridge('photo_del',{ids:old},CM.acct);old.forEach(id=>delete CM.up[id])}CM.photoGc=Date.now()}
  }catch(e){}
  finally{PS.busy=false;saveCM();if(got&&state.view==='deal'&&state.dealId)ensurePhotoUrls(state.dealId)}
}

/* one device at a time does background work, so nothing is sent twice */
async function cloudLease(force){
  if(!cloudOn())return true;
  try{const r=await bridge('lease',{device:DEVICE_ID,label:deviceLabel(),ttl:7*60e3,force:!!force},CM.acct);CM.lease=r.lease||null;saveCM();return !!r.mine}catch(e){return false}
}
function leaseHolder(){const L=cloudOn()&&CM.lease;if(!L||L.until<Date.now())return null;return L.device===DEVICE_ID?'this device':(L.label||'another device')}
window.addEventListener('pagehide',()=>{
  if(!cloudOn()||!CM.lease||CM.lease.device!==DEVICE_ID)return;const a=acctList().find(x=>x.id===CM.acct);if(!a||!navigator.sendBeacon)return;
  try{navigator.sendBeacon(a.url,new Blob([JSON.stringify({key:bridgeKey(),action:'lease',device:DEVICE_ID,release:true})],{type:'text/plain'}))}catch(e){}
});

/* linking another device: the link carries the bridge address and secret, then the cloud fills in the rest */
const b64url=s=>btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64url=s=>decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/'))));
function cloudLinkURL(){const a=acctList().find(x=>x.id===cm().acct);if(!a)return '';return ONLINE_URL+'#link/'+b64url(JSON.stringify({u:a.url,k:bridgeKey(),a:a.id}))}
function cloudTakeLink(){
  const m=(location.hash||'').match(/^#link\/([A-Za-z0-9_-]+)$/);if(!m)return false;
  try{history.replaceState(null,'',location.pathname+location.search+'#dashboard')}catch(e){location.hash='#dashboard'}
  let o=null;try{o=JSON.parse(unb64url(m[1]))}catch(e){}
  if(!o||!/^https:\/\/script\.google(usercontent)?\.com\//.test(String(o.u||''))||!o.k||!o.a){setTimeout(()=>toast('That device link didn’t work. Make a new one on your other device.',5200),300);return false}
  setSecret('bridgeKey',String(o.k));
  const accts=acctList().filter(x=>x.id!==o.a&&x.url!==o.u);accts.unshift({id:String(o.a),url:String(o.u)});saveAccts(accts);
  const c=cm();c.on=true;c.acct=String(o.a);cloudBaseline();
  return true;
}
function qrSVG(text){try{const q=qrcode(0,'L');q.addData(text);q.make();return q.createSvgTag({cellSize:4,margin:4,scalable:true,title:'Scan to link this device'})}catch(e){return ''}}

/* UI bits (status updates in place, so a background sync doesn't redraw the page) */
function cloudBits(){
  document.querySelectorAll('[data-cloud-pill]').forEach(el=>{el.innerHTML=cloudPill()});
  document.querySelectorAll('[data-cloud-dot]').forEach(el=>{el.className='dot '+cloudDotCls()});
}
function cloudDotCls(){return !cloudOn()?'':state.cloudSyncing?'sync':cm().err?'warn':'on'}
function cloudPill(){
  if(!cloudOn())return '<span class="pill slate">Off</span>';
  if(state.cloudSyncing)return '<span class="pill blue">Syncing…</span>';
  if(CM.err)return '<span class="pill orange">Can’t reach the cloud</span>';
  return `<span class="pill green">Saved${CM.last?' · '+ago(CM.last):''}</span>`;
}
function cloudCardHTML(){
  const n=esc(negName());const gm=gmailOn();const on=cloudOn();
  const head=`<div class="card-head"><span class="ci blue">${ico('cloud')}</span><div><h2>Cloud save</h2><p>Your whole desk on every device, saved in your Google Drive</p></div><div class="ch-r" data-cloud-pill>${cloudPill()}</div></div>`;
  if(!gm)return `<section class="conn-card" id="conn-cloud">${head}<p class="small">Connect your company Gmail first (above). The cloud lives in that Google account’s Drive, in a folder called <b>OfferDesk Cloud</b>. It’s free and nothing else is needed.</p></section>`;
  if(!on){
    const conn=connectedAccts();const pick=state.drafts['cloud-acct']&&conn.some(a=>a.id===state.drafts['cloud-acct'])?state.drafts['cloud-acct']:(sendAcct()||{}).id;const info=acctInfo(pick)||{};
    return `<section class="conn-card" id="conn-cloud">${head}
    <p class="small">Saves your deals, photos, settings, API key and connections to a folder called <b>OfferDesk Cloud</b> in your Google Drive. Changes upload within seconds, and your phone or another computer stays in step. If a browser ever loses its data, it all comes back.</p>
    ${conn.length>1?`<label class="field"><span>Save to the Drive of</span><select class="input" id="cloud-acct" data-draft>${conn.map(a=>`<option value="${a.id}" ${a.id===pick?'selected':''}>${esc(acctInfo(a.id).email)}</option>`).join('')}</select></label>`:''}
    ${(info.version||1)<3?`<div class="note amber">This Gmail bridge is an older version. Copy the bridge code again (Gmail card, step 2), paste it over the old code in Apps Script, then <b>Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy</b> and approve Google Drive access. Then turn the cloud on.</div>`:''}
    <div class="row"><button class="btn primary" data-act="cloud-on" ${state.busy.cloud?'disabled':''}>${ico('cloud')}Turn on cloud save</button>${busyHTML('cloud',false)}</div></section>`;
  }
  const holder=leaseHolder();const folder=CM.folderUrl;
  return `<section class="conn-card" id="conn-cloud">${head}
    <p class="small">Everything is saved to <b>OfferDesk Cloud</b> in ${esc(CM.email||cloudInfo().email||'your')}’s Google Drive: deals, photos, settings, your API key and Gmail connections. Changes upload within seconds; your other devices pick them up within a minute, or right away when you switch back to them.</p>
    ${CM.err?`<div class="note amber">${esc(CM.err)}</div>`:''}
    <div class="row"><button class="btn sm" data-act="cloud-sync" ${state.cloudSyncing?'disabled':''}>${ico('refresh')}${state.cloudSyncing?'Syncing…':'Sync now'}</button><button class="btn primary sm" data-act="cloud-link">${ico('phone')}Add your phone or another computer</button>${folder?`<a class="btn ghost sm" href="${esc(folder)}" target="_blank" rel="noopener">${ico('link')}Open the Drive folder</a>`:''}<button class="btn ghost sm" data-act="cloud-off">Turn off on this device</button></div>
    <p class="small muted">${n} checks Gmail and runs autopilot from one device at a time, so nothing goes out twice.${holder?` Right now: <b>${esc(holder)}</b>.`:''}${holder&&holder!=='this device'?` <button class="linkbtn" data-act="lease-take">Run from this device instead</button>`:''}</p></section>`;
}
function linkModalHTML(){
  const url=cloudLinkURL();
  return `<div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><h2>Add your phone or another computer</h2><button class="btn ghost sm" data-act="modal-close" aria-label="Close">${ico('close')}</button></div>
  <div class="qr-wrap"><div class="qr">${qrSVG(url)}</div><ol class="steps"><li>On your phone, open the camera and point it at this code. On another computer, copy the link below and open it there.</li><li>OfferDesk opens already connected and pulls in your deals, photos and settings from the cloud.</li><li>On iPhone, tap Share → <b>Add to Home Screen</b> so it opens like an app.</li></ol></div>
  <div class="row" style="flex-wrap:nowrap"><input class="input" id="cloud-link-url" readonly value="${esc(url)}"><button class="btn sm" data-act="copy" data-src="cloud-link-url">${ico('copy')}Copy</button></div>
  <div class="note amber">This link works like a password to your Gmail bridge. Only open it on your own devices and don’t post it anywhere.</div>`;
}
