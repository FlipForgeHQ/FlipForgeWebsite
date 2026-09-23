(()=> {
  const root=document.querySelector('[data-ff-motion-attraction]');
  if(!root) return;

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kicker=root.querySelector('[data-ff-motion-kicker]');
  const title=root.querySelector('[data-ff-motion-title]');
  const copy=root.querySelector('[data-ff-motion-copy]');
  const state=root.querySelector('[data-ff-motion-state-label]');
  const buttons=Array.from(root.querySelectorAll('[data-ff-motion-step]'));
  const visuals=Array.from(root.querySelectorAll('[data-ff-motion-visual]'));

  const states=[
    {
      name:'identity',
      k:'01 · IDENTITY INTELLIGENCE',
      t:'VERIFY THE EXACT CARD',
      c:'Identity is resolved before market evidence gets a vote.',
      s:'IDENTITY VERIFIED'
    },
    {
      name:'evidence',
      k:'02 · EVIDENCE INTELLIGENCE',
      t:'CHALLENGE THE EVIDENCE',
      c:'Wrong parallels, duplicates, stale records, and identity conflicts are removed.',
      s:'WEAK COMPS REMOVED'
    },
    {
      name:'decision',
      k:'03 · DECISION INTELLIGENCE',
      t:'SEE WHAT SURVIVES',
      c:'Economics and risk resolve into a decision with the reason trail attached.',
      s:'VERIFY'
    }
  ];

  let index=0;
  let timer=0;
  let running=false;

  const apply=(nextIndex,announce=false)=>{
    index=(nextIndex+states.length)%states.length;
    const current=states[index];
    root.dataset.state=current.name;
    if(kicker) kicker.textContent=current.k;
    if(title) title.textContent=current.t;
    if(copy) copy.textContent=current.c;
    if(state) state.textContent=current.s;

    buttons.forEach(button=>{
      const active=button.dataset.ffMotionStep===current.name;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    visuals.forEach(visual=>{
      const active=visual.dataset.ffMotionVisual===current.name;
      visual.setAttribute('aria-hidden',active?'false':'true');
    });

    if(announce && title) title.focus?.({preventScroll:true});
  };

  const stop=()=>{
    running=false;
    window.clearInterval(timer);
    timer=0;
  };

  const start=()=>{
    if(reduced||running) return;
    running=true;
    timer=window.setInterval(()=>apply(index+1),3400);
  };

  buttons.forEach((button,buttonIndex)=>{
    button.addEventListener('click',()=>{
      apply(buttonIndex);
      stop();
      start();
    });
  });

  apply(reduced?2:0);

  if(reduced) return;

  const observer=new IntersectionObserver(entries=>{
    if(entries[0]?.isIntersecting) start();
    else stop();
  },{threshold:.2});

  observer.observe(root);
})();