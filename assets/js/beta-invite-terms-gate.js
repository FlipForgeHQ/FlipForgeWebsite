(()=>{
  "use strict";
  // FlipForge Private Beta Terms consent during invitation activation.
  //
  // Consent rules (2026-10-16 activation-safety fix):
  // - Consent ticked on the invitation form lives in this page's memory only. It is never
  //   written to browser storage, so it cannot survive a reload or reach another account.
  // - It is used at most once, and only for the account the invitation just activated: the
  //   identity client passes that account's id and the request carries it, so the server can
  //   refuse a session that belongs to anyone else.
  // - A failed or abandoned activation discards it.
  // - Nothing here submits on its own. A failed request stops; retrying is a manual action,
  //   and an HTTP 401 sends the tester to sign in again instead of retrying.
  // When consent cannot be bound to the activated account, the tester accepts the Terms
  // again explicitly on the Private Beta sign-in page.
  const TERMS_VERSION="2026-08-15";
  const TERMS_URL="/beta-terms.html";
  const ENDPOINT="/api/beta/terms-acceptance";
  const SIGN_IN_URL="/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
  const BETA_START_URL="/app/beta/#/beta-start";
  // Written by earlier versions of this gate. It was not tied to any account; remove it and never read it.
  const LEGACY_PENDING_KEY="flipforge.betaTerms.pending.v1";

  let consent=null;        // { termsVersion } captured from this page's invitation form
  let boundAttempt=null;   // { userId, termsVersion } after the activation consumed the consent
  let requestInFlight=false;

  function purgeLegacyMarker(){try{localStorage.removeItem(LEGACY_PENDING_KEY)}catch{}}
  purgeLegacyMarker();

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
      consent=null;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(error)error.hidden=false;
      checkbox?.focus();
      return;
    }
    if(error)error.hidden=true;
    consent={termsVersion:TERMS_VERSION};
  },true);

  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

  function removeOverlay(){document.querySelector("[data-beta-terms-finalize]")?.remove()}

  // mode: "working" | "retry" | "signin"
  function overlay(mode,message){
    ensureStyles();
    let root=document.querySelector("[data-beta-terms-finalize]");
    if(!root){
      root=document.createElement("div");
      root.className="ff-terms-finalize";
      root.dataset.betaTermsFinalize="";
      document.body.appendChild(root);
    }
    root.dataset.state=mode;
    const title=mode==="working"?"Finalizing your beta access":mode==="signin"?"Sign in again to finish":"Beta Terms confirmation needs attention";
    const actions=mode==="retry"
      ?'<div class="ff-terms-finalize-actions"><button type="button" data-beta-terms-retry>Retry</button><button type="button" data-secondary data-beta-terms-signin>Sign in again</button></div>'
      :mode==="signin"
      ?'<div class="ff-terms-finalize-actions"><button type="button" data-beta-terms-signin>Sign in again</button></div>'
      :"";
    root.innerHTML=`<section class="ff-terms-finalize-card" role="${mode==="working"?"status":"alert"}"><h2>${title}</h2><p>${escapeHtml(message)}</p>${actions}</section>`;
    root.querySelector("[data-beta-terms-retry]")?.addEventListener("click",()=>{void retry()});
    root.querySelector("[data-beta-terms-signin]")?.addEventListener("click",()=>{void signInAgain()});
  }

  // Safe reauthentication: end the browser session whose server cookie was rejected, then use
  // the Private Beta sign-in page. The account's onboarding state lives on the server and is
  // untouched; after signing in, that page offers the Terms acceptance explicitly.
  async function signInAgain(){
    boundAttempt=null;
    try{await window.FlipForgeIdentity?.signOut?.()}catch{}
    window.location.assign(SIGN_IN_URL);
  }

  function currentUserId(){return String(window.FlipForgeIdentity?.getUser?.()?.id||"")}

  async function submit(attempt){
    if(requestInFlight)return {status:"IN_PROGRESS"};
    // The account signed in now must still be the account that gave this consent.
    const signedIn=currentUserId();
    if(!attempt.userId||!signedIn){
      boundAttempt=null;
      overlay("signin","Your account is activated, but this browser is not signed in with FlipForge. Sign in again; you will be asked to accept the Private Beta Terms there. No payment or transaction authority was created.");
      return {status:"SESSION_REQUIRED",reason:"SIGNED_OUT"};
    }
    if(signedIn!==attempt.userId){
      boundAttempt=null;
      overlay("signin","The signed-in account changed, so the Terms acceptance from your invitation was not used. Sign in to the account you activated and accept the Private Beta Terms there.");
      return {status:"ACCOUNT_CHANGED"};
    }
    requestInFlight=true;
    overlay("working","Recording your acceptance of the Private Beta Terms before the workspace opens.");
    try{
      const session=await window.FlipForgeIdentity?.establishServerSession?.(attempt.userId);
      if(!session?.ok){
        boundAttempt=null;
        overlay("signin","Your account is activated, but this browser's sign-in is not valid with FlipForge yet. Sign in again; you will be asked to accept the Private Beta Terms there. No payment or transaction authority was created.");
        return {status:"SESSION_REQUIRED",reason:session?.reason||"UNAVAILABLE"};
      }
      let response;
      try{
        response=await fetch(ENDPOINT,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,termsVersion:attempt.termsVersion,identityUserId:attempt.userId})});
      }catch{
        overlay("retry","FlipForge could not reach the server to save your Private Beta Terms acceptance. Check your connection, then select Retry.");
        return {status:"FAILED",reason:"NETWORK"};
      }
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload?.activated!==false){
        boundAttempt=null;
        removeOverlay();
        return {status:"RECORDED"};
      }
      if(response.status===401){
        boundAttempt=null;
        overlay("signin","Your sign-in was not accepted by FlipForge. Sign in again; you will be asked to accept the Private Beta Terms there. No payment or transaction authority was created.");
        return {status:"SESSION_REQUIRED",reason:"HTTP_401"};
      }
      const reason=String(payload?.reason||`HTTP_${response.status}`);
      if(reason==="TERMS_ACCOUNT_MISMATCH"||reason==="APPLICATION_IDENTITY_MISMATCH"){
        boundAttempt=null;
        overlay("signin","FlipForge saw a different signed-in account than the one you activated, so nothing was recorded. Sign in again to the activated account to accept the Private Beta Terms.");
        return {status:"ACCOUNT_CHANGED",reason};
      }
      overlay("retry",`Your account invitation was accepted, but FlipForge could not yet finish the Beta Terms receipt and access promotion (${reason}). Select Retry, or sign in again. No payment or transaction authority was created.`);
      return {status:"FAILED",reason};
    }finally{
      requestInFlight=false;
    }
  }

  async function retry(){
    if(!boundAttempt){overlay("signin","Sign in again to accept the Private Beta Terms.");return {status:"SESSION_REQUIRED"}}
    const outcome=await submit(boundAttempt);
    if(outcome.status==="RECORDED"&&(!/^\/app\/beta\/?$/i.test(String(window.location.pathname||""))||String(window.location.hash||"")!=="#/beta-start"))window.location.assign(BETA_START_URL);
    return outcome;
  }

  // Called by the identity client exactly once, after acceptInvite succeeded, with the id of
  // the account that was activated. Never throws.
  async function completeActivation(userId){
    const captured=consent;
    consent=null;
    if(!captured)return {status:"NO_CONSENT"};
    boundAttempt={userId:String(userId||""),termsVersion:captured.termsVersion};
    try{return await submit(boundAttempt)}catch{
      overlay("retry","FlipForge could not finish saving your Private Beta Terms acceptance. Select Retry, or sign in again.");
      return {status:"FAILED",reason:"UNEXPECTED"};
    }
  }

  window.FlipForgeBetaTermsGate=Object.freeze({
    completeActivation,
    discardActivationConsent:()=>{consent=null},
    hasActivationConsent:()=>Boolean(consent),
    // Kept for older callers: true only while this page holds unused activation consent.
    awaitingAcceptance:()=>Boolean(consent)
  });

  // The observer only adds the Terms checkbox to a newly rendered invitation form. It never
  // submits anything, so re-rendering cannot cause a request.
  const observer=new MutationObserver(()=>enhanceInvite());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",enhanceInvite,{once:true});
  enhanceInvite();
})();
