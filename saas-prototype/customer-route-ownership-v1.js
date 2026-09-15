(() => {
  "use strict";

  if (window.__ffCustomerRouteOwnershipV1 === true) return;

  const MAIN_SELECTOR = "#main-content";
  const INTENT_WINDOW_MS = 3000;
  const INTENT_SETTLE_MS = 800;
  const REPAIR_COOLDOWN_MS = 120;

  const expectedPageByRoute = Object.freeze({
    dashboard: ".customer-dashboard-page",
    discover: ".customer-discovery-page",
    evaluate: ".customer-evaluation-page",
    opportunities: ".customer-intelligence-page",
    tracking: ".customer-lifecycle-page",
    portfolio: ".customer-portfolio-page",
    alerts: ".customer-lifecycle-page",
    account: ".customer-entitlements-page",
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
  let delayedOwnershipCheckTimer = 0;
  let repairing = false;
  let lastRepairAt = 0;
  let pendingPointerRouteIntent = null;

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

    // Once a click has reached its requested destination, that intent is spent.
    // A later legitimate route change must never be pulled back to the old click
    // during the short ownership-settle window.
    if (explicitIntent.reached) {
      clearExplicitIntent();
      return false;
    }

    const target = explicitIntent.hash;
    queueMicrotask(() => {
      if (!intentStillActive() || explicitIntent.reached) return;
      if (normalizedHash() === target) return;
      window.location.hash = target;
    });
    return true;
  }

  function enforceExplicitIntentAfterClick(hash) {
    const target = normalizedHash(hash);
    queueMicrotask(() => {
      if (!intentStillActive() || explicitIntent.hash !== target) return;
      if (normalizedHash() === target) {
        markIntentReached();
        queueOwnershipCheck();
        return;
      }
      window.location.hash = target;
    });
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

  function dashboardAdapterReady() {
    const adapter = window.FlipForgeStagingReadAdapter;
    return Boolean(adapter
      && typeof adapter.renderCustomerDashboard === "function"
      && typeof adapter.isEligible === "function"
      && adapter.isEligible());
  }

  function evaluationAdapterReady() {
    const adapter = window.FlipForgeStagingEvaluationAdapter;
    return Boolean(adapter
      && typeof adapter.renderCustomer === "function"
      && typeof adapter.isEligible === "function"
      && adapter.isEligible());
  }

  function adapterReady(route) {
    switch (route) {
      case "dashboard":
        return dashboardAdapterReady();
      case "discover":
        return simpleAdapterReady(window.FlipForgeCustomerDiscovery);
      case "evaluate":
        return evaluationAdapterReady();
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
      case "account":
        return simpleAdapterReady(window.FlipForgeCustomerEntitlements);
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
    if (!main) return true;

    // Empty governed customer workspaces are always failures. Adapter readiness
    // may lag route churn briefly, but that must never convert blank content into
    // a healthy state; the repair loop keeps checking until ownership settles.
    if (!main.children.length) return false;

    if (!adapterReady(route)) return true;
    return Boolean(main.querySelector(expected));
  }

  function applyAuthoritativeCustomerRoute() {
    const renderer = window.FlipForgeCustomerRouteRenderer;
    if (!renderer || typeof renderer.applyCurrentRoute !== "function") return false;
    renderer.applyCurrentRoute();
    // Do not report a successful repair merely because the authoritative
    // renderer exists. The repair owns the route only when the governed page is
    // actually present; otherwise let the fallback hash listeners recover it.
    return pageOwnershipMatches();
  }

  function broadcastRepairFallback() {
    try {
      window.dispatchEvent(new HashChangeEvent("hashchange", {
        oldURL: window.location.href,
        newURL: window.location.href
      }));
    } catch (_) {
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  function queueOwnershipCheckAfter(delayMs) {
    if (delayedOwnershipCheckTimer) return;
    delayedOwnershipCheckTimer = window.setTimeout(() => {
      delayedOwnershipCheckTimer = 0;
      queueOwnershipCheck();
    }, Math.max(1, Math.ceil(delayMs)));
  }

  function repairCurrentRoute() {
    ownershipCheckQueued = false;
    if (pageOwnershipMatches()) return;

    if (repairing) {
      queueOwnershipCheckAfter(REPAIR_COOLDOWN_MS);
      return;
    }

    const elapsed = Date.now() - lastRepairAt;
    if (elapsed < REPAIR_COOLDOWN_MS) {
      queueOwnershipCheckAfter(REPAIR_COOLDOWN_MS - elapsed + 1);
      return;
    }

    repairing = true;
    lastRepairAt = Date.now();
    try {
      if (!applyAuthoritativeCustomerRoute()) broadcastRepairFallback();
    } catch (_) {
      broadcastRepairFallback();
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

  // A full-customer nav link can be normalized between pointerdown and click
  // while compatibility/presentation observers settle after reload. Preserve the
  // same plain-left route activation across that node churn without preventing
  // default behavior, taking renderer authority, or converting drags into clicks.
  window.addEventListener("pointerdown", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (!href) return;
    pendingPointerRouteIntent = {
      hash: href,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    rememberExplicitIntent(href);
  }, true);

  window.addEventListener("pointercancel", event => {
    if (!pendingPointerRouteIntent || event.pointerId !== pendingPointerRouteIntent.pointerId) return;
    pendingPointerRouteIntent = null;
  }, true);

  window.addEventListener("pointerup", event => {
    const pending = pendingPointerRouteIntent;
    if (!pending || event.pointerId !== pending.pointerId) return;
    pendingPointerRouteIntent = null;
    if (!plainLeftClick(event)) return;
    const distance = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
    if (distance > 12) return;
    enforceExplicitIntentAfterClick(pending.hash);
  }, true);

  // Observe explicit route intent at the window capture boundary. The ownership
  // guard is loaded last so its repair checks run after compatibility layers, but
  // older document-capture listeners may legitimately stop propagation. Window
  // capture records the customer's route choice before those handlers without
  // preventing default behavior or taking renderer authority.
  window.addEventListener("click", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (!href) return;
    rememberExplicitIntent(href);
    // The stable-navigation layer normally applies the hash. Under intense DOM
    // churn the clicked node can be replaced after pointer dispatch, so verify
    // the user's explicit route intent in a microtask and apply it if needed.
    enforceExplicitIntentAfterClick(href);
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