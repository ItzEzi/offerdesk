/* ================= Preview offer (review, rewrite, send) ================= */
const REWRITES=[
  {id:'short',label:'Shorter and to the point',ins:'Make it shorter and to the point: at most 90 words in the email and 200 characters in the text. Keep the price, the terms and the one-line math.'},
  {id:'engage',label:'Make it engaging',ins:'Make it more engaging and personal: mention one specific detail from the listing, keep it warm and confident, still brief.'},
  {id:'creative',label:'Add creative option',ins:'Keep the cash offer as option 1. Add a short option 2: seller financing (higher price, small down payment, monthly payments) within the limits given. Explain in one sentence how the seller can net more with option 2.'},
  {id:'firm',label:'Firmer tone',ins:'Make the tone firmer and more businesslike. Fewer words, no softening phrases.'}
];
function offerCap(d,c){const dr=d.draft;return dr&&(dr.creative||dr.action==='creative')?c.sfCap:c.mao}
function offerModalHTML(m){
  const d=state.deals[m.id];if(!d)return '';const c=calc(d);const dr=d.draft&&!(d.draft.sent&&(d.draft.sent.email||d.draft.sent.sms))?d.draft:null;const n=esc(negName());
  const L=curList(d);const ag=d.agent||{};const busy=state.busy['deal:'+d.id]||state.busy['rw:'+d.id];
  const tile=(lab,val,sub,cls)=>`<div class="otile ${cls||''}"><span class="lab">${lab}</span><b class="tnum">${val}</b>${sub?`<span class="xs muted">${sub}</span>`:''}</div>`;
  const head=`<div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><h2>${ourCount(d)?'Preview next offer':'Preview offer'}</h2><p class="small muted">${esc([streetOf(d.address),d.city,d.state,d.zip].filter(Boolean).join(', '))}${d.year?' · built '+d.year:''}${d.sqft?' · '+numFmt(d.sqft)+' sqft':''}${d.beds?' · '+d.beds+' bd':''}${d.baths?' / '+d.baths+' ba':''}</p></div><button class="btn ghost sm" data-act="modal-close" aria-label="Close">${ico('close')}</button></div>`;
  if(!dr)return `${head}<div class="note">${busy?'':'No draft yet.'}</div>${busyHTML('deal:'+d.id)}${!busy?`<button class="btn primary" data-act="offer-preview">${ico('spark')}Ask ${n} to write it</button>`:''}`;
  const P=dr.price;const cap=offerCap(d,c);const over=P!=null&&cap!=null&&P>cap;const under=P!=null&&L?(L-P)/L:null;
  const guard=[...ceilingCheck(dr.email&&dr.email.body,d,c,cap,dr),...ceilingCheck(dr.sms,d,c,cap,dr)];
  const stale=dr.letterPrice!=null&&P!=null&&dr.letterPrice!==P;
  const left=`<div class="ocol"><span class="olab">The deal</span><div class="otiles">${tile(d.source==='wholesaler'?'Asking':'Asking',money(L),priceDropped(d)?'down from '+moneyK(origList(d)):'')}${tile('ARV',money(c.A),d.arvSource==='comps'?'from comps':d.arvSource==='maya'?n+'’s estimate':d.arvSource==='wholesaler'?'wholesaler’s claim':'your number','green')}${tile('Rehab',money(d.rehab),d.rehabSource==='maya'?'from the inspection':'','orange')}${(d.rent||d.rentEst)?tile('Rent / mo',money(d.rent||d.rentEst),d.rent?'':'estimate','blue'):''}</div>
    <div class="oagent"><span class="small muted">${d.source==='wholesaler'?'Wholesaler':'Listing agent'}</span><b>${esc((ag.name||'Unknown').replace(/\s*\(example\)/i,''))}</b>${ag.email?`<span class="xs muted">${esc(ag.email)}</span>`:`<input class="input" id="of-email" data-fd="agent.email" placeholder="Their email, so ${n} can send it" inputmode="email">`}</div>
    <span class="olab">Your offer</span>
    <label class="field"><span>Offer amount: what the agent receives</span><input class="input big tnum ${over?'bad':''}" id="of-price" data-fd="draft.price" data-t="num" value="${P??''}" inputmode="numeric"></label>
    <span class="xs muted">${under!=null?(under>=0?pct(under,0)+' under asking':pct(-under,0)+' over asking'):''}</span>
    <label class="field"><span>Your max: ${n} negotiates up to here and stops</span><input class="input tnum" id="of-max" data-fd="lockedMao" data-t="num" value="${d.lockedMao??''}" placeholder="${c.mao}" inputmode="numeric"></label>
    <span class="xs muted">${d.lockedMao?`Locked by you. Calculated ceiling ${money(c.maoCalc)}.`:`Calculated from your buy box: ${money(c.mao)}. Type a number to lock your own.`}${dr.creative?` Seller-finance cap ${money(c.sfCap)}.`:''}</span>
    ${over?`<div class="note red">The offer is above your max. Lower the offer or raise your max.</div>`:''}</div>`;
  const ce=canEmail(d);const sent=dr.sent||{};
  const right=`<div class="ocol"><div class="row" style="justify-content:space-between"><span class="olab">The letter</span><span class="xs muted">${dr.rewrites?dr.rewrites+' rewrite'+(dr.rewrites>1?'s':''):''}</span></div>
    <input class="input" id="of-subj" data-fd="draft.email.subject" value="${esc(dr.email&&dr.email.subject)}" aria-label="Subject">
    <textarea class="input letter" id="of-body" data-fd="draft.email.body" rows="12" aria-label="Email">${esc(dr.email&&dr.email.body)}</textarea>
    ${stale?`<div class="note amber row" style="justify-content:space-between"><span>The offer changed. ${n} will rewrite the letter for ${money(P)}.</span><button class="btn sm" data-act="offer-rewrite" data-q="price" ${busy?'disabled':''}>Rewrite</button></div>`:''}
    ${guard.length?`<div class="note red"><b>Ceiling guard:</b> the letter mentions ${guard.map(money).join(', ')}, above your max of ${money(cap)}. Rewrite or edit it before sending.</div>`:''}
    <div class="qchips" style="padding:0">${REWRITES.filter(r=>r.id!=='creative'||state.settings.creative.enabled).map(r=>`<button class="qchip ${r.id==='creative'?'purple':'blue'}" data-act="offer-rewrite" data-q="${r.id}" ${busy?'disabled':''}>${esc(r.label)}</button>`).join('')}</div>
    <div class="chat-in" style="padding:0;border:0"><input class="input" id="of-ins" data-draft value="${esc(state.drafts['of-ins']||'')}" placeholder="Ask ${n} to change the letter…"><button class="btn sm" data-act="offer-rewrite" data-q="custom" ${busy?'disabled':''}>${ico('spark')}Ask ${n}</button></div>
    ${busyHTML('rw:'+d.id,false)}${busyHTML('deal:'+d.id,false)}
    <details id="of-smsd"><summary>Text message version (${(dr.sms||'').length} chars)</summary><textarea class="input" id="of-sms" data-fd="draft.sms" rows="3" style="margin-top:6px">${esc(dr.sms)}</textarea></details></div>`;
  const notify=state.settings.notify||{};const ccTo=notify.email||state.settings.profile.email;
  const foot=`<div class="ofoot"><div class="row" style="gap:10px">${switchHTML(d.autopilot,'autopilot',d.id,'Autopilot for this deal')}<span class="small"><b>${n} autopilot</b><span class="muted"> · replies, negotiates up to your max, follows up</span></span></div>
    ${ccTo&&ce?`<label class="check small"><input type="checkbox" id="of-cc" data-fs="notify.ccMe" data-t="bool" ${notify.ccMe?'checked':''}><span>CC me (${esc(ccTo)})</span></label>`:''}
    <span class="spacer"></span><button class="btn ghost" data-act="modal-close">Cancel</button>
    ${ce?`<button class="btn green" data-act="offer-send" ${over||guard.length||busy||P==null||sent.email?'disabled':''}>${ico('send')}Send offer ${money(P)}</button>`:`<a class="btn" href="mailto:${encodeURIComponent(ag.email||'')}?subject=${encodeURIComponent((dr.email&&dr.email.subject)||'')}&body=${encodeURIComponent((dr.email&&dr.email.body)||'')}" target="_blank" rel="noopener">${ico('mail')}Open in mail app</a><button class="btn green" data-act="offer-mark" ${over||P==null?'disabled':''}>${ico('check')}I sent it</button>`}</div>
    ${!ce?`<p class="xs muted">${gmailOn()?'Add their email above so '+n+' can send it from '+esc(sendEmail())+'.':'Connect Gmail so '+n+' can send it herself.'}</p>`:''}`;
  return `${head}<div class="ogrid">${left}${right}</div>${foot}`;
}
async function openOfferPreview(id){
  const d=state.deals[id];if(!d)return;const c=calc(d);
  if(!c.ready){toast('Add an ARV first so '+negName()+' knows your ceiling.');return}
  state.modal={type:'offer',id};render();
  const dr=d.draft;const usable=dr&&!(dr.sent&&(dr.sent.email||dr.sent.sms));
  if(usable)return;
  if(!ourCount(d))await aiOpening(id);
  else{const f=followDue(d);if(!replyWaiting(d)&&f&&f.overdue)await aiFollow(id,false);else await aiReply(id)}
}
function promptRewrite(d,c,instruction,P){
  const dr=d.draft;const cr=state.settings.creative;
  return `You edit offer letters for a real estate investor. Rewrite the email and the text message below by following the instruction.

${dealFacts(d,c)}

Rules:
- The cash offer price is exactly ${money(P)}. It is the only cash price you may state. Never mention or hint at a maximum, ceiling or budget.
- Keep the terms, the facts and the one or two sentences of math that explain the number. Do not invent facts.
- ${cr.enabled?`If you add seller financing: price up to ${money(c.sfCap)}, at most ${cr.maxDownPct}% down, interest up to ${cr.maxRate}%, ${cr.termYears}-year amortization.`:'Do not offer seller financing.'}
- Email opens with "Hi ${firstName(d)},". Text under 320 characters.
${signRules()}

INSTRUCTION: ${instruction}

Current subject: ${(dr.email&&dr.email.subject)||''}
Current email:
"""${((dr.email&&dr.email.body)||'').slice(0,4000)}"""
Current text: """${(dr.sms||'').slice(0,600)}"""

Reply with only JSON: {"email":{"subject":"...","body":"..."},"sms":"..."}`;
}
async function aiRewrite(id,q){
  const d=state.deals[id];if(!d||!d.draft)return;const c=calc(d);const P=d.draft.price;
  let ins;if(q==='price')ins=`Change the offer price to ${money(P)} everywhere it appears and update the math sentence to match. Keep everything else.`;
  else if(q==='custom'){ins=(state.drafts['of-ins']||'').trim();if(!ins){toast('Type what to change first.');return}}
  else ins=(REWRITES.find(r=>r.id===q)||{}).ins;if(!ins)return;
  const res=await runAI('rw:'+id,`${negName()} is rewriting the letter…`,(ai,signal)=>ai.json(promptRewrite(d,c,ins,P),{signal}));
  if(!res)return;const dd=state.deals[id];if(!dd||!dd.draft)return;
  dd.draft.email={subject:String(res.email&&res.email.subject||dd.draft.email.subject||''),body:String(res.email&&res.email.body||dd.draft.email.body||'')};
  dd.draft.sms=String(res.sms||dd.draft.sms||'');dd.draft.letterPrice=P;dd.draft.rewrites=(dd.draft.rewrites||0)+1;
  if(q==='creative')dd.draft.creative=true;if(q==='custom')state.drafts['of-ins']='';
  saveDeal(dd);
}
