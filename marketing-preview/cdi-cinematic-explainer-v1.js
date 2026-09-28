(() => {
  const stageData = [
    {
      eyebrow:'01 — THE CARD ENTERS',
      title:'A price is not a decision.',
      body:'FlipForge begins with the exact card and the asking price—but does not allow the price to lead the analysis.'
    },
    {
      eyebrow:'02 — EXACT IDENTITY',
      title:'First, prove what the card is.',
      body:'Player, year, product, card number, parallel, grader, and grade lock before market evidence is allowed to matter.'
    },
    {
      eyebrow:'03 — EVIDENCE ARRIVES',
      title:'Candidate comps are not automatically trusted.',
      body:'FlipForge gathers plausible evidence, then treats every record as a candidate that still has to earn its place.'
    },
    {
      eyebrow:'04 — QUALIFIED EVIDENCE',
      title:'Bad comps get stopped before price gets a vote.',
      body:'Wrong parallels, wrong grades, duplicates, and identity conflicts are visibly rejected. Only two exact comparisons remain.'
    },
    {
      eyebrow:'05 — INTELLIGENCE ASSEMBLES',
      title:'Price becomes evidence-backed context.',
      body:'Supported value, evidence depth, liquidity, confidence, and risk assemble together. Uncertainty stays visible instead of being hidden.'
    },
    {
      eyebrow:'06 — THE DECISION',
      title:'The apparent bargain changes when the evidence changes.',
      body:'The marketplace gap looked large. After qualification, the supported gap is narrow and liquidity is thin. FlipForge says VERIFY.'
    },
    {
      eyebrow:'07 — DECISION RECEIPT',
      title:'The reason stays attached to the call.',
      body:'The decision can be inspected later: exact identity, accepted evidence, rejected evidence, supported value, uncertainty, and next move remain connected.'
    }
  ];

  const story = document.querySelector('[data-story]');
  const workspace = document.querySelector('[data-workspace]');
  const railButtons = [...document.querySelectorAll('[data-stage-jump]')];
  const railProgress = document.querySelector('[data-rail-progress]');
  const counter = document.querySelector('[data-stage-counter]');
  const copyBlock = document.querySelector('.story-copy-block');
  const eyebrow = document.querySelector('[data-stage-eyebrow]');
  const title = document.querySelector('[data-stage-title]');
  const body = document.querySelector('[data-stage-body]');
  const prev = document.querySelector('[data-prev-stage]');
  const next = document.querySelector('[data-next-stage]');
  const autoplay = document.querySelector('[data-autoplay]');
  const mobile = window.matchMedia('(max-width: 850px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stage = 0;
  let autoTimer = null;
  let frame = null;

  function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }

  function renderStage(nextStage, animateCopy=true){
    stage = clamp(Number(nextStage)||0,0,stageData.length-1);
    workspace.dataset.stage = String(stage);
    counter.textContent = String(stage+1).padStart(2,'0') + ' / 07';
    railButtons.forEach((button,index)=>{
      button.classList.toggle('active',index===stage);
      button.setAttribute('aria-current',index===stage?'step':'false');
    });
    railProgress.style.height = ((stage)/(stageData.length-1)*100) + '%';
    const data = stageData[stage];
    if(animateCopy && !reduceMotion.matches && document.body.dataset.motion !== 'off'){
      copyBlock.classList.remove('swap');
      void copyBlock.offsetWidth;
      copyBlock.classList.add('swap');
    }
    eyebrow.textContent = data.eyebrow;
    title.textContent = data.title;
    body.textContent = data.body;
    prev.disabled = stage===0;
    next.disabled = stage===stageData.length-1;
  }

  function storyScrollRange(){
    const rect = story.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    return {top, range: Math.max(1, story.offsetHeight - window.innerHeight)};
  }

  function scrollToStage(index){
    index = clamp(index,0,stageData.length-1);
    if(mobile.matches){
      renderStage(index);
      workspace.scrollIntoView({behavior: reduceMotion.matches?'auto':'smooth', block:'start'});
      return;
    }
    const {top,range}=storyScrollRange();
    const y = top + (index/(stageData.length-1))*range;
    window.scrollTo({top:y,behavior:reduceMotion.matches?'auto':'smooth'});
  }

  function syncFromScroll(){
    frame = null;
    if(mobile.matches) return;
    const {top,range}=storyScrollRange();
    const progress=clamp((window.scrollY-top)/range,0,1);
    const index=Math.round(progress*(stageData.length-1));
    if(index!==stage) renderStage(index);
    railProgress.style.height=(progress*100)+'%';
  }

  function requestSync(){
    if(frame) return;
    frame=requestAnimationFrame(syncFromScroll);
  }

  function stopAuto(){
    if(autoTimer) clearInterval(autoTimer);
    autoTimer=null;
    autoplay.setAttribute('aria-pressed','false');
    autoplay.textContent='▶ Auto play';
  }

  function startAuto(){
    stopAuto();
    autoplay.setAttribute('aria-pressed','true');
    autoplay.textContent='Ⅱ Stop';
    let current=stage;
    autoTimer=setInterval(()=>{
      current++;
      if(current>=stageData.length){ stopAuto(); return; }
      scrollToStage(current);
      if(mobile.matches) renderStage(current);
    },1700);
  }

  railButtons.forEach(button=>button.addEventListener('click',()=>{
    stopAuto();
    scrollToStage(Number(button.dataset.stageJump));
  }));
  prev.addEventListener('click',()=>{stopAuto();scrollToStage(stage-1);if(mobile.matches)renderStage(stage-1);});
  next.addEventListener('click',()=>{stopAuto();scrollToStage(stage+1);if(mobile.matches)renderStage(stage+1);});
  autoplay.addEventListener('click',()=>autoTimer?stopAuto():startAuto());
  window.addEventListener('scroll',requestSync,{passive:true});
  window.addEventListener('resize',requestSync);
  mobile.addEventListener?.('change',()=>{stopAuto();renderStage(stage,false);requestSync();});

  document.querySelectorAll('[data-run-demo]').forEach(button=>button.addEventListener('click',()=>{
    stopAuto();
    scrollToStage(0);
    renderStage(0,false);
    setTimeout(startAuto, reduceMotion.matches?0:500);
  }));

  const motionToggle=document.querySelector('[data-motion-toggle]');
  motionToggle?.addEventListener('click',()=>{
    const off=document.body.dataset.motion==='off';
    document.body.dataset.motion=off?'on':'off';
    motionToggle.textContent=off?'Motion: ON':'Motion: OFF';
    motionToggle.setAttribute('aria-pressed',String(!off));
    if(!off) stopAuto();
  });

  const receiptToggle=document.querySelector('[data-receipt-toggle]');
  const receiptWhy=document.querySelector('[data-receipt-why]');
  receiptToggle?.addEventListener('click',()=>{
    const open=receiptToggle.getAttribute('aria-expanded')==='true';
    receiptToggle.setAttribute('aria-expanded',String(!open));
    receiptToggle.querySelector('span').textContent=open?'+':'−';
    receiptWhy.classList.toggle('open',!open);
  });

  const labCases={
    exact:{
      record:['COMP 01','2018 Topps Chrome #150','Refractor · PSA 10','$352'],
      disposition:'ALLOWED',
      copy:'This completed sale may support the decision.',
      rule:'Year, product, card number, parallel, grader, and grade align.',
      blocked:false
    },
    parallel:{
      record:['COMP 02','2018 Topps Chrome #150','Prism Refractor · PSA 10','$468'],
      disposition:'BLOCKED',
      copy:'Wrong parallel. This sale cannot influence supported value for the target card.',
      rule:'The card number matches, but the parallel does not. Similar is not exact.',
      blocked:true
    },
    grade:{
      record:['COMP 03','2018 Topps Chrome #150','Refractor · PSA 9','$287'],
      disposition:'BLOCKED',
      copy:'Wrong grade. This sale cannot act as exact target-grade evidence.',
      rule:'The card matches, but PSA 9 is not PSA 10. Grade context stays separated.',
      blocked:true
    },
    duplicate:{
      record:['COMP 04','2018 Topps Chrome #150','Refractor · PSA 10','$455'],
      disposition:'BLOCKED',
      copy:'Duplicate sale. One transaction cannot increase evidence depth twice.',
      rule:'The identity matches, but the sale duplicates an already-counted transaction.',
      blocked:true
    }
  };
  const labButtons=[...document.querySelectorAll('[data-lab-case]')];
  const labStage=document.querySelector('.lab-stage');
  const labRecord=document.querySelector('[data-lab-record]');
  const labResult=document.querySelector('[data-lab-result]');
  const labRule=document.querySelector('[data-lab-rule]');

  function renderLab(key){
    const item=labCases[key];
    labButtons.forEach(button=>button.classList.toggle('active',button.dataset.labCase===key));
    labStage.classList.toggle('blocked',item.blocked);
    labRecord.innerHTML='<span>'+item.record[0]+'</span><b>'+item.record[1]+'</b><em>'+item.record[2]+'</em><strong>'+item.record[3]+'</strong>';
    labResult.innerHTML='<small>DISPOSITION</small><strong>'+item.disposition+'</strong><p>'+item.copy+'</p>';
    labRule.textContent=item.rule;
  }
  labButtons.forEach(button=>button.addEventListener('click',()=>renderLab(button.dataset.labCase)));

  const tilt=document.querySelector('[data-tilt-card]');
  if(tilt && window.matchMedia('(pointer:fine)').matches && !reduceMotion.matches){
    tilt.addEventListener('pointermove',(event)=>{
      if(document.body.dataset.motion==='off') return;
      const r=tilt.getBoundingClientRect();
      const x=(event.clientX-r.left)/r.width-.5;
      const y=(event.clientY-r.top)/r.height-.5;
      tilt.style.transform='perspective(700px) rotateY('+(x*8)+'deg) rotateX('+(-y*7)+'deg) translateZ(3px)';
    });
    tilt.addEventListener('pointerleave',()=>{tilt.style.transform='';});
  }

  const revealObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target);}
    });
  },{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));

  document.addEventListener('keydown',(event)=>{
    if(event.target && ['INPUT','TEXTAREA','BUTTON','A'].includes(event.target.tagName)) return;
    if(event.key==='ArrowRight'){stopAuto();scrollToStage(stage+1);if(mobile.matches)renderStage(stage+1);}
    if(event.key==='ArrowLeft'){stopAuto();scrollToStage(stage-1);if(mobile.matches)renderStage(stage-1);}
  });

  renderStage(0,false);
  requestSync();
})();
