(() => {
  "use strict";

  if (window.__ffCustomerRouteOwnershipV1 === true) return;

  const MAIN_SELECTOR = "#main-content";
  const INTENT_WINDOW_MS = 3000;
  const REPAIR_COOLDOWN_MS = 120;

  const expectedPageByRoute = Object.freeze({
    discover: ".customer-discovery-page",
    opportunities: ".customer-intelligence-page",
    tracking: ".customer-lifecycle-page",
    portfolio: ".customer-portfolio-page",
    alerts: ".customer-lifecycle-page",
    export: ".customer-export-page"
  });

  let explicitIntent = { hash: "", until: 0 };
  let ownershipCheckQueued = false;
  let repairing = false;
  let lastRepairAt = 0;

  function normalizedHash(value = window.location.hash) {
    const raw = String(value || "#/dashboard");
    return raw.startsWith("#/") ? raw : `#/${raw.replace(/^#?\/?/, "")}`;
  }

  function routeName(value = window.location.hash) {
    return normalizedHash(value)
      .replace(/^#\//, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function plainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  function rememberExplicitIntent(hash) {
    const value = normalizedHash(hash);
    if (!/^#\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value)) return;
    explicitIntent = { hash: value, until: Date.now() + INTENT_WINDOW_MS };
  }

  function intentStillActive() {
    return Boolean(explicitIntent.hash) && Date.now() < explicitIntent.until;
  }

  function restoreExplicitIntentIfNeeded() {
    if (!intentStillActive()) return false;
    const current = normalizedHash();
    if (current === explicitIntent.hash) return false;

    const target = explicitIntent.hash;
    queueMicrotask(() => {
      if (!intentStillActive()) return;
      if (normalizedHash() === target) return;
      window.location.hash = target;
    });
    return true;
  }

  function lifecycleAdapterReady(route) {
    const adapter = window.FlipForgeCustomerLifecycle;
    return Boolean(adapter
      && typeof adapter.render === "function"
      && typeof adapter.handles === "function"
      && adapter.handles(route)
      && typeof adapter.isEligible === "function"
      && adapter.isEligible());
  }

  function adapterReady(route) {
    switch (route) {
      case "discover": {
        const adapter = window.FlipForgeCustomerDiscovery;
        return Boolean(adapter && typeof adapter.render === "function" && typeof adapter.isEligible === "function" && adapter.isEligible());
      }
      case "opportunities": {
        const adapter = window.FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities;
        if (!adapter || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
        return typeof adapter.renderCustomer === "function" || typeof adapter.render === "function";
      }
      case "tracking":
      case "alerts":
        return lifecycleAdapterReady(route);
      case "portfolio": {
        // staging-route-hook intentionally gives Portfolio to the specialized
        // Portfolio adapter before the generic lifecycle fallback. Ownership
        // must follow that same priority or the guard will continually reject
        // the correct Portfolio page and redispatch the current hash forever.
        const adapter = window.FlipForgeCustomerPortfolio;
        return Boolean(adapter
          && typeof adapter.render === "function"
          && typeof adapter.isEligible === "function"
          && adapter.isEligible());
      }
      case "export": {
        const adapter = window.FlipForgeCustomerExport;
        return Boolean(adapter
          && typeof adapter.render === "function"
          && typeof adapter.handles === "function"
          && adapter.handles(route)
          && typeof adapter.isEligible === "function"
          && adapter.isEligible());
      }
      default:
        return false;
    }
  }

  function pageOwnershipMatches() {
    const route = routeName();
    const expected = expectedPageByRoute[route];
    if (!expected) return true;

    const main = document.querySelector(MAIN_SELECTOR);
    if (!main || !main.children.length) return true;
    if (main.querySelector(expected)) return true;

    // Once the governed adapter for this route is available, any non-empty
    // workspace without its expected customer page is stale ownership. This
    // intentionally includes generic legacy shell pages such as app.js's
    // dashboard fallback; allowing those pages to remain was the route race.
    if (!adapterReady(route)) return true;
    return false;
  }

  function repairCurrentRoute() {
    ownershipCheckQueued = false;
    if (repairing || pageOwnershipMatches()) return;
    if (Date.now() - lastRepairAt < REPAIR_COOLDOWN_MS) return;

    repairing = true;
    lastRepairAt = Date.now();
    try {
      // staging-route-hook owns authoritative route rendering. Re-dispatching the
      // current route lets it repaint the correct adapter without creating a new
      // history entry or changing recommendation/evidence/transaction authority.
      window.dispatchEvent(new HashChangeEvent("hashchange", {
        oldURL: window.location.href,
        newURL: window.location.href
      }));
    } catch (_) {
      window.dispatchEvent(new Event("hashchange"));
    }
    window.setTimeout(() => {
      repairing = false;
      queueOwnershipCheck();
    }, REPAIR_COOLDOWN_MS);
  }

  function queueOwnershipCheck() {
    if (ownershipCheckQueued) return;
    ownershipCheckQueued = true;
    window.requestAnimationFrame(repairCurrentRoute);
  }

  document.addEventListener("click", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (!href) return;
    rememberExplicitIntent(href);
  }, true);

  window.addEventListener("hashchange", () => {
    if (restoreExplicitIntentIfNeeded()) return;
    queueOwnershipCheck();
  });

  window.addEventListener("pageshow", queueOwnershipCheck);
  window.addEventListener("load", queueOwnershipCheck);

  const main = document.querySelector(MAIN_SELECTOR);
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(queueOwnershipCheck).observe(main, {
      childList: true,
      subtree: true
    });
  }

  window.__ffCustomerRouteOwnershipV1 = true;
  window.FlipForgeCustomerRouteOwnership = Object.freeze({
    routeName,
    currentHash: normalizedHash,
    rememberExplicitIntent,
    check: queueOwnershipCheck
  });

  queueOwnershipCheck();
})();
