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

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function syncAdvancedAnalysisState() {
    const advanced = document.querySelector(".primary-nav .ff-advanced-nav");
    if (!advanced) return;
    const route = routeName();
    const activeInside = [...advanced.querySelectorAll("[data-route]")]
      .some(link => link.dataset.route === route);
    advanced.open = activeInside;
  }

  function enablePlanUsageNavigation() {
    const planCard = document.querySelector(".plan-card");
    if (!planCard) return;

    planCard.classList.add("ff-plan-card-link");
    planCard.setAttribute("role", "link");
    planCard.setAttribute("tabindex", "0");
    planCard.setAttribute("aria-label", "Open Plan & Usage");

    if (planCard.dataset.planUsageNavigationBound === "true") return;

    const navigate = () => {
      if (window.location.hash === "#/account") {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      window.location.hash = "#/account";
    };

    planCard.addEventListener("click", event => {
      if (event.target.closest("a, button, input, select, textarea")) return;
      navigate();
    });
    planCard.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigate();
    });
    planCard.dataset.planUsageNavigationBound = "true";
  }

  function normalizeVisibleLanguage() {
    const isProduction = production();
    const banner = document.querySelector(".prototype-banner");
    const chip = document.querySelector(".prototype-chip");

    if (banner) {
      const title = banner.querySelector("strong");
      const copy = banner.querySelector("span");
      if (title) title.textContent = "PRIVATE BETA";
      if (copy) copy.textContent = isProduction
        ? "Card intelligence workspace · Evaluation only"
        : "Card intelligence preview · Evaluation only";
    }

    if (chip) chip.textContent = "PRIVATE BETA";

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
      if (eyebrow) eyebrow.textContent = "Private beta";
      if (strong) strong.textContent = "Plan & Usage";
      if (small && /billing|prototype|preview|server-owned|tenant/i.test(small.textContent || "")) {
        small.textContent = "Usage updates automatically. Paid access is not active during private beta.";
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
    if (profileSmall) profileSmall.textContent = "Plan & Usage";

    const shortcut = document.querySelector(".global-search kbd");
    if (shortcut) shortcut.textContent = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "") ? "⌘ K" : "Ctrl K";

    document.title = isProduction ? "FlipForge | Card Intelligence" : "FlipForge Beta | Card Intelligence";
  }

  function apply() {
    if (!eligible()) return;
    document.body.classList.add("ff-core-platform-completion");
    syncAdvancedAnalysisState();
    enablePlanUsageNavigation();
    normalizeVisibleLanguage();
  }

  document.addEventListener("DOMContentLoaded", apply, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(apply));
  queueMicrotask(apply);
})();