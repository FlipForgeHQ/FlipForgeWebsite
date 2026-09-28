(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const BETA_AUTH_URL = "/production-auth.html?return=%2Fapp%2Fcustomer%2F%23%2Fbeta-start";
  const BETA_START = "#/beta-start";

  function productionCustomerSurface() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
      && CUSTOMER_PATH.test(String(window.location.pathname || ""));
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
    if (!productionCustomerSurface()) {
      release();
      return;
    }

    try {
      const session = await window.FlipForgeIdentity?.refresh?.();
      if (!session?.authenticated || !session?.membershipActive) {
        window.location.replace(betaAuthUrl());
        return;
      }

      const response = await verifyServerAccess();
      if (!response.ok) {
        window.location.replace(betaAuthUrl({ reauth: response.status === 401 }));
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