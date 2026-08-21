(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PRODUCTION_APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  function productionEligible() {
    return PRODUCTION_HOST.test(String(window.location.hostname || "")) &&
      PRODUCTION_APP_PATH.test(String(window.location.pathname || ""));
  }

  // Production eligibility and rendering are owned by customer-account-bridge.js.
  // This compatibility layer only redirects legacy staging-auth links. It must never
  // mutate or replace window.FlipForgeCustomerEntitlements, which is intentionally
  // frozen by the production account bridge before the route hook captures it.
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
