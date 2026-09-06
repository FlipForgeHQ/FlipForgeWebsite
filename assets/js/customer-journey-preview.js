(()=>{
  'use strict';

  const screens=[...document.querySelectorAll('[data-screen]')];
  const progressItems=[...document.querySelectorAll('[data-progress]')];
  const progressSteps=[...document.querySelectorAll('[data-progress-step]')];
  const queryInput=document.querySelector('#card-query');
  const searchForm=document.querySelector('[data-card-search]');
  const dock=document.querySelector('[data-action-dock]');
  const dockPrimary=dock?.querySelector('[data-dock-primary]');
  const dockBack=dock?.querySelector('[data-dock-back]');
  const dockGuidance=dock?.querySelector('[data-dock-guidance]');
  const dockKicker=dock?.querySelector('[data-dock-kicker]');
  const evidenceDialog=document.querySelector('#evidence-dialog');
  const savedDialog=document.querySelector('#saved-dialog');
  const deleteDialog=document.querySelector('#delete-dialog');
  const toastRegion=document.querySelector('.toast-region');
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const params=new URLSearchParams(window.location.search);
  const fromDealCheck=params.get('from')==='deal-check';
  const SUPPORTED_VALUE=357.20;

  const state={screen:'search',card:'2024 Topps Chrome #89 Jasson Dominguez Green Refractor PSA 10',parallel:'Green Refractor',slabNumber:'89',listing:'A',price:349,saved:false,tracked:false,archived:false,analysisTimer:0};
  const analyticsKey='flipforge.preview.foolproofJourney.v2';

  function track(event,detail={}){const payload={event,detail,at:new Date().toISOString()};try{const events=JSON.parse(localStorage.getItem(analyticsKey)||'[]');events.push(payload);localStorage.setItem(analyticsKey,JSON.stringify(events.slice(-150)));}catch(_){}}
  function toast(message,strong=''){if(!toastRegion)return;const node=document.createElement('div');node.className='toast';if(strong){const lead=document.createElement('strong');lead.textContent=strong;node.append(lead,' ',message);}else node.textContent=message;toastRegion.append(node);window.setTimeout(()=>node.remove(),2600);}
  function showModal(dialog){if(!dialog)return;if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');}
  function closeModal(dialog){if(!dialog)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');}
  function setCard(card){state.card=String(card||'').trim()||'Your selected card';document.querySelectorAll('[data-card-name]').forEach(node=>{node.textContent=state.card;});}
  function setSelectedPrice(price){state.price=Number(price)||349;const value=`$${state.price.toFixed(0)}`;document.querySelectorAll('[data-selected-price]').forEach(node=>{node.textContent=value;});updateDecisionSummary();}
  function updateDecisionSummary(){const summary=document.querySelector('.decision-callout p');if(!summary)return;const pct=Math.abs(((SUPPORTED_VALUE-state.price)/SUPPORTED_VALUE)*100);const relation=state.price<=SUPPORTED_VALUE?'below':'above';summary.replaceChildren();summary.append('Your selected ');const price=document.createElement('b');price.textContent=`$${state.price.toFixed(0)}`;summary.append(price,' listing is about ');const gap=document.createElement('b');gap.textContent=`${pct.toFixed(1)}%`;summary.append(gap,` ${relation} the illustrative supported value after weak comparisons are removed.`);}

  function updateProgress(screen){const rank={search:0,identity:1,listing:2,analysis:3,decision:3,tracking:4};const current=rank[screen]??0;progressItems.forEach((item,index)=>{item.classList.toggle('is-complete',index<current||screen==='tracking');if((screen==='analysis'||screen==='decision')&&index===3)item.setAttribute('aria-current','step');else if(index===current&&current<4)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');const bubble=item.querySelector('span');if(bubble)bubble.textContent=(index<current||screen==='tracking')?'✓':String(index+1);});}

  const dockModel={search:{kicker:'YOUR NEXT STEP',guidance:'Check the exact card.',primary:'Check this card →',back:null},identity:{kicker:'ONE THING TO DO',guidance:'Confirm the exact match.',primary:'Yes — use this exact card →',back:'search'},listing:{kicker:'ONE THING TO DO',guidance:'Choose the listing you would really pay for.',primary:'Evaluate selected listing →',back:'identity'},analysis:{kicker:'FLIPFORGE IS WORKING',guidance:'You can see each check as it completes.',primary:'Checking…',back:null,disabled:true},decision:{kicker:'YOUR NEXT STEP',guidance:'Save it, track it, or open “See exactly why.”',primary:'Save & track this card →',back:'listing'},tracking:{kicker:'READY FOR THE NEXT CARD',guidance:'This decision is saved and tracking.',primary:'Search another card →',back:'decision'}};

  function renderDock(){const model=dockModel[state.screen]||dockModel.search;if(dockKicker)dockKicker.textContent=model.kicker;if(dockGuidance)dockGuidance.textContent=model.guidance;if(dockPrimary){if(state.screen==='search'&&fromDealCheck)dockPrimary.textContent='Continue with this $349 deal →';else if(state.screen==='listing')dockPrimary.textContent=`Evaluate $${state.price.toFixed(0)} listing →`;else dockPrimary.textContent=model.primary;dockPrimary.disabled=Boolean(model.disabled);}if(dockBack){dockBack.hidden=!model.back;dockBack.dataset.backTarget=model.back||'';}}
  function focusCurrent(){const screen=screens.find(node=>node.dataset.screen===state.screen);const heading=screen?.querySelector('h1');if(heading){if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');try{heading.focus({preventScroll:true});}catch(_){}}else{try{document.querySelector('#journey-main')?.focus({preventScroll:true});}catch(_){}}}
  function applyScreen(name){state.screen=name;screens.forEach(screen=>{const active=screen.dataset.screen===name;screen.hidden=!active;screen.classList.toggle('is-active',active);if(active)screen.removeAttribute('inert');else screen.setAttribute('inert','');});const main=document.querySelector('.journey-main');if(main)main.scrollTop=0;updateProgress(name);renderDock();track('screen_view',{screen:name});window.setTimeout(focusCurrent,0);}
  function showScreen(name){if(name===state.screen)return;if(!reduceMotion&&typeof document.startViewTransition==='function')document.startViewTransition(()=>applyScreen(name));else applyScreen(name);}

  function validateSearch(){const value=queryInput?.value?.trim()||'';if(!value){toast('Enter the card before continuing.','Start with the exact card.');queryInput?.focus();return false;}setCard(value);if(/burrow/i.test(value)){state.parallel=/silver/i.test(value)?'Silver Prizm':'Prizm';state.slabNumber='307';}else{state.parallel=/green/i.test(value)?'Green Refractor':'Exact parallel';const number=value.match(/#\s*([A-Za-z0-9-]+)/)?.[1];state.slabNumber=number||'89';}const slab=document.querySelector('.slab-number');if(slab)slab.textContent=state.slabNumber;const parallel=document.querySelector('[data-parallel]');if(parallel)parallel.textContent=state.parallel;track('card_search',{query:value,fromDealCheck});return true;}
  function resetAnalysis(){window.clearTimeout(state.analysisTimer);progressSteps.forEach((step,index)=>{step.classList.remove('is-running','is-complete');const badge=step.querySelector(':scope > span');const status=step.querySelector(':scope > b');if(badge)badge.textContent=String(index+1);if(status)status.textContent='Waiting';});}
  function runAnalysis(){resetAnalysis();showScreen('analysis');track('evaluation_started',{card:state.card,listing:state.listing,price:state.price});const interval=reduceMotion?100:420;const advance=index=>{if(index>=progressSteps.length){state.analysisTimer=window.setTimeout(()=>{track('decision_ready',{decision:'VERIFY',price:state.price});showScreen('decision');},reduceMotion?60:300);return;}progressSteps.forEach((step,i)=>{const status=step.querySelector(':scope > b');const badge=step.querySelector(':scope > span');step.classList.toggle('is-complete',i<index);step.classList.toggle('is-running',i===index);if(i<index){if(status)status.textContent='Checked';if(badge)badge.textContent='✓';}else if(i===index){if(status)status.textContent='Checking';if(badge)badge.textContent='•';}else{if(status)status.textContent='Waiting';if(badge)badge.textContent=String(i+1);}});state.analysisTimer=window.setTimeout(()=>advance(index+1),interval);};advance(0);}

  function saveAndTrack(){state.saved=true;state.tracked=true;state.archived=false;updateSavedUI();closeModal(evidenceDialog);track('decision_saved',{decision:'VERIFY',card:state.card});track('tracking_started',{card:state.card});showScreen('tracking');toast('You can archive or delete it later from Saved.','Saved and tracking.');}
  function resetJourney(){resetAnalysis();state.saved=false;state.tracked=false;state.archived=false;state.listing='A';setSelectedPrice(349);document.querySelectorAll('[data-listing]').forEach(button=>{const selected=button.dataset.listing==='A';button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));const mark=button.querySelector('.selected-mark');if(mark)mark.textContent=selected?'Selected ✓':'Select';});if(queryInput)queryInput.value='';setCard('Your selected card');updateSavedUI();showScreen('search');window.setTimeout(()=>queryInput?.focus(),100);}
  function updateSavedUI(){const empty=document.querySelector('[data-saved-empty]');const content=document.querySelector('[data-saved-content]');const active=document.querySelector('[data-active-saved]');const archivedSection=document.querySelector('[data-archived-section]');if(empty)empty.hidden=state.saved;if(content)content.hidden=!state.saved;if(active)active.hidden=!state.saved||state.archived;if(archivedSection)archivedSection.hidden=!state.saved||!state.archived;document.querySelectorAll('.saved-shortcut').forEach(button=>{button.textContent=state.saved?(state.archived?'Saved · 0':'Saved · 1'):'Saved';});}
  function archiveCard(){if(!state.saved)return;state.archived=true;state.tracked=false;updateSavedUI();track('decision_archived',{card:state.card});toast('Restore it anytime from Archived.','Archived from Saved.');}
  function restoreCard(){if(!state.saved)return;state.archived=false;updateSavedUI();track('decision_restored',{card:state.card});toast('The card is active in Saved Decisions again.','Restored.');}
  function deleteCard(){const deletedCard=state.card;state.saved=false;state.tracked=false;state.archived=false;updateSavedUI();closeModal(deleteDialog);closeModal(savedDialog);track('decision_deleted_preview',{card:deletedCard});toast('The customer-visible saved card is gone.','Deleted.');if(state.screen==='tracking')showScreen('search');}
  function openSaved(){updateSavedUI();track('saved_opened',{saved:state.saved,archived:state.archived});showModal(savedDialog);}
  function openEvidence(){track('evidence_opened',{decision:'VERIFY'});showModal(evidenceDialog);}

  function primaryAction(){if(state.screen==='search'){if(validateSearch())showScreen('identity');return;}if(state.screen==='identity'){track('identity_confirmed',{card:state.card});showScreen('listing');return;}if(state.screen==='listing'){track('listing_selected',{listing:state.listing,price:state.price});runAnalysis();return;}if(state.screen==='decision'){saveAndTrack();return;}if(state.screen==='tracking')resetJourney();}

  function configureHandoff(){if(!fromDealCheck)return;state.card='2020 Panini Prizm #307 Joe Burrow Silver Prizm PSA 10';state.parallel='Silver Prizm';state.slabNumber='307';if(queryInput)queryInput.value=state.card;setCard(state.card);const handoff=document.querySelector('[data-deal-handoff]');if(handoff)handoff.hidden=false;const kicker=document.querySelector('[data-search-kicker]');const title=document.querySelector('[data-search-title]');const lede=document.querySelector('[data-search-lede]');if(kicker)kicker.textContent='CONTINUE THE SAME DEAL';if(title)title.textContent='Now see how this works inside FlipForge.';if(lede)lede.textContent='The Joe Burrow $349 example is already loaded. Your next action is pinned below — no scrolling required.';const slab=document.querySelector('.slab-number');if(slab)slab.textContent='307';const parallel=document.querySelector('[data-parallel]');if(parallel)parallel.textContent='Silver Prizm';track('landing_handoff_received',{example:'joe_burrow_silver_prizm_psa10',price:349});}

  searchForm?.addEventListener('submit',event=>{event.preventDefault();primaryAction();});
  dockPrimary?.addEventListener('click',primaryAction);
  dockBack?.addEventListener('click',()=>{const target=dockBack.dataset.backTarget;if(target)showScreen(target);});
  document.querySelectorAll('[data-listing]').forEach(button=>{button.addEventListener('click',()=>{document.querySelectorAll('[data-listing]').forEach(other=>{const selected=other===button;other.classList.toggle('is-selected',selected);other.setAttribute('aria-pressed',String(selected));const mark=other.querySelector('.selected-mark');if(mark)mark.textContent=selected?'Selected ✓':'Select';});state.listing=button.dataset.listing||'A';setSelectedPrice(button.dataset.price);renderDock();track('listing_choice_changed',{listing:state.listing,price:state.price});});});
  document.querySelectorAll('[data-open-evidence]').forEach(button=>button.addEventListener('click',openEvidence));
  document.querySelectorAll('[data-open-saved]').forEach(button=>button.addEventListener('click',openSaved));
  document.querySelectorAll('[data-save-track]').forEach(button=>button.addEventListener('click',saveAndTrack));
  document.querySelectorAll('[data-archive-card]').forEach(button=>button.addEventListener('click',archiveCard));
  document.querySelectorAll('[data-restore-card]').forEach(button=>button.addEventListener('click',restoreCard));
  document.querySelectorAll('[data-request-delete]').forEach(button=>button.addEventListener('click',()=>showModal(deleteDialog)));
  document.querySelectorAll('[data-delete-card]').forEach(button=>button.addEventListener('click',deleteCard));
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeModal(button.closest('dialog'))));
  [evidenceDialog,savedDialog,deleteDialog].forEach(dialog=>{dialog?.addEventListener('click',event=>{if(event.target===dialog)closeModal(dialog);});});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();showScreen('search');window.setTimeout(()=>queryInput?.focus(),0);}});

  // Native selection/copy/paste remain untouched. Modern progressive enhancement used here:
  // native <dialog>, Popover API, dynamic viewport units, container queries, scroll snap,
  // safe-area insets, and View Transitions when the browser supports them.
  setSelectedPrice(349);updateSavedUI();applyScreen('search');configureHandoff();renderDock();track('preview_opened',{version:'foolproof-v2',fromDealCheck});
})();