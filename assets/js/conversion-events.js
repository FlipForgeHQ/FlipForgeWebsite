(()=>{
  const pathname=location.pathname.replace(/\/+$/,"")||"/";

  const enforceReadabilityFloor=()=>{
    document.querySelectorAll('main p, main li, main label, main button, main input, main select').forEach(el=>{
      const size=parseFloat(getComputedStyle(el).fontSize)||0;
      if(size>0&&size<12)el.style.fontSize='12px';
    });
  };
  enforceReadabilityFloor();

  const normalizeMarketingShell=()=>{
    const normalizedPath=value=>{
      try{
        const href=value instanceof Element?(value.getAttribute('href')||''):String(value||'');
        const path=new URL(href,location.href).pathname
          .replace(/\/index\.html$/,'/')
          .replace(/\.html$/,'')
          .replace(/\/+$/,'');
        return path||'/';
      }catch{return '';}
    };
    const linksFor=(container,path)=>container?[...container.querySelectorAll('a[href]')].filter(link=>normalizedPath(link)===path):[];
    const currentPath=normalizedPath(location.pathname);

    const canonicalPrimaryNav=[
      {path:'/product',href:'/product.html',label:'Product'},
      {path:'/decision-intelligence',href:'/decision-intelligence.html',label:'Decision Intelligence'},
      {path:'/learn',href:'/learn.html',label:'Evidence Lab'},
      {path:'/pricing',href:'/pricing.html',label:'Launch Plans'},
      {path:'/about',href:'/about.html',label:'About'}
    ];
    // Access actions are one grouped control owned by the static page (see scripts/lib/public-access-nav.cjs):
    // Request Beta Access (primary) + "Already invited? Sign in" with the exact Private Beta return URL.
    // They are preserved, never re-rendered as a separate competing "Sign In" link.
    const SIGN_IN_URL='/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start';
    const buildAccessGroup=(isMobile,isDecisionHeader)=>{
      const group=document.createElement('div');
      group.className=isMobile?'ff-access ff-access-mobile':'ff-access';
      group.dataset.ffAccess=isMobile?'mobile':'desktop';
      group.dataset.ffAccessState='signed-out';
      group.setAttribute('role','group');
      group.setAttribute('aria-label','Private Beta access');
      const signIn=document.createElement('a');
      signIn.className='ff-access-signin';
      signIn.href=SIGN_IN_URL;
      signIn.dataset.ffAccessSignIn='';
      signIn.dataset.ffMarketingSignIn='';
      signIn.setAttribute('aria-label','Already invited? Sign in to the FlipForge Private Beta');
      const lead=document.createElement('span');
      lead.className='ff-access-signin-lead';
      lead.textContent='Already invited?';
      const action=document.createElement('span');
      action.className='ff-access-signin-action';
      action.textContent='Sign in';
      signIn.append(lead,' ',action);
      const primary=document.createElement('a');
      primary.className=isMobile?'ff-access-primary':`${isDecisionHeader?'decision-nav-cta':'nav-cta'} ff-access-primary`;
      primary.href='beta-application.html';
      primary.dataset.ffAccessPrimary='';
      primary.textContent='Request Beta Access';
      if(currentPath==='/beta-application')primary.setAttribute('aria-current','page');
      if(isMobile)group.append(primary,signIn);else group.append(signIn,primary);
      return group;
    };
    const homePrimaryNav=canonicalPrimaryNav.filter(item=>item.path!=='/pricing');

    const renderPrimaryNav=container=>{
      if(!container)return;
      const isDecisionHeader=container.classList.contains('decision-nav-links');
      const isMobile=container.classList.contains('mobile-nav');
      const fragment=document.createDocumentFragment();
      const items=currentPath==='/'?homePrimaryNav:canonicalPrimaryNav;
      const accessGroup=container.querySelector('[data-ff-access]')||buildAccessGroup(isMobile,isDecisionHeader);
      accessGroup.remove();
      items.forEach(item=>{
        const link=document.createElement('a');
        link.href=item.href;
        link.textContent=item.label;
        if(currentPath===item.path)link.setAttribute('aria-current','page');
        fragment.append(link);
      });
      if(isMobile)fragment.prepend(accessGroup);else fragment.append(accessGroup);
      container.replaceChildren(fragment);
    };

    document.querySelectorAll('.desktop-nav,.decision-nav-links,.mobile-nav').forEach(renderPrimaryNav);

    const addEvidenceLink=container=>{
      if(!container)return;
      const existing=linksFor(container,'/learn');
      if(existing.length){
        existing.slice(1).forEach(link=>link.remove());
        existing[0].textContent='Evidence Lab';
        return;
      }
      const link=document.createElement('a');
      link.href='/learn.html';
      link.textContent='Evidence Lab';
      const about=linksFor(container,'/about')[0];
      if(about)container.insertBefore(link,about);
      else container.append(link);
    };

    const addDecisionIntelligenceLink=container=>{
      if(!container)return;
      const existing=linksFor(container,'/decision-intelligence');
      if(existing.length){
        existing.slice(1).forEach(link=>link.remove());
        existing[0].textContent='Decision Intelligence';
        return;
      }
      const link=document.createElement('a');
      link.href='/decision-intelligence.html';
      link.textContent='Decision Intelligence';
      const product=linksFor(container,'/product')[0];
      if(product)product.insertAdjacentElement('afterend',link);
      else container.prepend(link);
    };

    document.querySelectorAll('.footer-links').forEach(group=>{
      if(linksFor(group,'/product').length){
        addDecisionIntelligenceLink(group);
        addEvidenceLink(group);
      }
    });


    document.querySelectorAll('.footer p strong').forEach(label=>{
      const text=label.textContent.trim().replace(/™/g,'');
      if(text==='Card Intelligence'||text==='Card Decision Intelligence')label.textContent='Card Decision Intelligence™';
    });
    document.querySelectorAll('img.brand-lockup,.decision-brand img').forEach(image=>{
      image.alt='FlipForge — Card Decision Intelligence — Before you buy. Know Why.';
    });

    const copyright=document.querySelector('.copyright');
    if(copyright&&copyright.textContent.includes('Planned pricing and beta capabilities')){
      copyright.textContent=copyright.textContent.replace('Planned pricing and beta capabilities','Launch plans and beta capabilities');
    }
  };
  normalizeMarketingShell();
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
    if(link.closest(".site-header,.decision-header,.mobile-nav"))return"navigation";
    if(link.closest(".footer"))return"footer";
    if(link.closest(".ff-dossier-spotlight"))return"sample-spotlight";
    if(link.closest(".ff-evidence"))return"evidence";
    if(link.closest(".page-hero,.hero,.ffh,.decision-hero,.ff-dic-hero"))return"hero";
    return"page";
  };

  document.querySelectorAll('a[href$="beta-application.html"],a[href="/beta-application"]').forEach(link=>{
    link.addEventListener("click",()=>{
      // A verified member/applicant's access action no longer points at the application form.
      if(!/beta-application/.test(link.getAttribute("href")||""))return;
      emit("beta_cta_clicked",placementFor(link));
    });
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
  document.querySelectorAll("[data-ff-access-sign-in],[data-ff-access-footer]").forEach(link=>{
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