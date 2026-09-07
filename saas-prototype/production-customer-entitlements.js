(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PRODUCTION_APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  function productionEligible() {
    return PRODUCTION_HOST.test(String(window.location.hostname || "")) &&
      PRODUCTION_APP_PATH.test(String(window.location.pathname || ""));
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function applyPrivateBetaAllowanceCopy() {
    if (!productionEligible()) return;
    const page = document.querySelector(".customer-entitlements-page");
    if (!page) return;

    const currentPlan = page.querySelector(".customer-entitlement-current h2");
    if (!currentPlan || !/^private beta$/i.test(String(currentPlan.textContent || "").trim())) return;

    const heading = page.querySelector(".page-heading p");
    setText(heading, "Review your server-owned Private Beta access and evaluation allowance.");

    const usageCard = page.querySelector(".customer-entitlement-usage");
    if (!usageCard) return;
    setText(usageCard.querySelector(":scope > .panel-body > .eyebrow"), "Private Beta allowance");
    setText(usageCard.querySelector(".customer-entitlement-usage-number span"), "completed during beta");

    const rows = usageCard.querySelectorAll(".customer-entitlement-meter > div");
    rows.forEach(row => {
      const label = row.querySelector("span");
      const text = String(label?.textContent || "").trim();
      if (text === "Allowance") setText(label, "Lifetime allowance");
      if (text === "Remaining") setText(label, "Remaining in beta");
    });

    const note = usageCard.querySelector("small");
    if (note) {
      setText(note, "Your real-evaluation allowance is enforced by FlipForge on the server and is tied to your approved account. Clearing cookies, changing browsers, or changing devices does not reset it. Failed evaluations release their reservation; completed replays do not consume another evaluation.");
    }
  }

  if (productionEligible()) {
    const start = () => {
      applyPrivateBetaAllowanceCopy();
      if (typeof MutationObserver !== "function" || !document.body) return;
      const observer = new MutationObserver(() => applyPrivateBetaAllowanceCopy());
      observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }

  // Production eligibility and rendering are owned by customer-account-bridge.js.
  // This compatibility layer redirects legacy staging-auth links and applies
  // production-only presentation copy. It must never calculate, grant, reset,
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
