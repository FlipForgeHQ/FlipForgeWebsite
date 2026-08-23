(()=>{
  const endpoint="/api/conversion-event";
  const sent=new Set();
  const pathname=location.pathname.replace(/\/+$/,"")||"/";
  const pages={
    "/":"home",
    "/index.html":"home",
    "/sample-decision-dossier.html":"sample-dossier",
    "/sample-decision-dossier":"sample-dossier",
    "/beta-application.html":"beta-application",
    "/beta-application":"beta-application",
    "/thank-you.html":"application-received",
    "/thank-you":"application-received",
    "/beta-onboarding.html":"beta-onboarding",
    "/beta-onboarding":"beta-onboarding",
    "/product.html":"product",
    "/product":"product",
    "/pricing.html":"pricing",
    "/pricing":"pricing",
    "/learn.html":"learn",
    "/learn":"learn",
    "/faq.html":"faq",
    "/faq":"faq",
    "/about.html":"about",
    "/about":"about",
  };
  const page=pages[pathname]||"legal";

  const emit=(event,placement="unknown",once=false)=>{
    const key=`${event}:${page}:${placement}`;
    if(once&&sent.has(key))return;
    if(once)sent.add(key);
    const body=JSON.stringify({event,page,placement});
    if(navigator.sendBeacon){
      const accepted=navigator.sendBeacon(endpoint,new Blob([body],{type:"application/json"}));
      if(accepted)return;
    }
    fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body,credentials:"same-origin",cache:"no-store",redirect:"error",keepalive:true}).catch(()=>{});
  };

  const placementFor=link=>{
    if(link.closest(".site-header,.mobile-nav"))return"navigation";
    if(link.closest(".footer"))return"footer";
    if(link.closest(".ff-dossier-spotlight"))return"sample-spotlight";
    if(link.closest(".page-hero,.hero"))return"hero";
    return"page";
  };

  document.querySelectorAll('a[href$="beta-application.html"],a[href="/beta-application"]').forEach(link=>{
    link.addEventListener("click",()=>emit("beta_cta_clicked",placementFor(link)));
  });
  document.querySelectorAll("[data-app-preview]").forEach(link=>{
    link.addEventListener("click",()=>emit("app_preview_clicked",placementFor(link)));
  });
  document.querySelectorAll("[data-onboarding-guide]").forEach(link=>{
    link.addEventListener("click",()=>emit("onboarding_guide_clicked","post-submit"));
  });
  document.querySelectorAll("[data-onboarding-workspace]").forEach(link=>{
    link.addEventListener("click",()=>emit("onboarding_workspace_clicked","onboarding"));
  });

  const application=document.querySelector("[data-beta-application-form]");
  if(application){
    const started=()=>emit("beta_form_started","form",true);
    application.addEventListener("input",started,{once:true});
    application.addEventListener("change",started,{once:true});
  }

  if(page==="sample-dossier")emit("sample_dossier_viewed","sample-page",true);
  if(page==="application-received")emit("beta_application_received","post-submit",true);
  if(page==="beta-onboarding")emit("onboarding_guide_viewed","onboarding",true);
})();
