(() => {
  const scenes=[...document.querySelectorAll('[data-scene]')];
  const nav=[...document.querySelectorAll('[data-scene-jump]')];
  const film=document.querySelector('[data-film]');
  const progress=document.querySelector('[data-film-progress]');
  const counter=document.querySelector('[data-scene-counter]');
  const mobile=matchMedia('(max-width:760px)');
  const reduce=matchMedia('(prefers-reduced-motion:reduce)');
  let current=0;
  let autoplayTimer=null;
  let raf=null;

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function activate(index){
    index=clamp(index,0,scenes.length-1);
    current=index;
    scenes.forEach((scene,i)=>scene.classList.toggle('active',i===index));
    nav.forEach((button,i)=>{
      button.classList.toggle('active',i===index);
      button.setAttribute('aria-current',i===index?'step':'false');
    });
    if(counter) counter.textContent=String(index+1).padStart(2,'0')+' / 04';
    if(progress) progress.style.width=((index+1)/scenes.length*100)+'%';
  }

  function filmRange(){
    const rect=film.getBoundingClientRect();
    const top=scrollY+rect.top;
    return {top,range:Math.max(1,film.offsetHeight-innerHeight)};
  }

  function sync(){
    raf=null;
    if(mobile.matches) return;
    const {top,range}=filmRange();
    const p=clamp((scrollY-top)/range,0,1);
    const index=Math.round(p*(scenes.length-1));
    if(index!==current) activate(index);
    if(progress) progress.style.width=(p*100)+'%';
  }

  function requestSync(){
    if(!raf) raf=requestAnimationFrame(sync);
  }

  function jump(index){
    stopAuto();
    if(mobile.matches){
      scenes[index]?.scrollIntoView({behavior:reduce.matches?'auto':'smooth',block:'start'});
      return;
    }
    const {top,range}=filmRange();
    scrollTo({top:top+(index/(scenes.length-1))*range,behavior:reduce.matches?'auto':'smooth'});
  }

  function stopAuto(){
    if(autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer=null;
  }

  function startAuto(){
    stopAuto();
    jump(0);
    let index=0;
    autoplayTimer=setInterval(()=>{
      index++;
      if(index>=scenes.length){stopAuto();return;}
      jump(index);
    },2200);
  }

  nav.forEach((button,i)=>button.addEventListener('click',()=>jump(i)));
  window.addEventListener('scroll',requestSync,{passive:true});
  window.addEventListener('resize',requestSync);
  document.querySelectorAll('[data-replay]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelector('#film')?.scrollIntoView({behavior:reduce.matches?'auto':'smooth'});
    setTimeout(startAuto,reduce.matches?0:450);
  }));

  document.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA','BUTTON','A'].includes(event.target?.tagName)) return;
    if(event.key==='ArrowRight') jump(current+1);
    if(event.key==='ArrowLeft') jump(current-1);
  });

  const evidenceToggle=document.querySelector('[data-evidence-toggle]');
  const evidenceOverlay=document.querySelector('[data-evidence-overlay]');
  evidenceToggle?.addEventListener('click',()=>{
    const open=evidenceToggle.getAttribute('aria-expanded')==='true';
    evidenceToggle.setAttribute('aria-expanded',String(!open));
    evidenceToggle.querySelector('span').textContent=open?'+':'−';
    evidenceOverlay?.classList.toggle('open',!open);
  });

  const receiptToggle=document.querySelector('[data-receipt-toggle]');
  const reasonTrail=document.querySelector('[data-reason-trail]');
  receiptToggle?.addEventListener('click',()=>{
    const open=receiptToggle.getAttribute('aria-expanded')==='true';
    receiptToggle.setAttribute('aria-expanded',String(!open));
    receiptToggle.querySelector('span').textContent=open?'+':'−';
    reasonTrail?.classList.toggle('open',!open);
  });

  const cases={
    exact:{comp:['COMP 01','2018 TOPPS CHROME #150','REFRACTOR · PSA 10','$352'],result:['ALLOWED','Exact completed-sale evidence may support the decision.'],rule:'Year, product, card number, parallel, grader, and grade align.',blocked:false},
    parallel:{comp:['COMP 02','2018 TOPPS CHROME #150','PRISM REFRACTOR · PSA 10','$468'],result:['BLOCKED','Wrong parallel. This sale cannot influence supported value for the target card.'],rule:'The card number matches, but the parallel does not. Similar is not exact.',blocked:true},
    grade:{comp:['COMP 03','2018 TOPPS CHROME #150','REFRACTOR · PSA 9','$287'],result:['BLOCKED','Wrong grade. This sale cannot act as exact target-grade evidence.'],rule:'The card matches, but PSA 9 is not PSA 10. Grade context remains separate.',blocked:true},
    duplicate:{comp:['COMP 04','2018 TOPPS CHROME #150','REFRACTOR · PSA 10','$455'],result:['BLOCKED','Duplicate sale. One transaction cannot increase evidence depth twice.'],rule:'The identity matches, but the transaction duplicates an already-counted sale.',blocked:true}
  };
  const caseButtons=[...document.querySelectorAll('[data-proof-case]')];
  const stage=document.querySelector('[data-proof-stage]');
  const candidate=document.querySelector('[data-proof-candidate]');
  const result=document.querySelector('[data-proof-result]');
  const rule=document.querySelector('[data-proof-rule]');
  function renderCase(key){
    const item=cases[key];
    caseButtons.forEach(button=>button.classList.toggle('active',button.dataset.proofCase===key));
    stage?.classList.toggle('blocked',item.blocked);
    if(candidate) candidate.innerHTML='<small>'+item.comp[0]+'</small><b>'+item.comp[1]+'</b><span>'+item.comp[2]+'</span><strong>'+item.comp[3]+'</strong>';
    if(result) result.innerHTML='<small>DISPOSITION</small><strong>'+item.result[0]+'</strong><p>'+item.result[1]+'</p>';
    if(rule) rule.textContent=item.rule;
  }
  caseButtons.forEach(button=>button.addEventListener('click',()=>renderCase(button.dataset.proofCase)));

  if(window.matchMedia('(pointer:fine)').matches && !reduce.matches){
    document.querySelectorAll('[data-pan-art]').forEach(art=>{
      art.addEventListener('pointermove',event=>{
        const r=art.getBoundingClientRect();
        const x=(event.clientX-r.left)/r.width-.5;
        const y=(event.clientY-r.top)/r.height-.5;
        art.style.transform='perspective(1300px) rotateY('+(x*2.2)+'deg) rotateX('+(-y*1.6)+'deg) translateZ(2px)';
      });
      art.addEventListener('pointerleave',()=>{art.style.transform='';});
    });
  }

  activate(0);
  requestSync();
})();