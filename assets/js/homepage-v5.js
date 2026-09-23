const film=document.querySelector('[data-film]');
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
function show(i){scenes.forEach((s,n)=>s.classList.toggle('active',n===i));vo.textContent=voice[i]}
function fmt(n){return '00:'+String(Math.max(0,Math.min(30,Math.floor(n)))).padStart(2,'0')}
function stop(reset=false){if(timer)clearInterval(timer);timer=null;running=false;play.textContent='▶';if(reset){elapsed=0;progress.style.width='0%';time.textContent='00:00 / 00:30';show(0)}}
function start(){
  stop(false);running=true;play.textContent='Ⅱ';const base=Date.now()-elapsed*1000;
  timer=setInterval(()=>{
    elapsed=(Date.now()-base)/1000;const t=Math.min(elapsed,30);
    progress.style.width=(t/30*100)+'%';time.textContent=fmt(t)+' / 00:30';
    let idx=0;starts.forEach((s,i)=>{if(t>=s)idx=i});show(idx);
    if(t>=30)stop(true)
  },100)
}
play.addEventListener('click',()=>running?stop(false):start());

const cases={
 exact:{record:'2018 Topps Chrome #150 · Refractor · PSA 10',title:'This comparison belongs.',copy:'Year, set, card number, parallel, grader, and grade match the target.',rule:'Allowed:',effect:'this evidence may support the decision.',color:'#D4AF37'},
 parallel:{record:'2018 Topps Chrome #150 · Prism Refractor · PSA 10',title:'Wrong parallel.',copy:'The evidence record is not the same parallel as the target card.',rule:'Blocked:',effect:'this comparison cannot influence supported value.',color:'#d88b8b'},
 grade:{record:'2018 Topps Chrome #150 · Refractor · PSA 9',title:'Wrong grade.',copy:'The evidence record is PSA 9. The target card is PSA 10.',rule:'Blocked:',effect:'this comparison cannot influence the target-grade decision.',color:'#d88b8b'}
};
const tabs=[...document.querySelectorAll('[data-case]')],rec=document.querySelector('[data-record]'),ttl=document.querySelector('[data-title]'),cpy=document.querySelector('[data-copy]'),rle=document.querySelector('[data-rule]'),eff=document.querySelector('[data-effect]');
function render(k){const d=cases[k];tabs.forEach(b=>b.classList.toggle('active',b.dataset.case===k));rec.textContent=d.record;ttl.textContent=d.title;ttl.style.color=d.color;cpy.textContent=d.copy;rle.textContent=d.rule;rle.style.color=d.color;eff.textContent=d.effect}
tabs.forEach(b=>b.addEventListener('click',()=>render(b.dataset.case)));

const revealObserver=new IntersectionObserver((entries)=>{
  entries.forEach((entry)=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12});
document.querySelectorAll('[data-reveal]').forEach(el=>revealObserver.observe(el));
