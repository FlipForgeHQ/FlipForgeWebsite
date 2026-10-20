/* FlipForge public cinematic introduction: one 24s muted, browser-rendered product film.
   No external media, provider calls, persistence, app session, or financial claims. */
(() => {
 'use strict';
 const root=document.querySelector('[data-ff9-film]');
 if(!root)return;
 const stages=[
  {k:'THE TRUST GAP',h:'FIVE APPS.<br><em>FIVE PRICES.</em>',s:'Still one unanswered question: is this actually a good buy?',signal:'PRICE ≠ PROOF'},
  {k:'THE MISLEADING SHORTCUT',h:'ASKING PRICE<br><em>ISN’T A SALE.</em>',s:'A number displayed in an app or listing does not prove a completed transaction.',signal:'VERIFY THE SOURCE'},
  {k:'EXACT-CARD IDENTITY',h:'CLOSE ENOUGH<br><em>IS NOT EXACT.</em>',s:'Year. Set. Number. Parallel. Grade. Get the identity right before trusting the comparison.',signal:'IDENTITY FIRST'},
  {k:'EVIDENCE INTELLIGENCE',h:'ACCEPT.<br><em>HOLD. EXCLUDE.</em>',s:'Different grades, unverified outcomes and mismatched cards should not quietly count as qualified evidence.',signal:'REASONS STAY VISIBLE'},
  {k:'THE FINANCIAL DECISION',h:'$425 ASK.<br><em>$360 MAX BUY.</em>',s:'In this hypothetical scenario, costs and a target margin leave a $65 gap.',signal:'+$65 OVER THRESHOLD'},
  {k:'CLEAR DECISIONS, NOT PRICE NOISE',h:'PASS.<br><em>KNOW WHY.</em>',s:'A supported buying limit, visible assumptions and a reason—not one more unexplained price.',signal:'BEFORE YOU BUY. KNOW WHY.'}
 ];
 const full=24000, scene=4000;
 const stage=root.querySelector('.ff9-film-stage');
 const kicker=root.querySelector('[data-ff9-kicker]');
 const headline=root.querySelector('[data-ff9-headline]');
 const sub=root.querySelector('[data-ff9-sub]');
 const signal=root.querySelector('[data-ff9-signal]');
 const time=root.querySelector('[data-ff9-time]');
 const progress=root.querySelector('[data-ff9-progress]');
 const bar=root.querySelector('[data-ff9-bar]');
 const play=root.querySelector('[data-ff9-play]');
 const toggle=root.querySelector('[data-ff9-toggle]');
 const replay=root.querySelector('[data-ff9-replay]');
 const playSymbol=root.querySelector('[data-ff9-play-symbol]');
 const toggleSymbol=root.querySelector('[data-ff9-toggle-symbol]');
 const watch=document.querySelector('[data-ff9-watch]');
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 let elapsed=0,playing=false,started=false,raf=0,last=0,current=-1,observer;
 function paint(force=false){
   const index=Math.min(stages.length-1,Math.floor(elapsed/scene));
   if(index!==current||force){
     const data=stages[index];current=index;
     root.removeAttribute('data-ff9-active');
     stage.dataset.ff9Stage=String(index);root.dataset.ff9Stage=String(index);
     kicker.textContent=data.k;
     headline.innerHTML=data.h; // hard-coded trusted local strings only
     sub.textContent=data.s;
     signal.textContent=data.signal;
     if(!reduce.matches){void stage.offsetWidth;root.setAttribute('data-ff9-active','');}
   }
   time.textContent='0:'+String(Math.floor(elapsed/1000)).padStart(2,'0');
   const pct=Math.max(0,Math.min(100,100*elapsed/full));
   bar.style.width=pct.toFixed(3)+'%';
   progress.setAttribute('aria-valuenow',String(Math.floor(elapsed/1000)));
   const label=playing?'Pause introduction':'Play introduction';
   play.setAttribute('aria-label',label);
   toggle.setAttribute('aria-label',label);
   playSymbol.textContent=playing?'Ⅱ':'▶';
   toggleSymbol.textContent=playing?'Ⅱ':'▶';
   if(playing)root.removeAttribute('data-ff9-paused');else root.setAttribute('data-ff9-paused','');
 }
 function tick(t){
   if(!playing)return;
   if(last){elapsed=Math.min(full,elapsed+Math.max(0,Math.min(150,t-last)));}
   last=t;paint();
   if(elapsed>=full){playing=false;last=0;paint();return;}
   raf=requestAnimationFrame(tick);
 }
 function pause(){playing=false;cancelAnimationFrame(raf);last=0;paint();}
 function start(reset=false){
   if(reset||elapsed>=full){elapsed=0;current=-1;}
   started=true;playing=true;last=0;paint(true);
   cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
 }
 function togglePlay(){if(playing)pause();else start();}
 play.addEventListener('click',togglePlay);
 toggle.addEventListener('click',togglePlay);
 replay.addEventListener('click',()=>start(true));
 if(watch)watch.addEventListener('click',()=>start(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});
 reduce.addEventListener?.('change',()=>{if(reduce.matches&&playing)pause();});
 paint(true);
 if(reduce.matches)return; // motion-sensitive visitors can press Play themselves
 if('IntersectionObserver' in window){
   observer=new IntersectionObserver(entries=>{
     if(!started&&!document.hidden&&entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.3)){
       observer.disconnect();start();
     }
   },{threshold:[.3]});
   observer.observe(root);
 }else if(!document.hidden){start();}
})();