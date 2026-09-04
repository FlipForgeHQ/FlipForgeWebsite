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
  const heroFilm=document.querySelector('[data-ff-hero-film]');
  const reduceMotion=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let visitorChoice=null;
  let started=false;

  const style=document.createElement('style');
  style.textContent=`
    .ff-proof-handoff{width:min(1180px,calc(100% - 48px));margin:6px auto 0;padding:24px 28px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:24px;border:1px solid rgba(212,175,55,.28);border-radius:18px;background:linear-gradient(120deg,rgba(184,134,11,.11),rgba(0,0,0,.72));box-shadow:0 18px 48px rgba(0,0,0,.24);transition:border-color .35s ease,box-shadow .35s ease,transform .35s ease}
    .ff-proof-handoff.is-ready{border-color:rgba(212,175,55,.65);box-shadow:0 22px 64px rgba(0,0,0,.36),0 0 34px rgba(212,175,55,.08);transform:translateY(-2px)}
    .ff-proof-handoff-copy small{display:block;margin-bottom:7px;color:#d4af37;font-size:.74rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
    .ff-proof-handoff-copy strong{display:block;color:#fff;font-size:clamp(1.35rem,2.5vw,2rem);line-height:1.08;letter-spacing:-.025em}
    .ff-proof-handoff-copy span{display:block;margin-top:7px;color:#8b8f98;font-size:.96rem;line-height:1.45}
    .ff-proof-handoff-button{min-width:190px;padding:14px 20px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d4af37;border-radius:10px;background:#d4af37;color:#000;font:inherit;font-weight:850;text-decoration:none;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}
    .ff-proof-handoff-button:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(212,175,55,.15)}
    .ff-proof-handoff-button:focus-visible{outline:3px solid rgba(212,175,55,.55);outline-offset:3px}
    .ff-deal-reasons>.ff-conversion-prompt{width:100%;margin:22px 0 0;padding:20px 22px;display:block;grid-template-columns:none;gap:0;border:1px solid rgba(212,175,55,.32);border-radius:13px;background:linear-gradient(120deg,rgba(184,134,11,.11),rgba(0,0,0,.35))}
    .ff-deal-reasons>.ff-conversion-prompt small{display:block;color:#d4af37;font-size:.72rem;font-weight:850;letter-spacing:.13em;line-height:1.45;text-transform:uppercase}
    .ff-deal-reasons>.ff-conversion-prompt strong{display:block;margin-top:6px;color:#fff;font-size:1.2rem;line-height:1.25}
    .ff-deal-reasons>.ff-conversion-prompt p{display:block;margin:7px 0 0;color:#8b8f98;font-size:.9rem;line-height:1.5}
    .ff-deal-actions.is-conversion-ready{margin-top:13px;padding-top:0}
    .ff-deal-actions.is-conversion-ready [data-ff-deal-cta="beta_access"]{order:-1;box-shadow:0 10px 28px rgba(212,175,55,.13)}
    @media(max-width:760px){
      .ff-proof-handoff{width:calc(100% - 24px);padding:20px;grid-template-columns:1fr;gap:16px}
      .ff-proof-handoff-button{width:100%}
      .ff-deal-reasons>.ff-conversion-prompt{margin-top:18px;padding:18px;display:block;grid-template-columns:none;gap:0}
      .ff-deal-reasons>.ff-conversion-prompt small{font-size:.68rem;line-height:1.45}
      .ff-deal-reasons>.ff-conversion-prompt strong{font-size:1.12rem;line-height:1.3}
      .ff-deal-reasons>.ff-conversion-prompt p{font-size:.9rem;line-height:1.55}
    }
    @media(prefers-reduced-motion:reduce){.ff-proof-handoff,.ff-proof-handoff-button{transition:none!important}}
  `;
  document.head.append(style);

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

  const buildHandoff=()=>{
    if(!section||document.querySelector('.ff-proof-handoff'))return;
    const handoff=document.createElement('aside');
    handoff.className='ff-proof-handoff';
    handoff.setAttribute('aria-label','Try the FlipForge deal check');
    handoff.innerHTML=`
      <div class="ff-proof-handoff-copy">
        <small>CHECK THE CARD BEFORE YOU CHASE THE PRICE.</small>
        <strong>Make your call. Then see what the evidence supports.</strong>
        <span>Choose BUY, WATCH, VERIFY, or PASS before FlipForge reveals the exact-card reasoning.</span>
      </div>
      <a class="ff-proof-handoff-button" href="#deal-or-decoy" data-ff-handoff>MAKE THE CALL →</a>
    `;
    section.before(handoff);
    const button=handoff.querySelector('[data-ff-handoff]');
    button?.addEventListener('click',event=>{
      event.preventDefault();
      markStarted();
      track('flipforge_demo_handoff_clicked');
      if(window.history&&typeof window.history.replaceState==='function')window.history.replaceState(null,'','#deal-or-decoy');
      scrollTo(section);
      window.setTimeout(()=>sectionHeading?.focus({preventScroll:true}),reduceMotion()?0:420);
    });

    if(heroFilm&&'MutationObserver' in window){
      const sync=()=>handoff.classList.toggle('is-ready',heroFilm.dataset.ffScene==='6');
      sync();
      const observer=new MutationObserver(sync);
      observer.observe(heroFilm,{attributes:true,attributeFilter:['data-ff-scene']});
    }
  };

  const buildConversionMoment=()=>{
    const reasons=demo.querySelector('.ff-deal-reasons');
    const actions=demo.querySelector('.ff-deal-actions');
    const betaAccess=demo.querySelector('[data-ff-deal-cta="beta_access"]');
    const evaluate=demo.querySelector('[data-ff-deal-cta="evaluate_listing"]');
    if(!reasons||!actions||!betaAccess)return;

    if(!reasons.querySelector('.ff-conversion-prompt')){
      const prompt=document.createElement('div');
      prompt.className='ff-conversion-prompt';
      prompt.innerHTML=`
        <small>EVIDENCE BEFORE EMOTION.</small>
        <strong>Bring the card that makes you hesitate.</strong>
        <p>Check the exact card, challenge the comps, and see whether the evidence supports the price before you spend.</p>
      `;
      actions.before(prompt);
    }

    betaAccess.classList.remove('decision-button-secondary');
    betaAccess.classList.add('decision-button-primary');
    if(evaluate){
      evaluate.classList.remove('decision-button-primary');
      evaluate.classList.add('decision-button-secondary');
      actions.insertBefore(betaAccess,evaluate);
    }
    actions.classList.add('is-conversion-ready');
  };

  buildHandoff();
  buildConversionMoment();

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
      if(status)status.textContent='Five of seven comparisons were invalid. The supported discount is 2.3 percent, and FlipForge returns VERIFY.';

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
    if(status)status.textContent='The demonstration has been reset. Choose BUY, WATCH, VERIFY, or PASS.';
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