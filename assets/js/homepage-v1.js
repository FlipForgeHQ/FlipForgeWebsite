(()=>{
  'use strict';

  const toggle=document.querySelector('.menu-toggle');
  const menu=document.querySelector('.mobile-nav');
  const backdrop=document.querySelector('.backdrop');
  let lastFocus=null;

  if(toggle&&menu&&backdrop){
    const focusable=()=>[...menu.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')];
    const closeMenu=()=>{
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Open navigation menu');
      menu.classList.remove('open');
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden','true');
      document.body.classList.remove('menu-open');
      if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus();
    };
    const openMenu=()=>{
      lastFocus=document.activeElement;
      toggle.setAttribute('aria-expanded','true');
      toggle.setAttribute('aria-label','Close navigation menu');
      menu.classList.add('open');
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden','false');
      document.body.classList.add('menu-open');
      focusable()[0]?.focus();
    };

    toggle.addEventListener('click',()=>toggle.getAttribute('aria-expanded')==='true'?closeMenu():openMenu());
    backdrop.addEventListener('click',closeMenu);
    menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeMenu();
      if(event.key!=='Tab'||!menu.classList.contains('open'))return;
      const items=focusable();
      if(!items.length)return;
      const first=items[0];
      const last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('resize',()=>{if(window.innerWidth>1000)closeMenu();},{passive:true});
  }

  const promoteTryFlipForge=()=>{
    const desktopTry=document.querySelector('.desktop-nav a[href="#try-flipforge"]');
    const desktopBeta=document.querySelector('.desktop-nav a[href="beta-application.html"]');
    const mobileTry=document.querySelector('.mobile-nav a[href="#try-flipforge"]');

    desktopBeta?.classList.remove('nav-cta');
    desktopTry?.classList.add('nav-cta');
    if(desktopTry)desktopTry.textContent='Try FlipForge';
    if(desktopBeta)desktopBeta.textContent='Beta Access';
    if(mobileTry){
      mobileTry.textContent='Try FlipForge — 60-second demo';
      mobileTry.style.cssText='border:1px solid rgba(212,175,55,.45);border-radius:12px;background:rgba(212,175,55,.10);color:#fff;font-weight:850;';
    }

    const heroActions=document.querySelector('.ff-primary-actions');
    if(heroActions&&!document.querySelector('.ff-hero-jump-link')){
      const jump=document.createElement('a');
      jump.className='ff-hero-jump-link';
      jump.href='#try-flipforge';
      jump.textContent='See FlipForge catch a bad decision ↓';
      jump.style.cssText='display:inline-flex;margin-top:15px;padding:10px 14px;border:1px solid rgba(212,175,55,.34);border-radius:999px;background:rgba(212,175,55,.08);color:#fff;font-size:12px;font-weight:850;text-decoration:none;';
      heroActions.insertAdjacentElement('afterend',jump);
    }

    if(!document.querySelector('.ff-demo-float')){
      const floating=document.createElement('a');
      floating.className='ff-demo-float';
      floating.href='#try-flipforge';
      floating.setAttribute('aria-label','Jump to the Try FlipForge demo');
      floating.innerHTML='<span style="display:block;color:#d4af37;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Jump to demo</span><strong style="display:block;margin-top:2px;font-size:14px;color:#fff">Try FlipForge ↓</strong>';
      floating.style.cssText='position:fixed;right:18px;bottom:18px;z-index:75;padding:12px 17px;border:1px solid rgba(212,175,55,.55);border-radius:999px;background:rgba(3,8,18,.94);box-shadow:0 16px 44px rgba(0,0,0,.45);text-decoration:none;backdrop-filter:blur(12px);';
      document.body.append(floating);
    }

    const demoHeading=document.querySelector('.ff-demo-section .section-head h2');
    if(demoHeading)demoHeading.textContent='See FlipForge catch a bad decision in four steps.';
    const demoCopy=document.querySelector('.ff-demo-section .section-copy');
    if(demoCopy)demoCopy.textContent='Follow one example from seller claim to evidence challenge to a protected VERIFY verdict.';
  };
  promoteTryFlipForge();

  const buildHeroDecisionSpotlight=()=>{
    const visual=document.querySelector('.ff-hero-visual .visual');
    const caption=document.querySelector('.ff-hero-visual .caption');
    if(!visual)return;

    visual.style.cssText+='overflow:hidden;border-color:rgba(212,175,55,.34);background:linear-gradient(180deg,#080b12,#020305);';
    visual.innerHTML=`
      <div aria-label="Illustrative FlipForge decision spotlight" style="display:grid;min-height:510px;color:#fff">
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 19px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg,rgba(212,175,55,.12),rgba(212,175,55,.025))">
          <div><span style="display:block;color:#d4af37;font-size:9px;font-weight:900;letter-spacing:.15em;text-transform:uppercase">Decision spotlight</span><strong style="display:block;margin-top:4px;font-size:18px">One bad claim can change the whole decision.</strong></div>
          <span style="padding:8px 11px;border:1px solid rgba(212,175,55,.30);border-radius:999px;color:#d4af37;font-size:9px;font-weight:900;letter-spacing:.10em;text-transform:uppercase">Illustrative · not live market data</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
          <section style="padding:20px;border-right:1px solid rgba(255,255,255,.07)">
            <span style="display:block;margin-bottom:11px;color:#8e96a3;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase">Seller listing</span>
            <div style="padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:rgba(255,255,255,.025)">
              <strong style="display:block;font-size:17px;line-height:1.25">2018 Topps Chrome Shohei Ohtani #150 PSA 10</strong>
              <p style="margin:9px 0 14px;color:#aeb5c0;font-size:12px;line-height:1.5">Seller title claims the <strong style="color:#fff">Refractor</strong> parallel.</p>
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:end">
                <span style="padding:7px 10px;border:1px solid rgba(212,175,55,.35);border-radius:999px;background:rgba(212,175,55,.10);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase">Claimed: Refractor</span>
                <div style="text-align:right"><strong style="display:block;font-size:28px;line-height:1">$675</strong><span style="color:#828a96;font-size:9px;text-transform:uppercase;letter-spacing:.08em">Seller ask</span></div>
              </div>
            </div>
            <div style="display:grid;gap:9px;margin-top:13px">
              <div style="display:grid;grid-template-columns:24px 1fr;gap:9px;padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:12px"><span style="color:#8fe0af;font-weight:900">✓</span><div><strong style="display:block;font-size:12px">Base identity aligns</strong><span style="color:#8f97a4;font-size:10px;line-height:1.4">Year, set, player, number, grader and grade are consistent.</span></div></div>
              <div style="display:grid;grid-template-columns:24px 1fr;gap:9px;padding:10px 11px;border:1px solid rgba(239,92,92,.22);border-radius:12px;background:rgba(239,92,92,.035)"><span style="color:#ffabab;font-weight:900">!</span><div><strong style="display:block;font-size:12px">Parallel unresolved</strong><span style="color:#a5abb4;font-size:10px;line-height:1.4">The evidence does not prove the claimed Refractor.</span></div></div>
              <div style="display:grid;grid-template-columns:24px 1fr;gap:9px;padding:10px 11px;border:1px solid rgba(239,92,92,.22);border-radius:12px;background:rgba(239,92,92,.035)"><span style="color:#ffabab;font-weight:900">!</span><div><strong style="display:block;font-size:12px">Mismatched comp blocked</strong><span style="color:#a5abb4;font-size:10px;line-height:1.4">Base / unstated evidence cannot quietly support the target value.</span></div></div>
            </div>
          </section>
          <section style="display:grid;align-content:center;padding:24px;background:radial-gradient(circle at 65% 18%,rgba(64,134,255,.12),transparent 38%)">
            <span style="width:max-content;padding:9px 13px;border:1px solid rgba(64,134,255,.35);border-radius:999px;background:rgba(64,134,255,.12);color:#d7e8ff;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase">FlipForge verdict · VERIFY</span>
            <h3 style="margin:16px 0 9px;font-size:34px;line-height:.98;letter-spacing:-.04em">Do not buy the story.</h3>
            <p style="margin:0;color:#b2bac5;font-size:13px;line-height:1.55">The claimed parallel is not proven, so the ask cannot be supported yet. FlipForge protects the decision instead of manufacturing certainty.</p>
            <div style="display:grid;gap:8px;margin-top:17px">
              <div style="padding:10px 12px;border:1px solid rgba(212,175,55,.17);border-radius:11px;background:rgba(212,175,55,.045);font-size:11px"><span style="color:#d4af37;font-weight:900">1 · CONFIRM</span><br>Verify the slab and card images against authoritative identity evidence.</div>
              <div style="padding:10px 12px;border:1px solid rgba(212,175,55,.17);border-radius:11px;background:rgba(212,175,55,.045);font-size:11px"><span style="color:#d4af37;font-weight:900">2 · REPLACE</span><br>Remove mismatched comps and use exact verified matches only.</div>
              <div style="padding:10px 12px;border:1px solid rgba(212,175,55,.17);border-radius:11px;background:rgba(212,175,55,.045);font-size:11px"><span style="color:#d4af37;font-weight:900">3 · RERUN</span><br>Recalculate once the parallel is proven.</div>
            </div>
            <a href="#try-flipforge" style="display:inline-flex;width:max-content;margin-top:17px;padding:10px 13px;border:1px solid #d4af37;border-radius:10px;background:#d4af37;color:#050505;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;text-decoration:none">Try this decision flow ↓</a>
          </section>
        </div>
      </div>`;
    if(caption)caption.textContent='Seller claim → evidence challenge → protected VERIFY verdict. This is the decision layer FlipForge is built to add.';
  };
  buildHeroDecisionSpotlight();

  const decisionBoundaryText='Decision support only. FlipForge does not authorize transactions or guarantee outcomes.';
  const addDecisionBoundary=(container,placement='append')=>{
    if(!container||container.querySelector('.ff-decision-boundary'))return;
    const boundary=document.createElement('p');
    boundary.className='caption ff-decision-boundary';
    boundary.textContent=decisionBoundaryText;
    if(placement==='after')container.insertAdjacentElement('afterend',boundary);
    else container.append(boundary);
  };

  const dossierPreview=document.querySelector('.ff-dossier-preview');
  addDecisionBoundary(dossierPreview);

  const demoResult=document.querySelector('.demo-result');
  addDecisionBoundary(demoResult,'after');

  const steps=[
    {
      label:'Step 1 of 4 · Enter the card',
      title:'A title claim is not enough.',
      copy:'FlipForge separates the seller’s wording from the verified card attributes before comparing any price or sale.',
      state:'CHECK IDENTITY',
      stateClass:'amber',
      checks:[
        ['good','✓','Base identity aligns','Year, set, player, and card number are consistent.'],
        ['bad','!','Parallel unresolved','Refractor cannot be assumed from the title.'],
        ['neutral','→','Next check','Review slab and card images against identity evidence.']
      ]
    },
    {
      label:'Step 2 of 4 · FlipForge checks it',
      title:'Only true matches should influence value.',
      copy:'The returned record is Base / Unstated. Because the target is a Refractor, FlipForge excludes it instead of blending two markets.',
      state:'EVIDENCE BLOCKED',
      stateClass:'red',
      checks:[
        ['good','✓','Sale status reviewed','A completed sale still must match the target card.'],
        ['bad','!','Parallel mismatch found','Base and Refractor values cannot be combined.'],
        ['neutral','→','Evidence effect','The record stays visible in traceback but out of supported value.']
      ]
    },
    {
      label:'Step 3 of 4 · Review economics',
      title:'Unsupported identity means unsupported economics.',
      copy:'FlipForge will not create a confident purchase or grading thesis from a comp set containing an unresolved mismatch.',
      state:'VALUE UNSUPPORTED',
      stateClass:'red',
      checks:[
        ['bad','!','Fair value withheld','The evidence set does not prove the target card.'],
        ['bad','!','ROI withheld','A precise percentage would create false confidence.'],
        ['good','✓','Uncertainty preserved','The missing proof stays visible instead of being guessed.']
      ]
    },
    {
      label:'Step 4 of 4 · Get guidance',
      title:'Verify before the card influences a decision.',
      copy:'The correct outcome is VERIFY: confirm the parallel, replace the mismatched record, and rerun evidence review.',
      state:'VERIFY',
      stateClass:'blue',
      checks:[
        ['good','✓','Clear action state','The result explains what is wrong and what to do next.'],
        ['neutral','→','Resolution path','Confirm the parallel → replace mismatched evidence → rerun analysis.'],
        ['good','✓','Decision protected','No purchase authorization comes from weak evidence.']
      ]
    }
  ];

  const buttons=[...document.querySelectorAll('[data-demo-step]')];
  const label=document.getElementById('demo-label');
  const title=document.getElementById('demo-title');
  const copy=document.getElementById('demo-copy');
  const state=document.getElementById('demo-state');
  const checks=document.getElementById('demo-checks');
  const demoSection=document.getElementById('try-flipforge');
  const playback=document.getElementById('demo-playback');
  const screenMode=document.querySelector('.screen-mode');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const lastStepIndex=steps.length-1;
  let currentIndex=0;
  let timer=null;
  let inView=false;
  let paused=reducedMotion.matches;
  let completed=false;

  const renderStep=index=>{
    const step=steps[index];
    if(!step||!label||!title||!copy||!state||!checks)return;
    buttons.forEach((button,i)=>{
      const active=i===index;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    label.textContent=step.label;
    title.textContent=step.title;
    copy.textContent=step.copy;
    state.textContent=step.state;
    state.className=`badge ${step.stateClass}`;

    const fragment=document.createDocumentFragment();
    for(const [kind,symbol,heading,detail] of step.checks){
      const row=document.createElement('div');
      const icon=document.createElement('span');
      const text=document.createElement('p');
      const strong=document.createElement('strong');
      const small=document.createElement('small');
      icon.className=`check-icon ${kind}`;
      icon.textContent=symbol;
      strong.textContent=heading;
      small.textContent=detail;
      text.append(strong,small);
      row.append(icon,text);
      fragment.appendChild(row);
    }
    checks.replaceChildren(fragment);
    currentIndex=index;
  };

  const stopPreview=()=>{
    if(timer!==null){window.clearTimeout(timer);timer=null;}
  };
  const syncPlayback=()=>{
    if(!playback)return;
    if(completed){
      playback.textContent='Restart demo';
      playback.setAttribute('aria-pressed','false');
      if(screenMode)screenMode.textContent='Illustrative · Final verdict';
      return;
    }
    playback.textContent=paused?'Play preview':'Pause preview';
    playback.setAttribute('aria-pressed',String(paused));
    if(screenMode)screenMode.textContent=paused?'Illustrative · Paused':'Illustrative · Auto preview';
  };
  const finishPreview=()=>{
    stopPreview();
    paused=true;
    completed=true;
    syncPlayback();
  };
  const scheduleNext=()=>{
    stopPreview();
    if(paused||completed||!inView||document.hidden||reducedMotion.matches)return;
    timer=window.setTimeout(()=>{
      if(currentIndex>=lastStepIndex){finishPreview();return;}
      renderStep(currentIndex+1);
      if(currentIndex>=lastStepIndex){finishPreview();return;}
      scheduleNext();
    },4200);
  };
  const pauseForInteraction=()=>{
    paused=true;
    stopPreview();
    syncPlayback();
  };
  const restartPreview=()=>{
    completed=false;
    paused=false;
    renderStep(0);
    syncPlayback();
    scheduleNext();
  };

  buttons.forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.demoStep);
    completed=index===lastStepIndex;
    renderStep(index);
    if(completed)finishPreview();
    else pauseForInteraction();
  }));
  playback?.addEventListener('click',()=>{
    if(completed){restartPreview();return;}
    paused=!paused;
    syncPlayback();
    scheduleNext();
  });
  reducedMotion.addEventListener?.('change',event=>{
    paused=event.matches;
    if(event.matches)stopPreview();
    syncPlayback();
    scheduleNext();
  });
  document.addEventListener('visibilitychange',scheduleNext);

  if(demoSection&&'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      inView=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.35);
      const floating=document.querySelector('.ff-demo-float');
      if(floating)floating.style.opacity=inView?'0':'1';
      if(floating)floating.style.pointerEvents=inView?'none':'auto';
      scheduleNext();
    },{threshold:[0,.35,.7]});
    observer.observe(demoSection);
  }else{
    inView=true;
    scheduleNext();
  }
  syncPlayback();
})();