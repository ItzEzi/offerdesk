/* ================= Research pack: fills Ezra's own research workbook from public data ================= */
/* He stars metros on Markets. OfferDesk then fills the workbook's ZIPs, Metros (jobs, population), Listing Watch,
   Flip Candidates and Competition tabs. Cells it fills are light blue and tagged "Auto (OfferDesk)", so rows he edits
   himself are never overwritten. The workbook template lives next to the app (research-template.xlsx). */
const RS_TPL='research-template.xlsx';
const EXCELJS_URL='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const RS_TAG='Auto (OfferDesk)';
const RS_CAP=40;/* listings watched per metro */
const RS_CAND_CAP=25;/* flip candidates kept per metro */
function rsSt(){const r=state.research=state.research||{};r.listings=r.listings||{};r.cands=r.cands||{};r.comp=r.comp||{};r.imports=r.imports||[];return r}
function saveResearch(quiet){persist('research');if(!quiet)render()}
const rsMetros=()=>mkTargets().filter(t=>t.type==='metro');
const rsZipsPer=()=>{const n=+(mkSet().rsZips||6);return Math.max(1,Math.min(15,n||6))};
function rsZipsFor(key,n){
  const R=DISC.data?mkCompute():null;const m=R&&R.byKey[key];
  const zs=m?m.zips.slice():Object.values(DISC.byZip).filter(o=>o.mk===key&&o.price).sort((a,b)=>(b.sold||0)-(a.sold||0));
  return zs.slice(0,n||rsZipsPer());
}
/* metro-level county jobs and population, weighted by sales across all its ZIPs */
function rsMetroFacts(key){
  let wj=0,sj=0,wp=0,sp=0;
  for(const o of Object.values(DISC.byZip)){if(o.mk!==key)continue;const w=Math.max(1,o.sold||1);const j=jobOf(o);if(j!=null){sj+=j*w;wj+=w}if(o.cPopG!=null){sp+=o.cPopG*w;wp+=w}}
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
  const seenZips=new Set(),seenKeys=new Set();const fresh=[];
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
      if(zp&&pp&&sqft>=600&&(rec.year||0)<=1995&&pp>=zp*1.25&&soldOn&&soldOn>=rsDaysAgo(365)){
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
  if(!tot.forSale&&!tot.sold){toast(tot.outside?'Those listings aren’t in your starred metros. Star the metro first, or download its ZIPs.':'No listings found in that file. Use Redfin’s “Download All”.',6200);return}
  toast(`Read ${tot.forSale} for sale and ${tot.sold} sold. ${tot.added} new listings watched${tot.cands?`, ${tot.cands} new flip candidates`:''}.${tot.outside?` ${tot.outside} were outside your metros.`:''}`,6200);
}
function rsSummary(key){
  const R=rsSt();const L=Object.values(R.listings).filter(x=>x.metro===key);const C=Object.values(R.cands).filter(x=>x.metro===key);
  const by=s=>L.filter(x=>x.status===s).length;
  const dtp=L.filter(x=>x.pendingOn&&x.listedOn).map(x=>(new Date(x.pendingOn)-new Date(x.listedOn))/864e5);
  return {n:L.length,active:by('Active'),pending:by('Pending'),sold:by('Sold'),gone:by('Off market'),cuts:L.filter(x=>x.price<x.list0).length,dtp:dtp.length?median(dtp):null,cands:C.length,comp:R.comp[key]};
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
function rsFill(wb){
  const rep={metros:0,zips:0,zipsLocked:0,listings:0,listingsNew:0,cands:0,comp:0,warn:[]};
  const R=rsSt();const ms=rsMetros();const today=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()));
  const src=DISC.data&&DISC.data.sources||{};const cm=CENS.meta||{};
  const srcText=`${RS_TAG}: Redfin 3 mo to ${src.redfin||DISC.data&&DISC.data.periodEnd||'?'} · Census ACS ${cm.acsYear?`${cm.acsYear-4}–${cm.acsYear}`:'?'} · rent HUD ${src.safmr||'?'} / Zillow ${src.zori||'?'}`;
  const sheet=n=>wb.getWorksheet(n);
  /* Metros */
  const mws=sheet('Metros');
  if(mws){
    for(const t of ms){
      const label=mkLabel(t.key);let r=xRows(mws,8,13).find(r=>xs(mws.getCell('A'+r)).toLowerCase()===label.toLowerCase());
      if(!r){r=xFirstEmpty(mws,8,13,['A']);if(!r){rep.warn.push(`No room for ${label} in the Metros tab (6 metros max).`);continue}mws.getCell('A'+r).value=label;rep.metros++}
      const f=rsMetroFacts(t.key);
      if(!xs(mws.getCell('T'+r))&&f.job!=null)xSet(mws.getCell('T'+r),Math.round(f.job*10)/1000);
      if(!xs(mws.getCell('U'+r))&&f.popG!=null)xSet(mws.getCell('U'+r),Math.round(f.popG*10)/1000);
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
        const vals={A:label,B:o.z,C:o.city||'',D:o.price,E:o.sold,F:o.inv,G:o.dom,H:o.stl!=null?o.stl/100:null,I:o.above!=null?o.above/100:null,J:o.priceYoy!=null?o.priceYoy/100:null,
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
    const idx={};for(const r of xRows(fws,8,207)){const a=xs(fws.getCell('C'+r)),z=xs(fws.getCell('B'+r));if(a&&z)idx[rsKey(a,z)]=r}
    for(const [k,c] of Object.entries(R.cands)){
      if(!ms.some(t=>t.key===c.metro))continue;
      let r=idx[k];if(!r){r=xFirstEmpty(fws,8,207,['A','C']);if(!r){rep.warn.push('The Flip Candidates tab is full.');break}idx[k]=r;rep.cands++}
      const vals={A:mkLabel(c.metro),B:c.zip,C:c.addr,D:c.url?{text:'Redfin',hyperlink:c.url}:null,E:c.sqft,F:c.year,G:xDate(c.soldOn),H:c.soldPrice,I:c.zipPpsf};
      for(const [col,v] of Object.entries(vals))xSet(fws.getCell(col+r),v);
    }
  }else if(Object.keys(R.cands).length)rep.warn.push('This workbook has no Flip Candidates tab. Download a fresh workbook to get it.');
  /* Competition */
  const kws=sheet('Competition');
  if(kws){
    const have=new Set();for(const r of xRows(kws,8,207)){const m=xs(kws.getCell('A'+r)),n=xs(kws.getCell('B'+r));if(m&&n)have.add(m.toLowerCase()+'|'+n.toLowerCase())}
    for(const t of ms){const C=R.comp[t.key];if(!C)continue;const label=mkLabel(t.key);
      for(const co of C.companies){const k=label.toLowerCase()+'|'+co.name.toLowerCase();if(have.has(k))continue;const r=xFirstEmpty(kws,8,207,['A','B']);if(!r){rep.warn.push('The Competition tab is full.');break}
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
    const wb=new X.Workbook();
    if(file){try{await wb.xlsx.load(await file.arrayBuffer())}catch(e){console.warn(e);toast('That file couldn’t be opened. Pick the .xlsx research workbook. If it still fails, open it in Excel or Google Sheets, save it, and try again.',7000);return}
      if(!wb.getWorksheet('ZIPs')||!wb.getWorksheet('Metros')){toast('That isn’t the research workbook (it has no ZIPs and Metros tabs).',5200);return}}
    else{const r=await fetch(RS_TPL+'?v='+encodeURIComponent(typeof APP_V!=='undefined'?APP_V:''),{cache:'no-cache'}).catch(()=>null);if(!r||!r.ok){toast('Couldn’t download the workbook template. Check your connection.',5200);return}
      await wb.xlsx.load(await r.arrayBuffer());rsClearExamples(wb)}
    const rep=rsFill(wb);
    const buf=await wb.xlsx.writeBuffer();
    const name=file?file.name.replace(/\.xlsx$/i,'')+'.xlsx':`Market Research Workbook ${isoDay()}.xlsx`;
    saveFile(name,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const R=rsSt();R.lastWb={at:nowISO(),mode:file?'update':'new',rep};saveResearch(true);
    toast(`${file?'Updated':'Built'} your workbook: ${rep.zips} ZIPs${rep.zipsLocked?` (${rep.zipsLocked} you edited were left alone)`:''}, ${rep.listings} listings, ${rep.cands} new flip candidates, ${rep.comp} companies.${rep.warn.length?' '+rep.warn[0]:''}`,7000);
  }catch(e){console.warn(e);toast('Something went wrong building the workbook. Try again.',5200)}
  finally{delete state.busy['rs-wb'];render()}
}

/* ---- Markets card ---- */
function rsRedfinLinks(key){
  const M=mkSet();const mx=+M.maxPrice?`,max-price=${Math.round(+M.maxPrice/1000)}k`:'';
  return rsZipsFor(key).map(o=>`<span class="rs-zip"><b class="tnum">${o.z}</b>${o.city?` <span class="muted">${esc(o.city)}</span>`:''}
    <a href="https://www.redfin.com/zipcode/${o.z}/filter/property-type=house${mx},status=active+comingsoon+contingent+pending" target="_blank" rel="noopener">For sale</a>
    <a href="https://www.redfin.com/zipcode/${o.z}/filter/property-type=house,include=sold-1yr" target="_blank" rel="noopener">Sold</a></span>`).join('');
}
function mkResearchCard(R){
  const ms=rsMetros();const busy=state.busy['rs-wb'];const n=esc(negName());const st=rsSt();
  const head=`<div class="card-head"><span class="ci teal">${ico('download')}</span><div><h2>Research pack</h2><p>Fills your research workbook from public data, so week 1 takes hours instead of days</p></div></div>`;
  if(!ms.length)return `<section class="card" id="mk-research">${head}<div class="note">Star 2–5 metros (${ico('star')} in the table above). The research pack fills your workbook for those metros.</div></section>`;
  const rows=ms.map(t=>{const s=rsSummary(t.key);return `<tr><td><b>${esc(mkLabel(t.key))}</b></td><td class="r tnum">${rsZipsFor(t.key).length}</td><td class="r tnum">${s.n||'—'}${s.n?`<div class="xs muted">${s.active} active · ${s.pending} pending · ${s.sold} sold${s.gone?` · ${s.gone} gone`:''}</div>`:''}</td><td class="r tnum">${s.dtp!=null?Math.round(s.dtp)+'d':'—'}</td><td class="r tnum">${s.cuts||'—'}</td><td class="r tnum">${s.cands||'—'}</td><td class="r tnum">${s.comp?`${s.comp.n}<div class="xs muted">${new Date(s.comp.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>`:'—'}</td></tr>`}).join('');
  const last=st.imports[0];
  const cands=ms.map(t=>{const C=Object.values(st.cands).filter(c=>c.metro===t.key).sort((a,b)=>b.prem-a.prem).slice(0,10);if(!C.length)return '';
    return `<p class="small" style="margin:8px 0 4px"><b>${esc(mkLabel(t.key))}</b></p><ul class="rs-cands">${C.map(c=>`<li>${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.addr)}</a>`:esc(c.addr)} <span class="muted">· ${c.zip} · built ${c.year||'?'} · sold ${moneyK(c.soldPrice)} (${rsDay(c.soldOn)}) · ${Math.round(c.prem*100)}% above the ZIP’s $/sqft</span></li>`).join('')}</ul>`}).join('');
  return `<section class="card" id="mk-research">${head}
  <div class="tbl-wrap"><table class="tbl rs-tbl"><thead><tr><th>Metro</th><th class="r">ZIPs</th><th class="r">Listings watched</th><th class="r">Days to pending</th><th class="r">Price cuts</th><th class="r">Flip candidates</th><th class="r">“We buy houses”</th></tr></thead><tbody>${rows}</tbody></table></div>
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
      ${ms.map(t=>`<div class="rs-links"><span class="small"><b>${esc(mkLabel(t.key))}</b></span>${rsRedfinLinks(t.key)}</div>`).join('')}
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
