(()=> {
  const root=document.querySelector('[data-ff-motion-attraction]');
  if(!root) return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scan=root.querySelector('[data-ff-motion-scan]');
  const progress=root.querySelector('[data-ff-motion-progress]');
  const kicker=root.querySelector('[data-ff-motion-kicker]');
  const title=root.querySelector('[data-ff-motion-title]');
  const copy=root.querySelector('[data-ff-motion-copy]');
  const state=root.querySelector('[data-ff-motion-state-label]');
  const states=[
    {name:'identity',ms:2200,k:'01 · IDENTITY INTELLIGENCE',t:'VERIFY THE CARD',c:'Player · year · product · parallel · grade',s:'IDENTITY VERIFIED',scan:'70%'},
    {name:'evidence',ms:3000,k:'02 · EVIDENCE INTELLIGENCE',t:'TEST THE EVIDENCE',c:'Wrong parallels, duplicates, and identity conflicts get cut away',s:'7 FOUND → 2 TRUSTED',scan:'82%'},
    {name:'risk',ms:1500,k:'03 · RISK + ECONOMICS',t:'EXPOSE WHAT CHANGED',c:'Supported value replaces the misleading headline reference',s:'RISK VISIBLE',scan:'82%'},
    {name:'decision',ms:1700,k:'04 · DECISION INTELLIGENCE',t:'MAKE THE DECISION',c:'The reason trail stays attached to the call',s:'VERIFY',scan:'82%'},
    {name:'close',ms:1600,k:'CARD DECISION INTELLIGENCE™',t:'BEFORE YOU BUY. KNOW WHY.',c:'',s:'',scan:'82%'}
  ];
  const total=states.reduce((n,x)=>n+x.ms,0);
  let running=true,start=performance.now(),elapsedBeforePause=0;
  function render(now){
    if(!running){requestAnimationFrame(render);return}
    const elapsed=((now-start)+elapsedBeforePause)%total;
    let acc=0,current=states[0],local=0;
    for(const item of states){
      if(elapsed>=acc && elapsed<acc+item.ms){current=item;local=(elapsed-acc)/item.ms;break}
      acc+=item.ms;
    }
    root.dataset.state=current.name;
    if(kicker) kicker.textContent=current.k;
    if(title) title.textContent=current.t;
    if(copy) copy.textContent=current.c;
    if(state) state.textContent=current.s;
    if(scan && !reduced){
      if(current.name==='identity') scan.style.left=(18+52*local)+'%';
      else if(current.name==='evidence') scan.style.left=(24+58*local)+'%';
      else scan.style.left=current.scan;
    }
    if(progress) progress.style.width=((elapsed/total)*100)+'%';
    requestAnimationFrame(render);
  }
  if(reduced){
    root.dataset.state='decision';
    if(kicker) kicker.textContent='CARD DECISION INTELLIGENCE™';
    if(title) title.textContent='VERIFY THE CARD. TEST THE EVIDENCE. KNOW WHY.';
    if(copy) copy.textContent='Identity → Evidence → Economics → Risk → Decision → Receipt';
    if(state) state.textContent='VERIFY';
    if(progress) progress.style.width='100%';
    return;
  }
  const observer=new IntersectionObserver(entries=>{
    const visible=entries[0]?.isIntersecting;
    if(visible && !running){running=true;start=performance.now()}
    if(!visible && running){running=false;elapsedBeforePause=((performance.now()-start)+elapsedBeforePause)%total}
  },{threshold:.15});
  observer.observe(root);
  requestAnimationFrame(render);
})();