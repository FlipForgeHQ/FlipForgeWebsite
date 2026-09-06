(()=>{
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
  const valueCard=demo.querySelector('[data-ff-process-card="value"]');
  const evidenceCard=demo.querySelector('[data-ff-process-card="evidence"]');
  const identityState=demo.querySelector('[data-ff-identity-state]');
  const valueState=demo.querySelector('[data-ff-value-state]');
  const evidenceState=demo.querySelector('[data-ff-evidence-state]');
  const processComps=[...demo.querySelectorAll('[data-ff-live-comp]')];
  const valueLane=demo.querySelector('[data-ff-value-lane]');
  const supported=demo.querySelector('[data-ff-supported]');
  const processDiscount=demo.querySelector('[data-ff-process-discount]');
  const supportedValue=demo.querySelector('[data-ff-supported-value]');
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

  const transition=(mutate)=>{
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

  const setCompState=(index,state)=>{
    const comp=processComps[index];
    if(!comp)return;
    comp.classList.remove('is-reviewing','is-valid','is-rejected');
    if(state)comp.classList.add(`is-${state}`);
    const descriptor=comp.querySelector('small')?.textContent||`comparison ${index+1}`;
    const spoken=state==='valid'?'accepted exact match':state==='rejected'?'rejected':state==='reviewing'?'being checked':'pending';
    comp.setAttribute('aria-label',`Comparison ${index+1}, ${descriptor}, ${spoken}`);
  };

  const resetProcessingVisuals=()=>{
    if(processingStage)processingStage.dataset.ffProcessStep='1';
    [identityCard,valueCard].forEach(card=>card?.classList.remove('is-active','is-complete'));
    identityCard?.classList.add('is-active');
    evidenceCard?.classList.remove('is-active','is-complete');
    valueLane?.classList.remove('is-recalculating');
    supported?.classList.remove('is-updated');
    processDiscount?.classList.remove('is-updated');
    processVerdict?.classList.remove('is-active');
    if(identityState)identityState.textContent='CHECKING';
    if(evidenceState)evidenceState.textContent='WAITING';
    if(valueState)valueState.textContent='WAITING';
    if(supportedValue)supportedValue.textContent='Checking…';
    if(supportedDiscount)supportedDiscount.textContent='—';
    if(processVerdictText)processVerdictText.textContent='WAITING FOR EVIDENCE';
    processComps.forEach((_,index)=>setCompState(index,''));
    setProcessCopy(1,'STEP 1 OF 4 · EXACT CARD','Confirming year, set, card number, parallel, grader and grade…','CHECKING');
  };

  const finalizeProcessingVisuals=()=>{
    identityCard?.classList.remove('is-active');
    identityCard?.classList.add('is-complete');
    if(identityState)identityState.textContent='MATCH';
    processComps.forEach((comp,index)=>setCompState(index,comp.dataset.finalState||'rejected'));
    evidenceCard?.classList.add('is-complete');
    if(evidenceState)evidenceState.textContent='2 EXACT · 5 REJECTED';
    valueCard?.classList.add('is-complete');
    if(valueState)valueState.textContent='RECALCULATED';
    if(supportedValue)supportedValue.textContent='$357.20';
    if(supportedDiscount)supportedDiscount.textContent='2.3%';
    supported?.classList.add('is-updated');
    processDiscount?.classList.add('is-updated');
    processVerdict?.classList.add('is-active');
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
    if(status)status.textContent=`You chose ${visitorChoice}. FlipForge returns VERIFY because five of seven comparisons were invalid and the supported discount is 2.3 percent.`;
    window.setTimeout(()=>resultHeading?.focus({preventScroll:true}),reduceMotion()?0:140);
  };

  const runProcessingSequence=()=>{
    clearProcessing();
    resetProcessingVisuals();
    const token=processToken;

    if(reduceMotion()){
      finalizeProcessingVisuals();
      showResult();
      return;
    }

    track('flipforge_demo_processing_started',{visitor_choice:visitorChoice});

    schedule(token,620,()=>{
      identityCard?.classList.remove('is-active');
      identityCard?.classList.add('is-complete');
      if(identityState)identityState.textContent='MATCH';
      setProcessCopy(2,'STEP 2 OF 4 · CHALLENGE THE COMPS','Testing seven comparisons against the exact Silver Prizm PSA 10…','0 / 7');
      evidenceCard?.classList.add('is-active');
    });

    const start=850;
    const stride=190;
    processComps.forEach((comp,index)=>{
      schedule(token,start+(index*stride),()=>{
        setCompState(index,'reviewing');
        if(index>0){
          const previous=processComps[index-1];
          setCompState(index-1,previous.dataset.finalState||'rejected');
        }
        if(evidenceState)evidenceState.textContent=`CHECKING ${index+1} OF 7`;
        if(processCounter)processCounter.textContent=`${index+1} / 7`;
      });
    });

    schedule(token,start+(processComps.length*stride),()=>{
      const last=processComps.at(-1);
      if(last)setCompState(processComps.length-1,last.dataset.finalState||'valid');
      evidenceCard?.classList.remove('is-active');
      evidenceCard?.classList.add('is-complete');
      if(evidenceState)evidenceState.textContent='2 EXACT · 5 REJECTED';
      setProcessCopy(3,'STEP 3 OF 4 · RECALCULATE VALUE','Five weak comparisons are out. Rebuilding value from the two exact matches…','2 / 7 KEPT');
      valueCard?.classList.add('is-active');
      valueLane?.classList.add('is-recalculating');
    });

    schedule(token,2740,()=>{
      if(supportedValue)supportedValue.textContent='$357.20';
      if(supportedDiscount)supportedDiscount.textContent='2.3%';
      supported?.classList.add('is-updated');
      processDiscount?.classList.add('is-updated');
      valueCard?.classList.remove('is-active');
      valueCard?.classList.add('is-complete');
      if(valueState)valueState.textContent='RECALCULATED';
      if(processCounter)processCounter.textContent='$357.20';
    });

    schedule(token,3220,()=>{
      setProcessCopy(4,'STEP 4 OF 4 · DECISION','The 24.0% apparent bargain is only 2.3% after evidence qualification.','VERIFY');
      processVerdict?.classList.add('is-active');
      if(processVerdictText)processVerdictText.textContent='VERIFY';
    });

    schedule(token,3820,showResult);
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
    window.setTimeout(()=>choices[0]?.focus({preventScroll:true}),reduceMotion()?0:140);
  };

  choices.forEach(button=>{
    button.addEventListener('click',()=>{
      visitorChoice=button.dataset.ffChoice||null;
      if(!visitorChoice)return;

      demo.dataset.ffVisitorChoice=visitorChoice.toLowerCase();
      if(visitorChoiceLabel)visitorChoiceLabel.textContent=visitorChoice;
      if(processingChoiceLabel)processingChoiceLabel.textContent=visitorChoice;
      track('flipforge_demo_choice_recorded',{visitor_choice:visitorChoice});
      if(status)status.textContent=`You chose ${visitorChoice}. FlipForge is now checking exact identity, comparison quality, supported value, and the final decision.`;
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