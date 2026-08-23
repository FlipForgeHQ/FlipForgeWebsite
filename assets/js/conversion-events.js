(()=>{
  const normalizeMarketingShell=()=>{
    document.querySelectorAll('a[href="pricing.html"]').forEach(link=>{
      if(link.textContent.trim()==='Pricing')link.textContent='Launch Plans';
    });

    const addEvidenceLink=container=>{
      if(!container||container.querySelector('a[href="learn.html"]'))return;
      const link=document.createElement('a');
      link.href='learn.html';
      link.textContent='Evidence Lab';
      const anchor=container.querySelector('a[href="faq.html"],a[href="about.html"],[data-app-preview]');
      if(anchor)container.insertBefore(link,anchor);
      else container.append(link);
    };

    addEvidenceLink(document.querySelector('.desktop-nav'));
    addEvidenceLink(document.querySelector('.mobile-nav'));
    document.querySelectorAll('.footer-links').forEach(group=>{
      if(group.querySelector('a[href="product.html"]'))addEvidenceLink(group);
    });

    const copyright=document.querySelector('.copyright');
    if(copyright&&copyright.textContent.includes('Planned pricing and beta capabilities')){
      copyright.textContent=copyright.textContent.replace('Planned pricing and beta capabilities','Launch plans and beta capabilities');
    }
  };
  normalizeMarketingShell();

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
    "/pricing.html":"launch-plans",
    "/pricing":"launch-plans",
    "/learn.html":"evidence-lab",
    "/learn":"evidence-lab",
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
    if(link.closest(".ff-evidence"))return"evidence";
    if(link.closest(".page-hero,.hero"))return"hero";
    return"page";
  };

  document.querySelectorAll('a[href$="beta-application.html"],a[href="/beta-application"]').forEach(link=>{
    link.addEventListener("click",()=>emit("beta_cta_clicked",placementFor(link)));
  });
  document.querySelectorAll('a[href="sample-decision-dossier.html"]').forEach(link=>{
    link.addEventListener("click",()=>emit("sample_dossier_clicked",placementFor(link)));
  });
  document.querySelectorAll('a[href="learn.html"]').forEach(link=>{
    link.addEventListener("click",()=>emit("evidence_lab_clicked",placementFor(link)));
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
