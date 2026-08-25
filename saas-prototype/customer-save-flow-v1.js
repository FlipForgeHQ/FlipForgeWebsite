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
    if (page.querySelector("[data-ff-discover-persistence-note]")) return;

    const note = document.createElement("div");
    note.className = "ff-discover-persistence-note";
    note.dataset.ffDiscoverPersistenceNote = "";
    note.innerHTML = `<span aria-hidden="true">✓</span><div><strong>Searches are temporary; evaluated decisions are saved.</strong> You can use <strong>+ New card</strong> anytime. It clears the current Discover workspace only—it does not remove cards you already evaluated.</div>`;
    search.insertAdjacentElement("afterend", note);
  }

  function decorate() {
    if (!eligibleHost()) return;
    decorateSavedDecision();
    decorateDiscover();
  }

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

  decorate();
})();
