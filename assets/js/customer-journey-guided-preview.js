(()=>{
  'use strict';

  const app=document.querySelector('[data-guided-app]');
  if(!app)return;

  const screens=[...document.querySelectorAll('[data-screen]')];
  const progressDots=[...document.querySelectorAll('[data-progress-dot]')];
  const progressLabel=document.querySelector('[data-progress-label]');
  const progressTitle=document.querySelector('[data-progress-title]');
  const progressBar=document.querySelector('[data-progress-bar]');
  const dockKicker=document.querySelector('[data-dock-kicker]');
  const dockMessage=document.querySelector('[data-dock-message]');
  const dockPrimary=document.querySelector('[data-dock-primary]');
  const dockBack=document.querySelector('[data-dock-back]');
  const searchForm=document.querySelector('[data-search-form]');
  const queryInput=document.querySelector('#guided-card-query');
  const evidenceDialog=document.querySelector('[data-evidence-dialog]');
  const deleteDialog=document.querySelector('[data-delete-dialog]');
  const toast=document.querySelector('[data-toast]');
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const analysisSteps=[...document.querySelectorAll('[data-analysis-step]')];

  const state={screen:'search',card:queryInput?.value?.trim()||'Card',price:349,analysisTimer:0,saved:false,archived:false};

  const model={
    search:{index:1,title:'Find the card',kicker:'DO THIS NEXT',message:'Enter the card, then press Find card.',primary:'Find this card →',back:false},
    identity:{index:2,title:'Confirm the exact card',kicker:'DO THIS NEXT',message:'Confirm that this is the exact card you meant.',primary:'Yes — use this exact card →',back:true},
    listing:{index:3,title:'Choose the listing',kicker:'DO THIS NEXT',message:'Pick the listing you would actually buy.',primary:'Evaluate selected listing →',back:true},
    analysis:{index:4,title:'FlipForge is checking it',kicker:'WORKING NOW',message:'FlipForge is checking identity, evidence, value, and risk.',primary:'Building decision…',back:false},
    decision:{index:4,title:'Decision ready',kicker:'DECISION READY',message:'Read the call. Open Why if you want the evidence.',primary:'Save & track →',back:true},
    saved:{index:4,title:'Saved decisions',kicker:'YOUR SAVED CARDS',message:'Archive, restore, or delete cards without losing control.',primary:'Search another card →',back:true}
  };

  const stepForScreen=screen=>screen==='search'?'search':screen==='identity'?'identity':screen==='listing'?'listing':'decision';

  function track(event,detail={}){
    try{
      const key='flipforge.preview.guidedJourney.v2';
      const values=JSON.parse(localStorage.getItem(key)||'[]');
      values.push({event,detail,at:new Date().toISOString()});
      localStorage.setItem(key,JSON.stringify(values.slice(-100)));
    }catch(_){/* preview telemetry only */}
  }

  function showToast(message){
    if(!toast)return;
    toast.textContent=message;
    toast.hidden=false;
    window.clearTimeout(showToast.timer);
    showToast.timer=window.setTimeout(()=>{toast.hidden=true;},2200);
  }

  function updateCardName(){
    document.querySelectorAll('[data-card-name]').forEach(node=>{node.textContent=state.card;});
  }

  function updateDock(){
    const cfg=model[state.screen]||model.search;
    progressLabel.textContent=`STEP ${cfg.index} OF 4`;
    progressTitle.textContent=cfg.title;
    progressBar.style.width=`${Math.max(25,cfg.index*25)}%`;
    dockKicker.textContent=cfg.kicker;
    dockMessage.textContent=cfg.message;
    dockPrimary.textContent=cfg.primary;
    dockBack.hidden=!cfg.back;
    dockPrimary.disabled=state.screen==='analysis';

    const activeKey=stepForScreen(state.screen);
    const order=['search','identity','listing','decision'];
    const activeIndex=order.indexOf(activeKey);
    progressDots.forEach((dot,index)=>{
      dot.classList.toggle('is-current',index===activeIndex);
      dot.classList.toggle('is-complete',index<activeIndex);
      const badge=dot.querySelector('span');
      if(badge)badge.textContent=index<activeIndex?'✓':String(index+1);
    });
  }

  function renderScreen(name){
    const target=screens.find(screen=>screen.dataset.screen===name);
    if(!target)return;
    const mutate=()=>{
      screens.forEach(screen=>{
        const active=screen===target;
        screen.hidden=!active;
        screen.classList.toggle('is-active',active);
      });
      state.screen=name;
      updateDock();
      document.querySelector('[data-stage]')?.scrollTo({top:0,behavior:'auto'});
      track('screen_view',{screen:name});
    };
    if(!reduceMotion&&document.startViewTransition){document.startViewTransition(mutate);}else mutate();
  }

  function selectedListing(){return document.querySelector('[data-listing].is-selected');}

  function runAnalysis(){
    window.clearTimeout(state.analysisTimer);
    analysisSteps.forEach((step,index)=>{
      step.classList.remove('is-running','is-complete');
      step.querySelector('b').textContent='Waiting';
      step.querySelector(':scope > span').textContent=String(index+1);
    });
    renderScreen('analysis');
    let index=0;
    const tick=()=>{
      analysisSteps.forEach((step,i)=>{
        step.classList.toggle('is-complete',i<index);
        step.classList.toggle('is-running',i===index);
        const label=step.querySelector('b');
        const badge=step.querySelector(':scope > span');
        if(i<index){label.textContent='Checked';badge.textContent='✓';}
        else if(i===index){label.textContent='Checking';badge.textContent='•';}
        else{label.textContent='Waiting';badge.textContent=String(i+1);}
      });
      if(index>=analysisSteps.length){
        track('decision_ready',{decision:'VERIFY',price:state.price});
        state.analysisTimer=window.setTimeout(()=>renderScreen('decision'),reduceMotion?80:320);
        return;
      }
      index+=1;
      state.analysisTimer=window.setTimeout(tick,reduceMotion?120:520);
    };
    tick();
  }

  function submitSearch(){
    const value=queryInput?.value?.trim();
    if(!value){showToast('Enter the exact card first.');queryInput?.focus();return;}
    state.card=value;
    updateCardName();
    track('card_search',{query:value});
    renderScreen('identity');
  }

  searchForm?.addEventListener('submit',event=>{event.preventDefault();submitSearch();});

  document.querySelectorAll('[data-listing]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-listing]').forEach(item=>{item.classList.remove('is-selected');item.setAttribute('aria-checked','false');});
    button.classList.add('is-selected');
    button.setAttribute('aria-checked','true');
    state.price=Number(button.dataset.price)||349;
    document.querySelectorAll('[data-cost],[data-decision-price]').forEach(node=>{node.textContent=`$${state.price}`;});
    dockMessage.textContent=`Listing selected: $${state.price}. Press Evaluate selected listing.`;
    track('listing_selected',{price:state.price});
  }));

  dockPrimary?.addEventListener('click',()=>{
    if(state.screen==='search'){submitSearch();return;}
    if(state.screen==='identity'){track('identity_confirmed',{card:state.card});renderScreen('listing');return;}
    if(state.screen==='listing'){
      const selected=selectedListing();
      if(!selected){showToast('Choose one listing first.');return;}
      state.price=Number(selected.dataset.price)||349;
      document.querySelectorAll('[data-cost],[data-decision-price]').forEach(node=>{node.textContent=`$${state.price}`;});
      runAnalysis();return;
    }
    if(state.screen==='decision'){
      state.saved=true;
      evidenceDialog?.close();
      track('decision_saved',{decision:'VERIFY'});
      showToast('Decision saved and tracking started.');
      renderScreen('saved');return;
    }
    if(state.screen==='saved'){
      if(queryInput)queryInput.value=state.card;
      renderScreen('search');return;
    }
  });

  dockBack?.addEventListener('click',()=>{
    if(state.screen==='identity'){renderScreen('search');return;}
    if(state.screen==='listing'){renderScreen('identity');return;}
    if(state.screen==='decision'){renderScreen('listing');return;}
    if(state.screen==='saved'){renderScreen('decision');return;}
  });

  document.querySelector('[data-open-saved]')?.addEventListener('click',()=>renderScreen('saved'));
  document.querySelector('[data-open-evidence]')?.addEventListener('click',()=>{track('evidence_opened');evidenceDialog?.showModal();});
  document.querySelector('[data-save-and-track]')?.addEventListener('click',()=>{
    state.saved=true;
    evidenceDialog?.close();
    track('decision_saved',{decision:'VERIFY'});
    showToast('Decision saved and tracking started.');
    renderScreen('saved');
  });

  document.querySelectorAll('[data-saved-tab]').forEach(tab=>tab.addEventListener('click',()=>{
    const name=tab.dataset.savedTab;
    document.querySelectorAll('[data-saved-tab]').forEach(item=>item.classList.toggle('is-active',item===tab));
    document.querySelectorAll('[data-saved-list]').forEach(list=>{list.hidden=list.dataset.savedList!==name;});
  }));

  const menuButton=document.querySelector('[data-card-menu]');
  const menuPanel=document.querySelector('[data-card-menu-panel]');
  menuButton?.addEventListener('click',()=>{menuPanel.hidden=!menuPanel.hidden;});

  document.querySelector('[data-archive]')?.addEventListener('click',()=>{
    state.archived=true;
    document.querySelector('[data-saved-card]').hidden=true;
    document.querySelector('[data-archived-card]').hidden=false;
    document.querySelector('[data-archived-empty]').hidden=true;
    menuPanel.hidden=true;
    track('decision_archived');
    showToast('Archived. You can restore it any time.');
  });

  document.querySelector('[data-restore]')?.addEventListener('click',()=>{
    state.archived=false;
    document.querySelector('[data-saved-card]').hidden=false;
    document.querySelector('[data-archived-card]').hidden=true;
    document.querySelector('[data-archived-empty]').hidden=false;
    track('decision_restored');
    showToast('Decision restored to Saved.');
  });

  document.querySelector('[data-delete]')?.addEventListener('click',()=>deleteDialog?.showModal());
  document.querySelector('[data-cancel-delete]')?.addEventListener('click',()=>deleteDialog?.close());
  document.querySelector('[data-confirm-delete]')?.addEventListener('click',()=>{
    deleteDialog?.close();
    state.saved=false;state.archived=false;
    document.querySelector('[data-archived-card]').hidden=true;
    document.querySelector('[data-archived-empty]').hidden=false;
    track('decision_deleted_preview');
    showToast('Saved decision deleted from the preview.');
  });

  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();renderScreen('search');window.setTimeout(()=>queryInput?.focus(),0);
    }
  });

  updateCardName();
  updateDock();
  track('guided_preview_opened');
})();