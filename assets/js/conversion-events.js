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
      link.href='/learn.html';
      link.textContent='Evidence Lab';
      const anchor=[...container.querySelectorAll('a,[data-app-preview]')].find(item=>{
        const path=normalizedPath(item);
        return path==='/faq'||path==='/about'||item.hasAttribute('data-app-preview');
      });
      if(anchor)container.insertBefore(link,anchor);
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
      else{
        const anchor=[...container.querySelectorAll('a,[data-app-preview]')].find(item=>{
          const path=normalizedPath(item);
          return path==='/learn'||path==='/faq'||path==='/about'||item.hasAttribute('data-app-preview');
        });
        if(anchor)container.insertBefore(link,anchor);
        else container.prepend(link);
      }
    };

    [document.querySelector('.desktop-nav'),document.querySelector('.decision-nav-links'),document.querySelector('.mobile-nav')].forEach(container=>{
      addDecisionIntelligenceLink(container);
      addEvidenceLink(container);
    });
    document.querySelectorAll('.footer-links').forEach(group=>{
      if(linksFor(group,'/product').length){
        addDecisionIntelligenceLink(group);
        addEvidenceLink(group);
      }
    });

    [document.querySelector('.desktop-nav'),document.querySelector('.decision-nav-links'),document.querySelector('.mobile-nav')].forEach(container=>{
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

  const ensureDecisionIntelligenceStyles=()=>{
    if(document.querySelector('link[data-ff-di-teaser]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/assets/css/decision-intelligence-teaser-v1.css';
    link.dataset.ffDiTeaser='true';
    document.head.appendChild(link);
  };

  const homeDecisionIntelligenceMarkup=()=>`<section class="ff-di-teaser ff-di-teaser-home" data-ff-di-teaser aria-labelledby="ff-di-home-title"><div class="ff-di-teaser-inner"><p class="ff-di-teaser-kicker">MARQUEE FEATURE · CARD DECISION INTELLIGENCE</p><div class="ff-di-teaser-head"><h2 id="ff-di-home-title">Price data tells you what happened.<span>Decision Intelligence helps you understand what the evidence means for your next move.</span></h2><p class="ff-di-teaser-summary">Comps, sold listings, population context, liquidity, grading economics, and risk can all matter. FlipForge organizes those signals around the exact card and preserves why the decision changes.</p></div><div class="ff-di-teaser-grid"><article><span>01 · FROM DATA</span><strong>Start with the exact card and evidence that actually belongs.</strong><p>Identity comes before price. Completed sales can support value only when they match the card being evaluated.</p></article><article><span>02 · TO CONTEXT</span><strong>See supported value, liquidity, risk, and grading economics together.</strong><p>The goal is not another isolated number. It is a clearer picture of what strengthens the case and what could make it wrong.</p></article><article><span>03 · TO DECISION</span><strong>Translate the evidence into BUY, WATCH, VERIFY, or PASS.</strong><p>Smart Opportunity keeps one decision language and preserves the reason trail behind the result.</p></article></div><div class="ff-di-teaser-footer"><a class="ff-di-teaser-cta" href="/decision-intelligence.html" data-ff-di-link="home-teaser">What is Decision Intelligence? →</a><p class="ff-di-teaser-boundary">FlipForge does not predict future prices or grades. It evaluates current evidence and uncertainty. The final call remains yours.</p></div></div></section>`;

  const productDecisionIntelligenceMarkup=()=>`<section class="ff-di-teaser ff-di-teaser-product" data-ff-di-teaser aria-labelledby="ff-di-product-title"><div class="ff-di-teaser-inner"><p class="ff-di-teaser-kicker">FROM PRICE TRACKING TO CARD DECISION INTELLIGENCE</p><div class="ff-di-teaser-head"><h2 id="ff-di-product-title">Historical sales answer one question:<span>what happened?</span></h2><p class="ff-di-teaser-summary">FlipForge is built for what comes next: Is this the exact card? Does the evidence belong? Is the value supported? What could make the case wrong? What should you do next — and why?</p></div><div class="ff-di-teaser-grid"><article><span>MOVE BEYOND THE REAR-VIEW MIRROR</span><strong>Use historical sales as evidence, not as the whole decision.</strong><p>A comp matters only after exact identity and evidence quality are established.</p></article><article><span>ELIMINATE ANALYSIS PARALYSIS</span><strong>Bring fragmented decision inputs into one context.</strong><p>Supported value, liquidity, risk, scarcity and population context, and grading economics are easier to interpret together than across ten tabs.</p></article><article><span>MOVE WITH CLARITY</span><strong>Get a reasoned posture instead of a black-box score.</strong><p>BUY, WATCH, VERIFY, and PASS express the current evidence posture while preserving what drove it and what could change it.</p></article></div><div class="ff-di-teaser-footer"><a class="ff-di-teaser-cta" href="/decision-intelligence.html" data-ff-di-link="product-teaser">Explore Decision Intelligence →</a><p class="ff-di-teaser-boundary">Decision support only. Smart Opportunity remains the sole BUY / WATCH / VERIFY / PASS authority. FlipForge does not authorize transactions.</p></div></div></section>`;

  const surfaceDecisionIntelligence=()=>{
    if(document.querySelector('[data-ff-di-teaser]'))return;
    const main=document.querySelector('main#main');
    if(!main)return;
    if(pathname==='/'||pathname==='/index.html'){
      const anchor=main.querySelector('.decision-hero');
      if(!anchor)return;
      ensureDecisionIntelligenceStyles();
      anchor.insertAdjacentHTML('afterend',homeDecisionIntelligenceMarkup());
      return;
    }
    if(pathname==='/product.html'||pathname==='/product'){
      const anchor=main.querySelector('.ff-aw-proof-strip')||main.querySelector('.page-hero');
      if(!anchor)return;
      ensureDecisionIntelligenceStyles();
      anchor.insertAdjacentHTML('afterend',productDecisionIntelligenceMarkup());
    }
  };
  surfaceDecisionIntelligence();
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
    if(link.closest(".ff-di-teaser"))return"decision-intelligence-teaser";
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
  }

  window.addEventListener('resize',enforceReadabilityFloor,{passive:true});

  if(page==="sample-dossier")emit("sample_dossier_viewed","sample-page",true);
  if(page==="application-received")emit("beta_application_received","post-submit",true);
  if(page==="beta-onboarding")emit("onboarding_guide_viewed","onboarding",true);
})();