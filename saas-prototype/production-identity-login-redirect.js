(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PRODUCTION_AUTH_LINK = 'a[href^="/production-auth.html"],a[href*="goflipforge.com/production-auth.html"]';

  function eligibleHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function currentUser() {
    try {
      return window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getUser === "function"
        ? window.FlipForgeIdentity.getUser()
        : null;
    } catch (_) {
      return null;
    }
  }

  function productionAuthUrl() {
    const pathname = String(window.location.pathname || "/app/");
    const normalizedPath = pathname === "/app/customer" ? "/app/customer/" : pathname === "/app" ? "/app/" : pathname;
    const returnPath = `${normalizedPath}${window.location.search}${window.location.hash || "#/account"}`;
    return `/production-auth.html?return=${encodeURIComponent(returnPath)}`;
  }

  document.addEventListener("click", event => {
    if (!eligibleHost() || currentUser()) return;
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    const launcher = target.closest("[data-ff-production-toggle]");
    const authLink = target.closest(PRODUCTION_AUTH_LINK);
    if (!launcher && !authLink) return;

    // Every production sign-in entry point returns to the route the customer
    // was actually using. This prevents full-customer sessions under
    // /app/customer/ from being collapsed back into the controlled /app beta.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(productionAuthUrl());
  }, true);
})();
