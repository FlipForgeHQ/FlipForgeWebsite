(() => {
  "use strict";

  if (window.__ffTrackingRouteTransitionV2 === true) return;

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const STORAGE_KEY = "flipforge.trackingContext.v1";

  function plainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  function trackingIdFromHref(href) {
    const match = String(href || "").match(/^#\/tracking\/([^/?#]+)$/);
    if (!match) return "";
    try {
      const id = decodeURIComponent(match[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function remember(id) {
    try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (_) { /* session context only */ }
  }

  function dispatchCurrentRoute() {
    try {
      window.dispatchEvent(new HashChangeEvent("hashchange", {
        oldURL: window.location.href,
        newURL: window.location.href
      }));
    } catch (_) {
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  document.addEventListener("click", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/tracking/"]');
    if (!link) return;

    const id = trackingIdFromHref(link.getAttribute("href"));
    if (!id) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    remember(id);

    const nextHash = `#/tracking/${encodeURIComponent(id)}`;
    const owner = window.FlipForgeCustomerRouteOwnership;
    if (owner && typeof owner.rememberExplicitIntent === "function") {
      owner.rememberExplicitIntent(nextHash);
    }

    if (window.location.hash === nextHash) {
      dispatchCurrentRoute();
      return;
    }

    // Stay inside the SPA. A hard reload created overlapping browser navigation
    // while the governed lifecycle adapter was also mounting. The hash change is
    // sufficient: staging-route-hook renders the authoritative adapter and the
    // route-ownership guard reclaims #main-content if a legacy shell paints late.
    window.location.hash = nextHash;
  }, true);

  window.__ffTrackingRouteTransitionV2 = true;
})();
