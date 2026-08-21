(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PRODUCTION_APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  function productionEligible() {
    return PRODUCTION_HOST.test(String(window.location.hostname || "")) &&
      PRODUCTION_APP_PATH.test(String(window.location.pathname || ""));
  }

  const entitlements = window.FlipForgeCustomerEntitlements;
  if (!entitlements || typeof entitlements.isEligible !== "function") return;

  // The customer entitlement adapter may be frozen by the production hardening layer.
  // Never mutate that authoritative object in place. Publish a frozen facade instead,
  // preserving every enumerable capability while extending eligibility for the live app.
  const originalEligible = entitlements.isEligible.bind(entitlements);
  window.FlipForgeCustomerEntitlements = Object.freeze({
    ...entitlements,
    isEligible: () => originalEligible() || productionEligible()
  });

  document.addEventListener("click", event => {
    if (!productionEligible()) return;
    const link = event.target?.closest?.('a[href^="/staging-auth.html"]');
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash || "#/account"}`;
    window.location.assign(`/production-auth.html?return=${encodeURIComponent(returnPath)}`);
  }, true);
})();
