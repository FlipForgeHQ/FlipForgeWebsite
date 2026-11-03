(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function production() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function fullCustomerMode() {
    return FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  // The approved brand mark, the commercial shell class and the Dashboard's final presentation (supported-value
  // rule, duplicate identity, card-number display) are in the page markup and the Dashboard owner
  // (commercial-dashboard-v2.js). What remains here is the Discover source-listing link, which belongs to the
  // Discover owner and is left for that consolidation.

  // Values read back from rendered text are decoded; escape them again before building markup.
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
          <strong>${escapeHtml(marketplace)}</strong>
          <span>${escapeHtml(hostname)} · Direct source link</span>
        </span>
        <span class="ff-source-listing-verified">SOURCE</span>`;
      actions.before(strip);
    });
  }

  function installDiscoveryObserver() {
    const main = document.querySelector("#main-content");
    if (!main || main.dataset.ffSourceObserver === "true") return;
    main.dataset.ffSourceObserver = "true";

    const observer = new MutationObserver(() => {
      enhanceDiscoverySourceLinks(main);
    });
    observer.observe(main, { childList: true, subtree: true });
    enhanceDiscoverySourceLinks(main);
  }

  function syncEnvironmentLanguage() {
    if (!eligible()) return;
    installDiscoveryObserver();
    enhanceDiscoverySourceLinks(document);
  }

  document.addEventListener("DOMContentLoaded", syncEnvironmentLanguage, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(syncEnvironmentLanguage));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(syncEnvironmentLanguage));
  queueMicrotask(syncEnvironmentLanguage);
})();
