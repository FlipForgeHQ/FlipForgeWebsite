(()=>{
  'use strict';

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
    },{once:true});
  }

  const isHomepage=()=>window.location.pathname==='/'||window.location.pathname==='/index.html';

  const normalizeRoutePath=value=>{
    try{
      const url=value instanceof Element&&value.tagName==='A'
        ?new URL(value.getAttribute('href')||value.href,window.location.href)
        :new URL(String(value||''),window.location.href);
      let route=url.pathname
        .replace(/\/index\.html$/,'/')
        .replace(/\.html$/,'')
        .replace(/\/+$/,'')||'/';
      return route;
    }catch{return '';}
  };

  const ensureStylesheet=href=>{
    const route=normalizeRoutePath(href);
    const found=[...document.querySelectorAll('link[rel="stylesheet"][href]')].some(link=>normalizeRoutePath(link.getAttribute('href'))===route);
    if(found)return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  };

  const syncHomepageNavigation=()=>{
    const brand=document.querySelector('.decision-brand');
    if(brand)brand.setAttribute('href','/');

    const canonical=[
      {href:'product.html',label:'Product'},
      {href:'decision-intelligence.html',label:'Decision Intelligence'},
      {href:'learn.html',label:'Evidence Lab'},
      {href:'pricing.html',label:'Launch Plans'},
      {href:'about.html',label:'About'},
      {href:'beta-application.html',label:'Request Beta Access',cta:true}
    ];

    const render=(nav,{mobile=false}={})=>{
      if(!nav)return;
      const fragment=document.createDocumentFragment();
      canonical.forEach(item=>{
        const link=document.createElement('a');
        link.href=item.href;
        link.textContent=item.label;
        if(item.cta&&!mobile)link.className='decision-nav-cta';
        fragment.appendChild(link);
      });
      nav.replaceChildren(fragment);
    };

    render(document.querySelector('.decision-nav-links'));
    render(document.querySelector('.mobile-nav'),{mobile:true});
  };

  const cdiHomeMarkup=()=>`
    <div class="ff-cdi-home-inner">
      <div class="ff-cdi-home-head">
        <p class="ff-cdi-home-kicker">WHAT IS CARD DECISION INTELLIGENCE™?</p>
        <h2>Data tells you what happened. FlipForge helps you decide what to do now.</h2>
        <p>Card Decision Intelligence™ connects the exact card, qualified evidence, economics, uncertainty, decision reasoning, and later outcomes into one explainable system. <strong>It is the layer between sports-card data and the decision to spend.</strong></p>
      </div>

      <div class="ff-cdi-contrast" aria-label="Difference between market data and Card Decision Intelligence">
        <article><span>MARKET DATA</span><h3>What sold? What is listed? What moved?</h3><p>Useful context, but it still leaves the collector responsible for deciding which evidence belongs and what the risk means.</p></article>
        <article><span>CARD DECISION INTELLIGENCE™</span><h3>What should I do — and why?</h3><p>FlipForge turns trusted context into BUY, WATCH, VERIFY, or PASS, while preserving the reason trail behind the call.</p></article>
      </div>

      <div class="ff-cdi-layers" aria-label="Seven layers of Card Decision Intelligence">
        <article class="ff-cdi-layer"><b>01</b><small>Identity Intelligence</small><h3>Know the exact card.</h3><p>Year, set, card number, parallel, grader, and grade must agree before evidence gets a vote.</p></article>
        <article class="ff-cdi-layer"><b>02</b><small>Evidence Intelligence</small><h3>Test what deserves to count.</h3><p>Keep qualified evidence. Reject duplicates, wrong variants, conflicts, and weak comparisons.</p></article>
        <article class="ff-cdi-layer"><b>03</b><small>Economic Intelligence</small><h3>Rebuild the economics.</h3><p>Supported value, price edge, liquidity, and costs matter only after the evidence survives review.</p></article>
        <article class="ff-cdi-layer"><b>04</b><small>Risk + Uncertainty</small><h3>Expose what is still unknown.</h3><p>Missing, stale, or conflicting evidence remains visible instead of being hidden behind false confidence.</p></article>
        <article class="ff-cdi-layer"><b>05</b><small>Decision Intelligence</small><h3>Make the call.</h3><p>BUY, WATCH, VERIFY, or PASS — based on governed evidence and the current decision context.</p></article>
        <article class="ff-cdi-layer"><b>06</b><small>Decision Receipt</small><h3>Show why the call happened.</h3><p>The decision keeps a traceable reason trail so the user can inspect what supported or weakened it.</p></article>
        <article class="ff-cdi-layer"><b>07</b><small>Outcome Intelligence</small><h3>See what happened next.</h3><p>Later observations are measured against the original decision without rewriting the historical record.</p></article>
      </div>

      <div class="ff-cdi-home-footer">
        <div class="ff-cdi-home-footer-copy"><span>FLIPFORGE = CARD DECISION INTELLIGENCE™</span><strong>Other tools show you market information. FlipForge helps you decide what to do with it.</strong></div>
        <div class="ff-cdi-home-actions">
          <a class="decision-button decision-button-primary" href="decision-intelligence.html">Explore Decision Intelligence</a>
          <a class="decision-button decision-button-secondary" href="beta-application.html">Request Beta Access</a>
        </div>
      </div>
    </div>`;

  const syncHomepagePositioning=()=>{
    if(!isHomepage())return;
    ensureStylesheet('assets/css/homepage-cdi-positioning-v1.css');

    document.title='FlipForge™ | Card Decision Intelligence';
    const description=document.querySelector('meta[name="description"]');
    if(description)description.setAttribute('content','FlipForge is Card Decision Intelligence for sports cards—turning exact identity, qualified evidence, economics, risk, and outcomes into an explainable BUY, WATCH, VERIFY, or PASS decision.');

    const copy=document.querySelector('.decision-hero-copy');
    if(copy){
      const eyebrow=copy.querySelector('.decision-eyebrow');
      if(eyebrow)eyebrow.textContent='CARD DECISION INTELLIGENCE™';

      const title=copy.querySelector('#decision-hero-title');
      const titleTop=title?.querySelector('span');
      const titleBottom=title?.querySelector('strong');
      if(titleTop)titleTop.textContent='Before you buy.';
      if(titleBottom)titleBottom.textContent='Know Why.';

      const lead=copy.querySelector('.decision-lead');
      if(lead)lead.textContent='FlipForge is Card Decision Intelligence™ for sports cards—turning exact identity, qualified evidence, supported value, risk, and market context into an explainable BUY, WATCH, VERIFY, or PASS decision.';

      const cue=copy.querySelector('.decision-demo-cue');
      if(cue)cue.innerHTML='<strong>Other tools show you data.</strong> FlipForge helps you decide what to do with it—and shows the reason trail behind the call.';

      const actions=copy.querySelector('.decision-actions');
      if(actions&&!actions.querySelector('[data-ff-cdi-primary]')){
        const primary=document.createElement('a');
        primary.className='decision-button decision-button-primary';
        primary.href='decision-intelligence.html';
        primary.dataset.ffCdiPrimary='true';
        primary.textContent='Explore Decision Intelligence';
        actions.insertBefore(primary,actions.firstChild);
      }

      const assurance=copy.querySelector('.decision-assurance');
      if(assurance)assurance.textContent='Identity → Evidence → Economics → Risk → Decision → Receipt → Outcome.';
    }

    const resultStage=document.querySelector('[data-ff-result-stage]');
    if(resultStage&&!resultStage.querySelector('[data-ff-cdi-reveal]')){
      const reasons=resultStage.querySelector('.ff-deal-reasons');
      const reveal=document.createElement('div');
      reveal.className='ff-cdi-reveal';
      reveal.dataset.ffCdiReveal='true';
      reveal.innerHTML='<small>YOU JUST USED CARD DECISION INTELLIGENCE™</small><h3>FlipForge did more than find a different price.</h3><p>It confirmed the exact card, rejected weak evidence, rebuilt supported value, exposed uncertainty, and returned a decision with a reason trail you can inspect.</p>';
      if(reasons)reasons.insertAdjacentElement('afterend',reveal);else resultStage.appendChild(reveal);
    }

    if(!document.querySelector('[data-ff-cdi-home]')){
      const hero=document.querySelector('.decision-hero');
      if(hero){
        const section=document.createElement('section');
        section.className='ff-cdi-home';
        section.dataset.ffCdiHome='true';
        section.setAttribute('aria-labelledby','ff-cdi-home-title');
        section.innerHTML=cdiHomeMarkup().replace('<h2>','<h2 id="ff-cdi-home-title">');
        hero.insertAdjacentElement('afterend',section);
      }
    }

    if(window.location.pathname==='/index.html')window.history.replaceState(null,'',`/${window.location.search}${window.location.hash}`);
  };

  const enforceReadabilityFloor=()=>{
    document.querySelectorAll('main p, main li, main label, main button, main input, main select').forEach(el=>{
      const size=parseFloat(getComputedStyle(el).fontSize)||0;
      if(size>0&&size<12)el.style.fontSize='12px';
    });
  };

  syncHomepageNavigation();
  syncHomepagePositioning();
  enforceReadabilityFloor();

  const toggle=document.querySelector('.menu-toggle');
  const menu=document.querySelector('.mobile-nav');
  const backdrop=document.querySelector('.backdrop');
  let lastFocus=null;

  if(!toggle||!menu||!backdrop)return;

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
  window.addEventListener('resize',()=>{enforceReadabilityFloor();if(window.innerWidth>1120)closeMenu();},{passive:true});
})();