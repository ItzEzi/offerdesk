/* ================= Research pack: fills Ezra's own research workbook from public data ================= */
/* He stars metros on Markets. OfferDesk then fills the workbook's ZIPs, Metros (jobs, population), Listing Watch,
   Flip Candidates and Competition tabs. Cells it fills are light blue and tagged "Auto (OfferDesk)", so rows he edits
   himself are never overwritten. The workbook template lives next to the app (research-template.xlsx). */
const RS_TPL='research-template.xlsx';
const EXCELJS_URL='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const RS_TAG='Auto (OfferDesk)';
const RS_CAP=40;/* listings watched per metro */
const RS_CAND_CAP=25;/* flip candidates kept per metro */
function rsSt(){const r=state.research=state.research||{};r.listings=r.listings||{};r.cands=r.cands||{};r.flipZ=r.flipZ||{};r.comp=r.comp||{};r.imports=r.imports||[];return r}
function saveResearch(quiet){persist('research');if(!quiet)render()}
const rsMetros=()=>mkTargets().filter(t=>t.type==='metro');
const rsZipsPer=()=>{const n=+(mkSet().rsZips||6);return Math.max(1,Math.min(15,n||6))};
function rsZipsFor(key,n){
  const R=DISC.data?mkCompute():null;const m=R&&R.byKey[key];
  const zs=m?m.zips.slice():Object.values(DISC.byZip).filter(o=>o.mk===key&&o.price).sort((a,b)=>(b.sold||0)-(a.sold||0));
  return zs.slice(0,n||rsZipsPer());
}
/* county jobs and population for the ZIPs he is researching (weighted by sales), not the whole metro:
   a metro's booming suburbs can hide a shrinking city where the cheap houses are */
function rsMetroFacts(key){
  let wj=0,sj=0,wp=0,sp=0;const zs=rsZipsFor(key);
  for(const o of (zs.length?zs:Object.values(DISC.byZip).filter(o=>o.mk===key))){const w=Math.max(1,o.sold||1);const j=jobOf(o);if(j!=null){sj+=j*w;wj+=w}if(o.cPopG!=null){sp+=o.cPopG*w;wp+=w}}
  return {job:wj?sj/wj:null,popG:wp?sp/wp:null};
}
const rsDay=d=>{const x=d?new Date(d):new Date();return isNaN(x)?null:x.toISOString().slice(0,10)};
const rsDaysAgo=n=>rsDay(Date.now()-n*864e5);
/* Redfin writes sold dates like "September-15-2026"; also accept 9/15/2026 and 2026-09-15. Returns YYYY-MM-DD without time-zone shifts. */
const RS_MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function rsParseDate(s){
  s=String(s||'').trim();if(!s)return null;const p2=n=>String(n).padStart(2,'0');let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if((m=s.match(/^([A-Za-z]{3})[a-z]*[-\s.]+(\d{1,2}),?[-\s]+(\d{4})$/))&&RS_MON[m[1].toLowerCase()])return `${m[3]}-${p2(RS_MON[m[1].toLowerCase()])}-${p2(m[2])}`;
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)))return `${m[3].length===2?'20'+m[3]:m[3]}-${p2(m[1])}-${p2(m[2])}`;
  return rsDay(s);
}
const rsKey=(addr,zip)=>normAddr(addr)+'|'+zip;

/* ---- Redfin downloads: for sale (incl. pending) and sold ---- */
function rsImportText(text,name){
  const R=rsSt();const metros=new Set(rsMetros().map(t=>t.key));const today=rsDay();
  const recs=csvRecords(text);const M=mkSet();const maxP=+M.maxPrice||null;
  const rep={file:name,at:nowISO(),forSale:0,sold:0,added:0,updated:0,cands:0,skipped:0,outside:0};
  const seenZips=new Set(),seenKeys=new Set();const fresh=[];const fz={};/* per ZIP in this file: sales in the last year, and how many look like flips */
  const per={};for(const L of Object.values(R.listings))per[L.metro]=(per[L.metro]||0)+1;
  const chosen={};for(const k of metros)chosen[k]=new Set(rsZipsFor(k).map(o=>o.z));
  for(const o of recs){
    const addr=col(o,['address','street address','property address']);const zip=(col(o,['zip or postal code','zip','zip code','postal code']).match(/\d{5}/)||[''])[0];
    if(!addr||!zip){rep.skipped++;continue}
    const z=DISC.byZip[zip];const mk=z&&z.mk;
    if(!mk||!metros.has(mk)){rep.outside++;continue}
    const st=csvStatus(o);const price=parseNum(col(o,['price','sold price','list price']));const sqft=parseNum(col(o,['square feet','sqft','sq ft']));
    const url=col(o,['url']);const rec={metro:mk,zip,addr:addr.trim(),city:col(o,['city']),url:/^https?:\/\//.test(url)?url:'',beds:parseNum(col(o,['beds'])),baths:parseNum(col(o,['baths'])),
      sqft,year:parseNum(col(o,['year built'])),dom:parseNum(col(o,['days on market']))};
    const key=rsKey(addr,zip);
    if(st==='sold'){
      rep.sold++;const soldOn=rsParseDate(col(o,['sold date','sale date','close date']));
      const L=R.listings[key];if(L&&L.status!=='Sold'){L.status='Sold';L.soldOn=soldOn;L.soldPrice=price;L.lastSeen=today;rep.updated++}
      /* likely renovated resale: an older house that sold well above its ZIP's typical $/sqft in the last year */
      const zp=z.ppsf;const pp=price&&sqft?price/sqft:null;
      /* some MLSs (Columbia, SC) leave the sold date out of downloads; the Sold links only search the last year, so an undated sale counts as recent */
      const inYr=soldOn?soldOn>=rsDaysAgo(365):true;
      if(inYr&&price&&sqft>=600)(fz[zip]=fz[zip]||{s:0,c:0}).s++;
      if(zp&&pp&&sqft>=600&&(rec.year||0)<=1995&&pp>=zp*1.25&&inYr){fz[zip].c++;
        const had=R.cands[key];R.cands[key]=Object.assign(had||{at:today},{...rec,soldOn,soldPrice:price,zipPpsf:zp,prem:pp/zp-1});if(!had)rep.cands++;
      }
      continue;
    }
    rep.forSale++;seenZips.add(zip);seenKeys.add(key);
    const status=st==='pending'?'Pending':'Active';
    const L=R.listings[key];
    if(L){
      if(price&&price!==L.price){if(price<L.price)L.cuts=(L.cuts||0)+1;L.price=price}
      if(status==='Pending'&&L.status!=='Pending'&&!L.pendingOn)L.pendingOn=today;
      if(L.status!=='Sold')L.status=status;L.lastSeen=today;rep.updated++;
    }else if(!maxP||!price||price<=maxP*1.15)fresh.push({key,rec,price,status,inChosen:chosen[mk]&&chosen[mk].has(zip)});
  }
  /* new listings: the ones in your chosen ZIPs and the newest first, up to the cap per metro */
  fresh.sort((a,b)=>(b.inChosen-a.inChosen)||((a.rec.dom??999)-(b.rec.dom??999)));
  for(const f of fresh){
    if((per[f.rec.metro]||0)>=RS_CAP)continue;per[f.rec.metro]=(per[f.rec.metro]||0)+1;
    R.listings[f.key]={...f.rec,list0:f.price,price:f.price,listedOn:f.rec.dom!=null?rsDaysAgo(f.rec.dom):today,status:f.status,pendingOn:f.status==='Pending'?today:null,firstSeen:today,lastSeen:today};
    rep.added++;
  }
  /* a watched listing missing from a fresh download of its ZIP went off the market (pending, sold or withdrawn) */
  if(rep.forSale)for(const [k,L] of Object.entries(R.listings)){if(L.status==='Active'&&seenZips.has(L.zip)&&!seenKeys.has(k)){L.status='Off market';L.goneOn=today;rep.updated++}}
  /* the true count, before the cap: each ZIP's latest sold download replaces its old count (a stray row or two from a neighbouring ZIP doesn't) */
  for(const [zz,v] of Object.entries(fz)){const old=R.flipZ[zz];if(!old||v.s>=20||v.s>=old.s)R.flipZ[zz]={s:v.s,c:v.c,at:today}}
  /* keep the strongest flip candidates per metro */
  const byM={};for(const [k,c] of Object.entries(R.cands))(byM[c.metro]=byM[c.metro]||[]).push([k,c]);
  for(const list of Object.values(byM)){list.sort((a,b)=>(b[1].prem||0)-(a[1].prem||0));for(const [k] of list.slice(RS_CAND_CAP))delete R.cands[k]}
  R.imports.unshift(rep);R.imports=R.imports.slice(0,30);
  return rep;
}
async function rsImportFiles(files){
  if(!rsMetros().length){toast('Star at least one metro first.');return}
  let tot={forSale:0,sold:0,added:0,cands:0,outside:0};
  for(const f of files){const text=await f.text();const r=rsImportText(text,f.name||'download.csv');for(const k in tot)tot[k]+=r[k]||0}
  saveResearch();
  if(!tot.forSale&&!tot.sold){toast(tot.outside?`Those listings aren’t in your starred metros. Star the metro first, or download its ZIPs.${rsMetros().some(t=>mkIsTh(t.key)!==(mkPtype()==='th'))?` If they’re for ${mkPtype()==='th'?'a houses':'a rowhouse'} metro, switch Home type on Markets first.`:''}`:'No listings found in that file. Use Redfin’s “Download All”.',6200);return}
  toast(`Read ${tot.forSale} for sale and ${tot.sold} sold. ${tot.added} new listings watched${tot.cands?`, ${tot.cands} new flip candidates`:''}.${tot.outside?` ${tot.outside} were outside your metros.`:''}`,6200);
}
/* flips found in his sold downloads for a metro: total (not capped) and per 100 sales in the last year */
function rsFlips(key){
  const R=rsSt();let s=0,c=0,n=0;
  for(const [z,v] of Object.entries(R.flipZ)){const o=DISC.byZip[z];if(!o||o.mk!==key)continue;s+=v.s;c+=v.c;n++}
  return n&&s?{sales:s,found:c,per100:c/s*100,zips:n}:null;
}
function rsSummary(key){
  const R=rsSt();const L=Object.values(R.listings).filter(x=>x.metro===key);const C=Object.values(R.cands).filter(x=>x.metro===key);
  const by=s=>L.filter(x=>x.status===s).length;
  const dtp=L.filter(x=>x.pendingOn&&x.listedOn).map(x=>(new Date(x.pendingOn)-new Date(x.listedOn))/864e5);
  return {n:L.length,active:by('Active'),pending:by('Pending'),sold:by('Sold'),gone:by('Off market'),cuts:L.filter(x=>x.price<x.list0).length,dtp:dtp.length?median(dtp):null,cands:C.length,flip:rsFlips(key),comp:R.comp[key]};
}

/* ---- Maya counts the "we buy houses" companies ---- */
async function rsCompetition(){
  const ms=rsMetros();if(!ms.length){toast('Star at least one metro first.');return}
  if(!aiOn()){toast(aiErr({code:'no_ai'}),5200);return}
  const R=rsSt();let done=0;
  await runAI('rs-comp',`${negName()} is searching for “we buy houses” companies…`,async(ai,signal)=>{
    for(const t of ms){
      const label=mkLabel(t.key);const cities=[...new Set(rsZipsFor(t.key,8).map(o=>o.city).filter(Boolean))].slice(0,4).join(', ');
      state.busy['rs-comp'].label=`${negName()} is searching ${label} (${done+1} of ${ms.length})…`;render();
      const prompt=`Count the competition for a house flipper in the ${label} metro area${cities?` (cities: ${cities})`:''}.
Use web search to find companies and investors that advertise buying houses for cash there: searches like "we buy houses ${label.split(',')[0]}", "sell my house fast ${label.split(',')[0]}", "cash home buyers ${label.split(',')[0]}". Look at ads and listings too.
List each distinct company once. Only include companies you actually saw in the results, with the page you saw them on. Mark local = true if they are based in or focused on this area, false for national franchises or lead sites.
Reply with only JSON: {"companies":[{"name":"","url":"","local":true}],"note":"one sentence on how crowded it looks"}`;
      const res=await apiTools(prompt,{signal,maxTokens:4000});
      let j;try{j=parseLoose(res.text)}catch(e){continue}
      const seen=new Set();const list=[];
      for(const c of [].concat(j.companies||[])){const nm=String(c&&c.name||'').trim();if(!nm||seen.has(nm.toLowerCase()))continue;seen.add(nm.toLowerCase());list.push({name:nm.slice(0,80),url:/^https?:\/\//.test(c.url||'')?String(c.url).slice(0,300):'',local:c.local===true?'Y':c.local===false?'N':''})}
      R.comp[t.key]={at:nowISO(),n:list.length,companies:list.slice(0,60),note:String(j.note||'').slice(0,300),sources:(res.sources||[]).slice(0,10)};
      done++;saveResearch(true);
    }
  });
  render();if(done)toast(`${negName()} counted the competition in ${done} metro${done>1?'s':''}.`);
}

/* ---- the workbook (ExcelJS, loaded only when needed) ---- */
let EXCELJS_P=null;
function loadExcelJS(){
  if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
  if(EXCELJS_P)return EXCELJS_P;
  EXCELJS_P=new Promise((res,rej)=>{const s=document.createElement('script');s.src=EXCELJS_URL;s.onload=()=>window.ExcelJS?res(window.ExcelJS):rej(new Error('lib'));s.onerror=()=>{EXCELJS_P=null;rej(new Error('lib'))};document.head.appendChild(s)});
  return EXCELJS_P;
}
const RS_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFDDEBF7'}};
const xv=c=>{const v=c.value;if(v&&typeof v==='object'&&!(v instanceof Date)){if(v.richText)return v.richText.map(t=>t.text).join('');if('text' in v)return v.text;if('result' in v)return v.result;if('formula' in v)return null}return v};
const xs=c=>{const v=xv(c);return v==null?'':String(v).trim()};
const xDate=s=>{if(!s)return null;const d=new Date(s+'T00:00:00Z');return isNaN(d)?null:d};
function xSet(cell,v){cell.value=v==null||v===''?null:v;cell.style=Object.assign({},cell.style,{fill:RS_FILL})}
function xRows(ws,from,to){const out=[];for(let r=from;r<=to;r++)out.push(r);return out}
function xFirstEmpty(ws,from,to,cols){for(let r=from;r<=to;r++){if(cols.every(c=>!xs(ws.getCell(c+r))))return r}return null}
function rsClearExamples(wb){
  for(const ws of wb.worksheets){
    if(['Start Here','Deal Check'].includes(ws.name))continue;
    const row=ws.getRow(8);row.eachCell({includeEmpty:false},c=>{if(c.formula||(c.value&&typeof c.value==='object'&&'formula' in c.value))return;c.value=null});
  }
}
const RS_IN_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF2CC'}};
const xArgb=c=>{const f=c&&c.style&&c.style.fill;return f&&f.fgColor&&f.fgColor.argb?String(f.fgColor.argb).toUpperCase().slice(-6):''};
const xAuto=c=>xArgb(c)==='DDEBF7';
const xIsF=c=>{if(c.type===6)return true;const v=c.value;return !!(v&&typeof v==='object'&&('formula' in v||'sharedFormula' in v))};
const xEmpty=c=>{const v=c.value;return v==null||v===''};
/* last metro row in the Metros tab (the Ready check table starts 3 rows below it) */
function rsMetroEnd(ws){for(let r=8;r<=80;r++){if(xs(ws.getCell('A'+r)).startsWith('Ready check'))return r-3}return 13}
/* Rows OfferDesk filled for metros he un-starred: clear them, unless he typed something in the row himself. */
function rsPrune(wb,keep){
  const gone=new Set(),kept=new Set();
  for(const [name,to0] of [['Metros',0],['ZIPs',107],['Listing Watch',307],['Flip Candidates',307],['Competition',607]]){
    const ws=wb.getWorksheet(name);if(!ws)continue;
    const end=to0||rsMetroEnd(ws);
    for(let r=8;r<=end;r++){
      const label=xs(ws.getCell('A'+r));if(!label||keep.has(label.toLowerCase()))continue;
      const row=ws.getRow(r);let auto=0,mine=0;
      row.eachCell({includeEmpty:false},(c,col)=>{if(xEmpty(c)||xIsF(c))return;if(xAuto(c))auto++;else if(col!==1)mine++});
      const ready=name==='Metros'?['B','E','H'].map(k=>ws.getCell(k+(end+5+r-8))):[];
      if(ready.some(c=>!xEmpty(c)&&!xIsF(c)))mine++;
      if(!auto)continue;/* a metro he typed in himself: not ours to remove */
      if(mine){kept.add(label);continue}
      row.eachCell({includeEmpty:false},c=>{if(xIsF(c))return;const a=xAuto(c);c.value=null;if(a)c.style=Object.assign({},c.style,{fill:RS_IN_FILL})});
      gone.add(label);
    }
  }
  return {gone:[...gone],kept:[...kept]};
}
/* Older workbook (Metros fits fewer rows, or a tab is missing): move everything he has into the current template. */
async function rsTemplate(X){
  const r=await fetch(RS_TPL+'?v='+encodeURIComponent(typeof APP_V!=='undefined'?APP_V:''),{cache:'no-cache'}).catch(()=>null);if(!r||!r.ok)return null;
  const wb=new X.Workbook();await wb.xlsx.load(await r.arrayBuffer());rsClearExamples(wb);return wb;
}
function rsNeedsUpgrade(old,tpl){
  const a=old.getWorksheet('Metros'),b=tpl.getWorksheet('Metros');if(!a||!b)return false;
  const ver=w=>{const ws=w.getWorksheet('Start Here');return ws?xs(ws.getCell('Z1')):''};
  return ver(old)!==ver(tpl)||rsMetroEnd(a)!==rsMetroEnd(b)||tpl.worksheets.some(w=>!old.getWorksheet(w.name));
}
function rsUpgrade(old,tpl){
  for(const ws of old.worksheets){
    let t=tpl.getWorksheet(ws.name);const fresh=!t;
    if(fresh){t=tpl.addWorksheet(ws.name);for(let i=1;i<=ws.columnCount;i++){const w=ws.getColumn(i).width;if(w)t.getColumn(i).width=w}}
    const at=ws.name==='Metros'?rsMetroEnd(ws)+3:Infinity,by=ws.name==='Metros'?rsMetroEnd(t)-rsMetroEnd(ws):0;
    ws.eachRow({includeEmpty:false},(row,r)=>{
      const tr=r>=at?r+by:r;
      row.eachCell({includeEmpty:false},(c,col)=>{
        if(xEmpty(c))return;const d=t.getCell(tr,col);
        if(!fresh&&xIsF(d))return;/* the template's formula wins */
        if(!fresh&&!xEmpty(d)&&xArgb(d)!=='FFF2CC')return;/* headers and labels: keep the new ones */
        if(xIsF(c)){const fx=c.formula;if(!fx)return;d.value={formula:fx}}else d.value=c.value;
        if(fresh)d.style=c.style;else if(xAuto(c)||xArgb(c)==='FFF2CC')d.style=Object.assign({},d.style,{fill:c.style.fill});
      });
    });
  }
  return tpl;
}
function rsFill(wb){
  const rep={metros:0,zips:0,zipsLocked:0,listings:0,listingsNew:0,cands:0,comp:0,warn:[]};
  const R=rsSt();const ms=rsMetros();
  const skip=ms.filter(t=>mkIsTh(t.key)!==(DISC.ptype==='th'));
  if(skip.length)rep.warn.push(`${skip.map(t=>mkLabel(t.key)).join(' and ')} kept as is: switch Home type to ${mkIsTh(skip[0].key)?'Rowhouses':'Houses'} and update again to refresh ${skip.length>1?'them':'it'}.`);const today=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()));
  const src=DISC.data&&DISC.data.sources||{};const cm=CENS.meta||{};
  const srcText=`${RS_TAG}: Redfin ${DISC.ptype==='th'?'townhouses ':''}3 mo to ${src.redfin||DISC.data&&DISC.data.periodEnd||'?'} · Census ACS ${cm.acsYear?`${cm.acsYear-4}–${cm.acsYear}`:'?'} · rent HUD ${src.safmr||'?'} / Zillow ${src.zori||'?'}${DISC.zhviMonth?` · home value Zillow ${DISC.zhviMonth}`:''}`;
  const sheet=n=>wb.getWorksheet(n);
  rep.pruned=rsPrune(wb,new Set(ms.map(t=>mkLabel(t.key).toLowerCase())));
  /* Metros */
  const mws=sheet('Metros');
  if(mws){
    const end=rsMetroEnd(mws);
    for(const t of ms){
      const label=mkLabel(t.key);let r=xRows(mws,8,end).find(r=>xs(mws.getCell('A'+r)).toLowerCase()===label.toLowerCase());
      if(!r){r=xFirstEmpty(mws,8,end,['A']);if(!r){rep.warn.push(`No room for ${label} in the Metros tab (${end-7} metros max). Un-star one.`);continue}xSet(mws.getCell('A'+r),label);rep.metros++}
      const f=rsMetroFacts(t.key);
      for(const [c,v] of [['T',f.job],['U',f.popG]]){const cell=mws.getCell(c+r);if(v!=null&&(!xs(cell)||xAuto(cell)))xSet(cell,Math.round(v*10)/1000)}
    }
  }
  /* ZIPs */
  const zws=sheet('ZIPs');
  if(zws){
    for(const t of ms){
      const label=mkLabel(t.key);
      for(const o of rsZipsFor(t.key)){
        let r=xRows(zws,8,107).find(r=>xs(zws.getCell('B'+r))===o.z&&xs(zws.getCell('A'+r)).toLowerCase()===label.toLowerCase());
        if(r&&!xs(zws.getCell('Q'+r)).startsWith(RS_TAG)){rep.zipsLocked++;continue}
        if(!r){r=xFirstEmpty(zws,8,107,['A','B']);if(!r){rep.warn.push('The ZIPs tab is full (100 rows).');break}}
        const vals={A:label,B:o.z,C:o.city||'',D:o.price,E:o.sold,F:o.inv,G:o.dom,H:o.stl!=null?o.stl/100:null,I:o.above!=null?o.above/100:null,J:o.zhviYoy!=null?o.zhviYoy/100:o.priceYoy!=null?o.priceYoy/100:null,
          K:mkRent(o),L:o.yb,M:o.own1,N:o.rent1,O:o.inc,Q:srcText};
        for(const [c,v] of Object.entries(vals))xSet(zws.getCell(c+r),v);
        rep.zips++;
      }
    }
  }
  /* Listing Watch */
  const lws=sheet('Listing Watch');
  if(lws){
    const rows=xRows(lws,8,307);const idx={};for(const r of rows){const a=xs(lws.getCell('C'+r)),z=xs(lws.getCell('B'+r));if(a&&z)idx[rsKey(a,z)]=r}
    for(const [k,L] of Object.entries(R.listings)){
      if(!ms.some(t=>t.key===L.metro))continue;
      let r=idx[k];
      if(r&&!xs(lws.getCell('Q'+r)).startsWith(RS_TAG))continue;
      const isNew=!r;if(!r){r=xFirstEmpty(lws,8,307,['A','C']);if(!r){rep.warn.push('The Listing Watch tab is full (300 rows).');break}idx[k]=r}
      const vals={K:L.price,L:L.status,M:xDate(L.pendingOn),N:xDate(L.soldOn),O:L.soldPrice||null,P:xDate(L.lastSeen)};
      if(isNew)Object.assign(vals,{A:mkLabel(L.metro),B:L.zip,C:L.addr,D:L.url?{text:'Redfin',hyperlink:L.url}:null,E:L.beds,F:L.baths,G:L.sqft,I:xDate(L.listedOn),J:L.list0,Q:RS_TAG});
      for(const [c,v] of Object.entries(vals))xSet(lws.getCell(c+r),v);
      rep.listings++;if(isNew)rep.listingsNew++;
    }
  }else if(Object.keys(R.listings).length)rep.warn.push('No Listing Watch tab in this workbook.');
  /* Flip Candidates */
  const fws=sheet('Flip Candidates');
  if(fws){
    const idx={};for(const r of xRows(fws,8,307)){const a=xs(fws.getCell('C'+r)),z=xs(fws.getCell('B'+r));if(a&&z)idx[rsKey(a,z)]=r}
    for(const [k,c] of Object.entries(R.cands)){
      if(!ms.some(t=>t.key===c.metro))continue;
      let r=idx[k];if(!r){r=xFirstEmpty(fws,8,307,['A','C']);if(!r){rep.warn.push('The Flip Candidates tab is full.');break}idx[k]=r;rep.cands++}
      const vals={A:mkLabel(c.metro),B:c.zip,C:c.addr,D:c.url?{text:'Redfin',hyperlink:c.url}:null,E:c.sqft,F:c.year,G:xDate(c.soldOn),H:c.soldPrice,I:c.zipPpsf};
      if(!c.soldOn&&!xs(fws.getCell('L'+r)))vals.L='No sold date in the download (local MLS rule): copy it from the Redfin sale history into Sold on.';
      for(const [col,v] of Object.entries(vals))xSet(fws.getCell(col+r),v);
    }
  }else if(Object.keys(R.cands).length)rep.warn.push('This workbook has no Flip Candidates tab. Download a fresh workbook to get it.');
  /* Competition */
  const kws=sheet('Competition');
  if(kws){
    const have=new Set();for(const r of xRows(kws,8,607)){const m=xs(kws.getCell('A'+r)),n=xs(kws.getCell('B'+r));if(m&&n)have.add(m.toLowerCase()+'|'+n.toLowerCase())}
    for(const t of ms){const C=R.comp[t.key];if(!C)continue;const label=mkLabel(t.key);
      for(const co of C.companies){const k=label.toLowerCase()+'|'+co.name.toLowerCase();if(have.has(k))continue;const r=xFirstEmpty(kws,8,607,['A','B']);if(!r){rep.warn.push('The Competition tab is full.');break}
        have.add(k);const vals={A:label,B:co.name,C:co.url?{text:co.url.replace(/^https?:\/\/(www\.)?/,'').slice(0,60),hyperlink:co.url}:null,D:'Maya',E:co.local,F:`${RS_TAG} ${rsDay(C.at)}`};
        for(const [col,v] of Object.entries(vals))xSet(kws.getCell(col+r),v);rep.comp++}}
  }else if(Object.values(R.comp).length)rep.warn.push('This workbook has no Competition tab. Download a fresh workbook to get it.');
  /* Excel recalculates everything when the file opens */
  for(const ws of wb.worksheets){
    const dv=ws.dataValidations&&ws.dataValidations.model;if(dv)for(const k of Object.keys(dv)){const v=dv[k];if(v&&v.type==='list'&&Array.isArray(v.formulae))v.formulae=v.formulae.slice(0,1)}
  }
  wb.calcProperties=Object.assign({},wb.calcProperties,{fullCalcOnLoad:true});
  return rep;
}
async function rsWorkbook(file){
  if(!rsMetros().length){toast('Star at least one metro first.');return}
  if(!DISC.data){toast('Market data is still loading.');return}
  state.busy['rs-wb']={label:file?'Updating your workbook…':'Building your workbook…'};render();
  try{
    let X;try{X=await loadExcelJS()}catch(e){toast('Couldn’t load the Excel tools. Check your connection and try again.',5200);return}
    let wb=new X.Workbook();let upgraded=false;
    if(file){try{await wb.xlsx.load(await file.arrayBuffer())}catch(e){console.warn(e);toast('That file couldn’t be opened. Pick the .xlsx research workbook. If it still fails, open it in Excel or Google Sheets, save it, and try again.',7000);return}
      if(!wb.getWorksheet('ZIPs')||!wb.getWorksheet('Metros')){toast('That isn’t the research workbook (it has no ZIPs and Metros tabs).',5200);return}
      const tpl=await rsTemplate(X);if(tpl&&rsNeedsUpgrade(wb,tpl)){wb=rsUpgrade(wb,tpl);upgraded=true}}
    else{const r=await fetch(RS_TPL+'?v='+encodeURIComponent(typeof APP_V!=='undefined'?APP_V:''),{cache:'no-cache'}).catch(()=>null);if(!r||!r.ok){toast('Couldn’t download the workbook template. Check your connection.',5200);return}
      await wb.xlsx.load(await r.arrayBuffer());rsClearExamples(wb)}
    const rep=rsFill(wb);
    const buf=await wb.xlsx.writeBuffer();
    const name=file?file.name.replace(/\.xlsx$/i,'')+'.xlsx':`Market Research Workbook ${isoDay()}.xlsx`;
    saveFile(name,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const R=rsSt();R.lastWb={at:nowISO(),mode:file?'update':'new',rep};saveResearch(true);
    toast(`${file?'Updated':'Built'} your workbook: ${rep.zips} ZIPs${rep.zipsLocked?` (${rep.zipsLocked} you edited were left alone)`:''}, ${rep.listings} listings, ${rep.cands} new flip candidates, ${rep.comp} companies.${upgraded?' Upgraded it to the newest workbook (room for 10 metros, nothing you typed is lost).':''}${rep.pruned.gone.length?` Removed ${rep.pruned.gone.join(' and ')} (not starred anymore).`:''}${rep.pruned.kept.length?` Kept ${rep.pruned.kept.join(' and ')}: it has rows you typed in.`:''}${rep.warn.length?' '+rep.warn.slice(0,2).join(' '):''}`,9000);
  }catch(e){console.warn(e);toast('Something went wrong building the workbook. Try again.',5200)}
  finally{delete state.busy['rs-wb'];render()}
}

/* ---- Markets card ---- */
function rsRedfinLinks(key){
  const pt=mkIsTh(key)?'townhouse':'house';
  const M=mkSet();const mx=+M.maxPrice?`,max-price=${Math.round(+M.maxPrice/1000)}k`:'';
  return rsZipsFor(key).map(o=>`<span class="rs-zip"><b class="tnum">${o.z}</b>${o.city?` <span class="muted">${esc(o.city)}</span>`:''}
    <a href="https://www.redfin.com/zipcode/${o.z}/filter/property-type=${pt}${mx},status=active+comingsoon+contingent+pending" target="_blank" rel="noopener">For sale</a>
    <a href="https://www.redfin.com/zipcode/${o.z}/filter/property-type=${pt},include=sold-1yr" target="_blank" rel="noopener">Sold</a></span>`).join('');
}
function mkResearchCard(R){
  const ms=rsMetros();const busy=state.busy['rs-wb'];const n=esc(negName());const st=rsSt();
  const head=`<div class="card-head"><span class="ci teal">${ico('download')}</span><div><h2>Research pack</h2><p>Fills your research workbook from public data, so week 1 takes hours instead of days</p></div></div>`;
  if(!ms.length)return `<section class="card" id="mk-research">${head}<div class="note">Star 2–5 metros (${ico('star')} in the table above). The research pack fills your workbook for those metros.</div></section>`;
  const other=t=>mkIsTh(t.key)!==(mkPtype()==='th');
  const rows=ms.map(t=>{const s=rsSummary(t.key);return `<tr><td><b>${esc(mkLabel(t.key))}</b>${other(t)?`<div class="xs muted">Switch Home type to ${mkIsTh(t.key)?'Rowhouses':'Houses'} to fill this one</div>`:''}</td><td class="r tnum">${other(t)?'—':rsZipsFor(t.key).length}</td><td class="r tnum">${s.n||'—'}${s.n?`<div class="xs muted">${s.active} active · ${s.pending} pending · ${s.sold} sold${s.gone?` · ${s.gone} gone`:''}</div>`:''}</td><td class="r tnum">${s.dtp!=null?Math.round(s.dtp)+'d':'—'}</td><td class="r tnum">${s.cuts||'—'}</td><td class="r tnum">${s.flip?`${s.cands} <span class="muted">of ${s.flip.found}</span><div class="xs muted">${s.flip.per100<10?s.flip.per100.toFixed(1):Math.round(s.flip.per100)} per 100 sales</div>`:(s.cands||'—')}</td><td class="r tnum">${s.comp?`${s.comp.n}<div class="xs muted">${new Date(s.comp.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>`:'—'}</td></tr>`}).join('');
  const last=st.imports[0];
  const cands=ms.map(t=>{const C=Object.values(st.cands).filter(c=>c.metro===t.key).sort((a,b)=>b.prem-a.prem).slice(0,10);if(!C.length)return '';
    return `<p class="small" style="margin:8px 0 4px"><b>${esc(mkLabel(t.key))}</b></p><ul class="rs-cands">${C.map(c=>`<li>${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.addr)}</a>`:esc(c.addr)} <span class="muted">· ${c.zip} · built ${c.year||'?'} · sold ${moneyK(c.soldPrice)} (${c.soldOn?rsDay(c.soldOn):'in the last year'}) · ${Math.round(c.prem*100)}% above the ZIP’s $/sqft</span></li>`).join('')}</ul>`}).join('');
  return `<section class="card" id="mk-research">${head}
  <div class="tbl-wrap"><table class="tbl rs-tbl"><thead><tr><th>Metro</th><th class="r">ZIPs</th><th class="r">Listings watched</th><th class="r">Days to pending</th><th class="r">Price cuts</th><th class="r" title="Kept for you to check, of all the flips found in your Sold downloads. Per 100 sales: how many of every 100 houses sold in the last year look like flips.">Flip candidates</th><th class="r">“We buy houses”</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="rs-steps">
    <div class="rs-step"><h3><span class="rs-n">1</span>Your workbook</h3>
      <p class="small">First time: <b>Download workbook</b>. After that, use <b>Update my workbook</b>: pick your file, then save the updated copy over it. Light-blue cells came from here. Change a row’s Source/Notes cell and it’s never overwritten.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><label class="field" style="margin:0"><span>ZIPs per metro</span><input class="input tnum" id="rs-zips" data-fs="markets.rsZips" data-t="num" value="${mkSet().rsZips??6}" inputmode="numeric" style="width:80px"></label>
        <button class="btn primary" data-act="rs-new" ${busy?'disabled':''}>${ico('download')}Download workbook</button>
        <label class="btn" ${busy?'aria-disabled="true"':''}>${ico('upload')}Update my workbook…<input type="file" accept=".xlsx" data-rs-wb hidden></label></div>
      ${busyHTML('rs-wb',false)}
      ${st.lastWb?`<p class="xs muted">Last ${st.lastWb.mode==='update'?'update':'download'}: ${new Date(st.lastWb.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p>`:''}</div>
    <div class="rs-step"><h3><span class="rs-n">2</span>Listings from Redfin (weekly, about 5 minutes)</h3>
      <p class="small">Sign in to Redfin, open a link, then <b>Download All</b> under the results. <b>For sale</b> weekly (2–3 ZIPs per metro is enough). <b>Sold</b> once a month: it finds flip candidates and fills in sold prices. Drop the files here.</p>
      ${ms.filter(t=>!other(t)).map(t=>`<div class="rs-links"><span class="small"><b>${esc(mkLabel(t.key))}</b></span>${rsRedfinLinks(t.key)}</div>`).join('')}
      <label class="rs-drop" data-drop="rs">${ico('upload')}<span><b>Drop Redfin downloads here</b> or click to pick them. For sale and sold files both work.</span><input type="file" accept=".csv,text/csv" multiple data-rs-csv hidden></label>
      ${last?`<p class="xs muted">Last file: ${esc(last.file)} · ${new Date(last.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${last.forSale} for sale, ${last.sold} sold, ${last.added} new watched${last.cands?`, ${last.cands} flip candidates`:''}</p>`:''}</div>
    <div class="rs-step"><h3><span class="rs-n">3</span>Count the competition</h3>
      <p class="small">${n} searches each metro for “we buy houses” companies and lists them with links (about a cent or two per metro). You skim the list in the Competition tab.</p>
      ${aiOn()?`<button class="btn" data-act="rs-comp" ${state.busy['rs-comp']?'disabled':''}>${ico('search')}Count “we buy houses”</button>`:`<a class="btn sm" href="#settings/connections">Add your API key</a>`}
      ${busyHTML('rs-comp')}</div>
  </div>
  ${cands?`<details id="rs-cands"><summary>Flip candidates to check (${Object.keys(st.cands).length})</summary><p class="xs muted">Open each one, find the earlier sale in its history, and type it into the Flip Candidates tab.</p>${cands}</details>`:''}
  <p class="xs muted">You still check: 3 ZIPs per metro against Redfin, each flip candidate’s sale history, and the competition list. The rest is filled for you.</p></section>`;
}
