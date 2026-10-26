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
