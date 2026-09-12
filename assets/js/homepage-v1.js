(()=>{
  'use strict';

  const isHomepage=()=>window.location.pathname==='/'||window.location.pathname==='/index.html';

  const syncHomepageNavigation=()=>{
    const brand=document.querySelector('.decision-brand');
    if(brand)brand.setAttribute('href','/');

    const ensureLink=(nav,{href,label,position='end',marker})=>{
      if(!nav)return null;
      let link=nav.querySelector(`a[href="${href}"]`);
      if(!link){
        link=document.createElement('a');
        link.href=href;
        link.textContent=label;
        if(marker)link.dataset.ffHomepageNav=marker;
        if(position==='start')nav.insertBefore(link,nav.firstElementChild);
        else if(position==='before-cta'){
          const cta=nav.querySelector('.decision-nav-cta, a[href="beta-application.html"]');
          if(cta)nav.insertBefore(link,cta);else nav.appendChild(link);
        }else nav.appendChild(link);
      }
      return link;
    };

    const configureNav=(nav,{mobile=false}={})=>{
      if(!nav)return;

      nav.querySelectorAll('[data-ff-homepage-nav="home"],[data-ff-homepage-nav="connect"]').forEach(link=>link.remove());

      const product=nav.querySelector('a[href="product.html"],a[href="/product.html"],a[href="/product"]');
      if(product)product.textContent='How It Works';

      const decision=ensureLink(nav,{
        href:'decision-intelligence.html',
        label:mobile?'Card Decision Intelligence™':'Decision Intelligence™',
        position:'start',
        marker:'decision-intelligence'
      });
      if(decision){
        decision.textContent=mobile?'Card Decision Intelligence™':'Decision Intelligence™';
        decision.dataset.ffHomepageNav='decision-intelligence';
        nav.insertBefore(decision,nav.firstElementChild);
      }
    };

    configureNav(document.querySelector('.decision-nav-links'));
    configureNav(document.querySelector('.mobile-nav'),{mobile:true});

    const eyebrow=document.querySelector('.decision-eyebrow');
    if(eyebrow)eyebrow.textContent='CARD DECISION INTELLIGENCE™';

    if(window.location.pathname==='/index.html'){
      window.history.replaceState(null,'',`/${window.location.search}${window.location.hash}`);
    }
  };

  const syncHomepagePositioning=()=>{
    if(!isHomepage())return;

    document.title='FlipForge™ | Card Decision Intelligence';
    const description=document.querySelector('meta[name="description"]');
    if(description)description.setAttribute('content','FlipForge is Card Decision Intelligence for sports cards—the missing layer between card data and the decision to BUY, WATCH, VERIFY, or PASS.');

    const hero=document.querySelector('.decision-hero');
    const copy=document.querySelector('.decision-hero-copy');
    if(!hero||!copy)return;

    const title=copy.querySelector('#decision-hero-title');
    const titleTop=title?.querySelector('span');
    const titleBottom=title?.querySelector('strong');
    if(titleTop)titleTop.textContent="More data isn't the answer.";
    if(titleBottom)titleBottom.textContent='A better decision is.';

    const lead=copy.querySelector('.decision-lead');
    if(lead)lead.textContent='FlipForge turns sports-card data into one clear next move—BUY, WATCH, VERIFY, or PASS—before you spend.';

    const cue=copy.querySelector('.decision-demo-cue');
    if(cue)cue.innerHTML='<strong>Before you buy. Know Why.</strong> FlipForge checks the exact card, challenges weak comps, weighs the deal, and shows why the decision changed.';

    const actions=copy.querySelector('.decision-actions');
    if(actions&&!actions.querySelector('[data-ff-cdi-primary]')){
      const primary=document.createElement('a');
      primary.className='decision-button decision-button-primary';
      primary.href='decision-intelligence.html';
      primary.dataset.ffCdiPrimary='true';
      primary.textContent='Why FlipForge Is Different';
      actions.insertBefore(primary,actions.firstChild);
    }

    const assurance=copy.querySelector('.decision-assurance');
    if(assurance)assurance.textContent='The missing layer between card data and card decisions.';

    if(document.querySelector('[data-ff-cdi-moat]'))return;

    const section=document.createElement('section');
    section.className='ff-cdi-moat';
    section.dataset.ffCdiMoat='true';
    section.setAttribute('aria-labelledby','ff-cdi-moat-title');
    section.innerHTML=`
      <div class="ff-cdi-moat-inner">
        <div class="ff-cdi-moat-head">
          <p class="ff-cdi-moat-kicker">THE FLIPFORGE DIFFERENCE</p>
          <h2 id="ff-cdi-moat-title">Most card tools stop at data. FlipForge keeps going.</h2>
          <p>Listings tell you what someone is asking. Sales history tells you what happened. Charts show movement. FlipForge helps answer the question that actually costs money: <strong>What should I do?</strong></p>
        </div>

        <div class="ff-cdi-category-grid" aria-label="How FlipForge differs from common card tools">
          <article><span>MARKETPLACES</span><h3>What is for sale?</h3><p>Useful for finding cards. Not a decision.</p></article>
          <article><span>PRICE + COMP TOOLS</span><h3>What has it sold for?</h3><p>Useful context. Still not a decision.</p></article>
          <article><span>MARKET ANALYTICS</span><h3>How is the market moving?</h3><p>Useful signal. Still not a decision.</p></article>
          <article class="is-flipforge"><span>FLIPFORGE</span><h3>What does the evidence support?</h3><p>Then: BUY, WATCH, VERIFY, or PASS—and why.</p></article>
        </div>

        <div class="ff-cdi-path-head">
          <p class="ff-cdi-moat-kicker">CARD DECISION INTELLIGENCE™</p>
          <h2>From card data to a decision you can explain.</h2>
        </div>

        <div class="ff-cdi-path">
          <article><b>01</b><div><h3>Know the exact card.</h3><p>Wrong parallel, grade, or variation can make the whole comparison meaningless.</p></div></article>
          <article><b>02</b><div><h3>Challenge the evidence.</h3><p>FlipForge does not let every comp count just because it looks similar.</p></div></article>
          <article><b>03</b><div><h3>Weigh the deal.</h3><p>Price only matters after the evidence and risk are put in context.</p></div></article>
          <article><b>04</b><div><h3>Make the call.</h3><p>BUY, WATCH, VERIFY, or PASS—with the strongest reasons visible.</p></div></article>
        </div>

        <div class="ff-cdi-moat-bottom">
          <div><span>CARD DECISION INTELLIGENCE™</span><strong>Not another price tracker. A decision system for collectors.</strong></div>
          <div class="ff-cdi-moat-actions">
            <a class="decision-button decision-button-primary" href="decision-intelligence.html">See How It Works</a>
            <a class="decision-button decision-button-secondary" href="beta-application.html">Request Beta Access</a>
          </div>
        </div>
      </div>`;

    hero.insertAdjacentElement('afterend',section);
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
