(() => {
  "use strict";

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const STORAGE_KEY = "flipforge.trackingContext.v1";

  function trackingIdFromHref(href) {
    const match = String(href || "").match(/#\/tracking\/([^/?#]+)/);
    if (!match) return "";
    try {
      const id = decodeURIComponent(match[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function remember(id) {
    try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (_) { /* session preference only */ }
  }

  function isPlainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  document.addEventListener("click", event => {
    const link = event.target.closest?.('a[data-ff-evidence-understood], .ff-evidence-next-step a[href^="#/tracking/"]');
    if (!link || !isPlainLeftClick(event)) return;

    const id = trackingIdFromHref(link.getAttribute("href"));
    if (!id) return;

    remember(id);
    event.preventDefault();
    event.stopImmediatePropagation();

    const nextHash = `#/tracking/${encodeURIComponent(id)}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

    // A fresh load is intentional here. The legacy prototype router and the
    // customer lifecycle router both receive hash changes in the existing app.
    // Loading the exact Tracking URL gives the lifecycle router one clean
    // initialization path—the same behavior that already works in a new tab.
    try {
      window.history.pushState({ flipforgeTrackingReload: true }, "", nextUrl);
      window.location.reload();
    } catch (_) {
      const url = new URL(window.location.href);
      url.hash = nextHash;
      url.searchParams.set("ff_tracking_nav", String(Date.now()));
      window.location.assign(url.toString());
    }
  }, true);
})();

(() => {
  "use strict";
  if (document.querySelector('script[data-ff-tracking-customer-ux]')) return;
  const script = document.createElement("script");
  script.src = "tracking-customer-ux-v1.js";
  script.dataset.ffTrackingCustomerUx = "";
  document.head.appendChild(script);
})();
