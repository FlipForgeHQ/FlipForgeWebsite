(()=>{
  const pathname=location.pathname.replace(/\/+$/,"")||"/";

  const enforceReadabilityFloor=()=>{
    document.querySelectorAll('main p, main li, main label, main button, main input, main select').forEach(el=>{
      const size=parseFloat(getComputedStyle(el).fontSize)||0;
      if(size>0&&size<12)el.style.fontSize='12px';
    });
  };
  enforceReadabilityFloor();

  // The header, menu and footer (links, labels, Beta Sign In, brand descriptor, copyright) are written in each page's
  // source; scripts/site-header.mjs owns the header, menu and Follow FlipForge column. Nothing here rewrites them.
  // On Netlify previews, never direct returning testers to a preview-origin login.
  if(/(?:^|\.)netlify\.app$/i.test(location.hostname)){
    const productionBetaSignIn='https://goflipforge.com/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start';
    document.querySelectorAll('a[href*="production-auth.html"]').forEach(link=>{
      link.href=productionBetaSignIn;
      link.title='Sign in on the live FlipForge website';
    });
  }
  enforceReadabilityFloor();

  const endpoint="/api/conversion-event";
  const sent=new Set();
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
    "/decision-intelligence.html":"decision-intelligence",
    "/decision-intelligence":"decision-intelligence",
    "/pricing.html":"launch-plans",
    "/pricing":"launch-plans",
    "/learn.html":"evidence-lab",
    "/learn":"evidence-lab",
    "/faq.html":"faq",
    "/faq":"faq",
    "/about.html":"about",
    "/about":"about"
  };
  const page=pages[pathname]||"legal";

  // First-touch campaign attribution: utm_source / utm_medium / utm_campaign / utm_content from the landing URL,
  // kept only in this tab's session storage and sent with funnel events and the beta application. Lowercase slugs
  // only; the server re-validates (known sources only) and drops anything else. Nothing else is stored; no visitor identifier.
  const CAMPAIGN_KEY="flipforge.campaign.v1";
  const CAMPAIGN_FIELDS=["utm_source","utm_medium","utm_campaign","utm_content"];
  const campaignOnly=source=>{
    const clean={};
    CAMPAIGN_FIELDS.forEach(key=>{const value=source&&source[key];if(typeof value==="string"&&/^[a-z0-9_-]{1,40}$/.test(value))clean[key]=value;});
    return clean.utm_source?clean:{};
  };
  const campaign=(()=>{
    try{const stored=campaignOnly(JSON.parse(sessionStorage.getItem(CAMPAIGN_KEY)||"null"));if(stored.utm_source)return stored;}catch{}
    const params=new URLSearchParams(location.search);
    const landing=campaignOnly(Object.fromEntries(CAMPAIGN_FIELDS.map(key=>[key,params.get(key)])));
    if(landing.utm_source){try{sessionStorage.setItem(CAMPAIGN_KEY,JSON.stringify(landing));}catch{}}
    return landing;
  })();

  const emit=(event,placement="unknown",once=false)=>{
    const key=`${event}:${page}:${placement}`;
    if(once&&sent.has(key))return;
    if(once)sent.add(key);
    const body=JSON.stringify({event,page,placement,...campaign});
    if(navigator.sendBeacon){
      const accepted=navigator.sendBeacon(endpoint,new Blob([body],{type:"application/json"}));
      if(accepted)return;
    }
    fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body,credentials:"same-origin",cache:"no-store",redirect:"error",keepalive:true}).catch(()=>{});
  };

  // Homepage experiences report counts only (which audience, which call, whether finished): no personal data.
  const experienceEvents=new Set(["audience_selected","challenge_answered","challenge_completed","demo_interacted","app_screen_viewed","hero_jump_clicked","section_viewed","beta_cta_clicked"]);
  const experiencePlacement=/^(audience-(flipper|investor|collector|dealer|grading)|challenge(-(buy|investigate|pass))?|demo|app-(discover|evaluate|receipt)|hero-(challenge|app)|inside-app)$/;
  document.addEventListener("ff:conversion",event=>{
    const detail=event.detail||{};
    if(!experienceEvents.has(detail.event)||!experiencePlacement.test(String(detail.placement||"")))return;
    emit(detail.event,detail.placement,detail.event==="demo_interacted");
  });

  const placementFor=link=>{
    if(link.closest(".site-header,.decision-header,.site-menu"))return"navigation";
    if(link.closest(".footer"))return"footer";
    if(link.closest(".ff-dossier-spotlight"))return"sample-spotlight";
    if(link.closest(".ff-evidence"))return"evidence";
    if(link.closest(".page-hero,.hero,.ffh,.ff10-hero,.decision-hero,.ff-dic-hero"))return"hero";
    return"page";
  };

  document.querySelectorAll('a[href$="beta-application.html"],a[href="/beta-application"]').forEach(link=>{
    link.addEventListener("click",()=>emit("beta_cta_clicked",placementFor(link)));
  });
  document.querySelectorAll('a[href="sample-decision-dossier.html"]').forEach(link=>{
    link.addEventListener("click",()=>emit("sample_dossier_clicked",placementFor(link)));
  });
  document.querySelectorAll('a[href="learn.html"],a[href="/learn"],a[href="/learn.html"]').forEach(link=>{
    link.addEventListener("click",()=>emit("evidence_lab_clicked",placementFor(link)));
  });
  document.querySelectorAll('a[href="decision-intelligence.html"],a[href="/decision-intelligence"],a[href="/decision-intelligence.html"]').forEach(link=>{
    link.addEventListener("click",()=>emit("decision_intelligence_clicked",placementFor(link)));
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
    // The founder sees which campaign post produced an application: the same validated slugs go with the submission.
    Object.entries(campaign).forEach(([name,value])=>{
      if(application.querySelector(`input[name="${name}"]`))return;
      const field=document.createElement("input");
      field.type="hidden";
      field.name=name;
      field.value=value;
      application.append(field);
    });
  }

  window.addEventListener('resize',enforceReadabilityFloor,{passive:true});

  if(page==="sample-dossier")emit("sample_dossier_viewed","sample-page",true);
  if(page==="application-received")emit("beta_application_received","post-submit",true);
  if(page==="beta-onboarding")emit("onboarding_guide_viewed","onboarding",true);
})();