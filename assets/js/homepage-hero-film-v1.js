(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  // Keep the final animation brand label aligned with the locked FlipForge descriptor
  // even when the static homepage source predates the current brand lock.
  const finalBrandLabel=scenes.at(-1)?.querySelector('small');
  if(finalBrandLabel&&finalBrandLabel.textContent.trim()==='Card Intelligence'){
    finalBrandLabel.textContent='Card Decision Intelligence';
  }

  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timings=[0,3000,7000,11000,15000,20000];
  const loopMs=25000;
  let timers=[];
  let running=false;

  const label=film.querySelector('.ff-film-label');
  if(label)label.textContent='Autoplay · 25 seconds';

  const clear=()=>{
    timers.forEach(clearTimeout);
    timers=[];
  };

  const show=index=>{
    film.dataset.ffScene=String(index+1);
    scenes.forEach((scene,i)=>{
      const active=i===index;
      scene.classList.toggle('is-active',active);
      scene.setAttribute('aria-hidden',active?'false':'true');
    });
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
