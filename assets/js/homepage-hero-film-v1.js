(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  // The homepage CSP allows same-origin stylesheets but intentionally blocks inline
  // style injection. Load the inspector presentation from a real asset so hover/tap
  // behavior is visible in production instead of being silently stripped by CSP.
  if(!document.querySelector('link[data-ff-hero-inspector]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/homepage-hero-inspector-v1.css?v=20260906-1';
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
    {eyebrow:'2 · Evidence check',title:'Now the comparisons get challenged.',copy:'Exact-card evidence can stay. Wrong parallels, duplicates, and identity conflicts are rejected.',visual:'✓ exact · × bad comps'},
    {eyebrow:'3 · Problem found',title:'Most of the comparison set was weak.',copy:'Five of seven comparisons do not qualify for the exact card, which changes the strength of the price claim.',visual:'5 / 7 rejected'},
    {eyebrow:'4 · Recalculated',title:'The bargain nearly disappears.',copy:'After qualifying the evidence, the apparent 24% discount shrinks to about 2.3%.',visual:'24.0% → 2.3%'},
    {eyebrow:'5 · Decision',title:'Price alone does not earn BUY.',copy:'FlipForge returns VERIFY because the remaining margin is too small while identity evidence still needs confirmation.',visual:'VERIFY'},
    {eyebrow:'6 · Why it matters',title:'A number is not enough.',copy:'The customer sees what changed, why it changed, and what needs to be verified before acting.',visual:'REASON > HYPE'}
  ];

  film.tabIndex=0;
  film.setAttribute('role','group');
  film.setAttribute('aria-label','Interactive FlipForge Deal Check animation. Hover, focus, or tap to inspect what each scene means.');

  const cue=document.createElement('span');
  cue.className='ff-film-inspect-cue';
  cue.textContent=('ontouchstart' in window)?'Tap to inspect':'Hover to inspect';

  const explainer=document.createElement('aside');
  explainer.className='ff-film-explainer';
  explainer.setAttribute('aria-live','polite');
  explainer.innerHTML=`
    <span class="ff-film-explainer-step" data-ff-explain-step>01</span>
    <div class="ff-film-explainer-copy">
      <small data-ff-explain-eyebrow></small>
      <strong data-ff-explain-title></strong>
      <p data-ff-explain-copy></p>
    </div>
    <span class="ff-film-explainer-visual" data-ff-explain-visual></span>
  `;
  film.append(cue,explainer);

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
  let currentIndex=0;
  let inspecting=false;
  let touchInspection=false;

  const label=film.querySelector('.ff-film-label');
  if(label)label.textContent='Autoplay · hover to inspect';

  const updateExplainer=index=>{
    const meta=sceneMeta[index]||sceneMeta[0];
    if(explainStep)explainStep.textContent=String(index+1).padStart(2,'0');
    if(explainEyebrow)explainEyebrow.textContent=meta.eyebrow;
    if(explainTitle)explainTitle.textContent=meta.title;
    if(explainCopy)explainCopy.textContent=meta.copy;
    if(explainVisual)explainVisual.textContent=meta.visual;
  };

  const clear=()=>{
    timers.forEach(clearTimeout);
    timers=[];
  };

  const show=index=>{
    currentIndex=index;
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
    if(inspecting)return;
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
        if(running&&!inspecting)show(i+1);
      },delay));
    });
    timers.push(setTimeout(()=>{
      if(running&&!inspecting)play();
    },loopMs));
  };

  const beginInspect=()=>{
    if(inspecting)return;
    inspecting=true;
    film.classList.add('is-inspecting');
    stop();
    updateExplainer(currentIndex);
    if(label)label.textContent='Paused · explaining this step';
  };

  const endInspect=()=>{
    if(!inspecting)return;
    inspecting=false;
    film.classList.remove('is-inspecting');
    if(label)label.textContent='Autoplay · hover to inspect';
    if(!document.hidden)play();
  };

  film.addEventListener('mouseenter',()=>{
    if(!touchInspection)beginInspect();
  });
  film.addEventListener('mouseleave',()=>{
    if(!touchInspection)endInspect();
  });
  film.addEventListener('focusin',()=>{
    if(!touchInspection)beginInspect();
  });
  film.addEventListener('focusout',()=>{
    if(!touchInspection)endInspect();
  });
  film.addEventListener('click',event=>{
    if(!('ontouchstart' in window))return;
    if(event.target.closest('a,button'))return;
    touchInspection=!touchInspection;
    if(touchInspection)beginInspect();
    else endInspect();
  });

  const observer=('IntersectionObserver' in window)
    ? new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(entry.isIntersecting&&entry.intersectionRatio>=0.25){
            if(!running&&!document.hidden&&!inspecting)play();
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
    }else if(!inspecting){
      if(!observer){
        play();
      }else{
        const rect=film.getBoundingClientRect();
        const visible=rect.bottom>0&&rect.top<window.innerHeight;
        if(visible)play();
      }
    }
  });
})();
