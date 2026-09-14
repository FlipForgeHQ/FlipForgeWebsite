(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const APP_ROUTE_HASH = /^#\//;
  const AUTHORITATIVE_FETCH_TIMEOUT_MS = 15000;
  const FULL_CUSTOMER_DASHBOARD_SCRIPT = "commercial-dashboard-v2.js";
  const FULL_CUSTOMER_DASHBOARD_STYLESHEET = "commercial-dashboard-v2.css";
  const main = document.querySelector("#main-content");
  if (!main) return;

  let applying = false;
  let enforceQueued = false;
  let legacyBetaReloading = false;

  function customerApp() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function fullCustomerEntry() {
    return window.FlipForgeFullCustomerEntry === true;
  }

  function legacyBetaEntry() {
    return customerApp() && !fullCustomerEntry();
  }

  function authoritativeApiRequest(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || String(input || "");
      const url = new URL(raw, window.location.href);
      return /^\/api\/v1\//.test(url.pathname) && url.pathname !== "/api/v1/health";
    } catch (_) {
      return false;
    }
  }

  async function fetchWithAuthoritativeTimeout(nativeFetch, args) {
    if (!authoritativeApiRequest(args[0])) return nativeFetch(...args);

    const input = args[0];
    const init = args[1] && typeof args[1] === "object" ? { ...args[1] } : {};
    if (init.signal) return nativeFetch(input, init);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AUTHORITATIVE_FETCH_TIMEOUT_MS);
    init.signal = controller.signal;

    try {
      return await nativeFetch(input, init);
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error("The FlipForge customer data service did not respond in time. Retry the request or restore your sign-in if prompted.");
        timeoutError.name = "TimeoutError";
        timeoutError.code = "CUSTOMER_API_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function publishAuthoritativeAuthState(input, response) {
    if (!customerApp() || !authoritativeApiRequest(input) || !response) return;
    if (response.status !== 401 && !response.ok) return;
    const denied = response.status === 401;
    window.__FlipForgeAuthoritativeAuthDenied = denied;
    if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("flipforge:authoritative-auth", {
        detail: { denied, status: response.status }
      }));
    }
  }

  function installEarlyAuthoritativeAuthObserver() {
    if (!customerApp() || window.__ffEarlyAuthoritativeAuthObserverInstalled || typeof window.fetch !== "function") return;
    window.__ffEarlyAuthoritativeAuthObserverInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetchWithAuthoritativeTimeout(nativeFetch, args);
      publishAuthoritativeAuthState(args[0], response);
      return response;
    };
  }

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

  function productionDashboard() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    const route = String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
    return PRODUCTION_HOST.test(host) && APP_PATH.test(path) && route === "dashboard";
  }

  function rendererFailureMarkup() {
    return `<div class="page ff-commercial-dashboard" data-commercial-dashboard-v2><header class="ff-dashboard-head"><div><h1>Dashboard</h1><p>FlipForge could not start the authoritative customer Dashboard.</p></div></header><div class="ff-commercial-error" role="alert"><strong>DASHBOARD_RENDERER_UNAVAILABLE</strong><p>The authoritative Dashboard renderer failed to load. Reload the customer app and try again.</p></div></div>`;
  }

  function ensureFullCustomerDashboardAssets() {
    if (!customerApp() || !fullCustomerEntry()) return;
    if (typeof document.querySelector !== "function" || typeof document.createElement !== "function" || !document.head) return;

    if (!document.querySelector('[data-ff-commercial-dashboard-css]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = FULL_CUSTOMER_DASHBOARD_STYLESHEET;
      stylesheet.setAttribute("data-ff-commercial-dashboard-css", "");
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('[data-ff-commercial-dashboard-js]')) {
      const script = document.createElement("script");
      script.src = FULL_CUSTOMER_DASHBOARD_SCRIPT;
      script.async = false;
      script.setAttribute("data-ff-commercial-dashboard-js", "");
      script.addEventListener("error", () => {
        if (!productionDashboard() || main.querySelector("[data-commercial-dashboard-v2]")) return;
        main.innerHTML = rendererFailureMarkup();
      }, { once: true });
      document.head.appendChild(script);
    }
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

  function scheduleEnforce() {
    if (enforceQueued) return;
    enforceQueued = true;
    queueMicrotask(() => {
      enforceQueued = false;
      enforce();
    });
  }

  function closeFullCustomerNavigation() {
    if (!fullCustomerEntry()) return;
    const shell = document.querySelector(".app-shell");
    const toggle = document.querySelector("[data-nav-toggle]");
    if (shell) shell.dataset.navOpen = "false";
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function isPlainLeftClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function handleRouteClick(event) {
    if (!customerApp() || !isPlainLeftClick(event)) return;
    const link = event.target?.closest?.('a[href^="#/"]');
    if (!link) return;
    const targetHash = String(link.getAttribute("href") || "");
    if (!APP_ROUTE_HASH.test(targetHash)) return;

    if (fullCustomerEntry()) {
      // Customer experience rule: route taps close the drawer immediately, including
      // taps on the already-active route, without discarding the current workspace.
      closeFullCustomerNavigation();
      return;
    }

    // Preserve the controlled private-beta reload boundary until its older route
    // presentation stack is independently converted. Do not make beta reliability a
    // prerequisite for the full customer app's faster connected-navigation model.
    if (legacyBetaReloading || targetHash !== String(window.location.hash || "")) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    legacyBetaReloading = true;
    if (typeof window.location?.reload === "function") window.location.reload();
  }

  function handleHashChange(event) {
    if (fullCustomerEntry()) {
      closeFullCustomerNavigation();
      scheduleEnforce();
      return;
    }
    if (!legacyBetaEntry() || legacyBetaReloading) return;
    legacyBetaReloading = true;
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (typeof window.location?.reload === "function") window.location.reload();
  }

  installEarlyAuthoritativeAuthObserver();
  ensureFullCustomerDashboardAssets();

  const observer = new MutationObserver(scheduleEnforce);
  observer.observe(main, { childList: true });

  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", handleRouteClick, true);
  }

  // The full customer app stays inside one workspace: no page reload between Home,
  // Discover, Evaluate, Decision Intelligence, Saved Decisions, and follow-up routes.
  // This preserves customer context and avoids repeating the full asset/bootstrap cost.
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("pageshow", scheduleEnforce);

  ensureBrandFavicon();
  enforce();
})();