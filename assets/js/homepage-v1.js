(()=>{
  'use strict';

  const ensureKnowWhyExperience=()=>{
    if(!document.querySelector('link[data-ff-know-why-animatic]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='assets/css/homepage-know-why-animatic-v1.css';
      link.dataset.ffKnowWhyAnimatic='';
      document.head.appendChild(link);
    }

    const heroDemo=document.querySelector('[data-demo-cta="hero"]');
    if(heroDemo)heroDemo.setAttribute('href','#know-why-demo');

    if(document.getElementById('know-why-demo'))return;
    const problem=document.querySelector('.ff-problem-band.ff-false-confidence');
    if(!problem)return;

    const section=document.createElement('section');
    section.className='ff-know-why-demo';
    section.id='know-why-demo';
    section.setAttribute('aria-labelledby','know-why-demo-heading');
    section.innerHTML=`
      <div class="ff-know-why-shell">
        <div class="ff-know-why-copy">
          <span class="ff-kicker">27 SECONDS · SEE WHY</span>
          <h2 id="know-why-demo-heading">The listing price didn't change. <span>What you know did.</span></h2>
          <p class="ff-know-why-lead">Watch a card that looks $50 under comp turn into <strong>VERIFY</strong> when FlipForge checks whether the evidence actually belongs to the exact card.</p>
          <ul class="ff-know-why-proof">
            <li>The listing looks cheaper than the apparent comp.</li>
            <li>FlipForge catches a different parallel and thin exact-card evidence.</li>
            <li>The result becomes a clear next action: VERIFY before buying confidently.</li>
          </ul>
          <div class="ff-know-why-actions">
            <a class="btn primary" href="beta-application.html">Request Beta Access</a>
            <a class="ff-know-why-secondary" href="learn.html">Explore the Evidence Lab <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <figure class="ff-know-why-player">
          <iframe
            src="assets/interactive/flipforge-know-why.html"
            title="FlipForge illustrative decision animation showing why an apparent deal becomes VERIFY"
            loading="lazy"
            sandbox="allow-scripts"
            referrerpolicy="no-referrer"
          ></iframe>
          <figcaption class="ff-know-why-caption"><span><strong>Illustrative example</strong> · not live market data</span><span>Click animation to pause or resume</span></figcaption>
        </figure>
      </div>`;
    problem.insertAdjacentElement('afterend',section);
  };

  ensureKnowWhyExperience();

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
  window.addEventListener('resize',()=>{if(window.innerWidth>1000)closeMenu();},{passive:true});
})();
