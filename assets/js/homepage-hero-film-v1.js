(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  // Replace the generic hero sentence with a concrete, customer-first value chain.
  // The static source remains a readable no-JS fallback.
  const lead=document.querySelector('.decision-lead');
  if(lead){
    lead.classList.add('ff-decision-lead-impact');
    lead.innerHTML=`
      <span><b>Check the exact card.</b><small>Identity first.</small></span>
      <span><b>Challenge the comps.</b><small>Bad evidence stays out.</small></span>
      <span><b>Know if the deal holds up.</b><small>Before your money is on the line.</small></span>
    `;
  }

  const style=document.createElement('style');
  style.textContent=`
    .ff-decision-lead-impact{
      max-width:650px!important;
      margin-top:26px!important;
      display:grid!important;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:9px;
      color:inherit!important;
      line-height:1.2!important;
    }
    .ff-decision-lead-impact>span{
      min-width:0;
      padding:13px 13px 12px;
      border:1px solid rgba(230,170,53,.2);
      border-radius:10px;
      background:linear-gradient(145deg,rgba(230,170,53,.07),rgba(255,255,255,.018));
    }
    .ff-decision-lead-impact b{
      display:block;
      color:#f7f8fa;
      font-size:.92rem;
      font-weight:830;
      letter-spacing:-.015em;
    }
    .ff-decision-lead-impact small{
      display:block;
      margin-top:5px;
      color:#98a2ae;
      font-size:.69rem;
      font-weight:650;
      line-height:1.35;
    }
    .ff-film-inspect-cue{
      position:absolute;
      z-index:18;
      right:14px;
      bottom:13px;
      padding:7px 9px;
      border:1px solid rgba(212,175,55,.3);
      border-radius:999px;
      background:rgba(0,0,0,.76);
      color:#d7dce3;
      font-size:.62rem;
      font-weight:800;
      letter-spacing:.055em;
      text-transform:uppercase;
      pointer-events:none;
      backdrop-filter:blur(8px);
      transition:opacity .18s ease,transform .18s ease;
    }
    .ff-hero-film.is-inspecting .ff-film-inspect-cue{opacity:0;transform:translateY(6px)}
    .ff-film-explainer{
      position:absolute;
      z-index:17;
      left:18px;
      right:18px;
      bottom:18px;
      display:grid;
      grid-template-columns:58px minmax(0,1fr) auto;
      align-items:center;
      gap:13px;
      padding:13px 14px;
      border:1px solid rgba(212,175,55,.45);
      border-radius:12px;
      background:rgba(3,6,10,.94);
      box-shadow:0 18px 45px rgba(0,0,0,.46);
      backdrop-filter:blur(14px);
      opacity:0;
      transform:translateY(14px);
      pointer-events:none;
      transition:opacity .2s ease,transform .2s ease;
    }
    .ff-hero-film.is-inspecting .ff-film-explainer{opacity:1;transform:translateY(0)}
    .ff-film-explainer-step{
      width:58px;
      height:58px;
      display:grid;
      place-items:center;
      border:1px solid rgba(212,175,55,.52);
      border-radius:11px;
      background:rgba(212,175,55,.08);
      color:#e6aa35;
      font-size:1.15rem;
      font-weight:900;
    }
    .ff-film-explainer-copy{min-width:0}
    .ff-film-explainer-copy small{
      display:block;
      margin-bottom:3px;
      color:#e6aa35;
      font-size:.62rem;
      font-weight:850;
      letter-spacing:.11em;
      text-transform:uppercase;
    }
    .ff-film-explainer-copy strong{
      display:block;
      color:#fff;
      font-size:.9rem;
      line-height:1.2;
    }
    .ff-film-explainer-copy p{
      margin:4px 0 0;
      color:#aeb6c1;
      font-size:.7rem;
      line-height:1.35;
    }
    .ff-film-explainer-visual{
      min-width:96px;
      padding:9px 10px;
      border-radius:9px;
      background:#0a1018;
      color:#f0d184;
      font-size:.76rem;
      font-weight:900;
      line-height:1.15;
      text-align:center;
      white-space:nowrap;
    }
    .ff-hero-film:focus-visible{outline:3px solid rgba(230,170,53,.62);outline-offset:4px}
    @media(max-width:1120px){
      .ff-decision-lead-impact{max-width:720px!important;margin-left:auto!important;margin-right:auto!important}
    }
    @media(max-width:760px){
      .ff-decision-lead-impact{grid-template-columns:1fr!important;gap:7px!important;text-align:left!important}
      .ff-decision-lead-impact>span{padding:10px 12px!important}
      .ff-decision-lead-impact b{font-size:.9rem!important}
      .ff-decision-lead-impact small{font-size:.68rem!important}
      .ff-film-inspect-cue{right:10px;bottom:10px;font-size:.57rem}
      .ff-film-explainer{left:10px;right:10px;bottom:10px;grid-template-columns:42px minmax(0,1fr);gap:9px;padding:10px}
      .ff-film-explainer-step{width:42px;height:42px;border-radius:9px;font-size:.9rem}
      .ff-film-explainer-copy strong{font-size:.78rem}
      .ff-film-explainer-copy p{font-size:.64rem}
      .ff-film-explainer-visual{grid-column:1/-1;min-width:0;padding:7px 9px;font-size:.69rem;text-align:left}
    }
    @media(hover:none){.ff-film-inspect-cue{display:block}}
    @media(prefers-reduced-motion:reduce){.ff-film-explainer,.ff-film-inspect-cue{transition:none!important}}
  `;
  document.head.append(style);

  // Keep the final animation brand label aligned with the locked FlipForge descriptor
  // even when the static homepage source predates the current brand lock.
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

  const setInspecting=active=>film.classList.toggle('is-inspecting',Boolean(active));
  film.addEventListener('mouseenter',()=>setInspecting(true));
  film.addEventListener('mouseleave',()=>{if(!touchInspection)setInspecting(false)});
  film.addEventListener('focusin',()=>setInspecting(true));
  film.addEventListener('focusout',()=>{if(!touchInspection)setInspecting(false)});
  film.addEventListener('click',event=>{
    if(!('ontouchstart' in window))return;
    if(event.target.closest('a,button'))return;
    touchInspection=!touchInspection;
    setInspecting(touchInspection);
    updateExplainer(currentIndex);
  });

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
