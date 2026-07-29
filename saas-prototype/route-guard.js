(() => {
  "use strict";

  let pendingLeftId = null;

  function compareQuery(hashValue) {
    const hash = String(hashValue || "");
    const queryIndex = hash.indexOf("?");
    if (!hash.startsWith("#/compare") || queryIndex < 0) return null;
    return new URLSearchParams(hash.slice(queryIndex + 1));
  }

  function applyPendingComparison() {
    if (!pendingLeftId || window.location.hash !== "#/compare") return;

    window.requestAnimationFrame(() => {
      const selector = document.querySelector("#compare-left");
      if (!selector) return;

      const optionExists = [...selector.options].some(option => option.value === pendingLeftId);
      if (optionExists) {
        selector.value = pendingLeftId;
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      }
      pendingLeftId = null;
    });
  }

  function normalizeCurrentHash() {
    const query = compareQuery(window.location.hash);
    if (!query) return false;

    pendingLeftId = query.get("left");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/compare`
    );

    const hashChangeEvent = typeof HashChangeEvent === "function"
      ? new HashChangeEvent("hashchange")
      : new Event("hashchange");
    window.dispatchEvent(hashChangeEvent);
    return true;
  }

  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#/compare?"]');
    if (!link) return;

    const query = compareQuery(link.getAttribute("href"));
    if (!query) return;

    event.preventDefault();
    pendingLeftId = query.get("left");

    if (window.location.hash === "#/compare") {
      applyPendingComparison();
    } else {
      window.location.hash = "#/compare";
    }
  });

  window.addEventListener("hashchange", applyPendingComparison);

  if (!normalizeCurrentHash()) {
    applyPendingComparison();
  }
})();
