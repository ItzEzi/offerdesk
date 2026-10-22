/* ================= actions ================= */
const A={};
document.addEventListener('click',e=>{
  if(state.bellOpen&&!e.target.closest('.bell-pop')&&!e.target.closest('[data-act="bell"]')){state.bellOpen=false;render()}
  if(e.target.closest('input,select,textarea'))return;
  const el=e.target.closest('[data-act]');if(!el)return;
  if(el.tagName==='A')return;
  if(DICT.want&&el.dataset.act!=='dict')dictStop();/* any button (Send, Save…) takes what was said so far */
  const fn=A[el.dataset.act];if(fn){e.preventDefault();fn(el,e)}
});
const D=()=>(state.modal&&state.modal.id&&state.deals[state.modal.id])||cur();
A.bell=()=>{state.bellOpen=!state.bellOpen;if(state.bellOpen){state.conn.seenAt=nowISO();saveConn()}render()};
A['stop-ai']=el=>{const b=state.busy[el.dataset.key];if(b&&b.ctl)b.ctl.abort()};
A.open=el=>{const d=state.deals[el.dataset.id];if(!d)return;state.bellOpen=false;state.logKind='in';if(d.source==='wholesaler'&&!d.reviewed){d.reviewed=true;saveDeal(d,true)}go('deal',d.id)};
A['open-chat']=el=>{state.mayaTab='chat';A.open(el)};
A.star=el=>{const d=state.deals[el.dataset.id||state.dealId];if(!d)return;d.starred=!d.starred;saveDeal(d)};
A.fav=el=>{const d=state.deals[el.dataset.id];if(!d)return;d.favorite=!d.favorite;saveDeal(d)};
A.autopilot=el=>{const d=state.deals[el.dataset.id];if(!d)return;d.autopilot=!d.autopilot;d.needsYou=d.autopilot?d.needsYou:null;saveDeal(d);
  if(d.autopilot&&!state.settings.auto.enabled)toast(`Autopilot is set for this deal. Turn on the master switch in Connect → Autopilot so ${negName()} starts.`,5200);
  else if(d.autopilot&&!(canEmail(d)||canText(d)))toast(`${negName()} has no way to reach them yet: add their email, and connect Gmail or texting.`,5200);
  else if(d.autopilot)toast(`Autopilot on. ${negName()} picks this up on her next run.`)};
A['auto-master']=()=>{state.settings.auto.enabled=!state.settings.auto.enabled;saveSettings();toast(state.settings.auto.enabled?`Autopilot on. ${negName()} runs every 3 minutes while OfferDesk is open${cloudOn()?' on any of your devices':' in this tab'}.`:'Autopilot off.');if(state.settings.auto.enabled)setTimeout(()=>tick(false),400)};
A['run-auto']=()=>autopilotRun(true);
A['list-mode']=el=>{state.settings.ui.listMode=el.dataset.v;saveSettings()};
A.page=el=>{state.page=+el.dataset.v;render()};
A['clear-lf']=()=>{state.lf={q:'',source:'all',stage:'all',status:'all',sentiment:'all',type:'all',beds:'any',price:'any',state:'all',special:'all',autopilot:'all'};state.page=1;render()};
A.goto=el=>{const t=document.getElementById(el.dataset.v);if(t)t.scrollIntoView({behavior:'smooth',block:'start'})};

/* add listing */
A['add-deal']=()=>{state.drafts['mf-paste']='';state.modal={type:'add',mode:'paste',form:{source:'mls',state:homeState()||'',autopilot:!!state.settings.auto.newDealsOn}};render()};
A['modal-close']=()=>{state.modal=null;render()};
A['modal-mode']=el=>{state.modal.mode=el.dataset.v;render()};
A['mf-source']=el=>{state.modal.form.source=el.dataset.v;render()};
A['modal-parse']=async()=>{const t=(state.drafts['mf-paste']||'').trim();if(!t){toast('Paste the listing first.');return}
  const res=await runAI('add','Reading the listing…',(ai,signal)=>ai.json(P_LISTING(t),{signal,modelTier:'quick'}));
  if(!res||!state.modal)return;const F=state.modal.form;const ag=res.agent||{};
  Object.assign(F,{address:res.address||F.address,city:res.city||F.city,state:res.state||zipState(res.zip)||F.state||homeState()||'',zip:res.zip||F.zip,listPrice:parseNum(res.listPrice)??F.listPrice,beds:parseNum(res.beds)??F.beds,baths:parseNum(res.baths)??F.baths,sqft:parseNum(res.sqft)??F.sqft,lotSqft:parseNum(res.lotSqft)??F.lotSqft,year:parseNum(res.year)??F.year,dom:parseNum(res.daysOnMarket)??F.dom,description:res.description||F.description,agentName:ag.name||F.agentName,agentEmail:ag.email||F.agentEmail,agentPhone:ag.phone||F.agentPhone,brokerage:ag.brokerage||'',listedDate:res.listedDate||'',rent:parseNum(res.rent),propertyType:PROP_TYPES[res.propertyType]?res.propertyType:'single_family',mlsStatus:MLS_STATUS[res.mlsStatus]?res.mlsStatus:'for_sale',mlsId:res.mlsId||'',
    history:(res.priceHistory||[]).map(p=>({date:p.date,price:parseNum(p.price)})).filter(p=>p.date&&p.price),histEvents:(res.history||[]).filter(e=>e&&e.date&&HEV[e.event]).map(e=>({date:isoDay(e.date),event:e.event,price:parseNum(e.price),src:'listing page'})),photoUrls:(res.photoUrls||[]).filter(u=>/^https:\/\//.test(u)).slice(0,24)});
  state.modal.mode='type';render();toast('Check the details, then add it.')};
A['modal-save']=()=>{const F=state.modal.form;if(!(F.address||'').trim()){toast('Add the street address.');return}
  const lp=parseNum(F.listPrice);let hist=(F.history||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(lp!=null&&(!hist.length||hist[hist.length-1].price!==lp))hist.push({date:nowISO(),price:lp});
  hist=hist.map(h=>({date:new Date(h.date).toISOString(),price:h.price})).filter(h=>!isNaN(new Date(h.date)));
  const d=newDeal({source:F.source||'mls',mlsStatus:F.source==='wholesaler'?'off_market':(F.mlsStatus||'for_sale'),mlsId:F.mlsId||'',propertyType:F.propertyType||'single_family',address:F.address.trim(),city:F.city||'',state:F.state||zipState(F.zip)||homeState()||'',zip:F.zip||'',listPrice:lp,priceHistory:hist,arv:parseNum(F.arv),arvSource:parseNum(F.arv)?'you':null,rehab:parseNum(F.rehab),beds:parseNum(F.beds),baths:parseNum(F.baths),sqft:parseNum(F.sqft),lotSqft:parseNum(F.lotSqft),year:parseNum(F.year),rent:F.rent||null,description:F.description||'',listingUrl:F.listingUrl||'',listedDate:F.listedDate?new Date(F.listedDate).toISOString():null,domAtAdd:F.listedDate?null:parseNum(F.dom),agent:{name:F.agentName||'',email:F.agentEmail||'',phone:F.agentPhone||'',brokerage:F.brokerage||''},wholesalerName:F.source==='wholesaler'?F.agentName||'':'',autopilot:!!F.autopilot,reviewed:true});
  if((F.photoUrls||[]).length){d.photoUrls=F.photoUrls;d.thumbUrl=F.photoUrls[0]}
  if((F.histEvents||[]).length)d.history=F.histEvents;
  state.modal=null;saveDeal(d,true);logActivity(d.id,'deal',`Added ${streetOf(d.address)}.`);go('deal',d.id);
  toast(d.arv?'Added. Your ceiling is set.':`Added. Add photos and run ${negName()}’s inspection, or enter the ARV, to get a ceiling.`,4200)};
A['confirm-yes']=()=>{const m=state.modal;state.modal=null;if(m&&m.run)m.run();render()};
A['confirm-yes2']=()=>{const m=state.modal;state.modal=null;if(m&&m.run2)m.run2();render()};
A['ask-fab']=()=>{state.modal={type:'ask'};render()};
A['ask-go']=async()=>{dictStop();const q=(state.drafts['ask-q']||'').trim();if(!q)return;
  const leads=Object.values(state.deals).filter(d=>d.stage!=='dead').slice(0,40).map(d=>{const c=calc(d);return `- ${streetOf(d.address)}, ${d.city||''} | ${d.source} | asking ${money(curList(d))} | ARV ${money(d.arv)} | rehab ${money(d.rehab)} | rent ${money(d.rent||d.rentEst)} | ceiling ${c.ready?money(c.mao):'n/a'} | tags ${dealTags(d).join(',')} | wholesaler ${d.wholesalerName||''} | stage ${d.stage}`}).join('\n');
  const res=await runAI('ask',`${negName()} is looking at your deals…`,(ai,signal)=>ai.text(`You are ${negName()}, an acquisitions analyst for a DFW investor. Their buy box: flip target ROI ${state.settings.buy.targetRoi}%, min profit ${money(state.settings.buy.minProfit)}, wholesale fee ${money(state.settings.buy.wsFee)}. Answer the question using only these deals. Be brief and specific, name addresses.\n\nDeals:\n${leads}\n\nQuestion: ${q}`,{signal}));
  if(res&&state.modal)state.modal.answer=res.text;render()};

/* deal page */
A['one-pager']=()=>onePager(state.dealId);
A['practice-deal']=()=>{state.drafts['pr-deal']=state.dealId;go('practice')};
A.strat=el=>{const d=D();d.strategy=el.dataset.v;saveDeal(d)};
A.source=el=>{const d=D();d.source=el.dataset.v;saveDeal(d)};
A['use-arv']=el=>{const d=D();d.arv=+el.dataset.v;d.arvSource=el.dataset.src||'comps';saveDeal(d);toast('ARV updated')};
A['use-rent']=el=>{const d=D();d.rent=+el.dataset.v;saveDeal(d);toast('Rent updated')};
A['use-rehab']=el=>{const d=D();d.rehab=+el.dataset.v;d.rehabSource=d.analysis?'maya':'you';saveDeal(d);toast('Rehab cost updated')};
A['rehab-add']=()=>{const d=D();d.rehabLines=d.rehabLines||[];d.rehabLines.push({item:'',detail:'',cost:null});saveDeal(d)};
A['rehab-del']=el=>{const d=D();d.rehabLines.splice(+el.dataset.i,1);saveDeal(d)};
A['comp-add']=()=>{const d=D();d.comps=d.comps||[];d.comps.push({addr:'',price:null,sqft:null,dist:null,soldDate:'',reno:true});saveDeal(d)};
A['comp-del']=el=>{const d=D();d.comps.splice(+el.dataset.i,1);saveDeal(d)};
A['comps-paste-toggle']=()=>{state.compsPaste=!state.compsPaste;render()};
A['comps-parse']=async()=>{const d=D();const t=(state.drafts['comps-text']||'').trim();if(!t){toast('Paste the sold listings first.');return}
  if(looksCSV(t)){await importCompsCSV(d.id,t);state.drafts['comps-text']='';state.compsPaste=false;render();return}
  const res=await runAI('comps:'+d.id,'Reading comps…',(ai,signal)=>ai.json(P_COMPS(t,d),{signal,modelTier:'quick'}));
  if(!res)return;const rows=(res.comps||[]).filter(x=>parseNum(x.price));if(!rows.length){toast('No sold comps found in that text.');return}
  const dd=state.deals[d.id];dd.comps=(dd.comps||[]).concat(rows.map(x=>({addr:String(x.addr||''),price:parseNum(x.price),sqft:parseNum(x.sqft),beds:parseNum(x.beds),baths:parseNum(x.baths),dist:parseNum(x.dist),soldDate:x.soldDate||'',status:COMP_ST[x.status]?x.status:'sold',reno:x.reno===false?false:true})));
  state.drafts['comps-text']='';state.compsPaste=false;saveDeal(dd);toast(`Added ${rows.length} comp${rows.length>1?'s':''}`)};
A.deep=el=>aiDeep(el.dataset.id||state.dealId);
A.research=()=>{const d=D();if(d)researchDeal(d.id)};
A['fill-links']=()=>{const d=D();if(d)fillFromLinks(d.id)};
A['ask-photos']=()=>{const d=D();if(d)askPhotosDraft(d.id)};
A['hist-add-toggle']=()=>{state.histAdd=!state.histAdd;state.histPaste=false;render()};
A['hist-paste-toggle']=()=>{state.histPaste=!state.histPaste;state.histAdd=false;render()};
A['hist-save']=()=>{const d=D();const dt=state.drafts['he-date'];if(!dt){toast('Pick the date.');return}const ev=state.drafts['he-ev']||'listed';d.history=d.history||[];d.history.push({date:dt,event:HEV[ev]?ev:'other',price:parseNum(state.drafts['he-price']),src:'you'});state.drafts['he-price']='';state.histAdd=false;saveDeal(d)};
A['hist-del']=el=>{const d=D();(d.history||[]).splice(+el.dataset.i,1);saveDeal(d)};
A['hist-parse']=async()=>{const d=D();const t=(state.drafts['hist-text']||'').trim();if(!t){toast('Paste the history first.');return}
  const res=await runAI('hist:'+d.id,'Reading the history…',(ai,signal)=>ai.json(P_HISTORY(t,d),{signal,modelTier:'quick'}));if(!res)return;
  const ev=(res.history||[]).filter(e=>e&&e.date&&!isNaN(new Date(e.date))).map(e=>({date:isoDay(e.date),event:HEV[e.event]?e.event:'other',price:parseNum(e.price),note:String(e.note||'').slice(0,80),src:'pasted'}));
  const dd=state.deals[d.id];dd.history=dd.history||[];let n=0;for(const e of ev)if(!dd.history.some(x=>isoDay(x.date)===e.date&&x.event===e.event)){dd.history.push(e);n++}
  state.drafts['hist-text']='';state.histPaste=false;saveDeal(dd);toast(n?`Added ${n} event${n>1?'s':''}`:'No new events found.')};
A['arv-mode']=el=>{const d=D();d.arvMode=el.dataset.v;saveDeal(d)};
A['comp-filter']=el=>{state.compFilter=el.dataset.v;render()};
A['geo-subject']=async()=>{const d=D();if(await geocodeDeal(d)){for(const x of d.comps||[])if(x.lat&&x.lng)x.dist=Math.round(haversine(d.lat,d.lng,x.lat,x.lng)*100)/100;saveDeal(d);toast('Found it. Distances updated.')}else toast('Couldn’t find that address on the map. Check the street, city and ZIP in Details.',5200)};
A['rc-add']=()=>{const d=D();d.rentComps=d.rentComps||[];d.rentComps.push({addr:'',rent:null,beds:null,baths:null,sqft:null,dist:null});saveDeal(d)};
A['rc-del']=el=>{const d=D();d.rentComps.splice(+el.dataset.i,1);saveDeal(d)};
A['rc-paste-toggle']=()=>{state.rcPaste=!state.rcPaste;render()};
A['rc-parse']=async()=>{const d=D();const t=(state.drafts['rc-text']||'').trim();if(!t){toast('Paste the rental listings first.');return}
  const res=await runAI('rc:'+d.id,'Reading rentals…',(ai,signal)=>ai.json(P_RENTCOMPS(t,d),{signal,modelTier:'quick'}));
  if(!res)return;const rows=(res.rentals||[]).filter(x=>parseNum(x.rent));if(!rows.length){toast('No rentals found in that text.');return}
  const dd=state.deals[d.id];dd.rentComps=(dd.rentComps||[]).concat(rows.map(x=>({addr:String(x.addr||''),rent:parseNum(x.rent),beds:parseNum(x.beds),baths:parseNum(x.baths),sqft:parseNum(x.sqft),dist:parseNum(x.dist)})));
  state.drafts['rc-text']='';state.rcPaste=false;saveDeal(dd);toast(`Added ${rows.length} rental${rows.length>1?'s':''}`)};
A['offer-preview']=()=>openOfferPreview((state.modal&&state.modal.id)||state.dealId);
A['offer-rewrite']=el=>aiRewrite(state.modal&&state.modal.id,el.dataset.q);
A['offer-send']=async()=>{const id=state.modal&&state.modal.id;const d=state.deals[id];if(!d||!d.draft)return;const c=calc(d);const P=d.draft.price;
  if(P==null||P>offerCap(d,c)){toast('The offer is above your max.');return}
  if(d.draft.letterPrice!=null&&d.draft.letterPrice!==P){toast('The letter still has the old price. Tap Rewrite first.',4600);return}
  const ok=await sendEmailNow(id);if(ok){state.modal=null;render();toast(`Offer of ${money(P)} sent from ${sendEmail()}${d.autopilot&&state.settings.auto.enabled?'. '+negName()+' takes it from here.':''}`,4600)}};
A['offer-mark']=()=>{const id=state.modal&&state.modal.id;if(!id)return;markSent(id,'email');state.modal=null;render();toast('Logged as sent.')};
A['deep-all']=()=>deepAll();
A['photo-del']=el=>removePhoto(state.dealId,el.dataset.pid);
A['photo-urls']=()=>{const t=state.drafts['ph-url']||'';const urls=t.split(/[\s,]+/).filter(Boolean);const n=addPhotoUrls(state.dealId,urls);state.drafts['ph-url']='';render();toast(n?`Added ${n} photo link${n>1?'s':''}`:'Paste direct https links to images.')};
A['sf-save']=()=>{const d=D();const c=calc(d);const s=sfCalc(d,c);d.sfSaved={price:s.v.price,downPct:s.v.downPct,payment:s.v.payment,rate:s.v.rate};saveDeal(d);toast(`Saved. ${negName()} uses these terms when she goes creative.`)};
A['sf-reset']=()=>{const d=D();d.sf=null;saveDeal(d)};
A['price-drop']=()=>{state.drafts['drop-price']='';state.drafts['drop-date']=isoDay();state.modal={type:'drop',id:state.dealId};render()};
A['drop-save']=()=>{const d=state.deals[state.modal.id];const p=parseNum(state.drafts['drop-price']);if(!p){toast('Enter the new price.');return}
  d.priceHistory=d.priceHistory||[];if(!d.priceHistory.length&&d.listPrice!=null)d.priceHistory.push({date:d.listedDate||d.created,price:d.listPrice});
  d.priceHistory.push({date:new Date(state.drafts['drop-date']||Date.now()).toISOString(),price:p});state.modal=null;saveDeal(d);
  if(ourCount(d)&&!d.optedOut&&calc(d).ready&&!d.draft)aiFollow(d.id,true)};
A['log-kind']=el=>{state.logKind=el.dataset.k;render()};
A.log=el=>logMessage(state.dealId,el.dataset.ask==='1');
A['del-msg']=el=>{const d=D();d.thread=(d.thread||[]).filter(t=>t.id!==el.dataset.mid);saveDeal(d)};
A['undo-optout']=()=>{const d=D();d.optedOut=false;saveDeal(d)};
A['maya-tab']=el=>{state.mayaTab=el.dataset.v;render()};
A['dict']=el=>dictToggle(el.dataset.k);
A['maya-send']=()=>{dictStop();const msg=(state.drafts['maya-msg']||'').trim();if(!msg)return;state.drafts['maya-msg']='';aiChat(state.dealId,msg)};
A.quick=el=>quickAction(state.dealId,el.dataset.q);
A['ai-opening']=()=>aiOpening(state.dealId);
A['ai-reply']=()=>aiReply(state.dealId);
A['ai-follow']=()=>aiFollow(state.dealId,false);
A.redraft=()=>{const d=D();const k=d.draft&&d.draft.kind;const ins_=d.draft&&d.draft.instruction;d.draft=null;saveDeal(d);if(k==='opening'&&!ourCount(d))aiOpening(d.id);else if(k==='followup')aiFollow(d.id,false);else aiReply(d.id,ins_)};
A['discard-draft']=()=>{const d=D();d.draft=null;d.needsYou=null;saveDeal(d)};
A['send-email']=()=>sendEmailNow(state.dealId);
A['send-sms']=()=>sendTextNow(state.dealId);
A['send-force']=async()=>{const d=D();if(canEmail(d)&&!(d.draft.sent||{}).email)await sendEmailNow(d.id);else if(canText(d)&&!(d.draft.sent||{}).sms)await sendTextNow(d.id);else toast('No connected channel for this deal. Copy the text instead.')};
A['mark-sent']=el=>{markSent(state.dealId,el.dataset.ch);toast(el.dataset.ch==='email'?'Logged the email as sent':'Logged the text as sent')};
A['to-contract']=()=>{const d=D();d.stage='contract';d.draft=null;d.autopilot=false;saveDeal(d);toast('Moved to under contract. Autopilot is off for this deal.')};
A['compose-send']=async el=>{const d=D();const ch=el.dataset.ch;const keep=d.draft;
  const body=(state.drafts[ch==='sms'?'cmp-sms':'cmp-body']||'').trim();if(!body){toast('Write the message first.');return}
  d.draft={kind:'manual',action:'custom',price:null,email:{subject:state.drafts['cmp-subj']||('Re: '+streetOf(d.address)),body},sms:body,at:nowISO()};
  const ok=ch==='sms'?await sendTextNow(d.id):await sendEmailNow(d.id);
  const dd=state.deals[d.id];if(ok){state.drafts[ch==='sms'?'cmp-sms':'cmp-body']='';const last=(dd.thread||[]).slice(-1)[0];if(last)last.by='you'}
  dd.draft=keep||null;saveDeal(dd)};
A['compose-log']=el=>{const d=D();const ch=el.dataset.ch;const body=(state.drafts[ch==='sms'?'cmp-sms':'cmp-body']||'').trim();if(!body){toast('Write the message first.');return}
  pushMsg(d,{dir:'out',channel:ch,subject:ch==='email'?state.drafts['cmp-subj']||'':'',text:body,by:'you'});d.follow={base:nowISO(),step:0};if(d.stage==='new')d.stage='sent';state.drafts[ch==='sms'?'cmp-sms':'cmp-body']='';saveDeal(d)};
A.copy=async el=>{const src=document.getElementById(el.dataset.src);if(!src)return;try{await navigator.clipboard.writeText(src.value);toast('Copied')}catch(e){src.focus();src.select();toast('Selected. Press Ctrl+C to copy.')}};
A['delete-deal']=()=>{state.modal={type:'confirm',title:'Delete this deal?',text:'The deal, its messages, numbers and photos are removed for good.',yes:'Delete deal',run:()=>removeDeal(state.dealId)};render()};

/* leads */
A['mail-import']=el=>importEmail(el.dataset.id);
/* read again: emails where Maya found no property, or whose deals were deleted (last 30 days) */
A['mail-reread']=async()=>{const since=Date.now()-30*DAY;let n=0;
  for(const m of Object.values(state.mail.emails)){if(new Date(m.date||0).getTime()<since)continue;
    const gone=m.status==='imported'&&(m.dealIds||[]).length&&(m.dealIds||[]).every(id=>!state.deals[id]);
    if(m.status==='nodeal'||gone){m.status='new';n++}}
  saveMail();if(!n){toast('Nothing to read again.');return}await A['mail-import-all']()};
A['mail-import-all']=async()=>{if(state.pullAll)return;const ids=Object.values(state.mail.emails).filter(m=>m.status==='new').sort(byDate).reverse().slice(0,10).map(m=>m.id);const rs=[];
  try{for(let i=0;i<ids.length;i++){state.pullAll={i:i+1,n:ids.length};render();rs.push(await importEmail(ids[i],true))}}finally{state.pullAll=null;render()}
  toast(pullSummary(rs),9000)};
A['mail-ignore']=el=>{const m=state.mail.emails[el.dataset.id];if(m){m.status='ignored';saveMail();render()}};
A['text-import']=async el=>{const t=(state.mail.texts||[]).find(x=>x.sid===el.dataset.id);if(!t)return;
  const r=await extractDeals(t.body||'',{phone:t.from,channel:'sms',at:t.at,msgId:t.sid,gvThreadId:t.threadId||null},'text:'+t.sid);if(!r)return;
  t.status=r.deals.length?'imported':'ignored';t.dealIds=r.deals;saveMail();render();toast(r.deals.length?'Deal added':'No property found in that text.')};
A['text-ignore']=el=>{const t=(state.mail.texts||[]).find(x=>x.sid===el.dataset.id);if(t){t.status='ignored';saveMail();render()}};
A['lead-over']=()=>{state.leads.showOver=!state.leads.showOver;render()};
A['lead-tag']=el=>{state.leads.tag=state.leads.tag===el.dataset.v?null:el.dataset.v;render()};
A['lead-fav']=()=>{state.leads.fav=!state.leads.fav;render()};
A['lead-passed']=()=>{state.leads.showPassed=!state.leads.showPassed;render()};
A['clear-leads']=()=>{state.leads={q:'',tag:null,fav:false,type:'all',showPassed:false};render()};
A['ws-pass']=el=>{const d=state.deals[el.dataset.id];d.stage='dead';d.reviewed=true;d.autopilot=false;saveDeal(d);toast('Passed. It’s under Show passed.')};
A['inbox-extract']=async()=>{const t=(state.drafts['inbox-paste']||'').trim();if(!t){toast('Paste a wholesaler email first.');return}
  const r=await extractDeals(t,{channel:'email'},'inbox');if(!r)return;
  if(!r.deals.length){toast('No property found in that message.');return}
  state.drafts['inbox-paste']='';toast(`Added ${r.deals.length} deal${r.deals.length>1?'s':''} from ${r.w.name||r.w.company||'the wholesaler'}`);render()};
A.sync=()=>syncAll(true);

/* practice */
A.persona=el=>{state.practicePersona=el.dataset.v;render()};
A['pr-start']=()=>prepareCall();
A['pr-go']=()=>startFromBrief();
A['pr-brief']=()=>{state.modal={type:'brief'};render()};
A['pr-regen']=()=>{state.modal=null;state.prBrief=null;prepareCall()};
A['pr-stage']=el=>{state.drafts['pr-stage']=el.dataset.v;render()};
A['pr-send']=async()=>{
  const s=state.practice[state.practiceId];const msg=(state.drafts['pr-msg']||'').trim();if(!s||!msg||state.busy['pr-chat'])return;
  s.turns.push({role:'user',content:msg});state.drafts['pr-msg']='';savePractice(s);
  const turns=[s.turns[0],...s.turns.slice(1).slice(-24)];
  const res=await runAI('pr-chat','',(ai,signal)=>ai.text(turns,{signal,modelTier:'quick'}));
  const ss=state.practice[s.id];if(ss&&res){ss.turns.push({role:'assistant',content:cleanSpoken(res.text)});savePractice(ss);if(state.voiceOn)speakAgent(res.text,ss.persona)}else voiceBits()};
A['pr-end']=()=>endCall();
A['pr-open']=el=>{state.practiceId=el.dataset.id;render()};
A['pr-close']=()=>{stopSpeaking();voiceStopListening();state.practiceId=null;render()};
A['rs-new']=()=>rsWorkbook();
A['rs-comp']=()=>rsCompetition();
A['mk-lens']=el=>{state.settings.markets.lens=el.dataset.v;state.mk.show=25;saveSettings();render()};
A['mk-strat']=el=>{state.settings.markets.strategy=el.dataset.v;saveSettings()};
A['mk-ptype']=el=>mkSetPtype(el.dataset.v);
A['mk-metro']=el=>{const k=el.dataset.k;state.mk.metro=k;state.mk.zip=null;render();setTimeout(()=>{const t=document.getElementById('mk-map');if(t)t.scrollIntoView({block:'start',behavior:'smooth'})},90)};
A['mk-zip']=el=>{const z=el.dataset.k;if(!z){state.mk.zip=null;render();return}const o=DISC.byZip[z];if(!o)return;state.mk.metro=o.mk;state.mk.zip=z;render();setTimeout(()=>{const e=document.getElementById('mk-zip');if(e)e.scrollIntoView({block:'center',behavior:'smooth'})},90)};
A['mk-us']=()=>{state.mk.metro=null;state.mk.zip=null;render()};
A['mk-more']=()=>{state.mk.show=(state.mk.show||25)+25;render()};
A['mk-star']=el=>mkStar(el.dataset.type,el.dataset.k);
A['mk-memo']=()=>mkMemo();
A['mk-campaign']=el=>{const R=mkCompute();const m=R&&R.byKey[el.dataset.k];if(!m)return;const c=newCampaign(m.label);c.market={key:m.key,label:m.label,strat:R.strat,zips:m.zips.slice(0,10).map(o=>({z:o.z,city:o.city,score:o.score}))};
  const M=state.settings.markets;c.rules.maxList=M.maxPrice||null;saveCampaign(c,true);go('campaigns');toast(`Campaign started for ${m.label}. Open its best ZIPs on Redfin, filter, then Download All and drop the file here.`,6200)};
A['mk-reload']=()=>{DISC.err='';MKT.idx=null;MKT.idxFail=0;THX.idx=null;render();loadDiscover()};
A['cp-new']=()=>{const c=newCampaign();go('campaigns');setTimeout(()=>{const el=document.getElementById('cp-in');if(el)el.scrollIntoView({block:'start'})},120)};
A['cp-open']=el=>{state.cp.id=el.dataset.id;state.cp.filter='all';if(state.view!=='campaigns')go('campaigns');else render()};
A['cp-paste']=async()=>{const c=cpCur();if(!c)return;const items=cpItemsFromLines(state.drafts['cp-paste']);if(!items.length){toast('Paste one address or link per line.');return}const n=await cpAddItems(c,items);state.drafts['cp-paste']='';toast(`Added ${n} listing${n===1?'':'s'}.`)};
A['cp-filter']=el=>{state.cp.filter=el.dataset.v;state.cp.show=80;render()};
A['cp-more']=()=>{state.cp.show=(state.cp.show||80)+80;render()};
A['cp-agents']=()=>{const c=cpCur();if(c)cpFindAgents(c)};
A['cp-calls']=()=>{const c=cpCur();if(c)cpCallList(c)};
A['cp-launch']=()=>{const c=cpCur();if(c)cpLaunch(c)};
A['cp-pause']=()=>{const c=cpCur();if(!c)return;c.status='paused';(c.log=c.log||[]).unshift({at:nowISO(),t:'Paused'});saveCampaign(c)};
A['cp-resume']=()=>{const c=cpCur();if(!c)return;c.status='running';(c.log=c.log||[]).unshift({at:nowISO(),t:'Resumed'});saveCampaign(c)};
A['cp-delete']=el=>{const c=cpCur();if(!c)return;if(el.dataset.sure!=='1'){el.dataset.sure='1';el.classList.add('red');el.innerHTML='Delete campaign? Tap again';setTimeout(()=>{if(el.isConnected){el.dataset.sure='';render()}},4000);return}
  delete state.campaigns[c.id];state.cp.id=null;persist('campaigns');render();toast('Campaign deleted. Its deals stay in Listings.')};
A['cp-del']=el=>{const c=cpCur();if(!c)return;c.items=c.items.filter(i=>i.k!==el.dataset.k);saveCampaign(c)};
A['cp-mode']=el=>{const c=cpCur();if(!c)return;c.rules.mode=el.dataset.v;if(c.rules.mode==='template'&&!c.rules.template)c.rules.template=CP_TEMPLATE;saveCampaign(c)};
A['rep-ai']=()=>aiLenderMemo(state.dealId);
A['rep-print']=()=>{document.body.classList.add('printing');setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove('printing'),500)},50)};
A['rep-mail']=()=>emailReport(state.dealId);
A['worker-on']=()=>workerToggle(true);
A['worker-off']=()=>workerToggle(false);
A['worker-refresh']=()=>{WK.at=0;workerRefresh()};
A.mic=()=>{state.voiceOn=true;if(VOICE.listening||VOICE.want)voiceStopListening();else voiceListen();voiceBits()};
A['voice-send']=()=>voiceSendNow();
A['voice-mode']=()=>{state.voiceOn=!state.voiceOn;if(!state.voiceOn){stopSpeaking();voiceStopListening()}render()};
A['voice-stop']=()=>{stopSpeaking();voiceListen()};
A['voices-load']=()=>loadVoices();
A['brief-toggle']=()=>{const B=state.settings.brief=state.settings.brief||{};B.on=!B.on;saveSettings();briefSync();toast(B.on?(cloudOn()?`Morning brief on: every day at ${B.hour??8}:00.`:'Morning brief on. Turn on cloud save so it can be emailed.'):'Morning brief off.')};
A['brief-test']=async()=>{if(!cloudOn()){toast('Turn on cloud save first.');return}state.busy.brief={label:negName()+' is writing your brief…'};render();
  try{await pushBrief(true);const r=await bridge('brief_test',{},cm().acct);toast(r.sent?'Brief sent. Check your inbox.':r.error==='no_email'?'Add your email in Settings → '+negName()+' & you, then try again.':'Couldn’t send it: '+(r.error||'unknown'),5200);if(r.sent)briefSync()}
  catch(e){toast(bridgeErr(e),5600)}finally{delete state.busy.brief;render()}};
A['research-auto']=()=>{const R=state.settings.research=state.settings.research||{};R.auto=R.auto===false;saveSettings()};
A['big-model']=el=>{state.settings.ai=state.settings.ai||{};state.settings.ai.bigModel=el.dataset.v;saveSettings()};
A['rehab-reset']=()=>{state.settings.rehab=Object.assign({},state.settings.rehab,{costs:{}});saveSettings();toast('Repair prices reset to the defaults.')};
A['pr-del']=el=>{delete state.practice[el.dataset.id];if(state.practiceId===el.dataset.id)state.practiceId=null;persist('practice');render()};

/* settings */
A.stab=el=>{go('settings',el.dataset.v)};
A['ai-test']=()=>testKey();
A['key-show']=()=>{state.showKey=!state.showKey;render()};
A['key-clear']=()=>{setSecret('apiKey','');delete state.conn.aiCheck;saveConn();state.showKey=true;render();setTimeout(()=>{const el=document.getElementById('sec-apiKey');if(el)el.focus()},60)};
A['acct-add']=()=>{const a=acctList();a.push({id:uid('g'),url:''});saveAccts(a);render()};
A['acct-del']=el=>{const id=el.dataset.id;saveAccts(acctList().filter(x=>x.id!==id));if(state.conn.accounts)delete state.conn.accounts[id];if(state.settings.conn.sendAccount===id)state.settings.conn.sendAccount=((connectedAccts()[0])||{}).id||null;saveConn();saveSettings();toast('Account removed.')};
A['acct-send']=el=>{state.settings.conn.sendAccount=el.dataset.id;saveSettings();toast(`${negName()} now sends from ${acctInfo(el.dataset.id).email}`)};
A['bridge-test']=async el=>{
  let accts=acctList();let id=el.dataset.id;if(!id){id=accts[0]?accts[0].id:uid('g');if(!accts.length){accts.push({id,url:''})}}
  const url=((document.getElementById('acct-url-'+id)||{}).value||'').trim();
  if(!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)){toast('Paste the Web app URL from your Apps Script deployment (it ends in /exec).',5200);return}
  if(!accts.some(a=>a.id===id))accts.push({id,url:''});
  accts=accts.map(a=>a.id===id?Object.assign({},a,{url}):a);saveAccts(accts);
  state.busy['bridge:'+id]={label:'Connecting…'};render();
  try{const r=await bridge('ping',null,id);
    const dup=connectedAccts().find(a=>a.id!==id&&acctInfo(a.id).email===r.email);
    state.conn.accounts=state.conn.accounts||{};state.conn.accounts[id]={email:r.email,twilio:!!r.twilio,twilioFrom:r.twilioFrom||'',version:r.version||1,at:nowISO()};
    if(!state.settings.conn.sendAccount||!acctInfo(state.settings.conn.sendAccount))state.settings.conn.sendAccount=id;
    saveConn();saveSettings();toast('Connected: '+r.email+(dup?' (already connected in another row)':''),4200);
    setTimeout(()=>syncAll(false),300)}
  catch(e){if(state.conn.accounts)delete state.conn.accounts[id];saveConn();toast(bridgeErr(e),6000)}
  finally{delete state.busy['bridge:'+id];render()}};
A['phone-mode']=el=>{state.settings.conn.phone=el.dataset.v;saveSettings()};
A['twilio-save']=async()=>{const sid=(state.drafts['tw-sid']||'').trim(),token=(state.drafts['tw-token']||'').trim(),from=e164(state.drafts['tw-from']||sendInfo().twilioFrom);
  if(!sid||!token||!from){toast('Fill in the SID, token and number.');return}
  const a=sendAcct();if(!a){toast('Connect Gmail first.');return}
  state.busy.twilio={label:'Saving to your bridge…'};render();
  try{await bridge('twilio_save',{sid,token,from});const r=await bridge('ping');Object.assign(state.conn.accounts[a.id],{twilio:!!r.twilio,twilioFrom:r.twilioFrom||from});saveConn();state.drafts['tw-token']='';state.drafts['tw-sid']='';toast('Twilio saved in your bridge. Now add the webhook (step 3).',4600)}
  catch(e){toast(bridgeErr(e),5200)}finally{delete state.busy.twilio;render()}};
A['twilio-clear']=async()=>{try{await bridge('twilio_save',{clear:true});const a=sendAcct();Object.assign(state.conn.accounts[a.id],{twilio:false,twilioFrom:''});saveConn();toast('Twilio disconnected.')}catch(e){toast(bridgeErr(e))}render()};
A['set-strat']=el=>{state.settings.buy.strategy=el.dataset.v;saveSettings()};
A['ws-add']=()=>{state.settings.wholesalers=state.settings.wholesalers||[];state.settings.wholesalers.push({name:'',company:'',email:'',phone:''});saveSettings()};
A['ws-del']=el=>{state.settings.wholesalers.splice(+el.dataset.i,1);saveSettings()};
A['cloud-on']=async()=>{
  const conn=connectedAccts();const want=state.drafts['cloud-acct'];const a=conn.find(x=>x.id===want)||sendAcct();
  if(!a){toast('Connect Gmail first.');return}
  state.busy.cloud={label:'Checking your bridge…'};render();
  try{
    const r=await bridge('ping',null,a.id);state.conn.accounts=state.conn.accounts||{};
    state.conn.accounts[a.id]=Object.assign({},state.conn.accounts[a.id]||{},{email:r.email,twilio:!!r.twilio,twilioFrom:r.twilioFrom||'',version:r.version||1,at:nowISO()});saveConn();
    if(!r.cloud){toast('Update the bridge code first (see the note above the button).',5600);return}
    state.busy.cloud={label:'Saving your desk to Google Drive…'};render();
    const c=cm();c.on=true;c.acct=a.id;cloudBaseline();
    const ok=await cloudSync(true);
    if(ok)toast('Cloud save is on. Your desk is saved in '+r.email+'’s Google Drive.',5200);
  }catch(e){toast(bridgeErr(e),6000)}
  finally{delete state.busy.cloud;render()}
};
A['cloud-off']=()=>{state.modal={type:'confirm',title:'Turn off cloud save on this device?',text:'This device stops syncing. Your data stays here and in the cloud, and your other devices keep syncing.',yes:'Turn off',run:()=>{const c=cm();c.on=false;saveCMNow();toast('Cloud save is off on this device.');render()}};render()};
A['cloud-sync']=async()=>{if(await cloudSync(true))toast('Synced with the cloud.')};
A['cloud-link']=()=>{state.modal={type:'link'};render()};
A['lease-take']=async()=>{if(await cloudLease(true)){toast(`${negName()} now works from this device.`);render();tick(false)}else toast('Couldn’t switch. Check your connection.')};
A.export=()=>{
  const cols=['address','city','state','zip','source','stage','offer_status','asking','arv','rehab','ceiling','opening','your_last','their_last','agent','agent_email','agent_phone','days_on_market','autopilot','tags','updated'];
  const rows=Object.values(state.deals).map(d=>{const c=calc(d);return [streetOf(d.address),d.city,d.state,d.zip,d.source,STAGE_LABEL[d.stage],offerStatus(d)[0],curList(d),d.arv,d.rehab,c.ready?c.mao:'',c.ready?c.opening:'',lastOurPrice(d),lastTheirPrice(d),d.agent&&d.agent.name,d.agent&&d.agent.email,d.agent&&d.agent.phone,dom(d),d.autopilot?'on':'off',dealTags(d).map(t=>TAG_BY_ID[t].label).join('; '),d.updated]});
  const csv=[cols,...rows].map(r=>r.map(v=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
  saveFile('offerdesk-deals-'+isoDay()+'.csv',csv,'text/csv')};
A.backup=()=>{flushAll();saveFile('offerdesk-backup-'+isoDay()+'.json',JSON.stringify({app:'offerdesk',version:2,at:nowISO(),settings:state.settings,deals:state.deals,practice:state.practice,activity:state.activity}),'application/json')};
A['clear-examples']=()=>{state.modal={type:'confirm',title:'Remove the example deals?',text:'Only deals marked Example are removed. Your own deals stay.',yes:'Remove examples',run:()=>{for(const d of Object.values(state.deals))if(d.example)removeDeal(d.id)}};render()};

/* ================= inputs ================= */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.hasAttribute('data-draft')){state.drafts[t.id]=t.value;return}
  if(t.dataset.mf&&state.modal){state.modal.form[t.dataset.mf]=t.value;return}
  if(t.id==='lf-q'){state.lf.q=t.value;state.page=1;clearTimeout(A._qt);A._qt=setTimeout(render,180);return}
  if(t.id==='leads-q'){state.leads.q=t.value;clearTimeout(A._qt);A._qt=setTimeout(render,180);return}
  if(t.dataset.sf){const d=cur();if(!d)return;const c=calc(d);d.sf=Object.assign(sfDefaults(d,c),d.sf||{});d.sf[t.dataset.sf]=parseFloat(t.value);clearTimeout(A._sf);A._sf=setTimeout(()=>saveDeal(d),60);return}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='deal-stage'){const d=cur();d.stage=t.value;if(['contract','closed','dead'].includes(t.value))d.autopilot=false;saveDeal(d);return}
  if(t.dataset.lf){state.lf[t.dataset.lf]=t.value;state.page=1;render();return}
  if(t.id==='leads-type'){state.leads.type=t.value;render();return}
  if(t.hasAttribute('data-draft')){state.drafts[t.id]=t.value;return}
  if(t.dataset.mfBool&&state.modal){state.modal.form[t.dataset.mfBool]=t.checked;return}
  if(t.dataset.qnote){const d=state.deals[t.dataset.qnote];if(d){d.quickNote=t.value.trim();saveDeal(d,true)}return}
  if(t.dataset.compsCsv&&t.files&&t.files[0]){const id=t.dataset.compsCsv;const fr=new FileReader();fr.onload=()=>importCompsCSV(id,String(fr.result||''));fr.readAsText(t.files[0]);t.value='';return}
  if(t.dataset.photos){const files=[...t.files];t.value='';addPhotoBlobs(t.dataset.photos,files,'upload').then(n=>{if(n)toast(`Added ${n} photo${n>1?'s':''}. Run the inspection when you’re ready.`)});return}
  if(t.dataset.sec){const v=t.value.trim().replace(/\s+/g,'');setSecret(t.dataset.sec,t.dataset.sec==='apiKey'?v:t.value.trim());if(t.dataset.sec==='apiKey'){delete state.conn.aiCheck;saveConn();render();if(v)testKey()}else if(t.dataset.sec==='model'){delete state.conn.aiCheck;saveConn();render()}else render();return}
  if(t.id==='import-file'&&t.files&&t.files[0]){const fr=new FileReader();fr.onload=()=>{try{const o=JSON.parse(fr.result);if(!o||o.app!=='offerdesk')throw 0;state.settings=deepMerge(DEFAULTS,o.settings);state.deals=Object.assign({},state.deals,o.deals||{});state.practice=Object.assign({},state.practice,o.practice||{});['settings','deals','practice'].forEach(persist);render();toast(`Restored ${Object.keys(o.deals||{}).length} deals`)}catch(err){toast('That file isn’t an OfferDesk backup.')}};fr.readAsText(t.files[0]);t.value='';return}
  if(t.dataset.cpCsv&&t.files&&t.files[0]){const c=state.campaigns[t.dataset.cpCsv];const fr=new FileReader();fr.onload=async()=>{const items=cpItemsFromCSV(String(fr.result||''));if(!items.length){toast('That file has no addresses. Use Redfin’s Download All.',5200);return}const n=await cpAddItems(c,items);toast(`Added ${n} listing${n===1?'':'s'}${n<items.length?` (${items.length-n} were already here)`:''}.`)};fr.readAsText(t.files[0]);t.value='';return}
  if(t.hasAttribute('data-rs-wb')&&t.files&&t.files[0]){const f=t.files[0];t.value='';rsWorkbook(f);return}
  if(t.hasAttribute('data-rs-csv')&&t.files&&t.files.length){const fs=[...t.files];t.value='';rsImportFiles(fs);return}
  if(t.dataset.cpAgent){const c=cpCur();const it=c&&c.items.find(i=>i.k===t.dataset.cpAgent);if(it){const v=t.value.trim().toLowerCase();if(v&&!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)){toast('That doesn’t look like an email.');return}it.agent=Object.assign(it.agent||{},{email:v,src:it.agent&&it.agent.src||'you'});cpPrice(c).then(()=>saveCampaign(c))}return}
  if(t.id==='cp-sort'){state.cp.sort=t.value;render();return}
  const typ=t.dataset.t||'text';
  const val=typ==='num'?parseNum(t.value):typ==='bool'?t.checked:typ==='nbool'?!t.checked:typ==='date'?(t.value?new Date(t.value).toISOString():null):typ==='list'?t.value.split(/[,\s]+/).map(Number).filter(n=>n>0).sort((a,b)=>a-b):t.value;
  if(t.dataset.cp){const c=cpCur();if(!c)return;setPath(c,t.dataset.cp,val);if(t.dataset.cp.startsWith('rules.')&&!['rules.template','rules.mode'].includes(t.dataset.cp))cpPrice(c).then(()=>saveCampaign(c));else saveCampaign(c);return}
  if(t.dataset.fd){
    const d=D();if(!d)return;const p=t.dataset.fd;
    if(p==='_list'){d.priceHistory=d.priceHistory||[];if(d.priceHistory.length)d.priceHistory[d.priceHistory.length-1].price=val;else if(val!=null)d.priceHistory.push({date:d.listedDate||d.created,price:val});d.listPrice=val}
    else if(p.startsWith('comps.')&&p.endsWith('.soldDate'))setPath(d,p,t.value);
    else setPath(d,p,val);
    if(p==='listedDate')d.domAtAdd=null;
    if(p==='arv')d.arvSource='you';if(p==='rehab')d.rehabSource='you';
    saveDeal(d);return;
  }
  if(t.dataset.fs){setPath(state.settings,t.dataset.fs,val);saveSettings();if(/^(brief\.|notify\.email)/.test(t.dataset.fs))briefSync();return}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&e.target.id==='pr-msg'){e.preventDefault();A['pr-send']()}
  if(e.key==='Enter'&&!e.shiftKey&&e.target.id==='maya-msg'){e.preventDefault();A['maya-send']()}
  if(e.key==='Escape'){if(state.modal){state.modal=null;render()}else if(state.bellOpen){state.bellOpen=false;render()}}
});
document.addEventListener('paste',e=>{
  if(state.view!=='deal'||!state.dealId)return;
  const files=[...((e.clipboardData&&e.clipboardData.files)||[])].filter(f=>/^image\//.test(f.type));
  if(!files.length)return;e.preventDefault();
  addPhotoBlobs(state.dealId,files,'paste').then(n=>{if(n)toast(`Pasted ${n} photo${n>1?'s':''}`)});
});
/* drag and drop: kanban cards and photo drops */
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('.kcard');if(c){e.dataTransfer.setData('text/x-deal',c.dataset.id);e.dataTransfer.effectAllowed='move'}});
document.addEventListener('dragover',e=>{
  const z=e.target.closest&&e.target.closest('[data-drop]');if(z&&e.dataTransfer.types.includes('Files')){e.preventDefault();z.classList.add('over');return}
  const col=e.target.closest&&e.target.closest('.col');if(col&&e.dataTransfer.types.includes('text/x-deal')){e.preventDefault();document.querySelectorAll('.col.over').forEach(x=>x!==col&&x.classList.remove('over'));col.classList.add('over')}});
document.addEventListener('dragleave',e=>{const el=e.target.closest&&e.target.closest('.col,[data-drop]');if(el&&!el.contains(e.relatedTarget))el.classList.remove('over')});
document.addEventListener('drop',e=>{
  const z=e.target.closest&&e.target.closest('[data-drop]');
  if(z&&z.dataset.drop==='cp'&&e.dataTransfer.files&&e.dataTransfer.files.length){e.preventDefault();z.classList.remove('over');const c=cpCur();const fr=new FileReader();fr.onload=async()=>{const items=cpItemsFromCSV(String(fr.result||''));const n=items.length?await cpAddItems(c,items):0;toast(n?`Added ${n} listings.`:'That file has no addresses. Use Redfin’s Download All.')};fr.readAsText(e.dataTransfer.files[0]);return}
  if(z&&z.dataset.drop==='rs'&&e.dataTransfer.files&&e.dataTransfer.files.length){e.preventDefault();z.classList.remove('over');rsImportFiles([...e.dataTransfer.files]);return}
  if(z&&e.dataTransfer.files&&e.dataTransfer.files.length){e.preventDefault();z.classList.remove('over');addPhotoBlobs(z.dataset.drop,[...e.dataTransfer.files],'upload').then(n=>{if(n)toast(`Added ${n} photo${n>1?'s':''}`)});return}
  const col=e.target.closest&&e.target.closest('.col');if(!col)return;e.preventDefault();col.classList.remove('over');
  const id=e.dataTransfer.getData('text/x-deal');const d=state.deals[id];if(d&&d.stage!==col.dataset.stage){d.stage=col.dataset.stage;if(['contract','closed','dead'].includes(d.stage))d.autopilot=false;saveDeal(d);toast('Moved to '+STAGE_LABEL[d.stage])}});
window.addEventListener('dragover',e=>{if(e.dataTransfer&&e.dataTransfer.types.includes('Files'))e.preventDefault()});
window.addEventListener('drop',e=>{if(!(e.target.closest&&e.target.closest('[data-drop]')))e.preventDefault()});

/* ================= boot ================= */
async function boot(){
  try{await IDB.open()}catch(e){}
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  const v={};for(const k of KEYS)v[k]=await readKey(k);
  if(!v.settings&&!v.deals){
    try{const o=JSON.parse(lsGet('od.local')||'null');if(o){v.settings=o.settings;v.deals=o.deals;v.practice=o.practice}}catch(e){}
    try{v.mail=v.mail||JSON.parse(lsGet('od.mail')||'null')}catch(e){}
    try{v.conn=v.conn||JSON.parse(lsGet('od.conn')||'null')}catch(e){}
  }
  state.settings=deepMerge(DEFAULTS,v.settings);
  state.practice=v.practice||{};state.campaigns=v.campaigns||{};state.research=v.research||{};state.mail=Object.assign(state.mail,v.mail||{});state.activity=v.activity||[];state.conn=v.conn||{};
  if(state.conn.email&&!state.conn.accounts){state.conn.accounts={g1:{email:state.conn.email,twilio:!!state.conn.twilio,twilioFrom:state.conn.twilioFrom||'',version:state.conn.version||1}};if(!state.settings.conn.sendAccount)state.settings.conn.sendAccount='g1'}
  state.deals=v.deals||null;
  if(!state.deals){state.deals=exampleDeals();if(!state.settings.profile.name)state.settings.profile.name='Ezra Rothschild';persist('deals');persist('settings')}
  for(const d of Object.values(state.deals)){d.mayaChat=d.mayaChat||[];if(d.arv&&!d.arvSource)d.arvSource='you'}
  const linked=cloudTakeLink();
  state.loaded=true;route();
  if(cloudOn()){if(linked)toast('Linked. Pulling your desk from the cloud…',4000);cloudSync().then(ok=>{if(linked)toast(ok?'Your desk is here. This device now stays in sync.':'Couldn’t reach the cloud yet. It will keep trying.',4600)})}
  setTimeout(()=>tick(false),2500);
  setTimeout(()=>{try{resumeLinks()}catch(e){}},6000);
  setInterval(()=>tick(false),3*60*1000);
  setInterval(()=>{if(document.visibilityState==='visible'&&cloudOn())cloudSync()},60*1000);
  checkUpdate();setInterval(checkUpdate,5*60*1000);
  {let lastW=innerWidth,rt=0;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(Math.abs(innerWidth-lastW)<80)return;const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;lastW=innerWidth;if(document.getElementById('history'))render()},300)});addEventListener('resize',()=>{clearTimeout(window.__mkr);window.__mkr=setTimeout(()=>{if(document.getElementById('mk-canvas'))drawMarketMap()},150)})}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){checkUpdate();if(cloudOn())cloudSync()}});
}
/* ================= self-update (hosted version) ================= */
function checkUpdate(){
  if(location.protocol==='file:')return;
  fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(j&&j.v&&j.v!==APP_V){state.updateReady=j.v;applyUpdate()}}).catch(()=>{});
}
function applyUpdate(){
  const v=state.updateReady;if(!v)return;
  const ae=document.activeElement;const typing=ae&&/^(INPUT|TEXTAREA)$/.test(ae.tagName)&&ae.value;
  if(Object.keys(state.busy).length||state.modal||state.syncing||state.autoRunning||typing){clearTimeout(A._upd);A._upd=setTimeout(applyUpdate,8000);return}
  let seen=null;try{seen=sessionStorage.getItem('od-upd-'+v)}catch(e){}if(seen)return;
  try{sessionStorage.setItem('od-upd-'+v,'1')}catch(e){}
  flushAll();toast('Updating OfferDesk\u2026');
  setTimeout(()=>location.replace(location.pathname+'?v='+encodeURIComponent(v)+location.hash),700);
}
boot();
