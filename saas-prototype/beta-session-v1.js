(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
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

  function hideTechnicalSectionByHeading(pattern) {
    const main = document.querySelector("#main-content");
    if (!main) return;
    [...main.querySelectorAll("h2,h3")].forEach(heading => {
      if (!pattern.test(String(heading.textContent || "").trim())) return;
      const section = heading.closest("section,article,.panel");
      if (section) section.dataset.ffBetaSessionHidden = "true";
    });
  }

  function simplifyDiscover() {
    if (routeName() !== "discover") return;
    const main = document.querySelector("#main-content");
    const form = main?.querySelector("[data-customer-discovery-form]");
    const panel = form?.closest(".customer-discovery-search");
    if (!form || !panel) return;

    const heading = panel.querySelector("h2");
    const intro = panel.querySelector(".panel-header p");
    if (heading && heading.textContent !== "Evaluate one card") heading.textContent = "Evaluate one card";
    const introCopy = "Start with the exact card you are considering. Include the year, set, player, card number, parallel, grader and grade when you know them.";
    if (intro && intro.textContent !== introCopy) intro.textContent = introCopy;

    const cardLabel = form.querySelector('input[name="exactCardQuery"]')?.closest("label");
    const priceLabel = form.querySelector('input[name="targetMaxBuy"]')?.closest("label");
    const resultsSelect = form.querySelector('select[name="limit"]');
    const resultsLabel = resultsSelect?.closest("label");
    if (cardLabel?.querySelector("span") && cardLabel.querySelector("span").textContent !== "Card") cardLabel.querySelector("span").textContent = "Card";
    if (priceLabel?.querySelector("span") && priceLabel.querySelector("span").textContent !== "Max price (optional)") priceLabel.querySelector("span").textContent = "Max price (optional)";
    if (resultsLabel) {
      resultsLabel.dataset.ffBetaHiddenControl = "true";
      resultsLabel.setAttribute("aria-hidden", "true");
    }
    if (resultsSelect) {
      resultsSelect.tabIndex = -1;
      resultsSelect.setAttribute("aria-hidden", "true");
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit && !submit.disabled && !/Searching|Resolving/i.test(String(submit.textContent || "")) && submit.textContent !== "Find this card") {
      submit.textContent = "Find this card";
    }
    const exact = form.querySelector("[data-discovery-find-exact]");
    if (exact && !exact.disabled && exact.textContent !== "Help me find the exact card") exact.textContent = "Help me find the exact card";

    const help = panel.querySelector(".customer-discovery-search-help");
    const helpCopy = "Best results: <strong>year · set · player · card number · parallel · grader · grade</strong>. If you do not know every detail, FlipForge can help you identify the exact card first.";
    if (help && help.innerHTML !== helpCopy) help.innerHTML = helpCopy;

    hideTechnicalSectionByHeading(/^Connected source status$/i);
    main.querySelectorAll(".customer-discovery-identity-assist .boundary-note").forEach(node => {
      node.dataset.ffBetaSessionHidden = "true";
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
    document.documentElement.classList.add("ff-beta-session-v1");
    simplifyDiscover();
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
