(()=>{
  'use strict';

  const app=document.querySelector('[data-app]');
  const stage=document.querySelector('[data-stage]');
  const panels=[...document.querySelectorAll('[data-panel]')];
  const steps=[...document.querySelectorAll('[data-step-jump]')];
  const primary=document.querySelector('[data-dock-primary]');
  const secondary=document.querySelector('[data-dock-secondary]');
  const dockKicker=document.querySelector('[data-dock-kicker]');
  const dockTitle=document.querySelector('[data-dock-title]');
  const progressKicker=document.querySelector('[data-progress-kicker]');
  const progressTitle=document.querySelector('[data-progress-title]');
  const context=document.querySelector('[data-context]');
  const contextPrice=document.querySelector('[data-context-price]');
  const contextDecision=document.querySelector('[data-context-decision]');
  const searchForm=document.querySelector('[data-search-form]');
  const queryInput=document.querySelector('#card-query');
  const toastNode=document.querySelector('[data-toast]');
  const toastTitle=document.querySelector('[data-toast-title]');
  const toastCopy=document.querySelector('[data-toast-copy]');
  const toastAction=document.querySelector('[data-toast-action]');
  const deleteDialog=document.querySelector('[data-delete-dialog]');
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const params=new URLSearchParams(window.location.search);
  const fromDealCheck=params.get('from')==='deal-check';

  const stepOrder=['search','identity','listing','decision','explain','tracking'];
  const model={
    jasson:{
      name:'2024 Topps Chrome #89 Jasson Dominguez Green Refractor PSA 10',
      set:'2024 Topps Chrome',number:'89',parallel:'Green Refractor'
    },
    burrow:{
      name:'2020 Panini Prizm #307 Joe Burrow Silver Prizm PSA 10',
      set:'2020 Panini Prizm',number:'307',parallel:'Silver Prizm'
    }
  };

  const state={
    screen:'search',
    visited:new Set(['search']),
    card:fromDealCheck?model.burrow:model.jasson,
    price:349,
    decision:'Pending',
    loadingTimer:0,
    saved:false,
    tracked:false,
    archived:false,
    deleted:false,
    savedTab:'active',
    toastTimer:0
  };

  const screenMeta={
    search:{progress:'STEP 1 OF 6',title:'Search one exact card.',dock:'Enter one exact card, then check it.',primary:'Check this card →',secondary:null},
    identity:{progress:'STEP 2 OF 6',title:'Confirm the exact match.',dock:'Confirm this exact card before price evidence is allowed in.',primary:'Yes — use this exact card →',secondary:'Change search'},
    listing:{progress:'STEP 3 OF 6',title:'Choose the listing you would actually buy.',dock:'Use the selected listing as the real decision context.',primary:'Evaluate this listing →',secondary:'Back'},
    loading:{progress:'BUILDING YOUR ANSWER',title:'FlipForge is checking the card.',dock:'No action needed. FlipForge is showing what it is checking.',primary:'Building decision…',secondary:null},
    decision:{progress:'STEP 4 OF 6',title:'Start with the answer.',dock:'Understand why before you act on the decision.',primary:'Explain this decision →',secondary:'Save decision'},
    explain:{progress:'STEP 5 OF 6',title:'See exactly what counted and what did not.',dock:'Save the decision and track what changes next.',primary:'Save & track this card →',secondary:'Back to answer'},
    tracking:{progress:'STEP 6 OF 6',title:'Keep the decision easy to revisit.',dock:'The first-card loop is complete.',primary:'View Saved Decisions →',secondary:'Check another card'},
    saved:{progress:'SAVED DECISIONS',title:'Your saved cards, under your control.',dock:'Archive cards you no longer want in the active list.',primary:'Search another card →',secondary:null}
  };

  function analytics(event,detail={}){
    const key='flipforge.preview.foolproofJourney.v2';
    try{
      const events=JSON.parse(localStorage.getItem(key)||'[]');
      events.push({event,detail,at:new Date().toISOString()});
      localStorage.setItem(key,JSON.stringify(events.slice(-120)));
    }catch(_){/* preview-only telemetry is optional */}
  }

  function applyCard(card){
    state.card=card;
    if(queryInput)queryInput.value=card.name;
    document.querySelectorAll('[data-card-name],[data-card-short]').forEach(node=>{node.textContent=card.name;});
    document.querySelectorAll('[data-card-set]').forEach(node=>{node.textContent=card.set;});
    document.querySelectorAll('[data-card-number]').forEach(node=>{node.textContent=card.number;});
    document.querySelectorAll('[data-card-spec-number]').forEach(node=>{node.textContent=`#${card.number}`;});
    document.querySelectorAll('[data-card-parallel]').forEach(node=>{node.textContent=card.parallel;});
  }

  function cardFromQuery(value){
    const text=String(value||'').trim();
    if(/burrow/i.test(text))return model.burrow;
    if(/jasson|dominguez/i.test(text))return model.jasson;
    return {...model.jasson,name:text||model.jasson.name};
  }

  function selectedPriceText(){return `$${state.price}`;}

  function syncPrice(){
    document.querySelectorAll('[data-selected-price-copy]').forEach(node=>{node.textContent=selectedPriceText();});
    if(contextPrice)contextPrice.textContent=selectedPriceText();
  }

  function stepIndexFor(screen){
    if(screen==='loading')return stepOrder.indexOf('decision');
    if(screen==='saved')return -1;
    return stepOrder.indexOf(screen);
  }

  function syncProgress(){
    const activeIndex=stepIndexFor(state.screen);
    steps.forEach((button,index)=>{
      const name=button.dataset.stepJump;
      const complete=state.visited.has(name)&&name!==state.screen&&(activeIndex<0||index<activeIndex||name==='tracking');
      const active=name===state.screen||(state.screen==='loading'&&name==='decision');
      button.classList.toggle('is-active',active);
      button.classList.toggle('is-complete',complete);
      button.disabled=!state.visited.has(name)||active||state.screen==='loading';
      button.setAttribute('aria-current',active?'step':'false');
    });
  }

  function syncContext(){
    const show=!['search','saved'].includes(state.screen)||fromDealCheck;
    if(context)context.hidden=!show;
    if(contextDecision)contextDecision.textContent=state.decision;
    syncPrice();
  }

  function syncDock(){
    const meta=screenMeta[state.screen]||screenMeta.search;
    progressKicker.textContent=meta.progress;
    progressTitle.textContent=meta.title;
    dockKicker.textContent=state.screen==='loading'?'IN PROGRESS':'NEXT';
    dockTitle.textContent=meta.dock;
    primary.textContent=meta.primary;
    primary.disabled=state.screen==='loading';
    secondary.hidden=!meta.secondary;
    if(meta.secondary){
      secondary.textContent=meta.secondary;
      secondary.disabled=false;
    }
    if(state.screen==='listing')primary.textContent=`Evaluate this ${selectedPriceText()} listing →`;
    if(fromDealCheck&&state.screen==='search'){
      dockTitle.textContent='Continue the same $349 Joe Burrow example into FlipForge.';
      primary.textContent='Continue with this card →';
    }
  }

  function setPanelVisibility(name){
    panels.forEach(panel=>{panel.hidden=panel.dataset.panel!==name;});
  }

  function commitScreen(name){
    state.screen=name;
    if(stepOrder.includes(name))state.visited.add(name);
    setPanelVisibility(name);
    syncProgress();
    syncContext();
    syncDock();
    if(stage)stage.scrollTo({top:0,behavior:'auto'});
    try{document.querySelector('#ff-main')?.focus({preventScroll:true});}catch(_){/* no-op */}
    analytics('screen_view',{screen:name,card:state.card.name,price:state.price});
  }

  function showScreen(name){
    if(!panels.some(panel=>panel.dataset.panel===name))return;
    if(!reduceMotion&&typeof document.startViewTransition==='function'){
      document.startViewTransition(()=>commitScreen(name));
    }else commitScreen(name);
  }

  function showToast(title,copy,actionLabel='',actionHandler=null){
    window.clearTimeout(state.toastTimer);
    toastTitle.textContent=title;
    toastCopy.textContent=copy;
    toastAction.hidden=!actionLabel;
    toastAction.textContent=actionLabel||'';
    toastAction.onclick=actionHandler;
    toastNode.classList.add('is-visible');
    state.toastTimer=window.setTimeout(()=>toastNode.classList.remove('is-visible'),4200);
  }

  function hidePopover(id){
    const node=document.getElementById(id);
    try{node?.hidePopover?.();}catch(_){/* no-op */}
  }

  function chooseListing(article){
    const price=Number(article?.dataset?.price||349);
    state.price=Number.isFinite(price)?price:349;
    document.querySelectorAll('[data-listing]').forEach(item=>{
      const selected=item===article;
      item.classList.toggle('is-selected',selected);
      const button=item.querySelector('[data-select-listing]');
      if(button)button.textContent=selected?'Selected ✓':'Choose this listing';
    });
    syncPrice();
    syncDock();
    analytics('listing_selected',{price:state.price});
  }

  function resetChecks(){
    window.clearTimeout(state.loadingTimer);
    document.querySelectorAll('[data-check]').forEach((row,index)=>{
      row.classList.remove('is-running','is-complete');
      row.querySelector(':scope > span').textContent=String(index+1);
      row.querySelector(':scope > b').textContent='Waiting';
    });
  }

  function runAnalysis(){
    resetChecks();
    showScreen('loading');
    analytics('evaluation_started',{card:state.card.name,price:state.price});
    const rows=[...document.querySelectorAll('[data-check]')];
    const delay=reduceMotion?120:500;
    const advance=index=>{
      rows.forEach((row,i)=>{
        const status=row.querySelector(':scope > b');
        const badge=row.querySelector(':scope > span');
        row.classList.toggle('is-complete',i<index);
        row.classList.toggle('is-running',i===index);
        if(i<index){badge.textContent='✓';status.textContent='Checked';}
        else if(i===index){badge.textContent='•';status.textContent='Checking';}
        else{badge.textContent=String(i+1);status.textContent='Waiting';}
      });
      if(index>=rows.length){
        state.loadingTimer=window.setTimeout(()=>{
          state.decision='VERIFY';
          state.visited.add('decision');
          analytics('decision_ready',{decision:'VERIFY',price:state.price});
          showScreen('decision');
        },reduceMotion?80:350);
        return;
      }
      state.loadingTimer=window.setTimeout(()=>advance(index+1),delay);
    };
    advance(0);
  }

  function saveDecision(){
    if(state.deleted)state.deleted=false;
    state.saved=true;
    state.archived=false;
    analytics('decision_saved',{decision:'VERIFY'});
    syncSavedRows();
    showToast('Decision saved.','You can revisit the card without rebuilding the research.');
  }

  function trackDecision(){
    saveDecision();
    state.tracked=true;
    state.visited.add('tracking');
    analytics('tracking_started',{decision:'VERIFY'});
    showScreen('tracking');
  }

  function syncSavedRows(){
    const activeRow=document.querySelector('[data-saved-row]');
    const archivedRow=document.querySelector('[data-archived-row]');
    const activeEmpty=document.querySelector('[data-active-empty]');
    const archivedEmpty=document.querySelector('[data-archived-empty]');
    const activeVisible=state.saved&&!state.archived&&!state.deleted;
    const archivedVisible=state.saved&&state.archived&&!state.deleted;
    if(activeRow)activeRow.hidden=!activeVisible;
    if(archivedRow)archivedRow.hidden=!archivedVisible;
    if(activeEmpty)activeEmpty.hidden=activeVisible;
    if(archivedEmpty)archivedEmpty.hidden=archivedVisible;
  }

  function setSavedTab(tab){
    state.savedTab=tab;
    document.querySelectorAll('[data-saved-tab]').forEach(button=>{
      const active=button.dataset.savedTab===tab;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-saved-view]').forEach(view=>{view.hidden=view.dataset.savedView!==tab;});
    syncSavedRows();
  }

  function archiveCard(){
    if(!state.saved||state.deleted)return;
    state.archived=true;
    syncSavedRows();
    hidePopover('saved-card-menu');
    analytics('decision_archived');
    showToast('Moved to Archived.','The active list stays clean and the historical decision remains available.','Undo',()=>{
      state.archived=false;
      setSavedTab('active');
      analytics('archive_undone');
      showToast('Restored.','The decision is back in Active Saved Decisions.');
    });
  }

  function restoreCard(){
    state.archived=false;
    setSavedTab('active');
    analytics('decision_restored');
    showToast('Restored.','The decision is back in your active list.');
  }

  function deleteCard(){
    if(!state.saved||state.deleted)return;
    hidePopover('saved-card-menu');
    if(typeof deleteDialog?.showModal==='function')deleteDialog.showModal();
    else if(window.confirm('Delete this saved decision permanently?'))confirmDelete();
  }

  function confirmDelete(){
    state.deleted=true;
    state.saved=false;
    state.archived=false;
    state.tracked=false;
    syncSavedRows();
    analytics('decision_deleted');
    showToast('Saved decision deleted.','The customer-visible record is gone from this preview.');
  }

  function resetJourney(){
    resetChecks();
    state.visited=new Set(['search']);
    state.price=349;
    state.decision='Pending';
    state.tracked=false;
    applyCard(fromDealCheck?model.burrow:model.jasson);
    showScreen('search');
  }

  function primaryAction(){
    switch(state.screen){
      case 'search':
        searchForm?.requestSubmit?.();
        break;
      case 'identity':
        state.visited.add('listing');
        analytics('identity_confirmed',{card:state.card.name});
        showScreen('listing');
        break;
      case 'listing':
        runAnalysis();
        break;
      case 'decision':
        state.visited.add('explain');
        analytics('decision_explanation_opened');
        showScreen('explain');
        break;
      case 'explain':
        trackDecision();
        break;
      case 'tracking':
        showScreen('saved');
        setSavedTab('active');
        break;
      case 'saved':
        resetJourney();
        break;
    }
  }

  function secondaryAction(){
    switch(state.screen){
      case 'identity': showScreen('search'); break;
      case 'listing': showScreen('identity'); break;
      case 'decision': saveDecision(); break;
      case 'explain': showScreen('decision'); break;
      case 'tracking': resetJourney(); break;
    }
  }

  searchForm?.addEventListener('submit',event=>{
    event.preventDefault();
    const value=queryInput?.value?.trim();
    if(!value){
      showToast('Start with the exact card.','Enter the year, set, player, card number, and any known parallel or grade.');
      queryInput?.focus();
      return;
    }
    applyCard(cardFromQuery(value));
    state.visited.add('identity');
    analytics('card_search',{query:value});
    showScreen('identity');
  });

  primary?.addEventListener('click',primaryAction);
  secondary?.addEventListener('click',secondaryAction);

  document.querySelectorAll('[data-select-listing]').forEach(button=>button.addEventListener('click',()=>chooseListing(button.closest('[data-listing]'))));

  steps.forEach(button=>button.addEventListener('click',()=>{
    const target=button.dataset.stepJump;
    if(!target||button.disabled||!state.visited.has(target))return;
    showScreen(target);
  }));

  document.querySelectorAll('[data-open-saved]').forEach(button=>button.addEventListener('click',()=>{showScreen('saved');setSavedTab('active');}));
  document.querySelectorAll('[data-open-tracking]').forEach(button=>button.addEventListener('click',()=>{
    if(state.visited.has('tracking'))showScreen('tracking');
    else showToast('Nothing is tracking yet.','Complete one card decision first, then FlipForge can track it.');
  }));

  document.querySelectorAll('[data-saved-tab]').forEach(button=>button.addEventListener('click',()=>setSavedTab(button.dataset.savedTab||'active')));
  document.querySelector('[data-archive-card]')?.addEventListener('click',archiveCard);
  document.querySelector('[data-restore-card]')?.addEventListener('click',restoreCard);
  document.querySelector('[data-delete-card]')?.addEventListener('click',deleteCard);
  document.querySelector('[data-open-decision]')?.addEventListener('click',()=>{hidePopover('saved-card-menu');state.visited.add('decision');state.decision='VERIFY';showScreen('decision');});
  document.querySelector('[data-confirm-delete]')?.addEventListener('click',confirmDelete);
  deleteDialog?.addEventListener('close',()=>{if(deleteDialog.returnValue==='delete'&&!state.deleted)confirmDelete();});

  document.querySelectorAll('[data-more]').forEach(button=>button.addEventListener('click',()=>{
    hidePopover('ff-more-menu');
    showToast(`${button.dataset.more} stays out of the way.`,`Advanced tools appear when you ask for them; they do not interrupt the first-card flow.`);
    analytics('advanced_tool_preview',{tool:button.dataset.more});
  }));

  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();
      showScreen('search');
      window.setTimeout(()=>queryInput?.focus(),0);
    }
  });

  // Native selection, context menus, copy, cut, and paste are intentionally left alone.
  applyCard(state.card);
  syncPrice();
  syncSavedRows();
  document.querySelector('[data-handoff]').hidden=!fromDealCheck;
  if(fromDealCheck){
    analytics('landing_handoff_received',{card:state.card.name,price:state.price});
  }
  commitScreen('search');
})();
