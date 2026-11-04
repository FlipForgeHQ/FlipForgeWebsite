(() => {
  "use strict";

  const STORAGE_KEY = "flipforge.trackingContext.v1";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAIN = "#main-content";
  let queued = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
  }

  function detailId() {
    const [route, id = ""] = routeParts();
    if (!["opportunities", "evidence", "tracking"].includes(route)) return "";
    return SAFE_ID.test(id) ? id : "";
  }

  function remember(id) {
    if (!SAFE_ID.test(String(id || ""))) return;
    try { window.sessionStorage.setItem(STORAGE_KEY, String(id)); } catch (_) { /* session preference only */ }
  }

  function idFromHref(href, route) {
    const match = String(href || "").match(new RegExp(`#/${route}/([^/?#]+)`));
    if (!match) return "";
    try {
      const value = decodeURIComponent(match[1]);
      return SAFE_ID.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  function keepTrackingNavInContext() {
    const [route] = routeParts();
    const nav = document.querySelector('.primary-nav [data-route="tracking"]');
    if (!nav) return;
    const id = detailId();
    if ((route === "opportunities" || route === "evidence") && id) {
      nav.setAttribute("href", `#/tracking/${encodeURIComponent(id)}`);
      nav.dataset.ffTrackingContext = id;
      remember(id);
      return;
    }
    if (route !== "tracking") {
      nav.setAttribute("href", "#/tracking");
      delete nav.dataset.ffTrackingContext;
    }
  }

  // Advanced analysis links (PSA Advisor, Evidence, Audit Export) follow the card in view, the same way the Tracking
  // link does: on a page for one saved card they open that card instead of the first card in the list. Elsewhere they
  // stay generic, and each page then prefers the remembered active card if this tenant still has it.
  const ADVANCED_CARD_ROUTES = ["psa-advisor", "evidence", "export"];
  const CARD_CONTEXT_ROUTES = ["opportunities", "evidence", "tracking", "psa-advisor", "export"];

  function keepAdvancedNavInContext() {
    const [route, rawId = ""] = routeParts();
    const id = CARD_CONTEXT_ROUTES.includes(route) && SAFE_ID.test(rawId) ? rawId : "";
    for (const target of ADVANCED_CARD_ROUTES) {
      const nav = document.querySelector(`.ff-advanced-nav [data-route="${target}"]`);
      if (!nav) continue;
      const href = id ? `#/${target}/${encodeURIComponent(id)}` : `#/${target}`;
      if (nav.getAttribute("href") !== href) nav.setAttribute("href", href);
      if (id) nav.dataset.ffCardContext = id;
      else delete nav.dataset.ffCardContext;
    }
  }

  function remembered() {
    try {
      const value = String(window.sessionStorage.getItem(STORAGE_KEY) || "");
      return SAFE_ID.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  // A bare #/tracking opens the card the customer was last working on in this session.
  function restoreGenericTrackingRoute() {
    const [route, id = ""] = routeParts();
    if (route === "tracking" && SAFE_ID.test(id)) {
      remember(id);
      return false;
    }
    if (route !== "tracking" || id) return false;
    const pending = remembered();
    if (!pending) return false;
    window.location.hash = `#/tracking/${encodeURIComponent(pending)}`;
    return true;
  }

  function renderExactTracking(id) {
    if (!SAFE_ID.test(String(id || ""))) return false;
    const main = document.querySelector(MAIN);
    const adapter = window.FlipForgeCustomerLifecycle;
    if (!main || !adapter || typeof adapter.render !== "function" || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
    main.innerHTML = "";
    adapter.render(main, "tracking", id);
    return true;
  }

  // Navigation context only: links that follow the card in view, and which card a bare #/tracking opens. The
  // Tracking screen itself (wording, form, stale-response guard) is owned by customer-lifecycle.js.
  function sync() {
    queued = false;
    keepTrackingNavInContext();
    keepAdvancedNavInContext();
    restoreGenericTrackingRoute();
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  document.addEventListener("click", event => {
    const evidenceContinue = event.target.closest?.("[data-ff-evidence-understood]");
    if (evidenceContinue) {
      const hrefId = idFromHref(evidenceContinue.getAttribute("href"), "tracking");
      const currentId = detailId();
      const id = hrefId || currentId;
      if (!id) return;
      remember(id);

      // Preserve native browser behavior for modified clicks/new tabs. Own the
      // ordinary left-click so another in-page handler cannot swallow the
      // Evidence -> Tracking transition.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const nextHash = `#/tracking/${encodeURIComponent(id)}`;
      if (window.location.hash === nextHash) {
        renderExactTracking(id);
        return;
      }
      window.location.hash = nextHash;
      return;
    }

    const trackingNav = event.target.closest?.('.primary-nav [data-route="tracking"]');
    if (trackingNav) {
      const id = detailId();
      const [route] = routeParts();
      if ((route === "opportunities" || route === "evidence") && id) {
        trackingNav.setAttribute("href", `#/tracking/${encodeURIComponent(id)}`);
        remember(id);
      }
    }
  }, true);

  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();
})();

