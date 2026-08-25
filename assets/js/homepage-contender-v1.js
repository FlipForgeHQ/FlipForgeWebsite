(()=>{
  'use strict';

  if(!document.querySelector('link[data-ff-mobile-simplify]')){
    const mobileCss=document.createElement('link');
    mobileCss.rel='stylesheet';
    mobileCss.href='assets/css/homepage-mobile-simplify-v1.css';
    mobileCss.dataset.ffMobileSimplify='true';
    document.head.append(mobileCss);
  }
  if(!document.querySelector('link[data-ff-award-winning]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/award-winning-v1.css';
    css.dataset.ffAwardWinning='true';
    document.head.append(css);
  }
  if(!document.querySelector('script[data-ff-award-winning]')){
    const script=document.createElement('script');
    script.src='assets/js/award-winning-v1.js';
    script.defer=true;
    script.dataset.ffAwardWinning='true';
    document.head.append(script);
  }

  const root=document.documentElement;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(!reduced.matches)root.classList.add('ff-motion-ready');

  const motion=document.querySelector('.ff-decision-motion');
  const replay=document.querySelector('[data-replay-decision]');
  const restart=()=>{
    if(!motion||reduced.matches)return;
    motion.classList.remove('is-replaying');
    void motion.offsetWidth;
    motion.classList.add('is-replaying');
  };
  replay?.addEventListener('click',restart);

  const reveals=[...document.querySelectorAll('[data-reveal]')];
  if(!reveals.length||reduced.matches){
    reveals.forEach(node=>node.classList.add('is-visible'));
    return;
  }

  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },{threshold:.12,rootMargin:'0px 0px -8%'});
    reveals.forEach(node=>observer.observe(node));
  }else{
    reveals.forEach(node=>node.classList.add('is-visible'));
  }

  reduced.addEventListener?.('change',event=>{
    if(event.matches){
      root.classList.remove('ff-motion-ready');
      motion?.classList.remove('is-replaying');
      reveals.forEach(node=>node.classList.add('is-visible'));
    }
  });
})();
