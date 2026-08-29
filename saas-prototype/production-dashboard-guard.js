(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const APP_ROUTE_HASH = /^#\//;
  const main = document.querySelector("#main-content");
  if (!main) return;

  let applying = false;
  let routeReloading = false;

  function customerApp() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function productionDashboard() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    const route = String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
    return PRODUCTION_HOST.test(host) && APP_PATH.test(path) && route === "dashboard";
  }

  function guardedMarkup() {
    return `<div class="page ff-commercial-dashboard" data-production-dashboard-guard><header class="ff-dashboard-head"><div><h1>Dashboard</h1><p>Loading tenant-owned FlipForge intelligence.</p></div></header><div class="ff-commercial-loading" role="status">Loading authoritative dashboard data…</div></div>`;
  }

  function enforce() {
    if (!productionDashboard() || applying) return;
    if (main.querySelector("[data-commercial-dashboard-v2]")) return;
    if (main.querySelector("[data-production-dashboard-guard]")) return;
    applying = true;
    main.innerHTML = guardedMarkup();
    applying = false;
  }

  function cleanRouteTransition(event) {
    if (!customerApp() || routeReloading) return;
    if (!APP_ROUTE_HASH.test(String(window.location.hash || ""))) return;
    routeReloading = true;
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    window.location.reload();
  }

  function isPlainLeftClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  /* Hash routers do not emit hashchange when a customer taps the route they are
   * already on. Treat every ordinary app-route link as a deterministic navigation:
   * changed routes use the existing clean-load guard; same-route taps reload the
   * current workspace so a stale or half-rendered screen can recover. */
  document.addEventListener("click", event => {
    if (!customerApp() || routeReloading || !isPlainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link) return;
    const targetHash = String(link.getAttribute("href") || "");
    if (!APP_ROUTE_HASH.test(targetHash)) return;
    if (targetHash !== String(window.location.hash || "")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    routeReloading = true;
    window.location.reload();
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(enforce));
  observer.observe(main, { childList: true });
  window.addEventListener("hashchange", cleanRouteTransition);
  window.addEventListener("pageshow", enforce);
  enforce();
})();
