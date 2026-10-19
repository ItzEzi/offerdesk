/* ================= voice practice (your mic in, ElevenLabs voice out) ================= */
const VOICE={rec:null,listening:false,speaking:false,audio:null,interim:'',final:'',voices:null,err:''};
const DEFAULT_VOICE='JBFqnCBsd6RMkjVDRZzb';
const voiceSet=()=>state.settings.voice||{};
const SR=()=>window.SpeechRecognition||window.webkitSpeechRecognition||null;
function voiceBits(){const el=document.getElementById('voice-status');if(el)el.innerHTML=voiceStatusHTML();const b=document.getElementById('mic-btn');if(b){b.classList.toggle('on',VOICE.listening);b.classList.toggle('talking',VOICE.speaking);b.setAttribute('aria-pressed',String(VOICE.listening))}}
const silenceSec=()=>{const v=voiceSet().silenceSec;return v==='manual'?null:(+v>0?+v:7)};
function voiceStatusHTML(){
  if(VOICE.speaking)return `<span class="vdot talk"></span>The agent is talking… <button class="linkbtn" data-act="voice-stop">Interrupt</button>`;
  if(VOICE.listening){const left=VOICE.sendAt?Math.max(0,Math.ceil((VOICE.sendAt-Date.now())/1000)):null;const heard=(VOICE.final+' '+VOICE.interim).trim();
    return `<span class="vdot rec"></span>Listening…${heard?` <button class="linkbtn" data-act="voice-send">Send now</button>`:''}${left!=null&&heard&&left<=Math.max(3,(silenceSec()||7)-1)?` <span class="muted">sending in ${left}s</span>`:silenceSec()==null&&heard?' <span class="muted">tap Send when you’re done</span>':heard?'':' <span class="muted">say your line</span>'}`}
  if(state.busy['pr-chat'])return `<span class="vdot"></span>The agent is thinking…`;
  const ss=silenceSec();
  return VOICE.err?`<span class="vdot err"></span>${esc(VOICE.err)}`:`Tap the mic and talk. ${ss?`It sends after ${ss} seconds of silence`:'Tap Send when you’re done'}${voiceSet().handsFree!==false?' and listens again after each reply.':'.'}`;
}
/* the mic stays open while you talk: your words fill the box, and it only sends after a stretch of silence (or when you tap Send) */
function voiceListen(){
  const R=SR();if(!R){VOICE.err='Voice needs Chrome, Edge or Safari. You can still type.';voiceBits();return}
  stopSpeaking();VOICE.want=true;VOICE.err='';VOICE.final='';VOICE.interim='';VOICE.sendAt=0;
  const box=document.getElementById('pr-msg');VOICE.base=((box&&box.value)||state.drafts['pr-msg']||'').trim();
  voiceStart();
}
function voiceStart(){
  const R=SR();if(!R||!VOICE.want)return;if(VOICE.rec){try{VOICE.rec.onend=null;VOICE.rec.abort()}catch(e){}}
  const r=new R();r.lang='en-US';r.interimResults=true;r.continuous=true;r.maxAlternatives=1;
  r.onresult=e=>{let int='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal)VOICE.final=(VOICE.final+' '+x[0].transcript).trim();else int+=x[0].transcript}
    VOICE.interim=int.trim();voiceHeard()};
  r.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){VOICE.want=false;VOICE.err='Allow the microphone for this site in your browser, then try again.'}else if(e.error==='audio-capture'){VOICE.want=false;VOICE.err='No microphone found.'}voiceBits()};
  r.onend=()=>{VOICE.rec=null;if(VOICE.want&&!VOICE.sending){const now=Date.now();VOICE.ends=(VOICE.ends||[]).filter(t=>now-t<6000).concat(now);setTimeout(()=>{if(VOICE.want&&!VOICE.rec)voiceStart()},VOICE.ends.length>5?1200:150);return}VOICE.listening=false;voiceBits()};
  try{r.start();VOICE.rec=r;VOICE.listening=true}catch(e){VOICE.err='Couldn’t start the microphone.';VOICE.want=false;VOICE.listening=false}
  voiceBits();
}
function voiceHeard(){
  const t=[VOICE.base,VOICE.final,VOICE.interim].filter(Boolean).join(' ').trim();state.drafts['pr-msg']=t;
  const box=document.getElementById('pr-msg');if(box&&document.activeElement!==box)box.value=t;
  clearTimeout(VOICE.silT);clearInterval(VOICE.tickT);const ss=silenceSec();
  if(ss&&t){VOICE.sendAt=Date.now()+ss*1000;VOICE.silT=setTimeout(voiceSendNow,ss*1000);VOICE.tickT=setInterval(voiceBits,500)}else VOICE.sendAt=0;
  voiceBits();
}
function voiceSendNow(){
  clearTimeout(VOICE.silT);clearInterval(VOICE.tickT);VOICE.sendAt=0;
  const box=document.getElementById('pr-msg');const t=((box&&box.value)||state.drafts['pr-msg']||'').trim();
  VOICE.want=false;VOICE.sending=true;if(VOICE.rec){try{VOICE.rec.onend=null;VOICE.rec.abort()}catch(e){}VOICE.rec=null}
  VOICE.listening=false;VOICE.final='';VOICE.interim='';VOICE.base='';VOICE.sending=false;voiceBits();
  if(t&&state.voiceOn&&state.practiceId){state.drafts['pr-msg']=t;A['pr-send']()}
}
function voiceStopListening(){VOICE.want=false;clearTimeout(VOICE.silT);clearInterval(VOICE.tickT);VOICE.sendAt=0;if(VOICE.rec){try{VOICE.rec.onend=null;VOICE.rec.stop()}catch(e){}VOICE.rec=null}VOICE.listening=false;voiceBits()}
function stopSpeaking(){VOICE.tok=(VOICE.tok||0)+1;if(VOICE.audio){const a=VOICE.audio;a.onended=a.onerror=null;try{a.pause()}catch(e){}VOICE.audio=null}try{speechSynthesis.cancel()}catch(e){}VOICE.speaking=false}
/* agents sometimes write stage directions ("*sighs, sounding busy*"); never read those out loud */
const CUE_RE=/^(?:[a-z]+ly\s+)?(sigh|laugh|chuckl|pause|paus|clear|groan|exhal|inhal|smil|grin|frown|sound|tone|beat|scoff|typ|mutter|lean|shuffl|hesitat|cough|snort|whisper|nod|shrug|rustl|sip|tap|look|glanc|wince|rais|lower|speak|say|said|voice|busy|annoy|irritat|impatient|warm|friend|curt|flat|dry|skeptic|interrupt|over|chuckling|laughing|sighing)/i;
function cleanSpoken(t,forV3){
  let s=String(t||'');
  const tag=c=>{if(!forV3)return ' ';const m=String(c).toLowerCase();return m.includes('sigh')?' [sighs] ':/laugh|chuckl/.test(m)?' [laughs] ':m.includes('whisper')?' [whispers] ':' '};
  s=s.replace(/\*{1,2}([^*\n]{1,140})\*{1,2}/g,(_,c)=>tag(c));
  s=s.replace(/\[([^\]\n]{1,80})\]/g,(_,c)=>forV3&&/^(sighs|laughs|whispers)$/i.test(c.trim())?' ['+c.trim().toLowerCase()+'] ':tag(c));
  s=s.replace(/\(([^)\n]{1,90})\)/g,(m,c)=>CUE_RE.test(c.trim())&&!/\d/.test(c)?tag(c):m);
  s=s.replace(/(^|\n)\s*_([^_\n]{1,120})_\s*/g,(m,a,c)=>CUE_RE.test(c.trim())?a+tag(c):m);
  s=s.replace(/^\s*[A-Z][a-z]+(?: [A-Z][a-z]+)?:\s+/,'');
  return s.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.!?])/g,'$1').replace(/^[\s,.]+/,'').trim();
}
async function speakAgent(text,persona){
  text=String(text||'');if(!state.voiceOn||!cleanSpoken(text))return;stopSpeaking();const tok=VOICE.tok;VOICE.speaking=true;voiceBits();
  const done=()=>{if(tok!==VOICE.tok)return;VOICE.tok++;VOICE.speaking=false;VOICE.audio=null;voiceBits();if(state.voiceOn&&voiceSet().handsFree!==false&&state.practiceId&&!(state.practice[state.practiceId]||{}).feedback)setTimeout(voiceListen,250)};
  const key=secrets().elevenKey;const V=voiceSet();
  if(key){
    const vid=(V.voices&&V.voices[persona])||V.voice||DEFAULT_VOICE;
    const call=model=>fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},body:JSON.stringify(Object.assign({text:cleanSpoken(text,model==='eleven_v3').slice(0,2500)},model?{model_id:model}:{}))});
    try{
      let r=await call(V.model||'eleven_flash_v2_5');if(!r.ok&&(r.status===400||r.status===422||r.status===404))r=await call(null);
      if(!r.ok){let m='';try{const j=await r.json();m=(j.detail&&(j.detail.message||j.detail.status))||''}catch(e){}throw new Error(r.status===401?'ElevenLabs rejected the API key.':m||('ElevenLabs error '+r.status))}
      const blob=await r.blob();if(tok!==VOICE.tok)return;const url=URL.createObjectURL(blob);const au=new Audio(url);VOICE.audio=au;
      au.onended=()=>{URL.revokeObjectURL(url);done()};au.onerror=()=>{URL.revokeObjectURL(url);done()};
      await au.play();return;
    }catch(e){if(tok!==VOICE.tok)return;VOICE.err=String(e.message||e)+' Using the browser voice instead.'}
  }
  try{const u=new SpeechSynthesisUtterance(cleanSpoken(text));u.lang='en-US';u.rate=1.03;const vs=speechSynthesis.getVoices().filter(v=>/en-US/i.test(v.lang));if(vs.length)u.voice=vs[(persona||'').length%vs.length];u.onend=done;u.onerror=done;speechSynthesis.speak(u)}catch(e){done()}
}
async function loadVoices(){
  const key=secrets().elevenKey;if(!key){toast('Paste your ElevenLabs API key first.');return}
  state.busy.voices={label:'Loading your ElevenLabs voices…'};render();
  try{const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':key}});if(r.status===401)throw new Error('ElevenLabs rejected the API key.');if(!r.ok)throw new Error('ElevenLabs error '+r.status);
    const j=await r.json();VOICE.voices=(j.voices||[]).map(v=>({id:v.voice_id,name:v.name,labels:v.labels||{}}));
    const V=state.settings.voice=state.settings.voice||{};V.voices=V.voices||{};const pool=VOICE.voices;
    Object.keys(PERSONAS).forEach((p,i)=>{if(!V.voices[p]&&pool.length)V.voices[p]=pool[i%pool.length].id});
    saveSettings();toast(`${VOICE.voices.length} voices loaded. Pick one for each agent type.`)}
  catch(e){toast(String(e.message||e),5200)}finally{delete state.busy.voices;render()}
}
function voicePanelHTML(){
  const V=voiceSet();const sec=secrets();const vs=VOICE.voices;const n=esc(negName());
  const sel=p=>{const cur=(V.voices&&V.voices[p])||'';return vs&&vs.length?`<select class="input" id="vv-${p}" data-fs="voice.voices.${p}" data-t="text">${vs.map(v=>`<option value="${esc(v.id)}" ${cur===v.id?'selected':''}>${esc(v.name)}${v.labels.gender?' · '+esc(v.labels.gender):''}${v.labels.accent?' · '+esc(v.labels.accent):''}</option>`).join('')}</select>`:`<input class="input" id="vv-${p}" data-fs="voice.voices.${p}" data-t="text" value="${esc(cur)}" placeholder="voice ID (or load your voices)">`};
  return `<details class="card" id="voice-setup" ${sec.elevenKey?'':'open'}><summary style="font-weight:800">${ico('practice')} Voice: talk to the agent out loud${sec.elevenKey?' <span class="tag green">ElevenLabs connected</span>':''}</summary>
  <div style="display:grid;gap:12px;margin-top:12px">
  <p class="small muted">Your microphone turns your words into text in the browser. The agent answers out loud with an ElevenLabs voice (or the browser’s built-in voice if you skip the key). You still get the graded prep sheet when you end the call.</p>
  <div class="grid-fields"><label class="field"><span>ElevenLabs API key</span><input class="input" type="password" id="sec-eleven" data-sec="elevenKey" value="${esc(sec.elevenKey||'')}" placeholder="sk_…" autocomplete="off" spellcheck="false"></label>
  <label class="field"><span>Speed vs quality</span><select class="input" id="st-voice-model" data-fs="voice.model" data-t="text">${[['eleven_flash_v2_5','Flash (fastest replies)'],['eleven_multilingual_v2','Multilingual v2 (richer voice)'],['eleven_v3','Eleven v3 (most expressive)']].map(([v,l])=>`<option value="${v}" ${(V.model||'eleven_flash_v2_5')===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
  <div class="row"><button class="btn sm" data-act="voices-load" ${sec.elevenKey?'':'disabled'}>${ico('refresh')}Load my voices</button>${busyHTML('voices',false)}<span class="xs muted">Get a key in ElevenLabs → Developers → API keys. It’s saved like your Anthropic key.</span></div>
  <div class="grid-fields">${Object.entries(PERSONAS).map(([k,p])=>`<label class="field"><span>${esc(p.label)}</span>${sel(k)}</label>`).join('')}</div>
  <label class="field"><span>Send what I said after</span><select class="input" id="st-voice-sil" data-fs="voice.silenceSec" data-t="text">${[['2','2 seconds of silence'],['3','3 seconds of silence'],['5','5 seconds of silence'],['7','7 seconds of silence'],['10','10 seconds of silence'],['manual','Only when I tap Send']].map(([v,l])=>`<option value="${v}" ${String(V.silenceSec??7)===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label class="check"><input type="checkbox" id="st-voice-hf" data-fs="voice.handsFree" data-t="bool" ${V.handsFree!==false?'checked':''}><span>Hands-free: start listening again after each reply</span></label>
  ${SR()?'':'<div class="note amber">This browser can’t turn speech into text. Use Chrome, Edge or Safari for voice.</div>'}
  </div></details>`;
}
function voiceBarHTML(s){
  if(!s||s.feedback)return '';
  return `<div class="voicebar"><button class="mic ${VOICE.listening?'on':''} ${VOICE.speaking?'talking':''}" id="mic-btn" data-act="mic" aria-pressed="${VOICE.listening}" aria-label="${VOICE.listening?'Stop listening':'Talk'}">${ico('practice')}</button>
  <div style="min-width:0;flex:1"><div class="row" style="gap:8px"><b>${state.voiceOn?'Voice call':'Typing'}</b><button class="linkbtn" data-act="voice-mode">${state.voiceOn?'Switch to typing':'Switch to voice'}</button></div><div class="small" id="voice-status">${voiceStatusHTML()}</div></div>${state.voiceOn?`<label class="vsil"><span class="xs muted">Auto-send</span><select class="input" id="vb-sil" data-fs="voice.silenceSec" data-t="text" aria-label="Send after silence">${[['2','2s'],['3','3s'],['5','5s'],['7','7s'],['10','10s'],['manual','Off']].map(([v,l])=>`<option value="${v}" ${String(voiceSet().silenceSec??7)===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}</div>`;
}
