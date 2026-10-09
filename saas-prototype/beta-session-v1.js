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

  function simplifyDiscover() {
    if (routeName() !== "discover") return;
    const main = document.querySelector("#main-content");
    const form = main?.querySelector("[data-customer-discovery-form]");
    const panel = form?.closest(".customer-discovery-search");
    if (!form || !panel) return;
    if (panel.dataset.ffDiscoverCopyOwner !== "beta-session") {
      panel.dataset.ffDiscoverCopyOwner = "beta-session";
    }

    const pageHeading = main.querySelector(".page-heading");
    if (pageHeading) {
      setText(pageHeading.querySelector(".eyebrow"), "Evaluate");
      setText(pageHeading.querySelector("h1"), "Evaluate a Card");
      setText(pageHeading.querySelector("p"), "Enter your card, find a listing for sale, then choose which listing FlipForge should evaluate.");
      hideNode(pageHeading.querySelector(".page-actions"));
    }

    const heading = panel.querySelector("h2");
    const intro = panel.querySelector(".panel-header p");
    if (heading && heading.textContent !== "Find listings for your card") heading.textContent = "Find listings for your card";
    const introCopy = "Enter the year, player, set and card number when known. Search listings when you know the version, or check the card identity first if you are unsure.";
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
    // One primary action: listings; no identity is silently declared confirmed.
    if (submit && !submit.disabled && !/Searching|Resolving/i.test(String(submit.textContent || "")) && submit.textContent !== "Search listings") {
      submit.textContent = "Search listings";
    }
    if (submit) {
      submit.setAttribute("aria-label", "Search active listings for the card entered");
      submit.title = "Find listings currently for sale. You'll choose one before FlipForge evaluates it.";
    }
    const exact = form.querySelector("[data-discovery-find-exact]");
    if (exact && !exact.disabled && exact.textContent !== "Check card identity") exact.textContent = "Check card identity";
    if (exact) {
      exact.setAttribute("aria-label", "Check card identity before searching listings");
      exact.title = "Use this if you are unsure of the parallel, variation, or card number. No listing search or evaluation starts yet.";
    }
    const actions = form.querySelector(".customer-discovery-search-actions");
    if (actions && !form.querySelector("[data-ff-beta-identity-hint]")) {
      const hint = document.createElement("p");
      hint.dataset.ffBetaIdentityHint = "";
      hint.className = "ff-beta-identity-hint";
      hint.textContent = "Not sure which version of the card you have? Check card identity first. Otherwise, search listings.";
      actions.insertAdjacentElement("afterend", hint);
    }

    const help = panel.querySelector(".customer-discovery-search-help");
    const helpCopy = "For accurate results, include <strong>year · set · player · card number · parallel · grader · grade</strong> when known. Checking identity only helps confirm the card; searching finds listings for sale.";
    if (help && help.innerHTML !== helpCopy) help.innerHTML = helpCopy;

    hideTechnicalSectionByHeading(/^Connected source status$/i);
    main.querySelectorAll(".customer-discovery-identity-assist .boundary-note").forEach(hideNode);
    main.querySelectorAll(".boundary-note").forEach(hideNode);
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

  function simplifyTracking() {
    if (routeName() !== "tracking") return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Decision follow-up");
      setText(heading.querySelector("h1"), "Tracking");
      setText(heading.querySelector("p"), "Choose what happens next with this saved card: keep watching, set a review date, record ownership, or close it out.");
      hideNode(heading.querySelector(".page-actions"));
    }

    main.querySelectorAll(".customer-management-metrics,.boundary-note").forEach(hideNode);
    const save = main.querySelector('[data-lifecycle-form] button[type="submit"]');
    if (save && !save.disabled && !/Saving/i.test(String(save.textContent || ""))) setText(save, "Save update");
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
    simplifyDecision();
    simplifySavedDecisions();
    simplifyTracking();
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
    const nav = document.querySelector(".primary-nav");
    if (nav) new MutationObserver(schedule).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "tabindex", "class"] });
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 50));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    schedule();
  }

  window.FlipForgeBetaSessionV1 = Object.freeze({ refresh: schedule });
  init();
})();
