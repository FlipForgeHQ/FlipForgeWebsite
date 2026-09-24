(()=>{
  'use strict';
  const root=document.querySelector('[data-decision-forge]');
  if(!root)return;

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const buttons=[...root.querySelectorAll('[data-forge-step]')];
  const replay=root.querySelector('[data-forge-replay]');
  const toggle=root.querySelector('[data-forge-toggle]');
  const progress=root.querySelector('[data-forge-progress]');
  const heading=root.querySelector('[data-forge-heading]');
  const copy=root.querySelector('[data-forge-copy]');
  const status=root.querySelector('[data-forge-status]');
  const whyButton=root.querySelector('[data-forge-why-button]');
  const why=root.querySelector('[data-forge-why]');
  const scenes=[...root.querySelectorAll('[data-forge-scene]')];

  const stages=[
    {title:'Start with the card—not the price.',copy:'A listing enters as a question. The asking price stays context until identity and evidence earn authority.',status:'Card received · price held as context',scene:'identity'},
    {title:'Resolve the exact card.',copy:'Year, product, card number, parallel, grader, and grade must align before evidence can move downstream.',status:'Identity locked · exact card verified',scene:'identity'},
    {title:'Qualify the evidence. Reject what does not belong.',copy:'Candidate comps are challenged. Wrong parallel, wrong grade, duplicate, and identity-conflict rows are removed from the case.',status:'7 candidates · 5 rejected · 2 qualified',scene:'evidence'},
    {title:'Recalculate from the evidence that survived.',copy:'The displayed reference stops being the answer. Qualified completed-sale evidence rebuilds supported value.',status:'Supported value rebuilt · uncertainty visible',scene:'evidence'},
    {title:'Lock the decision. Reveal the reason.',copy:'FlipForge returns the next move with the identity, evidence, economics, and reason trail preserved in the Decision Receipt.',status:'Decision locked · reason trail inspectable',scene:'receipt'}
  ];

  let step=0,playing=false,timer=null;

  function stop(){
    playing=false;
    if(timer)window.clearInterval(timer);
    timer=null;
    if(toggle){toggle.textContent='Play';toggle.setAttribute('aria-label','Play Decision Forge sequence');}
  }

  function render(){
    root.dataset.step=String(step);
    const stage=stages[step];
    heading.textContent=stage.title;
    copy.textContent=stage.copy;
    status.textContent=stage.status;
    progress.style.width=((step+1)/stages.length*100)+'%';
    buttons.forEach((button,index)=>{
      button.classList.toggle('is-active',index===step);
      button.classList.toggle('is-complete',index<step);
      button.setAttribute('aria-pressed',index===step?'true':'false');
    });
    scenes.forEach(scene=>scene.classList.toggle('is-active',scene.dataset.forgeScene===stage.scene));
    if(step!==4){
      why?.classList.remove('is-open');
      whyButton?.setAttribute('aria-expanded','false');
      const symbol=whyButton?.querySelector('span');
      if(symbol)symbol.textContent='+';
    }
  }

  function advance(){
    if(step>=stages.length-1){stop();return;}
    step+=1;
    render();
  }

  function play(){
    if(reduced.matches){step=stages.length-1;render();return;}
    stop();
    playing=true;
    toggle.textContent='Pause';
    toggle.setAttribute('aria-label','Pause Decision Forge sequence');
    timer=window.setInterval(advance,2400);
  }

  buttons.forEach((button,index)=>button.addEventListener('click',()=>{stop();step=index;render();}));
  replay?.addEventListener('click',()=>{stop();step=0;render();if(!reduced.matches)window.setTimeout(play,450);});
  toggle?.addEventListener('click',()=>playing?stop():play());
  whyButton?.addEventListener('click',()=>{
    const open=!why.classList.contains('is-open');
    why.classList.toggle('is-open',open);
    whyButton.setAttribute('aria-expanded',open?'true':'false');
    const symbol=whyButton.querySelector('span');
    if(symbol)symbol.textContent=open?'−':'+';
  });

  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){
      observer.disconnect();
      if(!reduced.matches)window.setTimeout(play,650);
    }
  },{threshold:.32});
  observer.observe(root);

  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  reduced.addEventListener?.('change',event=>{if(event.matches){stop();step=stages.length-1;render();}});
  render();
})();
