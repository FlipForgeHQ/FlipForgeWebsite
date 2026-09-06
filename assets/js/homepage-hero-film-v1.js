(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  // Load the CSP-safe presentation used by the persistent step explainer.
  if(!document.querySelector('link[data-ff-hero-inspector]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/homepage-hero-inspector-v1.css?v=20260906-2';
    css.dataset.ffHeroInspector='true';
    document.head.appendChild(css);
  }

  // Replace the generic hero sentence with a concrete customer-first value chain.
  const lead=document.querySelector('.decision-lead');
  if(lead){
    lead.classList.add('ff-decision-lead-impact');
    lead.innerHTML=`
      <span><b>Check the exact card.</b><small>Identity first.</small></span>
      <span><b>Challenge the comps.</b><small>Bad evidence stays out.</small></span>
      <span><b>Know if the deal holds up.</b><small>Before your money is on the line.</small></span>
    `;
  }

  const finalBrandLabel=scenes.at(-1)?.querySelector('small');
  if(finalBrandLabel&&finalBrandLabel.textContent.trim()==='Card Intelligence'){
    finalBrandLabel.textContent='Card Decision Intelligence';
  }

  const sceneMeta=[
    {eyebrow:'1 · Apparent deal',title:'The price looks convincing.',copy:'A $349 listing appears 24% below the displayed market reference. FlipForge does not trust that headline yet.',visual:'$349 vs $459'},
    {eyebrow:'2 · Evidence check',title:'FlipForge challenges the comparisons.',copy:'The exact Silver Prizm PSA 10 can stay. Wrong parallels, duplicates, and identity conflicts are removed from the evidence set.',visual:'✓ exact · × bad comps'},
    {eyebrow:'3 · Problem found',title:'Most of the comparison set was weak.',copy:'Five of seven comparisons do not qualify for this exact card. That means the original market reference was built on unreliable evidence.',visual:'5 / 7 rejected'},
    {eyebrow:'4 · Recalculated',title:'The apparent bargain nearly disappears.',copy:'With only qualified evidence left, the advertised 24.0% discount falls to about 2.3%.',visual:'24.0% → 2.3%'},
    {eyebrow:'5 · Decision',title:'The evidence does not support BUY.',copy:'FlipForge returns VERIFY because the remaining margin is small and the identity evidence still needs confirmation before spending.',visual:'VERIFY'},
    {eyebrow:'6 · Why it matters',title:'You see the reason, not just a number.',copy:'FlipForge shows what changed, why the deal changed, and what still needs to be checked before you act.',visual:'KNOW WHY.'}
  ];

  film.setAttribute('role','group');
  film.setAttribute('aria-label','FlipForge Deal Check animation with a live explanation of each step.');

  const explainer=document.createElement('aside');
  explainer.className='ff-film-explainer';
  explainer.setAttribute('aria-live','polite');
  explainer.innerHTML=`
    <span class="ff-film-explainer-step" data-ff-explain-step>01<span>/06</span></span>
    <div class="ff-film-explainer-copy">
      <small data-ff-explain-eyebrow></small>
      <strong data-ff-explain-title></strong>
      <p data-ff-explain-copy></p>
    </div>
    <span class="ff-film-explainer-visual" data-ff-explain-visual></span>
  `;
  film.append(explainer);

  const explainStep=explainer.querySelector('[data-ff-explain-step]');
  const explainEyebrow=explainer.querySelector('[data-ff-explain-eyebrow]');
  const explainTitle=explainer.querySelector('[data-ff-explain-title]');
  const explainCopy=explainer.querySelector('[data-ff-explain-copy]');
  const explainVisual=explainer.querySelector('[data-ff-explain-visual]');

  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timings=[0,3000,7000,11000,15000,20000];
  const loopMs=25000;
  let timers=[];
  let running=false;

  const label=film.querySelector('.ff-film-label');
  if(label)label.textContent='Autoplay · each step explained below';

  const updateExplainer=index=>{
    const meta=sceneMeta[index]||sceneMeta[0];
    if(explainStep)explainStep.firstChild.nodeValue=String(index+1).padStart(2,'0');
    if(explainEyebrow)explainEyebrow.textContent=meta.eyebrow;
    if(explainTitle)explainTitle.textContent=meta.title;
    if(explainCopy)explainCopy.textContent=meta.copy;
    if(explainVisual)explainVisual.textContent=meta.visual;
    explainer.dataset.ffExplainScene=String(index+1);
  };

  const clear=()=>{
    timers.forEach(clearTimeout);
    timers=[];
  };

  const show=index=>{
    film.dataset.ffScene=String(index+1);
    scenes.forEach((scene,i)=>{
      const active=i===index;
      scene.classList.toggle('is-active',active);
      scene.setAttribute('aria-hidden',active?'false':'true');
    });
    updateExplainer(index);
  };

  const restartTimeline=()=>{
    film.classList.remove('is-playing');
    void film.offsetWidth;
    film.classList.add('is-playing');
  };

  const stop=()=>{
    running=false;
    clear();
    film.classList.remove('is-playing');
  };

  const play=()=>{
    if(reduce){
      stop();
      show(scenes.length-1);
      return;
    }
    clear();
    running=true;
    restartTimeline();
    show(0);
    timings.slice(1).forEach((delay,i)=>{
      timers.push(setTimeout(()=>{
        if(running)show(i+1);
      },delay));
    });
    timers.push(setTimeout(()=>{
      if(running)play();
    },loopMs));
  };

  const observer=('IntersectionObserver' in window)
    ? new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(entry.isIntersecting&&entry.intersectionRatio>=0.25){
            if(!running&&!document.hidden)play();
          }else if(running){
            stop();
          }
        });
      },{threshold:[0,.25,.5]})
    : null;

  updateExplainer(0);
  if(observer){
    observer.observe(film);
  }else{
    play();
  }

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      stop();
    }else if(!observer){
      play();
    }else{
      const rect=film.getBoundingClientRect();
      const visible=rect.bottom>0&&rect.top<window.innerHeight;
      if(visible)play();
    }
  });
})();
