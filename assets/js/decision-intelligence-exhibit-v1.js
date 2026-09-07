(() => {
  "use strict";

  const exhibit = document.querySelector("[data-ff-di-exhibit]");
  if (!exhibit) return;

  const stages = ["identity", "evidence", "value", "decision", "outcome"];
  const stageButtons = [...exhibit.querySelectorAll("[data-ff-di-stage]")];
  const evidence = [...exhibit.querySelectorAll("[data-ff-evidence]")];
  const supportedValue = exhibit.querySelector("[data-ff-supported-value]");
  const edge = exhibit.querySelector("[data-ff-supported-edge]");
  const shiftFrom = exhibit.querySelector("[data-ff-edge-from]");
  const shiftTo = exhibit.querySelector("[data-ff-edge-to]");
  const confidenceBar = exhibit.querySelector("[data-ff-confidence-bar]");
  const evidenceBar = exhibit.querySelector("[data-ff-evidence-bar]");
  const identityBar = exhibit.querySelector("[data-ff-identity-bar]");
  const riskBar = exhibit.querySelector("[data-ff-risk-bar]");
  const decision = exhibit.querySelector("[data-ff-decision]");
  const decisionCopy = exhibit.querySelector("[data-ff-decision-copy]");
  const live = exhibit.querySelector("[data-ff-di-live]");
  const replay = document.querySelector("[data-ff-di-replay]");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  let current = 0;
  let timer = null;

  const stageState = {
    identity: {
      value: "$349",
      edge: "24% apparent discount",
      confidence: "28%",
      evidence: "22%",
      identity: "100%",
      risk: "72%",
      decision: "CHECKING",
      copy: "The exact card identity is confirmed before comparisons are allowed to influence the result.",
      live: "Exact card identity confirmed."
    },
    evidence: {
      value: "$349",
      edge: "Evidence being qualified",
      confidence: "44%",
      evidence: "36%",
      identity: "100%",
      risk: "64%",
      decision: "FILTERING",
      copy: "Seven comparisons were found. Five do not survive the evidence check and lose influence.",
      live: "Five of seven comparisons rejected; two remain usable."
    },
    value: {
      value: "$341",
      edge: "2.3% supported edge",
      confidence: "63%",
      evidence: "58%",
      identity: "100%",
      risk: "52%",
      decision: "REASSESSING",
      copy: "Once weak comparisons are removed, the apparent bargain compresses dramatically.",
      live: "Supported value recalculated from the evidence that remains."
    },
    decision: {
      value: "$341",
      edge: "2.3% supported edge",
      confidence: "68%",
      evidence: "61%",
      identity: "100%",
      risk: "49%",
      decision: "VERIFY",
      copy: "The price edge is small and the evidence base is still thin. FlipForge does not need a transaction to happen.",
      live: "Decision resolved to VERIFY."
    },
    outcome: {
      value: "$341",
      edge: "Decision recorded",
      confidence: "68%",
      evidence: "61%",
      identity: "100%",
      risk: "49%",
      decision: "TRACK",
      copy: "The original decision can be compared with what happens later, creating an evidence trail instead of a forgotten guess.",
      live: "Decision recorded for later outcome review."
    }
  };

  function setEvidence(stage) {
    evidence.forEach((chip, index) => {
      let state = "pending";
      if (stage === "evidence" || stage === "value" || stage === "decision" || stage === "outcome") {
        state = index < 5 ? "rejected" : "accepted";
      }
      chip.dataset.state = state;
      const label = chip.querySelector("b");
      if (label) label.textContent = state === "pending" ? "Review" : state === "accepted" ? "Usable" : "Rejected";
    });
  }

  function applyStage(index, announce = true) {
    current = Math.max(0, Math.min(stages.length - 1, index));
    const stage = stages[current];
    const state = stageState[stage];
    exhibit.dataset.stage = stage;

    stageButtons.forEach((button, buttonIndex) => {
      if (buttonIndex === current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });

    setEvidence(stage);
    if (supportedValue) supportedValue.textContent = state.value;
    if (edge) edge.textContent = state.edge;
    if (shiftFrom) shiftFrom.textContent = stage === "identity" ? "24%" : "24% apparent";
    if (shiftTo) shiftTo.textContent = stage === "identity" ? "pending" : stage === "evidence" ? "rechecking" : "2.3% supported";
    if (confidenceBar) confidenceBar.style.setProperty("--w", state.confidence);
    if (evidenceBar) evidenceBar.style.setProperty("--w", state.evidence);
    if (identityBar) identityBar.style.setProperty("--w", state.identity);
    if (riskBar) riskBar.style.setProperty("--w", state.risk);
    if (decision) decision.textContent = state.decision;
    if (decisionCopy) decisionCopy.textContent = state.copy;
    if (live && announce) live.textContent = state.live;
  }

  function schedule() {
    window.clearTimeout(timer);
    if (reduceMotion) return;
    timer = window.setTimeout(() => {
      applyStage((current + 1) % stages.length, false);
      schedule();
    }, current === stages.length - 1 ? 5200 : 3300);
  }

  stageButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      applyStage(index);
      schedule();
    });
  });

  replay?.addEventListener("click", () => {
    applyStage(0);
    schedule();
    exhibit.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  });

  applyStage(0, false);
  schedule();
})();
