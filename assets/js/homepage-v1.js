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

  const normalizeHomepageActions=()=>{
    const desktopTry=document.querySelector('.desktop-nav a[href="#try-flipforge"]');
    const desktopBeta=document.querySelector('.desktop-nav a[href="beta-application.html"]');
    const mobileTry=document.querySelector('.mobile-nav a[href="#try-flipforge"]');
    desktopTry?.classList.remove('nav-cta');
    desktopBeta?.classList.add('nav-cta');
    if(desktopTry)desktopTry.textContent='Try FlipForge';
    if(desktopBeta)desktopBeta.textContent='Request Access';
    if(mobileTry){
      mobileTry.textContent='Try FlipForge — interactive demo';
      mobileTry.classList.add('ff-mobile-demo-cta');
    }
    if(!document.querySelector('.ff-demo-float')){
      const floating=document.createElement('a');
      floating.className='ff-demo-float';
      floating.href='#try-flipforge';
      floating.setAttribute('aria-label','See the Try FlipForge interactive demo');
      floating.innerHTML='<span>Product demo</span><strong>See FlipForge ↓</strong>';
      document.body.append(floating);
    }
  };
  normalizeHomepageActions();

  const steps=[
    {label:'Step 1 of 4 · Define the card',title:'Start with the card you actually own.',copy:'FlipForge separates the raw card baseline from the best-case graded headline before modeling any outcome.',state:'DEFINE INPUTS',stateClass:'amber',checks:[['good','✓','Raw identity defined','Year, set, player, card number, and current state are explicit.'],['neutral','→','Raw baseline stays separate','The current card is not valued as though a future grade already happened.'],['neutral','→','Next input','Set realistic grade probabilities before comparing upside.']]},
    {label:'Step 2 of 4 · Set outcomes',title:'A PSA 10 cannot be the default assumption.',copy:'FlipForge requires the grading scenario to account for multiple realistic outcomes instead of anchoring the decision to the highest grade.',state:'SCENARIO READY',stateClass:'blue',checks:[['good','✓','Outcome probabilities defined','The scenario accounts for more than one possible grade.'],['good','✓','Probabilities must total 100%','The model cannot quietly ignore downside outcomes.'],['neutral','→','Best case remains a scenario','PSA 10 upside is visible without being treated as guaranteed.']]},
    {label:'Step 3 of 4 · Add costs',title:'The best-case price is not the expected result.',copy:'Once grading and shipping costs plus lower-grade outcomes are included, the apparent advantage becomes much thinner.',state:'MARGIN THIN',stateClass:'amber',checks:[['good','✓','Grading cost included','Submission and shipping cost reduce the expected outcome.'],['bad','!','Lower grades change the economics','A strong headline value can be offset by more likely lower-grade results.'],['neutral','→','Expected uplift is limited','The decision now reflects the full scenario rather than the best case.']]},
    {label:'Step 4 of 4 · Get guidance',title:'Keep it raw when the grading edge is not strong enough.',copy:'The modeled scenario does not create enough expected advantage to justify grading risk. FlipForge preserves the assumptions and returns KEEP RAW.',state:'KEEP RAW',stateClass:'amber',checks:[['good','✓','Clear grading guidance','The result follows the probability-weighted setup, not the PSA 10 headline.'],['neutral','→','What could change it','Better condition evidence, lower costs, or stronger graded values can change the scenario.'],['good','✓','No grade guarantee','FlipForge models grading economics; it does not promise a future grade.']]}
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
    if(completed){playback.textContent='Restart demo';playback.setAttribute('aria-pressed','false');if(screenMode)screenMode.textContent='Illustrative · Final guidance';return;}
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
      if(floatingDemo){floatingDemo.style.opacity=inView?'0':'1';floatingDemo.style.transform=inView?'translateY(8px)':'translateY(0)';floatingDemo.style.pointerEvents=inView?'none':'auto';floatingDemo.setAttribute('aria-hidden',inView?'true':'false');}
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
