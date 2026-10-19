'use strict';
const APP_V='__APP_V__';
const ONLINE_URL='https://itzezi.github.io/offerdesk/';
/* ================= constants ================= */
const STAGES=[
  {id:'new',label:'Waiting for outreach',sub:'Maya sends the opening offer',color:'var(--s-teal)'},
  {id:'sent',label:'Offer sent · follow-up',sub:'Follow-ups pause the moment they reply',color:'var(--s-slate)'},
  {id:'negotiating',label:'Negotiation',sub:'Fills up when an agent replies',color:'var(--s-pink)'},
  {id:'contract',label:'Under contract',sub:'Option period, title, buyer',color:'var(--s-green)'},
  {id:'closed',label:'Closed',sub:'Bought or assigned',color:'var(--s-blue)'},
  {id:'dead',label:'Archived',sub:'Passed, dead or opted out',color:'var(--s-gray)'}];
const STAGE_LABEL=Object.fromEntries(STAGES.map(s=>[s.id,s.label]));
const DEFAULTS={
  profile:{name:'',company:'',email:'',phone:''},
  buy:{strategy:'flip',targetRoi:20,minProfit:30000,holdMonths:5,holdCostMonthly:1200,buyCostPct:2,sellCostPct:8,wsBuyerPct:70,wsFee:10000,anchorGap:10,targetPct:40,maxRounds:4,escalatePct:95,closeDays:14,optionDays:7,emd:1000},
  creative:{enabled:true,maxDownPct:10,maxRate:5,termYears:30,maxOverPct:10},
  neg:{name:'Maya',tone:'friendly',disclose:true,optOutLine:true,senderName:''},
  conn:{phone:'manual',autoCheck:true,autoImport:true,gmailQuery:''},
  auto:{enabled:false,openingChannel:'email',maxOpenings:5,newDealsOn:false,followUps:true},
  rental:{taxInsMonthly:300,mgmtPct:8,maintPct:5,vacancyPct:5,refiLtv:75,refiRate:7.5},
  followDays:[2,5,10,20],
  wholesalers:[],
  ui:{listMode:'list'}
};
const TONES={friendly:'warm, direct and respectful of the agent’s time',firm:'polite but firm and businesslike, few words',casual:'casual and Texas-friendly, short sentences'};
const ACTION_LABEL={opening:'Opening offer',counter:'Counter',hold:'Hold firm',accept:'Accept their number',creative:'Seller-finance pitch',ask_owner:'Needs your call',walk:'Step back',stop:'They opted out',followup:'Follow-up',custom:'Your instruction',checkin:'Check-in',stall:'Buy time',call:'Ask for a call'};
const MLS_STATUS={for_sale:['For Sale','blue'],pending:['Pending','orange'],sold:['Sold','red'],off_market:['Off Market','slate'],unknown:['Unknown','slate']};
const SENTIMENT={warm:['Warm','green'],neutral:['Neutral','slate'],cold:['Cold','blue'],hostile:['Hostile','red']};
const PROP_TYPES={single_family:'Single family',multi_family:'Multi family',townhouse:'Townhouse',condo:'Condo',land:'Land',mobile:'Mobile home',other:'Other'};
const PERSONAS={
  tough:{label:'Tough listing agent',brief:'experienced, protective of the list price, short with investors, says the seller will not take a lowball, and needs a real reason to move',band:[.92,.97],color:'red'},
  stale:{label:'Agent with a stale listing',brief:'tired of a listing that has sat for months, open to a reasonable cash offer but still wants the best number for the seller',band:[.82,.90],color:'teal'},
  wholesaler:{label:'Wholesaler pushing a deal',brief:'a wholesaler with a contract to assign who hypes the ARV, creates urgency by mentioning other buyers, and will not share the seller’s price',band:[.90,.96],color:'orange'},
  offended:{label:'Agent offended by your offer',brief:'feels the offer is insulting, gets defensive, and tests whether the buyer is serious and has proof of funds',band:[.85,.92],color:'purple'}
};
const SAMPLE_SCENARIO={address:'Sample: 3/2 brick ranch, Garland TX 75040',listPrice:219900,arv:265000,rehab:48000,beds:3,baths:2,sqft:1420,dom:74,description:'Original kitchen and baths, roof about 15 years old, foundation previously repaired, vacant.'};
const DAY=864e5;

/* ================= icons ================= */
const ICONS={
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  listings:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  kanban:'<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
  leads:'<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  practice:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stats:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings:'<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8-4.2-4.1 5.9-.9z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  sms:'<path d="M4 5h16v11H9l-5 4z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  pin:'<path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  back:'<path d="M15 18l-6-6 6-6"/>',
  download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload:'<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  phone:'<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  bed:'<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.5"/>',
  bath:'<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
  ruler:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h4M3 15h4M9 3v4M15 3v4"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  dollar:'<path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7c0 5 10 3 10 9 0 2.2-2.2 3.5-5 3.5s-5-1.2-5-3.2"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  flame:'<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
  hammer:'<path d="M14 6l4 4M3 21l9-9M12 12l3 3 6-6-6-6-3 3"/>',
  percent:'<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  layers:'<path d="M12 3 2 8l10 5 10-5z"/><path d="M2 13l10 5 10-5"/>',
  swap:'<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  acre:'<path d="M3 20l6-12 4 7 3-4 5 9z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  link:'<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet:'<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4 2 4M17 14h.01"/>',
  building:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M10 21v-4h4v4"/>',
  gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  logo:'<path d="M3 11l9-7 9 7"/><path d="M6 10v10h12V10"/><path d="M10 15l2 2 4-4"/>'
};
const ico=(n,cls)=>`<svg class="i ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
const icoFill=n=>`<svg class="i" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;

/* ================= helpers ================= */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const nowISO=()=>new Date().toISOString();
function parseNum(v){if(v==null)return null;if(typeof v==='number')return isFinite(v)?v:null;let s=String(v).trim().replace(/[$,\s]/g,'');if(!s)return null;let m=1;if(/k$/i.test(s)){m=1e3;s=s.slice(0,-1)}else if(/m$/i.test(s)){m=1e6;s=s.slice(0,-1)}const n=parseFloat(s);return isFinite(n)?n*m:null}
const money=n=>n==null||!isFinite(n)?'—':(n<0?'−$':'$')+Math.abs(Math.round(n)).toLocaleString('en-US');
function moneyK(n){if(n==null||!isFinite(n))return '—';const a=Math.abs(n),sg=n<0?'−':'';if(a>=1e6)return sg+'$'+(Math.round(a/1e4)/100)+'M';if(a>=1e3)return sg+'$'+(Math.round(a/100)/10)+'K';return sg+'$'+Math.round(a)}
const pct=(n,d=1)=>n==null||!isFinite(n)?'—':(n*100).toFixed(d)+'%';
const numFmt=n=>n==null||!isFinite(n)?'—':Math.round(n).toLocaleString('en-US');
const floor500=n=>Math.floor(n/500)*500;
const round500=n=>Math.round(n/500)*500;
const fmtDate=iso=>{if(!iso)return '';const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined})};
const fmtWhen=iso=>{if(!iso)return '';const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})};
const daysSince=iso=>{if(!iso)return null;const t=new Date(iso).getTime();return isNaN(t)?null:Math.max(0,Math.floor((Date.now()-t)/DAY))};
function ago(iso){const d=daysSince(iso);if(d==null)return '';if(d===0){const m=Math.floor((Date.now()-new Date(iso).getTime())/6e4);return m<1?'just now':m<60?m+' min ago':Math.floor(m/60)+' h ago'}return d===1?'1 day ago':d+' days ago'}
const isoDay=iso=>{const d=iso?new Date(iso):new Date();return isNaN(d)?'':d.toISOString().slice(0,10)};
function getPath(o,p){return p.split('.').reduce((a,k)=>a==null?undefined:a[k],o)}
function setPath(o,p,v){const ks=p.split('.');let a=o;for(let i=0;i<ks.length-1;i++){const k=ks[i];if(a[k]==null||typeof a[k]!=='object')a[k]=/^\d+$/.test(ks[i+1])?[]:{};a=a[k]}a[ks[ks.length-1]]=v}
function deepMerge(base,over){const out=clone(base);if(!over||typeof over!=='object')return out;for(const k of Object.keys(over)){const v=over[k];if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k]))out[k]=deepMerge(out[k],v);else out[k]=v}return out}
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
function streetOf(a){return String(a||'').replace(/\s*\(example\)\s*/i,'').trim()}

/* ================= state ================= */
const state={
  settings:clone(DEFAULTS),deals:{},practice:{},mail:{emails:{},texts:[],lastSync:null,lastSms:''},activity:[],conn:{},
  loaded:false,view:'dashboard',dealId:null,busy:{},drafts:{},modal:null,syncing:false,autoRunning:false,
  lf:{q:'',source:'all',stage:'all',status:'all',sentiment:'all',type:'all',beds:'any',price:'any',state:'all',special:'all',autopilot:'all'},
  leads:{q:'',tag:null,fav:false,type:'all'},
  page:1,mayaTab:'chat',settingsTab:'connections',bellOpen:false,practiceId:null,logKind:'in',compsPaste:false,photoUrls:{},practicePersona:'tough'
};
const negName=()=>state.settings.neg.name||'Maya';

/* ================= storage (IndexedDB, falls back to localStorage) ================= */
const IDB={db:null,
  open(){return new Promise((res,rej)=>{if(!window.indexedDB)return rej(new Error('no idb'));let r;try{r=indexedDB.open('offerdesk',1)}catch(e){return rej(e)}
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'})};
    r.onsuccess=()=>{IDB.db=r.result;res()};r.onerror=()=>rej(r.error)})},
  tx(store,mode,fn){return new Promise((res,rej)=>{let t;try{t=IDB.db.transaction(store,mode)}catch(e){return rej(e)}const s=t.objectStore(store);let out;const r=fn(s);if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})},
  get(store,key){return IDB.tx(store,'readonly',s=>s.get(key))},
  put(store,val,key){return IDB.tx(store,'readwrite',s=>key===undefined?s.put(val):s.put(val,key))},
  del(store,key){return IDB.tx(store,'readwrite',s=>s.delete(key))}
};
const KEYS=['settings','deals','practice','mail','activity','conn'];
const saveTimers={};
function writeKey(key){
  const val=state[key];
  if(IDB.db)return IDB.put('kv',clone(val),key).catch(()=>{lsSet('od2.'+key,JSON.stringify(val))});
  lsSet('od2.'+key,JSON.stringify(val));return Promise.resolve();
}
function persist(key){clearTimeout(saveTimers[key]);saveTimers[key]=setTimeout(()=>{delete saveTimers[key];writeKey(key)},200)}
function flushAll(){for(const k of Object.keys(saveTimers)){clearTimeout(saveTimers[k]);delete saveTimers[k];writeKey(k)}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAll()});
window.addEventListener('pagehide',flushAll);
async function readKey(key){
  if(IDB.db){try{const v=await IDB.get('kv',key);if(v!==undefined)return v}catch(e){}}
  try{return JSON.parse(lsGet('od2.'+key)||'null')}catch(e){return null}
}
function saveDeal(d,quiet){d.updated=nowISO();state.deals[d.id]=d;persist('deals');if(!quiet)render()}
function removeDeal(id){const d=state.deals[id];if(d&&IDB.db)(d.photoIds||[]).forEach(pid=>IDB.del('photos',pid).catch(()=>{}));delete state.deals[id];persist('deals');if(state.dealId===id)go('listings');render()}
function saveSettings(){persist('settings');render()}
function savePractice(p){p.updated=nowISO();state.practice[p.id]=p;persist('practice');render()}
function saveMail(){const em=Object.values(state.mail.emails).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,300);state.mail.emails=Object.fromEntries(em.map(e=>[e.id,e]));state.mail.texts=(state.mail.texts||[]).slice(-150);persist('mail')}
function saveConn(){persist('conn')}
function cur(){return state.deals[state.dealId]}

/* ================= toast ================= */
let toastT;function toast(msg,ms=2800){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}

/* ================= routing ================= */
const VIEWS=['dashboard','listings','leads','deal','practice','stats','settings'];
function go(view,id){const h='#'+view+(id?'/'+id:'');if(location.hash===h)route();else location.hash=h}
function route(){
  const h=(location.hash||'#dashboard').slice(1);const [v,id,sub]=h.split('/');
  state.view=VIEWS.includes(v)?v:'dashboard';state.dealId=state.view==='deal'?id:null;
  if(state.view==='settings'&&id)state.settingsTab=id;
  if(state.view==='deal'&&state.loaded&&!state.deals[state.dealId]){location.hash='#listings';return}
  state.bellOpen=false;window.scrollTo(0,0);render();
  if(state.view==='deal'&&state.dealId)ensurePhotoUrls(state.dealId);
  const anchor=state.view==='deal'||state.view==='settings'?sub:id;
  if(anchor){setTimeout(()=>{const el=document.getElementById(anchor);if(el)el.scrollIntoView({block:'start'})},80)}
}
window.addEventListener('hashchange',route);
