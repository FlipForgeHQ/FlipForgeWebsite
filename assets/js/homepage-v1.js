(()=>{
  'use strict';

  const toggle=document.querySelector('.menu-toggle');
  const menu=document.querySelector('.mobile-nav');
  const backdrop=document.querySelector('.backdrop');
  let lastFocus=null;

  if(toggle&&menu&&backdrop){
    const focusable=()=>[...menu.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')];
    const closeMenu=()=>{
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Open navigation menu');
      menu.classList.remove('open');
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden','true');
      document.body.classList.remove('menu-open');
      if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus();
    };
    const openMenu=()=>{
      lastFocus=document.activeElement;
      toggle.setAttribute('aria-expanded','true');
      toggle.setAttribute('aria-label','Close navigation menu');
      menu.classList.add('open');
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden','false');
      document.body.classList.add('menu-open');
      focusable()[0]?.focus();
    };
    toggle.addEventListener('click',()=>toggle.getAttribute('aria-expanded')==='true'?closeMenu():openMenu());
    backdrop.addEventListener('click',closeMenu);
    menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeMenu();
      if(event.key!=='Tab'||!menu.classList.contains('open'))return;
      const items=focusable();
      if(!items.length)return;
      const first=items[0];
      const last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('resize',()=>{if(window.innerWidth>1000)closeMenu();},{passive:true});
  }

  const promoteTryFlipForge=()=>{
    const desktopTry=document.querySelector('.desktop-nav a[href="#try-flipforge"]');
    const desktopBeta=document.querySelector('.desktop-nav a[href="beta-application.html"]');
    const mobileTry=document.querySelector('.mobile-nav a[href="#try-flipforge"]');
    desktopBeta?.classList.remove('nav-cta');
    desktopTry?.classList.add('nav-cta');
    if(desktopTry)desktopTry.textContent='Try FlipForge';
    if(desktopBeta)desktopBeta.textContent='Beta Access';
    if(mobileTry){
      mobileTry.textContent='Try FlipForge — 60-second demo';
      mobileTry.classList.add('ff-mobile-demo-cta');
    }
    const heroActions=document.querySelector('.ff-primary-actions');
    if(heroActions&&!document.querySelector('.ff-hero-jump-link')){
      const jump=document.createElement('a');
      jump.className='ff-hero-jump-link';
      jump.href='#try-flipforge';
      jump.textContent='See FlipForge catch a bad decision ↓';
      heroActions.insertAdjacentElement('afterend',jump);
    }
    if(!document.querySelector('.ff-demo-float')){
      const floating=document.createElement('a');
      floating.className='ff-demo-float';
      floating.href='#try-flipforge';
      floating.setAttribute('aria-label','Jump to the Try FlipForge demo');
      floating.innerHTML='<span>Jump to demo</span><strong>Try FlipForge ↓</strong>';
      document.body.append(floating);
    }
  };
  promoteTryFlipForge();

  const decisionBoundaryText='Decision support only. FlipForge does not authorize transactions or guarantee outcomes.';
  const addDecisionBoundary=(container,placement='append')=>{
    if(!container||container.querySelector('.ff-decision-boundary'))return;
    const boundary=document.createElement('p');
    boundary.className='caption ff-decision-boundary';
    boundary.textContent=decisionBoundaryText;
    if(placement==='after')container.insertAdjacentElement('afterend',boundary);
    else container.append(boundary);
  };
  const dossierPreview=document.querySelector('.ff-dossier-preview');
  addDecisionBoundary(dossierPreview);
  const demoResult=document.querySelector('.demo-result');
  addDecisionBoundary(demoResult,'after');

  const steps=[
    {label:'Step 1 of 4 · Enter the card',title:'A title claim is not enough.',copy:'FlipForge separates the seller’s wording from the verified card attributes before comparing any price or sale.',state:'CHECK IDENTITY',stateClass:'amber',checks:[['good','✓','Base identity aligns','Year, set, player, and card number are consistent.'],['bad','!','Parallel unresolved','Refractor cannot be assumed from the title.'],['neutral','→','Next check','Review slab and card images against identity evidence.']]},
    {label:'Step 2 of 4 · FlipForge checks it',title:'Only true matches should influence value.',copy:'The returned record is Base / Unstated. Because the target is a Refractor, FlipForge excludes it instead of blending two markets.',state:'EVIDENCE BLOCKED',stateClass:'red',checks:[['good','✓','Sale status reviewed','A completed sale still must match the target card.'],['bad','!','Parallel mismatch found','Base and Refractor values cannot be combined.'],['neutral','→','Evidence effect','The record stays visible in traceback but out of supported value.']]},
    {label:'Step 3 of 4 · Review economics',title:'Unsupported identity means unsupported economics.',copy:'FlipForge will not create a confident purchase or grading thesis from a comp set containing an unresolved mismatch.',state:'VALUE UNSUPPORTED',stateClass:'red',checks:[['bad','!','Fair value withheld','The evidence set does not prove the target card.'],['bad','!','ROI withheld','A precise percentage would create false confidence.'],['good','✓','Uncertainty preserved','The missing proof stays visible instead of being guessed.']]},
    {label:'Step 4 of 4 · Get guidance',title:'Verify before the card influences a decision.',copy:'The correct outcome is VERIFY: confirm the parallel, replace the mismatched record, and rerun evidence review.',state:'VERIFY',stateClass:'blue',checks:[['good','✓','Clear action state','The result explains what is wrong and what to do next.'],['neutral','→','Resolution path','Confirm the parallel → replace mismatched evidence → rerun analysis.'],['good','✓','Decision protected','No purchase authorization comes from weak evidence.']]}
  ];

  const buttons=[...document.querySelectorAll('[data-demo-step]')];
  const label=document.getElementById('demo-label');
  const title=document.getElementById('demo-title');
  const copy=document.getElementById('demo-copy');
  const state=document.getElementById('demo-state');
  const checks=document.getElementById('demo-checks');
  const demoSection=document.getElementById('try-flipforge');
  const playback=document.getElementById('demo-playback');
  const screenMode=document.querySelector('.screen-mode');
  const floatingDemo=document.querySelector('.ff-demo-float');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const lastStepIndex=steps.length-1;
  let currentIndex=0;
  let timer=null;
  let inView=false;
  let paused=reducedMotion.matches;
  let completed=false;

  const renderStep=index=>{
    const step=steps[index];
    if(!step||!label||!title||!copy||!state||!checks)return;
    buttons.forEach((button,i)=>{const active=i===index;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    label.textContent=step.label;
    title.textContent=step.title;
    copy.textContent=step.copy;
    state.textContent=step.state;
    state.className=`badge ${step.stateClass}`;
    const fragment=document.createDocumentFragment();
    for(const [kind,symbol,heading,detail] of step.checks){
      const row=document.createElement('div');
      const icon=document.createElement('span');
      const text=document.createElement('p');
      const strong=document.createElement('strong');
      const small=document.createElement('small');
      icon.className=`check-icon ${kind}`;
      icon.textContent=symbol;
      strong.textContent=heading;
      small.textContent=detail;
      text.append(strong,small);
      row.append(icon,text);
      fragment.appendChild(row);
    }
    checks.replaceChildren(fragment);
    currentIndex=index;
  };
  const stopPreview=()=>{if(timer!==null){window.clearTimeout(timer);timer=null;}};
  const syncPlayback=()=>{
    if(!playback)return;
    if(completed){playback.textContent='Restart demo';playback.setAttribute('aria-pressed','false');if(screenMode)screenMode.textContent='Illustrative · Final verdict';return;}
    playback.textContent=paused?'Play preview':'Pause preview';
    playback.setAttribute('aria-pressed',String(paused));
    if(screenMode)screenMode.textContent=paused?'Illustrative · Paused':'Illustrative · Auto preview';
  };
  const finishPreview=()=>{stopPreview();paused=true;completed=true;syncPlayback();};
  const scheduleNext=()=>{
    stopPreview();
    if(paused||completed||!inView||document.hidden||reducedMotion.matches)return;
    timer=window.setTimeout(()=>{if(currentIndex>=lastStepIndex){finishPreview();return;}renderStep(currentIndex+1);if(currentIndex>=lastStepIndex){finishPreview();return;}scheduleNext();},4200);
  };
  const pauseForInteraction=()=>{paused=true;stopPreview();syncPlayback();};
  const restartPreview=()=>{completed=false;paused=false;renderStep(0);syncPlayback();scheduleNext();};

  buttons.forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.demoStep);completed=index===lastStepIndex;renderStep(index);if(completed)finishPreview();else pauseForInteraction();}));
  playback?.addEventListener('click',()=>{if(completed){restartPreview();return;}paused=!paused;syncPlayback();scheduleNext();});
  reducedMotion.addEventListener?.('change',event=>{paused=event.matches;if(event.matches)stopPreview();syncPlayback();scheduleNext();});
  document.addEventListener('visibilitychange',scheduleNext);

  if(demoSection&&'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      inView=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.35);
      if(floatingDemo){floatingDemo.style.opacity=inView?'0':'1';floatingDemo.style.transform=inView?'translateY(10px)':'translateY(0)';floatingDemo.style.pointerEvents=inView?'none':'auto';floatingDemo.setAttribute('aria-hidden',inView?'true':'false');}
      scheduleNext();
    },{threshold:[0,.35,.7]});
    observer.observe(demoSection);
  }else{
    inView=true;
    if(floatingDemo){floatingDemo.style.opacity='0';floatingDemo.style.pointerEvents='none';floatingDemo.setAttribute('aria-hidden','true');}
    scheduleNext();
  }
  syncPlayback();
})();
