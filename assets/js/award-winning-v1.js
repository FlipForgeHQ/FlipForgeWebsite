(()=>{
  'use strict';

  const body=document.body;
  if(!body)return;
  body.classList.add('ff-aw-page');

  const isHome=Boolean(document.querySelector('.hero#overview'));
  if(isHome){
    body.classList.add('ff-aw-home');

    const falseConfidence=document.querySelector('.ff-false-confidence');
    if(falseConfidence&&!document.querySelector('.ff-aw-busted')){
      const section=document.createElement('section');
      section.className='ff-aw-busted';
      section.setAttribute('aria-labelledby','ff-aw-busted-heading');
      section.innerHTML=`
        <div class="ff-aw-busted-shell">
          <div class="ff-aw-busted-head">
            <div><span class="ff-kicker">BUSTED COMP · INTERACTIVE</span><h2 id="ff-aw-busted-heading">Which sale actually deserves to count?</h2></div>
            <p>Three sales can look close enough on a search screen. FlipForge asks whether they belong to the exact card before any price gets a vote.</p>
          </div>
          <div class="ff-aw-comp-options" role="group" aria-label="Choose a comparable sale">
            <button class="ff-aw-comp-button" type="button" data-aw-comp="exact"><span>Sale A · $885</span><strong>Same card · same parallel · same grade</strong></button>
            <button class="ff-aw-comp-button" type="button" data-aw-comp="parallel"><span>Sale B · $910</span><strong>Same set and player · different parallel</strong></button>
            <button class="ff-aw-comp-button" type="button" data-aw-comp="grade"><span>Sale C · $840</span><strong>Same parallel · different grade</strong></button>
          </div>
          <div class="ff-aw-comp-result" data-aw-comp-result aria-live="polite"><strong>Choose a sale.</strong> See whether FlipForge would let it influence the decision.</div>
        </div>`;
      falseConfidence.insertAdjacentElement('afterend',section);

      const result=section.querySelector('[data-aw-comp-result]');
      const buttons=[...section.querySelectorAll('[data-aw-comp]')];
      const responses={
        exact:'<strong>ACCEPTED.</strong> Exact identity aligns, so this completed sale can enter evidence review.',
        parallel:'<strong>EXCLUDED.</strong> A different parallel is a different card market. The sale stays visible in traceback but does not support the target.',
        grade:'<strong>CONTEXT ONLY.</strong> The grade lane does not match. It can inform context without quietly becoming an exact comp.'
      };
      buttons.forEach(button=>button.addEventListener('click',()=>{
        buttons.forEach(item=>item.classList.toggle('is-selected',item===button));
        result.innerHTML=responses[button.dataset.awComp]||responses.exact;
      }));
    }
  }

  const betaForm=document.querySelector('[data-beta-application-form]');
  if(betaForm){
    const applySection=betaForm.closest('.section');
    if(applySection&&!applySection.id)applySection.id='apply';

    const hero=document.querySelector('main > .page-hero');
    if(hero&&!hero.querySelector('.buttons')){
      const actions=document.createElement('div');
      actions.className='buttons ff-beta-hero-actions';
      actions.innerHTML='<a class="btn primary" href="#apply">Start application</a>';
      hero.appendChild(actions);
    }

    const directNotices=[...document.querySelectorAll('main > .ff-beta-notice')];
    if(directNotices.length>1&&!document.querySelector('.ff-beta-notice-grid')){
      const grid=document.createElement('div');
      grid.className='ff-beta-notice-grid';
      directNotices[0].before(grid);
      directNotices.forEach(notice=>grid.appendChild(notice));
    }

    const steps=[...betaForm.querySelectorAll('[data-aw-beta-step]')];
    const next=betaForm.querySelector('[data-aw-beta-next]');
    const back=betaForm.querySelector('[data-aw-beta-back]');
    if(steps.length>1){
      steps.slice(1).forEach(step=>{step.hidden=true;});
      betaForm.dataset.awStep='1';
    }
    const setStep=index=>{
      steps.forEach((step,i)=>{step.hidden=i!==index;});
      betaForm.dataset.awStep=String(index+1);
      steps[index]?.querySelector('input,select,textarea')?.focus({preventScroll:true});
      betaForm.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    };
    next?.addEventListener('click',()=>{
      const first=steps[0];
      const required=[...first.querySelectorAll('[required]')];
      const invalid=required.find(field=>!field.checkValidity());
      if(invalid){invalid.reportValidity();return;}
      setStep(1);
    });
    back?.addEventListener('click',()=>setStep(0));
  }
})();
