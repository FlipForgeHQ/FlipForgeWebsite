/* Beta Dashboard "Start here" panel. UI only: never correct identities, call providers, or save evidence. */
(()=>{"use strict";
// The Discover guided card builder is rendered by the Discover owner (customer-discovery.js). This file keeps only the
// Dashboard "Start here" panel.
const MAIN='#main-content';
const route=()=>String(location.hash||'#/dashboard').replace(/^#\/?/,'').split(/[/?]/)[0]||'dashboard';
function addDashboard(main){
 if(route()!=='dashboard')return;
 const root=main.querySelector('[data-commercial-dashboard-v2],.ffv3-root');
 if(!root||root.querySelector('[data-ffguided-home]'))return;
 // Preserve the governed V3 command bar, dossier and first-screen economics exactly.
 // Discover remains highlighted in the persistent nav and existing topbar action.
 if(!root.matches('[data-commercial-dashboard-v2]'))return;
 if(!root.querySelector('.ff-kpi-grid,.ff-dashboard-main-grid'))return; // keep login/error states distinct
 const panel=document.createElement('section');panel.className='ffguided-home';panel.dataset.ffguidedHome='';panel.setAttribute('aria-label','Start a card decision');
 panel.innerHTML='<div class="ffguided-home-copy"><span>START HERE</span><h2>What card are you considering?</h2>'+
  '<p>Find the exact card, check the evidence and understand your next move.</p>'+
  '<a href="#/discover" class="button button-primary ffguided-home-cta">◇ Evaluate a card →</a></div>'+
  '<div class="ffguided-home-steps"><div><b>01</b><span>Find the exact card</span></div>'+
  '<div><b>02</b><span>Check the evidence</span></div><div><b>03</b><span>Understand the decision</span></div></div>'+
  '<div class="ffguided-home-footer"><a href="#/opportunities">Saved Decisions →</a>'+
  '<button type="button" data-ffguided-more aria-expanded="false">Show full dashboard ↓</button></div>';
 root.prepend(panel);
 {
  root.dataset.ffguidedFocus='simple';
  const more=panel.querySelector('[data-ffguided-more]');
  more.addEventListener('click',()=>{const open=root.dataset.ffguidedFocus==='full';root.dataset.ffguidedFocus=open?'simple':'full';
   more.setAttribute('aria-expanded',String(!open));more.textContent=open?'Show full dashboard ↓':'Hide dashboard details ↑';});
 }
}
let queued=false;
function enhance(){if(!/^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i.test(location.pathname))return;
 const main=document.querySelector(MAIN);if(!main)return;addDashboard(main);}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}
function init(){const main=document.querySelector(MAIN);if(!main)return;new MutationObserver(queue).observe(main,{childList:true});
 window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);queue();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();