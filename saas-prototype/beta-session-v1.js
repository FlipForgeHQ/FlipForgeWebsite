(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ENDPOINT = "/api/conversion-event";
  const PAGE = "beta-app";
  const PLACEMENT = "workflow";
  // The one in-app sender. Fixed event names, the fixed page "beta-app" and fixed placements only: never a path, URL,
  // query string, card, listing, price, verdict, free text, email or account identifier. /api/conversion-event
  // allowlists exactly these names (scripts/validate-conversion-event-contract.mjs keeps the two in step).
  const EVENTS = new Set([
    "evaluation_started", "evaluation_completed", "decision_saved", "decision_explanation_viewed", "tracking_viewed",
    "home_first_use_viewed", "home_returning_viewed", "home_evaluate_clicked", "home_shortcut_clicked",
    "decision_checks_viewed", "decision_receipt_opened", "evidence_viewed", "portfolio_viewed", "alerts_viewed",
    "forge_heat_viewed"
  ]);
  const SHORTCUT_PLACEMENTS = Object.freeze({ saved: "shortcut_saved", outcomes: "shortcut_outcomes", heat: "shortcut_heat", portfolio: "shortcut_portfolio" });
  const PLACEMENTS = new Set([PLACEMENT, ...Object.values(SHORTCUT_PLACEMENTS)]);
  // Screen views, counted once per browser tab. The route name decides the event; nothing from the route is sent.
  const ROUTE_VIEWS = Object.freeze({ tracking: "tracking_viewed", portfolio: "portfolio_viewed", alerts: "alerts_viewed", "forge-heat": "forge_heat_viewed", evidence: "evidence_viewed" });
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

  function routeParts(hash = window.location.hash) {
    return String(hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeName() {
    return routeParts()[0] || "dashboard";
  }

  function sentKey(event, placement) {
    return placement === PLACEMENT ? `${SENT_PREFIX}${event}` : `${SENT_PREFIX}${event}.${placement}`;
  }

  function sent(key) {
    try { return window.sessionStorage.getItem(key) === "1"; }
    catch (_) { return false; }
  }

  function markSent(key) {
    try { window.sessionStorage.setItem(key, "1"); }
    catch (_) { /* telemetry must not affect the app */ }
  }

  function emit(event, placement = PLACEMENT) {
    if (!EVENTS.has(event) || !PLACEMENTS.has(placement)) return;
    const key = sentKey(event, placement);
    if (!eligible() || sent(key)) return;
    markSent(key);
    const body = JSON.stringify({ event, page: PAGE, placement });
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

  function syncMilestones(hash) {
    const parts = routeParts(hash);
    if (parts[0] === "opportunities" && parts.length > 1 && pendingEvaluation()) {
      emit("evaluation_completed");
      emit("decision_saved");
      setPendingEvaluation(false);
    }
    if (Object.hasOwn(ROUTE_VIEWS, parts[0])) emit(ROUTE_VIEWS[parts[0]]);
  }

  // Beta telemetry only. Every screen renders its own beta view (owners); this file no longer changes the page.
  function apply(hash) {
    if (!eligible()) return;
    syncMilestones(hash);
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

  // Observation only: a window capture listener runs before any page handler (several stop the event at the document,
  // for example scroll-reset.js on Saved Decisions links), and it never calls preventDefault or stopPropagation, so
  // every owner keeps its behaviour.
  window.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // Home (commercial-dashboard-v2.js). The Private Beta Home opens on its "Start here" panel: its "Evaluate a card"
    // CTA and "Saved Decisions" link; the first-use CTA and the four returning shortcuts show under "Show full dashboard".
    const home = target.closest("[data-commercial-dashboard-v2]");
    if (home && target.closest(".ffguided-home-cta, [data-ff-p3-first-evaluate]")) emit("home_evaluate_clicked");
    const returning = home && target.closest("[data-ff-p3-return]");
    if (returning && Object.hasOwn(SHORTCUT_PLACEMENTS, returning.getAttribute("data-ff-p3-return"))) {
      emit("home_shortcut_clicked", SHORTCUT_PLACEMENTS[returning.getAttribute("data-ff-p3-return")]);
    }
    if (home && target.closest('.ffguided-home-footer a[href="#/opportunities"]')) emit("home_shortcut_clicked", SHORTCUT_PLACEMENTS.saved);
    // Saved decision (CDI Signal Stack, customer-cdi-signal-stack-v1.js): "See why" / "Replay the 4 checks", and the
    // Decision Receipt controls of the stack and of the evidence passport (decision-card-evidence-v1.js).
    if (target.closest("[data-ff-cdi-start], [data-ff-cdi-replay]")) emit("decision_checks_viewed");
    if (target.closest("[data-ff-cdi-receipt], [data-ff-open-decision-receipt]")) emit("decision_receipt_opened");
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
    // Each route change is checked for the route it opened (event.newURL), at once: a deferred check read whatever
    // route was current by then, so a screen left within that delay was never counted.
    window.addEventListener("hashchange", event => {
      let hash = window.location.hash;
      try { hash = new URL(event.newURL).hash; } catch (_) { /* current hash */ }
      apply(hash);
    });
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    schedule();
  }

  // Home tells this file which state it rendered from the server's saved-decision count (first use: none saved;
  // returning: at least one). Only these two names are accepted here.
  function homeShown(state) {
    if (state === "first-use") emit("home_first_use_viewed");
    else if (state === "returning") emit("home_returning_viewed");
  }

  window.FlipForgeBetaSessionV1 = Object.freeze({ refresh: schedule, homeShown });
  init();
})();
