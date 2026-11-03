(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
  }

  function opportunityId() {
    const parts = routeParts();
    return parts[0] === "opportunities" && parts.length > 1 ? parts[1] : "";
  }

  function openDecisionEvidence() {
    const id = opportunityId();
    if (!id) return false;
    window.location.hash = `#/evidence/${encodeURIComponent(id)}`;
    return true;
  }

  function isGuidedExplainAction(button) {
    if (!button || !opportunityId()) return false;
    const type = String(button.dataset.guideAction || "");
    if (type !== "highlight" && type !== "understand") return false;
    const label = String(button.textContent || "").trim();
    return /^(?:Show me why|Show me what is missing|I understand this decision)/i.test(label);
  }

  function decorateDiscover() {
    const parts = routeParts();
    const main = document.querySelector("#main-content");
    if (parts[0] !== "discover" || !main) return;
    const page = main.querySelector(".customer-discovery-page");
    const search = page?.querySelector(".customer-discovery-search");
    if (!page || !search) return;

    const submit = search.querySelector("[data-customer-discovery-form] button[type='submit']");
    if (submit && !submit.disabled && /^Search connected sources$/i.test(String(submit.textContent || "").trim())) {
      submit.textContent = "Search active listings";
    }

    let note = page.querySelector("[data-ff-discover-persistence-note]");
    if (!note) {
      note = document.createElement("div");
      note.className = "ff-discover-persistence-note";
      note.dataset.ffDiscoverPersistenceNote = "";
      search.insertAdjacentElement("afterend", note);
    }
    if (note.dataset.ffDiscoverPersistenceReady !== "true") {
      note.innerHTML = `<span aria-hidden="true">✓</span><div><strong>Searches are temporary; evaluated decisions are saved.</strong> Use <strong>Discover a card</strong> anytime to clear the current Discover workspace and start fresh. Cards you already evaluated stay saved.</div>`;
      note.dataset.ffDiscoverPersistenceReady = "true";
    }
  }

  function cleanKnownLimitations() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    main.querySelectorAll("details").forEach(details => {
      const summary = details.querySelector(":scope > summary");
      if (!/^Known limitations$/i.test(String(summary?.textContent || "").trim())) return;
      const list = details.querySelector(":scope > ul");
      if (!list) return;
      [...list.querySelectorAll(":scope > li")].forEach(item => {
        if (!String(item.textContent || "").trim()) item.remove();
      });
      if (!list.querySelector(":scope > li")) details.remove();
    });
  }

  function clarifyGuidedProgress() {
    const panel = document.querySelector("#ff-guided-mode-root .ff-guide-panel");
    if (!panel) return;
    const location = String(panel.querySelector(".ff-guide-location")?.textContent || "").trim();
    const labels = panel.querySelectorAll(".ff-guide-progress-top span");
    if (labels.length < 2) return;
    const status = String(labels[1].textContent || "").replace(/\s+/g, " ").trim();
    if (!/^4\s*\/\s*4\s*complete$/i.test(status)) return;

    const currentStep = location.match(/\bStep\s+([1-4])\b/i)?.[1] || "";
    const primary = "Core path learned";
    const secondary = currentStep ? `Current card · Step ${currentStep}` : "Ready for another card";
    if (labels[0].textContent !== primary) labels[0].textContent = primary;
    if (labels[1].textContent !== secondary) labels[1].textContent = secondary;
  }

  function observeGuide() {
    const guide = document.getElementById("ff-guided-mode-root");
    if (!guide || guide.dataset.ffProgressClarityObserved === "true") return;
    guide.dataset.ffProgressClarityObserved = "true";
    new MutationObserver(clarifyGuidedProgress).observe(guide, { childList: true, subtree: true });
    clarifyGuidedProgress();
  }

  // One-time "just evaluated" flag (set when Evaluate is pressed in Discover). The saved decision page reads it once,
  // when it renders the saved confirmation (customer-opportunities.js).
  function consumeJustEvaluated() {
    try {
      const pending = window.sessionStorage.getItem("flipforge.pendingEvaluationSave") === "1";
      if (pending) window.sessionStorage.removeItem("flipforge.pendingEvaluationSave");
      return pending;
    } catch (_) { return false; }
  }
  window.FlipForgeSaveFlow = Object.freeze({ consumeJustEvaluated });

  function decorate() {
    if (!eligibleHost()) return;
    decorateDiscover();
    cleanKnownLimitations();
    observeGuide();
    clarifyGuidedProgress();
  }

  // The saved decision page's "Understand this decision" is a plain link to the evidence (customer-opportunities.js
  // renders the saved bar). Guided Mode's explain buttons on that page go to the same evidence.
  document.addEventListener("click", event => {
    const guided = event.target.closest("[data-guide-action]");
    if (!isGuidedExplainAction(guided)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDecisionEvidence();
  }, true);

  window.addEventListener("hashchange", () => window.setTimeout(decorate, 60));

  const main = document.querySelector("#main-content");
  if (main) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        decorate();
      });
    }).observe(main, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(decorate, 0), { once: true });
  }
  decorate();
})();
