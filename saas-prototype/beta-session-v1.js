(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ENDPOINT = "/api/conversion-event";
  const PAGE = "beta-app";
  const PLACEMENT = "workflow";
  const PENDING_KEY = "flipforge.betaSession.pendingEvaluation";
  const SENT_PREFIX = "flipforge.betaSession.sent.";
  let scheduled = false;

  function eligible() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(path)
      && !FULL_CUSTOMER_PATH.test(path);
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

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function sent(event) {
    try { return window.sessionStorage.getItem(`${SENT_PREFIX}${event}`) === "1"; }
    catch (_) { return false; }
  }

  function markSent(event) {
    try { window.sessionStorage.setItem(`${SENT_PREFIX}${event}`, "1"); }
    catch (_) { /* telemetry must not affect the app */ }
  }

  function emit(event) {
    if (!eligible() || sent(event)) return;
    markSent(event);
    const body = JSON.stringify({ event, page: PAGE, placement: PLACEMENT });
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        body
      }).catch(() => {});
    } catch (_) {
      // Measurement is best-effort and must never block the customer journey.
    }
  }

  function setPendingEvaluation(value) {
    try {
      if (value) window.sessionStorage.setItem(PENDING_KEY, "1");
      else window.sessionStorage.removeItem(PENDING_KEY);
    } catch (_) { /* session state is optional */ }
  }

  function pendingEvaluation() {
    try { return window.sessionStorage.getItem(PENDING_KEY) === "1"; }
    catch (_) { return false; }
  }

  function hideNode(node) {
    if (!node) return;
    node.dataset.ffBetaSessionHidden = "true";
    node.setAttribute("aria-hidden", "true");
  }

  function hideTechnicalSectionByHeading(pattern) {
    const main = document.querySelector("#main-content");
    if (!main) return;
    [...main.querySelectorAll("h2,h3")].forEach(heading => {
      if (!pattern.test(String(heading.textContent || "").trim())) return;
      const section = heading.closest("section,article,.panel,.customer-intelligence-section");
      if (section) hideNode(section);
    });
  }

  function simplifyDecision() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Your result");
      setText(heading.querySelector("h1"), "Your Decision");
      setText(heading.querySelector("p"), "Start with the decision and the reason. Open the evidence only when you want the deeper proof.");
      const legacyActions = heading.querySelector(".page-actions");
      hideNode(legacyActions);
      const legacyTrack = legacyActions?.querySelector("a[href^='#/tracking/']");
      if (legacyTrack) legacyTrack.setAttribute("href", "#/tracking");
    }

    hideTechnicalSectionByHeading(/^(Forge Heat|Price Intelligence|Historical sold evidence|How to read this decision|Decision details|Evidence details|PSA context|Evidence)$/i);
    hideTechnicalSectionByHeading(/^What changes (?:this|the) decision\??$/i);
    main.querySelectorAll(".boundary-note").forEach(hideNode);

    const moreDetail = [...main.querySelectorAll("button,a,summary")].find(node => /More decision detail/i.test(String(node.textContent || "")));
    if (moreDetail) hideNode(moreDetail.closest("section,article,.panel,details") || moreDetail);
  }

  function simplifySavedDecisions() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length !== 1) return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Saved cards");
      setText(heading.querySelector("h1"), "Saved Decisions");
      setText(heading.querySelector("p"), "Reopen a card to review the decision or continue tracking it.");
      hideNode(heading.querySelector(".page-actions"));
    }

    main.querySelectorAll(".metric-grid,.dashboard-grid,.customer-management-metrics,.boundary-note").forEach(hideNode);
    main.querySelectorAll("section,article,.panel").forEach(section => {
      const text = String(section.textContent || "").replace(/\s+/g, " ").trim();
      if (/MODEL/i.test(text) && /TRANSACTION ACTIONS/i.test(text) && /CUSTOMER CONTROLS/i.test(text)) hideNode(section);
    });
  }

  function syncMilestones() {
    const parts = routeParts();
    if (parts[0] === "opportunities" && parts.length > 1 && pendingEvaluation()) {
      emit("evaluation_completed");
      emit("decision_saved");
      setPendingEvaluation(false);
    }
    if (parts[0] === "tracking") emit("tracking_viewed");
  }

  function apply() {
    if (!eligible()) return;
    // Discover renders its beta wording itself (customer-discovery.js); the ff-beta-session-v1 class is in index.html.
    simplifyDecision();
    simplifySavedDecisions();
    syncMilestones();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-discovery-evaluate]")) {
      setPendingEvaluation(true);
      emit("evaluation_started");
    }
  }, true);

  // The existing explanation handler intentionally stops the click event at the
  // document capture boundary. Pointer-down lets this telemetry observe the user's
  // intent without changing or competing with the decision-explanation behavior.
  document.addEventListener("pointerdown", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-ff-show-why]")) emit("decision_explanation_viewed");
  }, true);

  function init() {
    if (!eligible()) return;
    const main = document.querySelector("#main-content");
    if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 50));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    schedule();
  }

  window.FlipForgeBetaSessionV1 = Object.freeze({ refresh: schedule });
  init();
})();
