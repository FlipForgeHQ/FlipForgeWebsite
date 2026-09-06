(()=>{
  'use strict';

  const shell=document.querySelector('[data-shell]');
  const screens=[...document.querySelectorAll('[data-screen]')];
  const navButtons=[...document.querySelectorAll('[data-nav-target]')];
  const toastRegion=document.querySelector('.toast-region');
  const searchForm=document.querySelector('[data-card-search]');
  const queryInput=document.querySelector('#card-query');
  const progressSteps=[...document.querySelectorAll('[data-progress-step]')];
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const params=new URLSearchParams(window.location.search);
  const fromDealCheck=params.get('from')==='deal-check';

  const state={
    screen:'search',
    card:queryInput?.value?.trim()||'Card',
    loadingTimer:0,
    loadingIndex:-1,
    saved:false,
    tracked:false
  };

  const analyticsKey='flipforge.preview.customerJourney.v1';

  function track(event,detail={}){
    const payload={event,detail,at:new Date().toISOString()};
    try{
      const events=JSON.parse(localStorage.getItem(analyticsKey)||'[]');
      events.push(payload);
      localStorage.setItem(analyticsKey,JSON.stringify(events.slice(-100)));
    }catch(_){/* preview analytics are optional */}
  }

  function toast(message,strong=''){
    if(!toastRegion)return;
    const node=document.createElement('div');
    node.className='toast';
    node.innerHTML=strong?`<strong>${escapeHtml(strong)}</strong> ${escapeHtml(message)}`:escapeHtml(message);
    toastRegion.append(node);
    window.setTimeout(()=>node.remove(),2800);
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>'"]/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    })[char]);
  }

  function closeNav(){
    if(!shell)return;
    shell.dataset.navOpen='false';
    document.querySelector('[data-open-nav]')?.setAttribute('aria-expanded','false');
  }

  function updateNav(screen){
    const normalized=['identity','listings','loading','result'].includes(screen)?'search':screen;
    document.querySelectorAll('.preview-nav-item').forEach(button=>{
      button.classList.toggle('is-active',button.dataset.navTarget===normalized);
    });
  }

  function showScreen(name,options={}){
    const target=screens.find(screen=>screen.dataset.screen===name);
    if(!target)return;
    state.screen=name;
    screens.forEach(screen=>{
      const active=screen===target;
      screen.hidden=!active;
      screen.classList.toggle('is-active',active);
    });
    updateNav(name);
    closeNav();
    track('screen_view',{screen:name});
    if(options.scroll!==false){
      window.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});
    }
    window.setTimeout(()=>{
      try{document.querySelector('#preview-main')?.focus({preventScroll:true});}catch(_){/* no-op */}
    },0);
  }

  function applyCardName(value){
    const card=value?.trim()||'Your selected card';
    state.card=card;
    document.querySelectorAll('[data-card-name]').forEach(node=>{node.textContent=card;});
  }

  function hydrateDealCheckContext(){
    if(!fromDealCheck||!queryInput)return;
    const card='2020 Panini Prizm #307 Joe Burrow Silver Prizm PSA 10';
    queryInput.value=card;
    applyCardName(card);

    const dlValues=[...document.querySelectorAll('.identity-copy dl dd')];
    ['2020 Panini Prizm','#307','Silver Prizm','PSA 10'].forEach((value,index)=>{
      if(dlValues[index])dlValues[index].textContent=value;
    });
    const slabCard=document.querySelector('.slab-card');
    const slabPlayer=document.querySelector('.slab-player');
    if(slabCard)slabCard.textContent='307';
    if(slabPlayer)slabPlayer.textContent='JB';

    document.querySelectorAll('.listing-visual').forEach(visual=>{
      const grade=visual.querySelector('span');
      const parallel=visual.querySelector('b');
      const number=visual.querySelector('small');
      if(grade)grade.textContent='PSA 10';
      if(parallel)parallel.innerHTML='SILVER<br>PRIZM';
      if(number)number.textContent='#307';
    });

    const rejected=[...document.querySelectorAll('.alternate-body .reject-row strong')];
    if(rejected[0])rejected[0].textContent='Base Prizm #307 PSA 10';
    if(rejected[1])rejected[1].textContent='Silver Prizm #307 PSA 9';

    const searchFrame=document.querySelector('.search-frame');
    const searchCard=document.querySelector('.card-search-card');
    if(searchFrame&&searchCard&&!document.querySelector('[data-landing-handoff]')){
      const handoff=document.createElement('div');
      handoff.className='next-step-note';
      handoff.dataset.landingHandoff='';
      handoff.innerHTML='<span>CONTINUING FROM THE LANDING-PAGE DEAL CHECK</span><p>The same $349 Joe Burrow Silver Prizm listing is loaded below, so you can see how the customer experience continues inside FlipForge.</p>';
      searchCard.before(handoff);
    }

    const banner=document.querySelector('.preview-banner');
    if(banner&&!banner.querySelector('[data-back-to-landing]')){
      const back=document.createElement('a');
      back.href='./#deal-or-decoy';
      back.dataset.backToLanding='';
      back.textContent='← Back to landing page';
      back.setAttribute('aria-label','Return to the landing-page Deal Check preview');
      banner.append(back);
    }

    track('landing_handoff_loaded',{card});
  }

  function resetProgress(){
    window.clearTimeout(state.loadingTimer);
    state.loadingIndex=-1;
    progressSteps.forEach((step,index)=>{
      step.classList.remove('is-running','is-complete');
      const status=step.querySelector('b');
      if(status)status.textContent='Waiting';
      const badge=step.querySelector(':scope > span');
      if(badge)badge.textContent=String(index+1);
    });
  }

  function runProgress(){
    resetProgress();
    showScreen('loading');
    track('evaluation_started',{card:state.card});
    const interval=reduceMotion?130:620;

    const advance=index=>{
      if(index>=progressSteps.length){
        state.loadingTimer=window.setTimeout(()=>{
          track('decision_ready',{decision:'VERIFY'});
          showScreen('result');
        },reduceMotion?80:500);
        return;
      }

      progressSteps.forEach((step,i)=>{
        step.classList.toggle('is-complete',i<index);
        step.classList.toggle('is-running',i===index);
        const status=step.querySelector('b');
        const badge=step.querySelector(':scope > span');
        if(i<index){
          if(status)status.textContent='Checked';
          if(badge)badge.textContent='✓';
        }else if(i===index){
          if(status)status.textContent='Checking';
          if(badge)badge.textContent='•';
        }else{
          if(status)status.textContent='Waiting';
          if(badge)badge.textContent=String(i+1);
        }
      });

      state.loadingIndex=index;
      state.loadingTimer=window.setTimeout(()=>advance(index+1),interval);
    };

    advance(0);
  }

  function showEvidence(){
    const panel=document.querySelector('[data-evidence-panel]');
    if(!panel)return;
    track('evidence_opened',{decision:'VERIFY'});
    panel.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
    window.setTimeout(()=>{
      try{panel.focus({preventScroll:true});}catch(_){/* no-op */}
    },reduceMotion?0:350);
  }

  function handleAdvanced(label){
    document.querySelectorAll('[data-advanced-title]').forEach(node=>{node.textContent=label;});
    track('advanced_tool_preview',{tool:label});
    showScreen('advanced');
  }

  document.querySelector('[data-open-nav]')?.addEventListener('click',()=>{
    const next=shell?.dataset.navOpen!=='true';
    if(shell)shell.dataset.navOpen=String(next);
    document.querySelector('[data-open-nav]')?.setAttribute('aria-expanded',String(next));
  });
  document.querySelector('[data-close-nav]')?.addEventListener('click',closeNav);

  navButtons.forEach(button=>{
    button.addEventListener('click',event=>{
      const name=button.dataset.navTarget;
      if(!name)return;
      event.preventDefault?.();
      showScreen(name);
    });
  });

  document.querySelectorAll('[data-advanced]').forEach(button=>{
    button.addEventListener('click',()=>handleAdvanced(button.dataset.advanced||'Advanced Intelligence'));
  });

  searchForm?.addEventListener('submit',event=>{
    event.preventDefault();
    const value=queryInput?.value?.trim();
    if(!value){
      toast('Enter the year, set, player, card number, and any known parallel or grade.','Start with the exact card.');
      queryInput?.focus();
      return;
    }
    applyCardName(value);
    track('card_search',{query:value,source:fromDealCheck?'landing_deal_check':'direct_preview'});
    showScreen('identity');
  });

  document.querySelectorAll('[data-confirm-identity]').forEach(button=>{
    button.addEventListener('click',()=>{
      track('identity_confirmed',{card:state.card});
      showScreen('listings');
    });
  });

  document.querySelectorAll('[data-evaluate-listing]').forEach(button=>{
    button.addEventListener('click',()=>{
      track('listing_selected',{label:button.closest('.listing-card')?.querySelector('.listing-topline span')?.textContent||'listing'});
      runProgress();
    });
  });

  document.querySelectorAll('[data-back]').forEach(button=>{
    button.addEventListener('click',()=>showScreen(button.dataset.back||'search'));
  });

  document.querySelectorAll('[data-show-evidence]').forEach(button=>button.addEventListener('click',showEvidence));

  document.querySelectorAll('[data-save-decision]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.saved=true;
      button.textContent='Saved ✓';
      button.disabled=true;
      track('decision_saved',{decision:'VERIFY'});
      toast('You can revisit the reasoning without starting over.','Decision saved.');
    });
  });

  document.querySelectorAll('[data-track-card]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.tracked=true;
      track('tracking_started',{decision:'VERIFY'});
      toast('FlipForge will surface what changes next.','Tracking started.');
      window.setTimeout(()=>showScreen('tracking'),650);
    });
  });

  document.querySelectorAll('[data-open-sample-result]').forEach(button=>{
    button.addEventListener('click',()=>{
      track('saved_decision_opened',{decision:'VERIFY'});
      showScreen('result');
    });
  });

  document.querySelector('[data-reset-preview]')?.addEventListener('click',()=>{
    resetProgress();
    state.saved=false;
    state.tracked=false;
    const save=document.querySelector('[data-save-decision]');
    if(save){save.disabled=false;save.textContent='Save decision';}
    try{localStorage.removeItem(analyticsKey);}catch(_){/* no-op */}
    if(queryInput)queryInput.value=fromDealCheck?'2020 Panini Prizm #307 Joe Burrow Silver Prizm PSA 10':'2024 Topps Chrome #89 Jasson Dominguez Green Refractor PSA 10';
    applyCardName(queryInput?.value||'');
    showScreen('search');
    toast('The interactive journey is back at the first screen.','Preview reset.');
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&shell?.dataset.navOpen==='true')closeNav();
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();
      showScreen('search',{scroll:false});
      window.setTimeout(()=>queryInput?.focus(),0);
      track('keyboard_search_focus');
    }
  });

  // Native selection, copy, and paste are intentionally untouched across the preview.
  // No contextmenu, selectstart, copy, cut, or paste handlers are registered.

  hydrateDealCheckContext();
  applyCardName(queryInput?.value||state.card);
  track('preview_opened',{screen:'search',source:fromDealCheck?'landing_deal_check':'direct_preview'});
})();