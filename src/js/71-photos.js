/* ================= photos: carousel on the deal page + full-screen viewer with zoom and Maya's marks =================
   The viewer lives outside the app's render, so zoom and pan stay put while OfferDesk refreshes in the background. */
const PIDX={};
function dealPhotos(d){return [...(d.photoIds||[]).map(id=>({id,src:photoObjURL[id]})).filter(x=>x.src),...(d.photoUrls||[]).map(u=>({id:'url:'+u,src:u}))]}
/* Maya's marks for one photo (from the Opus inspection), by photo id */
function photoMarks(d,id){
  const a=d.analysis;if(!a||!Array.isArray(a.photoLog))return [];
  const refs=a.photoRefs||[...(d.photoIds||[]),...(d.photoUrls||[]).map(u=>'url:'+u)];
  const k=refs.indexOf(id);if(k<0)return [];const p=a.photoLog.find(x=>(x.photo||0)===k+1);
  return (p&&Array.isArray(p.marks)?p.marks:[]).map(m=>({label:String(m.label||'').slice(0,40),x:+m.x,y:+m.y,w:+m.w,h:+m.h})).filter(m=>m.label&&[m.x,m.y,m.w,m.h].every(v=>isFinite(v))&&m.w>0&&m.h>0).slice(0,8)
    .map(m=>({label:m.label,x:Math.max(0,Math.min(1,m.x)),y:Math.max(0,Math.min(1,m.y)),w:Math.min(1,m.w),h:Math.min(1,m.h)}));
}
function heroPhotoHTML(d){
  const ph=dealPhotos(d);if(!ph.length)return '';const n=ph.length;const i=Math.min(PIDX[d.id]||0,n-1);const mk=photoMarks(d,ph[i].id).length;
  return `<div class="hero-wrap"><button class="hero-btn" data-act="ph-open" data-i="${i}" aria-label="Open photo ${i+1} of ${n} full screen"><img class="hero-photo" src="${esc(ph[i].src)}" alt="Photo ${i+1} of ${n}, ${esc(streetOf(d.address))}"></button>
    ${n>1?`<button class="hero-nav prev" data-act="ph-step" data-v="-1" aria-label="Previous photo">${ico('back')}</button><button class="hero-nav next" data-act="ph-step" data-v="1" aria-label="Next photo">${ico('back')}</button>`:''}
    <span class="hero-count">${i+1} / ${n}${mk?` · ${mk} issue${mk>1?'s':''} marked`:''}</span><button class="hero-full" data-act="ph-open" data-i="${i}">${ico('expand')}Full screen</button></div>
    ${n>1?`<div class="hero-strip">${ph.map((p,k)=>`<button class="hs${k===i?' on':''}" data-act="ph-go" data-i="${k}" aria-label="Photo ${k+1}"${k===i?' aria-current="true"':''}><img src="${esc(p.src)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}`;
}
const PV={el:null,list:[],i:0,s:1,x:0,y:0,ptrs:new Map(),pinch:null,drag:null,marks:true,deal:null};
function openViewer(dealId,i){
  const d=state.deals[dealId];if(!d)return;const ph=dealPhotos(d);if(!ph.length)return;closeViewer();
  Object.assign(PV,{list:ph,i:Math.max(0,Math.min(+i||0,ph.length-1)),deal:dealId,s:1,x:0,y:0,ptrs:new Map(),pinch:null,drag:null});
  const el=document.createElement('div');el.className='pv';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Photos of '+streetOf(d.address));
  el.innerHTML=`<div class="pv-top"><span class="pv-count" aria-live="polite"></span><span class="pv-sp"></span>
      <button class="pv-b pv-mk" data-pv="marks" aria-pressed="true">Marks</button>
      <button class="pv-b" data-pv="out" aria-label="Zoom out">−</button><button class="pv-b" data-pv="reset" aria-label="Fit to screen">Fit</button><button class="pv-b" data-pv="in" aria-label="Zoom in">+</button>
      <button class="pv-b" data-pv="fs" aria-label="Full screen">${ico('expand')}</button><button class="pv-b" data-pv="close" aria-label="Close">${ico('close')}</button></div>
    <div class="pv-stage"><div class="pv-frame"><img class="pv-img" alt="" draggable="false"><div class="pv-marks"></div></div></div>
    <button class="pv-nav prev" data-pv="prev" aria-label="Previous photo">${ico('back')}</button><button class="pv-nav next" data-pv="next" aria-label="Next photo">${ico('back')}</button>
    <div class="pv-foot"><span class="pv-note"></span><div class="pv-strip">${ph.map((p,k)=>`<button data-pv="go" data-i="${k}" aria-label="Photo ${k+1}"><img src="${esc(p.src)}" alt="" loading="lazy"></button>`).join('')}</div></div>`;
  document.body.appendChild(el);PV.el=el;PV.prevOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  el.addEventListener('click',pvClick);
  const st=el.querySelector('.pv-stage');
  st.addEventListener('wheel',pvWheel,{passive:false});st.addEventListener('dblclick',pvDbl);
  st.addEventListener('pointerdown',pvDown);st.addEventListener('pointermove',pvMove);st.addEventListener('pointerup',pvUp);st.addEventListener('pointercancel',pvUp);
  document.addEventListener('keydown',pvKey);window.addEventListener('resize',pvApply);
  pvShow();setTimeout(()=>{const b=el.querySelector('[data-pv="close"]');if(b)b.focus()},0);
}
function closeViewer(){if(!PV.el)return;document.removeEventListener('keydown',pvKey);window.removeEventListener('resize',pvApply);
  try{if(document.fullscreenElement===PV.el)document.exitFullscreen()}catch(e){}
  PV.el.remove();PV.el=null;document.body.style.overflow=PV.prevOverflow||'';
  if(state.view==='deal'&&PV.deal===state.dealId){PIDX[PV.deal]=PV.i;render()}}
function pvShow(){
  const el=PV.el;if(!el)return;const p=PV.list[PV.i];const n=PV.list.length;const d=state.deals[PV.deal]||{};
  PV.s=1;PV.x=0;PV.y=0;const img=el.querySelector('.pv-img');img.src=p.src;img.alt=`Photo ${PV.i+1} of ${n}`;
  const mk=photoMarks(d,p.id);
  el.querySelector('.pv-count').textContent=`${PV.i+1} / ${n}`;
  el.querySelector('.pv-marks').innerHTML=mk.map(m=>`<div class="pv-ring${m.y<0.07?' lb':''}" style="left:${(m.x*100).toFixed(2)}%;top:${(m.y*100).toFixed(2)}%;width:${(m.w*100).toFixed(2)}%;height:${(m.h*100).toFixed(2)}%"><span>${esc(m.label)}</span></div>`).join('');
  const mb=el.querySelector('.pv-mk');mb.hidden=!mk.length;mb.setAttribute('aria-pressed',String(PV.marks));el.querySelector('.pv-marks').hidden=!PV.marks;
  el.querySelector('.pv-note').textContent=mk.length?`${negName()} marked ${mk.length} issue${mk.length>1?'s':''} in this photo (areas are approximate).`:'';
  el.querySelectorAll('.pv-nav').forEach(b=>b.hidden=n<2);
  el.querySelectorAll('.pv-strip button').forEach((b,k)=>{b.classList.toggle('on',k===PV.i);if(k===PV.i){b.setAttribute('aria-current','true');try{b.scrollIntoView({block:'nearest',inline:'center'})}catch(e){}}else b.removeAttribute('aria-current')});
  pvApply();
}
function pvGo(k){const n=PV.list.length;PV.i=((k%n)+n)%n;pvShow()}
function pvClamp(){const el=PV.el;if(!el)return;const st=el.querySelector('.pv-stage');const fr=el.querySelector('.pv-frame');
  const W=st.clientWidth,H=st.clientHeight,w=fr.offsetWidth*PV.s,h=fr.offsetHeight*PV.s;const mx=Math.max(0,(w-W)/2),my=Math.max(0,(h-H)/2);
  PV.x=Math.max(-mx,Math.min(mx,PV.x));PV.y=Math.max(-my,Math.min(my,PV.y));if(PV.s<=1){PV.s=1;PV.x=0;PV.y=0}}
function pvApply(){const el=PV.el;if(!el)return;pvClamp();const fr=el.querySelector('.pv-frame');fr.style.transform=`translate(${PV.x}px,${PV.y}px) scale(${PV.s})`;el.querySelector('.pv-stage').classList.toggle('zoomed',PV.s>1)}
/* zoom keeping the point under the cursor (cx, cy from the stage center) in place */
function pvZoomTo(s2,cx,cy){s2=Math.max(1,Math.min(8,s2));const s=PV.s;PV.x=cx-(cx-PV.x)*s2/s;PV.y=cy-(cy-PV.y)*s2/s;PV.s=s2;pvApply()}
function pvCenterOf(e){const r=PV.el.querySelector('.pv-stage').getBoundingClientRect();return [e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2]}
function pvWheel(e){e.preventDefault();const [cx,cy]=pvCenterOf(e);pvZoomTo(PV.s*Math.exp(-e.deltaY*0.0015),cx,cy)}
function pvDbl(e){const [cx,cy]=pvCenterOf(e);if(PV.s>1){PV.s=1;pvApply()}else pvZoomTo(3,cx,cy)}
function pvDown(e){if(e.button>0)return;try{e.currentTarget.setPointerCapture(e.pointerId)}catch(x){}PV.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(PV.ptrs.size===2){const [a,b]=[...PV.ptrs.values()];PV.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),s:PV.s,c:pvCenterOf({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2})};PV.drag=null}
  else PV.drag={x:e.clientX,y:e.clientY,ox:PV.x,oy:PV.y,moved:0}}
function pvMove(e){if(!PV.ptrs.has(e.pointerId))return;PV.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(PV.pinch&&PV.ptrs.size>=2){const [a,b]=[...PV.ptrs.values()];const dd=Math.hypot(a.x-b.x,a.y-b.y);const s2=Math.max(1,Math.min(8,PV.pinch.s*dd/PV.pinch.d));const [cx,cy]=PV.pinch.c;PV.x=cx-(cx-PV.x)*s2/PV.s;PV.y=cy-(cy-PV.y)*s2/PV.s;PV.s=s2;pvApply();return}
  const g=PV.drag;if(!g)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;g.moved=Math.max(g.moved,Math.abs(dx),Math.abs(dy));
  if(PV.s>1){PV.x=g.ox+dx;PV.y=g.oy+dy;pvApply()}}
function pvUp(e){const g=PV.drag;PV.ptrs.delete(e.pointerId);if(PV.ptrs.size<2)PV.pinch=null;
  if(g&&PV.s<=1&&PV.ptrs.size===0){const dx=e.clientX-g.x;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(e.clientY-g.y))pvGo(PV.i+(dx<0?1:-1))}
  if(PV.ptrs.size===0)PV.drag=null}
function pvKey(e){if(!PV.el)return;const k=e.key;
  if(k==='Escape'){e.preventDefault();if(document.fullscreenElement===PV.el){try{document.exitFullscreen()}catch(x){}}else closeViewer()}
  else if(k==='ArrowRight'){e.preventDefault();pvGo(PV.i+1)}else if(k==='ArrowLeft'){e.preventDefault();pvGo(PV.i-1)}
  else if(k==='+'||k==='='){pvZoomTo(PV.s*1.4,0,0)}else if(k==='-'){pvZoomTo(PV.s/1.4,0,0)}else if(k==='0'){PV.s=1;pvApply()}}
function pvClick(e){const b=e.target.closest('[data-pv]');if(!b)return;const a=b.dataset.pv;
  if(a==='close')closeViewer();else if(a==='prev')pvGo(PV.i-1);else if(a==='next')pvGo(PV.i+1);else if(a==='go')pvGo(+b.dataset.i);
  else if(a==='in')pvZoomTo(PV.s*1.5,0,0);else if(a==='out')pvZoomTo(PV.s/1.5,0,0);else if(a==='reset'){PV.s=1;pvApply()}
  else if(a==='marks'){PV.marks=!PV.marks;pvShow()}
  else if(a==='fs'){try{if(document.fullscreenElement)document.exitFullscreen();else if(PV.el.requestFullscreen)PV.el.requestFullscreen().catch(()=>{})}catch(x){}}}
