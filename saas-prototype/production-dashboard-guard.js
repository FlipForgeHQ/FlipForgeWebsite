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

  function ensureBrandFavicon() {
    if (typeof document.querySelector !== "function" || typeof document.createElement !== "function" || !document.head) return;
    const href = "/assets/brand/flipforge-app-icon-dark.svg";
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      document.head.appendChild(link);
    }
    link.href = href;
  }

  function customerApp() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function dashboardRoute() {
    const route = String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
    return route === "dashboard";
  }

  function productionDashboard() {
    const host = String(window.location.hostname || "");
    return PRODUCTION_HOST.test(host) && customerApp() && dashboardRoute();
  }

  function customerDashboard() {
    return customerApp() && dashboardRoute();
  }

  function guardedMarkup() {
    return `<div class="page ff-commercial-dashboard" data-production-dashboard-guard><header class="ff-dashboard-head"><div><h1>Dashboard</h1><p>Loading tenant-owned FlipForge intelligence.</p></div></header><div class="ff-commercial-loading" role="status">Loading authoritative dashboard data…</div></div>`;
  }

  function customerHomeMarkup() {
    return `<div class="page ff-customer-home-page" data-customer-home-v1><header class="page-heading"><div><span class="eyebrow">Private beta</span><h1>Before you buy, know why.</h1><p>Evaluate an exact card, understand the decision, and track what happens next.</p></div><div class="page-actions"><a class="button button-primary" href="#/discover">Evaluate a card</a></div></header></div>`;
  }

  function presentCustomerHome() {
    if (!customerDashboard() || applying) return;
    if (main.querySelector("[data-customer-home-v1]")) return;
    applying = true;
    main.innerHTML = customerHomeMarkup();
    applying = false;
    if (window.FlipForgeCustomerOnlyShell?.refresh) window.FlipForgeCustomerOnlyShell.refresh();
  }

  function enforce() {
    if (!productionDashboard() || applying) return;
    if (main.querySelector("[data-customer-home-v1]")) return;
    if (main.querySelector("[data-commercial-dashboard-v2]")) return;
    if (main.querySelector("[data-production-dashboard-guard]")) return;
    applying = true;
    main.innerHTML = guardedMarkup();
    applying = false;
  }

  function reconcileDashboardPresentation() {
    enforce();
    presentCustomerHome();
  }

  function cleanRouteTransition(event) {
    if (!customerApp() || routeReloading) return;
    if (!APP_ROUTE_HASH.test(String(window.location.hash || ""))) return;
    routeReloading = true;
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (typeof window.location?.reload === "function") window.location.reload();
  }

  function isPlainLeftClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function handleRouteClick(event) {
    if (!customerApp() || routeReloading || !isPlainLeftClick(event)) return;
    const link = event.target?.closest?.('a[href^="#/"]');
    if (!link) return;
    const targetHash = String(link.getAttribute("href") || "");
    if (!APP_ROUTE_HASH.test(targetHash)) return;
    if (targetHash !== String(window.location.hash || "")) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    routeReloading = true;
    if (typeof window.location?.reload === "function") window.location.reload();
  }

  /* The browser has addEventListener; the static dashboard validation harness does
   * not. Keep touch-navigation recovery browser-only so the production guard remains
   * directly executable by deterministic CI. */
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", handleRouteClick, true);
  }

  const observer = new MutationObserver(() => queueMicrotask(reconcileDashboardPresentation));
  observer.observe(main, { childList: true });
  window.addEventListener("hashchange", cleanRouteTransition);
  window.addEventListener("pageshow", reconcileDashboardPresentation);
  ensureBrandFavicon();
  reconcileDashboardPresentation();
})();
