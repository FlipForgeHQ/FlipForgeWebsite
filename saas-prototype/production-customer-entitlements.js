(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PRODUCTION_APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;

  function productionEligible() {
    return PRODUCTION_HOST.test(String(window.location.hostname || "")) &&
      PRODUCTION_APP_PATH.test(String(window.location.pathname || ""));
  }

  // The Private Beta allowance wording on Plan & Usage is rendered by the Account owner (customer-account.js).
  // This file no longer changes the page; it only redirects legacy staging sign-in links on the production host.

  // Production eligibility and rendering are owned by customer-account-bridge.js.
  // This compatibility layer redirects legacy staging-auth links. It must never calculate, grant, reset,
  // extend, or override the server-owned evaluation allowance, and it must never
  // mutate or replace window.FlipForgeCustomerEntitlements.
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
