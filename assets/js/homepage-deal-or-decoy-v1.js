(()=>{
  'use strict';

  const demo=document.querySelector('[data-ff-deal-demo]');
  if(!demo)return;

  const choiceStage=demo.querySelector('[data-ff-choice-stage]');
  const resultStage=demo.querySelector('[data-ff-result-stage]');
  const resultHeading=resultStage?.querySelector('h2');
  const visitorChoiceLabel=demo.querySelector('[data-ff-visitor-choice]');
  const replay=demo.querySelector('[data-ff-replay]');
  const evidenceDialog=demo.querySelector('[data-ff-evidence-dialog]');
  const evidenceOpen=demo.querySelector('[data-ff-open-evidence]');
  const evidenceClose=[...demo.querySelectorAll('[data-ff-close-evidence]')];
  const status=demo.querySelector('[data-ff-deal-status]');
  const choices=[...demo.querySelectorAll('[data-ff-choice]')];
  const reduceMotion=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let visitorChoice=null;

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

  const showResult=()=>{
    transition(()=>{
      demo.dataset.ffState='result';
      choiceStage.hidden=true;
      resultStage.hidden=false;
    });
    window.setTimeout(()=>resultHeading?.focus({preventScroll:true}),reduceMotion()?0:140);
  };

  const showChoices=()=>{
    transition(()=>{
      demo.dataset.ffState='choice';
      delete demo.dataset.ffVisitorChoice;
      resultStage.hidden=true;
      choiceStage.hidden=false;
    });
    window.setTimeout(()=>choices[0]?.focus({preventScroll:true}),reduceMotion()?0:140);
  };

  choices.forEach(button=>{
    button.addEventListener('click',()=>{
      visitorChoice=button.dataset.ffChoice||null;
      if(!visitorChoice)return;

      demo.dataset.ffVisitorChoice=visitorChoice.toLowerCase();
      if(visitorChoiceLabel)visitorChoiceLabel.textContent=visitorChoice;
      track('flipforge_demo_choice_recorded',{visitor_choice:visitorChoice});
      track('flipforge_demo_completed',{visitor_choice:visitorChoice,flipforge_decision:'VERIFY',decision_changed:visitorChoice!=='VERIFY'});
      if(visitorChoice!=='VERIFY')track('flipforge_demo_decision_changed',{from:visitorChoice,to:'VERIFY'});

      if(status)status.textContent=`You chose ${visitorChoice}. FlipForge returns VERIFY because five of seven comparisons were invalid and the supported discount is 2.3 percent.`;
      showResult();
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