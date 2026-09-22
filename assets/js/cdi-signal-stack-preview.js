(()=>{
  "use strict";

  const stage=document.querySelector("[data-cdi-stage]");
  if(!stage)return;

  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const signals=[...stage.querySelectorAll("[data-signal]")];
  const stateButtons=[...document.querySelectorAll("[data-preview-state]")];
  const guideButtons=[...stage.querySelectorAll("[data-guide-signal]")];
  const stackStatus=stage.querySelector("[data-stack-status]");
  signals.forEach((node,index)=>node.style.setProperty("--delay",`${index*170}ms`));

  const fixtures={
    BUY:{
      card:"2018 Panini Prizm Luka Dončić #280 · PSA 10",
      decision:"BUY",
      label:"Current evidence supports the buy case",
      copy:"Exact identity, qualified sold evidence, economics, and uncertainty all clear the current governed thresholds.",
      confidence:89,confidenceCopy:"Strong evidence support",
      risk:23,riskCopy:"Lower uncertainty",
      heat:87,heatBand:"HIGH PRIORITY",heatCopy:"Forge Heat ranks this eligible saved opportunity near the top of the current qualified set.",
      next:"Inspect seller quality, fees, shipping, and availability before taking any action.",
      signals:{
        identity:{title:"Exact identity confirmed",detail:"2018 Prizm #280 · base · PSA 10",state:"LOCKED",heading:"Identity is clean.",body:"Year, product, card number, variant, and grade agree with the saved evaluation.",label:"IDENTITY PROOF",proof:"Year · product · number · variant · grade agree"},
        evidence:{title:"5 of 6 candidates qualified",detail:"Five exact completed sales survived the evidence gate",state:"STRONG",heading:"The evidence base is broad enough to support value.",body:"Five unique exact-card completed sales qualified. One candidate was excluded before it could affect value.",label:"EVIDENCE PROOF",proof:"5 accepted exact sales · 1 excluded"},
        economics:{title:"Ask $349 · Supported $402",detail:"Current ask is 13.2% below supported value",state:"+13.2%",heading:"The economics clear the current threshold.",body:"The saved all-in ask sits below the server-owned supported value with enough margin to qualify for stronger authority.",label:"ECONOMIC PROOF",proof:"$349 ask · $402 supported · +13.2% gap"},
        uncertainty:{title:"Confidence 89 · Risk 23",detail:"High support with comparatively low uncertainty",state:"CLEAR",heading:"Uncertainty is not blocking the decision.",body:"Confidence remains high and risk remains below the current blocking range for this saved evaluation.",label:"UNCERTAINTY PROOF",proof:"Confidence 89 · Risk 23"}
      },
      evidence:[
        ["✓","2025-09-18 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-12 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-05 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-29 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-20 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["×","Silver parallel candidate","Variant mismatch","EXCLUDED"]
      ]
    },
    WATCH:{
      card:"2020 Panini Prizm Joe Burrow #307 · PSA 9",
      decision:"WATCH",
      label:"Interesting, but the edge is not strong enough yet",
      copy:"Identity and evidence are usable, but current economics do not clear the stronger BUY threshold.",
      confidence:78,confidenceCopy:"Good evidence support",
      risk:39,riskCopy:"Moderate uncertainty",
      heat:66,heatBand:"WARM",heatCopy:"Forge Heat keeps this eligible opportunity visible, but Smart Opportunity remains WATCH.",
      next:"Watch for a lower all-in ask or stronger exact-sale support.",
      signals:{
        identity:{title:"Exact identity confirmed",detail:"2020 Prizm #307 · base · PSA 9",state:"LOCKED",heading:"Identity is not the issue.",body:"The card identity is sufficiently resolved for this saved evaluation.",label:"IDENTITY PROOF",proof:"Year · product · number · variant · grade agree"},
        evidence:{title:"4 of 6 candidates qualified",detail:"Four exact completed sales survived qualification",state:"GOOD",heading:"Evidence is usable, not exceptional.",body:"Four exact completed sales support the current value context. Two candidates were excluded.",label:"EVIDENCE PROOF",proof:"4 accepted exact sales · 2 excluded"},
        economics:{title:"Ask $92 · Supported $96",detail:"Current ask is only 4.2% below supported value",state:"+4.2%",heading:"Economics are the main limiter.",body:"The current gap is positive but does not clear the stronger governed threshold.",label:"ECONOMIC PROOF",proof:"$92 ask · $96 supported · +4.2% gap"},
        uncertainty:{title:"Confidence 78 · Risk 39",detail:"Evidence quality is adequate for WATCH",state:"STABLE",heading:"Uncertainty is acceptable, but not decisive.",body:"Confidence and risk are compatible with WATCH, while economics remain the main reason stronger authority is withheld.",label:"UNCERTAINTY PROOF",proof:"Confidence 78 · Risk 39"}
      },
      evidence:[
        ["✓","2025-09-17 · Exact PSA 9 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-09 · Exact PSA 9 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-31 · Exact PSA 9 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-18 · Exact PSA 9 sale","Accepted exact completed sale","ACCEPTED"],
        ["×","Raw-card candidate","Grade mismatch","EXCLUDED"],
        ["×","Duplicate source","Canonical duplicate","EXCLUDED"]
      ]
    },
    VERIFY:{
      card:"2022 Panini Prizm Brock Purdy #353 · PSA 10",
      decision:"VERIFY",
      label:"Verify before acting",
      copy:"Evidence quality is not strong enough for a stronger governed decision.",
      confidence:61,confidenceCopy:"Moderate support",
      risk:58,riskCopy:"Material uncertainty",
      heat:null,heatBand:"WITHHELD",heatCopy:"Heat stays withheld when the saved decision does not clear its evidence gates.",
      next:"Verify exact sold evidence before relying on price support.",
      signals:{
        identity:{title:"Exact identity confirmed",detail:"Base card · PSA 10 · exact card number",state:"LOCKED",heading:"Identity is not the blocker.",body:"The exact card is established. The current limitation is downstream: too little qualified sold evidence survived the governed evidence gate.",label:"IDENTITY PROOF",proof:"Year · product · card number · parallel · grade agree"},
        evidence:{title:"3 of 7 candidates qualified",detail:"Wrong parallels and duplicate evidence stayed out",state:"THIN",heading:"Evidence is the primary blocker.",body:"Only three candidates survived current exact-card evidence policy. Wrong parallels, autograph variants, and duplicate evidence remain excluded.",label:"EVIDENCE PROOF",proof:"3 accepted · 4 excluded by current evidence policy"},
        economics:{title:"Supported value withheld",detail:"Exact sold evidence did not clear the value gate",state:"WITHHELD",heading:"FlipForge refuses false precision here.",body:"Because evidence support is not sufficient, the customer does not get a manufactured supported value.",label:"ECONOMIC PROOF",proof:"Supported Value withheld by governed evidence gate"},
        uncertainty:{title:"Confidence 61 · Risk 58",detail:"Uncertainty remains too high for stronger authority",state:"REVIEW",heading:"Uncertainty reinforces VERIFY.",body:"Confidence and risk remain in a range that requires more verification before stronger authority is appropriate.",label:"UNCERTAINTY PROOF",proof:"Confidence 61 · Risk 58"}
      },
      evidence:[
        ["✓","2025-09-16 · Exact base PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-04 · Exact base PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-24 · Exact base PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["×","Black & White Checker","Wrong parallel","EXCLUDED"],
        ["×","Autograph listing","Wrong variant","EXCLUDED"],
        ["×","Duplicate sold record","Canonical duplicate","EXCLUDED"],
        ["×","Unverified listing identity","Identity conflict","EXCLUDED"]
      ]
    },
    PASS:{
      card:"2023 Panini Prizm Victor Wembanyama #136 · PSA 10",
      decision:"PASS",
      label:"Current setup does not justify stronger action",
      copy:"Evidence is usable, but the saved all-in ask sits above the supported economic range.",
      confidence:84,confidenceCopy:"Strong evidence support",
      risk:34,riskCopy:"Moderate-low uncertainty",
      heat:28,heatBand:"LOW PRIORITY",heatCopy:"Forge Heat keeps this eligible saved opportunity low in the qualified priority set.",
      next:"Wait for meaningfully better economics or new qualifying evidence.",
      signals:{
        identity:{title:"Exact identity confirmed",detail:"2023 Prizm #136 · base · PSA 10",state:"LOCKED",heading:"Identity is clear.",body:"The exact card is established and does not block the saved decision.",label:"IDENTITY PROOF",proof:"Year · product · number · variant · grade agree"},
        evidence:{title:"5 of 6 candidates qualified",detail:"Evidence support is strong enough to evaluate economics",state:"STRONG",heading:"Evidence is not the problem.",body:"Five unique exact-card completed sales qualified, giving the economic comparison enough support.",label:"EVIDENCE PROOF",proof:"5 accepted exact sales · 1 excluded"},
        economics:{title:"Ask $615 · Supported $548",detail:"Current ask is 12.2% above supported value",state:"-12.2%",heading:"Economics drive the PASS.",body:"The all-in ask exceeds the current evidence-supported value context by enough to block stronger authority.",label:"ECONOMIC PROOF",proof:"$615 ask · $548 supported · -12.2% gap"},
        uncertainty:{title:"Confidence 84 · Risk 34",detail:"Quality is adequate; economics still fail",state:"CLEAR",heading:"Good confidence does not rescue weak economics.",body:"The evidence environment is relatively strong, but Smart Opportunity still returns PASS because the price setup does not qualify.",label:"UNCERTAINTY PROOF",proof:"Confidence 84 · Risk 34"}
      },
      evidence:[
        ["✓","2025-09-19 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-10 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-09-01 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-25 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["✓","2025-08-14 · Exact PSA 10 sale","Accepted exact completed sale","ACCEPTED"],
        ["×","Silver parallel candidate","Variant mismatch","EXCLUDED"]
      ]
    }
  };

  function setText(selector,value){
    const node=stage.querySelector(selector);
    if(node)node.textContent=value;
  }

  function renderEvidence(rows){
    const grid=stage.querySelector("[data-evidence-grid]");
    if(!grid)return;
    grid.innerHTML=rows.map(row=>`<div class="ff-cdi-evidence-row"><span aria-hidden="true">${row[0]}</span><div><strong>${row[1]}</strong><small>${row[2]}</small></div><span>${row[3]}</span></div>`).join("");
  }

  function applySignal(key,data){
    setText(`[data-signal-title="${key}"]`,data.title);
    setText(`[data-signal-detail="${key}"]`,data.detail);
    setText(`[data-signal-state="${key}"]`,data.state);
  }

  function renderDetail(key){
    const data=fixtures[stage.dataset.state]?.signals?.[key];
    if(!data)return;
    signals.forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.signal===key)));
    setText("[data-detail-heading]",data.heading);
    setText("[data-detail-body]",data.body);
    setText("[data-detail-label]",data.label);
    setText("[data-detail-proof]",data.proof);
  }

  function setStackStatus(value){
    if(stackStatus)stackStatus.textContent=value;
  }

  function finishImmediately(){
    signals.forEach(node=>{
      node.classList.add("is-in");
      node.classList.remove("is-active-step");
    });
    stage.dataset.building="false";
    stage.dataset.locked="true";
    setStackStatus("4 signals · assembled");
  }

  let timers=[];
  function clearTimers(){
    timers.forEach(id=>clearTimeout(id));
    timers=[];
  }

  function play(){
    clearTimers();
    if(reduced){
      stage.classList.remove("ff-cdi-motion-ready");
      finishImmediately();
      return;
    }

    // Progressive enhancement: the stack is fully visible without this class.
    // Only hide/reveal rows after the animation runtime is confirmed alive.
    stage.classList.add("ff-cdi-motion-ready");
    stage.dataset.locked="false";
    stage.dataset.building="false";
    signals.forEach(node=>{
      node.classList.remove("is-in","is-active-step");
    });
    setStackStatus("Building reason trail…");

    // If animation scheduling is interrupted, restore the complete readable stack.
    timers.push(setTimeout(finishImmediately,2200));

    // Force a committed reset frame so Replay is deterministic in every browser.
    void stage.offsetWidth;
    requestAnimationFrame(()=>{
      stage.dataset.building="true";
      signals.forEach(node=>node.classList.add("is-in"));

      signals.forEach((node,index)=>{
        timers.push(setTimeout(()=>{
          signals.forEach(value=>value.classList.remove("is-active-step"));
          node.classList.add("is-active-step");
          setStackStatus(`Signal ${index+1} of ${signals.length}`);
        },90+index*170));
      });

      timers.push(setTimeout(()=>{
        signals.forEach(node=>node.classList.remove("is-active-step"));
        stage.dataset.building="false";
        stage.dataset.locked="true";
        setStackStatus("4 signals · assembled");
        clearTimers();
      },90+(signals.length-1)*170+430));
    });
  }

  function renderState(name,{replay=true}={}){
    const data=fixtures[name]||fixtures.VERIFY;
    stage.dataset.state=name;
    stage.dataset.locked="false";

    setText("[data-card-title]",data.card);
    setText("[data-decision]",data.decision);
    setText("[data-decision-label]",data.label);
    setText("[data-decision-copy]",data.copy);
    setText("[data-confidence]",String(data.confidence));
    setText("[data-confidence-copy]",data.confidenceCopy);
    setText("[data-risk]",String(data.risk));
    setText("[data-risk-copy]",data.riskCopy);
    setText("[data-heat]",data.heat==null?"—":String(data.heat));
    setText("[data-heat-band]",data.heatBand);
    setText("[data-heat-copy]",data.heatCopy);
    setText("[data-next-action]",data.next);
    setText("[data-receipt-decision]",data.decision);

    const confidenceRing=stage.querySelector('[data-ring="confidence"]');
    const riskRing=stage.querySelector('[data-ring="risk"]');
    if(confidenceRing){
      confidenceRing.style.setProperty("--value",String(data.confidence));
      confidenceRing.setAttribute("aria-label",`Confidence ${data.confidence} out of 100`);
    }
    if(riskRing){
      riskRing.style.setProperty("--value",String(data.risk));
      riskRing.setAttribute("aria-label",`Risk ${data.risk} out of 100`);
    }

    const heat=stage.querySelector(".ff-cdi-heat");
    const heatGauge=stage.querySelector(".ff-cdi-heat-gauge");
    if(heat){
      heat.dataset.heatState=data.heat==null?"withheld":"scored";
      heat.style.setProperty("--heat",data.heat==null?"0%":`${data.heat}%`);
    }
    if(heatGauge)heatGauge.setAttribute("aria-label",data.heat==null?"Forge Heat withheld":`Forge Heat ${data.heat} out of 100`);

    Object.entries(data.signals).forEach(([key,value])=>applySignal(key,value));
    renderEvidence(data.evidence);
    renderDetail("identity");

    stateButtons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.previewState===name)));

    if(replay)play();
    else finishImmediately();
  }

  signals.forEach(node=>{
    node.addEventListener("click",()=>renderDetail(node.dataset.signal));
  });

  guideButtons.forEach(button=>{
    button.addEventListener("click",()=>{
      const key=button.dataset.guideSignal;
      const target=signals.find(node=>node.dataset.signal===key);
      renderDetail(key);
      if(target){
        target.focus({preventScroll:true});
        target.scrollIntoView({behavior:reduced?"auto":"smooth",block:"center"});
      }
    });
  });

  stateButtons.forEach(button=>{
    button.addEventListener("click",()=>renderState(button.dataset.previewState));
  });

  stage.querySelector("[data-replay]")?.addEventListener("click",play);
  stage.querySelector("[data-skip]")?.addEventListener("click",()=>{
    clearTimers();
    finishImmediately();
  });

  renderState("VERIFY",{replay:true});
})();