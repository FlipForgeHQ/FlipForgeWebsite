(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const MAIN = "#main-content";
  const OWNED_SELECTOR = "[data-flipforge-phase3-owned]";
  const ENHANCED_ATTRIBUTE = "data-flipforge-phase3-enhanced";
  const emitted = new Set();
  const diagnostics = { observerCallbacks: 0, relevantObserverCallbacks: 0, applyRuns: 0 };
  let scheduled = false;
  let observer = null;
  let observedMain = null;

  function eligible() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeName() {
    return routeParts()[0] || "dashboard";
  }

  function emit(event, placement = "phase3") {
    const key = `${event}:${placement}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const body = JSON.stringify({ event, page: String(window.location.pathname || ""), route: routeName(), placement });
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon("/api/conversion-event", new Blob([body], { type: "application/json" }));
        if (ok) return;
      }
      fetch("/api/conversion-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  // The Dashboard ("Home") first-use and returning panels, their telemetry and the Home heading are rendered by the
  // Dashboard owner (commercial-dashboard-v2.js). This file keeps only its Discover and evaluation-result paths.

  // The saved, server-returned verdict only: the Card Intelligence hero status, which is rendered from the saved
  // record and removed while a card loads (the same source decision-authority-consistency-v1.js uses). Never page
  // text, legends, the injected decision summary or placeholders: during loading those can name a verdict the saved
  // record does not have. Unknown means no guide yet, not a guessed verdict.
  function decisionFrom(root) {
    const exact = node => {
      const value = String(node?.textContent || "").trim().toUpperCase();
      return ["BUY", "WATCH", "VERIFY", "PASS"].includes(value) ? value : "";
    };
    const hero = root.querySelector(".customer-intelligence-hero");
    for (const node of hero ? hero.querySelectorAll(".staging-status,[data-recommendation]") : []) {
      const value = exact(node);
      if (value) return value;
    }
    return "";
  }

  function resultCopy(decision) {
    if (decision === "BUY") return ["The evaluated price cleared the current decision checks.", "Enough governed support exists for BUY at the evaluated price, subject to the visible risk and evidence limits."];
    if (decision === "WATCH") return ["The card may be interesting, but the case is not ready to chase.", "Price, evidence depth, or uncertainty still argues for patience."];
    if (decision === "PASS") return ["The current setup does not support the opportunity.", "Price, evidence, risk, or a combination of those factors keeps the card below FlipForge's decision threshold."];
    return ["This card needs verification before you act.", "Identity, evidence, or another governed uncertainty is still unresolved. FlipForge is withholding stronger authority rather than guessing."];
  }

  function enhanceResult() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return;
    const root = document.querySelector(MAIN);
    const summary = root?.querySelector("[data-ff-decision-summary]");
    const hero = root?.querySelector(".customer-intelligence-hero");
    if (!root || (!summary && !hero)) return;

    const existingGuide = root.querySelector("[data-ff-p3-result-guide]");
    if (root.querySelector("[data-ff-cdi-stack-host]")) {
      if (existingGuide) existingGuide.remove();
      return;
    }
    const decision = decisionFrom(root);
    if (!decision) {
      if (existingGuide) existingGuide.remove();
      return;
    }
    if (existingGuide) {
      if (existingGuide.dataset.decision === decision) return;
      existingGuide.remove();
    }
    const [headline, explanation] = resultCopy(decision);
    const guide = document.createElement("section");
    guide.className = "ff-p3-result-guide ff-p3-enter";
    guide.dataset.ffP3ResultGuide = "";
    guide.dataset.flipforgePhase3Owned = "result-guide";
    guide.dataset.decision = decision;
    guide.innerHTML = `
      <div class="ff-p3-result-guide-head">
        <div>
          <span class="ff-p3-kicker">HOW TO READ THIS RESULT</span>
          <h2>${headline}</h2>
          <p>${explanation}</p>
        </div>
        <span class="ff-p3-result-pill">${decision}</span>
      </div>
      <div class="ff-p3-result-grid">
        <article><span>1 · DECISION</span><strong>Start with the call.</strong><p>BUY, WATCH, VERIFY, or PASS is the governed output—not a prediction or transaction authorization.</p></article>
        <article><span>2 · EVIDENCE</span><strong>Inspect what counted.</strong><p>Open the evidence trail to see the exact reasons evidence was accepted, rejected, or withheld for this card.</p></article>
        <article><span>3 · RECEIPT</span><strong>Keep the reason trail.</strong><p>The Decision Receipt preserves identity, evidence, economics, risk, and the original decision context.</p></article>
      </div>
      <div class="ff-p3-decision-key" aria-label="Decision language">
        ${["BUY","WATCH","VERIFY","PASS"].map(value => `<span data-active="${value === decision ? "true" : "false"}">${value}</span>`).join("")}
      </div>
      <div class="ff-p3-result-actions">
        <a class="button button-primary" href="#/evidence/${encodeURIComponent(parts[1])}" data-ff-p3-open-evidence>Inspect the evidence</a>
        <button class="button button-secondary" type="button" data-ff-p3-open-receipt>Open Decision Receipt</button>
        <a class="button button-secondary" href="#/discover" data-ff-p3-another-card>Evaluate another card</a>
      </div>`;
    const anchor = summary || hero;
    anchor.insertAdjacentElement("afterend", guide);
    anchor.setAttribute(ENHANCED_ATTRIBUTE, "result");
    emit("phase3_first_result_education_viewed", decision.toLowerCase());
    emit("phase3_evaluation_completed", "saved_decision_detail");
  }

  function syncReceiptButton() {
    const root = document.querySelector(MAIN);
    const proxy = root?.querySelector("[data-ff-p3-open-receipt]");
    if (!proxy) return;
    const native = root.querySelector("[data-ff-open-decision-receipt]");
    proxy.disabled = !native;
    proxy.title = native ? "Open the governed Decision Receipt" : "Decision Receipt is not attached to this saved result.";
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest("[data-ff-p3-open-evidence]")) emit("phase3_evidence_opened", "result_education");
      if (target.closest("[data-ff-p3-another-card]")) emit("phase3_evaluate_another_clicked", "result_education");

      if (target.closest("[data-ff-p3-open-receipt]")) {
        const native = document.querySelector(MAIN)?.querySelector("[data-ff-open-decision-receipt]");
        if (native) {
          emit("phase3_decision_receipt_opened", "result_education");
          native.click();
        }
      }
    }, true);

  }

  function nodeIsPhase3Owned(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest?.(OWNED_SELECTOR));
  }

  function routeRelevantSelector() {
    const route = routeName();
    if (route === "opportunities" && routeParts().length > 1) return "[data-ff-decision-summary],.customer-intelligence-hero,[data-ff-open-decision-receipt]";
    return "";
  }

  function nodeTouchesSelector(node, selector) {
    if (!selector) return false;
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element) return false;
    return Boolean(element.matches?.(selector) || element.closest?.(selector) || element.querySelector?.(selector));
  }

  function mutationMatters(record) {
    if (!record || nodeIsPhase3Owned(record.target)) return false;
    const selector = routeRelevantSelector();
    if (!selector) return false;
    if (nodeTouchesSelector(record.target, selector)) return true;
    if (record.type !== "childList") return false;
    const changed = [...record.addedNodes, ...record.removedNodes];
    return changed.some(node => !nodeIsPhase3Owned(node) && nodeTouchesSelector(node, selector));
  }

  function observeMain() {
    const main = document.querySelector(MAIN);
    if (!main || !observer) return;
    observedMain = main;
    observer.observe(main, { childList: true, subtree: true });
  }

  function applyWithoutSelfObservation() {
    if (!eligible()) return;
    diagnostics.applyRuns += 1;
    if (observer) observer.disconnect();
    try {
      // Dashboard is rendered by its owner (commercial-dashboard-v2.js); Discover has no Phase 3 layer.
      enhanceResult();
      syncReceiptButton();
    } finally {
      if (observer) observeMain();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyWithoutSelfObservation();
    });
  }

  function onObservedMutations(records) {
    diagnostics.observerCallbacks += 1;
    if (!Array.isArray(records) || !records.some(mutationMatters)) return;
    diagnostics.relevantObserverCallbacks += 1;
    schedule();
  }

  function init() {
    if (!eligible()) return;
    bindEvents();
    observer = new MutationObserver(onObservedMutations);
    observeMain();
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 40));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("flipforge:identity-change", schedule);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 700);
    schedule();
  }

  window.FlipForgePhase3Activation = Object.freeze({
    refresh: schedule,
    markerAttribute: ENHANCED_ATTRIBUTE,
    ownedSelector: OWNED_SELECTOR,
    observedRoot: () => observedMain,
    diagnostics: () => Object.freeze({ ...diagnostics })
  });
  init();
})();