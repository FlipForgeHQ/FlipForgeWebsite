(() => {
  "use strict";

  if (window.__ffCustomerRouteOwnershipV1 === true) return;

  const MAIN_SELECTOR = "#main-content";
  const INTENT_WINDOW_MS = 3000;
  const INTENT_SETTLE_MS = 800;
  const REPAIR_COOLDOWN_MS = 120;

  const expectedPageByRoute = Object.freeze({
    discover: ".customer-discovery-page",
    opportunities: ".customer-intelligence-page",
    tracking: ".customer-lifecycle-page",
    portfolio: ".customer-portfolio-page",
    alerts: ".customer-lifecycle-page",
    "forge-heat": ".forge-heat-shell",
    "market-view": ".market-view-shell",
    compare: ".customer-compare-page",
    "psa-advisor": ".customer-intelligence-page",
    evidence: ".customer-management-page",
    sell: ".customer-management-page",
    export: ".customer-export-page"
  });

  let explicitIntent = { hash: "", until: 0, serial: 0, reached: false };
  let intentSerial = 0;
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
    intentSerial += 1;
    explicitIntent = {
      hash: value,
      until: Date.now() + INTENT_WINDOW_MS,
      serial: intentSerial,
      reached: false
    };
  }

  function clearExplicitIntent() {
    explicitIntent = { hash: "", until: 0, serial: 0, reached: false };
  }

  function intentStillActive() {
    return Boolean(explicitIntent.hash) && Date.now() < explicitIntent.until;
  }

  function markIntentReached() {
    if (!intentStillActive() || explicitIntent.reached) return;
    const serial = explicitIntent.serial;
    explicitIntent = {
      ...explicitIntent,
      reached: true,
      until: Date.now() + INTENT_SETTLE_MS
    };
    window.setTimeout(() => {
      if (explicitIntent.serial !== serial || !explicitIntent.reached) return;
      clearExplicitIntent();
    }, INTENT_SETTLE_MS + 20);
  }

  function restoreExplicitIntentIfNeeded() {
    if (!intentStillActive()) return false;
    const current = normalizedHash();
    if (current === explicitIntent.hash) {
      markIntentReached();
      return false;
    }

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

  function managementAdapterReady(route) {
    const adapter = window.FlipForgeCustomerManagement;
    return Boolean(adapter
      && typeof adapter.render === "function"
      && typeof adapter.handles === "function"
      && adapter.handles(route)
      && typeof adapter.isEligible === "function"
      && adapter.isEligible());
  }

  function simpleAdapterReady(adapter) {
    return Boolean(adapter
      && typeof adapter.render === "function"
      && typeof adapter.isEligible === "function"
      && adapter.isEligible());
  }

  function adapterReady(route) {
    switch (route) {
      case "discover":
        return simpleAdapterReady(window.FlipForgeCustomerDiscovery);
      case "opportunities": {
        const adapter = window.FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities;
        if (!adapter || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
        return typeof adapter.renderCustomer === "function" || typeof adapter.render === "function";
      }
      case "tracking":
      case "alerts":
        return lifecycleAdapterReady(route);
      case "portfolio":
        return simpleAdapterReady(window.FlipForgeCustomerPortfolio);
      case "forge-heat":
        return simpleAdapterReady(window.FlipForgeCustomerForgeHeat);
      case "market-view":
        return simpleAdapterReady(window.FlipForgeCustomerMarketView);
      case "compare":
        return simpleAdapterReady(window.FlipForgeCustomerCompare);
      case "psa-advisor":
        return simpleAdapterReady(window.FlipForgeCustomerPsaAdvisor);
      case "evidence":
      case "sell":
        return managementAdapterReady(route);
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

  window.addEventListener("popstate", clearExplicitIntent, true);

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
