(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const APP_ROUTE_HASH = /^#\//;
  const AUTHORITATIVE_FETCH_TIMEOUT_MS = 30000;
  const FULL_CUSTOMER_DASHBOARD_SCRIPT = "commercial-dashboard-v2.js";
  const FULL_CUSTOMER_DASHBOARD_STYLESHEET = "commercial-dashboard-v2.css";
  const DASHBOARD_V3_SCRIPT = "decision-dashboard-v3.js";
  const DASHBOARD_V3_STYLESHEET = "decision-dashboard-v3.css";
  const main = document.querySelector("#main-content");
  if (!main) return;

  let applying = false;
  let routeReloading = false;

  function customerApp() {
    const host = String(window.location.hostname || "");
    const path = String(window.location.pathname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(path);
  }

  function fullCustomerEntry() {
    return window.FlipForgeFullCustomerEntry === true;
  }

  function betaSpaEntry() {
    const path = String(window.location.pathname || "");
    const host = String(window.location.hostname || "");
    // No document-level reloads on beta hash routes or the standalone
    // Netlify /saas-prototype preview. Both are genuine hash-router apps.
    return /^\/app\/beta(?:\/|$)/i.test(path)
      || (PREVIEW_HOST.test(host) && /^\/saas-prototype(?:\/|$)/i.test(path));
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
      let response = await fetchWithAuthoritativeTimeout(nativeFetch, args);
      if (response && response.status === 401 && authoritativeApiRequest(args[0])
          && typeof window.FlipForgeIdentity?.recoverFromSessionRenewalRace === "function") {
        // A parallel request may have just renewed the session; retry once with the
        // renewed cookie before treating this as signed out.
        const retried = await window.FlipForgeIdentity.recoverFromSessionRenewalRace(
          args, response, () => fetchWithAuthoritativeTimeout(nativeFetch, args));
        if (retried) response = retried;
      }
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

    // Dashboard V3 (behind the flag) must evaluate before V2 so it can claim the route.
    if (!document.querySelector('[data-ff-dashboard-v3-css]')) {
      const v3Stylesheet = document.createElement("link");
      v3Stylesheet.rel = "stylesheet";
      v3Stylesheet.href = DASHBOARD_V3_STYLESHEET;
      v3Stylesheet.setAttribute("data-ff-dashboard-v3-css", "");
      document.head.appendChild(v3Stylesheet);
    }
    if (!document.querySelector('[data-ff-dashboard-v3-js]')) {
      const v3Script = document.createElement("script");
      v3Script.src = DASHBOARD_V3_SCRIPT;
      v3Script.async = false;
      v3Script.setAttribute("data-ff-dashboard-v3-js", "");
      document.head.appendChild(v3Script);
    }

    if (!document.querySelector('[data-ff-commercial-dashboard-js]')) {
      const script = document.createElement("script");
      script.src = FULL_CUSTOMER_DASHBOARD_SCRIPT;
      script.async = false;
      script.setAttribute("data-ff-commercial-dashboard-js", "");
      script.addEventListener("error", () => {
        if (!productionDashboard() || main.querySelector("[data-commercial-dashboard-v2], [data-decision-dashboard-v3]")) return;
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
    if (main.querySelector("[data-decision-dashboard-v3]")) return;
    if (main.querySelector("[data-production-dashboard-guard]")) return;
    applying = true;
    main.innerHTML = guardedMarkup();
    applying = false;
  }

  function cleanRouteTransition(event) {
    // The full customer entry is a real SPA with explicit route ownership. A
    // forced reload here tears down a route after the authoritative renderer has
    // already painted it and can leave #main-content empty under route churn.
    // Keep the legacy reload recovery only for non-full-customer app surfaces.
    if (!customerApp() || fullCustomerEntry() || betaSpaEntry() || routeReloading) return;
    if (!APP_ROUTE_HASH.test(String(window.location.hash || ""))) return;
    routeReloading = true;
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (typeof window.location?.reload === "function") window.location.reload();
  }

  function isPlainLeftClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function handleRouteClick(event) {
    // Same-hash reload recovery is also legacy-only. Full customer navigation
    // must remain inside the SPA so the route-ownership guard can arbitrate it.
    if (!customerApp() || fullCustomerEntry() || betaSpaEntry() || routeReloading || !isPlainLeftClick(event)) return;
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

  installEarlyAuthoritativeAuthObserver();
  ensureFullCustomerDashboardAssets();
  const observer = new MutationObserver(() => queueMicrotask(enforce));
  observer.observe(main, { childList: true });
  window.addEventListener("hashchange", cleanRouteTransition);
  window.addEventListener("pageshow", enforce);
  ensureBrandFavicon();
  enforce();
})();