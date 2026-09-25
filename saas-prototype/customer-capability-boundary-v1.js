(() => {
  "use strict";

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const WITHHELD_ROUTES = new Set(["sell"]);
  const FALLBACK_HASH = "#/tracking";

  if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function enforce() {
    if (!WITHHELD_ROUTES.has(routeName())) return false;
    if (window.location.hash !== FALLBACK_HASH) window.location.replace(FALLBACK_HASH);
    return true;
  }

  enforce();
  window.addEventListener("hashchange", enforce);
  window.FlipForgeCustomerCapabilityBoundaryV1 = Object.freeze({
    version: "v1",
    withheldRoutes: Object.freeze([...WITHHELD_ROUTES]),
    fallbackHash: FALLBACK_HASH
  });
})();
