(()=>{
  'use strict';

  const film=document.querySelector('[data-ff-hero-film]');
  if(!film)return;

  const scenes=[...film.querySelectorAll('[data-ff-film-scene]')];
  if(!scenes.length)return;

  const timings=[0,1800,4200,6800,9300,11700];
  const loopMs=14500;
  let timers=[];

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

  const play=()=>{
    clear();
    restartTimeline();
    show(0);
    timings.slice(1).forEach((delay,i)=>{
      timers.push(setTimeout(()=>show(i+1),delay));
    });
    timers.push(setTimeout(play,loopMs));
  };

  play();

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      clear();
      film.classList.remove('is-playing');
    }else{
      play();
    }
  });
})();
