(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const BETA_PATH = /^\/(?:app\/beta|saas-prototype)(?:\/|$)/i;
  const BETA_AUTH_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
  const BETA_START = "#/beta-start";

  function productionBetaSurface() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
      && BETA_PATH.test(String(window.location.pathname || ""));
  }

  function release() {
    document.documentElement.classList.remove("ff-private-beta-access-pending");
  }

  function betaAuthUrl({ reauth = false } = {}) {
    return reauth ? `${BETA_AUTH_URL}&reauth=1` : BETA_AUTH_URL;
  }

  async function verifyServerAccess() {
    const correlationId = window.crypto?.randomUUID?.() || `beta-entry-${Date.now()}`;
    return fetch("/api/v1/entitlements", {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
  }

  async function enforce() {
    if (!productionBetaSurface()) {
      release();
      return;
    }

    try {
      const session = await window.FlipForgeIdentity?.refresh?.();
      if (!session?.authenticated) {
        window.location.replace(betaAuthUrl());
        return;
      }

      // The server decides membership. The browser's stored profile is from sign-in time and
      // can still say terms-pending after the account was promoted (Beta Terms accepted), which
      // bounced newly activated testers between this page and the sign-in page.
      const response = await verifyServerAccess();
      if (!response.ok) {
        window.location.replace(betaAuthUrl({ reauth: response.status === 401 }));
        return;
      }
      // Active invited membership: server-verified above, and the account must carry exactly
      // one tenant role (membershipActive in the identity snapshot also requires that).
      const confirmed = window.FlipForgeIdentity?.noteServerMembership?.(true);
      if (confirmed && confirmed.membershipActive !== true) {
        window.location.replace(betaAuthUrl());
        return;
      }

      window.__FlipForgePrivateBetaAccessVerified = true;
      if (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#") {
        window.location.hash = BETA_START;
      }
      document.body?.setAttribute("data-ff-access-mode", "private-beta");
      release();
      window.dispatchEvent(new CustomEvent("flipforge:private-beta-access-verified"));
    } catch (_) {
      window.location.replace(betaAuthUrl());
    }
  }

  enforce();
})();