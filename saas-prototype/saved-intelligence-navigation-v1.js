(() => {
  "use strict";

  function isPlainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  document.addEventListener("click", event => {
    const link = event.target.closest?.('a[href="#/opportunities"]');
    if (!link || !isPlainLeftClick(event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const nextHash = "#/opportunities";
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

    // Saved Decisions has both legacy and customer route listeners plus async
    // customer data loads. A clean same-tab load prevents stale detail/list
    // work from repainting the page and also makes repeated clicks on the same
    // hash useful instead of becoming a no-op.
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
})();
