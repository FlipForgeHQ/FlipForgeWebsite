(() => {
  "use strict";

  function resetHorizontalScroll() {
    const top = window.scrollY;
    window.scrollTo({ left: 0, top, behavior: "instant" });
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }

  window.addEventListener("hashchange", resetHorizontalScroll);
  window.addEventListener("pageshow", resetHorizontalScroll);
  window.requestAnimationFrame(resetHorizontalScroll);
})();
