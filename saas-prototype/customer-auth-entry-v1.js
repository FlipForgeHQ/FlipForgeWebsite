(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const SIGN_IN_SELECTOR = "[data-ff-customer-sign-in]";

  function eligible() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function normalizedCustomerPath() {
    const pathname = String(window.location.pathname || "/app/customer/");
    return pathname === "/app/customer" ? "/app/customer/" : pathname;
  }

  function returnPath() {
    return `${normalizedCustomerPath()}${window.location.search}${window.location.hash || "#/dashboard"}`;
  }

  function authUrl() {
    const encoded = encodeURIComponent(returnPath());
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
      ? `/production-auth.html?return=${encoded}`
      : `/staging-auth.html?returnTo=${encoded}`;
  }

  function identitySnapshot() {
    try {
      if (window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getSnapshot === "function") {
        return window.FlipForgeIdentity.getSnapshot() || { authenticated: false };
      }
      if (window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getUser === "function") {
        return { authenticated: Boolean(window.FlipForgeIdentity.getUser()) };
      }
    } catch (_) {
      // Fail open for access recovery: an identity read error must never hide sign-in.
    }
    return { authenticated: false };
  }

  function render() {
    if (!eligible()) return;
    const link = document.querySelector(SIGN_IN_SELECTOR);
    if (!link) return;
    const snapshot = identitySnapshot();
    const authenticated = snapshot?.authenticated === true;
    link.hidden = authenticated;
    link.setAttribute("aria-hidden", authenticated ? "true" : "false");
    link.href = authUrl();
  }

  function initialize() {
    if (!eligible()) return;
    render();
    window.addEventListener("hashchange", render);
    window.addEventListener("popstate", render);
    window.addEventListener("flipforge:identity-change", render);
    // Identity initialization is asynchronous. Re-check once after the first
    // event loop turn so an already-authenticated session does not retain the
    // anonymous recovery control if the identity event raced page startup.
    window.setTimeout(render, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
