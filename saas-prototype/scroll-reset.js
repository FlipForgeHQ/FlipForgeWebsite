(() => {
  "use strict";

  function isPlainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  // Saved Decisions is served by the customer adapter while the legacy shell also
  // listens for hash changes. Use a clean same-tab load for the list route so
  // repeated clicks never become a same-hash no-op and stale detail requests
  // cannot repaint the list after the customer returns to Saved Decisions.
  document.addEventListener("click", event => {
    const link = event.target.closest?.('a[href="#/opportunities"]');
    if (!link || !isPlainLeftClick(event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const nextHash = "#/opportunities";
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    try {
      window.history.pushState({ flipforgeSavedIntelligenceReload: true }, "", nextUrl);
      window.location.reload();
    } catch (_) {
      const url = new URL(window.location.href);
      url.hash = nextHash;
      url.searchParams.set("ff_saved_nav", String(Date.now()));
      window.location.assign(url.toString());
    }
  }, true);

  function resetScroll(top) {
    const scrollingElement = document.scrollingElement || document.documentElement;

    if (scrollingElement) {
      scrollingElement.scrollLeft = 0;
      scrollingElement.scrollTop = top;
    }
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    window.scrollTo({ left: 0, top, behavior: "auto" });
  }

  function resetHorizontalScroll() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const top = scrollingElement?.scrollTop ?? window.scrollY ?? 0;
    resetScroll(top);
  }

  function repeatAfterLayout(action) {
    action();

    window.requestAnimationFrame(() => {
      action();
      window.requestAnimationFrame(action);
    });

    // Chrome can restore a prior scroll position after hash navigation/layout.
    window.setTimeout(action, 80);
  }

  function resetRouteScroll() {
    repeatAfterLayout(() => resetScroll(0));
  }

  function resetHorizontalAfterLayout() {
    repeatAfterLayout(resetHorizontalScroll);
  }

  function polishMarketViewZeroState(root = document) {
    if (!/^#\/?market-view(?:[/?]|$)/i.test(String(window.location.hash || ""))) return;
    const empty = root.querySelector?.(".market-view-shell > section.market-view-empty");
    if (!empty || empty.dataset.ffZeroStatePolished === "true") return;

    const title = empty.querySelector("strong");
    const copy = empty.querySelector("p");
    if (!title || !copy) return;

    title.textContent = "Build your first Market View.";
    copy.textContent = "Start with Discover and complete one exact-card evaluation. Saved decisions will populate this view automatically with decision mix, evidence health, supported value, and 7 / 14 / 30 follow-up coverage.";
    empty.dataset.ffZeroStatePolished = "true";
  }

  function syncRoutePresentation() {
    polishMarketViewZeroState(document);
  }

  // A new application route is a new workspace view. Start it at the top instead
  // of carrying the previous route's vertical position under the sticky topbar.
  window.addEventListener("hashchange", () => {
    resetRouteScroll();
    queueMicrotask(syncRoutePresentation);
  });

  // Market View renders asynchronously after its tenant-scoped request resolves.
  // Observe only the main workspace so the zero-state wording can be normalized
  // without changing any data, evidence, recommendation, or transaction authority.
  const main = document.querySelector("#main-content");
  if (main) {
    const observer = new MutationObserver(syncRoutePresentation);
    observer.observe(main, { childList: true, subtree: true });
  }

  // Reloads and resizes preserve the user's vertical reading position while still
  // protecting the shell from accidental horizontal restoration.
  window.addEventListener("pageshow", resetHorizontalAfterLayout);
  window.addEventListener("load", resetHorizontalAfterLayout);
  window.addEventListener("resize", resetHorizontalAfterLayout);
  resetHorizontalAfterLayout();
  syncRoutePresentation();
})();
