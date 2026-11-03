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

  function syncMilestones() {
    const parts = routeParts();
    if (parts[0] === "opportunities" && parts.length > 1 && pendingEvaluation()) {
      emit("evaluation_completed");
      emit("decision_saved");
      setPendingEvaluation(false);
    }
    if (parts[0] === "tracking") emit("tracking_viewed");
  }

  // Beta telemetry only. Every screen renders its own beta view (owners); this file no longer changes the page.
  function apply() {
    if (!eligible()) return;
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
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 50));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    schedule();
  }

  window.FlipForgeBetaSessionV1 = Object.freeze({ refresh: schedule });
  init();
})();
