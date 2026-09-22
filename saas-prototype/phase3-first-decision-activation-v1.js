(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
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

  function trackedCount(root) {
    const cards = [...root.querySelectorAll(".ff-kpi-card")];
    const card = cards.find(node => /Tracked Decisions/i.test(String(node.textContent || "")));
    const value = card?.querySelector(".ff-kpi-value")?.textContent || "";
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstUseActivation(root) {
    if (root.querySelector("[data-ff-p3-activation]")) return;
    const head = root.querySelector(".ff-dashboard-head");
    if (!head) return;
    const section = document.createElement("section");
    section.className = "ff-p3-activation ff-p3-home-zero ff-p3-enter";
    section.dataset.ffP3Activation = "";
    section.dataset.flipforgePhase3Owned = "first-use";
    section.innerHTML = `
      <div class="ff-p3-home-zero-grid">
        <div class="ff-p3-home-zero-copy">
          <span class="ff-p3-kicker">START HERE · YOUR FIRST DECISION</span>
          <h2>Evaluate your first card.</h2>
          <p>Start with one exact card you are genuinely considering. FlipForge will verify the identity, qualify the evidence, return the governed decision, and preserve the reason trail.</p>
          <div class="ff-p3-actions">
            <a class="button button-primary" href="#/discover" data-ff-p3-first-evaluate>Find a card to evaluate</a>
            <a class="button button-secondary" href="#/evaluate">Enter a listing manually</a>
          </div>
          <a class="ff-p3-home-learn" href="#/decision-intelligence">New to FlipForge? See how Card Decision Intelligence works →</a>
        </div>
        <div class="ff-p3-home-path" aria-label="Your first FlipForge decision">
          <div class="ff-p3-first-step"><b>01</b><span><strong>Find the exact card</strong><small>Identity is verified before price evidence gets authority.</small></span></div>
          <div class="ff-p3-first-step"><b>02</b><span><strong>Let the evidence earn its place</strong><small>Wrong, weak, or ineligible comparisons are kept from silently driving the result.</small></span></div>
          <div class="ff-p3-first-step"><b>03</b><span><strong>Read the decision and receipt</strong><small>BUY, WATCH, VERIFY, or PASS—with the reasons and uncertainty preserved.</small></span></div>
        </div>
      </div>
      <div class="ff-p3-home-zero-footer">
        <span>Nothing else is required for your first session.</span>
        <small>Saved-decision analytics, Outcome Intelligence, Portfolio, and other tools become useful after you have real decisions to work with.</small>
      </div>`;
    head.insertAdjacentElement("afterend", section);
    root.setAttribute(ENHANCED_ATTRIBUTE, "dashboard:first-use");
    emit("phase3_first_use_shown", "dashboard_zero_saved");
  }

  function returningHome(root, tracked) {
    if (root.querySelector("[data-ff-p3-returning]")) return;
    const head = root.querySelector(".ff-dashboard-head");
    if (!head) return;
    const section = document.createElement("section");
    section.className = "ff-p3-returning ff-p3-enter";
    section.dataset.ffP3Returning = "";
    section.dataset.flipforgePhase3Owned = "returning-home";
    section.innerHTML = `
      <div class="ff-p3-returning-head">
        <div><span class="ff-p3-kicker">CONTINUE YOUR INTELLIGENCE</span><h2>Your decisions are now the starting point.</h2></div>
        <p>${tracked} saved decision${tracked === 1 ? "" : "s"} in your tenant-owned workspace.</p>
      </div>
      <div class="ff-p3-returning-grid">
        <a class="ff-p3-returning-card" href="#/opportunities" data-ff-p3-return="saved"><span>01</span><strong>Saved Decisions</strong><small>Reopen the exact cards you already evaluated.</small></a>
        <a class="ff-p3-returning-card" href="#/tracking" data-ff-p3-return="outcomes"><span>02</span><strong>Outcome Intelligence</strong><small>Follow immutable T0 through T7, T14, and T30.</small></a>
        <a class="ff-p3-returning-card" href="#/forge-heat" data-ff-p3-return="heat"><span>03</span><strong>Forge Heat</strong><small>Investigate evidence-qualified discovery signals.</small></a>
        <a class="ff-p3-returning-card" href="#/portfolio" data-ff-p3-return="portfolio"><span>04</span><strong>Portfolio</strong><small>See your saved cards in a broader decision context.</small></a>
      </div>`;
    head.insertAdjacentElement("afterend", section);
    root.setAttribute(ENHANCED_ATTRIBUTE, "dashboard:returning");
    emit("phase3_returning_home_shown", "dashboard_saved");
  }

  function enhanceDashboard() {
    if (routeName() !== "dashboard") return;
    const root = document.querySelector(MAIN);
    if (!root) return;
    const dashboard = root.querySelector("[data-commercial-dashboard-v2]") || root.querySelector(".ff-commercial-dashboard");
    if (!dashboard) return;
    const tracked = trackedCount(dashboard);
    if (tracked === null) return;

    const head = dashboard.querySelector(".ff-dashboard-head");
    const title = head?.querySelector("h1");
    const intro = head?.querySelector("p");
    if (title && title.textContent !== "Home") title.textContent = "Home";

    const primary = dashboard.querySelector(".ff-dashboard-head-actions .button-primary");
    const first = dashboard.querySelector("[data-ff-p3-activation]");
    const returning = dashboard.querySelector("[data-ff-p3-returning]");

    if (tracked <= 0) {
      dashboard.classList.add("ff-p3-zero-dashboard");
      dashboard.classList.remove("ff-p3-returning-dashboard");
      if (intro) intro.textContent = "Start with one real card. FlipForge will guide you from exact identity to evidence, decision, and Decision Receipt.";
      if (primary && (primary.getAttribute("href") !== "#/discover" || primary.textContent !== "Evaluate first card")) {
        primary.setAttribute("href", "#/discover");
        primary.textContent = "Evaluate first card";
      }
      if (returning) returning.remove();
      if (!first) firstUseActivation(dashboard);
    }

    if (tracked > 0) {
      dashboard.classList.remove("ff-p3-zero-dashboard");
      dashboard.classList.add("ff-p3-returning-dashboard");
      if (intro) intro.textContent = "Continue from your saved decisions, review what changed, and investigate the next card when you are ready.";
      if (first) first.remove();
      if (!returning) returningHome(dashboard, tracked);
    }
  }

  function evaluateStage(root) {
    if (root.querySelector(".customer-discovery-identity-assist")) return "identity-review";
    const evaluating = [...root.querySelectorAll("[data-discovery-evaluate]")].some(button => /Evaluating/i.test(String(button.textContent || "")));
    if (evaluating) return "handoff";
    if (root.querySelector(".customer-discovery-results")) return "evidence";
    return "identity";
  }

  function enhanceEvaluate() {
    if (routeName() !== "discover") return;
    const root = document.querySelector(MAIN);
    const form = root?.querySelector("[data-customer-discovery-form]");
    const panel = form?.closest(".customer-discovery-search");
    if (!root || !form || !panel) return;

    if (!panel.classList.contains("ff-p3-evaluate-card")) panel.classList.add("ff-p3-evaluate-card");
    if (panel.getAttribute(ENHANCED_ATTRIBUTE) !== "evaluate") {
      panel.setAttribute(ENHANCED_ATTRIBUTE, "evaluate");
    }
    let shell = root.querySelector("[data-ff-p3-evaluate-shell]");
    if (!shell) {
      shell = document.createElement("section");
      shell.className = "ff-p3-evaluate-shell ff-p3-enter";
      shell.dataset.ffP3EvaluateShell = "";
      shell.dataset.flipforgePhase3Owned = "evaluate-shell";
      shell.innerHTML = `
        <div class="ff-p3-evaluate-intro" data-ff-p3-evaluate-intro data-stage="identity">
          <div class="ff-p3-evaluate-copy">
            <small>CARD DECISION INTELLIGENCE™ · LIVE EVALUATE FLOW</small>
            <h2 data-ff-p3-evaluate-title>Verify the card first.</h2>
            <p data-ff-p3-evaluate-copy>Enter the exact card you are considering. FlipForge will not let uncertain identity silently become trusted price evidence.</p>
          </div>
          <div class="ff-p3-evaluate-rail" aria-label="Evaluation progress">
            <div class="ff-p3-evaluate-step" data-p3-step="identity"><b>01</b><strong>Identity</strong><small>Prove the card.</small></div>
            <div class="ff-p3-evaluate-step" data-p3-step="evidence"><b>02</b><strong>Evidence</strong><small>Qualify what counts.</small></div>
            <div class="ff-p3-evaluate-step" data-p3-step="decision"><b>03</b><strong>Decision</strong><small>Resolve the call.</small></div>
            <div class="ff-p3-evaluate-step" data-p3-step="receipt"><b>04</b><strong>Receipt</strong><small>Keep the reason trail.</small></div>
          </div>
        </div>`;
      // Keep the Phase 3 intelligence rail outside the Discover panel's
      // shared enhancement zone. Several existing customer-polish observers own
      // descendants of .customer-discovery-search; nesting Phase 3 there lets
      // independent runtimes rewrite the same nodes and can create cross-observer
      // oscillation even when Phase 3 itself is idempotent.
      panel.insertAdjacentElement("beforebegin", shell);
      emit("phase3_evaluate_flow_viewed", "discover");
    }

    const intro = shell.querySelector("[data-ff-p3-evaluate-intro]");
    const title = shell.querySelector("[data-ff-p3-evaluate-title]");
    const copy = shell.querySelector("[data-ff-p3-evaluate-copy]");
    const stage = evaluateStage(root);
    if (intro.dataset.stage !== stage) intro.dataset.stage = stage;

    const messages = {
      identity: ["Verify the card first.", "Enter the exact card you are considering. FlipForge will not let uncertain identity silently become trusted price evidence."],
      "identity-review": ["Choose the exact identity.", "FlipForge found more than one plausible identity. Select the correct card before marketplace evidence can move downstream."],
      evidence: ["Now test what deserves to count.", "Connected candidates are visible, but only exact eligible evidence can move into the governed evaluation."],
      handoff: ["Build the decision.", "The selected exact listing is moving through evidence, economics, risk, and the governed decision path."]
    };
    const current = messages[stage] || messages.identity;
    if (title.textContent !== current[0]) title.textContent = current[0];
    if (copy.textContent !== current[1]) copy.textContent = current[1];
  }

  function decisionFrom(root) {
    const direct = root.querySelector(".ff-decision-summary-pill,[data-decision]");
    const text = String(direct?.textContent || direct?.getAttribute?.("data-decision") || "").toUpperCase();
    for (const decision of ["BUY","WATCH","VERIFY","PASS"]) if (text.includes(decision)) return decision;
    const all = String(root.textContent || "").toUpperCase();
    for (const decision of ["VERIFY","WATCH","PASS","BUY"]) if (all.includes(decision)) return decision;
    return "VERIFY";
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
    if (!root || (!summary && !hero) || root.querySelector("[data-ff-p3-result-guide]")) return;

    const decision = decisionFrom(root);
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

      if (target.closest("[data-ff-p3-first-evaluate]")) emit("phase3_first_evaluate_clicked", "dashboard");
      const returning = target.closest("[data-ff-p3-return]");
      if (returning) emit("phase3_returning_action_clicked", returning.getAttribute("data-ff-p3-return") || "unknown");
      if (target.closest("[data-discovery-find-exact]")) emit("phase3_identity_resolution_started", "discover");
      if (target.closest("[data-discovery-use-identity]")) emit("phase3_identity_selected", "discover");
      if (target.closest("[data-discovery-evaluate]")) emit("phase3_governed_evaluation_started", "discover_candidate");
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

    document.addEventListener("submit", event => {
      const form = event.target instanceof Element ? event.target.closest("[data-customer-discovery-form]") : null;
      if (form) emit("phase3_card_search_submitted", "discover");
    }, true);

    document.addEventListener("input", event => {
      const input = event.target instanceof Element ? event.target.closest('[data-customer-discovery-form] input[name="exactCardQuery"]') : null;
      if (input && String(input.value || "").trim().length >= 3) emit("phase3_card_identity_engaged", "discover");
    }, true);
  }

  function nodeIsPhase3Owned(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest?.(OWNED_SELECTOR));
  }

  function routeRelevantSelector() {
    const route = routeName();
    if (route === "dashboard") return "[data-commercial-dashboard-v2],.ff-commercial-dashboard,.ff-kpi-card,.ff-kpi-value";
    if (route === "discover") return "[data-customer-discovery-form],.customer-discovery-search,.customer-discovery-identity-assist,.customer-discovery-results,[data-discovery-evaluate]";
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
      enhanceDashboard();
      enhanceEvaluate();
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