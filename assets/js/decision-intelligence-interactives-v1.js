(() => {
  "use strict";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const later = (fn, delay) => window.setTimeout(fn, reduceMotion ? 0 : delay);
  const emitConversion = (event, placement) => {
    window.dispatchEvent(new CustomEvent("flipforge:conversion", { detail: { event, placement } }));
  };

  function initEvidenceLab() {
    const root = document.querySelector("[data-ff-evidence-lab]");
    if (!root) return;
    const button = root.querySelector("[data-ff-evidence-run]");
    const panel = root.querySelector("#ff-evidence-results");
    const comps = [...root.querySelectorAll("[data-ff-comp]")];
    const transform = root.querySelector("[data-ff-evidence-transform]");
    const verdict = root.querySelector("[data-ff-evidence-verdict]");
    const live = root.querySelector("[data-ff-evidence-live]");
    let resolved = false;
    let timers = [];

    const clearTimers = () => { timers.forEach(window.clearTimeout); timers = []; };
    const queue = (fn, delay) => timers.push(later(fn, delay));

    function reset() {
      clearTimers();
      resolved = false;
      panel?.setAttribute("aria-busy", "false");
      comps.forEach((row) => row.removeAttribute("data-state"));
      transform.innerHTML = '<strong>24% apparent discount</strong>';
      verdict.innerHTML = '<small>Decision</small><strong>—</strong><p>Inspect the evidence first.</p>';
      button.textContent = "Inspect Evidence (7 Comps Found)";
      button.removeAttribute("disabled");
      if (live) live.textContent = "Evidence Lab reset. Seven comparisons are ready to inspect.";
    }

    function run() {
      if (resolved) return reset();
      resolved = true;
      const keyboardTriggered = document.activeElement === button;
      emitConversion("di_evidence_started", "evidence-lab");
      panel?.setAttribute("aria-busy", "true");
      button.setAttribute("disabled", "");
      button.textContent = "Inspecting evidence…";
      const rejected = comps.filter((row) => row.dataset.result === "reject");
      const accepted = comps.filter((row) => row.dataset.result === "accept");
      rejected.forEach((row, i) => queue(() => row.dataset.state = "rejected", 80 + i * 90));
      accepted.forEach((row, i) => queue(() => row.dataset.state = "accepted", 500 + i * 90));
      queue(() => {
        transform.innerHTML = '<s>24%</s> <span aria-hidden="true">→</span> <strong>2.3%</strong>';
        verdict.innerHTML = '<small>FlipForge decision</small><strong>VERIFY</strong><p>The evidence changed the decision.</p>';
        panel?.setAttribute("aria-busy", "false");
        button.removeAttribute("disabled");
        button.textContent = "Reset Evidence Lab";
        if (live) live.textContent = "Five of seven comparisons were rejected. Two exact comparisons remain. The apparent 24 percent discount becomes a 2.3 percent supported edge. Decision: Verify.";
        emitConversion("di_evidence_completed", "evidence-lab");
        if (keyboardTriggered) panel?.focus({ preventScroll: true });
      }, 800);
    }

    button?.addEventListener("click", run);
  }

  function initIdentityLock() {
    const root = document.querySelector("[data-ff-identity]");
    if (!root) return;
    const button = root.querySelector("[data-ff-identity-run]");
    const checks = [...root.querySelectorAll("[data-ff-id-check]")];
    const result = root.querySelector("[data-ff-id-result]");
    const base = root.querySelector("[data-card='base']");
    const silver = root.querySelector("[data-card='silver']");
    let resolved = false;
    let timers = [];

    const clearTimers = () => { timers.forEach(window.clearTimeout); timers = []; };
    const queue = (fn, delay) => timers.push(later(fn, delay));

    function reset() {
      clearTimers();
      resolved = false;
      result?.setAttribute("aria-busy", "false");
      checks.forEach((check) => check.removeAttribute("data-state"));
      result.removeAttribute("data-resolved");
      result.innerHTML = "Five identity checkpoints must agree before price evidence gets influence.";
      base.style.opacity = "1";
      silver.style.boxShadow = "none";
      button.textContent = "Run Identity Lock";
      button.removeAttribute("disabled");
    }

    function run() {
      if (resolved) return reset();
      resolved = true;
      const keyboardTriggered = document.activeElement === button;
      emitConversion("di_identity_started", "same-card");
      result?.setAttribute("aria-busy", "true");
      button.setAttribute("disabled", "");
      button.textContent = "Checking identity…";
      checks.forEach((check, i) => queue(() => check.dataset.state = "done", i * 120));
      queue(() => {
        base.style.opacity = ".3";
        silver.style.boxShadow = "inset 0 0 0 1px rgba(212,175,55,.42)";
        result.dataset.resolved = "true";
        result.setAttribute("aria-busy", "false");
        result.innerHTML = '<strong>EXACT CARD CONFIRMED</strong><br>2020 Panini Prizm · #307 · Silver Prizm · PSA 10<br><span style="color:#D4AF37">Base-card comparisons disconnected.</span>';
        button.removeAttribute("disabled");
        button.textContent = "Reset Identity Lock";
        emitConversion("di_identity_completed", "same-card");
        if (keyboardTriggered) result.focus({ preventScroll: true });
      }, 680);
    }

    button?.addEventListener("click", run);
  }

  function initDecisionLayer() {
    const root = document.querySelector("[data-ff-decision-layer]");
    if (!root) return;
    const button = root.querySelector("[data-ff-decision-run]");
    const naive = root.querySelector("[data-ff-naive-buy]");
    const risks = [...root.querySelectorAll("[data-ff-risk]")];
    const final = root.querySelector("[data-ff-final]");
    const live = root.querySelector("[data-ff-decision-live]");
    let resolved = false;
    let timers = [];

    const clearTimers = () => { timers.forEach(window.clearTimeout); timers = []; };
    const queue = (fn, delay) => timers.push(later(fn, delay));

    function reset() {
      clearTimers();
      resolved = false;
      final?.setAttribute("aria-busy", "false");
      naive.textContent = "Looks like a BUY: 15% below market";
      naive.style.opacity = "1";
      naive.style.textDecoration = "none";
      risks.forEach((risk) => risk.removeAttribute("data-state"));
      final.removeAttribute("data-state");
      final.innerHTML = '<span>FlipForge decision</span><strong>—</strong><p>Challenge the apparent deal first.</p>';
      button.textContent = "Challenge This Deal";
      button.removeAttribute("disabled");
      if (live) live.textContent = "Decision Layer reset. The apparent discount has not been accepted as a decision.";
    }

    function run() {
      if (resolved) return reset();
      resolved = true;
      const keyboardTriggered = document.activeElement === button;
      emitConversion("di_decision_started", "challenge-deal");
      final?.setAttribute("aria-busy", "true");
      button.setAttribute("disabled", "");
      button.textContent = "Challenging deal…";
      queue(() => {
        naive.textContent = "BUY assumption challenged";
        naive.style.opacity = ".42";
        naive.style.textDecoration = "line-through";
      }, 80);
      risks.forEach((risk, i) => queue(() => risk.dataset.state = "on", 180 + i * 130));
      queue(() => {
        final.dataset.state = "done";
        final.setAttribute("aria-busy", "false");
        final.innerHTML = '<span>FlipForge decision</span><strong>VERIFY</strong><p>Price says deal. Evidence says wait.</p>';
        button.removeAttribute("disabled");
        button.textContent = "Reset Decision Layer";
        if (live) live.textContent = "The apparent buy is challenged by thin evidence, low liquidity, and elevated volatility risk. Decision: Verify.";
        emitConversion("di_decision_completed", "challenge-deal");
        if (keyboardTriggered) final.focus({ preventScroll: true });
      }, 700);
    }

    button?.addEventListener("click", run);
  }

  initEvidenceLab();
  initIdentityLock();
  initDecisionLayer();
})();
