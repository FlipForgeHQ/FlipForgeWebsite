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
    const route = String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
    return PRODUCTION_HOST.test(host) && APP_PATH.test(path) && route === "dashboard";
  }

  function guardedMarkup() {
    return `<div class="page ff-commercial-dashboard" data-production-dashboard-guard>
      <header class="ff-dashboard-head">
        <div>
          <h1>Dashboard</h1>
          <p>Loading tenant-owned FlipForge intelligence.</p>
        </div>
      </header>
      <div class="ff-commercial-loading" role="status">Loading authoritative dashboard data…</div>
    </div>`;
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

    // The customer app has both historical prototype listeners and the current
    // customer router. Let exactly one route own a document lifetime: when the
    // app route changes, reload once with the new hash so old async work and old
    // DOM listeners cannot repaint or freeze the next workspace.
    routeReloading = true;
    if (event && typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    window.location.reload();
  }

  const observer = new MutationObserver(() => queueMicrotask(enforce));
  observer.observe(main, { childList: true });

  // Registered before app.js and every later customer router. This turns route
  // changes into deterministic clean loads while leaving non-route anchors alone.
  window.addEventListener("hashchange", cleanRouteTransition);
  window.addEventListener("pageshow", enforce);

  enforce();
})();
