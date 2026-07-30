(() => {
  "use strict";

  const desktop = window.matchMedia("(min-width: 901px)");

  function resetShellHorizontalPosition() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const top = scrollingElement?.scrollTop ?? window.scrollY ?? 0;
    const nodes = [
      scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector(".app-shell"),
      document.querySelector(".sidebar"),
      document.querySelector(".primary-nav"),
      document.querySelector(".workspace"),
      document.querySelector("#main-content")
    ];

    for (const node of nodes) {
      if (node && "scrollLeft" in node) node.scrollLeft = 0;
    }

    if (desktop.matches) {
      const sidebar = document.querySelector(".sidebar");
      if (sidebar) {
        sidebar.style.left = "0px";
        sidebar.style.marginLeft = "0px";
        sidebar.style.transform = "translateX(0px)";
      }
    }

    window.scrollTo({ left: 0, top, behavior: "instant" });
  }

  function resetAfterLayout() {
    resetShellHorizontalPosition();
    requestAnimationFrame(() => {
      resetShellHorizontalPosition();
      requestAnimationFrame(resetShellHorizontalPosition);
    });
    setTimeout(resetShellHorizontalPosition, 80);
    setTimeout(resetShellHorizontalPosition, 240);
  }

  window.addEventListener("load", resetAfterLayout);
  window.addEventListener("pageshow", resetAfterLayout);
  window.addEventListener("hashchange", resetAfterLayout);
  window.addEventListener("resize", resetAfterLayout);
  desktop.addEventListener?.("change", resetAfterLayout);
  resetAfterLayout();
})();
