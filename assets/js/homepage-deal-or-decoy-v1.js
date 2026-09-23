(()=> {
  'use strict';

  const demo=document.querySelector('[data-ff-deal-demo]');
  if(!demo)return;

  const choiceStage=demo.querySelector('[data-ff-choice-stage]');
  const processingStage=demo.querySelector('[data-ff-processing-stage]');
  const resultStage=demo.querySelector('[data-ff-result-stage]');
  const resultHeading=resultStage?.querySelector('h2');
  const visitorChoiceLabel=demo.querySelector('[data-ff-visitor-choice]');
  const processingChoiceLabel=demo.querySelector('[data-ff-processing-choice]');
  const replay=demo.querySelector('[data-ff-replay]');
  const evidenceDialog=demo.querySelector('[data-ff-evidence-dialog]');
  const evidenceOpen=demo.querySelector('[data-ff-open-evidence]');
  const evidenceClose=[...demo.querySelectorAll('[data-ff-close-evidence]')];
  const status=demo.querySelector('[data-ff-deal-status]');
  const choices=[...demo.querySelectorAll('[data-ff-choice]')];

  const processLabel=demo.querySelector('[data-ff-process-label]');
  const processTitle=demo.querySelector('[data-ff-process-title]');
  const processCounter=demo.querySelector('[data-ff-process-counter]');
  const identityCard=demo.querySelector('[data-ff-process-card="identity"]');
  const evidenceCard=demo.querySelector('[data-ff-process-card="evidence"]');
  const valueCard=demo.querySelector('[data-ff-process-card="value"]');
  const identityState=demo.querySelector('[data-ff-identity-state]');
  const evidenceState=demo.querySelector('[data-ff-evidence-state]');
  const valueState=demo.querySelector('[data-ff-value-state]');
  const evidenceKept=demo.querySelector('[data-ff-evidence-kept]');
  const evidenceReason=demo.querySelector('[data-ff-evidence-reason]');
  const valueLane=demo.querySelector('[data-ff-value-lane]');
  const supported=demo.querySelector('[data-ff-supported]');
  const supportedValue=demo.querySelector('[data-ff-supported-value]');
  const processDiscount=demo.querySelector('[data-ff-process-discount]');
  const supportedDiscount=demo.querySelector('[data-ff-supported-discount]');
  const processVerdict=demo.querySelector('[data-ff-process-verdict]');
  const processVerdictText=demo.querySelector('[data-ff-process-verdict-text]');

  const reduceMotion=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let visitorChoice=null;
  let processTimers=[];
  let processToken=0;

  demo.dataset.ffState='choice';

  const track=(eventName,detail={})=>{
    const payload={event:eventName,component:'deal_or_decoy_homepage',example:'joe_burrow_silver_prizm_psa10_demo',...detail};
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent('flipforge:demo',{detail:payload}));
  };

  const transition=mutate=>{
    if(!reduceMotion()&&typeof document.startViewTransition==='function'){
      document.startViewTransition(mutate);
      return;
    }
    mutate();
  };

  const clearProcessing=()=>{
    processTimers.forEach(window.clearTimeout);
    processTimers=[];
    processToken+=1;
  };

  const schedule=(token,delay,fn)=>{
    const timer=window.setTimeout(()=>{
      if(token!==processToken)return;
      fn();
    },delay);
    processTimers.push(timer);
  };

  const setProcessCopy=(step,label,title,counter)=>{
    if(processingStage)processingStage.dataset.ffProcessStep=String(step);
    if(processLabel)processLabel.textContent=label;
    if(processTitle)processTitle.textContent=title;
    if(processCounter)processCounter.textContent=counter;
  };

  const mark=(card,state)=>{
    if(!card)return;
    card.classList.remove('is-active','is-complete');
    if(state)card.classList.add(`is-${state}`);
  };

  const resetProcessingVisuals=()=>{
    if(processingStage)processingStage.dataset.ffProcessStep='1';
    mark(identityCard,'active');
    mark(evidenceCard,'');
    mark(valueCard,'');
    mark(processVerdict,'');
    valueLane?.classList.remove('is-recalculating');
    supported?.classList.remove('is-updated');
    processDiscount?.classList.remove('is-updated');
    if(identityState)identityState.textContent='CHECKING';
    if(evidenceState)evidenceState.textContent='WAITING';
    if(valueState)valueState.textContent='WAITING';
    if(evidenceKept)evidenceKept.textContent='—';
    if(evidenceReason)evidenceReason.textContent='Testing parallels, duplicates, grade, and identity conflicts.';
    if(supportedValue)supportedValue.textContent='Checking…';
    if(supportedDiscount)supportedDiscount.textContent='—';
    if(processVerdictText)processVerdictText.textContent='WAITING FOR EVIDENCE';
    setProcessCopy(1,'STEP 1 OF 4 · EXACT CARD','Confirming the exact card before price gets a vote…','CHECKING');
  };

  const finalizeProcessingVisuals=()=>{
    mark(identityCard,'complete');
    if(identityState)identityState.textContent='VERIFIED';
    mark(evidenceCard,'complete');
    if(evidenceState)evidenceState.textContent='2 QUALIFIED';
    if(evidenceKept)evidenceKept.textContent='2';
    if(evidenceReason)evidenceReason.textContent='5 removed: wrong parallel · duplicates · identity conflict';
    mark(valueCard,'complete');
    if(valueState)valueState.textContent='REBUILT';
    if(supportedValue)supportedValue.textContent='$357.20';
    if(supportedDiscount)supportedDiscount.textContent='2.3%';
    supported?.classList.add('is-updated');
    processDiscount?.classList.add('is-updated');
    mark(processVerdict,'active');
    if(processVerdictText)processVerdictText.textContent='VERIFY';
    setProcessCopy(4,'STEP 4 OF 4 · DECISION','The apparent bargain does not survive the evidence check.','VERIFY');
  };

  const recordCompletedDecision=()=>{
    track('flipforge_demo_completed',{visitor_choice:visitorChoice,flipforge_decision:'VERIFY',decision_changed:visitorChoice!=='VERIFY'});
    if(visitorChoice!=='VERIFY')track('flipforge_demo_decision_changed',{from:visitorChoice,to:'VERIFY'});
  };

  const showResult=()=>{
    clearProcessing();
    transition(()=>{
      demo.dataset.ffState='result';
      choiceStage.hidden=true;
      if(processingStage)processingStage.hidden=true;
      resultStage.hidden=false;
    });
    recordCompletedDecision();
    if(status)status.textContent=`You chose ${visitorChoice}. FlipForge returns VERIFY because five of seven comparisons were rejected and the supported discount is 2.3 percent.`;
    window.setTimeout(()=>resultHeading?.focus({preventScroll:true}),reduceMotion()?0:120);
  };

  const runProcessingSequence=()=>{
    clearProcessing();
    resetProcessingVisuals();
    const token=processToken;

    track('flipforge_demo_processing_started',{visitor_choice:visitorChoice});

    if(reduceMotion()){
      finalizeProcessingVisuals();
      showResult();
      return;
    }

    schedule(token,700,()=>{
      mark(identityCard,'complete');
      if(identityState)identityState.textContent='VERIFIED';
      mark(evidenceCard,'active');
      setProcessCopy(2,'STEP 2 OF 4 · EVIDENCE','Seven candidate comparisons found. Testing which ones actually belong…','7 FOUND');
    });

    schedule(token,1550,()=>{
      mark(evidenceCard,'complete');
      if(evidenceState)evidenceState.textContent='2 QUALIFIED';
      if(evidenceKept)evidenceKept.textContent='2';
      if(evidenceReason)evidenceReason.textContent='5 removed: wrong parallel · duplicates · identity conflict';
      mark(valueCard,'active');
      valueLane?.classList.add('is-recalculating');
      setProcessCopy(3,'STEP 3 OF 4 · ECONOMICS','Rebuilding value from the two qualified comparisons…','2 KEPT');
    });

    schedule(token,2550,()=>{
      if(supportedValue)supportedValue.textContent='$357.20';
      supported?.classList.add('is-updated');
      mark(valueCard,'complete');
      if(valueState)valueState.textContent='REBUILT';
      mark(processVerdict,'active');
      if(supportedDiscount)supportedDiscount.textContent='2.3%';
      processDiscount?.classList.add('is-updated');
      setProcessCopy(4,'STEP 4 OF 4 · DECISION','The apparent 24% bargain is only 2.3% after evidence qualification.','VERIFY');
      if(processVerdictText)processVerdictText.textContent='VERIFY';
    });

    schedule(token,3600,showResult);
  };

  const showProcessing=()=>{
    transition(()=>{
      demo.dataset.ffState='processing';
      choiceStage.hidden=true;
      resultStage.hidden=true;
      if(processingStage)processingStage.hidden=false;
    });
    runProcessingSequence();
  };

  const showChoices=()=>{
    clearProcessing();
    transition(()=>{
      demo.dataset.ffState='choice';
      delete demo.dataset.ffVisitorChoice;
      resultStage.hidden=true;
      if(processingStage)processingStage.hidden=true;
      choiceStage.hidden=false;
    });
    resetProcessingVisuals();
    window.setTimeout(()=>choices[0]?.focus({preventScroll:true}),reduceMotion()?0:120);
  };

  choices.forEach(button=>{
    button.addEventListener('click',()=>{
      visitorChoice=button.dataset.ffChoice||null;
      if(!visitorChoice)return;
      demo.dataset.ffVisitorChoice=visitorChoice.toLowerCase();
      if(visitorChoiceLabel)visitorChoiceLabel.textContent=visitorChoice;
      if(processingChoiceLabel)processingChoiceLabel.textContent=visitorChoice;
      track('flipforge_demo_choice_recorded',{visitor_choice:visitorChoice});
      if(status)status.textContent=`You chose ${visitorChoice}. FlipForge is checking identity, evidence, economics, and the final decision.`;
      showProcessing();
    });
  });

  evidenceOpen?.addEventListener('click',()=>{
    track('flipforge_demo_evidence_opened',{visitor_choice:visitorChoice});
    if(typeof evidenceDialog?.showModal==='function')evidenceDialog.showModal();
    else evidenceDialog?.setAttribute('open','');
  });

  const closeEvidence=()=>{
    if(!evidenceDialog)return;
    if(typeof evidenceDialog.close==='function'&&evidenceDialog.open)evidenceDialog.close();
    else evidenceDialog.removeAttribute('open');
  };

  evidenceClose.forEach(button=>button.addEventListener('click',closeEvidence));
  evidenceDialog?.addEventListener('click',event=>{
    if(event.target!==evidenceDialog)return;
    const rect=evidenceDialog.getBoundingClientRect();
    const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    if(!inside)closeEvidence();
  });

  replay?.addEventListener('click',()=>{
    track('flipforge_demo_replayed',{previous_choice:visitorChoice});
    visitorChoice=null;
    if(visitorChoiceLabel)visitorChoiceLabel.textContent='—';
    if(processingChoiceLabel)processingChoiceLabel.textContent='—';
    if(status)status.textContent='The demonstration has been reset. Choose BUY, WATCH, VERIFY, or PASS.';
    closeEvidence();
    showChoices();
  });

  demo.querySelectorAll('[data-ff-deal-cta]').forEach(link=>{
    link.addEventListener('click',()=>track('flipforge_demo_cta_clicked',{
      cta:link.dataset.ffDealCta,
      visitor_choice:visitorChoice,
      flipforge_decision:visitorChoice?'VERIFY':null
    }));
  });
})();