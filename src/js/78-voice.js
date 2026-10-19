/* ================= voice practice (your mic in, ElevenLabs voice out) ================= */
const VOICE={rec:null,listening:false,speaking:false,audio:null,interim:'',final:'',voices:null,err:''};
const DEFAULT_VOICE='JBFqnCBsd6RMkjVDRZzb';
const voiceSet=()=>state.settings.voice||{};
const SR=()=>window.SpeechRecognition||window.webkitSpeechRecognition||null;
function voiceBits(){const el=document.getElementById('voice-status');if(el)el.innerHTML=voiceStatusHTML();const b=document.getElementById('mic-btn');if(b){b.classList.toggle('on',VOICE.listening);b.classList.toggle('talking',VOICE.speaking);b.setAttribute('aria-pressed',String(VOICE.listening))}}
function voiceStatusHTML(){
  if(VOICE.speaking)return `<span class="vdot talk"></span>The agent is talking… <button class="linkbtn" data-act="voice-stop">Interrupt</button>`;
  if(VOICE.listening)return `<span class="vdot rec"></span>Listening… ${VOICE.interim?`<span class="muted">“${esc(VOICE.interim)}”</span>`:'<span class="muted">say your line</span>'}`;
  if(state.busy['pr-chat'])return `<span class="vdot"></span>The agent is thinking…`;
  return VOICE.err?`<span class="vdot err"></span>${esc(VOICE.err)}`:`Tap the mic and talk. ${voiceSet().handsFree!==false?'It keeps listening after each reply until you tap it again.':''}`;
}
function voiceListen(){
  const R=SR();if(!R){VOICE.err='Voice needs Chrome, Edge or Safari. You can still type.';voiceBits();return}
  stopSpeaking();if(VOICE.rec){try{VOICE.rec.abort()}catch(e){}}
  const r=new R();r.lang='en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
  VOICE.final='';VOICE.interim='';VOICE.err='';
  r.onresult=e=>{let fin='',int='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal)fin+=x[0].transcript;else int+=x[0].transcript}if(fin)VOICE.final+=fin;VOICE.interim=(VOICE.final+' '+int).trim();voiceBits()};
  r.onerror=e=>{VOICE.err=e.error==='not-allowed'||e.error==='service-not-allowed'?'Allow the microphone for this site in your browser, then try again.':e.error==='no-speech'?'Didn’t hear anything. Tap the mic to try again.':'';voiceBits()};
  r.onend=()=>{VOICE.listening=false;VOICE.rec=null;const t=VOICE.final.trim();VOICE.interim='';VOICE.final='';voiceBits();
    if(t&&state.voiceOn&&state.practiceId){state.drafts['pr-msg']=t;A['pr-send']()}};
  try{r.start();VOICE.rec=r;VOICE.listening=true}catch(e){VOICE.err='Couldn’t start the microphone.'}
  voiceBits();
}
function voiceStopListening(){if(VOICE.rec){try{VOICE.rec.stop()}catch(e){}}}
function stopSpeaking(){VOICE.tok=(VOICE.tok||0)+1;if(VOICE.audio){const a=VOICE.audio;a.onended=a.onerror=null;try{a.pause()}catch(e){}VOICE.audio=null}try{speechSynthesis.cancel()}catch(e){}VOICE.speaking=false}
async function speakAgent(text,persona){
  if(!state.voiceOn||!text)return;stopSpeaking();const tok=VOICE.tok;VOICE.speaking=true;voiceBits();
  const done=()=>{if(tok!==VOICE.tok)return;VOICE.tok++;VOICE.speaking=false;VOICE.audio=null;voiceBits();if(state.voiceOn&&voiceSet().handsFree!==false&&state.practiceId&&!(state.practice[state.practiceId]||{}).feedback)setTimeout(voiceListen,250)};
  const key=secrets().elevenKey;const V=voiceSet();
  if(key){
    const vid=(V.voices&&V.voices[persona])||V.voice||DEFAULT_VOICE;
    const call=model=>fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},body:JSON.stringify(Object.assign({text:String(text).slice(0,2500)},model?{model_id:model}:{}))});
    try{
      let r=await call(V.model||'eleven_flash_v2_5');if(!r.ok&&(r.status===400||r.status===422||r.status===404))r=await call(null);
      if(!r.ok){let m='';try{const j=await r.json();m=(j.detail&&(j.detail.message||j.detail.status))||''}catch(e){}throw new Error(r.status===401?'ElevenLabs rejected the API key.':m||('ElevenLabs error '+r.status))}
      const blob=await r.blob();if(tok!==VOICE.tok)return;const url=URL.createObjectURL(blob);const au=new Audio(url);VOICE.audio=au;
      au.onended=()=>{URL.revokeObjectURL(url);done()};au.onerror=()=>{URL.revokeObjectURL(url);done()};
      await au.play();return;
    }catch(e){if(tok!==VOICE.tok)return;VOICE.err=String(e.message||e)+' Using the browser voice instead.'}
  }
  try{const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=1.03;const vs=speechSynthesis.getVoices().filter(v=>/en-US/i.test(v.lang));if(vs.length)u.voice=vs[(persona||'').length%vs.length];u.onend=done;u.onerror=done;speechSynthesis.speak(u)}catch(e){done()}
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
  <label class="check"><input type="checkbox" id="st-voice-hf" data-fs="voice.handsFree" data-t="bool" ${V.handsFree!==false?'checked':''}><span>Hands-free: start listening again after each reply</span></label>
  ${SR()?'':'<div class="note amber">This browser can’t turn speech into text. Use Chrome, Edge or Safari for voice.</div>'}
  </div></details>`;
}
function voiceBarHTML(s){
  if(!s||s.feedback)return '';
  return `<div class="voicebar"><button class="mic ${VOICE.listening?'on':''} ${VOICE.speaking?'talking':''}" id="mic-btn" data-act="mic" aria-pressed="${VOICE.listening}" aria-label="${VOICE.listening?'Stop listening':'Talk'}">${ico('practice')}</button>
  <div style="min-width:0;flex:1"><div class="row" style="gap:8px"><b>${state.voiceOn?'Voice call':'Typing'}</b><button class="linkbtn" data-act="voice-mode">${state.voiceOn?'Switch to typing':'Switch to voice'}</button></div><div class="small" id="voice-status">${voiceStatusHTML()}</div></div></div>`;
}
