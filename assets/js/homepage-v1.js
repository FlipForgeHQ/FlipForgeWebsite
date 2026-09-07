(()=>{
  'use strict';

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
        else if(position==='after-product'){
          const product=nav.querySelector('a[href="product.html"]');
          product?.insertAdjacentElement('afterend',link);
          if(!product)nav.appendChild(link);
        }else if(position==='before-cta'){
          const cta=nav.querySelector('.decision-nav-cta, a[href="beta-application.html"]');
          if(cta)nav.insertBefore(link,cta);else nav.appendChild(link);
        }else nav.appendChild(link);
      }
      return link;
    };

    const desktop=document.querySelector('.decision-nav-links');
    const mobile=document.querySelector('.mobile-nav');
    [desktop,mobile].forEach(nav=>{
      const home=ensureLink(nav,{href:'/',label:'Home',position:'start',marker:'home'});
      if(home)home.setAttribute('aria-current','page');
      ensureLink(nav,{href:'decision-intelligence.html',label:'Decision Intelligence',position:'after-product',marker:'decision-intelligence'});
      ensureLink(nav,{href:'/connect/',label:'Connect',position:'before-cta',marker:'connect'});
    });

    const eyebrow=document.querySelector('.decision-eyebrow');
    if(eyebrow)eyebrow.textContent='CARD DECISION INTELLIGENCE™';

    if(window.location.pathname==='/index.html'){
      window.history.replaceState(null,'',`/${window.location.search}${window.location.hash}`);
    }
  };

  const enforceReadabilityFloor=()=>{
    document.querySelectorAll('main p, main li, main label, main button, main input, main select').forEach(el=>{
      const size=parseFloat(getComputedStyle(el).fontSize)||0;
      if(size>0&&size<12)el.style.fontSize='12px';
    });
  };

  syncHomepageNavigation();
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
  window.addEventListener('resize',()=>{enforceReadabilityFloor();if(window.innerWidth>1000)closeMenu();},{passive:true});
})();
