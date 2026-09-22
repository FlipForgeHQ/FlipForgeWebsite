(()=>{
  "use strict";

  const stage=document.querySelector("[data-cdi-stage]");
  if(!stage)return;

  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const reasoning=stage.querySelector("[data-reasoning]");
  const startButton=stage.querySelector("[data-start-tour]");
  const startLabel=stage.querySelector("[data-tour-label]");
  const skipButton=stage.querySelector("[data-skip]");
  const stackStatus=stage.querySelector("[data-stack-status]");
  const tourStep=stage.querySelector("[data-tour-step]");
  const tourCaption=stage.querySelector("[data-tour-caption]");
  const signals=[...stage.querySelectorAll("[data-signal]")];
  const guideButtons=[...stage.querySelectorAll("[data-guide-signal]")];
  const stateButtons=[...document.querySelectorAll("[data-preview-state]")];

  signals.forEach((node,index)=>node.style.setProperty("--delay",`${index*340}ms`));

  const fixtures={
    BUY:{
      card:"2018 Panini Prizm Luka Dončić #280 · PSA 10",
      decision:"BUY",
      label:"The buy case is supported",
      copy:"The card is exact, the sales are strong, and the asking price sits below the evidence-backed value.",
      confidence:89,confidenceCopy:"Strong support",
      risk:23,riskCopy:"Lower uncertainty",
      heat:87,heatBand:"High priority",
      heatCopy:"This eligible saved opportunity ranks high in the current opportunity set.",
      next:"Check seller quality, fees, shipping, and availability before taking action.",
      evidenceAccepted:5,evidenceTotal:6,
      spark:"4,25 17,21 30,22 43,16 56,14 68,10",
      signals:{
        identity:{title:"Exact card confirmed",detail:"Year, set, number, variant, and grade agree",state:"Exact match",caption:"First, FlipForge confirms the exact card so the wrong variant or grade cannot influence the decision."},
        evidence:{title:"5 of 6 sales qualify",detail:"Five exact completed sales count; one comparison stays out",state:"5 good sales",caption:"Next, FlipForge keeps five trustworthy exact-card sales and removes the comparison that does not belong."},
        economics:{title:"Asking price is 13% below value support",detail:"$349 ask compared with $402 of evidence-backed support",state:"13% below",caption:"Then FlipForge compares the asking price with the value supported by the qualified sales."},
        uncertainty:{title:"89% confidence · lower uncertainty",detail:"The evidence is strong enough that uncertainty does not block the call",state:"Lower uncertainty",caption:"Finally, FlipForge measures how much uncertainty remains instead of hiding it behind the price."}
      },
      evidence:[
        ["✓","2026-09-18 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-09-12 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-09-05 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-08-29 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-08-20 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["×","Silver parallel candidate","Different variant","Left out"]
      ]
    },
    WATCH:{
      card:"2020 Panini Prizm Joe Burrow #307 · PSA 9",
      decision:"WATCH",
      label:"Worth watching—not ready to buy",
      copy:"The evidence is usable, but the current price advantage is too small for a stronger call.",
      confidence:78,confidenceCopy:"Good support",
      risk:39,riskCopy:"Moderate uncertainty",
      heat:66,heatBand:"Worth watching",
      heatCopy:"This eligible saved opportunity remains visible, but it is not a top-priority setup.",
      next:"Watch for a lower all-in price or stronger exact-sale support.",
      evidenceAccepted:4,evidenceTotal:6,
      spark:"4,21 17,20 30,18 43,19 56,15 68,15",
      signals:{
        identity:{title:"Exact card confirmed",detail:"Year, set, number, variant, and grade agree",state:"Exact match",caption:"First, FlipForge confirms that the listing and comparisons refer to the same exact card."},
        evidence:{title:"4 of 6 sales qualify",detail:"Four exact sales count; two comparisons stay out",state:"4 good sales",caption:"Next, four trustworthy sales survive the evidence check while two mismatches are removed."},
        economics:{title:"Price is only 4% below value support",detail:"$92 ask compared with $96 of evidence-backed support",state:"4% below",caption:"Then FlipForge sees a small price advantage—but not enough to support a stronger call."},
        uncertainty:{title:"78% confidence · moderate uncertainty",detail:"The evidence is usable, but the edge remains limited",state:"Moderate",caption:"Finally, FlipForge keeps the remaining uncertainty visible so a small discount does not look stronger than it is."}
      },
      evidence:[
        ["✓","2026-09-17 · Exact PSA 9 sale","Exact completed sale","Counts"],
        ["✓","2026-09-09 · Exact PSA 9 sale","Exact completed sale","Counts"],
        ["✓","2026-08-31 · Exact PSA 9 sale","Exact completed sale","Counts"],
        ["✓","2026-08-18 · Exact PSA 9 sale","Exact completed sale","Counts"],
        ["×","Raw-card candidate","Wrong grade state","Left out"],
        ["×","Duplicate source","Same sale counted twice","Left out"]
      ]
    },
    VERIFY:{
      card:"2022 Panini Prizm Brock Purdy #353 · PSA 10",
      decision:"VERIFY",
      label:"Verify before acting",
      copy:"There are not enough trustworthy sales to support a stronger call yet.",
      confidence:61,confidenceCopy:"Moderate support",
      risk:58,riskCopy:"More uncertainty",
      heat:null,heatBand:"Unavailable",
      heatCopy:"Opportunity priority appears after the card clears the required evidence checks.",
      next:"Verify more exact sales before relying on the price.",
      evidenceAccepted:3,evidenceTotal:7,
      spark:"4,25 17,18 30,23 43,16 56,21 68,19",
      signals:{
        identity:{title:"Exact card confirmed",detail:"Year, set, number, variant, and grade agree",state:"Exact match",caption:"First, FlipForge confirms the exact card. Identity is clear, so the problem is somewhere later in the chain."},
        evidence:{title:"3 of 7 sales qualify",detail:"Four comparisons are rejected because they do not belong",state:"3 good sales",caption:"Next, only three of seven comparisons survive. Wrong variants, a duplicate, and an identity conflict stay out."},
        economics:{title:"Price support is unavailable",detail:"Three trusted sales are not enough to support a reliable value",state:"No price support",caption:"Because the trustworthy sales are too limited, FlipForge does not manufacture a price estimate."},
        uncertainty:{title:"61% confidence · more uncertainty",detail:"More checking is needed before stronger action",state:"More checking",caption:"The remaining uncertainty is high enough that FlipForge stops at VERIFY instead of pretending the case is stronger."}
      },
      evidence:[
        ["✓","2026-09-16 · Exact base PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-09-04 · Exact base PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-08-24 · Exact base PSA 10 sale","Exact completed sale","Counts"],
        ["×","Black & White Checker","Wrong parallel","Left out"],
        ["×","Autograph listing","Wrong variant","Left out"],
        ["×","Duplicate sold record","Same sale counted twice","Left out"],
        ["×","Unverified listing identity","Card identity does not resolve cleanly","Left out"]
      ]
    },
    PASS:{
      card:"2023 Panini Prizm Victor Wembanyama #136 · PSA 10",
      decision:"PASS",
      label:"Pass at this price",
      copy:"The evidence is strong enough to judge the deal, and the asking price is too high.",
      confidence:84,confidenceCopy:"Strong support",
      risk:34,riskCopy:"Lower uncertainty",
      heat:28,heatBand:"Low priority",
      heatCopy:"This eligible saved opportunity ranks low because the current price setup is weak.",
      next:"Wait for meaningfully better pricing or new evidence.",
      evidenceAccepted:5,evidenceTotal:6,
      spark:"4,11 17,13 30,12 43,16 56,18 68,23",
      signals:{
        identity:{title:"Exact card confirmed",detail:"Year, set, number, variant, and grade agree",state:"Exact match",caption:"First, FlipForge confirms the exact card so the price comparison starts from the right identity."},
        evidence:{title:"5 of 6 sales qualify",detail:"Five exact completed sales support the comparison",state:"5 good sales",caption:"Next, five trustworthy sales give FlipForge enough evidence to judge the asking price."},
        economics:{title:"Asking price is 12% above value support",detail:"$615 ask compared with $548 of evidence-backed support",state:"12% above",caption:"Then the price check shows the problem: the seller is asking materially more than the trusted sales support."},
        uncertainty:{title:"84% confidence · lower uncertainty",detail:"The evidence is strong; the price is still the problem",state:"Lower uncertainty",caption:"Finally, good confidence confirms that this is not an uncertainty problem—the economics drive the PASS."}
      },
      evidence:[
        ["✓","2026-09-19 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-09-10 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-09-01 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-08-25 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["✓","2026-08-14 · Exact PSA 10 sale","Exact completed sale","Counts"],
        ["×","Silver parallel candidate","Different variant","Left out"]
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

  function setEvidenceDots(accepted,total){
    const dots=[...stage.querySelectorAll(".ff-cdi-visual-evidence i")];
    dots.forEach((dot,index)=>{
      dot.hidden=index>=total;
      dot.classList.toggle("is-kept",index<accepted);
      dot.classList.toggle("is-out",index>=accepted&&index<total);
    });
  }

  function setSpark(points){
    const line=stage.querySelector("[data-price-spark]");
    const dot=stage.querySelector("[data-price-dot]");
    if(line)line.setAttribute("points",points);
    if(dot){
      const last=points.trim().split(/\s+/).at(-1)?.split(",")||[];
      if(last.length===2){
        dot.setAttribute("cx",last[0]);
        dot.setAttribute("cy",last[1]);
      }
    }
  }

  function applySignal(key,data){
    setText(`[data-signal-title="${key}"]`,data.title);
    setText(`[data-signal-detail="${key}"]`,data.detail);
    setText(`[data-signal-state="${key}"]`,data.state);
  }

  function setSelectedSignal(key){
    signals.forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.signal===key)));
  }

  function showSignalExplanation(key,index=null){
    const data=fixtures[stage.dataset.state]?.signals?.[key];
    if(!data)return;
    setSelectedSignal(key);
    const resolvedIndex=index??Math.max(0,signals.findIndex(node=>node.dataset.signal===key));
    if(tourStep)tourStep.textContent=`STEP ${resolvedIndex+1} OF ${signals.length}`;
    if(tourCaption)tourCaption.textContent=data.caption;
  }

  function updateVisuals(data){
    setEvidenceDots(data.evidenceAccepted,data.evidenceTotal);
    setSpark(data.spark);

    const miniRing=stage.querySelector(".ff-cdi-mini-ring");
    const miniRisk=stage.querySelector("[data-risk-mini]");
    if(miniRing)miniRing.style.setProperty("--confidence",String(data.confidence));
    if(miniRisk)miniRisk.style.setProperty("--risk",String(data.risk));

    const confidenceMeter=stage.querySelector("[data-confidence-meter]");
    const riskMeter=stage.querySelector("[data-risk-meter]");
    if(confidenceMeter)confidenceMeter.style.setProperty("--meter",String(data.confidence));
    if(riskMeter)riskMeter.style.setProperty("--meter",String(data.risk));
  }

  function setStackStatus(value){
    if(stackStatus)stackStatus.textContent=value;
  }

  let timers=[];
  function clearTimers(){
    timers.forEach(id=>clearTimeout(id));
    timers=[];
  }

  function finishImmediately(){
    clearTimers();
    signals.forEach(node=>{
      node.classList.add("is-in");
      node.classList.remove("is-active-step");
    });
    stage.dataset.building="false";
    stage.dataset.locked="true";
    if(skipButton)skipButton.hidden=true;
    setStackStatus("4 checks complete");
    if(tourStep)tourStep.textContent="REASON TRAIL COMPLETE";
    if(tourCaption)tourCaption.textContent="Tap any check to revisit the part of the reasoning you want to inspect.";
    if(startLabel)startLabel.textContent="Replay reasoning";
  }

  function play(){
    clearTimers();
    if(!reasoning)return;

    reasoning.hidden=false;
    stage.dataset.locked="false";

    if(reduced){
      stage.classList.remove("ff-cdi-motion-ready");
      finishImmediately();
      reasoning.scrollIntoView({behavior:"auto",block:"start"});
      return;
    }

    stage.classList.add("ff-cdi-motion-ready");
    stage.dataset.building="false";
    signals.forEach(node=>node.classList.remove("is-in","is-active-step"));
    setSelectedSignal("");
    if(skipButton)skipButton.hidden=false;
    setStackStatus("Building the reason trail…");
    if(tourStep)tourStep.textContent="GETTING READY";
    if(tourCaption)tourCaption.textContent="FlipForge is about to walk through the four checks behind this decision.";

    void stage.offsetWidth;
    requestAnimationFrame(()=>{
      stage.dataset.building="true";
      signals.forEach(node=>node.classList.add("is-in"));

      signals.forEach((node,index)=>{
        timers.push(setTimeout(()=>{
          signals.forEach(value=>value.classList.remove("is-active-step"));
          node.classList.add("is-active-step");
          showSignalExplanation(node.dataset.signal,index);
          setStackStatus(`Check ${index+1} of ${signals.length}`);
        },120+index*340));
      });

      timers.push(setTimeout(()=>{
        signals.forEach(node=>node.classList.remove("is-active-step"));
        stage.dataset.building="false";
        stage.dataset.locked="true";
        if(skipButton)skipButton.hidden=true;
        setStackStatus("4 checks complete");
        if(tourStep)tourStep.textContent="DECISION EXPLAINED";
        if(tourCaption)tourCaption.textContent="The four checks are complete. Tap any row for another look or open the full evidence below.";
        if(startLabel)startLabel.textContent="Replay reasoning";
        clearTimers();
      },120+(signals.length-1)*340+620));

      timers.push(setTimeout(finishImmediately,3400));
    });

    reasoning.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function openSpecificSignal(key){
    if(!reasoning)return;
    clearTimers();
    reasoning.hidden=false;
    stage.classList.remove("ff-cdi-motion-ready");
    signals.forEach(node=>node.classList.add("is-in"));
    stage.dataset.building="false";
    stage.dataset.locked="true";
    if(skipButton)skipButton.hidden=true;
    const target=signals.find(node=>node.dataset.signal===key);
    showSignalExplanation(key);
    setStackStatus("Step opened");
    if(target){
      target.focus({preventScroll:true});
      target.scrollIntoView({behavior:reduced?"auto":"smooth",block:"center"});
    }
  }

  function renderState(name){
    const data=fixtures[name]||fixtures.VERIFY;
    clearTimers();
    stage.dataset.state=name;
    stage.dataset.building="false";
    stage.dataset.locked="false";
    stage.classList.remove("ff-cdi-motion-ready");
    if(reasoning)reasoning.hidden=true;
    if(skipButton)skipButton.hidden=true;

    setText("[data-card-title]",data.card);
    setText("[data-decision]",data.decision);
    setText("[data-decision-label]",data.label);
    setText("[data-decision-copy]",data.copy);
    setText("[data-tour-label]",`Show me why FlipForge said ${data.decision}`);
    setText("[data-confidence]",`${data.confidence}%`);
    setText("[data-confidence-copy]",data.confidenceCopy);
    setText("[data-risk]",`${data.risk} / 100`);
    setText("[data-risk-copy]",data.riskCopy);
    setText("[data-heat]",data.heat==null?"—":`${data.heat} / 100`);
    setText("[data-heat-band]",data.heatBand);
    setText("[data-heat-copy]",data.heatCopy);
    setText("[data-next-action]",data.next);
    setText("[data-receipt-decision]",data.decision);

    const heat=stage.querySelector(".ff-cdi-heat");
    if(heat)heat.dataset.heatState=data.heat==null?"unavailable":"scored";

    Object.entries(data.signals).forEach(([key,value])=>applySignal(key,value));
    updateVisuals(data);
    renderEvidence(data.evidence);
    setSelectedSignal("");
    setStackStatus("Ready");
    if(tourStep)tourStep.textContent="STEP 1 OF 4";
    if(tourCaption)tourCaption.textContent=data.signals.identity.caption;

    stateButtons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.previewState===name)));
  }

  signals.forEach(node=>{
    node.addEventListener("click",()=>showSignalExplanation(node.dataset.signal));
  });

  guideButtons.forEach(button=>{
    button.addEventListener("click",()=>openSpecificSignal(button.dataset.guideSignal));
  });

  stateButtons.forEach(button=>{
    button.addEventListener("click",()=>renderState(button.dataset.previewState));
  });

  startButton?.addEventListener("click",play);
  stage.querySelector("[data-replay]")?.addEventListener("click",play);
  skipButton?.addEventListener("click",finishImmediately);

  renderState("VERIFY");
})();