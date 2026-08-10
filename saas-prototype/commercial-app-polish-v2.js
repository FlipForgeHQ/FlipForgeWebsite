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

  function safeExternalUrl(value) {
    try {
      const parsed = new URL(String(value || ""), window.location.href);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      if (!parsed.hostname) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function marketplaceLabel(card, parsedUrl) {
    const eyebrow = card.querySelector(".panel-header .eyebrow");
    const eyebrowText = String(eyebrow?.textContent || "").trim();
    const providerPart = eyebrowText.includes("·")
      ? eyebrowText.split("·").slice(1).join("·").trim()
      : "";
    if (providerPart && providerPart.length <= 60) return providerPart;

    const host = String(parsedUrl?.hostname || "").replace(/^www\./i, "").toLowerCase();
    if (/(^|\.)ebay\./.test(host)) return "eBay";
    if (/(^|\.)comc\./.test(host)) return "COMC";
    if (/(^|\.)myslabs\./.test(host)) return "MySlabs";
    if (/(^|\.)goldin\./.test(host)) return "Goldin";
    if (/(^|\.)ha\.com$/.test(host) || /heritage/.test(host)) return "Heritage";
    if (/fanatics/.test(host)) return "Fanatics Collect";
    return host || "marketplace";
  }

  function enhanceDiscoverySourceLinks(root = document) {
    root.querySelectorAll?.(".customer-discovery-candidate").forEach(card => {
      if (card.dataset.ffSourceLinkEnhanced === "true") return;

      const actions = card.querySelector(".customer-discovery-actions");
      const link = actions?.querySelector('a[href][target="_blank"]') || actions?.querySelector("a[href]");
      if (!actions || !link) return;

      const parsedUrl = safeExternalUrl(link.getAttribute("href"));
      if (!parsedUrl || parsedUrl.origin === window.location.origin) return;

      card.dataset.ffSourceLinkEnhanced = "true";
      const marketplace = marketplaceLabel(card, parsedUrl);
      const hostname = parsedUrl.hostname.replace(/^www\./i, "");

      link.classList.add("ff-source-listing-button");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `View on ${marketplace} ↗`;
      link.setAttribute("aria-label", `View this card on ${marketplace}; opens the original marketplace listing in a new tab`);
      link.title = `Open the original listing on ${marketplace}`;

      const strip = document.createElement("div");
      strip.className = "ff-source-listing-strip";
      strip.innerHTML = `
        <span class="ff-source-listing-icon" aria-hidden="true">↗</span>
        <span class="ff-source-listing-copy">
          <small>Original marketplace listing</small>
          <strong>${marketplace}</strong>
          <span>${hostname} · Direct source link</span>
        </span>
        <span class="ff-source-listing-verified">SOURCE</span>`;
      actions.before(strip);
    });
  }

  function installDiscoveryObserver() {
    const main = document.querySelector("#main-content");
    if (!main || main.dataset.ffSourceObserver === "true") return;
    main.dataset.ffSourceObserver = "true";

    const observer = new MutationObserver(() => enhanceDiscoverySourceLinks(main));
    observer.observe(main, { childList: true, subtree: true });
    enhanceDiscoverySourceLinks(main);
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
    installDiscoveryObserver();
    enhanceDiscoverySourceLinks(document);
  }

  document.addEventListener("DOMContentLoaded", syncEnvironmentLanguage, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(syncEnvironmentLanguage));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(syncEnvironmentLanguage));
  queueMicrotask(syncEnvironmentLanguage);
})();
