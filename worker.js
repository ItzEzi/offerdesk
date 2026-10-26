/* OfferDesk worker 20261026-1631: the same code the app runs, loaded by your Gmail script for Maya 24/7. */
function OD_WORKER(host){
/* ---- Maya 24/7: browser stand-ins so OfferDesk's own code runs inside the Gmail script ---- */
var __timers = [];
var setTimeout = function (fn, ms) { __timers.push({ fn: fn, ms: ms || 0 }); return __timers.length; };
var clearTimeout = function (id) { if (id && __timers[id - 1]) __timers[id - 1].fn = null; };
var setInterval = function () { return 0; }, clearInterval = function () {};
var requestAnimationFrame = function () { return 0; };
var __store = {};
var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }, setItem: function (k, v) { __store[k] = String(v); }, removeItem: function (k) { delete __store[k]; } };
localStorage.setItem('od.device', host.device || 'maya-247');
var location = { hash: '', pathname: '/offerdesk/', search: '', protocol: 'https:', href: 'https://itzezi.github.io/offerdesk/' };
var history = { replaceState: function () {} };
var __noop = function () {};
var document = { addEventListener: __noop, removeEventListener: __noop, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
  visibilityState: 'hidden', activeElement: null, body: { classList: { add: __noop, remove: __noop } }, documentElement: { dataset: {} }, createElement: function () { return { style: {}, getContext: function () { return null; }, click: __noop, remove: __noop }; } };
var window = { addEventListener: __noop, removeEventListener: __noop, location: location, history: history, innerWidth: 1200, devicePixelRatio: 1, matchMedia: function () { return { matches: false }; }, indexedDB: undefined };
var navigator = { userAgent: 'OfferDesk worker', storage: null, sendBeacon: function () { return false; } };
var innerWidth = 1200, addEventListener = __noop;
var AbortController = function () { this.signal = { aborted: false }; this.abort = function () { this.signal.aborted = true; }; };
var fetch = function (url, opts) { return host.fetch(String(url), opts || {}); };
var btoa = host.btoa, atob = host.atob;
var URL = { createObjectURL: function () { return ''; }, revokeObjectURL: __noop };
var Blob = function (parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; };
var FileReader = function () {}, Image = function () {};
var crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; return a; } };
var speechSynthesis = { cancel: __noop, speak: __noop, getVoices: function () { return []; } };
var qrcode = function () { return { addData: __noop, make: __noop, createSvgTag: function () { return ''; } }; };

'use strict';
const APP_V='20261026-1631';
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
  neg:{name:'Maya',title:'Acquisitions Manager',tone:'friendly',disclose:true,optOutLine:false,senderName:''},
  conn:{phone:'manual',autoCheck:true,autoImport:true,gmailQuery:''},
  auto:{enabled:false,approveAll:true,openingChannel:'email',maxOpenings:5,maxOpeningsDay:10,newDealsOn:false,wsAuto:false,followUps:true},
  rental:{taxInsMonthly:300,mgmtPct:8,maintPct:5,vacancyPct:5,refiLtv:75,refiRate:7.5,hmPoints:2,hmRate:11,refiCostPct:2},
  notify:{email:'',sms:false,onReply:true,onNeeds:true,ccMe:false},
  research:{auto:true,maxPrice:175000,dailyMax:3},
  ai:{bigModel:'claude-opus-5-5'},
  brief:{on:true,hour:8,tz:''},
  rehab:{costs:{},notes:''},
  voice:{model:'eleven_flash_v2_5',voices:{},handsFree:true,silenceSec:'7'},
  dnc:[],
  lender:{purchasePct:90,rehabPct:100,points:2,rate:11,termMonths:12,maxLtv:70,dscrRate:7.5,price:'auto'},
  markets:{strategy:'',lens:'',ptype:'sfr',minPrice:60000,maxPrice:300000,minSold:6,states:'',notes:'',targets:[],memo:null},
  followDays:[2,5,10,20],
  wholesalers:[],
  ui:{listMode:'list'}
};
const TONES={friendly:'warm, direct and respectful of the agent’s time',firm:'polite but firm and businesslike, few words',casual:'casual and friendly, short sentences'};
const ACTION_LABEL={opening:'Opening offer',counter:'Counter',hold:'Hold firm',accept:'Accept their number',creative:'Seller-finance pitch',ask_owner:'Needs your call',walk:'Step back',withdraw:'Withdraw offer',stop:'They opted out',followup:'Follow-up',custom:'Your instruction',checkin:'Check-in',stall:'Buy time',call:'Ask for a call'};
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
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop:'<rect x="7" y="7" width="10" height="10" rx="2"/>',
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
  pdf:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
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
  map:'<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  cloud:'<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.8 8a4.75 4.75 0 0 1-.3 10.5z"/>',
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
const dateOf=iso=>new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(iso))?iso+'T12:00:00':iso);
const fmtDate=iso=>{if(!iso)return '';const d=dateOf(iso);return isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined})};
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
  loaded:false,view:'dashboard',dealId:null,busy:{},drafts:{},modal:null,syncing:false,autoRunning:false,cloudSyncing:false,
  lf:{q:'',source:'all',stage:'all',status:'all',sentiment:'all',type:'all',beds:'any',price:'any',state:'all',special:'all',autopilot:'all'},
  leads:{q:'',tag:null,fav:false,type:'all'},
  campaigns:{},research:{},spend:{},cp:{id:null,filter:'all',sort:'offerPct',show:80},mk:{metro:null,zip:null,show:25},page:1,mayaTab:'chat',settingsTab:'connections',bellOpen:false,practiceId:null,logKind:'in',compsPaste:false,photoUrls:{},practicePersona:'tough'
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
const KEYS=['settings','deals','practice','mail','activity','conn','campaigns','research','spend'];
/* Maya 24/7 (the Gmail script runs this same code) stops starting new work near its time limit */
const WORKER={on:false,deadline:0};
const approveMode=()=>state.settings.auto.approveAll!==false;const timeUp=()=>WORKER.on&&Date.now()>WORKER.deadline;
const saveTimers={};
function writeKey(key){
  const val=state[key];
  if(IDB.db)return IDB.put('kv',clone(val),key).catch(()=>{lsSet('od2.'+key,JSON.stringify(val))});
  lsSet('od2.'+key,JSON.stringify(val));return Promise.resolve();
}
function persist(key){clearTimeout(saveTimers[key]);saveTimers[key]=setTimeout(()=>{delete saveTimers[key];writeKey(key);cloudTrack(key)},200)}
function flushAll(){for(const k of Object.keys(saveTimers)){clearTimeout(saveTimers[k]);delete saveTimers[k];writeKey(k);cloudTrack(k)}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAll()});
window.addEventListener('pagehide',flushAll);
async function readKey(key){
  if(IDB.db){try{const v=await IDB.get('kv',key);if(v!==undefined)return v}catch(e){}}
  try{return JSON.parse(lsGet('od2.'+key)||'null')}catch(e){return null}
}
function saveDeal(d,quiet){d.updated=nowISO();state.deals[d.id]=d;persist('deals');if(!quiet)render()}
function removeDeal(id){const d=state.deals[id];if(d&&IDB.db)[...(d.photoIds||[]),...(d.docs||[]).map(x=>x.id)].forEach(pid=>IDB.del('photos',pid).catch(()=>{}));delete state.deals[id];persist('deals');if(state.dealId===id)go('listings');render()}
function saveSettings(){persist('settings');render()}
function savePractice(p){p.updated=nowISO();state.practice[p.id]=p;persist('practice');render()}
function saveMail(){const em=Object.values(state.mail.emails).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,300);state.mail.emails=Object.fromEntries(em.map(e=>[e.id,e]));state.mail.texts=(state.mail.texts||[]).slice(-150);persist('mail')}
function saveConn(){persist('conn')}
function cur(){return state.deals[state.dealId]}

/* ================= toast ================= */
let toastT;function toast(msg,ms=2800){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}

/* ================= routing ================= */
const VIEWS=['dashboard','listings','markets','campaigns','leads','deal','report','practice','stats','settings'];
function go(view,id){const h='#'+view+(id?'/'+id:'');if(location.hash===h)route();else location.hash=h}
function route(){
  const h=(location.hash||'#dashboard').slice(1);const [v,id,sub]=h.split('/');
  state.view=VIEWS.includes(v)?v:'dashboard';state.dealId=state.view==='deal'||state.view==='report'?id:null;
  if(state.view==='settings'&&id)state.settingsTab=id;
  if(state.view==='deal'&&state.loaded&&!state.deals[state.dealId]){location.hash='#listings';return}
  {const dd=state.view==='deal'&&state.deals[state.dealId];if(dd&&dd.source==='wholesaler'&&!dd.reviewed){dd.reviewed=true;saveDeal(dd,true)}}
  state.bellOpen=false;window.scrollTo(0,0);render();
  if((state.view==='deal'||state.view==='report')&&state.dealId){ensurePhotoUrls(state.dealId);ensureDocUrls(state.dealId);ensureMarket(state.deals[state.dealId])}
  if(state.view==='markets')loadDiscover();
  const anchor=state.view==='deal'||state.view==='settings'?sub:id;
  if(anchor){setTimeout(()=>{const el=document.getElementById(anchor);if(el)el.scrollIntoView({block:'start'})},80)}
}
window.addEventListener('hashchange',route);

/* ================= deal helpers ================= */
/* buy box: emailed deals asking more than his cap are kept but tucked away (hidden by default, not researched, not counted as new) */
const boxCap=()=>+((state.settings.research||{}).maxPrice)||0;
const checking=d=>!!(d&&d.checking&&Date.now()-d.checking<30*60*1000);
const overBox=d=>{const c=boxCap();if(!c||!d||d.source!=='wholesaler'||d.example||d.starred||d.favorite||!['new','sent'].includes(d.stage||'new'))return false;const p=curList(d);return p!=null&&p>c};
function curList(d){const h=d.priceHistory||[];return h.length?h[h.length-1].price:(d.listPrice??null)}
function origList(d){const h=d.priceHistory||[];return h.length?h[0].price:(d.listPrice??null)}
const priceDropped=d=>(d.priceHistory||[]).length>1&&curList(d)<origList(d);
const outs=d=>(d.thread||[]).filter(t=>t.dir==='out');
const ins=d=>(d.thread||[]).filter(t=>t.dir==='in');
const lastAt=a=>a.length?a[a.length-1].at:null;
function lastOurPrice(d){const o=(d.offers||[]).filter(x=>x.by==='us');return o.length?o[o.length-1].price:null}
/* the lowest price the other side has said they'd take: asking, a stated "we'd accept", or their last counter */
function rehabTheirs(d){return d.rehabSource==='wholesaler'||(!d.rehabSource&&d.rehab!=null&&(d.wsClaims||{}).rehab===d.rehab)}
function arvTheirs(d){return d.arvSource==='wholesaler'||((!d.arvSource||d.arvSource==='you')&&d.arv!=null&&d.source==='wholesaler'&&(d.wsClaims||{}).arv===d.arv)}
function theirFloor(d){const v=[curList(d),parseNum((d.wsClaims||{}).accept),lastTheirPrice(d)].filter(x=>x!=null&&x>0);return v.length?Math.min(...v):null}
function lastTheirPrice(d){const o=(d.offers||[]).filter(x=>x.by==='them');return o.length?o[o.length-1].price:null}
function firstOfferAt(d){const o=(d.offers||[]).find(x=>x.by==='us');return o?o.at:(outs(d)[0]||{}).at||null}
/* a draft needs you only until it goes out on some channel */
const draftOpen=d=>!!(d&&d.draft&&!((d.draft.sent||{}).email||(d.draft.sent||{}).sms));
const ourCount=d=>(d.offers||[]).filter(x=>x.by==='us').length;
function replyWaiting(d){const li=lastAt(ins(d)),lo=lastAt(outs(d));return !!li&&(!lo||li>lo)&&!(d.handledAt&&String(d.handledAt)>=String(li))&&!['dead','closed'].includes(d.stage)&&!d.optedOut&&!(d.source==='wholesaler'&&!lo&&!d.convo)}
function followDue(d){
  if(!d.follow||d.optedOut||['dead','closed','contract'].includes(d.stage)||replyWaiting(d)||draftOpen(d))return null;
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
  if(draftOpen(d)&&!ourCount(d))return ['Draft ready','purple'];
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
  c.mao=c.locked?d.lockedMao:c.maoCalc;c.maoNumbers=c.mao;
  /* if they said they'd take less than our numbers allow, that's the most we pay, and the opening goes below it */
  const fl=theirFloor(d);c.floor=fl;if(fl!=null&&c.mao>fl){c.mao=fl;c.capByThem=true}
  const gap=(s.anchorGap||0)/100;let open=floor500(c.mao*(1-gap));
  if(fl!=null)open=Math.min(open,floor500(fl*(1-gap)));
  if(L)open=Math.min(open,floor500(L*.97));
  c.opening=Math.max(0,open);
  c.target=d.targetPrice>0?d.targetPrice:round500(c.opening+(c.mao-c.opening)*((s.targetPct??40)/100));
  c.flipAt=P=>{if(P==null)return null;const cost=P*(1+b)+R+H;const profit=c.net-cost;return {cost,profit,roi:cost>0?profit/cost:null}};
  c.wsAt=P=>P==null?null:{fee:c.buyerMax-P};
  c.resultAt=P=>{if(P==null)return null;if(strat==='wholesale'){const f=c.buyerMax-P;return {val:f,label:money(f)+' fee',ok:f>=0}}const r=c.flipAt(P);return {val:r.profit,label:money(r.profit)+' · '+pct(r.roi,1)+' ROI',ok:r.profit>=0}};
  c.dead=c.mao<=0;
  const cr=state.settings.creative;c.sfCap=floor500(c.maoNumbers*(1+(cr.maxOverPct||0)/100));
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
/* the ceiling guard reads OFFERS: only these messages put a price of ours on the table */
const OFFER_ACTS=new Set(['opening','counter','hold','accept','creative','followup']);
const isOfferDraft=dr=>!!dr&&OFFER_ACTS.has(dr.action||dr.kind);
function dollarAmounts(t){const out=[];const re=/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kKmM])?(?![\w])/g;let m;while((m=re.exec(String(t||'')))){let v=parseFloat(m[1].replace(/,/g,''));if(m[2])v*=/k/i.test(m[2])?1e3:1e6;out.push(Math.round(v))}return out}
function ceilingCheck(text,d,c,cap,dr){
  if(!c.ready||!text)return [];
  if(dr&&!isOfferDraft(dr))return [];   /* withdrawing, stepping back, checking in: talking about numbers is fine */
  const ws=d.wsClaims||{},R=d.research||{},An=d.analysis||{};const ra=R.arv||{},aa=An.arv||{};
  /* numbers already on the table: theirs, the house's, the comps', the repairs', and what we offered before */
  const allowed=[curList(d),origList(d),d.listPrice,c.A,d.rehab,ws.arv,ws.rehab,ws.asking,ws.accept,ws.rent,d.rent,d.rentEst,ra.value,ra.low,ra.high,aa.value,aa.low,aa.high,
    ...(d.priceHistory||[]).map(p=>p.price),...(d.offers||[]).map(o=>o.price),...(d.comps||[]).map(x=>x.price),...(d.rehabLines||[]).map(x=>x.cost),
    ...ins(d).flatMap(t=>dollarAmounts(t.text)),...outs(d).flatMap(t=>dollarAmounts(t.text))].filter(v=>v!=null&&isFinite(v));
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
    reply:ds.filter(d=>replyWaiting(d)&&!draftOpen(d)&&!(d.autopilot&&state.settings.auto.enabled)).length,
    draft:ds.filter(d=>draftOpen(d)&&!['dead','closed'].includes(d.stage)).length,
    follow:ds.filter(d=>{const f=followDue(d);return f&&f.overdue}).length,
    ws:ds.filter(d=>d.source==='wholesaler'&&d.stage==='new'&&!d.reviewed&&!overBox(d)&&!checking(d)).length,
    newMail:Object.values(state.mail.emails).filter(e=>e.status==='new').length,
    live:ds.filter(d=>['sent','negotiating'].includes(d.stage)).length,
    contract:ds.filter(d=>d.stage==='contract').length,
    auto:ds.filter(d=>d.autopilot&&!['dead','closed'].includes(d.stage)).length
  };
}

/* ================= secrets (kept in this browser only) ================= */
const SECRET_KEY='od.secrets';
function secrets(){try{return JSON.parse(lsGet(SECRET_KEY)||'{}')||{}}catch(e){return {}}}
function setSecret(k,v){const s=secrets();if(v==null||v==='')delete s[k];else s[k]=v;lsSet(SECRET_KEY,JSON.stringify(s));if(k!=='bridgeKey')cloudTrack('secrets')}
function bridgeKey(){let k=secrets().bridgeKey;if(!k){const a=new Uint8Array(18);try{crypto.getRandomValues(a)}catch(e){for(let i=0;i<a.length;i++)a[i]=Math.random()*256|0}k=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');setSecret('bridgeKey',k)}return k}
const aiOn=()=>!!secrets().apiKey;

/* ================= Claude API (Maya's brain + eyes) ================= */
function blobToB64(blob){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(blob)})}
async function imageBlock(item){
  if(item&&item.url)return {type:'image',source:{type:'url',url:item.url}};
  const blob=item&&item.blob?item.blob:item;
  return {type:'image',source:{type:'base64',media_type:blob.type&&/^image\/(jpeg|png|webp|gif)$/.test(blob.type)?blob.type:'image/jpeg',data:await blobToB64(blob)}};
}
async function apiText(input,opts){
  opts=opts||{};const sec=secrets();if(!sec.apiKey)throw {code:'no_ai'};
  const msgs=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:m.content}));
  const merged=[];for(const m of msgs){const l=merged[merged.length-1];if(l&&l.role===m.role)l.content+='\n\n'+m.content;else merged.push(Object.assign({},m))}
  if(merged[0]&&merged[0].role!=='user')merged.unshift({role:'user',content:'(start)'});
  if((opts.images&&opts.images.length)||(opts.docs&&opts.docs.length)){const last=merged[merged.length-1];const blocks=[];
    for(const f of opts.docs||[])blocks.push({type:'document',source:{type:'base64',media_type:'application/pdf',data:await blobToB64(f)}});
    for(const f of opts.images||[])blocks.push(await imageBlock(f));last.content=[...blocks,{type:'text',text:last.content}]}
  const model=opts.model||(opts.modelTier==='quick'?'claude-haiku-5-5':(sec.model||'claude-sonnet-5-5'));
  let res;
  try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':sec.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:opts.maxTokens||3000,messages:merged})})}
  catch(e){if(e&&e.name==='AbortError')throw {code:'cancelled'};throw {code:'network'}}
  if(!res.ok)throw await apiFail(res);
  const j=await res.json();addSpend(model,j.usage,0);const text=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  if(!text)throw {code:'empty_completion'};
  return {text,truncated:j.stop_reason==='max_tokens'};
}
async function apiFail(res){let j={};try{j=await res.json()}catch(e){}const m=(j.error&&j.error.message)||res.statusText||'';const st=res.status;
  return {code:res.status===401||res.status===403?'bad_key':res.status===429?'rate_limited':/credit|billing|balance/i.test(m)?'no_credit':res.status===404?'bad_model':/image/i.test(m)?'image_rejected':/pdf|document/i.test(m)?'pdf_rejected':res.status>=500?'upstream_error':'api_error',message:m,status:st}}
/* a call where Claude may search the web and open pages (server tools); continues paused turns */
const WEB_TOOLS=(n)=>[{type:'web_search_20250305',name:'web_search',max_uses:n||6},{type:'web_fetch_20250910',name:'web_fetch',max_uses:n||6,max_content_tokens:12000}];
async function apiTools(prompt,opts){
  opts=opts||{};const sec=secrets();if(!sec.apiKey)throw {code:'no_ai'};
  const model=opts.model||sec.model||'claude-sonnet-5-5';let messages=[{role:'user',content:prompt}];
  const sources=new Map(),fetchUrl={},failed=[];let text='',searches=0;
  for(let round=0;round<5;round++){
    let res;try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':sec.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:opts.maxTokens||8000,messages,tools:opts.tools||WEB_TOOLS()})})}
    catch(e){if(e&&e.name==='AbortError')throw {code:'cancelled'};throw {code:'network'}}
    if(!res.ok)throw await apiFail(res);
    const j=await res.json();const blocks=j.content||[];addSpend(model,j.usage,+((j.usage||{}).server_tool_use||{}).web_search_requests||0);
    for(const b of blocks){
      if(b.type==='server_tool_use'){if(b.name==='web_fetch'&&b.input&&b.input.url)fetchUrl[b.id]=b.input.url;if(b.name==='web_search')searches++}
      if(b.type==='web_search_tool_result'&&Array.isArray(b.content))for(const r of b.content)if(r&&r.url&&!sources.has(r.url))sources.set(r.url,r.title||r.url);
      if(b.type==='web_fetch_tool_result'){const c=b.content||{};if(c.type==='web_fetch_result'&&c.url)sources.set(c.url,(c.content&&c.content.title)||c.url);else if(fetchUrl[b.tool_use_id])failed.push({url:fetchUrl[b.tool_use_id],why:c.error_code||'error'})}
    }
    text=blocks.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
    if(j.stop_reason==='pause_turn'){messages=[...messages,{role:'assistant',content:blocks}];continue}
    break;
  }
  if(!text)throw {code:'empty_completion'};
  return {text,sources:[...sources].map(([url,title])=>({url,title})),failed,searches};
}
function parseLoose(t){
  try{return JSON.parse(t)}catch(e){}
  const f=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(f){try{return JSON.parse(f[1])}catch(e){}}
  const a=Math.min(...['{','['].map(c=>{const i=t.indexOf(c);return i<0?Infinity:i}));const b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
  if(isFinite(a)&&a<b){try{return JSON.parse(t.slice(a,b+1))}catch(e){}}
  throw {code:'invalid_json',text:t};
}
const AI={text:(input,opts)=>apiText(input,opts),json:async(input,opts)=>parseLoose((await apiText(input,opts)).text)};
function aiErr(e){
  const c=e&&e.code;const n=negName();
  if(c==='cancelled')return null;
  if(c==='no_ai')return `${n} needs your Anthropic API key. Add it in Connect → ${n}’s brain.`;
  if(c==='bad_key')return `Anthropic rejected your API key${e&&e.message?` (“${String(e.message).slice(0,140)}”)`:''}. In Connect → ${n}’s brain, paste a fresh key from console.anthropic.com → API keys, then press Test.`;
  if(c==='no_credit')return 'Your Anthropic account has no credits. The API is pay-as-you-go: add credits at console.anthropic.com → Billing, then try again.';
  if(c==='bad_model')return 'That model isn’t available on your API key. Pick another in Connect.';
  if(c==='network')return 'Couldn’t reach Anthropic. If your internet works, the usual cause is an Anthropic account with no credits or a key that was turned off: check console.anthropic.com → Billing and API keys.';
  if(c==='rate_limited')return 'Anthropic says slow down for a minute. Try again shortly.';
  if(c==='invalid_json')return `${n}’s answer came back in a shape OfferDesk couldn’t read, so nothing was added from that email.`;
  if(c==='image_rejected')return 'One of the photos couldn’t be read. Remove it and try again.';
  if(c==='empty_completion')return 'Claude sent back an empty answer. Try again.';
  if(c==='upstream_error')return `Anthropic’s servers had a problem${e.status?' (HTTP '+e.status+')':''}. Try again in a minute.`;
  return (e&&e.message)?`Claude error${e.status?' (HTTP '+e.status+')':''}: ${e.message}`:`Couldn’t reach Claude${c?' ('+c+')':''}. Try again.`;
}
async function runAI(key,label,fn,quiet){
  const errs=state.aiErrs||(state.aiErrs={});
  if(state.busy[key]){errs[key]='Maya was already reading that one.';return null}
  if(!aiOn()){errs[key]=aiErr({code:'no_ai'});if(!quiet)toast(errs[key],5200);return null}
  const ctl=new AbortController();
  state.busy[key]={label,ctl};render();
  delete errs[key];
  try{return await fn(AI,ctl.signal)}
  catch(e){if(e&&e.code==='no_credit')state.noCredit=Date.now();const m=aiErr(e);errs[key]=m||'Stopped.';if(m&&!quiet)toast(m,5200);if(quiet&&m)logActivity(null,'warn',m);return null}
  finally{delete state.busy[key];render()}
}
function busyHTML(key,stop=true){const b=state.busy[key];if(!b)return '';return `<div class="busy"><div class="spin"></div><span>${esc(b.label)}</span>${stop&&b.ctl?`<button class="btn ghost sm" data-act="stop-ai" data-key="${esc(key)}">Stop</button>`:''}</div>`}

/* ================= prompts ================= */
function dealFacts(d,c){
  const L=curList(d);const a=d.analysis;
  return [
    `Address: ${[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ')||'unknown'}`,
    `Source: ${d.source==='wholesaler'?'off-market deal from a wholesaler':'listed on the MLS (on-market)'}; status ${mlsOf(d)[0]}`,
    `Current ${d.source==='wholesaler'?'asking':'list'} price: ${money(L)}${priceDropped(d)?` (originally ${money(origList(d))})`:''}`,
    `Type / beds / baths / sqft / lot / year: ${PROP_TYPES[d.propertyType]||'house'} / ${d.beds??'?'} / ${d.baths??'?'} / ${d.sqft??'?'} / ${d.lotSqft??'?'} sqft lot / ${d.year??'?'}`,
    dom(d)!=null?`Days on market: ${dom(d)}${zipDom(d)?` (ZIP median ${zipDom(d)})`:''}`:'',
    `Our ARV: ${money(c.A)}. Our repair estimate: ${money(d.rehab)}.`,
    a&&a.summary?`Photo inspection summary: ${a.summary} Level: ${a.level||'?'}.`:'',
    d.description?`Listing description: ${d.description.slice(0,1500)}`:'',
    d.instructions?`Investor's standing instructions for this deal (follow them): ${d.instructions.slice(0,800)}`:'',
    d.notes?`Investor's private notes (context only, never quote): ${d.notes.slice(0,1200)}`:'',
    (()=>{const h=historyInsights(d);const ev=histEvents(d);return ev.length?`Property history (oldest first): ${ev.slice(-14).map(e=>`${e.date} ${(HEV[e.event]||HEV.other)[0].toLowerCase()}${e.price?' '+money(e.price):''}`).join('; ')}.${h.length?' What it means: '+h.map(x=>x.text).join(' '):''}`:''})(),
    marketFacts(d),
    (()=>{const ms=marketSignal(d);return ms?`Negotiation leverage: ${ms.text}. ${ms.level==='rejection'?'The market has been refusing this house at these prices; buyers are not paying the ask.':'The listing is stale; the seller is likely getting flexible.'} You may point to the time on market and the price history, politely.`:''})()
  ].filter(Boolean).join('\n');
}
function compsText(d){const cs=(d.comps||[]).filter(x=>x.price);if(!cs.length)return 'No comps entered.';return cs.slice(0,6).map(x=>`- ${x.addr||'comp'}: sold ${money(x.price)}${x.sqft?`, ${x.sqft} sqft ($${Math.round(x.price/x.sqft)}/sqft)`:''}${x.dist!=null?`, ${x.dist} mi away`:''}${x.soldDate?`, sold ${x.soldDate}`:''}${x.reno===false?', not renovated':', renovated'}`).join('\n')}
function threadText(d){return (d.thread||[]).slice(-14).map(t=>`[${fmtDate(t.at)} · ${t.dir==='out'?'US':t.dir==='in'?'THEM':'NOTE'} via ${t.channel}${t.price?` · number: ${money(t.price)}`:''}] ${(t.subject?t.subject+' — ':'')+(t.text||'').slice(0,1200)}`).join('\n')||'(no messages yet)'}
function signRules(){
  const p=state.settings.profile,n=state.settings.neg;
  const title=(n.title||'Acquisitions Manager').trim();const sig=[n.name,title].filter(Boolean);
  return `You are ${n.name}, ${title}${p.company?' at '+p.company:''}. Write in the first person as ${n.name}; say "we" or "our team" for the buyer. Never write "on behalf of" and never introduce yourself as an assistant.
End every email with this signature, one item per line: ${sig.map(x=>'"'+x+'"').join(', ')}. End texts with "– ${n.name}".
Tone: ${TONES[n.tone]||TONES.friendly}. Plain US English. No emojis, no hype.
Never invent facts about the property, the comps, the seller or the buyer.${n.disclose?` Do not claim to be human. If anyone asks whether they are dealing with a person or an AI, say honestly that you are an AI acquisitions agent working for ${p.name||'the buyer'}${p.company?' at '+p.company:''}, who approves your limits.`:''}${n.optOutLine?' End every email with one short line: "Prefer not to get offers from us? Reply ‘remove’ and we won’t contact you again."':''}`;
}
const counterpart=d=>d.source==='wholesaler'?'the wholesaler':'the listing agent';
function firstName(d){const n=((d.agent&&d.agent.name)||'').replace(/\(example\)/i,'').trim();return n.split(/\s+/)[0]||'there'}
function promptOpening(d,c){
  const s=state.settings.buy;
  return `You write offers for a real estate investor. Draft the FIRST cash offer on this property to ${counterpart(d)} (${(d.agent&&d.agent.name)||'name unknown'}).

${dealFacts(d,c)}
Our comps:
${compsText(d)}

The offer:
- Price: exactly ${money(c.opening)}. This is the only offer number you may state. Never mention or hint at a maximum, ceiling or budget.
- Terms: all cash, as-is, close in ${s.closeDays} days, ${s.optionDays}-day option period, ${money(s.emd)} earnest money.
- Walk the math in one or two sentences so the number reads as reasoned, not a lowball: ARV around ${moneyK(c.A)}, repairs around ${moneyK(d.rehab)}, plus holding, closing and resale costs.${(d.comps||[]).length?' You may cite one or two of the comps.':''}
- End with one easy question that invites a reply (for example what matters most to the seller on timing).
- Open the email with "Hi ${firstName(d)},".
- Email: 80 to 150 words with a short subject line that includes the street address. SMS: under 320 characters, same price and terms in brief.
${signRules()}

Reply with only JSON: {"email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptReply(d,c,next,instruction){
  const s=state.settings,cr=s.creative,last=lastOurPrice(d),theirs=lastTheirPrice(d);
  const sf=d.sfSaved?`Saved seller-finance terms to use if you go creative: price ${money(d.sfSaved.price)}, ${d.sfSaved.downPct}% down, ${money(d.sfSaved.payment)}/month, ${d.sfSaved.rate}% interest.`:'';
  return `You negotiate real estate purchases for an investor. Read the conversation and the newest message from the other side, choose the next move, and draft the reply.

${dealFacts(d,c)}
Our comps:
${compsText(d)}

Numbers from the investor's model (do not change them):
- Our ceiling (maximum allowable cash offer): ${money(c.mao)}. SECRET: never state it, hint at it, or offer above it in cash.
- Our target landing price: ${money(c.target)}.
- ${last!=null?`Our last offer: ${money(last)}. Offers made so far: ${ourCount(d)} of a planned ${s.buy.maxRounds}.`:`We have NOT made an offer yet. If you make one now, open at ${money(c.opening)} (lower is fine), never above our ceiling.`}${c.capByThem?` They already said they would take ${money(c.floor)}, so treat that as their real asking and expect them to go lower.`:''}
- Their last stated number: ${theirs!=null?money(theirs):'none yet'}.
- Suggested next cash ${last!=null?'counter on our concession ladder':'offer'}: ${money(next)}. ${last!=null?`You may hold at ${money(last)} or counter anywhere from ${money(last)} up to ${money(c.mao)}.`:''} Smaller moves are better. Do not move twice in a row without them moving.
- ${cr.enabled?`Creative option: seller financing at a price up to ${money(c.sfCap)}, down payment up to ${cr.maxDownPct}%, interest up to ${cr.maxRate}%, ${cr.termYears}-year amortization. ${sf} Use it only when they will not come down on price but might accept terms.`:'Creative financing is not allowed on this deal.'}
${instruction?`\nTHE INVESTOR'S INSTRUCTION FOR THIS MESSAGE (follow it within the limits above): ${instruction}\n`:''}
Conversation so far (oldest first):
${threadText(d)}

Choose one action:
- "counter": a new cash price; state it in the message.
- "hold": keep our current price, walk the math again, ask what the seller needs.
- "accept": their number is at or below our ceiling; say we can work with it and move toward a contract.
- "creative": propose seller-finance terms within the limits above.
- "ask_owner": they are close but above our ceiling, or something unusual came up; draft a short holding reply and tell the investor what decision is needed.
- "walk": far apart after several rounds; step back politely and leave the door open.
- "stop": they asked not to be contacted; draft only a one-line acknowledgment.
When you counter or hold, walk the math in one or two sentences so the number reads as reasoned: our ARV, the repairs, holding, closing and resale costs, and the margin an investor needs, arriving at our number. Never reveal the ceiling.
If they claim a higher value, defend our ARV with the comps above. Also judge their sentiment.
Be nitpicky with their newest message: read it line by line, including the end. Answer every question they asked. Put any new fact (price change, the lowest price they'd take, deadline, other buyers, access, condition, tenant, photos sent or missing) in "summary" or "sellerSignals". "theirCounter" is the lowest price they stated or said they would accept in this message (e.g. "we could probably do 45" = 45000), else null. If they ask for something you can't promise (inspection waivers, closing dates, earnest money above ${money(s.buy.emd)}), choose "ask_owner".

${signRules()}

Reply with only JSON:
{"action":"counter|hold|accept|creative|ask_owner|walk|stop","price":number or null,"theirCounter":number or null,"sentiment":"warm|neutral|cold|hostile","sellerSignals":["short phrases"],"summary":"one sentence: what they said","why":"one or two sentences to the investor explaining this move","terms":"seller-finance terms if action is creative, else empty","email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptFollow(d,c,price,priceDrop){
  const since=daysSince(lastAt(outs(d)));const step=(d.follow&&d.follow.step)||0;
  return `You write follow-ups for a real estate investor. ${counterpart(d)} has not answered our last message for ${since??'a few'} days. Draft follow-up number ${step+1}.

${dealFacts(d,c)}

Conversation so far (oldest first):
${threadText(d)}

${priceDrop?`The price just dropped to ${money(curList(d))}. Use the drop as the reason to reconnect. Our offer is now ${money(price)}.`:`Our offer stands at ${money(price)}. Do not raise it.`}
Take a different angle from earlier messages; do not repeat them. Keep the email under 90 words and the SMS under 220 characters. Never mention a maximum or budget.
${signRules()}

Reply with only JSON: {"email":{"subject":"...","body":"..."},"sms":"..."}`;
}
function promptChat(d,c,msg){
  const hist=(d.mayaChat||[]).slice(-10).map(m=>(m.role==='user'?'INVESTOR: ':'MAYA: ')+m.content).join('\n');
  return `You are ${negName()}, the acquisitions assistant for ${state.settings.profile.name||'an investor'}. The investor is talking to you about one deal. Answer briefly and concretely, like a sharp analyst. If the investor asks you to message the agent or gives a negotiation instruction, also write that message as a draft.

${dealFacts(d,c)}
Our comps:
${compsText(d)}
Numbers: ceiling ${money(c.mao)} (the investor knows it; never put it in a draft), opening ${money(c.opening)}, target ${money(c.target)}, our last offer ${money(lastOurPrice(d))}, their last ${money(lastTheirPrice(d))}.

Conversation with ${counterpart(d)} (oldest first):
${threadText(d)}

Earlier chat with the investor:
${hist||'(none)'}

INVESTOR: ${msg}

Rules for any draft: label it honestly. "withdraw" = we pull our offer; "walk" = we step back politely; "custom" = anything else that doesn't put a new price of ours on the table. For those, set price to null; you may still mention numbers (their asking, the ARV, the repairs, our old offer). Only "counter", "hold", "accept", "creative" and "followup" state our price. Never offer above ${money(c.mao)} cash; seller finance only up to ${money(c.sfCap)} with at most ${state.settings.creative.maxDownPct}% down.
${signRules()}

Reply with only JSON: {"answer":"what you say to the investor, 1 to 5 sentences","draft":null or {"action":"counter|hold|accept|creative|followup|withdraw|walk|custom","price":number or null,"email":{"subject":"...","body":"..."},"sms":"..."}}`;
}
const REHAB_BOOK=[
  ['paint_int','Interior paint','per sqft of living area',2.75],['paint_ext','Exterior paint','per sqft of living area',2.25],
  ['lvp','LVP flooring, installed','per sqft',4.5],['carpet','Carpet, installed','per sqft',3],['tile','Tile floor, installed','per sqft',9],['drywall','Drywall and texture repair','per sqft',2],
  ['kitchen_light','Kitchen refresh (paint cabinets, counters, hardware)','each',9000],['kitchen_mid','Kitchen remodel, mid-grade','each',22000],['kitchen_full','Kitchen full gut','each',35000],
  ['bath_light','Bathroom refresh','each',3500],['bath_mid','Bathroom remodel','each',9000],['bath_full','Bathroom full gut','each',14000],
  ['appliances','Appliance package','each',3500],['lighting','Lighting and fixtures','per house',2000],['int_door','Interior door','each',250],['ext_door','Exterior door','each',1200],['windows','Window','each',650],
  ['roof','Roof replacement (shingle)','per sqft of living area',6.5],['hvac','HVAC system','each',9500],['water_heater','Water heater','each',1800],['panel','Electrical panel','each',3000],
  ['rewire','Rewire','per sqft',7],['repipe','Plumbing repipe','per sqft',6],['foundation','Foundation repair allowance','each',9000],['siding','Siding repair','per house',4000],
  ['fence','Fence','per linear ft',35],['landscaping','Landscaping and cleanup','per house',2500],['permits','Permits, dumpster, misc','per house',1500]];
function rehabBook(){const o=(state.settings.rehab&&state.settings.rehab.costs)||{};return REHAB_BOOK.map(([key,label,unit,cost])=>({key,label,unit,cost:o[key]!=null&&isFinite(o[key])?o[key]:cost,def:cost}))}
function promptDeep(d,nPhotos,marks,nDocs){
  const R=state.settings.rehab||{};const book=rehabBook();const where=[d.city,d.state].filter(Boolean).join(', ')||'the property’s area';
  return `You are ${negName()}, an acquisitions analyst for a fix-and-flip, BRRRR and wholesale investor. ${nPhotos?`${nPhotos} listing photo(s) are attached, numbered 1 to ${nPhotos} in the order given. Study every one closely before you conclude anything.`:nDocs?`The wholesaler's PDF deal sheet is attached. If it covers several properties, use only the pages about ${streetOf(d.address)||'this property'}. Study every photo and page about it before you conclude anything; number the photos in your photoLog in the order they appear in the PDF. Their repair estimate in the PDF is a claim to check against what the photos show.`:'No photos were provided; rely on the text and say what needs a site visit.'}

Work in this order:
1. Photo log. For each photo: which room or area it shows, and what you can actually see: materials and their era (for example "oak cabinets, laminate counters, about 1995"), condition, damage, and anything that drives cost. Do not describe what is not visible.
${marks?`   Inspect each photo like a home inspector and mark every clearly visible problem the investor would pay to fix (mold, water stain, rot, a door to fix or replace, cracked tile, sagging or stained ceiling, exposed wiring, broken window, peeling paint, damaged floor, missing fixture). For each, add a mark: a box around the problem given as fractions of that photo's width and height (x and y = top-left corner, w and h = size, all 0 to 1). Label it in 2 to 4 plain words, like "mold", "door to fix", "water stain". At most 6 marks per photo, only things you can actually see, no marks on things that are fine; a photo with no visible problems gets "marks":[].
`:''}2. Condition by area, rated only from what you saw or what the text says. Anything not shown is "unknown" and goes in notSeen.
3. Rehab quantities from the investor's cost book below. Do not invent prices. For each item needed, give the cost-book key and a quantity: square feet for per-sqft items (base them on the ${d.sqft||'unknown'} sqft living area unless the photos show otherwise), a count for "each" items, and 1 for per-house items. For areas you could not see, include a sensible allowance and mark seen false.
Cost book (key: item, price, unit):
${book.map(b=>`- ${b.key}: ${b.label}, ${money(b.cost)} ${b.unit}`).join('\n')}
4. Anything that is not in the cost book goes in customLines with your best cost for ${where}.
${R.notes?`The investor's own notes on repair pricing (follow them): ${String(R.notes).slice(0,800)}\n`:''}
Property: ${[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ')||'unknown'}; ${PROP_TYPES[d.propertyType]||'house'}; ${d.beds??'?'} bed / ${d.baths??'?'} bath; ${d.sqft??'?'} sqft; lot ${d.lotSqft??'?'} sqft; built ${d.year??'?'}.
Asking/list price: ${money(curList(d))}.
Listing description: ${(d.description||'none').slice(0,2500)}
Investor notes: ${(d.notes||'none').slice(0,1000)}
Comps the investor has:
${compsText(d)}
${(()=>{const m=marketFacts(d);return m?m+'\n':''})()}
Rules: whole dollars only. If there are few or no comps, your ARV is a rough estimate: give a low/high range and mark confidence low. Renovated homes in a ZIP usually sell above the ZIP's median $/sqft.

Reply with only JSON:
{"photoLog":[{"photo":1,"area":"kitchen|bathroom|bedroom|living|exterior|roof|yard|garage|mechanical|other","sees":"what is visible","condition":"good|fair|poor","flags":["cost signals"]${marks?',"marks":[{"label":"2-4 words, e.g. mold, water stain, door to fix, cracked tile","x":0.0,"y":0.0,"w":0.0,"h":0.0}]':''}}],
"condition":{"structure":{"rating":"good|fair|poor|unknown","notes":""},"roof":{"rating":"","notes":""},"exterior":{"rating":"","notes":""},"kitchen":{"rating":"","notes":""},"bathrooms":{"rating":"","notes":""},"living_bedrooms":{"rating":"","notes":""},"flooring":{"rating":"","notes":""},"mechanicals":{"rating":"","notes":""}},
"notSeen":["areas with no photo, e.g. roof, HVAC, second bathroom"],
"level":"light refresh|moderate rehab|full gut","summary":"two sentences","suggestions":["specific renovation suggestions"],
"rehabItems":[{"key":"cost book key","qty":number,"why":"short reason","seen":true}],"customLines":[{"item":"","detail":"","cost":number}],"contingencyPct":number,
"arv":{"value":number|null,"low":number|null,"high":number|null,"confidence":"low|medium|high","why":"one sentence"},
"rent":{"value":number|null,"why":"one sentence"},
"audience":"home buyer|investor|mixed","audienceConfidence":"low|medium|high","motivation":"distressed property|motivated seller|stale listing|estate or probate|tired landlord|retail listing",
"redFlags":["..."],"verify":["things to check on site"],"rooms":{"bedrooms":number|null,"bathrooms":number|null},"photoNotes":"what the photos showed and did not show"}`;
}
const P_WHOLESALE=(t,nDocs)=>`${nDocs?`The PDF${nDocs>1?'s':''} attached above came with this email (a deal sheet or property package). Read every page: address, price, what they'd take, ARV, repair estimate and its breakdown, beds, baths, sqft, year, lot, occupancy, rent, comps, access and terms, and what the photos inside it show about condition. Use the PDF and the email together; if they disagree, use the newer or more specific number and say so in notes.

`:''}Extract the property deal or deals from this wholesaler or seller email or text. Read every line, including the bottom of the email and any quoted text: a price cut or "we'd take less" is often in the last sentence. Use null for anything not stated; never guess a number. Numbers are plain numbers in dollars or square feet.
Sellers and small wholesalers often write casually: no subject, no $ signs, prices in thousands ("sold for 207", "my asking was 100", "if I get 95 I'm happy" mean $207,000, $100,000 and $95,000 when they are house prices), lowercase street names, everything in one paragraph. It is still a deal if it names a property and a price.
Ranges: if they give repairs as a range ("$5,000-$15,000"), put the HIGH end in "rehab"; if they give ARV as a range, put the LOW end in "arv". Say the full range in notes.

"asking" is the CURRENT price: if they say the price was reduced, use the new one and put the old one in "previousAsking". Keep their ARV and repair numbers exactly as they say them; they are claims to be checked, not facts. If their ARV or repairs look off for the house (for example ARV more than 2.5 times the asking, or "light rehab" on a house that needs a roof), say so in "redFlags".

Put up to 3 URLs that show each property (its own listing or deal page first, then Google Drive or Dropbox photo folders, deal pages, video tours, Zillow or Redfin links) in "links", and up to 2 direct image URLs in "photoLinks". Long links are shortened to tokens like [link3]: copy the token exactly as a link. Alert emails often put the link on the property's picture, written as [picture link: ...] next to that house's details: that link belongs to that house, so list it first in its "links". Skip unsubscribe, social media, calendar and "upgrade" links. "acceptPrice" is the lowest price they say they would take, if they say one (for example "with a cash offer we can probably accept 47,000" means 47000); otherwise null. An alert email can list many properties: include every one, keep each description under 25 words, at most 2 red flags and no notes, so the whole answer stays short. If the message is about one property, be thorough: a description up to 80 words, every red flag, and in "notes" every other detail that matters for an offer (tenant and lease, rent, utilities, earnest money, closing date, assignment fee, title, liens, probate, HOA, roof/HVAC/foundation/water/fire condition, showing times, who to contact).

Reply with only JSON: {"deals":[{"address":"street address","city":"","state":"","zip":"","asking":number|null,"previousAsking":number|null,"arv":number|null,"rehab":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"rent":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","occupancy":"vacant|occupied|unknown","acceptPrice":number|null,"terms":"cash only, seller finance, subject-to, etc. or null","deadline":"text or null","access":"text or null","photoLinks":["direct image URLs"],"theirComps":[{"addr":"street of a sale they cite as a comp","price":number|null,"sqft":number|null,"when":"when it sold, as they said it, or null","dist":"distance as they said it, or null"}],"links":["URLs that show the property"],"description":"one or two sentences about condition and the pitch","redFlags":["claims that look inflated, missing info, pressure tactics"],"notes":["other details that matter for an offer"]}],"wholesaler":{"name":"","company":"","email":"","phone":""}}

Message:
"""${t.slice(0,16000)}"""`;
const P_LISTING=t=>`Extract this property listing (copied from Zillow, Redfin, Realtor.com or the MLS). Use null for anything not stated. Numbers are plain numbers.

Reply with only JSON: {"address":"street","city":"","state":"","zip":"","listPrice":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other","mlsStatus":"for_sale|pending|sold|off_market","mlsId":"","daysOnMarket":number|null,"listedDate":"YYYY-MM-DD or null","rent":number|null,"description":"the listing remarks, trimmed","agent":{"name":"","email":"","phone":"","brokerage":""},"priceHistory":[{"date":"YYYY-MM-DD","price":number}],"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null}],"photoUrls":["direct image URLs if present"]}
priceHistory is only the current listing's prices. history is the full property history if shown (Zillow "Price history", Redfin "Property history"), including past sales and rentals from earlier years.

Listing:
"""${t.slice(0,14000)}"""`;
const P_COMPS=(t,d)=>`These are sold comparable sales copied for the subject property at ${streetOf(d.address)||'unknown'} (${d.sqft||'?'} sqft). Extract each sold comp. Use null for unknowns. dist is miles from the subject if given.

Include homes for sale or pending too if listed, with their status. reno is false when the text says the home sold as-is, needs work, or is a fixer.

Reply with only JSON: {"comps":[{"addr":"","price":number,"sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"soldDate":"YYYY-MM-DD or null","status":"sold|for_sale|pending","reno":true|false|null}]}

Text:
"""${t.slice(0,12000)}"""`;
const P_RENTCOMPS=(t,d)=>`These are rental listings or recent leases near the subject property at ${streetOf(d.address)||'unknown'} (${d.beds??'?'} bed, ${d.sqft||'?'} sqft). Extract each rental. Use null for unknowns. dist is miles from the subject if given.

Reply with only JSON: {"rentals":[{"addr":"","rent":number,"beds":number|null,"baths":number|null,"sqft":number|null,"dist":number|null}]}

Text:
"""${t.slice(0,12000)}"""`;
const P_HISTORY=(t,d)=>`This is the price, sale and listing history of the property at ${streetOf(d.address)||'unknown'} (copied from Zillow, Redfin, Realtor.com or the MLS). Extract every event in it. Use null for unknown prices.

Reply with only JSON: {"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null,"note":"short note if useful"}]}

Text:
\"\"\"${t.slice(0,12000)}\"\"\"`;
const QUICK=[
  {id:'drop',label:'Drop this deal',c:'red'},
  {id:'harder',label:'Push harder',c:'orange',ins:'Push harder. Be firmer than the ladder suggests: hold our number or move by a small amount only, and lean on the repair costs and days on market.'},
  {id:'pause',label:'Pause this one',c:'orange'},
  {id:'creative',label:'Go creative',c:'purple',ins:'Go creative: pitch seller financing within the limits, using the saved terms if any. Explain how the seller nets more overall.'},
  {id:'firm',label:'Stand firm + wait',c:'orange',ins:'Stand firm at our current number. Restate it briefly with the math and let them come back to us. No new price.'},
  {id:'callme',label:'Ask them to call me',c:'green',ins:'Ask the agent to call the investor directly at his phone number to talk it through. Keep our current number.'},
  {id:'schedule',label:'Schedule a call',c:'green',ins:'Propose a short phone call and offer two or three specific time slots in the next two business days (Central Time).'},
  {id:'time',label:'Buy me some time',c:'blue',ins:'Buy some time politely: say we are reviewing the numbers with our contractor and will come back by a specific day within 48 hours. No new price.'},
  {id:'resend',label:'Resend the offer',c:'blue',ins:'Resend our current offer cleanly and briefly, with terms, in case it got buried.'},
  {id:'checkin',label:'Send a check-in',c:'blue',ins:'Send a short, friendly check-in asking where things stand. No new price.'},
  {id:'feedback',label:'Ask for seller feedback',c:'blue',ins:'Ask what the seller thought of our offer and what would need to be true for them to accept: price, timing, or terms.'}
];

/* ---- is the key actually working? (a real 1-word call to each model OfferDesk uses) ---- */
async function testKey(){
  if(!aiOn())return;const key='ai-test';if(state.busy[key])return;state.busy[key]={label:'Asking Anthropic if your key works…'};render();
  const sec=secrets();const models=[...new Set([sec.model||'claude-sonnet-5-5','claude-haiku-5-5'])];const res={};let ok=true,msg='';
  for(const m of models){try{await apiText('Reply with the single word OK.',{model:m,maxTokens:5});res[m]='ok'}catch(e){ok=false;res[m]=e&&e.code||'error';if(!msg)msg=aiErr(e)||'';if(e&&['bad_key','no_credit','network'].includes(e.code))break}}
  state.conn.aiCheck={ok,at:nowISO(),msg,models:res,key:String(sec.apiKey||'').slice(-6)};delete state.busy[key];saveConn();render();
  toast(ok?`Your key works. ${negName()} is ready.`:msg,ok?3200:7000);
}
function keyState(){const c=state.conn.aiCheck;if(!aiOn())return 'none';if(!c||c.key!==String(secrets().apiKey||'').slice(-6))return 'untested';return c.ok?'ok':'bad'}
function keyPill(){const k=keyState();return k==='ok'?'<span class="pill green">Working</span>':k==='bad'?'<span class="pill red">Not working</span>':k==='untested'?'<span class="pill orange">Saved, not tested</span>':'<span class="pill orange">Not set up</span>'}
function keyNote(){const k=keyState();const c=state.conn.aiCheck||{};
  if(k==='ok')return `<div class="note green small">Tested ${ago(c.at)}: Anthropic accepted the key${Object.keys(c.models||{}).length>1?' for every model OfferDesk uses':''}.</div>`;
  if(k==='bad')return `<div class="note red small"><b>Tested ${ago(c.at)}: not working.</b> ${esc(c.msg||'')}${c.models?`<br><span class="xs">${Object.entries(c.models).map(([m,v])=>`${esc(m.replace('claude-','').replace(/-/g,' '))}: ${v==='ok'?'works':esc(v)}`).join(' · ')}</span>`:''}</div>`;
  if(k==='untested')return `<div class="note amber small">The key is saved but hasn’t been checked with Anthropic yet. Press <b>Test key</b>.</div>`;
  return '';
}

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
    try{const {blob,thumb,w,h}=await downscale(f,2560,.86,180);const id=uid('ph');
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
/* ---------- PDF deal sheets ---------- */
const docObjURL={};
const docCount=d=>(d.docs||[]).length;
function latin1(u8){let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return s}
function pdfPages(u8){const m=latin1(u8).match(/\/Type\s*\/Page(?![a-z])/g);return m?m.length:0}
/* photos inside a PDF: most are stored as plain JPEG streams, which can be lifted out as they are */
function pdfJpegs(u8,max){
  const out=[];const n=u8.length;const end=[0x65,0x6e,0x64,0x73,0x74,0x72,0x65,0x61,0x6d];
  for(let i=0;i<n-12&&out.length<(max||40);i++){
    if(u8[i]!==0x73||u8[i+1]!==0x74||u8[i+2]!==0x72||u8[i+3]!==0x65||u8[i+4]!==0x61||u8[i+5]!==0x6d)continue;
    if(i>=3&&u8[i-3]===0x65&&u8[i-2]===0x6e&&u8[i-1]===0x64)continue;
    let j=i+6;if(u8[j]===0x0d)j++;if(u8[j]===0x0a)j++;
    if(u8[j]!==0xff||u8[j+1]!==0xd8||u8[j+2]!==0xff)continue;
    let k=-1;for(let p=j+3;p<n-9;p++){if(u8[p]===0x65&&u8[p+1]===0x6e&&u8[p+2]===0x64){let ok=true;for(let q=3;q<9;q++)if(u8[p+q]!==end[q]){ok=false;break}if(ok){k=p;break}}}
    if(k<0)break;let e=k;while(e>j&&(u8[e-1]===0x0a||u8[e-1]===0x0d||u8[e-1]===0x20))e--;
    if(e-j>=20000)out.push(new Blob([u8.subarray(j,e)],{type:'image/jpeg'}));i=k+9;
  }
  return out;
}
/* every photo inside a PDF, however it's stored: plain JPEG, JPEG wrapped in ASCII85, or compressed raw pixels (Flate, with or without PNG row filters).
   Masks and logos are skipped. */
function a85(src){const out=new Uint8Array(Math.ceil(src.length*4/5)+8);let o=0,t=0,n=0;
  for(let i=0;i<src.length;i++){const c=src[i];if(c===0x7e)break;if(c<=0x20)continue;if(c===0x7a&&n===0){out[o++]=0;out[o++]=0;out[o++]=0;out[o++]=0;continue}if(c<0x21||c>0x75)continue;
    t=t*85+(c-33);if(++n===5){out[o++]=(t>>>24)&255;out[o++]=(t>>>16)&255;out[o++]=(t>>>8)&255;out[o++]=t&255;t=0;n=0}}
  if(n>0){for(let k=n;k<5;k++)t=t*85+84;const b=[(t>>>24)&255,(t>>>16)&255,(t>>>8)&255,t&255];for(let k=0;k<n-1;k++)out[o++]=b[k]}
  return out.subarray(0,o)}
async function inflate(u8){const s=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));return new Uint8Array(await new Response(s).arrayBuffer())}
function unPng(data,cols,colors,w,h){const bpp=colors,row=cols*colors,out=new Uint8Array(row*h);let p=0;
  for(let y=0;y<h;y++){const f=data[p++];const o=y*row,u=o-row;
    for(let x=0;x<row;x++){const raw=data[p++]||0;const a=x>=bpp?out[o+x-bpp]:0,b=y?out[u+x]:0,c=(y&&x>=bpp)?out[u+x-bpp]:0;
      let v=raw;if(f===1)v=raw+a;else if(f===2)v=raw+b;else if(f===3)v=raw+((a+b)>>1);else if(f===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v=raw+(pa<=pb&&pa<=pc?a:pb<=pc?b:c)}
      out[o+x]=v&255}}
  return out}
async function pixelsToJpeg(px,w,h){const n=px.length/(w*h);if(![1,3,4].includes(n))return null;const rgba=new Uint8ClampedArray(w*h*4);
  for(let i=0,j=0;i<w*h;i++,j+=n){if(n===1){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=px[j]}else if(n===3){rgba[i*4]=px[j];rgba[i*4+1]=px[j+1];rgba[i*4+2]=px[j+2]}else{const k=px[j+3];rgba[i*4]=255-Math.min(255,px[j]+k);rgba[i*4+1]=255-Math.min(255,px[j+1]+k);rgba[i*4+2]=255-Math.min(255,px[j+2]+k)}rgba[i*4+3]=255}
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').putImageData(new ImageData(rgba,w,h),0,0);
  return await new Promise(r=>cv.toBlob(r,'image/jpeg',.9))}
async function pdfImages(u8,max){
  const s=latin1(u8);const masks=new Set();for(const m of s.matchAll(/\/(?:SMask|Mask)\s+(\d+)\s+\d+\s+R/g))masks.add(m[1]);
  const out=[];let pos=0;
  while(out.length<(max||16)){
    const idx=s.indexOf('stream',pos);if(idx<0)break;pos=idx+6;if(s.slice(idx-3,idx)==='end')continue;
    const op=s.lastIndexOf('obj',idx);if(op<0)continue;const hd=s.slice(Math.max(0,op-24),op+3).match(/(\d+)\s+\d+\s+obj$/);const num=hd?hd[1]:'';
    const dict=s.slice(op+3,idx);if(!/\/Subtype\s*\/Image/.test(dict)||/\/ImageMask\s+true/.test(dict)||masks.has(num))continue;
    let start=idx+6;if(s[start]==='\r')start++;if(s[start]==='\n')start++;
    const lm=dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);let end=lm&&!lm[2]?start+(+lm[1]):s.indexOf('endstream',start);if(end<start)continue;pos=end;
    const w=+((dict.match(/\/Width\s+(\d+)/)||[])[1]||0),h=+((dict.match(/\/Height\s+(\d+)/)||[])[1]||0);if(Math.min(w,h)<300)continue;
    const fm=dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);const filters=fm?(fm[1].match(/\/[A-Za-z0-9]+/g)||[]).map(x=>x.slice(1)):[];
    try{let data=u8.subarray(start,end),blob=null,ok=true;
      for(const f of filters){if(f==='ASCII85Decode'||f==='A85')data=a85(data);else if(f==='FlateDecode'||f==='Fl')data=await inflate(data);else if(f==='DCTDecode'||f==='DCT'){blob=new Blob([data],{type:'image/jpeg'});break}else{ok=false;break}}
      if(!ok)continue;
      if(!blob){if(+((dict.match(/\/BitsPerComponent\s+(\d+)/)||[])[1]||8)!==8)continue;const pr=+((dict.match(/\/Predictor\s+(\d+)/)||[])[1]||1);
        if(pr>=10){const colors=+((dict.match(/\/Colors\s+(\d+)/)||[])[1]||0)||Math.round((data.length/h-1)/w)||3;data=unPng(data,+((dict.match(/\/Columns\s+(\d+)/)||[])[1]||w),colors,w,h)}
        blob=await pixelsToJpeg(data.subarray(0,Math.floor(data.length/(w*h))*w*h),w,h)}
      if(blob&&blob.size>=8000)out.push(blob)}catch(e){}
  }
  if(!out.length)for(const b of pdfJpegs(u8,max||16))out.push(b);
  return out}
async function pdfPhotos(u8){const keep=[];for(const b of await pdfImages(u8,24)){if(keep.length>=16)break;try{const bm=await createImageBitmap(b);if(Math.min(bm.width,bm.height)>=300)keep.push(b);bm.close&&bm.close()}catch(e){}}return keep}
async function fetchPdfs(mid,acct){
  const files=[],skipped=[];let start=0,guard=0;
  while(start!=null&&guard++<4){const r=await bridge('attachments',{id:mid,kind:'pdf',max:1,start},acct);
    for(const x of r.files||[]){let blob;
      if(x.parts){const parts=[];for(let i=0;i<Math.min(+x.parts||0,4);i++){const p=await bridge('pdf_part',{id:mid,idx:x.idx,part:i},acct);if(!p||!p.data)break;parts.push(b64ToBlob(p.data,'application/octet-stream'))}
        blob=new Blob(parts,{type:'application/pdf'});if(blob.size!==+x.size){skipped.push({name:String(x.name||''),why:'too_big',mb:Math.round((+x.size||0)/1048576)});continue}}
      else blob=b64ToBlob(x.data,'application/pdf');const u8=new Uint8Array(await blob.arrayBuffer());if(u8[0]!==0x25||u8[1]!==0x50||u8[2]!==0x44||u8[3]!==0x46)continue;files.push({name:String(x.name||'deal sheet.pdf'),blob,u8,pages:pdfPages(u8)})}
    for(const x of r.skipped||[])skipped.push({name:String(x.name||''),why:String(x.why||''),mb:x.mb||null});start=r.next==null?null:r.next}
  return {files,skipped};
}
const aiPdf=f=>f.pages<=60&&f.blob.size<=20*1024*1024;
/* keep the PDF on the deal, and lift its photos into the deal's photos */
async function attachPdfs(dealId,got,mid,withPhotos){
  const d=state.deals[dealId];if(!d||!IDB.db)return 0;d.docs=d.docs||[];let photos=0;
  for(const f of got.files||[]){
    const have=d.docs.find(x=>x.msg===mid&&x.name===f.name&&x.size===f.blob.size);
    if(have){if(withPhotos&&!photoCount(d)){const keep=await pdfPhotos(f.u8);if(keep.length)photos+=await addPhotoBlobs(dealId,keep,'pdf')}continue}
    const id=uid('doc');try{await IDB.put('photos',{id,dealId,blob:f.blob,kind:'pdf',name:f.name,source:'email',at:nowISO()})}catch(e){continue}
    d.docs.push({id,name:f.name,pages:f.pages,size:f.blob.size,msg:mid||null,at:nowISO()});
    if(withPhotos){const keep=await pdfPhotos(f.u8);if(keep.length)photos+=await addPhotoBlobs(dealId,keep,'pdf')}
  }
  const dd=state.deals[dealId];if(!dd)return photos;
  for(const s of got.skipped||[])if(!(dd.docSkipped||[]).some(x=>x.name===s.name))dd.docSkipped=(dd.docSkipped||[]).concat(Object.assign({msg:mid},s)).slice(-10);
  saveDeal(dd,true);if((got.files||[]).length)logActivity(dealId,'info',`${negName()} read the PDF${got.files.length>1?'s':''} on ${streetOf(dd.address)}${photos?` and pulled out ${photos} photo${photos>1?'s':''}`:''}.`);
  return photos;
}
async function docItemsForAI(d){const out=[];for(const x of (d.docs||[]).slice(-2)){if((x.pages||0)>60)continue;try{const r=await IDB.get('photos',x.id);if(r&&r.blob&&r.blob.size<=20*1024*1024)out.push(r.blob)}catch(e){}}return out}
async function ensureDocUrls(dealId){const d=state.deals[dealId];if(!d||!IDB.db)return;let changed=false;
  for(const x of d.docs||[]){if(docObjURL[x.id])continue;try{const r=await IDB.get('photos',x.id);if(r&&r.blob){docObjURL[x.id]=URL.createObjectURL(r.blob);changed=true}}catch(e){}}if(changed)render()}
async function photoItemsForAI(d){
  const items=[];
  const refs=[];
  for(const id of (d.photoIds||[]).slice(0,12)){try{const r=await IDB.get('photos',id);if(r&&r.blob){let b=r.blob;if((r.w||0)>1568||(r.h||0)>1568){try{b=(await downscale(r.blob,1568,.85,8)).blob}catch(e){}}items.push(b);refs.push(id)}}catch(e){}}
  for(const u of (d.photoUrls||[]).slice(0,Math.max(0,12-items.length))){items.push({url:u});refs.push('url:'+u)}
  items.refs=refs;return items;
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
/* removed inboxes: {id: time removed}; an inbox added again later (newer 'at') wins */
function goneMap(g){if(Array.isArray(g))return {};return g&&typeof g==='object'?Object.assign({},g):{}}
function acctList(){const s=secrets();let a=Array.isArray(s.accounts)?s.accounts:null;if(!a){a=[];if(s.bridgeUrl)a.push({id:'g1',url:s.bridgeUrl})}return a}
function saveAccts(a){const s=secrets();const now=Date.now();const keep=new Set(a.map(x=>x.id));const gone=goneMap(s.goneAccts);for(const x of acctList())if(!keep.has(x.id))gone[x.id]=now;for(const x of a){if(!x.at)x.at=now;delete gone[x.id]}s.goneAccts=gone;s.accounts=a;delete s.bridgeUrl;lsSet(SECRET_KEY,JSON.stringify(s));cloudTrack('secrets')}
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
  if(m==='unknown_action')return 'Your bridge is an older version. Copy the new bridge code from Connect and redeploy it as a new version.';
  if(m&&/permission/i.test(m)&&/drive/i.test(m))return 'Your bridge needs Google Drive access for cloud save. In Apps Script, redeploy it as a new version and click Allow when Google asks.';
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
  parts.push('((ARV OR "after repair value" OR "after-repair value") (assignment OR "off market" OR "off-market" OR wholesale OR "cash buyers" OR asking OR rehab OR repairs OR "contract price" OR "buyers list"))');
  parts.push('("assignment fee" OR "investor special" OR "off market deal" OR "off-market deal" OR "cash buyers only")');
  /* deal-alert emails from buyer lists (HouseCashin, InvestorLift, etc.) and plain listing blasts: beds + baths + sqft, or alert wording */
  parts.push('("property alert" OR "deal alert" OR "new properties" OR "buying criteria" OR "new deal" OR "new listing" OR "price reduced")');
  parts.push('((bed OR beds OR bedroom OR bedrooms OR bd) (bath OR baths OR ba) (sqft OR "sq ft" OR "square feet"))');
  parts.push('from:(realestatebees.com OR housecashin.com OR investorlift.com OR davebuyshousesindiana.com)');
  /* plain one-off pitches with no subject or deal words ("the address is 435 N Oxford… comps are… my asking was 100, open to offers") */
  parts.push('(("off market" OR "off-market" OR comps OR "sq ft" OR sqft) (asking OR "open to offers" OR "best offer" OR "make an offer"))');
  parts.push('(("off market" OR "off-market" OR "investment opportunity" OR "investor opportunity" OR "investment property" OR wholesale OR "buy box" OR "purchase price" OR "starting price") (property OR properties OR home OR homes OR house OR houses))');
  return 'newer_than:30d -from:me -in:sent -from:txt.voice.google.com ('+parts.join(' OR ')+')';
}
const byDate=(a,b)=>String(a.date||a.at).localeCompare(String(b.date||b.at));
const byUpdated=(a,b)=>String(b.updated).localeCompare(String(a.updated));
/* an email that names a street address and talks about a house, a price or a deal */
const ADDR_RE=/\b\d{2,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9.'-]+\s+){0,3}(?:St|Street|Ave|Avenue|Av|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Pl|Place|Cir|Circle|Ter|Terrace|Pkwy|Parkway|Hwy|Highway|Trl|Trail)\b\.?/;
function looksLikeDeal(m){const t=(m.subject||'')+'\n'+(m.body||'');if(!ADDR_RE.test(t))return false;
  return /\b(property|properties|house|home|deal|off[- ]market|asking|price|offer|arv|rehab|investor|investment|wholesale|assignment|buy box|bed|bath|sq\.? ?ft)\b|\$\s?\d/i.test(t)}
async function wideSearch(acct){
  const k='wide_'+acct.id;const last=+(state.mail[k]||0);if(Date.now()-last<15*60e3)return [];state.mail[k]=Date.now();
  try{const r=await bridge('search',{query:'newer_than:7d in:inbox -from:me -in:sent -category:promotions -category:social -category:forums -from:txt.voice.google.com',max:25},acct.id);return (r.messages||[]).filter(looksLikeDeal)}catch(e){return []}
}
async function syncWholesalerEmails(acct){
  const r=await bridge('search',{query:buildQuery(),max:30},acct.id);let n=0;
  {const more=await wideSearch(acct);if(more.length){const have=new Set((r.messages||[]).map(m=>m.id));r.messages=[...(r.messages||[]),...more.filter(m=>!have.has(m.id))]}}
  if((r.messages||[]).some(m=>m.docs!=null)&&bridgeV(acct.id)<7&&state.conn.accounts&&state.conn.accounts[acct.id]){state.conn.accounts[acct.id].version=7;saveConn()}
  const seen=new Set(Object.values(state.deals).flatMap(d=>d.seenMsgIds||[]));
  const agentEmails=new Set(Object.values(state.deals).filter(d=>d.source!=='wholesaler').map(d=>((d.agent&&d.agent.email)||'').trim().toLowerCase()).filter(Boolean));
  const replied=[];
  for(const m of r.messages||[]){const known=state.mail.emails[m.id];if(known&&m.docs!=null&&known.docs==null)known.docs=+m.docs||0;
    if(known||seen.has(m.id))continue;if(agentEmails.has(parseFrom(m.from).email))continue;if(connectedAccts().some(a=>(acctInfo(a.id).email||'').toLowerCase()===parseFrom(m.from).email))continue;
    const tgt=replyTarget(m);if(tgt){takeReply(tgt,m,acct);replied.push([tgt.id,m]);continue}
    state.mail.emails[m.id]=Object.assign({},m,{status:'new',acct:acct.id});n++}
  saveMail();
  for(const [id,m] of replied)if((m.atts||0)>0){try{await pullDealAttachments(id,true,[m.id])}catch(e){}}
  /* new emails, plus ones Maya couldn't read before (no credits, a hiccup): retried up to 3 times, an hour apart */
  if(state.settings.conn.autoImport&&aiOn()){const now=Date.now();
    const due=Object.values(state.mail.emails).filter(x=>x.status==='new'&&(x.tries||0)<3&&(!x.lastTry||now-new Date(x.lastTry).getTime()>3600e3)&&!(WORKER.on&&(x.docs||0)>0)).sort(byDate).reverse().slice(0,8);
    for(const m of due){if(timeUp())break;m.tries=(m.tries||0)+1;m.lastTry=nowISO();await importEmail(m.id,true)}if(due.length)saveMail()}
  if(!WORKER.on)resumePdfs().catch(()=>{});
  return n;
}
function replyTarget(m){
  const em=parseFrom(m.from).email;const live=Object.values(state.deals).filter(d=>!d.example&&!['dead','closed'].includes(d.stage)&&!d.optedOut&&!d.linksOnly&&d.agent&&replyable(d.agent.email));
  const byThread=live.find(d=>d.gmailThreadId&&d.gmailThreadId===m.threadId);if(byThread)return byThread;
  if(!/^\s*re\s*:/i.test(m.subject||''))return null;
  const bySender=live.filter(d=>(d.agent.email||'').trim().toLowerCase()===em&&(outs(d).length||d.convo));
  return bySender.length===1?bySender[0]:null;
}
function takeReply(d,m,acct){
  d.seenMsgIds=(d.seenMsgIds||[]).concat(m.id).slice(-200);
  receive(d,{dir:'in',channel:'email',subject:m.subject||'',text:stripQuoted(m.body),at:m.date,gmailId:m.id,atts:m.atts||0,inbox:acctInfo(acct.id).email});
  d.convo=true;if(!d.gmailThreadId){d.gmailThreadId=m.threadId;d.gmailAccount=acct.id}
  state.mail.emails[m.id]=Object.assign({},m,{status:'reply',acct:acct.id,dealIds:[d.id]});saveDeal(d,true);
}
/* someone answered and Maya isn't on autopilot for that deal: she still drafts the answer for you to review */
async function draftReplies(){
  if(!aiOn())return 0;let k=0;
  for(const d of Object.values(state.deals)){
    if(k>=5||timeUp())break;
    if(d.example||d.optedOut||(d.autopilot&&state.settings.auto.enabled)||!replyWaiting(d))continue;
    const li=ins(d).slice(-1)[0];const tag=li&&(li.gmailId||li.at);if(!li||d.draftedFor===tag)continue;
    if(d.draft&&draftOpen(d)&&String(d.draft.at)>String(li.at))continue;d.draft=null;   /* a draft older than their newest message is out of date */
    d.draftedFor=tag;saveDeal(d,true);
    await aiReply(d.id,null,true);
    const dd=state.deals[d.id];if(dd&&dd.draft){dd.needsYou=dd.needsYou||`review the reply ${negName()} drafted`;saveDeal(dd,true);k++;
      pingOwner(dd,'needs',`${((dd.agent&&dd.agent.name)||'They').replace(/\s*\(example\)/i,'')} replied. ${negName()} drafted an answer for you to review.`,tag)}
  }
  return k;
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
  if(looksOptOut(msg.text,msg.channel)){d.optedOut=true;d.draft=null;if(d.agent){addDnc(d.agent.email);addDnc(digits10(d.agent.phone))}logActivity(d.id,'warn',`${streetOf(d.address)}: they asked not to be contacted. ${negName()} stopped.`)}
  else{logActivity(d.id,'reply',`${(d.agent&&d.agent.name)||'The agent'} replied by ${msg.channel==='sms'?'text':'email'} on ${streetOf(d.address)}.`);
    if(!(d.autopilot&&state.settings.auto.enabled))pingOwner(d,'reply',`${((d.agent&&d.agent.name)||'The agent').replace(/\s*\(example\)/i,'')} replied by ${msg.channel==='sms'?'text':'email'}${msg.price?` with ${money(msg.price)}`:''}: "${String(msg.text||'').replace(/\s+/g,' ').slice(0,180)}"`,msg.gmailId||msg.at)}
  d.needsYou=null;
}
/* wholesalers send each house as its own email: a message in a different thread that isn't a "Re:", or one that already made its own deal, is not a reply to this deal */
function notReplyTo(d,m){
  const other=((state.mail.emails[m.id]||{}).dealIds||[]).some(x=>x!==d.id&&state.deals[x]);if(other)return true;
  return !!(d.gmailThreadId&&m.threadId&&m.threadId!==d.gmailThreadId&&!/^\s*re\s*:/i.test(m.subject||''));
}
async function syncReplies(acct){
  const live=Object.values(state.deals).filter(d=>['sent','negotiating','contract'].includes(d.stage)&&!d.optedOut&&!d.example&&d.agent&&replyable(d.agent.email)&&(outs(d).length||d.convo));
  if(!live.length)return 0;
  const emails=[...new Set(live.map(d=>d.agent.email.trim().toLowerCase()))];let n=0;
  for(let i=0;i<emails.length;i+=15){
    const chunk=emails.slice(i,i+15);
    const r=await bridge('search',{query:'newer_than:30d -from:me from:('+chunk.join(' OR ')+')',max:40},acct.id);
    for(const m of (r.messages||[]).sort(byDate)){
      const em=parseFrom(m.from).email;
      const cands=live.filter(d=>d.agent.email.trim().toLowerCase()===em&&!(d.seenMsgIds||[]).includes(m.id)&&!notReplyTo(d,m));
      const d=chooseDeal(cands,m);if(!d)continue;
      d.seenMsgIds=(d.seenMsgIds||[]).concat(m.id).slice(-200);
      const o0=outs(d)[0];if(o0&&String(m.date)<String(o0.at)){saveDeal(d,true);continue}
      receive(d,{dir:'in',channel:'email',subject:m.subject||'',text:stripQuoted(m.body),at:m.date,gmailId:m.id,atts:m.atts||0,inbox:acctInfo(acct.id).email});
      if((m.atts||0)>0){try{await pullDealAttachments(d.id,true,[m.id])}catch(e){}}
      if((m.docs||0)>0&&!state.mail.emails[m.id]){state.mail.emails[m.id]=Object.assign({},m,{status:'reply',acct:acct.id,dealIds:[d.id]});saveMail()}
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
    try{await draftReplies()}catch(e){}
    state.mail.lastSync=nowISO();saveMail();persist('deals');
    if(manual||r||t){const head=`Checked Gmail: ${e?`${e} new wholesaler email${e===1?'':'s'}`:'no new wholesaler emails since the last check'}, ${r} new repl${r===1?'y':'ies'}${smsOn()||gvOn()?`, ${t} new text${t===1?'':'s'}`:''}.`;
      toast(manual?head+' '+mailRecap():head,manual?9000:3800)}
  }catch(err){if(manual)toast(bridgeErr(err),5200);else logActivity(null,'warn','Gmail check failed: '+bridgeErr(err))}
  finally{state.syncing=false;render()}
}
const ownThread=d=>d.gmailThreadId&&(!d.gmailAccount||d.gmailAccount===(sendAcct()||{}).id)?d.gmailThreadId:null;
const NOREPLY=/(^|[._-])(no-?reply|do-?not-?reply|donotreply|alerts?|notifications?|notify|mailer(-daemon)?|bounces?|newsletters?)([._+-]|@)/i;
const replyable=e=>{e=String(e||'').trim().toLowerCase();return !!e&&!NOREPLY.test(e)};
const canEmail=d=>{const e=((d.agent&&d.agent.email)||'').trim();return gmailOn()&&(e?replyable(e):!!ownThread(d))};
function canText(d){if(smsOn())return !!e164(d.agent&&d.agent.phone);if(gvOn())return !!d.gvThreadId;return false}
function senderName(){const n=state.settings.neg,p=state.settings.profile;return n.senderName||(p.company?`${n.name} | ${p.company}`:`${n.name} | ${n.title||'Acquisitions'}`)}
async function sendEmailNow(id,quiet){
  const d=state.deals[id];const dr=d&&d.draft;if(!dr)return false;const to=((d.agent&&d.agent.email)||'').trim();
  if(!to&&!ownThread(d)){if(!quiet)toast('Add their email in Details first.');return false}
  const key='send:'+id;state.busy[key]={label:'Sending from '+sendEmail()+'…'};render();
  try{const r=await bridge('send',{to,subject:(dr.email&&dr.email.subject)||'',body:(dr.email&&dr.email.body)||'',threadId:ownThread(d),name:senderName(),cc:ccMe()});
    const dd=state.deals[id];if(r.threadId){dd.gmailThreadId=r.threadId;dd.gmailAccount=sendAcct().id}if(r.messageId)dd.seenMsgIds=(dd.seenMsgIds||[]).concat(r.messageId).slice(-200);
    if(r.left!=null){state.conn.mailQuota={left:r.left,day:isoDay()};saveConn()}
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

/* ================= pings to you ================= */
function ccMe(){const N=state.settings.notify||{};return N.ccMe?(N.email||state.settings.profile.email||'').trim()||undefined:undefined}
async function pingOwner(d,kind,text,key){
  const N=state.settings.notify||{};if(kind==='reply'&&!N.onReply)return;if(kind==='needs'&&!N.onNeeds)return;if(d.example)return;
  const k=kind+':'+(key||'');d.pinged=d.pinged||{};if(d.pinged[k])return;d.pinged[k]=nowISO();
  const ks=Object.keys(d.pinged);if(ks.length>40)for(const x of ks.slice(0,ks.length-40))delete d.pinged[x];saveDeal(d,true);
  const to=(N.email||'').trim()||(gmailOn()?sendEmail():'');const link=ONLINE_URL+'#deal/'+d.id;const where=streetOf(d.address);
  if(to&&gmailOn()){try{await bridge('send',{to,subject:`OfferDesk · ${where}: ${kind==='needs'?negName()+' needs your call':'reply waiting'}`,body:`${text}\n\nOpen the deal: ${link}\n\n— ${negName()}, OfferDesk`,name:'OfferDesk · '+negName()})}catch(e){logActivity(d.id,'warn','Couldn’t email you about '+where+': '+bridgeErr(e))}}
  const ph=e164(state.settings.profile.phone);
  if(N.sms&&smsOn()&&ph){try{await bridge('sms_send',{to:ph,body:`OfferDesk · ${where}: ${text}`.slice(0,300)+' '+link})}catch(e){logActivity(d.id,'warn','Couldn’t text you about '+where+': '+bridgeErr(e))}}
}

/* ================= autopilot ================= */
const AUTO_OK=new Set(['opening','counter','hold','creative','followup']);
function draftSafety(d){
  const c=calc(d);const dr=d.draft;const why=[];if(!dr)return ['no draft'];
  const act=dr.action||dr.kind;if(!AUTO_OK.has(act))why.push(ACTION_LABEL[act]||act);
  const cap=act==='creative'?c.sfCap:c.mao;
  const over=[...ceilingCheck(dr.email&&dr.email.body,d,c,cap,dr),...ceilingCheck(dr.sms,d,c,cap,dr)];
  if(over.length)why.push('mentions '+[...new Set(over)].map(money).join(', '));
  if(dr.price!=null&&dr.price>cap)why.push('price above ceiling');
  else if(dr.price!=null&&act!=='creative'&&c.mao&&dr.price>c.mao*state.settings.buy.escalatePct/100)why.push(`above ${state.settings.buy.escalatePct}% of your ceiling`);
  if((dr.flags||[]).some(f=>f.cls==='red'))why.push('flagged');
  if(arvTheirs(d)&&dr.price!=null)why.push('the ARV is still the seller’s own claim (not checked against comps)');
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
const openingsToday=()=>Object.values(state.deals).filter(d=>{const f=firstOfferAt(d);return f&&isoDay(f)===isoDay()}).length;
async function autopilotRun(manual){
  if(!state.settings.auto.enabled){if(manual)toast('Turn autopilot on first.');return}
  if(!aiOn()){if(manual)toast(aiErr({code:'no_ai'}));return}
  if(state.autoRunning)return;state.autoRunning=true;render();
  let openings=state.settings.auto.maxOpenings||5,acted=0;
  try{
    for(const id of Object.keys(state.deals)){
      if(timeUp())break;
      const d=state.deals[id];if(!d||!d.autopilot||d.optedOut||d.example||['dead','closed','contract'].includes(d.stage))continue;
      const c=calc(d);if(!c.ready||c.dead)continue;
      if(!(canEmail(d)||canText(d)))continue;
      if(d.draft&&!draftOpen(d)){d.draft=null;saveDeal(d,true)}
      if(d.draft){if(d.needsYou)continue;
        /* a draft written before their latest message is out of date: drop it, a fresh one comes next run */
        const li=ins(d).slice(-1)[0];if(li&&String(li.at)>String(d.draft.at)){d.draft=null;saveDeal(d,true);continue}}
      else if(replyWaiting(d)&&!ourCount(d)&&d.convo)await aiReply(id,null,true);
      else if(!ourCount(d)&&arvTheirs(d)&&!d.campaign){if(!d.research)maybeResearch(id);continue}
      else if(!ourCount(d)){if(d.campaign||openings<=0||!hasStreet(d)||overBox(d)||openingsToday()>=(+state.settings.auto.maxOpeningsDay||10))continue;await aiOpening(id,true)}
      else if(replyWaiting(d)){
        if(!d.deepOnReply&&!WORKER.on){const pre=state.deals[id];pre.deepOnReply=nowISO();saveDeal(pre,true);if(!pre.analysis||String(pre.analysis.at)<String(firstOfferAt(pre)||''))await aiDeep(id,true);if(!calc(state.deals[id]).ready)continue}
        await aiReply(id,null,true)}
      else{const f=followDue(d);if(f&&f.overdue&&state.settings.auto.followUps)await aiFollow(id,false,true);else continue}
      const dd=state.deals[id];if(!dd||!dd.draft)continue;
      const why=draftSafety(dd);const act=dd.draft.action||dd.draft.kind;const price=dd.draft.price;
      if(why.length){dd.needsYou=why.join(', ');saveDeal(dd,true);logActivity(id,'needs',`${negName()} drafted a ${(ACTION_LABEL[act]||'reply').toLowerCase()} for ${streetOf(dd.address)} and is waiting for you: ${dd.needsYou}.`);
        const th=dd.draft.theirCounter;pingOwner(dd,'needs',`${th!=null?`${((dd.agent&&dd.agent.name)||'The agent').replace(/\s*\(example\)/i,'')} came back at ${money(th)}. `:''}${negName()} drafted a ${(ACTION_LABEL[act]||'reply').toLowerCase()}${price!=null?` at ${money(price)}`:''} and is waiting for you: ${dd.needsYou}.`,dd.draft.at);continue}
      /* approval mode: the draft is ready, he presses Send */
      if(approveMode()){if(!dd.needsYou){dd.needsYou='ready for you to send';saveDeal(dd,true);logActivity(id,'needs',`${negName()} drafted ${act==='opening'?'an opening offer':act==='followup'?'a follow-up':'a '+(ACTION_LABEL[act]||'reply').toLowerCase()} for ${streetOf(dd.address)}${price!=null?' at '+money(price):''}. It’s waiting for you to press Send.`);
          pingOwner(dd,'needs',`${negName()} drafted ${act==='opening'?'an opening offer':act==='followup'?'a follow-up':'a reply'}${price!=null?' at '+money(price):''} on ${streetOf(dd.address)}. Review it and press Send.`,dd.draft.at)}
        if(act==='opening')openings--;continue}
      if(await autoSend(dd)){acted++;if(act==='opening')openings--;logActivity(id,'sent',`${negName()} sent ${act==='opening'?'the opening offer':act==='followup'?'a follow-up':'a '+(ACTION_LABEL[act]||'reply').toLowerCase()} on ${streetOf(dd.address)}${price?' at '+money(price):''}.`)}
    }
    if(manual)toast(approveMode()?`${negName()} drafted what was due. Nothing goes out until you press Send.`:acted?`${negName()} handled ${acted} deal${acted>1?'s':''}.`:`Nothing for ${negName()} to send right now.`);
  }finally{state.autoRunning=false;persist('deals');render()}
}
async function tick(manual){
  try{resumeCapped()}catch(e){}
  if(cloudOn()){await cloudSync();if(!manual&&!(await cloudLease())){resumePdfs().catch(()=>{});return}}
  if(gmailOn()&&(state.settings.conn.autoCheck||manual))await syncAll(manual);
  if(state.settings.auto.enabled)await autopilotRun(false);
  if(cpList().some(c=>c.status==='running'))try{await campaignTick()}catch(e){logActivity(null,'warn','Campaign queue: '+(e&&e.message||e))}
  if(cloudOn()){try{await pushBrief();await briefSync()}catch(e){}}
}

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
  spend:{n:1,key:'spend',get:()=>state.spend,set:m=>{state.spend=m}},
  emails:{n:4,key:'mail',get:()=>state.mail.emails,set:m=>{state.mail.emails=m}},
  texts:{n:1,key:'mail',get:()=>Object.fromEntries((state.mail.texts||[]).filter(t=>t&&t.sid).map(t=>[t.sid,t])),set:m=>{state.mail.texts=Object.values(m).sort((a,b)=>String(a.at).localeCompare(String(b.at)))}}
};
const WHOLES={
  settings:{key:'settings',get:()=>state.settings,set:v=>{state.settings=deepMerge(DEFAULTS,v||{})}},
  conn:{key:'conn',get:()=>state.conn,set:v=>{const L=state.conn||{};const n=v&&typeof v==='object'?Object.assign({},v):{};n.accounts=Object.assign({},L.accounts||{},n.accounts||{});state.conn=n}},  /* keep inboxes this device knows that the cloud copy doesn't */
  research:{key:'research',get:()=>state.research||{},set:v=>{state.research=v&&typeof v==='object'?v:{}}},
  /* keys and Gmail links: a blank in the cloud copy never wipes a key or inbox this device has (that used to log devices out);
     only an inbox removed on purpose (goneAccts) is removed everywhere */
  secrets:{key:'secrets',get:()=>{const s=secrets();return {apiKey:s.apiKey||'',model:s.model||'',elevenKey:s.elevenKey||'',accounts:acctList(),goneAccts:goneMap(s.goneAccts)}},
    set:v=>{v=v||{};const s=secrets();for(const k of ['apiKey','model','elevenKey'])if(v[k])s[k]=v[k];
      const gone=goneMap(s.goneAccts);for(const [id,t] of Object.entries(goneMap(v.goneAccts)))if(!(gone[id]>=t))gone[id]=t;const local=acctList();
      const acc=(Array.isArray(v.accounts)?v.accounts:[]).filter(a=>a&&a.id).map(a=>Object.assign({},a));
      for(const a of acc){const l=local.find(x=>x.id===a.id);if(!a.url&&l&&l.url)a.url=l.url}
      const mine=local.find(a=>a.id===cm().acct);if(mine&&!acc.some(a=>a.id===mine.id))acc.unshift(Object.assign({},mine));
      for(const a of local)if(!acc.some(x=>x.id===a.id))acc.push(Object.assign({},a));
      s.accounts=acc.filter(a=>!(gone[a.id]>(a.at||0)));for(const a of s.accounts)if(gone[a.id]!=null)delete gone[a.id];s.goneAccts=gone;delete s.bridgeUrl;lsSet(SECRET_KEY,JSON.stringify(s))}}
};
const range=(p,n)=>Array.from({length:n},(_,i)=>p+i);
const PARTS=[...range('deals',8),'practice','campaigns','spend',...range('emails',4),'texts','settings','conn','research','secrets','mailmeta','activity'];
const KEY_PARTS={deals:range('deals',8),practice:['practice'],campaigns:['campaigns'],spend:['spend'],mail:[...range('emails',4),'texts','mailmeta'],activity:['activity'],settings:['settings'],conn:['conn'],research:['research'],secrets:['secrets']};
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
  if(key==='deals'||key==='practice'||key==='campaigns'||key==='spend')detectCol(key,now);
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
    CM.h[c]=hashOf(W.get());CM.s[c]=R.t;
    if((c==='secrets'||c==='conn')&&CM.h[c]!==hashOf(R.v)){CM.s[c]=Date.now();return {changed,push:true}}  /* we kept something the cloud copy was missing: send it back */
    return {changed,push:false};
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
  const dropEx=false&&!CM.joined&&Object.keys(got).some(P=>/^deals\d/.test(P)&&got[P]&&got[P].data&&Object.keys(got[P].data.items||{}).length);
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
    const ref=new Map();for(const d of Object.values(state.deals))for(const id of [...(d.photoIds||[]),...(d.docs||[]).map(x=>x.id)])ref.set(id,d.id);
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

/* ================= deal operations ================= */
function newDeal(o){
  const at=nowISO();
  const d=Object.assign({id:uid('d'),created:at,updated:at,stage:'new',source:'mls',thread:[],offers:[],priceHistory:[],comps:[],state:'',autopilot:!!state.settings.auto.newDealsOn,mayaChat:[]},o);
  if(o.listPrice!=null&&!(o.priceHistory||[]).length)d.priceHistory=[{date:o.listedDate||at,price:o.listPrice}];
  return d;
}
function pushMsg(d,m){d.thread=d.thread||[];let at=m.at||nowISO();
  if(m.dir==='out'&&!m.at){const li=lastAt(ins(d));if(li&&String(li)>=String(at))at=new Date(new Date(li).getTime()+1000).toISOString()}
  d.thread.push(Object.assign({id:uid('m')},m,{at}))}
/* A ZIP's first three digits give its state (USPS ranges), so a deal that only has a ZIP still gets the right state
   (and the right ZIP market file). homeState() = the state of his first starred target market. */
const ZIP3=[[5,5,'NY'],[6,9,'PR'],[10,27,'MA'],[28,29,'RI'],[30,38,'NH'],[39,49,'ME'],[50,59,'VT'],[60,69,'CT'],[70,89,'NJ'],[100,149,'NY'],[150,196,'PA'],[197,199,'DE'],[200,205,'DC'],[206,219,'MD'],[220,246,'VA'],[247,268,'WV'],[270,289,'NC'],[290,299,'SC'],[300,319,'GA'],[320,349,'FL'],[350,369,'AL'],[370,385,'TN'],[386,397,'MS'],[398,399,'GA'],[400,427,'KY'],[430,459,'OH'],[460,479,'IN'],[480,499,'MI'],[500,528,'IA'],[530,549,'WI'],[550,567,'MN'],[570,577,'SD'],[580,588,'ND'],[590,599,'MT'],[600,629,'IL'],[630,658,'MO'],[660,679,'KS'],[680,693,'NE'],[700,714,'LA'],[716,729,'AR'],[733,733,'TX'],[730,749,'OK'],[750,799,'TX'],[800,816,'CO'],[820,831,'WY'],[832,838,'ID'],[840,847,'UT'],[850,865,'AZ'],[870,884,'NM'],[885,885,'TX'],[889,898,'NV'],[900,961,'CA'],[967,968,'HI'],[970,979,'OR'],[980,994,'WA'],[995,999,'AK']];
function zipState(z){const s=String(z||'').match(/\b\d{5}\b/);if(!s)return '';const n=+s[0].slice(0,3);const r=ZIP3.find(([a,b])=>n>=a&&n<=b);return r?r[2]:''}
function homeState(){try{for(const t of (mkSet().targets||[])){if(t.type==='zip'){const s=zipState(t.key);if(s)return s}else{const k=String(t.key||'');if(k[0]==='~')return k.slice(1,3);const m=k.match(/,\s*([A-Z]{2})\b/);if(m)return m[1]}}}catch(e){}return ''}
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
/* if a long answer gets cut off, keep every property that came through whole */
function salvageDeals(t){
  const i=String(t||'').indexOf('"deals"');if(i<0)return null;const a=t.indexOf('[',i);if(a<0)return null;
  const out=[];let depth=0,start=-1,inStr=false,esc=false;
  for(let k=a+1;k<t.length;k++){const ch=t[k];
    if(inStr){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch==='"')inStr=false;continue}
    if(ch==='"'){inStr=true;continue}
    if(ch==='{'){if(depth===0)start=k;depth++}
    else if(ch==='}'){depth--;if(depth===0&&start>=0){try{out.push(JSON.parse(t.slice(start,k+1)))}catch(e){}start=-1}}
    else if(ch===']'&&depth===0)break;}
  return out.length?{deals:out,wholesaler:{}}:null;
}
function shrinkLinks(t){const map={};let n=0;
  const text=String(t||'').replace(/https?:\/\/[^\s<>"'()\[\]]+/g,u=>{if(u.length<=70||/\.(jpe?g|png|webp)(\?|$)/i.test(u))return u;const k='[link'+(++n)+']';map[k]=u;return k});
  return {text,map,back:v=>{const s=String(v||'').trim();const m=s.match(/^\[?link(\d+)\]?$/i);return m&&map['[link'+m[1]+']']?map['[link'+m[1]+']']:s}};}
const dealKey=d=>(String(streetOf(d.address)||'').toLowerCase().replace(/[^a-z0-9]/g,'')+'|'+String(d.zip||'').slice(0,5));
async function extractDeals(text,meta,busyKey,quiet){
  meta=meta||{};const sl=shrinkLinks(text);
  const res=await runAI(busyKey,`${negName()} is reading that message…`,async(ai,signal)=>{const docs=meta.docs||[];let r;try{r=await apiText(P_WHOLESALE(sl.text,docs.length),{signal,modelTier:'quick',maxTokens:8000,docs})}catch(e){if(!docs.length||!e||!(e.status===400||e.code==='pdf_rejected'))throw e;meta.pdfFailed=true;r=await apiText(P_WHOLESALE(sl.text,0),{signal,modelTier:'quick',maxTokens:8000})}try{return parseLoose(r.text)}catch(e){const s=salvageDeals(r.text);if(s)return s;throw e}},quiet);
  if(!res)return null;
  const list=Array.isArray(res.deals)?res.deals:res.address?[res]:[];
  const w=Object.assign({},res.wholesaler||{});
  if(meta.fromEmail&&!w.email)w.email=meta.fromEmail;if(meta.fromName&&!w.name)w.name=meta.fromName;if(meta.phone&&!w.phone)w.phone=meta.phone;
  if(!list.length)return {deals:[],w};
  ensureWholesaler(w);
  const made=[],relinked=[],touched=[];let updated=0;const byKey={};const claimed=new Set();
  const fromMail=meta.msgId?Object.values(state.deals).filter(o=>o.source==='wholesaler'&&!o.example&&((o.seenMsgIds||[]).includes(meta.msgId)||(meta.prior||[]).includes(o.id))):[];for(const o of Object.values(state.deals))if(o.source==='wholesaler'&&!o.example&&hasStreet(o))byKey[dealKey(o)]=o;
  for(const x of list){
    x.links=(Array.isArray(x.links)?x.links:[]).map(sl.back).filter(u=>/^https?:/i.test(u));x.photoLinks=(Array.isArray(x.photoLinks)?x.photoLinks:[]).map(sl.back).filter(u=>/^https?:/i.test(u));
    const asking=parseNum(x.asking);
    /* reading an email again (with its PDF, or after an update): a house already pulled from this same email is that deal, never a copy */
    const xs=hasStreet({address:String(x.address||'')});
    const twin=pickTwin(fromMail.filter(o=>!made.includes(o.id)&&!claimed.has(o.id)),x,asking,list.length);
    if(twin){claimed.add(twin.id);const hadStreet=hasStreet(twin);
      let newLinks=false;if(!hadStreet){const nl=[...new Set([...(x.links||[]),...(x.photoLinks||[]).filter(u=>!/\.(jpe?g|png|webp)(\?|$)/i.test(u))].map(String))].filter(u=>/^https?:/i.test(u));
        if(nl.length&&JSON.stringify(nl.slice(0,8))!==JSON.stringify(twin.links||[])){twin.links=nl.slice(0,8);twin.linksOnly=list.length>1;delete twin.linkFill;newLinks=true}}
      const ch=mergeInto(twin,x,meta,(meta.docs||[]).length>0);saveDeal(twin,true);touched.push(twin.id);updated++;
      if((!hadStreet&&hasStreet(twin))||newLinks||(ch&&(meta.docs||[]).length))relinked.push(twin.id);continue}
    let old=hasStreet({address:String(x.address||'')})?byKey[dealKey({address:String(x.address),zip:String(x.zip||'')})]:null;if(old&&claimed.has(old.id))old=null;
    if(old&&parseNum(x.acceptPrice))old.wsClaims=Object.assign({},old.wsClaims,{accept:parseNum(x.acceptPrice)});
    if(!old){const kin=sameHouse(x,w,meta,list.length);if(kin&&!made.includes(kin.id)&&!claimed.has(kin.id)){claimed.add(kin.id);mergeInto(kin,x,meta,(meta.docs||[]).length>0);
      if(!kin.gmailThreadId&&meta.threadId){kin.gmailThreadId=meta.threadId;kin.gmailAccount=meta.acct||null}saveDeal(kin,true);touched.push(kin.id);relinked.push(kin.id);updated++;continue}}
    if(old){mergeInto(old,x,meta,(meta.docs||[]).length>0);if(asking&&asking!==curList(old)){old.listPrice=asking;old.priceHistory=(old.priceHistory||[]).concat({date:meta.at||nowISO(),price:asking})}if(meta.msgId&&!(old.seenMsgIds||[]).includes(meta.msgId))old.seenMsgIds=(old.seenMsgIds||[]).concat(meta.msgId).slice(-200);saveDeal(old,true);updated++;touched.push(old.id);continue}
    const d=newDeal({source:'wholesaler',mlsStatus:'off_market',address:String(x.address||'Unknown address'),city:x.city||'',state:String(x.state||'').trim().toUpperCase().slice(0,2)||zipState(x.zip)||homeState()||'',zip:String(x.zip||''),listPrice:asking,arv:parseNum(x.arv),arvSource:parseNum(x.arv)?'wholesaler':null,rehab:parseNum(x.rehab),rehabSource:parseNum(x.rehab)?'wholesaler':null,convo:/^\s*re\s*:/i.test(String(meta.subject||'')),beds:parseNum(x.beds),baths:parseNum(x.baths),sqft:parseNum(x.sqft),lotSqft:parseNum(x.lotSqft),year:parseNum(x.year),rent:parseNum(x.rent),propertyType:PROP_TYPES[x.propertyType]?x.propertyType:'single_family',description:String(x.description||''),
      wholesalerName:w.name||w.company||'',agent:{name:w.name||'',email:w.email||'',phone:w.phone||'',brokerage:w.company||''},
      wsClaims:{asking,accept:parseNum(x.acceptPrice),arv:parseNum(x.arv),rehab:parseNum(x.rehab),rent:parseNum(x.rent),terms:x.terms||'',deadline:x.deadline||'',access:x.access||'',redFlags:(x.redFlags||[]).map(String),notes:(Array.isArray(x.notes)?x.notes:[]).map(String).slice(0,12),occupancy:x.occupancy||'',comps:theirComps(x)},
      gmailThreadId:meta.threadId||null,gmailAccount:meta.acct||null,gvThreadId:meta.gvThreadId||null,seenMsgIds:meta.msgId?[meta.msgId]:[],receivedAt:meta.at||nowISO(),autopilot:!!(state.settings.auto.enabled&&state.settings.auto.wsAuto),linksOnly:list.length>1});
    {const prevA=parseNum(x.previousAsking);if(prevA&&asking&&prevA!==asking)d.priceHistory=[{date:new Date(Date.parse(meta.at||nowISO())-60000).toISOString(),price:prevA},{date:meta.at||nowISO(),price:asking}]}
    pushMsg(d,{dir:'in',channel:meta.channel||'email',text:text.slice(0,4000),at:meta.at||nowISO()});
    const links=(x.photoLinks||[]).filter(u=>/\.(jpe?g|png|webp)(\?|$)/i.test(u));if(links.length){d.photoUrls=links.slice(0,12);d.thumbUrl=links[0]}
    d.links=[...new Set([...(x.links||[]),...(x.photoLinks||[]).filter(u=>!/\.(jpe?g|png|webp)(\?|$)/i.test(u))].map(String))].slice(0,8);
    state.deals[d.id]=d;saveDeal(d,true);made.push(d.id);
    logActivity(d.id,'deal',`New wholesaler deal: ${streetOf(d.address)} from ${w.name||w.company||'a wholesaler'}${asking?' at '+money(asking):''}${overBox(d)?` (over your ${moneyK(boxCap())} price cap, so it’s under “Over ${moneyK(boxCap())}” in Inbox Leads)`:''}.`);
  }
  render();
  /* open each deal's links first (address, numbers, Drive photos), then research the ones at or under his buy box */
  const linking=made.filter(id=>{const d=state.deals[id];return d&&!overBox(d)&&dealLinks(d).length&&missingInfo(d)}).length;
  if(!meta.deferAfter){made.forEach(afterNewDeal);relinked.forEach(afterNewDeal)}
  return {deals:made,relinked,touched:[...new Set([...made,...touched])],updated,over:made.filter(id=>overBox(state.deals[id])).length,linking,w};
}
/* what Maya did with the last 30 days of wholesaler emails, so "0 new" never looks like nothing happened */
function mailStats(){
  const since=Date.now()-30*DAY;const ms=Object.values(state.mail.emails).filter(m=>new Date(m.date||0).getTime()>=since);
  const st={read:0,withDeals:0,noDeal:0,waiting:0,deals:0,over:0,passed:0,gone:0};
  for(const m of ms){if(m.status==='new'){st.waiting++;continue}if(m.status==='ignored'||m.status==='reply')continue;st.read++;
    if(m.status==='nodeal'){st.noDeal++;continue}st.withDeals++;
    for(const id of m.dealIds||[]){const d=state.deals[id];if(!d){st.gone++;continue}st.deals++;if(d.stage==='dead')st.passed++;else if(overBox(d))st.over++}}
  return st;
}
function mailRecap(st){st=st||mailStats();
  if(!st.read&&!st.waiting)return 'No wholesaler emails found in the last 30 days.';
  const p=[`Last 30 days: ${st.read} wholesaler email${st.read===1?'':'s'} read`];
  if(st.deals)p.push(`${st.deals} deal${st.deals===1?'':'s'} pulled out`+(st.over?` (${st.over} over ${moneyK(boxCap())}, under the “Over ${moneyK(boxCap())}” button)`:'')+(st.passed?`, ${st.passed} passed`:''));
  if(st.noDeal)p.push(`${st.noDeal} had no property ${negName()} could find`);
  if(st.waiting)p.push(`${st.waiting} waiting: press Pull out all`);
  return p.join(' · ')+'.';
}
/* ---------- photos attached to a deal's emails ----------
   Pulled once per email. In 24/7 mode there's no photo storage, so they wait for the next device that opens.
   Gmail script v6 sends big phone photos (up to 10 MB) in batches and says which ones it had to skip. */
function attMsgs(d){const ids=new Set();for(const id of d.seenMsgIds||[]){const m=state.mail.emails[id];if(m&&(m.atts||0)>0)ids.add(id)}
  for(const t of d.thread||[])if(t.dir==='in'&&t.gmailId&&(t.atts||0)>0)ids.add(t.gmailId);return [...ids]}
async function pullDealAttachments(id,quiet,only){
  const d=state.deals[id];if(!d||d.example||!gmailOn())return 0;
  const done=new Set(d.attDone||[]);const todo=(only||attMsgs(d)).filter(m=>!done.has(m));if(!todo.length)return 0;
  if(WORKER.on||!IDB.db){d.attPending=true;saveDeal(d,true);return 0}
  let added=0;const skipped=(d.attSkipped||[]).slice();
  for(const mid of todo){
    const rec=state.mail.emails[mid]||{};const acct=rec.acct||d.gmailAccount||undefined;let start=0,guard=0,got=0,ok=false;
    try{while(start!=null&&guard++<8){const r=await bridge('attachments',{id:mid,max:12,start},acct);ok=true;
        const blobs=(r.files||[]).map(x=>b64ToBlob(x.data,x.type));got+=blobs.length;if(blobs.length)added+=await addPhotoBlobs(id,blobs,'email');
        for(const x of r.skipped||[])skipped.push({msg:mid,name:String(x.name||''),why:String(x.why||'')});start=r.next==null?null:r.next}}
    catch(e){if(!quiet)toast(bridgeErr(e),5200)}
    if(!ok)continue;done.add(mid);
    const tm=(d.thread||[]).find(t=>t.gmailId===mid);const expected=+(rec.atts||(tm&&tm.atts)||0);
    if(!got&&expected&&!skipped.some(x=>x.msg===mid))skipped.push({msg:mid,name:'',why:'old_script',n:expected});
  }
  const dd=state.deals[id];if(!dd)return added;dd.attDone=[...done].slice(-100);dd.attSkipped=skipped.slice(-40);delete dd.attPending;saveDeal(dd,true);
  if(added)logActivity(id,'info',`${negName()} added ${added} photo${added>1?'s':''} from the email${todo.length>1?'s':''} on ${streetOf(dd.address)}.`);
  render();return added;
}
/* on open: deals whose email photos haven't come in yet (24/7 brought them in, or they arrived before this version) */
/* after a PDF lands on a deal Maya already researched: price the repairs from its photos (or the PDF) if that hasn't happened */
function afterPdf(id){const d=state.deals[id];if(!d||!aiOn()||WORKER.on)return;
  if(!d.research){afterNewDeal(id);return}
  const capR=boxCap();const p=curList(d);if(capR&&p!=null&&p>capR)return;
  if(!d.analysis&&(photoCount(d)||docCount(d))&&!state.busy['deep:'+id])aiDeep(id,true,secrets().model||'claude-sonnet-5-5').catch(()=>{})}
/* PDFs read before Oct 26 evening could land nowhere (the deal already existed from the email text): read those emails once more */
function migratePdfs(){const mg=state.settings.migr=state.settings.migr||{};if(mg.pdf1026b)return;mg.pdf1026=mg.pdf1026||nowISO();mg.pdf1026b=nowISO();saveSettings();
  const emails=(state.mail||{}).emails||{};
  /* 1) a wholesaler's other deal emails were filed as "replies" on one deal: take them back out */
  for(const d of Object.values(state.deals)){if(d.example||!(d.thread||[]).length)continue;let cut=0;
    d.thread=d.thread.filter(t=>{if(t.dir!=='in'||!t.gmailId)return true;const m=emails[t.gmailId];if(!m)return true;
      const other=(m.dealIds||[]).some(x=>x!==d.id&&state.deals[x]);const sameThread=d.gmailThreadId&&m.threadId===d.gmailThreadId;
      if(other&&!sameThread&&!/^\s*re\s*:/i.test(m.subject||'')){d.seenMsgIds=(d.seenMsgIds||[]).filter(x=>x!==t.gmailId);cut++;return false}return true});
    if(cut){if(d.draft&&draftOpen(d)){d.draft=null;d.needsYou=null}delete d.draftedFor;saveDeal(d,true)}}
  /* 2) the same house twice from one wholesaler, one copy empty: fold the empty one into the full one */
  const groups={};for(const d of Object.values(state.deals)){if(d.example||d.source!=='wholesaler'||!hasStreet(d)||['dead','closed'].includes(d.stage))continue;
    const sc=streetCore(d.address);if(!sc.num||!sc.name)continue;const k=((d.agent||{}).email||'').toLowerCase()+'|'+sc.num+'|'+sc.name.split(' ')[0];(groups[k]=groups[k]||[]).push(d)}
  const score=d=>(curList(d)!=null?8:0)+((d.docs||[]).length?4:0)+(photoCount(d)?2:0)+(d.arv!=null?1:0);
  for(const g of Object.values(groups)){if(g.length<2)continue;g.sort((a,b)=>score(b)-score(a)||String(a.created).localeCompare(String(b.created)));const keep=g[0];
    for(const o of g.slice(1)){if(curList(o)!=null||(o.docs||[]).length||photoCount(o))continue;
      const have=new Set((keep.thread||[]).map(t=>t.gmailId||t.id));keep.thread=[...(keep.thread||[]),...(o.thread||[]).filter(t=>!have.has(t.gmailId||t.id))].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
      keep.seenMsgIds=[...new Set([...(keep.seenMsgIds||[]),...(o.seenMsgIds||[])])].slice(-200);keep.offers=[...(keep.offers||[]),...(o.offers||[])];keep.mayaChat=[...(keep.mayaChat||[]),...(o.mayaChat||[])];
      if(o.convo)keep.convo=true;if(!keep.gmailThreadId&&o.gmailThreadId){keep.gmailThreadId=o.gmailThreadId;keep.gmailAccount=o.gmailAccount}
      if(keep.stage==='new'&&['sent','negotiating','contract'].includes(o.stage))keep.stage=o.stage;
      for(const m of Object.values(emails))if((m.dealIds||[]).includes(o.id))m.dealIds=[...new Set(m.dealIds.map(x=>x===o.id?keep.id:x))];
      saveDeal(keep,true);delete state.deals[o.id];persist('deals')}}
  /* 3) read this week's PDF emails once more: the first pass kept "attachment not included" notes and left ranged repair numbers blank */
  for(const m of Object.values(emails)){if(!((m.docs||0)>0)||m.docRead==='failed')continue;
    if(Date.now()-new Date(m.date).getTime()<7*864e5){m.docRead=false;m.pdfTries=0;continue}
    const ds=Object.values(state.deals).filter(d=>(d.seenMsgIds||[]).includes(m.id)||(m.dealIds||[]).includes(d.id));
    if(!ds.length||ds.some(d=>curList(d)==null||(d.arv==null&&(d.wsClaims||{}).arv==null)||!(d.docs||[]).length)){m.docRead=false;m.pdfTries=0}}
  saveMail()}
/* emails whose PDF Maya hasn't read yet (24/7 read the text only, or it came in before the Gmail script could send PDFs) */
async function finishPdfDeals(){if(WORKER.on||!IDB.db)return;let k=0;
  for(const d of Object.values(state.deals)){if(k>=3)break;if(d.example||!(d.docs||[]).length||['dead','closed'].includes(d.stage))continue;
    if(!photoCount(d)&&!d.pdfLift){d.pdfLift=nowISO();saveDeal(d,true);for(const x of d.docs){try{const r=await IDB.get('photos',x.id);if(!r||!r.blob)continue;const keep=await pdfPhotos(new Uint8Array(await r.blob.arrayBuffer()));if(keep.length){const n=await addPhotoBlobs(d.id,keep,'pdf');if(n)logActivity(d.id,'info',`${negName()} pulled ${n} photo${n>1?'s':''} out of the PDF on ${streetOf(d.address)}.`)}}catch(e){}}}
    const dd=state.deals[d.id];if(!dd||!aiOn())continue;
    if(dd.research&&!dd.analysis&&!overBox(dd)&&!state.busy['deep:'+dd.id]&&(!dd.deepTry||Date.now()-new Date(dd.deepTry).getTime()>864e5)){dd.deepTry=nowISO();saveDeal(dd,true);k++;try{await aiDeep(dd.id,true,secrets().model||'claude-sonnet-5-5')}catch(e){}}}
  render()}
async function resumePdfs(){if(WORKER.on||!gmailOn()||!IDB.db||!aiOn())return;
  try{await finishPdfDeals()}catch(e){}
  for(const d of Object.values(state.deals))for(const s of (d.docSkipped||[]))if(s.why==='too_big'&&(s.mb||0)<=25&&s.msg){const m=state.mail.emails[s.msg];if(m&&m.docRead===true&&!m.bigTried&&bridgeV(m.acct)>=8){m.bigTried=true;m.docRead=false;m.pdfTries=0;d.docSkipped=d.docSkipped.filter(x=>x!==s);saveDeal(d,true);saveMail()}}
  const due=Object.values(state.mail.emails).filter(m=>(m.docs||0)>0&&!m.docRead&&['imported','nodeal','new','reply'].includes(m.status)&&Date.now()-new Date(m.date).getTime()<45*864e5&&(m.pdfTries||0)<2).sort(byDate).reverse().slice(0,4);
  for(const m of due){if(state.busy['mail:'+m.id])continue;m.pdfTries=(m.pdfTries||0)+1;saveMail();try{await importEmail(m.id,true)}catch(e){}}
  if(due.length)render();
}
async function resumeAttachments(){if(WORKER.on||!gmailOn()||!IDB.db)return;
  if(bridgeV()>=6)for(const d of Object.values(state.deals)){const old=(d.attSkipped||[]).filter(x=>x.why==='old_script').map(x=>x.msg);if(!old.length)continue;
    d.attDone=(d.attDone||[]).filter(m=>!old.includes(m));d.attSkipped=(d.attSkipped||[]).filter(x=>x.why!=='old_script');saveDeal(d,true)}
  const ds=Object.values(state.deals).filter(d=>!d.example&&!['dead','closed'].includes(d.stage)&&(d.attPending||attMsgs(d).some(m=>!(d.attDone||[]).includes(m)))).slice(0,6);
  for(const d of ds){try{await pullDealAttachments(d.id,true)}catch(e){}}}
/* one plain sentence about what "Pull out" did, so it never looks like nothing happened */
function pullSummary(rs){
  const ok=rs.filter(r=>r&&!r.err);const add=ok.reduce((a,r)=>a+(r.deals||[]).length,0),upd=ok.reduce((a,r)=>a+(r.updated||0),0),over=ok.reduce((a,r)=>a+(r.over||0),0);
  const none=ok.filter(r=>!(r.deals||[]).length&&!r.updated).length;const bad=rs.filter(r=>r&&r.err);
  const parts=[];
  const lk=ok.reduce((a,r)=>a+(r.linking||0),0);
  if(add)parts.push(`Added ${add} deal${add>1?'s':''}`+(over?` (${over} asking over ${moneyK(boxCap())}, tucked under the “Over ${moneyK(boxCap())}” button)`:''));
  if(lk)parts.push(`${negName()} is opening the links on ${lk===1?'one of them':lk+' of them'} to get the missing address and numbers. ${lk===1?'It shows':'They show'} up in Inbox Leads when she’s done`);
  if(upd)parts.push(`${upd} already in OfferDesk, updated`);
  if(none)parts.push(`${none} email${none>1?'s':''} had no property in ${none>1?'them':'it'}`);
  if(bad.length)parts.push(`${bad.length} couldn’t be read: ${String(bad[0].err).replace(/[.\s]+$/,'')}`);
  return parts.length?parts.join('. ')+'.':'No new emails to pull from. Press Check Gmail first.';
}
async function importEmail(id,quiet){
  const m=state.mail.emails[id];if(!m)return;const f=parseFrom(m.from);
  let pdf=null;if((m.docs||0)>0&&!WORKER.on&&IDB.db){try{pdf=await fetchPdfs(m.id,m.acct)}catch(e){pdf=null}}
  const prior=(m.dealIds||[]).filter(x=>state.deals[x]);
  if(pdf&&!pdf.files.length&&prior.length&&['imported','reply'].includes(m.status)){for(const did of prior){try{await attachPdfs(did,pdf,m.id,false)}catch(e){}}const mm=state.mail.emails[id];if(mm){mm.docRead=true;saveMail()}render();return {deals:[],updated:0,touched:prior,w:{}}}
  const meta={fromEmail:f.email,fromName:f.name,threadId:m.threadId,acct:m.acct,msgId:m.id,at:m.date,channel:'email',subject:m.subject||'',docs:pdf?pdf.files.filter(aiPdf).map(x=>x.blob):[],prior,deferAfter:!!(pdf&&pdf.files.length)};
  const r=await extractDeals(`From: ${m.from}\nSubject: ${m.subject||''}\n\n${m.body||''}`,meta,'mail:'+id,quiet);
  if(r&&pdf){const mm=state.mail.emails[id];if(mm){mm.docRead=meta.pdfFailed?'failed':true;saveMail()}
    const ids=[...new Set(r.touched||[])];for(const did of ids){try{await attachPdfs(did,pdf,m.id,ids.length===1)}catch(e){}}
    for(const did of ids)afterPdf(did)}
  if(!r)return {err:(state.aiErrs||{})['mail:'+id]||'Maya couldn’t read that email.'};const mm=state.mail.emails[id];if(mm){mm.status=mm.status==='reply'?'reply':r.deals.length||r.updated||(mm.dealIds||[]).length?'imported':'nodeal';mm.dealIds=[...new Set([...(mm.dealIds||[]),...r.deals,...(r.relinked||[])])]}saveMail();
  if((m.atts||0)>0&&(r.touched||[]).length===1)await pullDealAttachments(r.touched[0],true,[m.id]);
  render();if(!quiet)toast(pullSummary([r]),6000);
  return r;
}

/* ---------- Maya's drafts ---------- */
function setDraft(id,draft){const d=state.deals[id];if(!d)return;d.draft=Object.assign({at:nowISO(),flags:[],letterPrice:draft.price??null},draft);d.needsYou=null;saveDeal(d)}
async function aiOpening(id,quiet){
  const d=state.deals[id];const c=calc(d);
  const res=await runAI('deal:'+id,`${negName()} is writing the opening offer…`,(ai,signal)=>ai.json(promptOpening(d,c),{signal}),quiet);
  if(!res||!state.deals[id])return;
  setDraft(id,{kind:'opening',action:'opening',price:c.opening,flags:arvTheirs(d)?[{cls:'amber',text:`This offer is built on the seller’s own ARV of ${money(d.arv)}, which ${negName()} hasn’t checked against comps yet. Press In-depth analysis first if you’re not sure.`}]:[],email:{subject:String(res.email&&res.email.subject||''),body:String(res.email&&res.email.body||'')},sms:String(res.sms||''),why:`Opening at ${money(c.opening)}: ${state.settings.buy.anchorGap}% under your ceiling, leaving room for ${state.settings.buy.maxRounds-1} counters.`});
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
    const act=ACTION_LABEL[dr.action]?dr.action:'custom';let price=OFFER_ACTS.has(act)?parseNum(dr.price):null;const cap=act==='creative'?c.sfCap:c.mao;const flags=[];
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
/* a deal already made from this email, read again with its PDF: fill gaps, never overwrite what's there */
const streetKey=a=>String(streetOf(a)||'').toLowerCase().replace(/\b(street|st|avenue|ave|av|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|place|pl|circle|cir|terrace|ter|parkway|pkwy|way|trail|trl)\b/g,'').replace(/\b(south|north|east|west)\b/g,m=>m[0]).replace(/[^a-z0-9]/g,'');
/* the same house already here from another email of the same wholesaler (their "Re:" came in first, a ZIP was missing): fill that deal */
function sameHouse(x,w,meta,n){
  if(n!==1)return null;const live=Object.values(state.deals).filter(o=>o.source==='wholesaler'&&!o.example&&!o.linksOnly&&!['dead','closed'].includes(o.stage));
  const xs=hasStreet({address:String(x.address||'')});const k=xs?streetKey(String(x.address)):'';const em=String(w.email||meta.fromEmail||'').toLowerCase();
  if(meta.threadId){const t=live.find(o=>o.gmailThreadId===meta.threadId&&(!xs||!hasStreet(o)||sameStreet(o.address,String(x.address))));if(t)return t}
  if(!xs||!em)return null;
  return live.find(o=>hasStreet(o)&&sameStreet(o.address,String(x.address))&&(!o.zip||!x.zip||String(o.zip).slice(0,5)===String(x.zip).slice(0,5))&&((o.agent||{}).email||'').toLowerCase()===em)||null;
}
/* "2603 Kendall" and "2603 S. Kendall Drive" are the same street address */
const STREET_FILLER=/^(n|s|e|w|ne|nw|se|sw|north|south|east|west|street|st|avenue|ave|av|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|place|pl|circle|cir|terrace|ter|parkway|pkwy|way|trail|trl)$/;
function streetCore(a){const t=String(streetOf(a)||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);const num=/^\d+[a-z]?$/.test(t[0]||'')?t.shift():'';return {num,name:t.filter(w=>!STREET_FILLER.test(w)).join(' ')}}
function sameStreet(a,b){const x=streetCore(a),y=streetCore(b);return !!x.num&&x.num===y.num&&!!x.name&&!!y.name&&(x.name===y.name||(' '+x.name+' ').includes(' '+y.name+' ')||(' '+y.name+' ').includes(' '+x.name+' '))}
function pickTwin(cand,x,asking,nList){
  if(!cand.length)return null;const xs=hasStreet({address:String(x.address||'')});
  if(xs){const hit=cand.find(o=>hasStreet(o)&&sameStreet(o.address,String(x.address)));if(hit)return hit;
    if(cand.every(o=>hasStreet(o)))return null}
  const z=String(x.zip||'').slice(0,5),c=String(x.city||'').toLowerCase();
  const fits=o=>(!o.zip||!z||String(o.zip).slice(0,5)===z)&&(!o.city||!c||String(o.city).toLowerCase()===c)&&(curList(o)==null||asking==null||curList(o)===asking);
  /* no street in this read: the house from the same email with the same ZIP and price, even if its links already gave it a street */
  const loose=cand.filter(o=>(xs?!hasStreet(o):true)&&fits(o));
  if(loose.length===1)return loose[0];
  if(!xs&&loose.length>1){const exact=loose.filter(o=>asking!=null&&curList(o)===asking&&(!z||String(o.zip||'').slice(0,5)===z));if(exact.length===1)return exact[0]}
  if(cand.length===1&&nList===1&&(!xs||!hasStreet(cand[0])))return cand[0];
  return null;
}
/* a deal already made from this email (or the same house in another email): fill gaps, never overwrite what's there */
function mergeInto(d,x,meta,fresh){
  const before=JSON.stringify([d.address,d.city,d.state,d.zip,d.beds,d.baths,d.sqft,d.lotSqft,d.year,d.rent,curList(d),d.arv,d.rehab,d.description,d.propertyType,d.wsClaims,d.links]);
  const hadStreet=hasStreet(d);
  if(!hadStreet&&hasStreet({address:String(x.address||'')}))d.address=String(x.address);
  else if(fresh&&hasStreet({address:String(x.address||'')})&&sameStreet(d.address,String(x.address))&&String(x.address).length>String(streetOf(d.address)).length)d.address=String(x.address);
  for(const k of ['city','zip'])if(!d[k]&&x[k])d[k]=String(x[k]);if(!d.state&&x.state)d.state=String(x.state).trim().toUpperCase().slice(0,2);
  for(const k of ['beds','baths','sqft','lotSqft','year','rent']){const v=parseNum(x[k]);if(d[k]==null&&v!=null)d[k]=v}
  const asking=parseNum(x.asking);if(curList(d)==null&&asking){d.listPrice=asking;d.priceHistory=[{date:meta.at||nowISO(),price:asking}]}
  const arv=parseNum(x.arv),reh=parseNum(x.rehab);if(d.arv==null&&arv){d.arv=arv;d.arvSource='wholesaler'}if(d.rehab==null&&reh){d.rehab=reh;d.rehabSource='wholesaler'}
  if(x.description&&(fresh||!d.description))d.description=String(x.description);
  if(PROP_TYPES[x.propertyType]&&(!d.propertyType||d.propertyType==='single_family'))d.propertyType=x.propertyType;
  const ws=Object.assign({},d.wsClaims);
  const fill=(k,v)=>{if(v!=null&&v!==''&&(ws[k]==null||ws[k]===''))ws[k]=v};
  fill('asking',asking);fill('arv',arv);fill('rehab',reh);fill('rent',parseNum(x.rent));fill('terms',x.terms||'');fill('deadline',x.deadline||'');fill('access',x.access||'');fill('occupancy',x.occupancy||'');
  const acc=parseNum(x.acceptPrice);if(acc&&(ws.accept==null||acc<ws.accept))ws.accept=acc;
  const xf=(x.redFlags||[]).map(String),xn=(Array.isArray(x.notes)?x.notes:[]).map(String);
  if(fresh){ws.redFlags=[...new Set(xf)].slice(0,12);ws.notes=[...new Set(xn)].slice(0,16)}
  else{ws.redFlags=[...new Set([...(ws.redFlags||[]),...xf])].slice(0,12);ws.notes=[...new Set([...(ws.notes||[]),...xn])].slice(0,16)}
  const tc=theirComps(x);if(tc.length&&(fresh||!(ws.comps||[]).length))ws.comps=tc;d.wsClaims=ws;
  if(meta.msgId&&!(d.seenMsgIds||[]).includes(meta.msgId))d.seenMsgIds=(d.seenMsgIds||[]).concat(meta.msgId).slice(-200);
  const nl=(Array.isArray(x.links)?x.links:[]).filter(u=>/^https?:/i.test(u));if(nl.length)d.links=[...new Set([...(d.links||[]),...nl])].slice(0,8);
  if(!hadStreet&&hasStreet(d)){delete d.linkFill;delete d.researchSkip}
  if(d.researchSkip==='address'&&hasStreet(d))delete d.researchSkip;
  return JSON.stringify([d.address,d.city,d.state,d.zip,d.beds,d.baths,d.sqft,d.lotSqft,d.year,d.rent,curList(d),d.arv,d.rehab,d.description,d.propertyType,d.wsClaims,d.links])!==before;
}
function theirComps(x){return (Array.isArray(x&&x.theirComps)?x.theirComps:[]).filter(c=>c&&c.addr).slice(0,6).map(c=>({addr:String(c.addr).slice(0,80),price:parseNum(c.price),sqft:parseNum(c.sqft),when:c.when?String(c.when).slice(0,40):'',dist:c.dist?String(c.dist).slice(0,30):''}))}
const compClaimText=c=>`${c.addr}${c.price?`, sold ${money(c.price)}`:''}${c.when?` (${c.when})`:''}${c.sqft?`, ${numFmt(c.sqft)} sqft`:''}${c.dist?`, ${c.dist}`:''}`;
async function aiDeepNoDocs(id,quiet,model,why){const d=state.deals[id];if(!d)return;
  d.deepNoDocs=true;try{return await aiDeep(id,quiet,model)}finally{const dd=state.deals[id];if(dd){delete dd.deepNoDocs;if(!dd.analysis&&why){dd.deepErr={at:nowISO(),msg:String(why).slice(0,200)};saveDeal(dd,true)}}}}
async function aiDeep(id,quiet,forceModel){
  const d=state.deals[id];if(!d)return;
  const items=await photoItemsForAI(d);const docs=items.length||d.deepNoDocs?[]:await docItemsForAI(d);
  const model=forceModel||bigModel();
  const marks=!!(model&&/opus/.test(model)&&items.length);
  const res=await runAI('deep:'+id,`${negName()} is studying ${items.length?items.length+' photo'+(items.length>1?'s':''):'the listing'}${model&&/opus/.test(model)?' with Opus':''}…`,(ai,signal)=>ai.json(promptDeep(d,items.length,marks,docs.length),{signal,images:items,docs,maxTokens:marks?12000:8000,model}),quiet);
  if(!res){const dd=state.deals[id];const err=(state.aiErrs||{})['deep:'+id]||'';
    /* the PDF itself may be what the model couldn't take: price the repairs from the description instead of leaving nothing */
    if(dd&&docs.length&&!/cancel|already/i.test(err)&&!dd.deepRetry){dd.deepRetry=true;saveDeal(dd,true);return aiDeepNoDocs(id,quiet,model,err)}
    if(dd&&err&&!/cancel|already/i.test(err)){dd.deepErr={at:nowISO(),msg:String(err).slice(0,200)};saveDeal(dd,true)}return}
  const dd=state.deals[id];if(!dd)return;delete dd.deepErr;delete dd.deepRetry;
  dd.analysis=Object.assign({},res,{at:nowISO(),photos:items.length,photoRefs:items.refs||[],model:model||secrets().model||'claude-sonnet-5-5'});
  const book=Object.fromEntries(rehabBook().map(b=>[b.key,b]));const short=u=>/sqft/.test(u)?'sqft':/linear/.test(u)?'ft':/house/.test(u)?'':'';
  const fromBook=(Array.isArray(res.rehabItems)?res.rehabItems:[]).filter(x=>book[x.key]&&parseNum(x.qty)>0).map(x=>{const b=book[x.key];const q=parseNum(x.qty);return {item:b.label,detail:`${/house/.test(b.unit)?'':numFmt(q)+(short(b.unit)?' '+short(b.unit):'')+' × '+(b.cost<100&&b.cost%1?'$'+b.cost.toFixed(2):money(b.cost))+' · '}${String(x.why||'')}${x.seen===false?' (not in photos: allowance)':''}`,cost:Math.round(q*b.cost),key:x.key,qty:q,seen:x.seen!==false}});
  const custom=(Array.isArray(res.customLines)?res.customLines:[]).filter(x=>parseNum(x.cost)).map(x=>({item:String(x.item||''),detail:String(x.detail||''),cost:parseNum(x.cost)}));
  const lines=fromBook.length||custom.length?[...fromBook,...custom]:(Array.isArray(res.rehabLines)?res.rehabLines.map(x=>({item:String(x.item||''),detail:String(x.detail||''),cost:parseNum(x.cost)})):[]);
  if(lines.length){dd.rehabLines=lines;dd.rehabCont=parseNum(res.contingencyPct)??10;
    const tot=Math.round(dd.rehabLines.reduce((a,x)=>a+(x.cost||0),0)*(1+(dd.rehabCont||0)/100));if(!dd.rehab||dd.rehabSource==='maya'||rehabTheirs(dd)){dd.rehab=tot;dd.rehabSource='maya'}}
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
    if(priceChanged&&OFFER_ACTS.has(dr.action||dr.kind)&&dr.action!=='hold'){d.offers=d.offers||[];d.offers.push({at,price:dr.price,by:'us'})}
    if(dr.kind==='followup'&&!priceChanged){d.follow=d.follow||{base:at,step:0};d.follow.step++}
    else d.follow={base:at,step:0};
    if(d.stage==='new')d.stage=ins(d).length&&d.source!=='wholesaler'?'negotiating':'sent';
    if(dr.action==='walk')d.follow={base:at,step:(state.settings.followDays||[]).length-1};
    if(dr.action==='withdraw')d.follow={base:at,step:(state.settings.followDays||[]).length};
    if(dr.action==='accept')d.stage='negotiating';
  }
  dr.sent[ch]=true;d.needsYou=null;d.handledAt=null;
  const other=ch==='email'?'sms':'email';const otherLeft=!dr.sent[other]&&(other==='sms'?(!!dr.sms&&canText(d)):(!!(dr.email&&dr.email.body)&&canEmail(d)));
  if(!otherLeft)d.draft=null;
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

/* ================= listing history ================= */
const HEV={listed:['Listed','blue'],price_cut:['Price cut','red'],price_up:['Price raised','orange'],pending:['Pending','amber'],contingent:['Contingent','amber'],back_on_market:['Back on market','blue'],sold:['Sold','green'],delisted:['Delisted','slate'],relisted:['Relisted','blue'],listed_rent:['Listed for rent','purple'],rented:['Rented','purple'],other:['Event','slate']};
const bigModel=()=>{const m=(state.settings.ai||{}).bigModel;return m==='same'?undefined:(m||'claude-opus-5-5')};
function histEvents(d){
  const ev=(d.history||[]).filter(e=>e&&e.date&&!isNaN(new Date(e.date))).map(e=>Object.assign({},e,{date:isoDay(e.date)}));
  const ph=(d.priceHistory||[]).filter(p=>p&&p.date&&p.price);
  ph.forEach((p,i)=>{const date=isoDay(p.date);const kind=i===0?'listed':p.price<ph[i-1].price?'price_cut':p.price>ph[i-1].price?'price_up':null;if(!kind)return;
    const near=x=>Math.abs(new Date(x.date)-new Date(date))<=5*DAY;
    if(!ev.some(x=>near(x)&&(x.event===kind||(kind==='listed'&&x.event==='relisted'))&&(x.price==null||Math.abs(x.price-p.price)<=1000)))ev.push({date,event:kind,price:p.price,src:'listing'})});
  ev.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let last=null;for(const e of ev){if(e.price&&['listed','relisted','price_cut','price_up','back_on_market'].includes(e.event)){e.delta=last!=null&&e.event!=='listed'&&e.event!=='relisted'?e.price-last:null;last=e.price}if(e.event==='sold')last=null}
  return ev;
}
function historyInsights(d){
  const ev=histEvents(d);if(!ev.length)return [];const out=[];const L=curList(d);const now=Date.now();const ms=x=>new Date(x).getTime();
  const sales=ev.filter(e=>e.event==='sold'&&e.price);const lastSale=sales[sales.length-1];
  if(lastSale){
    const after=ev.filter(e=>['listed','relisted'].includes(e.event)&&e.price&&e.date>lastSale.date&&ms(e.date)-ms(lastSale.date)<=460*DAY);const flip=after.find(e=>e.price>=lastSale.price*1.2);
    const yrs=(now-ms(lastSale.date))/(365*DAY);
    if(flip){const m=Math.max(1,Math.round((ms(flip.date)-ms(lastSale.date))/(30*DAY)));out.push({k:'flip',cls:'purple',text:`Flip pattern: sold for ${money(lastSale.price)} on ${fmtDate(lastSale.date)}, then listed at ${money(flip.price)} ${m} month${m===1?'':'s'} later (+${Math.round((flip.price/lastSale.price-1)*100)}%). It’s likely already renovated, and the seller’s cost is roughly that purchase plus their rehab.`})}
    else out.push({k:'sale',cls:yrs>=10?'green':'slate',text:`Last sold for ${money(lastSale.price)} on ${fmtDate(lastSale.date)} (${yrs<1?Math.max(1,Math.round(yrs*12))+' months':Math.round(yrs)+' years'} ago)${L?`. Today’s asking is ${L>=lastSale.price?'+':'−'}${Math.abs(Math.round((L/lastSale.price-1)*100))}% vs that sale`:''}.${yrs>=10?' Long ownership usually means lots of equity: a good fit for a discount or seller financing.':''}`});
  }
  const lastList=[...ev].reverse().find(e=>['listed','relisted'].includes(e.event));
  if(lastList){const cuts=ev.filter(e=>e.event==='price_cut'&&e.date>=lastList.date);if(cuts.length){const tot=cuts.reduce((a,e)=>a+Math.abs(e.delta||0),0);out.push({k:'cuts',cls:'red',text:`${cuts.length} price cut${cuts.length>1?'s':''} since it was listed on ${fmtDate(lastList.date)}${tot?`, ${money(tot)} in total`:''}. The seller is chasing the market.`})}}
  const relists=ev.filter(e=>['delisted','relisted','back_on_market'].includes(e.event)&&now-ms(e.date)<=3*365*DAY).length;
  if(relists>=2)out.push({k:'relist',cls:'orange',text:`Pulled and relisted ${relists} times in the last 3 years: it has struggled to sell. Ask what went wrong before.`});
  const pend=ev.filter(e=>['pending','contingent'].includes(e.event));const lp=pend[pend.length-1];
  if(lp&&!ev.some(e=>e.event==='sold'&&e.date>=lp.date)&&ev.some(e=>e.date>lp.date&&['back_on_market','price_cut','relisted','listed'].includes(e.event)))out.push({k:'fell',cls:'orange',text:`Went under contract on ${fmtDate(lp.date)} and came back on the market: a deal fell through (inspection or financing?). Ask the agent why.`});
  const rent=[...ev].reverse().find(e=>['listed_rent','rented'].includes(e.event));
  if(rent&&now-ms(rent.date)<=3*365*DAY)out.push({k:'rent',cls:'blue',text:`${rent.event==='rented'?'Rented':'Listed for rent'}${rent.price?' at '+money(rent.price)+'/mo':''} on ${fmtDate(rent.date)}. Possibly a tired landlord, and a real rent number for your rental math.`});
  return out;
}
function historyCard(d){
  const ev=histEvents(d);const ins=historyInsights(d);const n=esc(negName());const busy=state.busy['research:'+d.id]||state.busy['hist:'+d.id];
  let svg='';
  if(ev.length){
    const T=e=>dateOf(e.date).getTime();const t0=T(ev[0]),t1=Math.max(Date.now(),T(ev[ev.length-1]));
    const W=Math.round(Math.min(760,Math.max(330,(window.innerWidth||800)-(window.innerWidth<720?64:330)))),l=18,r=18;
    /* the axis is time-based but squeezes long quiet gaps (marked ≈) and spreads out clusters, so recent activity stays readable */
    const kt=[...new Set([...ev.map(T),t1])].sort((a,b)=>a-b);const YR=365*DAY,BRK=2*YR;
    const eff=[0];for(let i=1;i<kt.length;i++)eff.push(eff[i-1]+Math.min(kt[i]-kt[i-1],YR));const tot=eff[eff.length-1]||1;
    const kp=kt.map((t,i)=>l+(W-l-r)*(kt.length>1?.55*eff[i]/tot+.45*i/(kt.length-1):0));
    const X=t=>{if(kt.length<2||t<=kt[0])return kp[0];for(let i=1;i<kt.length;i++)if(t<=kt[i])return kp[i-1]+(kp[i]-kp[i-1])*(t-kt[i-1])/((kt[i]-kt[i-1])||1);return kp[kp.length-1]};
    const lab=e=>(HEV[e.event]||HEV.other)[0]+(e.price?' '+(/rent/.test(e.event)?money(e.price)+'/mo':moneyK(e.price)):'');
    const md=e=>{const x=dateOf(e.date);return x.toLocaleDateString('en-US',{month:'short'})+' ’'+String(x.getFullYear()).slice(2)};
    /* lanes: 1 above, 1 below, 2 above, 2 below; each label takes the first lane where it fits */
    const LANES=[[-1,1],[1,1],[-1,2],[1,2],[-1,3],[1,3]];const used=LANES.map(()=>[]);
    const placed=ev.map(e=>{const x=X(T(e));const w=Math.max(lab(e).length*6.3,md(e).length*5.6)+10;
      let anchor='middle',a=x-w/2;if(a<2){anchor='start';a=Math.max(2,x-6)}else if(x+w/2>W-2){anchor='end';a=Math.min(W-2,x+6)-w}
      const b=a+w;let li=LANES.findIndex((_,k)=>used[k].every(([p,q])=>b<=p||a>=q));if(li<0)li=LANES.length-1;used[li].push([a,b]);
      return {e,x,anchor,ax:anchor==='start'?a:anchor==='end'?b:x,lane:LANES[li]}});
    const upN=Math.max(1,...placed.filter(p=>p.lane[0]<0).map(p=>p.lane[1])),dnN=Math.max(1,...placed.filter(p=>p.lane[0]>0).map(p=>p.lane[1]));
    const y0=14+upN*30,H=y0+24+dnN*30;
    svg=`<svg viewBox="0 0 ${W} ${H}" class="htl" role="img" aria-label="Listing history timeline"><line x1="${l}" x2="${W-r}" y1="${y0}" y2="${y0}" class="htl-axis"/>`;
    let lastTick=-99;for(let y=new Date(t0).getFullYear()+1;y<=new Date(t1).getFullYear();y++){const t=new Date(y,0,1).getTime();const i=kt.findIndex(k=>k>=t);if(i>0&&kt[i]-kt[i-1]>BRK)continue;const x=X(t);if(x-lastTick<38||x>W-r-44)continue;lastTick=x;svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0-5}" y2="${y0+5}" class="htl-axis"/><text x="${(x+3).toFixed(1)}" y="${y0+14}" class="htl-yr">${y}</text>`}
    for(let i=1;i<kt.length;i++)if(kt[i]-kt[i-1]>BRK){const x=(kp[i-1]+kp[i])/2;svg+=`<g class="htl-brk"><rect x="${(x-7).toFixed(1)}" y="${y0-7}" width="14" height="14"/><path d="M${(x-6).toFixed(1)} ${y0+5}l5-10M${(x+1).toFixed(1)} ${y0+5}l5-10"/></g><text x="${x.toFixed(1)}" y="${y0+16}" text-anchor="middle" class="htl-yr">${Math.round((kt[i]-kt[i-1])/YR)} yrs</text>`}
    svg+=`<circle cx="${W-r}" cy="${y0}" r="3" class="htl-now"/><text x="${W-r}" y="${y0+14}" text-anchor="end" class="htl-yr">Today</text>`;
    placed.forEach(({e,x,anchor,ax,lane})=>{const h=HEV[e.event]||HEV.other;const up=lane[0]<0;const ly=up?y0-14-(lane[1]-1)*30:y0+24+(lane[1]-1)*30+10;
      svg+=`<g class="htl-ev ${h[1]}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${up?ly+3:ly-11}" class="htl-stem"/><circle cx="${x.toFixed(1)}" cy="${y0}" r="6"/><text x="${ax.toFixed(1)}" y="${up?ly-11:ly}" text-anchor="${anchor}" class="htl-lab">${esc(lab(e))}</text><text x="${ax.toFixed(1)}" y="${up?ly:ly+11}" text-anchor="${anchor}" class="htl-date">${esc(md(e))}</text><title>${esc(fmtDate(e.date)+' · '+h[0]+(e.price?' '+money(e.price):'')+(e.note?' · '+e.note:''))}</title></g>`});
    svg+='</svg>';
  }
  const rows=ev.slice().reverse().map(e=>{const h=HEV[e.event]||HEV.other;const k=(d.history||[]).findIndex(x=>x.date&&isoDay(x.date)===e.date&&x.event===e.event&&(x.price||null)===(e.price||null));
    return `<tr style="cursor:default"><td class="tnum">${esc(fmtDate(e.date))}</td><td><span class="tag ${h[1]}">${h[0]}</span>${e.note?` <span class="xs muted">${esc(e.note)}</span>`:''}</td><td class="r tnum">${money(e.price)}</td><td class="r tnum">${e.delta?`<span style="color:${e.delta<0?'var(--t-red)':'var(--t-orange)'}">${e.delta<0?'−':'+'}${money(Math.abs(e.delta)).replace('−','')}</span>`:''}</td><td class="xs muted">${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.src||'source')}</a>`:esc(e.src==='listing'?'this listing':e.src==='web'?'found online':e.src||'you')}</td><td>${k>=0?`<button class="btn ghost sm" data-act="hist-del" data-i="${k}" aria-label="Remove event">${ico('close')}</button>`:''}</td></tr>`}).join('');
  const add=state.histAdd?`<div class="row" style="align-items:flex-end"><label class="field" style="width:150px"><span>Date</span><input class="input" type="date" id="he-date" data-draft value="${esc(state.drafts['he-date']||'')}"></label><label class="field" style="width:170px"><span>What happened</span><select class="input" id="he-ev" data-draft>${Object.entries(HEV).map(([k,v])=>`<option value="${k}" ${(state.drafts['he-ev']||'listed')===k?'selected':''}>${v[0]}</option>`).join('')}</select></label><label class="field" style="width:130px"><span>Price</span><input class="input tnum" id="he-price" data-draft value="${esc(state.drafts['he-price']||'')}" inputmode="numeric"></label><button class="btn primary sm" data-act="hist-save">Add</button></div>`:'';
  const paste=state.histPaste?`<textarea class="input" id="hist-text" data-draft rows="4" placeholder="Paste the “Price history” section from Zillow or the “Property history” from Redfin">${esc(state.drafts['hist-text']||'')}</textarea><div class="row"><button class="btn primary sm" data-act="hist-parse">Read history</button></div>`:'';
  return `<section class="card" id="history"><div class="card-head"><span class="ci blue">${ico('clock')}</span><div><h2>Listing history</h2><p>What happened to this property before you showed up</p></div><div class="ch-r">${aiOn()?`<button class="btn sm" data-act="research" ${busy?'disabled':''}>${ico('spark')}${n} looks it up</button>`:''}<button class="btn sm" data-act="hist-paste-toggle">${ico('copy')}Paste history</button><button class="btn sm" data-act="hist-add-toggle">${ico('plus')}Add event</button></div></div>
  ${busyHTML('research:'+d.id)}${busyHTML('hist:'+d.id)}${add}${paste}
  ${ins.map(x=>`<div class="note ${x.cls==='slate'?'':x.cls}">${esc(x.text)}</div>`).join('')}
  ${ev.length?`<div class="tbl-wrap" style="border:0">${svg}</div><details id="hist-all" ${ev.length<=6?'open':''}><summary>All ${ev.length} event${ev.length>1?'s':''}</summary><div class="tbl-wrap" style="margin-top:8px"><table class="tbl" style="min-width:560px"><thead><tr><th>Date</th><th>Event</th><th class="r">Price</th><th class="r">Change</th><th>Source</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></details>`:`<p class="small muted">No history yet. Paste Zillow’s “Price history” (or Redfin’s “Property history”), or let ${n} look it up: past sales, price cuts, failed contracts and flips tell you how motivated the seller is.</p>`}
  </section>`;
}

/* ================= Maya's research (links, web, comps, claims check) ================= */
const SKIP_LINK=/unsubscribe|optout|opt-out|manage.?preferences|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|\/\/(?:www\.)?x\.com\/|tiktok\.com|youtube\.com\/(?:channel|@)|calendly\.com|mailto:|list-manage\.com\/(?:unsubscribe|profile)/i;
function dealLinks(d){
  const set=new Set();const add=u=>{u=String(u||'').trim().replace(/[)>.,;]+$/,'');if(/^https?:\/\/\S+$/i.test(u)&&!SKIP_LINK.test(u)&&u.length<2000)set.add(u)};
  (d.links||[]).forEach(add);if(d.listingUrl)add(d.listingUrl);
  /* the email's other links only when the email was about this one house (an alert listing 8 houses has 8 houses' links) */
  const multi=d.linksOnly||(d.seenMsgIds||[]).some(id=>((state.mail.emails[id]||{}).dealIds||[]).length>1);
  const first=(d.thread||[]).find(t=>t.dir==='in');if(first&&!multi)(String(first.text||'').match(/https?:\/\/[^\s"'<>]+/g)||[]).forEach(add);
  return [...set].filter(u=>!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)).slice(0,6);
}
function promptResearch(d,ctx){
  const c=calc(d);const ws=d.wsClaims||{};const isWs=d.source==='wholesaler';
  const where=[streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', ');
  return `You are ${negName()}, an acquisitions analyst for a real estate investor (flips, BRRRR, wholesale). Research this property so the investor knows everything that matters before making an offer. Use web search, and open the links below with web fetch when useful. Use only what you actually find, and name the source for each fact. If a site blocks you, say so and use search instead. Do not guess.

Property: ${where||'unknown address'}
${isWs?`A wholesaler sent this deal. Their claims: asking ${money(ws.asking??curList(d))}, ARV ${money(ws.arv)}, repairs ${money(ws.rehab)}, rent ${money(ws.rent)}${ws.terms?', terms: '+ws.terms:''}.${(ws.notes||[]).length?` Other details they gave${docCount(d)?' (email and PDF deal sheet)':''}: ${ws.notes.slice(0,10).join('; ')}.`:''}`:`Listed at ${money(curList(d))}.`} Beds/baths/sqft/year on file: ${d.beds??'?'} / ${d.baths??'?'} / ${d.sqft??'?'} / ${d.year??'?'}.
${(ws.comps||[]).length?`The wholesaler cited these sales as comps. Check each one (did it sell, when, for how much, its size, and whether it is really comparable: new construction, fully renovated, much bigger or smaller, a different kind of street) and report it in claimsCheck:\n${ws.comps.map(c=>'- '+compClaimText(c)).join('\n')}\n`:''}${(d.description||'').slice(0,1200)}
${ins(d).length?`What they wrote to us (newest last):\n${ins(d).slice(-4).map(t=>'--- '+String(t.text||'').slice(0,1500)).join('\n')}`:''}
${ctx.links.length?`Links that came with the deal (open the ones that help):\n${ctx.links.map(u=>'- '+u).join('\n')}`:''}
${ctx.pages.length?`Pages we already opened for you (trimmed):\n${ctx.pages.map(p=>`--- ${p.url} (${p.title||''})\n${p.text.slice(0,6000)}`).join('\n')}`:''}
${ctx.blocked.length?`These links blocked our robot: ${ctx.blocked.join(', ')}`:''}

Find:
1. Property facts from public sources (listing sites, county records): beds, baths, living sqft, lot, year built, type.
2. The property's history: every listing, price change, pending, sale, delisting, relisting and rental you can find, with dates and prices.
3. Recently sold comparable homes: within about 1 mile, sold in the last 12 months, similar size and beds. Include address, price, sale date, sqft, beds, baths, distance if shown, the listing URL, and whether the listing says renovated/updated (reno true) or as-is/needs work (reno false). Five to eight good ones beats many weak ones.
4. A market rent estimate with the source.
5. Check every number the ${isWs?'wholesaler':'listing'} gives against what you found.
6. Red flags: flood zone, foundation, fire, tenant-occupied, HOA, code violations, unpermitted work, auctions or liens, anything odd in the history.
Our current ARV on file is ${money(c.A)}${arvTheirs(d)?' (that is the wholesaler’s claim, not checked)':''}; give your own ARV from the renovated sold comps, and say in \"why\" which comps it rests on.

Finish with only this JSON (no text after it):
{"facts":{"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"propertyType":"single_family|multi_family|townhouse|condo|land|mobile|other|null","source":"url"},
"history":[{"date":"YYYY-MM-DD","event":"listed|price_cut|price_up|pending|contingent|back_on_market|sold|delisted|relisted|listed_rent|rented|other","price":number|null,"url":"source url"}],
"comps":[{"addr":"street, city","price":number,"soldDate":"YYYY-MM-DD","sqft":number|null,"beds":number|null,"baths":number|null,"dist":number|null,"status":"sold|for_sale|pending","reno":true|false|null,"url":""}],
"rent":{"value":number|null,"why":"one sentence","source":"url"},
"arv":{"value":number|null,"low":number|null,"high":number|null,"why":"one or two sentences"},
"claimsCheck":[{"claim":"what they say","found":"what you found","verdict":"matches|off|unverified"}],
"sellerLowest":{"price":number|null,"quote":"their exact words, if they said the lowest price they would take (e.g. 'with a cash offer we can probably accept 47,000')"},
"redFlags":["..."],"couldNotOpen":["urls you could not read"],
"summary":"three or four plain sentences for the investor: is this worth pursuing and why"}`;
}
const LINKCACHE=new Map();
async function openLinks(id,links,opts){
  opts=opts||{};const d=state.deals[id];const pages=[],blocked=[],noAccess=[],why={};let photos=0;if(!gmailOn()||!links.length)return {pages,blocked,photos,noAccess,why};
  for(const u of links.slice(0,5)){
    let r;const hit=LINKCACHE.get(u);
    if(hit&&!opts.fresh&&Date.now()-hit.t<30*60*1000)r=hit.r;else{try{r=await bridge('fetch_url',{url:u});LINKCACHE.set(u,{t:Date.now(),r})}catch(e){blocked.push(u);continue}}
    if(r.kind==='page'&&ROBOT_PAGE.test(String(r.title||'')+' '+String(r.text||'').slice(0,600)))r=Object.assign({},r,{kind:'blocked',status:'robot_check'});
    if(r.kind==='blocked'){blocked.push(u);why[u]=r.status;if(r.status==='drive_no_access')noAccess.push(u);
      /* the page is blocked, but the web address it led to often spells out the street address */
      const hops=(r.hops||[]).filter(x=>x&&x!==u);if(hops.length)pages.push({url:u,title:'(blocked page: only the web address it led to is known)',text:'This link led to: '+hops.join(' then '),redirectOnly:true});
      continue}
    if((r.kind==='drive_folder'||r.kind==='drive_file')&&(r.images||[]).length){
      /* each Drive photo only once, even when research opens the same folder later */
      const dd=state.deals[id];const seen=new Set(dd.driveSeen||[]);const todo=r.images.filter(im=>!seen.has(im.id)).slice(0,Math.max(0,16-photoCount(dd)));
      const blobs=[];for(const im of todo){try{const x=await bridge('drive_image',{id:im.id});if(x.data){blobs.push(b64ToBlob(x.data,x.type));seen.add(im.id)}}catch(e){}}
      if(state.deals[id])state.deals[id].driveSeen=[...seen].slice(-200);
      if(blobs.length)photos+=await addPhotoBlobs(id,blobs,'link');continue}
    if(r.kind==='image'){photos+=addPhotoUrls(id,[u]);continue}
    if(r.kind==='page'){const imgs=(r.images||[]).map(x=>String(x&&x.src||x)).filter(x=>/^https:\/\//i.test(x)&&!/logo|icon|sprite|avatar|badge|favicon|placeholder|pixel|banner|staticmap|maps\.googleapis|-\d{2,3}x\d{2,3}\.(jpe?g|png|webp)/i.test(x));
      if(r.text)pages.push({url:u,title:r.title||'',text:r.text,images:[...new Set(imgs)].slice(0,40)});
      if(opts.pagePhotos!==false&&imgs.length&&photoCount(state.deals[id])<6)photos+=addPhotoUrls(id,imgs.slice(0,12))}
  }
  return {pages,blocked,photos,noAccess,why};
}
const ROBOT_PAGE=/just a moment|attention required|verify you are human|are you a robot|checking your browser|security check|captcha/i;
/* ================= opening a new deal's links right away =================
   Alert and wholesaler emails often leave things out (no street address, no ARV) and link to the property page or a Google Drive
   photo folder instead. Maya opens those links through the Gmail script (it follows tracking redirects and can open Drive folders
   shared with you or with anyone who has the link), pulls the photos, and fills in what the email left out from the page. */
function hasStreet(d){const s=streetOf(d&&d.address);return /^\d+[a-z]?(-\d+)?\s+\S/i.test(s)&&!/unknown/i.test(s)}
const missingInfo=d=>!hasStreet(d)||curList(d)==null||!/^\d{5}/.test(String(d.zip||''))||d.beds==null||d.sqft==null||d.arv==null;
const P_LINKPAGE=(d,pages)=>`A wholesaler or deal-alert email linked to these pages about a property. Fill in what the email left out, using only what the pages actually say. Use null for anything not on the pages. Numbers are plain numbers in dollars or square feet. If a page shows several properties, use only the one that matches the email (same city, ZIP, price or details); if none clearly matches, set "samePropertyAsEmail" to false.

What the email gave: ${JSON.stringify({address:d.address,city:d.city,state:d.state,zip:d.zip,asking:curList(d),arv:d.arv,rehab:d.rehab,beds:d.beds,baths:d.baths,sqft:d.sqft,year:d.year})}

${pages.some(p=>(p.images||[]).length)?`"photoLinks": pick from the image addresses listed under each page only the photos of THIS house (outside and inside), in page order. Skip logos, people, maps and photos of other listings shown on the page. At most 12. If you can't tell which are this house, return [].

`:''}Reply with only JSON: {"samePropertyAsEmail":true|false,"address":"street address with the house number, or null","city":"","state":"","zip":"","asking":number|null,"arv":number|null,"rehab":number|null,"beds":number|null,"baths":number|null,"sqft":number|null,"lotSqft":number|null,"year":number|null,"rent":number|null,"occupancy":"vacant|occupied|unknown","description":"one or two sentences on condition and the pitch, or null","photoLinks":["direct image URLs of this house, at most 12"]}

${pages.map(p=>`Page: ${p.url}\nTitle: ${p.title}\n"""${String(p.text||'').slice(0,14000)}"""${(p.images||[]).length?`\nImages on this page, in order:\n${p.images.map(u=>'- '+u.slice(0,220)).join('\n')}`:''}`).join('\n\n')}`;
function applyLinkPage(d,j,src){
  const filled=[];const num=k=>parseNum(j[k]);
  const street=String(j.address||'').trim();
  if(!hasStreet(d)&&hasStreet({address:street})){d.address=street;filled.push('address')}
  if(!d.city&&j.city){d.city=String(j.city);filled.push('city')}
  if(!/^\d{5}/.test(String(d.zip||''))&&/^\d{5}/.test(String(j.zip||''))){d.zip=String(j.zip).slice(0,5);filled.push('ZIP')}
  if(!d.state)d.state=String(j.state||'').trim().toUpperCase().slice(0,2)||zipState(d.zip)||'';
  if(/^\d{5}/.test(String(d.zip||''))&&zipState(d.zip)&&d.state!==zipState(d.zip)&&filled.includes('ZIP'))d.state=zipState(d.zip);
  const ask=num('asking');if(curList(d)==null&&ask){d.listPrice=ask;d.priceHistory=[{date:nowISO(),price:ask}];d.wsClaims=Object.assign({},d.wsClaims,{asking:ask});filled.push('price')}
  const arv=num('arv');if(d.arv==null&&arv){d.arv=arv;d.arvSource='wholesaler';d.wsClaims=Object.assign({},d.wsClaims,{arv});filled.push('ARV')}
  const reh=num('rehab');if(d.rehab==null&&reh){d.rehab=reh;d.wsClaims=Object.assign({},d.wsClaims,{rehab:reh});filled.push('repairs')}
  for(const [k,l] of [['beds','beds'],['baths','baths'],['sqft','sq ft'],['lotSqft','lot'],['year','year built'],['rent','rent']]){const v=num(k);if(d[k]==null&&v!=null){d[k]=v;filled.push(l)}}
  if(!d.description&&j.description){d.description=String(j.description);filled.push('description')}
  if(['vacant','occupied'].includes(j.occupancy)&&!(d.wsClaims||{}).occupancy)d.wsClaims=Object.assign({},d.wsClaims,{occupancy:j.occupancy});
  const ph=(Array.isArray(j.photoLinks)?j.photoLinks:[]).map(String).filter(u=>/^https:\/\//i.test(u)&&!/logo|icon|sprite|avatar|badge|favicon|placeholder|pixel|staticmap/i.test(u));
  const n=ph.length?addPhotoUrls(d.id,ph.slice(0,12)):0;if(n)filled.push(n+' photo'+(n>1?'s':''));
  return filled;
}
async function fillFromLinks(id,quiet,fresh){
  const d=state.deals[id];if(!d||d.example)return null;
  const links=dealLinks(d);
  if(!links.length){delete d.checking;d.linkFill={at:nowISO(),none:true};saveDeal(d,true);return d.linkFill}
  if(!gmailOn()){delete d.checking;d.linkFill={pending:true,needGmail:true};saveDeal(d,true);if(!quiet)toast('Connect Gmail first: Maya opens links through your Gmail script.',5200);return d.linkFill}
  if(state.busy['links:'+id])return null;
  state.busy['links:'+id]={label:`${negName()} is opening the links…`};render();
  let got;try{got=await openLinks(id,links.slice(0,4),{pagePhotos:false,fresh:fresh==null?!quiet:fresh})}catch(e){got={pages:[],blocked:[],photos:0,noAccess:[],why:{}}}finally{delete state.busy['links:'+id];render()}
  let dd=state.deals[id];if(!dd)return null;let filled=[],other=false;
  if(got.photos)filled.push(got.photos+' Drive photo'+(got.photos>1?'s':''));
  const zip5=String(dd.zip||'').slice(0,5),city=String(dd.city||'').toLowerCase(),ask=curList(dd);
  const about=p=>{const t=String(p.text||'');const lt=t.toLowerCase();
    if(p.redirectOnly){const slug=lt.replace(/[^a-z0-9]+/g,' ');return /\b\d+\s+[a-z]/.test(slug)&&((zip5&&slug.includes(zip5))||(city&&slug.includes(city.replace(/[^a-z0-9]+/g,' '))))}
    if(t.length<120)return false;
    return (zip5&&lt.includes(zip5))||(city&&lt.includes(city))||(ask&&(t.includes(String(ask))||t.includes(Number(ask).toLocaleString('en-US'))))||(!zip5&&!city&&!ask)};
  const useful=got.pages.filter(about).slice(0,2).map(p=>Object.assign({},p,{text:String(p.text).slice(0,8000)}));
  if(!useful.length&&got.pages.some(p=>!p.redirectOnly&&String(p.text||'').length>=120))other=true;
  const sig=(s=>{let x=0;for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return x.toString(36)})(useful.map(p=>p.url+':'+p.text).join('|'));const prevSig=(dd.linkFill||{}).sig;
  const needPh=!photoCount(dd)&&!dd.linkPhotosTried&&useful.some(p=>(p.images||[]).length);if(needPh){dd.linkPhotosTried=nowISO()}
  if(useful.length&&aiOn()&&((missingInfo(dd)&&sig!==prevSig)||needPh)){
    const res=await runAI('links:'+id,`${negName()} is reading the property page…`,(ai,signal)=>ai.json(P_LINKPAGE(dd,useful),{signal,modelTier:'quick',maxTokens:2000}),true);
    dd=state.deals[id];if(!dd)return null;
    if(res&&res.samePropertyAsEmail===false)other=true;else if(res)filled=filled.concat(applyLinkPage(dd,res));
  }
  const tries=((dd.linkFill||{}).tries||0)+1;delete dd.checking;
  dd.linkFill={at:nowISO(),tries,sig,opened:got.pages.filter(p=>!p.redirectOnly).length,robot:got.blocked.filter(u=>got.why[u]==='robot_check').slice(0,6),blocked:got.blocked.filter(u=>!got.noAccess.includes(u)&&got.why[u]!=='robot_check').slice(0,6),noAccess:got.noAccess.slice(0,6),filled,other};
  saveDeal(dd,true);
  if(filled.length)logActivity(id,'info',`${negName()} opened the links for ${streetOf(dd.address)} and filled in: ${filled.join(', ')}.`);
  render();
  if(!quiet)toast(filled.length?`Filled in from the link: ${filled.join(', ')}.`:got.noAccess.length?'That Google Drive folder isn’t shared with you. Ask the wholesaler to share it.':got.pages.length?'Opened the link, but it didn’t add anything new.':'Couldn’t open the links (the site may block robots).',5200);
  return dd.linkFill;
}
function noAddrWhy(d){
  if(!d||d.example||hasStreet(d))return null;const lf=d.linkFill||{};const n=negName();
  if(state.busy['links:'+d.id]||checking(d))return {c:'purple',t:`${n} is opening the link`};
  if((lf.robot||[]).length)return {c:'amber',t:'Site wants a human: paste the address'};
  if(!dealLinks(d).length)return {c:'slate',t:'No link in the email'};
  if((lf.noAccess||[]).length)return {c:'amber',t:'Photo folder not shared'};
  if((lf.blocked||[]).length)return {c:'amber',t:'Link blocked: paste the address'};
  if(lf.at)return {c:'slate',t:'Link had no address'};
  return {c:'slate',t:`Waiting for ${n} to open the link`};
}
/* what happened when Maya opened the links, on the deal page (empty when there is nothing to say) */
function linkCard(d){
  if(d.example)return '';const lf=d.linkFill||{};const links=dealLinks(d);const n=esc(negName());const busy=state.busy['links:'+d.id];
  const short=u=>esc(String(u).replace(/^https?:\/\/(www\.)?/,'').slice(0,48));const out=[];
  const btn=label=>links.length?`<button class="btn sm" data-act="fill-links" ${busy||!aiOn()?'disabled':''}>${ico('link')}${label}</button>`:'';
  if(!hasStreet(d)&&!(lf.robot||[]).length)out.push(`<div class="note amber row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>No street address yet.</b> ${links.length?(lf.at?`${n} opened the links but didn’t find it. Ask the wholesaler, or type it into Details below.`:`${n} can open the link that came with this deal and fill it in.`):'The email didn’t include one or a link to the property. Ask the wholesaler, or type it into Details below.'}</span>${btn(lf.at?'Try the links again':'Open the links and fill it in')}</div>`);
  if(lf.pending&&!gmailOn())out.push(`<div class="note amber">Connect Gmail (Connect → Gmail) so ${n} can open this deal’s links. She opens them through your Gmail script.</div>`);
  if((lf.filled||[]).length)out.push(`<div class="note green small">${ico('check')} Filled in from the link: ${lf.filled.map(esc).join(', ')}.</div>`);
  if(lf.other)out.push(`<p class="xs muted">The page showed a different house, so nothing was copied from it.</p>`);
  if((lf.noAccess||[]).length)out.push(`<div class="note amber small"><b>Photo folder not shared with you:</b> ${lf.noAccess.map(short).join(' · ')}. Ask the wholesaler to share it with your Gmail or set it to “Anyone with the link”. ${n} tries again on her own, or press <span style="white-space:nowrap">${btn('Try the links again')}</span></div>`);
  if((lf.robot||[]).length&&!hasStreet(d))out.push(`<div class="note amber small"><b>The site asks to prove you’re human</b> (an “I’m not a robot” box). ${n} isn’t allowed to click those, so this one is on you: ${lf.robot.slice(0,2).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">open the ${lf.robot.length>1?['first','second'][i]+' ':''}link</a>`).join(' · ')}, then paste the address here.
    <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><input class="input" id="lk-addr" data-fd="address" placeholder="e.g. 1234 W 5th Ave" style="flex:1;min-width:200px" aria-label="Street address"></div></div>`);
  else if((lf.robot||[]).length)out.push(`<p class="xs muted">${lf.robot.length} link${lf.robot.length>1?'s':''} asked to prove you’re human, so ${n} skipped ${lf.robot.length>1?'them':'it'}.</p>`);
  if((lf.blocked||[]).length)out.push(`<p class="xs muted">Couldn’t open: ${lf.blocked.map(short).join(' · ')} (the site blocks robots or needs a login). Open it yourself and paste the details if they matter.</p>`);
  if(!out.length&&!busy)return '';
  return `<section class="card" id="links"><div class="card-head"><span class="ci blue">${ico('link')}</span><div><h2>${hasStreet(d)?'Links from the email':'No address yet · links from the email'}</h2><p>${links.length} link${links.length===1?'':'s'} · ${n} opens them, pulls Google Drive photos and fills in what the email left out</p></div></div>${busyHTML('links:'+d.id,false)}${out.join('')}</section>`;
}
/* after a deal comes in: open its links first, then research (so research has the address) */
const LQ={list:[],running:false};
function afterNewDeal(id){
  const d=state.deals[id];if(!d)return;
  const capR=boxCap();const p=curList(d);const inBox=!capR||p==null||p<=capR;
  if(inBox&&dealLinks(d).length&&!d.linkFill){
    if(!gmailOn()){d.linkFill={pending:true};saveDeal(d,true);return}
    if(missingInfo(d))d.checking=Date.now();
    if(WORKER.on){d.linkFill={pending:true};saveDeal(d,true);return}
    saveDeal(d,true);if(!LQ.list.includes(id))LQ.list.push(id);drainLinks();return}
  maybeResearch(id);
}
/* automatic research costs real money (big model + web searches), so it is rationed:
   only deals inside the buy box whose asking isn't already well over his ceiling, and at most dailyMax a day (default 3) */
function researchVerdict(d){
  const S=state.settings.research||{};if(!S.auto||!aiOn())return 'off';
  const capR=boxCap();const p=curList(d);if(capR&&p!=null&&p>capR)return 'over';
  if(!hasStreet(d))return 'address';
  const c=calc(d);if(c.ready&&p!=null&&c.mao&&p>c.mao*1.15)return 'price';
  const day=new Date().toISOString().slice(0,10);const used=(S.autoDay&&S.autoDay.day===day)?S.autoDay.n:0;
  if(used>=(S.dailyMax==null?3:+S.dailyMax))return 'cap';
  return 'ok';
}
function maybeResearch(id){const d=state.deals[id];if(!d||d.research||WORKER.on)return;
  const v=researchVerdict(d);if(v!=='ok'){if(v==='price'||v==='cap'||v==='address'||v==='over'){d.researchSkip=v;saveDeal(d,true)}return}
  const S=state.settings.research;const day=new Date().toISOString().slice(0,10);
  S.autoDay={day,n:((S.autoDay&&S.autoDay.day===day)?S.autoDay.n:0)+1};saveSettings();delete d.researchSkip;
  if(!RQ.list.includes(id))RQ.list.push(id);drainResearch()}
/* deals that missed the daily limit get researched on the next days, newest first, still within the limit */
function resumeCapped(){if(WORKER.on||!aiOn()||!(state.settings.research||{}).auto)return;
  const ds=Object.values(state.deals).filter(d=>d.researchSkip==='cap'&&!d.research&&!d.example&&!['dead','closed'].includes(d.stage)).sort((a,b)=>String(b.receivedAt||b.created||'').localeCompare(String(a.receivedAt||a.created||'')));
  for(const d of ds){const v=researchVerdict(d);if(v==='cap'||v==='off')break;maybeResearch(d.id)}}
async function drainLinks(){if(LQ.running)return;LQ.running=true;try{while(LQ.list.length){const id=LQ.list.shift();const d=state.deals[id];if(d){const retry=!!(d.linkFill&&d.linkFill.at);await fillFromLinks(id,true,retry);if(state.deals[id]&&state.deals[id].checking){delete state.deals[id].checking;saveDeal(state.deals[id],true)}maybeResearch(id)}}}finally{LQ.running=false;render()}}
/* deals the 24/7 worker brought in, and older deals still missing a street address: open their links on this device */
const bridgeV=acctId=>+((acctInfo(acctId||(sendAcct()||{}).id)||{}).version||1);
const relinkKey=m=>bridgeV(m.acct)>=5?'relinked5':'relinked';
async function relinkEmails(ids){for(const id of ids){const m=state.mail.emails[id];const k=m&&relinkKey(m);if(!m||m[k])continue;m[k]=nowISO();
  if(k==='relinked5'){try{const r=await bridge('message',{id},m.acct||undefined);if(r&&r.body)m.body=r.body}catch(e){}}
  saveMail();try{await importEmail(id,true)}catch(e){}}}
function resumeLinks(){
  if(WORKER.on)return;
  if(!gmailOn()||!aiOn()){for(const d of Object.values(state.deals))if(d.checking){delete d.checking;saveDeal(d,true)}return}
  const reread=[];
  for(const d of Object.values(state.deals)){if(d.example||d.source!=='wholesaler'||!['new','sent'].includes(d.stage||'new')||overBox(d)){if(d.checking){delete d.checking;saveDeal(d,true)}continue}
    const lf=d.linkFill;const links=dealLinks(d).length;
    const due=(lf&&lf.at&&(lf.tries||1)<3&&Date.now()-new Date(lf.at).getTime()>12*3600*1000&&(!hasStreet(d)||(lf.noAccess||[]).length))||(lf&&lf.at&&(lf.opened||0)>0&&hasStreet(d)&&!photoCount(d)&&!d.linkPhotosTried&&!lf.pending);
    if(links&&((lf&&lf.pending)||d.checking||(!lf&&!hasStreet(d))||due)){if(!LQ.list.includes(d.id))LQ.list.push(d.id)}
    else{if(d.checking){delete d.checking;saveDeal(d,true)}
      if(!hasStreet(d)&&(!links||(lf&&lf.at)))for(const mid of d.seenMsgIds||[]){const m=state.mail.emails[mid];if(m&&m.body&&!m[relinkKey(m)]&&!reread.includes(mid))reread.push(mid)}}}
  drainLinks();
  if(reread.length)relinkEmails(reread.slice(0,10));
}
async function researchDeal(id,quiet,auto,opts){opts=opts||{};
  const d=state.deals[id];if(!d)return;if(!aiOn()){if(!quiet)toast(aiErr({code:'no_ai'}),5200);return}
  if(state.busy['research:'+id])return;
  const links=dealLinks(d);const before=photoCount(d);
  state.busy['research:'+id]={label:links.length&&gmailOn()?`${negName()} is opening the links…`:`${negName()} is researching ${streetOf(d.address)}…`};render();
  let got;try{got=await openLinks(id,links)}catch(e){got={pages:[],blocked:[],photos:0}}finally{delete state.busy['research:'+id]}
  const dd=state.deals[id];if(!dd)return;
  const res=await runAI('research:'+id,`${negName()} is researching ${streetOf(dd.address)}: history, comps and the numbers…`,(ai,signal)=>apiTools(promptResearch(dd,{links,pages:got.pages,blocked:got.blocked}),{signal,model:auto?undefined:(opts.model||bigModel()),maxTokens:auto?6000:9000,tools:auto?WEB_TOOLS(4):undefined}),quiet);
  if(!res)return;let j;try{j=parseLoose(res.text)}catch(e){if(!quiet)toast(aiErr(e),5200);return}
  const d2=state.deals[id];if(!d2)return;
  applyResearch(d2,j,res,got);
  saveDeal(d2);logActivity(id,'info',`${negName()} researched ${streetOf(d2.address)}: ${(j.comps||[]).length} comps, ${(j.history||[]).length} history events${got.photos?`, ${got.photos} photos from the links`:''}.`);
  const fresh=photoCount(d2)>before;
  if(!auto&&!opts.noDeep&&(photoCount(d2)||docCount(d2))&&(fresh||!d2.analysis))await aiDeep(id,true);
  if(auto&&(photoCount(d2)||docCount(d2))&&!d2.analysis)await aiDeep(id,true,secrets().model||'claude-sonnet-5-5');
  if(!quiet&&!opts.noDeep)toast(`Research done${got.photos?` · ${got.photos} photos pulled from the links`:''}.`,4200);
}
function applyResearch(d,j,res,got){
  const f=j.facts||{};for(const k of ['beds','baths','sqft','lotSqft','year']){const v=parseNum(f[k]);if(v!=null&&d[k]==null)d[k]=v}
  const hist=(Array.isArray(j.history)?j.history:[]).map(e=>({date:e.date?isoDay(e.date):'',event:HEV[e.event]?e.event:'other',price:parseNum(e.price),url:String(e.url||''),src:'web'})).filter(e=>e.date&&!isNaN(new Date(e.date)));
  d.history=d.history||[];for(const e of hist)if(!d.history.some(x=>isoDay(x.date)===e.date&&x.event===e.event))d.history.push(e);
  const have=new Set((d.comps||[]).map(x=>normAddr(x.addr)));const comps=(Array.isArray(j.comps)?j.comps:[]).filter(x=>parseNum(x.price)&&x.addr&&!have.has(normAddr(x.addr))&&normAddr(x.addr)!==normAddr(streetOf(d.address)));
  d.comps=(d.comps||[]).concat(comps.slice(0,12).map(x=>({addr:String(x.addr),price:parseNum(x.price),soldDate:x.soldDate?isoDay(x.soldDate):'',sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),dist:parseNum(x.dist),status:COMP_ST[x.status]?x.status:'sold',reno:x.reno===false?false:true,url:String(x.url||''),web:true})));
  const rv=j.rent&&parseNum(j.rent.value);if(rv&&!d.rent)d.rentEst=rv;
  const ra=j.arv&&parseNum(j.arv.value);
  if(ra&&(arvTheirs(d)||!d.arv||['maya','comps'].includes(d.arvSource))){if(arvTheirs(d)&&d.arv)d.wsClaims=Object.assign({},d.wsClaims,{arv:(d.wsClaims||{}).arv??d.arv});
    d.arv=floor500(ra);d.arvSource=(d.comps||[]).length?'comps':'maya';d.arvWhy=String(j.arv.why||'').slice(0,400);
    const g=compGrid(d);const used=g.rows.filter(r=>r.use).length;const gv=g.smart;
    if(used>=3&&gv&&Math.abs(gv-d.arv)/d.arv>0.10){const lo=Math.min(gv,d.arv);d.arvWhy=`${negName()} read ${money(floor500(ra))} from the comps; the comps math (size, beds and baths adjusted, ${used} renovated sales) says ${money(gv)}. Using the lower, ${money(lo)}, to be safe. `+d.arvWhy;d.arv=lo}}
  const sl=j.sellerLowest&&parseNum(j.sellerLowest.price);if(sl&&sl>0){const cur=parseNum((d.wsClaims||{}).accept);if(cur==null||sl<cur||(sl===cur&&!(d.wsClaims||{}).acceptQuote))d.wsClaims=Object.assign({},d.wsClaims,{accept:sl,acceptQuote:String(j.sellerLowest.quote||'').slice(0,200)})}
  d.research={at:nowISO(),summary:String(j.summary||''),claims:(j.claimsCheck||[]).slice(0,12).map(x=>({claim:String(x.claim||''),found:String(x.found||''),verdict:['matches','off','unverified'].includes(x.verdict)?x.verdict:'unverified'})),
    redFlags:(j.redFlags||[]).map(String).slice(0,10),arv:j.arv||null,rent:j.rent||null,couldNotOpen:[...new Set([...(j.couldNotOpen||[]).map(String),...(got.blocked||[]),...(res.failed||[]).map(x=>x.url)])].slice(0,8),
    sources:(res.sources||[]).slice(0,14),searches:res.searches||0,photos:got.photos||0,comps:comps.length,events:hist.length};
}
/* ================= In-depth analysis: Opus 5.5, only when you press it =================
   Photos from the emails and links, then Opus research (history, sold comps, its own ARV, the seller's lowest price),
   then an Opus inspection that prices every repair line with a reason. The numbers update from Maya's own work. */
async function inDepth(id){
  const d=state.deals[id];if(!d)return;if(!aiOn()){toast(aiErr({code:'no_ai'}),5200);return}
  const key='depth:'+id;if(state.busy[key])return;const n=negName();const before=spendBy(1).t;
  const step=l=>{state.busy[key]={label:l};render()};
  try{
    step(`${n} is gathering the photos from the emails and links…`);
    try{await pullDealAttachments(id,true)}catch(e){}
    if(gmailOn()&&dealLinks(state.deals[id]||{}).length){try{await fillFromLinks(id,true,true)}catch(e){}}
    step(`${n} is researching with Opus 5.5: sale history, sold comps and her own ARV…`);
    await researchDeal(id,true,false,{model:'claude-opus-5-5',noDeep:true});
    const pc=photoCount(state.deals[id]||{});
    step(pc?`${n} is inspecting ${pc} photo${pc>1?'s':''} with Opus 5.5 and pricing every repair…`:`${n} has no photos, so she’s estimating repairs from the description with Opus 5.5…`);
    await aiDeep(id,true,'claude-opus-5-5');
  }finally{delete state.busy[key];render()}
  const dd=state.deals[id];if(!dd)return;const c=calc(dd);const errs=state.aiErrs||{};
  const err=errs['research:'+id]||errs['deep:'+id]||null;
  dd.depth={at:nowISO(),arv:dd.arv,arvSource:dd.arvSource,arvWhy:dd.arvWhy||'',rehab:dd.rehab,rehabSource:dd.rehabSource,comps:(dd.comps||[]).filter(x=>x.web).length,photos:photoCount(dd),floor:c.floor,mao:c.mao,opening:c.opening,capByThem:!!c.capByThem,cost:+(spendBy(1).t-before).toFixed(4),err};
  saveDeal(dd);logActivity(id,'info',`${n} finished the in-depth analysis of ${streetOf(dd.address)} (about ${usd(dd.depth.cost)}).`);
  toast(err?`In-depth analysis partly done: ${err}`:`In-depth analysis done (${usd(dd.depth.cost)}). ARV ${money(dd.arv)}, repairs ${money(dd.rehab)}, ceiling ${money(c.mao)}, opening ${money(c.opening)}.`,8000);
}
function depthHTML(d){
  const D=d.depth;const n=esc(negName());const busy=state.busy['depth:'+d.id];if(!D&&!busy)return '';
  const c=calc(d);const comps=(d.comps||[]).filter(x=>x.web).length;
  return `<div class="depth">${busy?busyHTML('depth:'+d.id,false):''}${D?`<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><b>In-depth analysis</b><span class="xs muted">${fmtWhen(D.at)} · Opus 5.5 · cost ${usd(D.cost)}</span></div>
    <ul class="small" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
      <li><b>ARV ${money(d.arv)}</b> ${d.arvSource==='comps'?`from ${comps} sold comp${comps===1?'':'s'} (listed below)`:d.arvSource==='maya'?`${n}’s estimate (few good comps found)`:arvTheirs(d)?'is still the wholesaler’s claim: no usable comps found':'(your number)'}${d.arvWhy?`. ${esc(d.arvWhy)}`:''}${(d.wsClaims||{}).arv&&!arvTheirs(d)?` The wholesaler said ${money(d.wsClaims.arv)}.`:''}</li>
      <li><b>Repairs ${money(d.rehab)}</b> ${d.rehabSource==='maya'?`from ${D.photos?D.photos+' photo'+(D.photos>1?'s':''):'the description (no photos yet)'}, line by line in the inspection below`:rehabTheirs(d)?'is still the wholesaler’s claim':'(your number)'}</li>
      ${c.floor!=null&&(d.wsClaims||{}).accept?`<li><b>They’d take ${money(d.wsClaims.accept)}</b>${d.wsClaims.acceptQuote?`: “${esc(d.wsClaims.acceptQuote)}”`:''}</li>`:''}
      <li><b>Ceiling ${money(c.mao)}</b>${c.capByThem?` (capped at what they’d take; your numbers allow ${money(c.maoNumbers)})`:''} · <b>opening offer ${money(c.opening)}</b></li></ul>
    ${D.err?`<div class="note amber small">Part of it didn’t finish: ${esc(D.err)}</div>`:''}`:''}</div>`;
}
function researchCard(d){
  const R=d.research;const n=esc(negName());const busy=state.busy['research:'+d.id];const links=dealLinks(d);
  const vt={matches:['Matches','green'],off:['Off','red'],unverified:['Unverified','slate']};
  if(!R)return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>She opens the deal’s links, pulls the photos, finds the history and recent sales, and checks every number</p></div><div class="ch-r"><button class="btn primary" data-act="in-depth" ${busy||state.busy['depth:'+d.id]||!aiOn()?'disabled':''}>${ico('spark')}In-depth analysis (Opus)</button></div></div>${busyHTML('research:'+d.id)}${depthHTML(d)}
    ${d.researchSkip==='over'&&overBox(d)?`<p class="small">${n} didn’t research this one on her own: the asking (${money(curList(d))}) is over your ${moneyK(boxCap())} price cap, so it isn’t worth paying for. Press the button if you want it anyway.</p>`:d.researchSkip==='price'?`<p class="small">${n} didn’t research this one on her own: the asking is already well above your ceiling, so it isn’t worth paying for.</p>`:d.researchSkip==='cap'?`<p class="small">${n} already did today’s ${(state.settings.research||{}).dailyMax??3} automatic researches, so this one is in line for tomorrow (newest deals first). Press the button if you want it now.</p>`:d.researchSkip==='address'&&!hasStreet(d)?`<p class="small">${n} will research this once it has a street address (research without one can’t find the history or nearby sales).</p>`:''}
    <p class="small muted">${links.length?`${links.length} link${links.length>1?'s':''} found with this deal${gmailOn()?'':' (connect Gmail so she can open Google Drive photo folders)'}. `:''}In-depth analysis uses Opus 5.5: it pulls the photos, finds the sale history and sold comps for its own ARV, and prices every repair from the photos. It takes a couple of minutes and roughly 50¢–$1; the meter shows the exact cost. Zillow and Realtor.com block robots, so for those she uses web search instead.</p></section>`;
  const arv=R.arv&&parseNum(R.arv.value);
  return `<section class="card" id="research"><div class="card-head"><span class="ci grad">${ico('search')}</span><div><h2>${n}’s research</h2><p>${fmtWhen(R.at)} · ${R.sources.length} source${R.sources.length===1?'':'s'}${R.comps?` · ${R.comps} comps added`:''}${R.events?` · ${R.events} history events`:''}${R.photos?` · ${R.photos} photos`:''}</p></div><div class="ch-r"><button class="btn sm primary" data-act="in-depth" ${busy||state.busy['depth:'+d.id]?'disabled':''}>${ico('spark')}In-depth analysis (Opus)</button></div></div>${busyHTML('research:'+d.id)}${depthHTML(d)}
  ${R.summary?`<p>${esc(R.summary)}</p>`:''}
  ${arv?`<div class="row"><span class="chip">${n}’s ARV view <b>${money(arv)}</b>${R.arv.low?` (${moneyK(R.arv.low)}–${moneyK(R.arv.high)})`:''}</span>${R.arv.why?`<span class="small muted">${esc(R.arv.why)}</span>`:''}</div>`:''}
  ${R.claims.length?`<div class="tbl-wrap"><table class="tbl" style="min-width:620px"><thead><tr><th>They say</th><th>${n} found</th><th>Verdict</th></tr></thead><tbody>${R.claims.map(x=>`<tr style="cursor:default"><td>${esc(x.claim)}</td><td>${esc(x.found)}</td><td><span class="tag ${vt[x.verdict][1]}">${vt[x.verdict][0]}</span></td></tr>`).join('')}</tbody></table></div>`:''}
  ${R.redFlags.length?`<div class="note red"><b>Red flags:</b> ${R.redFlags.map(esc).join(' · ')}</div>`:''}
  ${R.couldNotOpen.length?`<p class="xs muted">Couldn’t open: ${R.couldNotOpen.map(u=>esc(u.replace(/^https?:\/\//,'').slice(0,60))).join(' · ')}. Paste the page text into the listing if it matters.</p>`:''}
  ${R.sources.length?`<details id="rs-src"><summary>Sources (${R.sources.length})</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${R.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title||s.url).slice(0,90))}</a></li>`).join('')}</ul></details>`:''}
  <p class="xs muted">Comps and history found online are marked as such. Check the important ones before you rely on them.</p></section>`;
}
/* new wholesaler deals get researched one at a time in the background */
const RQ={list:[],running:false};
function queueResearch(id){if(WORKER.on)return;/* web research is slow; the next device that opens does it */if(!RQ.list.includes(id))RQ.list.push(id);drainResearch()}
async function drainResearch(){if(RQ.running)return;RQ.running=true;try{while(RQ.list.length){const id=RQ.list.shift();if(state.deals[id])await researchDeal(id,true,true)}}finally{RQ.running=false}}
function askPhotosDraft(id){
  const d=state.deals[id];const a=d&&d.analysis;if(!a)return;const miss=(a.notSeen||[]).slice(0,6);if(!miss.length)return;
  const who=firstName(d);const n=state.settings.neg;const p=state.settings.profile;
  const body=`Hi ${who},\n\nThanks for sending ${streetOf(d.address)}. Before we put numbers on it, could you send photos of: ${miss.join(', ')}? That's what we need to price the repairs properly.\n\nThanks,\n${n.name}\n${n.title||'Acquisitions Manager'}${p.company?', '+p.company:''}${p.phone?'\n'+p.phone:''}`;
  setDraft(id,{kind:'custom',action:'custom',price:null,email:{subject:`Photos for ${streetOf(d.address)}?`,body},sms:`Hi ${who}, could you send photos of ${miss.slice(0,3).join(', ')} for ${streetOf(d.address)}? Thanks – ${n.name}`,why:`${negName()} couldn’t see these in the photos: ${miss.join(', ')}.`});
  state.mayaTab='chat';toast('Draft ready in the panel on the right.');
}

/* ================= market data (Redfin, refreshed weekly by a GitHub job) ================= */
const MKT_BASES=['https://raw.githubusercontent.com/ItzEzi/offerdesk/data/market/','market/'];
const MKT={idx:null,idxAt:0,base:null,states:{},loading:{},failed:{}};
async function mktFetch(path){
  const bases=MKT.base?[MKT.base]:MKT_BASES;
  for(const b of bases){try{const r=await fetch(b+path,{cache:'no-cache'});if(r.ok){const j=await r.json();MKT.base=b;return j}}catch(e){}}
  return null;
}
async function marketIndex(){
  if(MKT.idx&&Date.now()-MKT.idxAt<6*3600e3)return MKT.idx;
  if(!MKT.idx&&MKT.idxFail&&Date.now()-MKT.idxFail<30*60e3)return null;
  const j=await mktFetch('index.json?d='+isoDay());if(j){MKT.idx=j;MKT.idxAt=Date.now()}else MKT.idxFail=Date.now();return MKT.idx;
}
async function loadMarketState(st){
  st=String(st||'').toUpperCase();if(!/^[A-Z]{2}$/.test(st))return null;
  if(MKT.states[st])return MKT.states[st];if(MKT.failed[st]&&Date.now()-MKT.failed[st]<30*60e3)return null;
  if(MKT.loading[st])return MKT.loading[st];
  MKT.loading[st]=(async()=>{const idx=await marketIndex();const f=idx&&idx.files&&idx.files[st];if(!f){MKT.failed[st]=Date.now();return null}
    const zips=await mktFetch(f.zips+'?v='+encodeURIComponent(idx.redfinUpdated||idx.updated||''));const metros=f.metros?await mktFetch(f.metros+'?v='+encodeURIComponent(idx.updated||'')):null;
    if(!zips){MKT.failed[st]=Date.now();return null}MKT.states[st]={zips,metros};return MKT.states[st]})().finally(()=>{delete MKT.loading[st]});
  return MKT.loading[st];
}
function zipOf(d){const m=String(d.zip||'').match(/\d{5}/)||String(d.address||'').match(/\b(\d{5})(?:-\d{4})?\b\s*$/);return m?m[0].slice(0,5):null}
function stateOf(d){const zs=zipState(zipOf(d));if(zs)return zs;const s=String(d.state||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(s)?s:null}
function marketFor(d){const st=stateOf(d),z=zipOf(d);if(!st||!z)return null;const S=MKT.states[st];if(!S||!S.zips||!S.zips.zips)return null;const Z=S.zips.zips[z];if(!Z)return {none:true,zip:z,state:st,S};
  const metro=Z.metro&&S.metros&&S.metros.metros?S.metros.metros[Z.metro]:null;return {zip:z,state:st,Z,metro,S}}
async function ensureMarket(d){if(!d)return;const st=stateOf(d);if(!st||MKT.states[st])return;const r=await loadMarketState(st);if(r){const m=marketFor(d);if(m&&m.Z&&m.Z.l&&m.Z.l.dom!=null&&d.zipAvgDom==null&&d.zipDomAuto!==m.Z.l.dom){d.zipDomAuto=m.Z.l.dom;saveDeal(d,true)}render()}}
const zipDom=d=>d.zipAvgDom??d.zipDomAuto??null;
function marketFacts(d){
  const m=marketFor(d);if(!m||!m.Z)return '';const l=m.Z.l||{};const S=m.S.zips;
  const yo=v=>v==null?'':` (${v>=0?'+':''}${Math.round(v*10)/10}% a year)`;
  return `ZIP ${m.zip} market, single-family homes (Redfin, 3 months to ${S.periodEnd||'latest'}): median sale ${money(l.price)}${yo(l.priceYoy)}, ${l.ppsf?'$'+Math.round(l.ppsf)+'/sqft':'?'}${yo(l.ppsfYoy)}, median ${l.dom??'?'} days on market, sale-to-list ${l.stl!=null?l.stl+'%':'?'}, ${l.mos!=null?l.mos+' months of supply':'supply unknown'}, ${l.sold??'?'} sold${l.pdPct!=null?`, ${Math.round(l.pdPct)}% of active listings had a price drop`:''}.`;
}
function mktTone(l){if(l.mos==null)return null;return l.mos<3?['Seller’s market','green']:l.mos<=6?['Balanced market','blue']:['Buyer’s market','orange']}
function spark(vals,cls){const v=(vals||[]).map(x=>x==null?null:+x);const f=v.filter(x=>x!=null);if(f.length<2)return '';const lo=Math.min(...f),hi=Math.max(...f),W=120,H=30;const X=i=>i/(v.length-1)*W,Y=x=>H-3-(hi===lo?.5:(x-lo)/(hi-lo))*(H-6);
  let p='';v.forEach((x,i)=>{if(x==null)return;p+=(p?'L':'M')+X(i).toFixed(1)+','+Y(x).toFixed(1)});return `<svg class="spark ${cls||''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${p}"/></svg>`}
function marketCard(d,c){
  const st=stateOf(d),z=zipOf(d);if(!st||!z)return '';const m=marketFor(d);
  if(!m){return MKT.failed[st]?'':`<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Loading Redfin data…</p></div></div></section>`}
  if(m.none)return `<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Redfin has no single-family data for this ZIP</p></div></div></section>`;
  const l=m.Z.l||{},s=m.Z.s||{},S=m.S.zips;const tone=mktTone(l);
  const k=(lab,val,sub,sp,cls)=>`<div class="kpi ${cls||''}"><span class="lab">${lab}</span><span class="val">${val}</span>${sub?`<span class="sub">${sub}</span>`:''}${sp||''}</div>`;
  const yy=v=>v==null?'':`<span style="color:${v>=0?'var(--t-green)':'var(--t-red)'}">${v>=0?'+':''}${(Math.round(v*10)/10)}% YoY</span>`;
  let arvNote='';
  if(c.ready&&d.sqft&&l.ppsf){const a=c.A/d.sqft;const r=a/l.ppsf-1;arvNote=`<div class="note ${r>.45?'red':r<-.05?'amber':'green'}">Your ARV is <b>$${Math.round(a)}/sqft</b>, ${r>=0?Math.round(r*100)+'% above':Math.round(-r*100)+'% below'} this ZIP’s median sale ($${Math.round(l.ppsf)}/sqft). ${r>.45?'That’s optimistic: renovated homes usually sell 10–35% above the median. Back it with strong comps.':r<-.05?'That’s below the median, which is conservative for a renovated house. Check your comps; you may be leaving room.':'That fits a renovated house in this ZIP.'}</div>`}
  const mt=m.metro;const wk=mt&&mt.l;
  return `<section class="card" id="market"><div class="card-head"><span class="ci teal">${ico('trend')}</span><div><h2>ZIP ${esc(z)} market</h2><p>Single-family homes · Redfin, 3 months to ${esc(S.periodEnd||'')} · ${esc(m.Z.metro||'')}</p></div><div class="ch-r">${tone?`<span class="pill ${tone[1]}">${tone[0]}</span>`:''}</div></div>
  <div class="kpis">${k('Median sale price',money(l.price),yy(l.priceYoy),spark(s.price,'blue'))}${k('Price per sqft',l.ppsf?'$'+Math.round(l.ppsf):'—',yy(l.ppsfYoy),spark(s.ppsf,'blue'))}${k('Median days on market',l.dom!=null?l.dom+' days':'—',l.stl!=null?`Sale-to-list ${l.stl}%`:'',spark(s.dom,'amber'))}${k('Months of supply',l.mos!=null?l.mos:'—',`${l.sold??'—'} sold · ${(l.inv??l.active)??'—'} for sale${l.pdPct!=null?` · ${Math.round(l.pdPct)}% cut price`:''}`,spark(s.mos,'amber'))}</div>
  ${arvNote}
  ${wk?`<p class="small muted"><b>${esc(m.Z.metro)}</b>, last 4 weeks (updated ${esc(mt.periodEnd||'')}): median sale ${money(wk.price)}${wk.priceYoy!=null?` (${wk.priceYoy>=0?'+':''}${Math.round(wk.priceYoy*10)/10}% YoY)`:''}, ${wk.dom??'?'} days on market, pending sales ${wk.pendYoy!=null?(wk.pendYoy>=0?'+':'')+Math.round(wk.pendYoy)+'% YoY':'—'}, new listings ${wk.newYoy!=null?(wk.newYoy>=0?'+':'')+Math.round(wk.newYoy)+'% YoY':'—'}.</p>`:''}
  <p class="xs muted">Redfin publishes ZIP data monthly and metro data weekly; OfferDesk checks for new data every week.</p></section>`;
}
/* market-based risk adjustments for the deal score */
function marketMods(d,c){const m=marketFor(d);if(!m||!m.Z)return [];const l=m.Z.l||{};const out=[];
  if(l.mos!=null&&l.mos>=6)out.push([`Slow ZIP: ${l.mos} months of supply`,-5]);
  if(l.priceYoy!=null&&l.priceYoy<=-5)out.push([`ZIP prices down ${Math.round(-l.priceYoy)}% in a year`,-4]);
  if(c.ready&&d.sqft&&l.ppsf&&c.A/d.sqft>l.ppsf*1.45)out.push(['ARV far above the ZIP’s $/sqft',-6]);
  return out}

/* ================= Maya's morning brief ================= */
/* The app works out what matters; the Google script emails it every morning (even with no device open). */
function buildBrief(){
  const ds=Object.values(state.deals).filter(d=>!d.example&&!['dead','closed'].includes(d.stage));const now=Date.now();
  const a=d=>streetOf(d.address)||'Untitled deal';const k=counts();
  const needs=ds.filter(d=>d.needsYou&&draftOpen(d)).map(d=>({id:d.id,addr:a(d),why:d.needsYou,their:lastTheirPrice(d),draft:d.draft.price??null}));
  const replies=ds.filter(d=>replyWaiting(d)&&!(d.needsYou&&draftOpen(d))).map(d=>({id:d.id,addr:a(d),at:lastAt(ins(d)),their:lastTheirPrice(d)}));
  const follow=ds.filter(d=>{const f=followDue(d);return f&&f.overdue&&!(d.autopilot&&state.settings.auto.enabled)}).map(d=>({id:d.id,addr:a(d),step:followDue(d).step+1}));
  const scored=ds.map(d=>{const S=dealScore(d,null,true);return S?{d,S}:null}).filter(Boolean).sort((x,y)=>y.S.score-x.S.score);
  const top=scored.filter(x=>x.S.score>=65||(x.S.at80&&x.S.at80>=x.S.basis*.85)).slice(0,5).map(({d,S})=>({id:d.id,addr:a(d),score:S.score,grade:S.grade[0],best:STRAT_LABEL[S.best],basis:S.basis,at80:S.at80,source:d.source}));
  const newDeals=ds.filter(d=>now-new Date(d.created).getTime()<=36*3600e3).map(d=>{const S=dealScore(d);return {id:d.id,addr:a(d),src:d.source==='wholesaler'?(d.wholesalerName||'wholesaler'):'listing',asking:curList(d),score:S?S.score:null}});
  const drops=ds.filter(d=>{const h=d.priceHistory||[];return h.length>1&&h[h.length-1].price<h[h.length-2].price&&now-new Date(h[h.length-1].date).getTime()<=8*DAY}).map(d=>{const h=d.priceHistory;return {id:d.id,addr:a(d),from:h[h.length-2].price,to:h[h.length-1].price}});
  const contract=ds.filter(d=>d.stage==='contract').map(d=>({id:d.id,addr:a(d)}));
  const agents=[...new Set(ds.filter(d=>ourCount(d)&&d.agent&&d.agent.email).map(d=>d.agent.email.trim().toLowerCase()))].slice(0,60);
  const statsLine=`${k.live} live offers · ${k.auto} on autopilot · ${contract.length} under contract`;
  return {at:nowISO(),neg:negName(),url:ONLINE_URL,needs,replies,follow,top,newDeals,drops,contract,agents,statsLine};
}
async function pushBrief(force){
  if(!cloudOn())return false;const b=buildBrief();const h=hashOf(Object.assign({},b,{at:0}));const c=cm();
  if(!force&&c.h.brief===h&&Date.now()-(c.briefAt||0)<6*3600e3)return true;
  for(let i=0;i<2;i++){
    const r=await bridge('cloud_put',{parts:{brief:{base:c.revs.brief||0,data:{t:Date.now(),v:b}}}},c.acct);
    if(r.revs&&r.revs.brief){c.revs.brief=r.revs.brief;c.h.brief=h;c.briefAt=Date.now();saveCM();return true}
    if(r.conflicts&&r.conflicts.brief!=null)c.revs.brief=r.conflicts.brief;else break;
  }
  return false;
}
function briefTo(){return ((state.settings.notify||{}).email||state.settings.profile.email||'').trim()}
async function briefSync(){
  const B=state.settings.brief||{};if(!cloudOn())return;
  const want=JSON.stringify({on:!!B.on,hour:B.hour??8,tz:B.tz||Intl.DateTimeFormat().resolvedOptions().timeZone,email:briefTo()});
  if(cm().briefSetup===want)return;
  try{const r=await bridge('brief_setup',JSON.parse(want),cm().acct);if(r.ok){cm().briefSetup=want;saveCM()}}catch(e){logActivity(null,'warn','Couldn’t schedule the morning brief: '+bridgeErr(e))}
}
function briefCardHTML(){
  const b=buildBrief();const n=esc(negName());const B=state.settings.brief||{};
  const li=(x,t)=>`<li><a href="#deal/${x.id}">${esc(x.addr)}</a>${t?` <span class="muted">· ${t}</span>`:''}</li>`;
  const parts=[];
  if(b.top.length)parts.push(`<div><b>Worth a look</b><ul>${b.top.map(x=>li(x,`score ${x.score} (${esc(x.best)})${x.at80&&x.at80<x.basis?` · 80+ at ${moneyK(x.at80)}`:''}`)).join('')}</ul></div>`);
  if(b.newDeals.length)parts.push(`<div><b>New since yesterday</b><ul>${b.newDeals.slice(0,5).map(x=>li(x,`${esc(x.src)}${x.score!=null?` · score ${x.score}`:''}`)).join('')}</ul></div>`);
  if(b.drops.length)parts.push(`<div><b>Price drops this week</b><ul>${b.drops.slice(0,5).map(x=>li(x,`${moneyK(x.from)} → ${moneyK(x.to)}`)).join('')}</ul></div>`);
  const sched=!cloudOn()?`Turn on <a href="#settings/connections/conn-cloud">cloud save</a> and ${n} emails this to you every morning, even when no device is open.`:B.on?`${n} emails this to ${esc(briefTo()||'you')} every day at ${B.hour??8}:00.`:`The morning email is off (Settings → ${n} & you).`;
  return `<section class="card" id="brief"><div class="card-head"><span class="ci amber">${ico('spark')}</span><div><h2>${n}’s morning brief</h2><p>${esc(b.statsLine)}</p></div>${cloudOn()&&briefTo()?`<div class="ch-r"><button class="btn sm" data-act="brief-test" ${state.busy.brief?'disabled':''}>${ico('mail')}Email it to me now</button></div>`:''}</div>
  ${busyHTML('brief',false)}
  ${parts.length?`<div class="brief-cols">${parts.join('')}</div>`:`<p class="small muted">Nothing stands out yet. As deals come in, the best-scoring ones, new deals and price drops show up here.</p>`}
  <p class="xs muted">${sched}</p></section>`;
}
function briefSettingsHTML(){
  const B=state.settings.brief||{};const n=esc(negName());const tz=B.tz||Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `<section class="card" id="brief-settings"><div class="card-head"><span class="ci amber">${ico('clock')}</span><div><h2>Morning brief</h2><p>${n} emails you what needs attention and the deals worth a look</p></div><div class="ch-r">${switchHTML(!!B.on,'brief-toggle',null,'Morning brief')}</div></div>
  <div class="grid-fields"><label class="field"><span>Send at</span><select class="input" id="st-brief-hour" data-fs="brief.hour" data-t="num">${Array.from({length:24},(_,h)=>`<option value="${h}" ${(B.hour??8)===h?'selected':''}>${(h%12||12)+':00 '+(h<12?'AM':'PM')}</option>`).join('')}</select></label><label class="field"><span>Time zone</span><input class="input" id="st-brief-tz" data-fs="brief.tz" data-t="text" value="${esc(B.tz||'')}" placeholder="${esc(tz)}"></label></div>
  <p class="small muted">${!cloudOn()?`Needs cloud save (Connect → Cloud save): your Google script reads your desk from Drive and sends the email even when no device is open.`:briefTo()?`Goes to ${esc(briefTo())} (the email in “${n} pings you”). It also checks your Gmail for agent replies that came in overnight.`:`Add your email in “${n} pings you” above.`}</p></section>`;
}

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
  const sig=[n.name,n.title||'Acquisitions Manager'].filter(Boolean).join('\n');
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
  if(!gmailOn()||!aiOn()||approveMode())return 0;let sent=0;
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
  return `<div class="wrap page">${head}${approveMode()?`<div class="note amber">${ico('shield')} You press Send is on (Connect → Autopilot), so campaigns don’t send anything. Turn it off when you want campaigns to run.</div>`:''}${tabs}${cpEditorHTML(c)}</div>`;
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

/* ---- Maya 24/7 entry point: one run of the same work an open device does every few minutes ---- */
function toast() {}
function render() {}
function doRender() {}
function go() {}
function cloudBits() {}
function deviceLabel() { return 'Maya 24/7 (your Gmail script)'; }
function workerNextDue() {
  let t = Infinity; const now = Date.now();
  if (state.settings.auto.enabled && state.settings.auto.followUps) for (const d of Object.values(state.deals)) { if (!d.autopilot || d.example) continue; const f = followDue(d); if (f && f.due < t) t = f.due; }
  for (const c of cpList()) {
    const q = c.items.filter(i => i.status === 'queued'); if (c.status !== 'running' || !q.length) continue;
    t = Math.min(t, q.some(i => cpCanSendNow(c, i)) ? Math.max(now + 60e3, cpNextSlot(c)) : now + 30 * 60e3);
  }
  return isFinite(t) ? Math.max(t, now + 60e3) : null;
}
async function workerRun(cfg) {
  const t0 = Date.now(); const since = new Date(t0).toISOString();
  WORKER.on = true; WORKER.deadline = cfg.deadline || t0 + 270e3;
  const out = { ok: false, at: since, sent: 0, replies: 0, needs: 0, campaign: 0, imported: 0, warn: [], skipped: '' };
  try {
    localStorage.setItem(SECRET_KEY, JSON.stringify({ accounts: [{ id: cfg.acct, url: cfg.url }], bridgeKey: cfg.key }));
    localStorage.setItem(SYNC_KEY, JSON.stringify({ on: true, acct: cfg.acct }));
    CM = null; cloudBaseline();
    if (!(await cloudSync())) throw new Error('cloud sync failed: ' + (CM.err || 'unknown'));
    state.loaded = true;
    if (!Object.keys(state.deals).length && !cpList().length) { out.skipped = 'no deals yet'; out.ok = true; return out; }
    if (!(await cloudLease())) { const L = CM.lease || {}; out.skipped = 'active device: ' + (L.label || 'another device'); out.ok = true; return out; }
    const before = Object.keys(state.deals).length;
    if (gmailOn() && state.settings.conn.autoCheck !== false && !timeUp()) await syncAll(false);
    if (state.settings.auto.enabled && aiOn() && !timeUp()) await autopilotRun(false);
    if (!timeUp() && cpList().some(c => c.status === 'running')) out.campaign = await campaignTick();
    try { await pushBrief(); } catch (e) {}
    const acts = state.activity.filter(a => a.at >= since);
    out.sent = acts.filter(a => a.kind === 'sent').length; out.replies = acts.filter(a => a.kind === 'reply').length; out.needs = acts.filter(a => a.kind === 'needs').length;
    out.warn = acts.filter(a => a.kind === 'warn').map(a => a.text).slice(0, 5); out.imported = Math.max(0, Object.keys(state.deals).length - before);
    out.nextDue = workerNextDue();
    state.conn.worker = { at: nowISO(), sent: out.sent, replies: out.replies, needs: out.needs, campaign: out.campaign, imported: out.imported, nextDue: out.nextDue };
    saveConn(); flushAll(); await cloudSync();
    try { await bridge('lease', { device: DEVICE_ID, release: true }, CM.acct); } catch (e) {}
    out.ok = true;
  } catch (e) { out.warn.push(String((e && (e.message || e.code)) || e)); }
  finally { WORKER.on = false; __timers.length = 0; }
  return out;
}

return {run:workerRun,version:APP_V};
}
