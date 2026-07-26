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
      label:'Question 1 of 4 · Exact identity',
      title:'A title claim is not enough.',
      copy:'FlipForge separates the seller’s wording from the verified card attributes before comparing any price or completed sale.',
      state:'CHECK IDENTITY',
      stateClass:'amber',
      checks:[
        ['good','✓','Year, set, player and card number align','The base identity is consistent.'],
        ['bad','!','Parallel remains unresolved','Refractor cannot be assumed from the title alone.'],
        ['neutral','→','Next step','Compare the slab and card photos with authoritative identity evidence.']
      ]
    },
    {
      label:'Question 2 of 4 · Market evidence',
      title:'Only true matches should influence value.',
      copy:'The returned record is labeled Base / Unstated. Because the target is a Refractor, FlipForge excludes it instead of blending two different markets.',
      state:'EVIDENCE BLOCKED',
      stateClass:'red',
      checks:[
        ['good','✓','Completed-sale status reviewed','Sale status alone does not make the record comparable.'],
        ['bad','!','Parallel mismatch found','Base and Refractor values cannot be combined.'],
        ['neutral','→','Evidence effect','The record remains visible in traceback but stays out of supported value.']
      ]
    },
    {
      label:'Question 3 of 4 · Decision economics',
      title:'Unsupported identity means unsupported economics.',
      copy:'FlipForge will not calculate a confident purchase or grading thesis from a comp set containing an unresolved parallel mismatch.',
      state:'VALUE UNSUPPORTED',
      stateClass:'red',
      checks:[
        ['bad','!','Fair-value support withheld','The evidence set does not yet prove the target card.'],
        ['bad','!','ROI conclusion withheld','A precise percentage would create false confidence.'],
        ['good','✓','Uncertainty preserved','The system keeps the missing proof visible instead of inventing an answer.']
      ]
    },
    {
      label:'Question 4 of 4 · Guidance',
      title:'Verify before the card influences a decision.',
      copy:'The appropriate outcome is not BUY or PASS. It is VERIFY: confirm the parallel, replace the mismatched record, and rerun the evidence review.',
      state:'VERIFY',
      stateClass:'blue',
      checks:[
        ['good','✓','Clear action state','The result explains what is wrong and what to do next.'],
        ['neutral','→','Required proof','Use slab photos, card images, item specifics, and an authoritative identity source.'],
        ['good','✓','Decision protected','No purchase authorization is produced from weak evidence.']
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
    exact:{
      record:'2018 Topps Chrome #150 Refractor · PSA 10',
      code:'ACCEPT_EXACT_IDENTITY',
      title:'Identity can enter evidence review.',
      copy:'Year, set, card number, parallel, grader, and grade match the target. The record may proceed to source, sale-status, date, and quality checks.',
      symbol:'✓',
      className:'exact'
    },
    parallel:{
      record:'2018 Topps Chrome #150 Base / Unstated · PSA 10',
      code:'REJECT_PARALLEL_MISMATCH',
      title:'The record is a different card market.',
      copy:'The target is a Refractor, but the evidence record is Base or does not prove a parallel. FlipForge blocks it before valuation.',
      symbol:'!',
      className:'parallel'
    },
    grade:{
      record:'2018 Topps Chrome #150 Refractor · PSA 9',
      code:'REJECT_GRADE_MISMATCH',
      title:'The grade lane does not match.',
      copy:'A PSA 9 sale cannot be treated as an exact PSA 10 comp. It may provide broader context, but it does not automatically support the target value.',
      symbol:'!',
      className:'grade'
    }
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
