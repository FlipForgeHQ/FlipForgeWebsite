(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  if(!document.querySelector('link[data-ff-hero-explainer]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/homepage-hero-explainer-v1.css';
    css.dataset.ffHeroExplainer='true';
    document.head.appendChild(css);
  }

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  const explanations=[
    {
      title:'First, FlipForge questions the advertised bargain.',
      copy:'The $349 listing appears 24% below the displayed market reference. FlipForge treats that as a claim to verify, not proof that the card is a buy.'
    },
    {
      title:'Then it checks whether the comparisons actually belong.',
      copy:'Each comparison is tested against the exact card identity: year, set, card number, parallel, grader, grade, and duplicate status.'
    },
    {
      title:'Bad evidence is removed before it can influence value.',
      copy:'Five of seven comparisons fail the exact-card test because of wrong parallels, duplicates, or an identity conflict. Only valid evidence stays in the supported set.'
    },
    {
      title:'The price story changes when only qualified evidence remains.',
      copy:'Once the invalid comparisons are removed, the apparent 24% discount falls to about 2.3%. The “bargain” was mostly created by the wrong evidence.'
    },
    {
      title:'FlipForge turns the corrected evidence into a next action.',
      copy:'With only a small supported price gap and unresolved identity risk, the evidence does not support BUY. FlipForge returns VERIFY instead.'
    },
    {
      title:'That is Card Decision Intelligence.',
      copy:'FlipForge is not just showing a price. It shows which evidence deserves trust, what changes when weak evidence is removed, and why the next action follows.'
    }
  ];

  const finalBrandLabel=scenes.at(-1)?.querySelector('small');
  if(finalBrandLabel&&finalBrandLabel.textContent.trim()==='Card Intelligence'){
    finalBrandLabel.textContent='Card Decision Intelligence';
  }

  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loopMs=25000;
  const durations=[3000,4000,4000,4000,5000,5000];
  let timer=null;
  let running=false;
  let currentIndex=0;
  let inspecting=false;

  film.dataset.ffLoopMs=String(loopMs);

  const label=film.querySelector('.ff-film-label');
  const stepEl=film.querySelector('[data-ff-film-step]');
  const titleEl=film.querySelector('[data-ff-film-explainer-title]');
  const copyEl=film.querySelector('[data-ff-film-explainer-copy]');
  const hintEl=film.querySelector('.ff-film-explainer-hint');
  if(label)label.textContent='Watch how the decision changes';

  const clear=()=>{
    if(timer!==null)clearTimeout(timer);
    timer=null;
  };

  const renderExplanation=index=>{
    const item=explanations[index];
    if(!item)return;
    if(stepEl)stepEl.textContent=String(index+1);
    if(titleEl)titleEl.textContent=item.title;
    if(copyEl)copyEl.textContent=item.copy;
  };

  const show=index=>{
    currentIndex=index;
    film.dataset.ffScene=String(index+1);
    scenes.forEach((scene,i)=>{
      const active=i===index;
      scene.classList.toggle('is-active',active);
      scene.setAttribute('aria-hidden',active?'false':'true');
    });
    renderExplanation(index);
  };

  const restartTimeline=()=>{
    film.classList.remove('is-playing');
    void film.offsetWidth;
    film.classList.add('is-playing');
  };

  const scheduleNext=()=>{
    clear();
    if(!running||inspecting||reduce)return;
    timer=setTimeout(()=>{
      const next=(currentIndex+1)%scenes.length;
      if(next===0)restartTimeline();
      show(next);
      scheduleNext();
    },durations[currentIndex]||4000);
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
    running=true;
    inspecting=false;
    film.classList.remove('is-inspecting');
    restartTimeline();
    show(0);
    scheduleNext();
  };

  const inspect=()=>{
    if(reduce)return;
    inspecting=true;
    clear();
    film.classList.add('is-inspecting');
    if(hintEl)hintEl.textContent='Paused on this step · move away or tap again to continue';
  };

  const resume=()=>{
    if(reduce||!running)return;
    inspecting=false;
    film.classList.remove('is-inspecting');
    if(hintEl)hintEl.textContent='Hover or tap the animation to pause and inspect this step.';
    scheduleNext();
  };

  const toggleInspect=()=>inspecting?resume():inspect();

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

  if(observer){
    observer.observe(film);
  }else{
    play();
  }

  const hoverCapable=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(hoverCapable){
    film.addEventListener('mouseenter',inspect);
    film.addEventListener('mouseleave',resume);
  }else{
    film.addEventListener('click',event=>{
      if(event.target.closest('a,button'))return;
      toggleInspect();
    });
  }

  film.addEventListener('focus',inspect);
  film.addEventListener('blur',resume);
  film.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    toggleInspect();
  });

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
