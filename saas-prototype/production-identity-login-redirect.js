(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;

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
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash || "#/account"}`;
    return `/production-auth.html?return=${encodeURIComponent(returnPath)}`;
  }

  document.addEventListener("click", event => {
    if (!eligibleHost()) return;
    const trigger = event.target && event.target.closest
      ? event.target.closest("[data-ff-production-toggle]")
      : null;
    if (!trigger || currentUser()) return;

    // Keep credential entry on an isolated production Identity surface so the
    // cockpit's route/focus renderers cannot consume or replace the sign-in UI.
    // Authentication remains the same secure same-origin Netlify Identity cookie session.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(productionAuthUrl());
  }, true);
})();
