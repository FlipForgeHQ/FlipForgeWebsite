(() => {
  "use strict";

  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
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

  function stagingAuthUrl() {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
    return `/staging-auth.html?return=${encodeURIComponent(returnPath)}`;
  }

  document.addEventListener("click", event => {
    if (!eligibleHost()) return;
    const trigger = event.target && event.target.closest
      ? event.target.closest("[data-ff-identity-toggle]")
      : null;
    if (!trigger || currentUser()) return;

    // The prototype cockpit has several route/focus renderers. Keep credential
    // entry on the isolated staging-auth surface so no cockpit renderer can
    // steal focus from email/password controls. Authentication remains the
    // same secure same-origin Netlify Identity cookie session.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(stagingAuthUrl());
  }, true);
})();
