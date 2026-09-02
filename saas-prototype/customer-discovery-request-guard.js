(() => {
  "use strict";

  const SEARCH_PATH = "/api/v1/card-intelligence/search";
  const RESOLVE_PATH = "/api/v1/card-intelligence/resolve";
  const DISCOVER_PATH = "/api/v1/discover";
  const QUERY_SELECTOR = '#main-content [data-customer-discovery-form] input[name="exactCardQuery"]';
  const SELECTION_SELECTOR = "#main-content .customer-discovery-identity-assist [data-discovery-use-identity]";
  const GRADE_PATTERN = /\b(PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i;
  const originalFetch = window.fetch.bind(window);
  let generation = 0;
  let requestedGrade = null;
  let resolvedGrade = null;
  let resolutionMismatch = false;

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

  function requestBody(init) {
    if (!init || typeof init.body !== "string") return {};
    try { return JSON.parse(init.body); } catch (_) { return {}; }
  }

  function gradeContext(value) {
    const match = String(value || "").match(GRADE_PATTERN);
    return match ? { grader: match[1].toUpperCase(), grade: match[2] } : null;
  }

  function sameGrade(left, right) {
    return Boolean(left && right)
      && left.grader === right.grader
      && left.grade === right.grade;
  }

  function clearSlabContext() {
    requestedGrade = null;
    resolvedGrade = null;
    resolutionMismatch = false;
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
    clearSlabContext();
    invalidateVisibleSelections();
  }, true);

  window.fetch = function flipForgeGuardedFetch(input, init) {
    const path = requestPath(input);
    const method = requestMethod(input, init);
    if (method !== "POST") return originalFetch(input, init);

    if (path === SEARCH_PATH) {
      const body = requestBody(init);
      requestedGrade = gradeContext(body.query);
      resolvedGrade = null;
      resolutionMismatch = false;
      const requestGeneration = ++generation;
      return originalFetch(input, init).then(response => {
        if (requestGeneration !== generation) {
          // Keep superseded identity-search work from ever reaching the selection
          // state. The live/current request owns the next selectable candidates.
          return new Promise(() => {});
        }
        return response;
      });
    }

    if (path === RESOLVE_PATH) {
      const expectedGrade = requestedGrade;
      const requestGeneration = generation;
      return originalFetch(input, init).then(async response => {
        if (!expectedGrade || requestGeneration !== generation || !response?.ok) return response;
        let payload = null;
        try { payload = await response.clone().json(); } catch (_) { payload = null; }
        const confirmedGrade = gradeContext(`${payload?.data?.grader || ""} ${payload?.data?.grade || ""}`);
        if (!sameGrade(expectedGrade, confirmedGrade)) {
          resolvedGrade = null;
          resolutionMismatch = true;
        } else {
          resolvedGrade = confirmedGrade;
          resolutionMismatch = false;
        }
        return response;
      });
    }

    if (path === DISCOVER_PATH) {
      const body = requestBody(init);
      const exactCardQuery = String(body.exactCardQuery || "").trim().replace(/\s+/g, " ");
      const queryGrade = gradeContext(exactCardQuery);

      if (resolutionMismatch) {
        clearSlabContext();
        return Promise.reject(new Error("FlipForge stopped Discover because the resolved slab grade did not match the grade you entered."));
      }

      if (resolvedGrade) {
        if (queryGrade && !sameGrade(queryGrade, resolvedGrade)) {
          clearSlabContext();
          return Promise.reject(new Error("FlipForge stopped Discover because the canonical identity changed the confirmed slab grade."));
        }

        const guardedBody = queryGrade
          ? body
          : { ...body, exactCardQuery: `${exactCardQuery} ${resolvedGrade.grader} ${resolvedGrade.grade}`.trim() };
        clearSlabContext();
        return originalFetch(input, { ...init, body: JSON.stringify(guardedBody) });
      }
    }

    return originalFetch(input, init);
  };
})();
