(()=>{
  const toggle=document.querySelector('.menu-toggle');
  const menu=document.querySelector('.mobile-nav');
  const backdrop=document.querySelector('.backdrop');
  let lastFocus=null;
  const focusable=()=>menu?[...menu.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')]:[];
  const closeMenu=()=>{
    if(!toggle||!menu||!backdrop)return;
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Open navigation menu');
    menu.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden','true');
    document.body.classList.remove('menu-open');
    if(lastFocus)lastFocus.focus();
  };
  const openMenu=()=>{
    if(!toggle||!menu||!backdrop)return;
    lastFocus=document.activeElement;
    toggle.setAttribute('aria-expanded','true');
    toggle.setAttribute('aria-label','Close navigation menu');
    menu.classList.add('open');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden','false');
    document.body.classList.add('menu-open');
    const items=focusable();
    if(items.length)items[0].focus();
  };
  if(toggle&&menu&&backdrop){
    toggle.addEventListener('click',()=>toggle.getAttribute('aria-expanded')==='true'?closeMenu():openMenu());
    backdrop.addEventListener('click',closeMenu);
    menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape')closeMenu();
      if(e.key==='Tab'&&menu.classList.contains('open')){
        const items=focusable();
        if(!items.length)return;
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    window.addEventListener('resize',()=>{if(innerWidth>1000)closeMenu();});
  }

  document.querySelectorAll('.faq-item button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const item=btn.closest('.faq-item');
      const open=item.classList.toggle('open');
      btn.setAttribute('aria-expanded',String(open));
      const marker=btn.querySelector('span:last-child');
      if(marker)marker.textContent=open?'−':'+';
    });
  });

  const demoSteps=[
    {
      label:'Step 1 of 4 · Enter the card',
      title:'A title claim is not enough.',
      copy:'FlipForge separates the seller’s wording from the verified card attributes before comparing any price or sale.',
      state:'CHECK IDENTITY',
      stateClass:'amber',
      checks:[
        ['good','✓','Base identity aligns','Year, set, player, and card number are consistent.'],
        ['bad','!','Parallel unresolved','Refractor cannot be assumed from the title.'],
        ['neutral','→','Next check','Review slab and card images against identity evidence.']
      ]
    },
    {
      label:'Step 2 of 4 · FlipForge checks it',
      title:'Only true matches should influence value.',
      copy:'The returned record is Base / Unstated. Because the target is a Refractor, FlipForge excludes it instead of blending two markets.',
      state:'EVIDENCE BLOCKED',
      stateClass:'red',
      checks:[
        ['good','✓','Sale status reviewed','A completed sale still must match the target card.'],
        ['bad','!','Parallel mismatch found','Base and Refractor values cannot be combined.'],
        ['neutral','→','Evidence effect','The record stays visible in traceback but out of supported value.']
      ]
    },
    {
      label:'Step 3 of 4 · Review economics',
      title:'Unsupported identity means unsupported economics.',
      copy:'FlipForge will not create a confident purchase or grading thesis from a comp set containing an unresolved mismatch.',
      state:'VALUE UNSUPPORTED',
      stateClass:'red',
      checks:[
        ['bad','!','Fair value withheld','The evidence set does not prove the target card.'],
        ['bad','!','ROI withheld','A precise percentage would create false confidence.'],
        ['good','✓','Uncertainty preserved','The missing proof stays visible instead of being guessed.']
      ]
    },
    {
      label:'Step 4 of 4 · Get guidance',
      title:'Verify before the card influences a decision.',
      copy:'The correct outcome is VERIFY: confirm the parallel, replace the mismatched record, and rerun evidence review.',
      state:'VERIFY',
      stateClass:'blue',
      checks:[
        ['good','✓','Clear action state','The result explains what is wrong and what to do next.'],
        ['neutral','→','Required proof','Use slab photos, item specifics, and authoritative identity evidence.'],
        ['good','✓','Decision protected','No purchase authorization comes from weak evidence.']
      ]
    }
  ];
  const demoButtons=[...document.querySelectorAll('[data-demo-step]')];
  const demoLabel=document.getElementById('demo-label');
  const demoTitle=document.getElementById('demo-title');
  const demoCopy=document.getElementById('demo-copy');
  const demoState=document.getElementById('demo-state');
  const demoChecks=document.getElementById('demo-checks');
  const renderDemo=index=>{
    const step=demoSteps[index];
    if(!step||!demoLabel||!demoTitle||!demoCopy||!demoState||!demoChecks)return;
    demoButtons.forEach((button,i)=>{
      const active=i===index;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    demoLabel.textContent=step.label;
    demoTitle.textContent=step.title;
    demoCopy.textContent=step.copy;
    demoState.textContent=step.state;
    demoState.className=`badge ${step.stateClass}`;
    demoChecks.replaceChildren(...step.checks.map(([kind,symbol,title,detail])=>{
      const row=document.createElement('div');
      const icon=document.createElement('span');
      icon.className=`check-icon ${kind}`;
      icon.textContent=symbol;
      const text=document.createElement('p');
      const strong=document.createElement('strong');
      strong.textContent=title;
      const small=document.createElement('small');
      small.textContent=detail;
      text.append(strong,small);
      row.append(icon,text);
      return row;
    }));
  };
  demoButtons.forEach(button=>button.addEventListener('click',()=>renderDemo(Number(button.dataset.demoStep))));

  const identityStates={
    exact:{record:'2018 Topps Chrome #150 Refractor · PSA 10',code:'ACCEPT_EXACT_IDENTITY',title:'Identity can enter evidence review.',copy:'Year, set, card number, parallel, grader, and grade match the target.',symbol:'✓',className:'exact'},
    parallel:{record:'2018 Topps Chrome #150 Base / Unstated · PSA 10',code:'REJECT_PARALLEL_MISMATCH',title:'The record is a different card market.',copy:'The target is a Refractor, but the evidence does not prove that parallel. FlipForge blocks it before valuation.',symbol:'!',className:'parallel'},
    grade:{record:'2018 Topps Chrome #150 Refractor · PSA 9',code:'REJECT_GRADE_MISMATCH',title:'The grade lane does not match.',copy:'A PSA 9 sale cannot be treated as an exact PSA 10 comp. It can provide context, not automatic support.',symbol:'!',className:'grade'}
  };
  const identityButtons=[...document.querySelectorAll('[data-identity-state]')];
  const identityRecord=document.getElementById('identity-record');
  const identityResult=document.getElementById('identity-result');
  const identityCode=document.getElementById('identity-code');
  const identityTitle=document.getElementById('identity-title');
  const identityCopy=document.getElementById('identity-copy');
  const identitySymbol=identityResult?identityResult.querySelector('.identity-symbol'):null;
  const renderIdentity=key=>{
    const state=identityStates[key];
    if(!state||!identityRecord||!identityResult||!identityCode||!identityTitle||!identityCopy||!identitySymbol)return;
    identityButtons.forEach(button=>{
      const active=button.dataset.identityState===key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    identityRecord.textContent=state.record;
    identityCode.textContent=state.code;
    identityTitle.textContent=state.title;
    identityCopy.textContent=state.copy;
    identitySymbol.textContent=state.symbol;
    identityResult.className=`identity-result ${state.className}`;
  };
  identityButtons.forEach(button=>button.addEventListener('click',()=>renderIdentity(button.dataset.identityState)));

  const galleryButtons=[...document.querySelectorAll('[data-gallery-image]')];
  const galleryImage=document.getElementById('gallery-image');
  const galleryTitle=document.getElementById('gallery-title');
  const galleryCopy=document.getElementById('gallery-copy');
  const renderGallery=button=>{
    if(!button||!galleryImage||!galleryTitle||!galleryCopy)return;
    galleryButtons.forEach(item=>{
      const active=item===button;
      item.classList.toggle('active',active);
      item.setAttribute('aria-selected',String(active));
    });
    galleryImage.src=button.dataset.galleryImage;
    galleryImage.alt=button.dataset.galleryAlt||'';
    galleryTitle.textContent=button.dataset.galleryTitle||'';
    galleryCopy.textContent=button.dataset.galleryCopy||'';
  };
  galleryButtons.forEach(button=>button.addEventListener('click',()=>renderGallery(button)));

  const toolButtons=[...document.querySelectorAll('[data-tool-target]')];
  toolButtons.forEach(button=>button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.toolTarget);
    if(!target)return;
    toolButtons.forEach(item=>{
      const active=item===button;
      item.classList.toggle('active',active);
      item.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('.tool-panel').forEach(panel=>{
      const active=panel===target;
      panel.classList.toggle('active',active);
      panel.hidden=!active;
    });
  }));

  const outcomes={
    buy:{badge:'BUY CANDIDATE',badgeClass:'green',title:'Supported opportunity, not an automatic purchase.',cause:'Validated evidence supports a favorable relationship between asking price and supported value.',support:'Exact identity, usable completed sales, acceptable liquidity, and visible risk.',change:'A different parallel, weak listing condition, fees, or new market evidence.',next:'Confirm the exact listing, condition, seller details, and total acquisition cost.'},
    watch:{badge:'WATCH',badgeClass:'amber',title:'Interesting, but not ready for action.',cause:'The card or market is worth tracking, but the current price or evidence is not strong enough.',support:'Usable identity and some market support without a decisive margin.',change:'A better entry price, stronger completed sales, or improved liquidity.',next:'Track price movement and wait for better evidence or a better setup.'},
    verify:{badge:'VERIFY',badgeClass:'blue',title:'The decision depends on missing proof.',cause:'Identity, evidence quality, sale status, or listing details remain unresolved.',support:'Some information aligns, but the uncertainty is decision-critical.',change:'Authoritative identity proof, better photos, or a corrected evidence record.',next:'Resolve the named uncertainty before using the card or comp in a decision.'},
    pass:{badge:'PASS',badgeClass:'red',title:'The current setup does not justify the risk.',cause:'Price, evidence quality, liquidity, downside, or uncertainty outweighs the supported opportunity.',support:'The evidence explains why the card is not attractive at the current terms.',change:'A meaningfully lower price or a stronger market/evidence profile.',next:'Avoid forcing the purchase; preserve the reason and revisit only if conditions change.'},
    grade:{badge:'GRADE',badgeClass:'green',title:'Probability-weighted grading economics are favorable.',cause:'Realistic grade outcomes support enough expected upside after grading cost and raw value.',support:'Condition assumptions, grade probabilities, costs, and downside are all visible.',change:'Lower grade odds, higher fees, longer turnaround, or weaker resale values.',next:'Inspect condition carefully and confirm all-in submission and selling costs.'}
  };
  const outcomeButtons=[...document.querySelectorAll('[data-outcome]')];
  const outcomeBadge=document.getElementById('outcome-badge');
  const outcomeTitle=document.getElementById('outcome-title');
  const outcomeCause=document.getElementById('outcome-cause');
  const outcomeSupport=document.getElementById('outcome-support');
  const outcomeChange=document.getElementById('outcome-change');
  const outcomeNext=document.getElementById('outcome-next');
  const renderOutcome=key=>{
    const outcome=outcomes[key];
    if(!outcome||!outcomeBadge||!outcomeTitle||!outcomeCause||!outcomeSupport||!outcomeChange||!outcomeNext)return;
    outcomeButtons.forEach(button=>{
      const active=button.dataset.outcome===key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    outcomeBadge.textContent=outcome.badge;
    outcomeBadge.className=`badge ${outcome.badgeClass}`;
    outcomeTitle.textContent=outcome.title;
    outcomeCause.textContent=outcome.cause;
    outcomeSupport.textContent=outcome.support;
    outcomeChange.textContent=outcome.change;
    outcomeNext.textContent=outcome.next;
  };
  outcomeButtons.forEach(button=>button.addEventListener('click',()=>renderOutcome(button.dataset.outcome)));

  const gradeForm=document.getElementById('grade-form');
  if(gradeForm){
    const n=id=>Math.max(0,Number(document.getElementById(id).value)||0);
    const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
    const update=()=>{
      const raw=n('raw-value');
      const cost=n('grading-cost');
      const vals=[n('psa10-value'),n('psa9-value'),n('psa8-value')];
      const probs=[n('psa10-prob'),n('psa9-prob'),n('psa8-prob')];
      const total=probs.reduce((a,b)=>a+b,0);
      const status=document.getElementById('grade-status');
      const result=document.getElementById('grade-result');
      document.getElementById('prob-total').textContent=total.toFixed(0)+'%';
      if(Math.abs(total-100)>.01){
        status.textContent='Probabilities must total exactly 100% before FlipForge can evaluate the scenario.';
        result.textContent='CHECK INPUTS';
        result.className='badge red';
        return;
      }
      const expected=vals.reduce((sum,v,i)=>sum+v*(probs[i]/100),0);
      const net=expected-cost;
      const gain=net-raw;
      const rate=raw>0?(gain/raw)*100:0;
      document.getElementById('expected-value').textContent=money.format(expected);
      document.getElementById('net-value').textContent=money.format(net);
      document.getElementById('expected-gain').textContent=money.format(gain);
      if(rate>=20){
        result.textContent='GRADE CANDIDATE';
        result.className='badge green';
        status.textContent='The probability-weighted outcome shows meaningful expected upside after grading cost. Condition, time, fees, and market risk still require review.';
      }else if(gain>0){
        result.textContent='REVIEW';
        result.className='badge amber';
        status.textContent='Expected upside is positive but not strong enough to ignore condition, turnaround time, and selling fees.';
      }else{
        result.textContent='KEEP RAW';
        result.className='badge red';
        status.textContent='The probability-weighted outcome does not currently cover raw value and grading cost.';
      }
    };
    gradeForm.addEventListener('submit',e=>{e.preventDefault();update();});
    gradeForm.querySelectorAll('input').forEach(input=>input.addEventListener('input',update));
    update();
  }
})();
