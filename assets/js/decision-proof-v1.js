(()=>{
  const sections=[...document.querySelectorAll('[data-ff-decision-proof]')];
  if(!sections.length)return;

  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reveal=section=>{
    if(section.dataset.ffProofSeen==='true')return;
    section.dataset.ffProofSeen='true';
    const track=section.querySelector('[data-ff-proof-progress]');
    if(!track)return;
    const target=Math.max(0,Math.min(100,Number(track.dataset.ffProofProgress)||0));
    if(reduced){track.style.width=target+'%';return;}
    track.style.width='0%';
    requestAnimationFrame(()=>{
      track.style.transition='width 680ms cubic-bezier(.2,.8,.2,1)';
      track.style.width=target+'%';
    });
  };

  if(!('IntersectionObserver' in window)){
    sections.forEach(reveal);
    return;
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.18});
  sections.forEach(section=>observer.observe(section));
})();
