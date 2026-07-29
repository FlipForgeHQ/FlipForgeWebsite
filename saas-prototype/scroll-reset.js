(() => {
  "use strict";

  function resetHorizontalScroll() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const top = scrollingElement?.scrollTop ?? window.scrollY ?? 0;

    if (scrollingElement) scrollingElement.scrollLeft = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    window.scrollTo({ left: 0, top, behavior: "instant" });
  }

  function resetAfterLayout() {
    resetHorizontalScroll();

    window.requestAnimationFrame(() => {
      resetHorizontalScroll();
      window.requestAnimationFrame(resetHorizontalScroll);
    });

    // Chrome can restore a previous horizontal position after hash navigation.
    window.setTimeout(resetHorizontalScroll, 80);
  }

  window.addEventListener("hashchange", resetAfterLayout);
  window.addEventListener("pageshow", resetAfterLayout);
  window.addEventListener("load", resetAfterLayout);
  window.addEventListener("resize", resetAfterLayout);
  resetAfterLayout();
})();
