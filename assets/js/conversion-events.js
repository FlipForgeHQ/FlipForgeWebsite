(()=>{
  const enforceReadabilityFloor=()=>{
    document.querySelectorAll('main p, main li, main label, main button, main input, main select').forEach(el=>{
      const size=parseFloat(getComputedStyle(el).fontSize)||0;
      if(size>0&&size<12)el.style.fontSize='12px';
    });
  };
  enforceReadabilityFloor();

  const normalizeMarketingShell=()=>{
    const normalizedPath=link=>{
      try{
        const path=new URL(link.getAttribute('href')||'',location.href).pathname
          .replace(/\/index\.html$/,'/')
          .replace(/\.html$/,'')
          .replace(/\/+$/,'');
        return path||'/';
      }catch{return '';}
    };
    const linksFor=(container,path)=>container?[...container.querySelectorAll('a[href]')].filter(link=>normalizedPath(link)===path):[];

    document.querySelectorAll('a[href]').forEach(link=>{
      if(normalizedPath(link)==='/pricing'&&link.textContent.trim()==='Pricing')link.textContent='Launch Plans';
    });

    const addEvidenceLink=container=>{
      if(!container)return;
      const existing=linksFor(container,'/learn');
      if(existing.length){
        existing.slice(1).forEach(link=>link.remove());
        existing[0].textContent='Evidence Lab';
        return;
      }
      const link=document.createElement('a');
      link.href='learn.html';
      link.textContent='Evidence Lab';
      const anchor=[...container.querySelectorAll('a,[data-app-preview]')].find(item=>{
        const path=normalizedPath(item);
        return path==='/faq'||path==='/about'||item.hasAttribute('data-app-preview');
      });
      if(anchor)container.insertBefore(link,anchor);
      else container.append(link);
    };

    addEvidenceLink(document.querySelector('.desktop-nav'));
    addEvidenceLink(document.querySelector('.mobile-nav'));
    document.querySelectorAll('.footer-links').forEach(group=>{
      if(linksFor(group,'/product').length)addEvidenceLink(group);
    });

    [document.querySelector('.desktop-nav'),document.querySelector('.mobile-nav')].forEach(container=>{
      linksFor(container,'/beta-application').forEach(link=>link.textContent='Request Beta Access');
    });

    document.querySelectorAll('[data-app-preview]').forEach(link=>{
      link.textContent='Private Beta App';
      link.setAttribute('aria-label','Open Private Beta App');
    });

    const copyright=document.querySelector('.copyright');
    if(copyright&&copyright.textContent.includes('Planned pricing and beta capabilities')){
      copyright.textContent=copyright.textContent.replace('Planned pricing and beta capabilities','Launch plans and beta capabilities');
    }
  };
  normalizeMarketingShell();
  enforceReadabilityFloor();

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
  document.querySelectorAll('a[href="learn.html"],a[href="/learn"]').forEach(link=>{
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

  window.addEventListener('resize',enforceReadabilityFloor,{passive:true});

  if(page==="sample-dossier")emit("sample_dossier_viewed","sample-page",true);
  if(page==="application-received")emit("beta_application_received","post-submit",true);
  if(page==="beta-onboarding")emit("onboarding_guide_viewed","onboarding",true);
})();