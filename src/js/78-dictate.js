/* ================= Dictation: talk, and it types into the box ================= */
/* Any <textarea data-dict> gets a mic button. Words appear as you speak; you still press Send. */
const DICT={id:null,rec:null,want:false,base:'',final:'',interim:'',ends:[],quietT:0};
const DICT_QUIET=25;/* stop listening after this many seconds with no speech */
function dictDecorate(){
  if(DICT.want&&!document.getElementById(DICT.id))dictStop();
  document.querySelectorAll('textarea[data-dict]').forEach(t=>{
    if(t.parentElement&&t.parentElement.classList.contains('dict-wrap'))return;
    const w=document.createElement('span');w.className='dict-wrap'+(t.rows<=1?' one':'');t.parentNode.insertBefore(w,t);w.appendChild(t);
    const b=document.createElement('button');b.type='button';b.className='dict-btn';b.dataset.act='dict';b.dataset.k=t.id;w.appendChild(b);
  });
  dictBits();
}
function dictBits(){
  document.querySelectorAll('.dict-btn').forEach(b=>{const on=DICT.want&&b.dataset.k===DICT.id;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
    const lab=on?'Stop talking':'Talk instead of typing';b.setAttribute('aria-label',lab);b.title=on?'Listening… tap to stop':'Talk, and it types for you';b.innerHTML=ico(on?'stop':'mic')});
}
function dictToggle(id){
  if(DICT.want&&DICT.id===id){dictStop();return}
  dictStop();
  if(!SR()){toast('Talking needs Chrome, Edge or Safari. You can still type.',5200);return}
  if(typeof VOICE!=='undefined'&&VOICE.listening)voiceStopListening();
  const box=document.getElementById(id);if(!box)return;
  Object.assign(DICT,{id,want:true,base:box.value.replace(/\s+$/,''),final:'',interim:'',ends:[]});
  dictStart();dictBits();dictQuiet();
  try{box.focus({preventScroll:true});box.setSelectionRange(box.value.length,box.value.length)}catch(e){}
}
function dictStart(){
  const R=SR();if(!R||!DICT.want)return;
  if(DICT.rec){try{DICT.rec.onend=null;DICT.rec.abort()}catch(e){}}
  const r=new R();r.lang='en-US';r.interimResults=true;r.continuous=true;r.maxAlternatives=1;
  r.onresult=e=>{if(!DICT.want||DICT.rec!==r)return;let int='';let got=false;
    for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal){DICT.final=(DICT.final+' '+x[0].transcript).trim();got=true}else int+=x[0].transcript}
    DICT.interim=int.trim();dictWrite(got);dictQuiet()};
  r.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){dictStop();toast('Allow the microphone for this site in your browser, then tap the mic again.',6000)}else if(e.error==='audio-capture'){dictStop();toast('No microphone found.',4200)}};
  r.onend=()=>{if(DICT.rec===r)DICT.rec=null;if(!DICT.want)return;const now=Date.now();DICT.ends=DICT.ends.filter(t=>now-t<6000).concat(now);setTimeout(()=>{if(DICT.want&&!DICT.rec)dictStart()},DICT.ends.length>5?1200:150)};
  try{r.start();DICT.rec=r}catch(e){dictStop();toast('Couldn’t start the microphone.',4200)}
}
function dictText(){const said=[DICT.final,DICT.interim].filter(Boolean).join(' ');return said?(DICT.base?DICT.base+(/[\n]$/.test(DICT.base)?'':' '):'')+said:DICT.base}
function dictWrite(save){
  const box=document.getElementById(DICT.id);if(!box)return;
  box.value=dictText();box.scrollTop=box.scrollHeight;
  box.dispatchEvent(new Event('input',{bubbles:true}));
  if(save&&!box.hasAttribute('data-draft'))box.dispatchEvent(new Event('change',{bubbles:true}));
}
function dictQuiet(){clearTimeout(DICT.quietT);DICT.quietT=setTimeout(()=>{if(DICT.want)dictStop()},DICT_QUIET*1000)}
function dictStop(){
  if(!DICT.want&&!DICT.rec)return;
  const had=DICT.interim;DICT.want=false;clearTimeout(DICT.quietT);
  if(DICT.rec){try{DICT.rec.onend=null;DICT.rec.abort()}catch(e){}DICT.rec=null}
  if(had){DICT.final=(DICT.final+' '+had).trim();DICT.interim=''}
  if(had||DICT.final)dictWrite(true);
  dictBits();
}
