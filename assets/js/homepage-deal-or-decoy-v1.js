(()=>{
  'use strict';

  const demo=document.querySelector('[data-ff-deal-demo]');
  const heroTrigger=document.querySelector('[data-ff-see-action]');
  if(!demo)return;

  const section=document.getElementById('deal-or-decoy');
  const sectionHeading=document.getElementById('deal-or-decoy-title');
  const choiceStage=demo.querySelector('[data-ff-choice-stage]');
  const resultStage=demo.querySelector('[data-ff-result-stage]');
  const resultHeading=resultStage?.querySelector('h3');
  const comparison=demo.querySelector('[data-ff-decision-comparison]');
  const replay=demo.querySelector('[data-ff-replay]');
  const details=demo.querySelector('.ff-deal-comparisons');
  const status=demo.querySelector('[data-ff-deal-status]');
  const choices=[...demo.querySelectorAll('[data-ff-choice]')];
  const reduceMotion=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let visitorChoice=null;
  let started=false;

  const track=(eventName,detail={})=>{
    const payload={
      event:eventName,
      component:'deal_or_decoy_homepage',
      example:'joe_burrow_silver_prizm_psa10_demo',
      ...detail
    };
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent('flipforge:demo',{detail:payload}));
  };

  const markStarted=()=>{
    if(started)return;
    started=true;
    track('flipforge_demo_started');
  };

  const scrollTo=(target)=>{
    if(!target)return;
    target.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});
  };

  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      markStarted();
      observer.disconnect();
    },{threshold:.35});
    observer.observe(demo);
  }else{
    markStarted();
  }

  if(heroTrigger&&section){
    heroTrigger.addEventListener('click',event=>{
      event.preventDefault();
      markStarted();
      if(window.history&&typeof window.history.replaceState==='function')window.history.replaceState(null,'','#deal-or-decoy');
      scrollTo(section);
      window.setTimeout(()=>sectionHeading?.focus({preventScroll:true}),reduceMotion()?0:450);
    });
  }

  const renderChoiceComparison=()=>{
    if(!comparison||!visitorChoice)return;
    comparison.replaceChildren();
    comparison.append('You chose ');
    const chosen=document.createElement('strong');
    chosen.textContent=visitorChoice;
    comparison.append(chosen,'. FlipForge checked the evidence and returned ');
    const verdict=document.createElement('strong');
    verdict.textContent='VERIFY';
    comparison.append(verdict,'.');
  };

  choices.forEach(button=>{
    button.addEventListener('click',()=>{
      visitorChoice=button.dataset.ffChoice||null;
      if(!visitorChoice)return;

      markStarted();
      track('flipforge_demo_choice_recorded',{visitor_choice:visitorChoice});
      const decisionChanged=visitorChoice!=='VERIFY';
      track('flipforge_demo_completed',{
        visitor_choice:visitorChoice,
        flipforge_decision:'VERIFY',
        decision_changed:decisionChanged
      });
      if(decisionChanged)track('flipforge_demo_decision_changed',{from:visitorChoice,to:'VERIFY'});

      renderChoiceComparison();
      choiceStage.hidden=true;
      resultStage.hidden=false;
      status.textContent='Five of seven comparisons were invalid. The supported discount is 2.3 percent, and FlipForge returns VERIFY.';

      window.setTimeout(()=>{
        scrollTo(resultStage);
        resultHeading?.focus({preventScroll:true});
      },reduceMotion()?0:80);
    });
  });

  replay?.addEventListener('click',()=>{
    track('flipforge_demo_replayed',{previous_choice:visitorChoice});
    visitorChoice=null;
    choiceStage.hidden=false;
    resultStage.hidden=true;
    if(details)details.open=false;
    status.textContent='The demonstration has been reset. Choose BUY, WATCH, VERIFY, or PASS.';
    scrollTo(choiceStage);
    window.setTimeout(()=>choices[0]?.focus({preventScroll:true}),reduceMotion()?0:350);
  });

  demo.querySelectorAll('[data-ff-deal-cta]').forEach(link=>{
    link.addEventListener('click',()=>track('flipforge_demo_cta_clicked',{
      cta:link.dataset.ffDealCta,
      visitor_choice:visitorChoice,
      flipforge_decision:visitorChoice?'VERIFY':null
    }));
  });
})();
