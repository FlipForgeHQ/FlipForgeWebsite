(()=>{
  "use strict";
  const ENDPOINT="/api/beta/founder-select";
  const DEFAULT_COHORT="wave-1-sep-2026";

  function esc(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;")}
  function workspace(){return document.querySelector("[data-operator-workspace]")}
  function refreshButton(){return document.querySelector("[data-operator-refresh]")}

  function ensureStyles(){
    if(document.getElementById("ff-founder-select-style"))return;
    const style=document.createElement("style");
    style.id="ff-founder-select-style";
    style.textContent=`
      .ff-founder-select-panel{margin:0 0 22px;border:1px solid rgba(212,175,55,.34);border-radius:16px;background:linear-gradient(180deg,rgba(212,175,55,.07),rgba(7,17,31,.75));padding:20px}
      .ff-founder-select-panel header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.ff-founder-select-panel h2{margin:3px 0 4px;font-size:20px}.ff-founder-select-panel p{margin:0;color:#aeb8c5;line-height:1.5}.ff-founder-select-form{display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:12px;align-items:end}.ff-founder-select-form label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#d9dee6}.ff-founder-select-form input{width:100%;border:1px solid #394657;border-radius:9px;background:#030812;color:#f2f2f2;padding:11px 12px;font:inherit}.ff-founder-select-form button{border:1px solid #d4af37;border-radius:9px;background:#d4af37;color:#030812;padding:11px 14px;font-weight:900;cursor:pointer}.ff-founder-select-form button:disabled{opacity:.55;cursor:not-allowed}.ff-founder-select-note{grid-column:1/-1}.ff-founder-select-status{grid-column:1/-1;margin:2px 0 0!important;font-size:12px}.ff-founder-select-status[data-error="true"]{color:#ff9aa5}.ff-founder-select-status[data-error="false"]{color:#9de4c5}.ff-founder-select-badge{display:inline-flex;border:1px solid rgba(212,175,55,.48);border-radius:999px;padding:5px 9px;color:#e4c75c;font-size:11px;font-weight:900;white-space:nowrap}
      @media(max-width:900px){.ff-founder-select-form{grid-template-columns:1fr 1fr}.ff-founder-select-form button{grid-column:1/-1}}@media(max-width:620px){.ff-founder-select-panel header{display:grid}.ff-founder-select-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mount(){
    const root=workspace();
    if(!root||document.querySelector("[data-founder-select-panel]"))return;
    ensureStyles();
    const titlebar=root.querySelector(".ff-operator-titlebar");
    if(!titlebar)return;
    const panel=document.createElement("section");
    panel.className="ff-founder-select-panel";
    panel.dataset.founderSelectPanel="";
    panel.innerHTML=`
      <header><div><span class="ff-operator-kicker">Direct invitation</span><h2>Add a founder-selected tester</h2><p>Skip the public application questions without skipping beta controls. The tester is added as approved, then you send the normal Identity invitation. Beta Terms must be accepted before account activation completes.</p></div><span class="ff-founder-select-badge">Wave 1</span></header>
      <form class="ff-founder-select-form" data-founder-select-form>
        <label>Name<input name="fullName" maxlength="120" autocomplete="off" required placeholder="Tester name"></label>
        <label>Email<input name="email" type="email" maxlength="254" autocomplete="off" required placeholder="name@example.com"></label>
        <label>Beta test group<input name="cohort" maxlength="48" value="${esc(DEFAULT_COHORT)}" required></label>
        <label class="ff-founder-select-note">Internal note<input name="note" maxlength="500" autocomplete="off" placeholder="Optional: why this tester was selected"></label>
        <button type="submit">Add founder-selected tester</button>
        <p class="ff-founder-select-status" data-founder-select-status role="status" aria-live="polite"></p>
      </form>`;
    titlebar.insertAdjacentElement("afterend",panel);

    panel.querySelector("[data-founder-select-form]").addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const button=form.querySelector("button[type=submit]");
      const status=form.querySelector("[data-founder-select-status]");
      const data=new FormData(form);
      button.disabled=true;
      status.dataset.error="false";
      status.textContent="Adding tester…";
      try{
        const response=await fetch(ENDPOINT,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName:data.get("fullName"),email:data.get("email"),cohort:data.get("cohort"),note:data.get("note")})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.reason||"FOUNDER_SELECTED_CREATE_FAILED");
        status.textContent="Tester added as APPROVED. Refreshing the queue—then select them and click Send Identity Invitation.";
        form.reset();
        form.elements.cohort.value=DEFAULT_COHORT;
        refreshButton()?.click();
      }catch(error){
        const messages={TESTER_ALREADY_EXISTS:"That email already has a beta record. Search the Applications list instead of creating another.",EMAIL_INVALID:"Enter a valid email address.",NAME_REQUIRED:"Enter the tester's name.",COHORT_REQUIRED:"Enter a valid beta test group.",OPERATOR_ROLE_REQUIRED:"Your signed-in account does not have the FlipForge operator role."};
        status.dataset.error="true";
        status.textContent=messages[error.message]||"The tester was not added. The operation failed closed.";
      }finally{button.disabled=false}
    });
  }

  const observer=new MutationObserver(mount);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
  document.addEventListener("DOMContentLoaded",mount,{once:true});
  mount();
})();
