(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;

  const groups = [
    { before: "beta-start", label: "PRIVATE BETA" },
    { before: "dashboard", label: "OVERVIEW" },
    { before: "discover", label: "MARKET INTELLIGENCE" },
    { before: "tracking", label: "COLLECTION" },
    { before: "compare", label: "ANALYSIS" }
  ];

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function production() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function navigationAnchor(nav, route) {
    const target = nav.querySelector(`[data-route="${route}"]`);
    if (!target) return null;
    if (target.parentElement === nav) return target;
    const advanced = target.closest(".ff-advanced-nav");
    return advanced && advanced.parentElement === nav ? advanced : null;
  }

  function installNavigationGroups() {
    const nav = document.querySelector(".primary-nav");
    if (!nav || nav.dataset.ffGrouped === "true") return;

    groups.forEach(group => {
      const target = navigationAnchor(nav, group.before);
      if (!target) return;
      const label = document.createElement("span");
      label.className = "ff-nav-group-label";
      label.textContent = group.label;
      label.setAttribute("aria-hidden", "true");
      nav.insertBefore(label, target);
    });

    nav.dataset.ffGrouped = "true";
  }

  function syncAdvancedAnalysisState() {
    const advanced = document.querySelector(".primary-nav .ff-advanced-nav");
    if (!advanced) return;
    const route = routeName();
    const activeInside = [...advanced.querySelectorAll("[data-route]")]
      .some(link => link.dataset.route === route);
    advanced.open = activeInside;
  }

  function normalizeVisibleLanguage() {
    const isProduction = production();
    const banner = document.querySelector(".prototype-banner");
    const chip = document.querySelector(".prototype-chip");

    if (banner) {
      const title = banner.querySelector("strong");
      const copy = banner.querySelector("span");
      if (title) title.textContent = isProduction ? "PRIVATE BETA INTELLIGENCE" : "BETA PREVIEW";
      if (copy) {
        copy.textContent = isProduction
          ? "Authenticated tenant-scoped intelligence · Saved decisions · No transaction authority"
          : "Controlled customer intelligence preview · No transaction authority";
      }
    }

    if (chip) chip.textContent = isProduction ? "PRIVATE BETA" : "BETA PREVIEW";

    const guide = document.querySelector('.primary-nav [data-route="beta-start"]');
    if (guide) {
      const icon = guide.querySelector("span[aria-hidden]");
      const iconText = icon ? icon.outerHTML : '<span aria-hidden="true">✓</span>';
      guide.innerHTML = `${iconText}Getting Started`;
    }

    document.querySelectorAll(".staging-only-nav").forEach(node => {
      if (isProduction) node.hidden = true;
    });

    const planCard = document.querySelector(".plan-card");
    if (planCard) {
      const eyebrow = planCard.querySelector(".eyebrow");
      const strong = planCard.querySelector("strong");
      const small = planCard.querySelector("small");
      if (eyebrow) eyebrow.textContent = "Tenant access";
      if (strong) strong.textContent = "Plan & Usage";
      if (small && /billing|prototype|preview/i.test(small.textContent || "")) {
        small.textContent = "Plan state and evaluation usage are server-owned. Paid access is not active during private beta.";
      }
    }

    const accountName = document.querySelector(".account-link strong");
    if (accountName && /prototype|preview/i.test(accountName.textContent || "")) {
      accountName.textContent = "FlipForge Account";
    }

    const profileName = document.querySelector(".profile-button .profile-copy strong");
    if (profileName && /prototype|preview/i.test(profileName.textContent || "")) {
      profileName.textContent = "Account";
    }

    const profileSmall = document.querySelector(".profile-button .profile-copy small");
    if (profileSmall && /plan|preview|prototype/i.test(profileSmall.textContent || "")) {
      profileSmall.textContent = isProduction ? "Private beta" : "Beta preview";
    }

    const shortcut = document.querySelector(".global-search kbd");
    if (shortcut) shortcut.textContent = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "") ? "⌘ K" : "Ctrl K";

    document.title = isProduction ? "FlipForge | Card Value Intelligence" : "FlipForge Beta | Card Value Intelligence";
  }

  function apply() {
    if (!eligible()) return;
    document.body.classList.add("ff-core-platform-completion");
    installNavigationGroups();
    syncAdvancedAnalysisState();
    normalizeVisibleLanguage();
  }

  document.addEventListener("DOMContentLoaded", apply, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(apply));
  queueMicrotask(apply);
})();
