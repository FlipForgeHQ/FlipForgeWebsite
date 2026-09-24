(()=>{
  'use strict';

  const root=document.querySelector('[data-decision-forge]');
  if(!root)return;

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=window.matchMedia('(pointer: coarse)');
  const buttons=[...root.querySelectorAll('[data-forge-step]')];
  const replay=root.querySelector('[data-forge-replay]');
  const toggle=root.querySelector('[data-forge-toggle]');
  const progress=root.querySelector('[data-forge-progress]');
  const heading=root.querySelector('[data-forge-heading]');
  const copy=root.querySelector('[data-forge-copy]');
  const status=root.querySelector('[data-forge-status]');
  const card=root.querySelector('[data-forge-card]');
  const whyButton=root.querySelector('[data-forge-why-button]');
  const why=root.querySelector('[data-forge-why]');
  const stages=[
    {title:'Start with the card—not the price.',copy:'A listing enters the forge as a question. FlipForge does not let the asking price define the answer.',status:'Card received · price quarantined'},
    {title:'Lock the exact identity.',copy:'Year, product, card number, parallel, grader, and grade must resolve before market evidence can influence value.',status:'Identity locked · exact card verified'},
    {title:'Make every comp earn its place.',copy:'Candidate evidence is tested. Wrong parallel, wrong grade, duplicate, and identity-conflict rows are pushed out.',status:'7 candidates · 2 qualified'},
    {title:'Rebuild the economics from what survived.',copy:'The displayed reference is separated from supported value. Only qualified completed-sale evidence informs the supported number.',status:'Evidence qualified · economics rebuilt'},
    {title:'Make the call—and keep the reason.',copy:'The verdict arrives with its evidence trail attached, so the user can inspect why FlipForge stopped, watched, verified, or bought.',status:'Decision receipt assembled'}
  ];
  let step=0;
  let playing=false;
  let timer=null;

  const announce=()=>{
    root.dataset.step=String(step);
    buttons.forEach((button,index)=>{
      button.classList.toggle('is-active',index===step);
      button.classList.toggle('is-complete',index<step);
      button.setAttribute('aria-pressed',index===step?'true':'false');
    });
    progress.style.width=((step+1)/stages.length*100)+'%';
    heading.textContent=stages[step].title;
    copy.textContent=stages[step].copy;
    status.textContent=stages[step].status;
    card.dataset.scan=step===1?'on':'off';
    if(step!==4){
      why.classList.remove('is-open');
      whyButton?.setAttribute('aria-expanded','false');
    }
  };

  const stop=()=>{
    playing=false;
    if(timer)window.clearInterval(timer);
    timer=null;
    if(toggle){
      toggle.textContent='Play';
      toggle.setAttribute('aria-label','Play Decision Forge sequence');
    }
  };

  const next=()=>{
    if(step>=stages.length-1){stop();return;}
    step+=1;
    announce();
  };

  const play=()=>{
    if(reduced.matches){step=stages.length-1;announce();return;}
    stop();
    playing=true;
    toggle.textContent='Pause';
    toggle.setAttribute('aria-label','Pause Decision Forge sequence');
    timer=window.setInterval(next,2200);
  };

  buttons.forEach((button,index)=>button.addEventListener('click',()=>{
    stop();
    step=index;
    announce();
  }));

  replay?.addEventListener('click',()=>{
    stop();
    step=0;
    announce();
    if(!reduced.matches)window.setTimeout(play,350);
  });

  toggle?.addEventListener('click',()=>playing?stop():play());

  whyButton?.addEventListener('click',()=>{
    const open=!why.classList.contains('is-open');
    why.classList.toggle('is-open',open);
    whyButton.setAttribute('aria-expanded',open?'true':'false');
    whyButton.querySelector('span').textContent=open?'−':'+';
  });

  if(card){
    card.addEventListener('pointermove',event=>{
      if(reduced.matches||coarse.matches)return;
      const box=card.getBoundingClientRect();
      const x=(event.clientX-box.left)/box.width-.5;
      const y=(event.clientY-box.top)/box.height-.5;
      card.style.setProperty('--tilt-x',(x*9).toFixed(2)+'deg');
      card.style.setProperty('--tilt-y',(-y*7).toFixed(2)+'deg');
    });
    card.addEventListener('pointerleave',()=>{
      card.style.setProperty('--tilt-x','0deg');
      card.style.setProperty('--tilt-y','0deg');
    });
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        observer.disconnect();
        if(!reduced.matches)window.setTimeout(play,650);
      }
    });
  },{threshold:.34});
  observer.observe(root);

  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  reduced.addEventListener?.('change',event=>{if(event.matches){stop();step=stages.length-1;announce();}});
  announce();
})();
