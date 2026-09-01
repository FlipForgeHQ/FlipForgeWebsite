(() => {
  "use strict";

  const SEARCH_PATH = "/api/v1/card-intelligence/search";
  const QUERY_SELECTOR = '#main-content [data-customer-discovery-form] input[name="exactCardQuery"]';
  const SELECTION_SELECTOR = "#main-content .customer-discovery-identity-assist [data-discovery-use-identity]";
  const originalFetch = window.fetch.bind(window);
  let generation = 0;

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      return new URL(String(raw || ""), window.location.href).pathname;
    } catch (_) {
      return "";
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function invalidateVisibleSelections() {
    document.querySelectorAll(SELECTION_SELECTOR).forEach(button => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });
  }

  document.addEventListener("input", event => {
    if (!(event.target instanceof Element) || !event.target.matches(QUERY_SELECTOR)) return;
    generation += 1;
    invalidateVisibleSelections();
  }, true);

  window.fetch = function flipForgeGuardedFetch(input, init) {
    if (requestPath(input) !== SEARCH_PATH || requestMethod(input, init) !== "POST") {
      return originalFetch(input, init);
    }

    const requestGeneration = ++generation;
    return originalFetch(input, init).then(response => {
      if (requestGeneration !== generation) {
        // Keep superseded identity-search work from ever reaching the selection
        // state. The live/current request owns the next selectable candidates.
        return new Promise(() => {});
      }
      return response;
    });
  };
})();
