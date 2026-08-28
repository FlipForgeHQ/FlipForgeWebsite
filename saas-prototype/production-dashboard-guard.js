(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const main = document.querySelector("#main-content");
  if (!main) return;

  let applying = false;

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

  const observer = new MutationObserver(() => queueMicrotask(enforce));
  observer.observe(main, { childList: true });
  window.addEventListener("hashchange", () => queueMicrotask(enforce));

  enforce();
})();
