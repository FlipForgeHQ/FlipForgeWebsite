(()=>{
  "use strict";
  const TERMS_VERSION="2026-08-15";
  const TERMS_URL="/beta-terms.html";
  const ENDPOINT="/api/beta/terms-acceptance";
  const PENDING_KEY="flipforge.betaTerms.pending.v1";
  const BETA_START_URL="/app/beta/#/beta-start";
  let recording=false;

  function pending(){
    try{return JSON.parse(localStorage.getItem(PENDING_KEY)||"null")}catch{return null}
  }
  function markPending(){
    try{localStorage.setItem(PENDING_KEY,JSON.stringify({termsVersion:TERMS_VERSION,acceptedAt:new Date().toISOString()}))}catch{}
  }
  function clearPending(){try{localStorage.removeItem(PENDING_KEY)}catch{}}

  // Styling is served from /assets/css/flipforge-identity-v1.css. Invitation emails
  // land on the homepage, whose Content-Security-Policy (style-src 'self') blocks
  // injected <style> elements.
  function ensureStyles(){
    if(document.getElementById("flipforge-identity-style")||document.querySelector('link[rel="stylesheet"][href$="/assets/css/flipforge-identity-v1.css"]'))return;
    const link=document.createElement("link");
    link.id="flipforge-identity-style";
    link.rel="stylesheet";
    link.href="/assets/css/flipforge-identity-v1.css";
    document.head.appendChild(link);
  }

  function inviteForm(){return document.querySelector("[data-ff-identity-invite]")}
  function enhanceInvite(){
    const form=inviteForm();
    if(!form||form.dataset.betaTermsGated==="true")return;
    ensureStyles();
    form.dataset.betaTermsGated="true";
    const actions=form.querySelector(".ff-id-actions");
    const box=document.createElement("div");
    box.className="ff-id-terms";
    box.innerHTML=`<label><input type="checkbox" data-beta-terms-accept required><span>I have read and agree to the <a href="${TERMS_URL}" target="_blank" rel="noopener">FlipForge Private Beta Terms</a>. I understand FlipForge is experimental decision support and does not guarantee a purchase outcome, profit, or grade.</span></label><p class="ff-id-terms-error" data-beta-terms-error hidden>Please accept the Private Beta Terms before activating your account.</p>`;
    actions?.insertAdjacentElement("beforebegin",box);
  }

  document.addEventListener("submit",event=>{
    const form=event.target.closest?.("[data-ff-identity-invite]");
    if(!form)return;
    const checkbox=form.querySelector("[data-beta-terms-accept]");
    const error=form.querySelector("[data-beta-terms-error]");
    if(!checkbox?.checked){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(error)error.hidden=false;
      checkbox?.focus();
      return;
    }
    if(error)error.hidden=true;
    markPending();
  },true);

  function overlay(message,error=false){
    ensureStyles();
    let root=document.querySelector("[data-beta-terms-finalize]");
    if(!root){
      root=document.createElement("div");
      root.className="ff-terms-finalize";
      root.dataset.betaTermsFinalize="";
      document.body.appendChild(root);
    }
    root.innerHTML=`<section class="ff-terms-finalize-card" role="status"><h2>${error?"Beta Terms confirmation needs attention":"Finalizing your beta access"}</h2><p>${message}</p>${error?'<div class="ff-terms-finalize-actions"><button type="button" data-beta-terms-retry>Retry</button><button type="button" data-secondary data-beta-terms-signout>Sign out</button></div>':""}</section>`;
    root.querySelector("[data-beta-terms-retry]")?.addEventListener("click",recordAcceptance);
    root.querySelector("[data-beta-terms-signout]")?.addEventListener("click",async()=>{await window.FlipForgeIdentity?.signOut?.();window.location.assign("/")});
  }

  async function recordAcceptance(){
    const intent=pending();
    if(!intent||recording)return;
    const snapshot=window.FlipForgeIdentity?.getSnapshot?.();
    if(!snapshot?.authenticated)return;
    recording=true;
    overlay("Recording your acceptance of the Private Beta Terms before the workspace opens.");
    try{
      const response=await fetch(ENDPOINT,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,termsVersion:TERMS_VERSION})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"TERMS_RECORD_FAILED");
      await window.FlipForgeIdentity?.refresh?.().catch?.(()=>{});
      clearPending();
      document.querySelector("[data-beta-terms-finalize]")?.remove();
      if(String(window.location.pathname||"")!=="/app/customer/"||String(window.location.hash||"")!=="#/beta-start")window.location.assign(BETA_START_URL);
    }catch(error){
      overlay("Your account invitation was accepted, but FlipForge could not yet finish the Beta Terms receipt and access promotion. Retry before continuing. No payment or transaction authority was created.",true);
    }finally{recording=false}
  }

  window.addEventListener("flipforge:identity-change",recordAcceptance);
  const observer=new MutationObserver(()=>{enhanceInvite();recordAcceptance()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",()=>{enhanceInvite();recordAcceptance()},{once:true});
  enhanceInvite();
  recordAcceptance();
})();
