(()=>{
  'use strict';
  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;
  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timings=[0,3200,6500,10000,13500,17200];
  let timers=[];
  const show=index=>{
    scenes.forEach((scene,i)=>scene.classList.toggle('is-active',i===index));
  };
  const clear=()=>{timers.forEach(clearTimeout);timers=[];};
  const play=()=>{
    clear();
    if(reduce){show(scenes.length-1);return;}
    show(0);
    timings.slice(1).forEach((delay,i)=>timers.push(setTimeout(()=>show(i+1),delay)));
    timers.push(setTimeout(play,22000));
  };
  play();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)clear(); else play();
  });
})();