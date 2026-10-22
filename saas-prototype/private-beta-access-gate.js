(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const BETA_PATH = /^\/(?:app\/beta|saas-prototype)(?:\/|$)/i;
  const BETA_AUTH_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
  const BETA_START = "#/beta-start";
  // Deep links survive sign-in: a signed-out or expired visitor opening /app/beta/#/opportunities/<id> is sent to
  // sign-in with that exact in-workspace route as the return destination. Only a plain hash route inside the Private
  // Beta workspace qualifies (the sign-in page re-checks the same allowlist); anything else returns to Getting Started.
  const RETURN_ROUTE = /^#\/[a-z][a-z0-9-]{0,40}(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]{0,127}){0,3}$/;

  function productionBetaSurface() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""))
      && BETA_PATH.test(String(window.location.pathname || ""));
  }

  function release() {
    document.documentElement.classList.remove("ff-private-beta-access-pending");
  }

  function betaAuthUrl({ reauth = false } = {}) {
    const hash = String(window.location.hash || "");
    const base = RETURN_ROUTE.test(hash) && hash !== BETA_START
      ? `/production-auth.html?return=${encodeURIComponent(`/app/beta/${hash}`)}`
      : BETA_AUTH_URL;
    return reauth ? `${base}&reauth=1` : base;
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

      // A freshly invited tester is still terms-pending on the server, so the entitlements check
      // below would bounce them to sign-in and cancel the Beta Terms receipt in flight. The Terms
      // gate owns this state: it reloads this page once the receipt is recorded, or shows its own
      // recovery prompt. The workspace itself stays hidden until then.
      if (window.FlipForgeBetaTermsGate?.awaitingAcceptance?.()) return;

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