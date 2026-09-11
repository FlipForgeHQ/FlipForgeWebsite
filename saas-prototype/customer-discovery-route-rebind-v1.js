(() => {
  "use strict";

  if (window.__flipForgeDiscoveryRouteRebindV1) return;
  window.__flipForgeDiscoveryRouteRebindV1 = true;

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  let previousRoute = routeName();
  let generation = 0;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function markOwned(main, run) {
    if (run !== generation || routeName() !== "discover") return;
    const form = main?.querySelector?.("[data-customer-discovery-form]");
    if (form) form.dataset.ffDiscoveryRouteOwner = "live";
  }

  function reclaimDiscoverRoute() {
    const run = ++generation;
    if (!eligibleHost() || routeName() !== "discover") return;

    const main = document.querySelector("#main-content");
    const adapter = window.FlipForgeCustomerDiscovery;
    if (!main
        || !adapter
        || typeof adapter.render !== "function"
        || typeof adapter.isEligible !== "function"
        || !adapter.isEligible()) return;

    try {
      // Reclaim synchronously inside the hashchange turn. Delaying this work can
      // replace a form after the customer has already started typing or clicked.
      const result = adapter.render(main);
      markOwned(main, run);
      if (result && typeof result.then === "function") {
        result.then(() => markOwned(main, run)).catch(() => {});
      }
    } catch (_) {
      // Discover owns fail-closed error rendering. Never substitute a mock
      // surface, recommendation, or weakened authority check here.
    }
  }

  function onHashChange() {
    const next = routeName();
    const enteringDiscover = next === "discover" && previousRoute !== "discover";
    previousRoute = next;

    if (next !== "discover") {
      generation += 1;
      return;
    }
    if (enteringDiscover) reclaimDiscoverRoute();
  }

  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("pageshow", () => {
    previousRoute = routeName();
    if (previousRoute === "discover") reclaimDiscoverRoute();
  });

  if (previousRoute === "discover") queueMicrotask(reclaimDiscoverRoute);
})();
