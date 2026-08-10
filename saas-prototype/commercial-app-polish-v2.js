(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function production() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function installApprovedBrandMark() {
    const mark = document.querySelector(".brand-mark");
    if (!mark || mark.classList.contains("ff-approved-brand-mark")) return;
    mark.classList.add("ff-approved-brand-mark");
    mark.innerHTML = '<img src="/assets/brand/flipforge-mark.svg" alt="" aria-hidden="true">';

    const name = document.querySelector(".brand-name");
    if (name) name.textContent = "FLIPFORGE™";
    const subtitle = document.querySelector(".brand-subtitle");
    if (subtitle) subtitle.textContent = "CARD VALUE INTELLIGENCE";
  }

  function syncEnvironmentLanguage() {
    if (!eligible()) return;
    document.body.classList.add("ff-commercial-shell");

    const banner = document.querySelector(".prototype-banner");
    if (banner) {
      const title = banner.querySelector("strong");
      const copy = banner.querySelector("span");
      if (production()) {
        if (title) title.textContent = "PRIVATE BETA INTELLIGENCE";
        if (copy) copy.textContent = "Authenticated tenant-scoped decisions · SQLite saved · No transaction authority";
      } else {
        if (title) title.textContent = "BETA PREVIEW";
        if (copy) copy.textContent = "Controlled customer intelligence preview · No transaction authority";
      }
    }

    const chip = document.querySelector(".prototype-chip");
    if (chip) chip.textContent = production() ? "PRIVATE BETA" : "BETA PREVIEW";

    const profileSmall = document.querySelector(".profile-button .profile-copy small");
    if (production() && profileSmall && /preview/i.test(profileSmall.textContent || "")) {
      profileSmall.textContent = "Private beta";
    }

    const planCard = document.querySelector(".plan-card");
    if (planCard) {
      const eyebrow = planCard.querySelector(".eyebrow");
      const strong = planCard.querySelector("strong");
      const small = planCard.querySelector("small");
      if (eyebrow) eyebrow.textContent = "Tenant access";
      if (strong) strong.textContent = "Plan & Usage";
      if (small) small.textContent = "Plan state, evaluation usage, checkout availability, and billing access are server-owned.";
    }

    if (production()) document.title = "FlipForge | Card Value Intelligence";
    installApprovedBrandMark();
  }

  document.addEventListener("DOMContentLoaded", syncEnvironmentLanguage, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(syncEnvironmentLanguage));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(syncEnvironmentLanguage));
  queueMicrotask(syncEnvironmentLanguage);
})();
