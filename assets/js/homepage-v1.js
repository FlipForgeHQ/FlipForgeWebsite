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

  const dedupeRouteLinks=container=>{
    if(!container)return;
    const seen=new Set();
    [...container.querySelectorAll('a[href]')].forEach(link=>{
      const route=normalizeRoutePath(link);
      if(!route)return;
      if(seen.has(route))link.remove();
      else seen.add(route);
    });
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
      dedupeRouteLinks(nav);
    };

    render(document.querySelector('.decision-nav-links'));
    render(document.querySelector('.mobile-nav'),{mobile:true});
  };

  const cdiHomeMarkup=()=>`
    <div class="ff-cdi-home-inner">
      <div class="ff-cdi-home-head">
        <p class="ff-cdi-home-kicker">WHAT IS CARD DECISION INTELLIGENCE™?</p>
        <h2>Data tells you what happened. FlipForge helps you decide what to do now.</h2>
        <p>Card Decision Intelligence™ connects verified card identity, qualified evidence, market economics, uncertainty, decision reasoning, outcomes, and governance into one explainable system. <strong>It is the layer between sports-card data and the decision to spend.</strong></p>
      </div>

      <div class="ff-cdi-visual-proof" aria-label="FlipForge product intelligence examples">
        <figure><img src="assets/images/flipforge-identity-first.webp" alt="FlipForge identity intelligence view for exact-card verification."><figcaption><span>01 · IDENTITY</span><strong>Prove the exact card before price evidence counts.</strong></figcaption></figure>
        <figure><img src="assets/images/flipforge-evidence-review.webp" alt="FlipForge evidence review view for qualifying comparison records."><figcaption><span>02 · EVIDENCE</span><strong>Remove the comps that do not belong.</strong></figcaption></figure>
        <figure><img src="assets/images/before-after-flipforge.webp" alt="FlipForge before-and-after decision view showing how evidence changes the call."><figcaption><span>03 · DECISION</span><strong>See how the evidence changes the decision.</strong></figcaption></figure>
      </div>

      <div class="ff-cdi-contrast" aria-label="Difference between market data and Card Decision Intelligence">
        <article><span>MARKET DATA</span><h3>What sold? What is listed? What moved?</h3><p>Useful context, but it still leaves the collector responsible for deciding which evidence belongs and what the risk means.</p></article>
        <article><span>CARD DECISION INTELLIGENCE™</span><h3>What should I do — and why?</h3><p>FlipForge turns trusted context into BUY, WATCH, VERIFY, or PASS, while preserving the reason trail behind the call.</p></article>
      </div>

      <div class="ff-cdi-systems" aria-label="Four systems of Card Decision Intelligence">
          <article class="ff-cdi-system-card"><span>A · KNOW THE CARD</span><h3>Prove the exact card.</h3><p>Release, card structure, exact identity, and identity trust are resolved before market evidence gets a vote.</p><div class="ff-cdi-system-layers"><small>Release</small><small>Taxonomy</small><small>Identity</small><small>Provenance + Trust</small></div></article>
          <article class="ff-cdi-system-card"><span>B · KNOW THE MARKET</span><h3>Use evidence that belongs.</h3><p>Qualified evidence supports value, product and variant behavior, grade context, and scarcity observations.</p><div class="ff-cdi-system-layers"><small>Evidence</small><small>Economics</small><small>Product + Variant</small><small>Grade + Scarcity</small></div></article>
          <article class="ff-cdi-system-card"><span>C · MAKE THE DECISION</span><h3>Make the call—and show why.</h3><p>Risk stays visible while FlipForge turns the surviving evidence into BUY, WATCH, VERIFY, or PASS and preserves the reason trail.</p><div class="ff-cdi-system-layers"><small>Risk + Uncertainty</small><small>Decision</small><small>Decision Receipt</small></div></article>
          <article class="ff-cdi-system-card"><span>D · LEARN WHAT HAPPENED</span><h3>Measure whether it held up.</h3><p>Outcomes are measured against the original decision while unknowns, conflicts, and future changes stay governed.</p><div class="ff-cdi-system-layers"><small>Outcome</small><small>Governance + Continuous</small></div></article>
        </div>

        <div class="ff-cdi-home-footer">
        <div class="ff-cdi-home-footer-copy"><span>FLIPFORGE = CARD DECISION INTELLIGENCE™</span><strong>Know the card. Know the market. Make the decision. Learn what happened.</strong></div>
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