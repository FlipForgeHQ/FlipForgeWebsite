(()=>{
  "use strict";
  const TERMS_VERSION="2026-08-15";
  const TERMS_URL="/beta-terms.html";
  const ENDPOINT="/api/beta/terms-acceptance";
  const PENDING_KEY="flipforge.betaTerms.pending.v1";
  let recording=false;

  function pending(){
    try{return JSON.parse(localStorage.getItem(PENDING_KEY)||"null")}catch{return null}
  }
  function markPending(){
    try{localStorage.setItem(PENDING_KEY,JSON.stringify({termsVersion:TERMS_VERSION,acceptedAt:new Date().toISOString()}))}catch{}
  }
  function clearPending(){try{localStorage.removeItem(PENDING_KEY)}catch{}}

  function ensureStyles(){
    if(document.getElementById("ff-beta-terms-gate-style"))return;
    const style=document.createElement("style");
    style.id="ff-beta-terms-gate-style";
    style.textContent=`
      .ff-id-terms{display:grid;gap:7px;border:1px solid rgba(212,175,55,.3);border-radius:10px;background:rgba(212,175,55,.06);padding:11px 12px;margin:2px 0}.ff-id-terms label{display:flex!important;grid-template-columns:none!important;align-items:flex-start;gap:9px!important;font-size:12px!important;line-height:1.45;font-weight:700!important}.ff-id-terms input{width:auto!important;margin-top:2px}.ff-id-terms a{color:#d4af37;font-weight:900}.ff-id-terms-error{margin:0!important;color:#ff9aa5!important;font-size:11px!important}
      .ff-terms-finalize{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:rgba(3,8,18,.94);padding:24px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f2f2f2}.ff-terms-finalize-card{width:min(520px,100%);border:1px solid rgba(212,175,55,.42);border-radius:16px;background:#07111f;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.55)}.ff-terms-finalize-card h2{margin:0 0 8px}.ff-terms-finalize-card p{margin:0 0 14px;color:#b8c1cb;line-height:1.55}.ff-terms-finalize-actions{display:flex;gap:10px;flex-wrap:wrap}.ff-terms-finalize button{border:1px solid #d4af37;border-radius:9px;background:#d4af37;color:#030812;padding:10px 13px;font-weight:900;cursor:pointer}.ff-terms-finalize button[data-secondary]{background:transparent;color:#f2f2f2;border-color:#465365}
    `;
    document.head.appendChild(style);
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
    if(!snapshot?.authenticated||!snapshot?.membershipActive)return;
    recording=true;
    overlay("Recording your acceptance of the Private Beta Terms before the workspace opens.");
    try{
      const response=await fetch(ENDPOINT,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,termsVersion:TERMS_VERSION})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"TERMS_RECORD_FAILED");
      clearPending();
      document.querySelector("[data-beta-terms-finalize]")?.remove();
    }catch(error){
      overlay("Your account invitation was accepted, but FlipForge could not yet record the Beta Terms receipt. Retry before continuing. No payment or transaction authority was created.",true);
    }finally{recording=false}
  }

  window.addEventListener("flipforge:identity-change",recordAcceptance);
  const observer=new MutationObserver(()=>{enhanceInvite();recordAcceptance()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",()=>{enhanceInvite();recordAcceptance()},{once:true});
  enhanceInvite();
  recordAcceptance();
})();
