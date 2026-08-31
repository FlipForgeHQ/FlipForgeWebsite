(() => {
  "use strict";

  if (window.__ffCustomerRouteOwnershipV1 === true) return;

  const MAIN_SELECTOR = "#main-content";
  const INTENT_WINDOW_MS = 3000;
  const REPAIR_COOLDOWN_MS = 120;
  const KNOWN_PAGE_SELECTOR = [
    ".customer-discovery-page",
    ".customer-intelligence-page",
    ".customer-lifecycle-page",
    ".customer-export-page"
  ].join(", ");

  const expectedPageByRoute = Object.freeze({
    discover: ".customer-discovery-page",
    opportunities: ".customer-intelligence-page",
    tracking: ".customer-lifecycle-page",
    portfolio: ".customer-lifecycle-page",
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

  function pageOwnershipMatches() {
    const route = routeName();
    const expected = expectedPageByRoute[route];
    if (!expected) return true;

    const main = document.querySelector(MAIN_SELECTOR);
    if (!main || !main.children.length) return true;
    if (main.querySelector(expected)) return true;

    // Only repair when another known customer workspace has actually taken over.
    // Loading shells or routes outside this guard remain untouched.
    return !main.querySelector(KNOWN_PAGE_SELECTOR);
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
