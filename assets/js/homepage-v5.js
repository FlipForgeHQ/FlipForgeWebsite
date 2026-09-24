const film=document.querySelector('[data-film]');
if(film){
  const scenes=[...film.querySelectorAll('[data-scene]')];
  const play=film.querySelector('[data-play]');
  const progress=film.querySelector('[data-progress]');
  const time=film.querySelector('[data-time]');
  const vo=film.querySelector('[data-vo]');
  const starts=[0,5,12,20,27];
  const voice=[
    '“The price is easy. Knowing whether to trust it isn’t.”',
    '“FlipForge first proves the exact card—before price evidence gets a vote.”',
    '“Then it makes the comps earn their place. Evidence that does not belong is removed.”',
    '“Price is only an input. Qualified evidence reveals supported value—and FlipForge says VERIFY.”',
    '“FlipForge. Before you buy. Know Why.”'
  ];
  let timer=null,elapsed=0,running=false;
  function show(i){scenes.forEach((s,n)=>s.classList.toggle('active',n===i));if(vo)vo.textContent=voice[i]}
  function fmt(n){return '00:'+String(Math.max(0,Math.min(30,Math.floor(n)))).padStart(2,'0')}
  function stop(reset=false){
    if(timer)clearInterval(timer);
    timer=null;running=false;
    if(play)play.textContent='▶';
    if(reset){
      elapsed=0;
      if(progress)progress.style.width='0%';
      if(time)time.textContent='00:00 / 00:30';
      show(0);
    }
  }
  function startFilm(){
    stop(false);running=true;
    if(play)play.textContent='Ⅱ';
    const base=Date.now()-elapsed*1000;
    timer=setInterval(()=>{
      elapsed=(Date.now()-base)/1000;
      const t=Math.min(elapsed,30);
      if(progress)progress.style.width=(t/30*100)+'%';
      if(time)time.textContent=fmt(t)+' / 00:30';
      let idx=0;starts.forEach((s,i)=>{if(t>=s)idx=i});show(idx);
      if(t>=30)stop(true);
    },100);
  }
  play?.addEventListener('click',()=>running?stop(false):startFilm());
  document.querySelectorAll('a[href="#film"]').forEach(link=>link.addEventListener('click',()=>{
    window.setTimeout(()=>{ if(!running) startFilm(); },450);
  }));
}

const revealObserver=new IntersectionObserver((entries)=>{
  entries.forEach((entry)=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12});

document.querySelectorAll('[data-reveal]').forEach(el=>revealObserver.observe(el));
