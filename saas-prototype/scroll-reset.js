(() => {
  "use strict";

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

  // A new application route is a new workspace view. Start it at the top instead
  // of carrying the previous route's vertical position under the sticky topbar.
  window.addEventListener("hashchange", resetRouteScroll);

  // Reloads and resizes preserve the user's vertical reading position while still
  // protecting the shell from accidental horizontal restoration.
  window.addEventListener("pageshow", resetHorizontalAfterLayout);
  window.addEventListener("load", resetHorizontalAfterLayout);
  window.addEventListener("resize", resetHorizontalAfterLayout);
  resetHorizontalAfterLayout();
})();
