(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

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

  function decorateSavedDecision() {
    const id = opportunityId();
    const main = document.querySelector("#main-content");
    if (!id || !main) {
      main?.querySelector?.("[data-ff-saved-decision-bar]")?.remove();
      return;
    }

    const hero = main.querySelector(".customer-intelligence-hero");
    let bar = main.querySelector("[data-ff-saved-decision-bar]");

    // Do not stack save guidance above a loading state. The authoritative
    // decision should be the first meaningful result the customer sees.
    if (!hero) {
      bar?.remove();
      return;
    }

    if (!bar) {
      bar = document.createElement("section");
      bar.className = "ff-saved-decision-bar";
      bar.dataset.ffSavedDecisionBar = "";
      bar.setAttribute("role", "status");
      bar.innerHTML = `<div class="ff-saved-decision-copy"><span class="ff-saved-decision-check" aria-hidden="true">✓</span><div><strong>Saved automatically</strong><small>This evaluated decision is already in Saved Intelligence. Starting another card clears only the Discover workspace; this decision stays saved.</small></div></div><div class="ff-saved-decision-actions"><a class="button button-secondary" href="#/tracking/${encodeURIComponent(id)}">Track this card</a><button class="button button-primary" type="button" data-ff-new-card>+ Start another card</button><a class="button button-secondary" href="#/opportunities">View saved decisions</a></div>`;
    }

    if (hero.nextElementSibling !== bar) hero.insertAdjacentElement("afterend", bar);
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
    note.innerHTML = `<span aria-hidden="true">✓</span><div><strong>Searches are temporary; evaluated decisions are saved.</strong> Use <strong>Discover a card</strong> anytime to clear the current Discover workspace and start fresh. Cards you already evaluated stay saved.</div>`;
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

  function decorate() {
    if (!eligibleHost()) return;
    decorateSavedDecision();
    decorateDiscover();
    cleanKnownLimitations();
    observeGuide();
    clarifyGuidedProgress();
  }

  document.addEventListener("click", event => {
    const direct = event.target.closest("[data-ff-show-why]");
    const guided = event.target.closest("[data-guide-action]");
    if (!direct && !isGuidedExplainAction(guided)) return;
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
