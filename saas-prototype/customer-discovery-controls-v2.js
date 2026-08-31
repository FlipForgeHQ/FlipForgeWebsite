(() => {
  "use strict";

  const LAST_SEARCH_KEY = "flipforge.discover.lastSearch.v2";
  const RESET_LIMIT_KEY = "flipforge.discover.resetLimit.v2";
  const DISCOVER_PATH = "/api/v1/discover";
  const MAIN_SELECTOR = "#main-content";
  let pendingSearch = null;
  let queued = false;

  function onDiscover() {
    return String(window.location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0] === "discover";
  }

  function main() { return document.querySelector(MAIN_SELECTOR); }
  function form() { return main()?.querySelector?.("[data-customer-discovery-form]") || null; }

  function normalizedQuery(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function readForm(target) {
    if (!target) return null;
    const query = normalizedQuery(target.querySelector('[name="exactCardQuery"]')?.value || "");
    const targetMaxBuy = String(target.querySelector('[name="targetMaxBuy"]')?.value || "").trim();
    const limit = String(target.querySelector('[name="limit"]')?.value || "25");
    if (!query || !["10", "25", "50"].includes(limit)) return null;
    return { query, targetMaxBuy, limit };
  }

  function saveLastSearch(value) {
    if (!value) return;
    try { window.sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function lastSearch() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(LAST_SEARCH_KEY) || "null");
      if (!parsed || !parsed.query || !["10", "25", "50"].includes(String(parsed.limit))) return null;
      return { query: normalizedQuery(parsed.query), targetMaxBuy: String(parsed.targetMaxBuy || ""), limit: String(parsed.limit) };
    } catch (_) { return null; }
  }

  function requestPath(input) {
    try {
      const value = typeof input === "string" ? input : input?.url;
      return new URL(String(value || ""), window.location.origin).pathname;
    } catch (_) {
      return "";
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function requestJson(init) {
    if (typeof init?.body !== "string" || !init.body.trim()) return {};
    try { return JSON.parse(init.body); } catch (_) { return {}; }
  }

  function installCompletedSearchCapture() {
    if (window.__flipForgeDiscoverCompletedSearchCaptureV2) return;
    window.__flipForgeDiscoverCompletedSearchCaptureV2 = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
      const path = requestPath(input);
      const method = requestMethod(input, init);
      const body = method === "POST" && path === DISCOVER_PATH ? requestJson(init) : null;
      const response = await nativeFetch(input, init);

      if (body && response.ok) {
        const query = normalizedQuery(body.exactCardQuery);
        const limit = String(body.limit || "25");
        if (query && ["10", "25", "50"].includes(limit)) {
          const target = form();
          const targetMaxBuy = String(target?.querySelector('[name="targetMaxBuy"]')?.value || "").trim();
          saveLastSearch({ query, targetMaxBuy, limit });
          pendingSearch = null;
          queue();
        }
      }

      return response;
    };
  }

  function searchBusy() {
    const target = form();
    const primary = target?.querySelector('button[type="submit"]');
    const identify = target?.querySelector("[data-discovery-find-exact]");
    return Boolean(primary?.disabled || identify?.disabled);
  }

  function successfulSearchRendered() {
    const root = main();
    if (!root || root.querySelector(".staging-error") || root.querySelector(".customer-discovery-identity-assist")) return false;
    return Boolean(root.querySelector(".customer-discovery-results") || root.querySelector(".customer-discovery-provider") || root.querySelector(".customer-discovery-notice"));
  }

  function editingDifferentSearch(target, previous) {
    if (!target || !previous) return false;
    const input = target.querySelector('[name="exactCardQuery"]');
    const current = normalizedQuery(input?.value || "");
    return Boolean(current && current !== normalizedQuery(previous.query));
  }

  function applyResetLimit(target) {
    if (!target || target.dataset.ffDiscoverResetLimitApplied === "1") return;
    target.dataset.ffDiscoverResetLimitApplied = "1";
    let value = "";
    try {
      value = String(window.sessionStorage.getItem(RESET_LIMIT_KEY) || "");
      window.sessionStorage.removeItem(RESET_LIMIT_KEY);
    } catch (_) { return; }
    if (!["10", "25", "50"].includes(value)) return;
    const select = target.querySelector('[name="limit"]');
    if (select) select.value = value;
  }

  function refreshResults() {
    if (searchBusy()) return;
    const previous = lastSearch();
    const target = form();
    if (!previous || !target) return;
    const query = target.querySelector('[name="exactCardQuery"]');
    const maxBuy = target.querySelector('[name="targetMaxBuy"]');
    const limit = target.querySelector('[name="limit"]');
    if (query) query.value = previous.query;
    if (maxBuy) maxBuy.value = previous.targetMaxBuy;
    if (limit) limit.value = previous.limit;
    pendingSearch = { ...previous };
    target.requestSubmit?.();
  }

  function clearAndStartNew() {
    if (searchBusy()) return;
    const target = form();
    const limit = String(target?.querySelector('[name="limit"]')?.value || lastSearch()?.limit || "25");
    try {
      window.sessionStorage.removeItem(LAST_SEARCH_KEY);
      if (["10", "25", "50"].includes(limit)) window.sessionStorage.setItem(RESET_LIMIT_KEY, limit);
    } catch (_) {}
    pendingSearch = null;
    window.location.reload();
  }

  function removeResultControls(actions) {
    actions?.querySelector("[data-discovery-refresh-v2]")?.remove();
    actions?.querySelector("[data-discovery-clear-v2]")?.remove();
  }

  function ensureControls() {
    if (!onDiscover()) return;
    const target = form();
    if (!target) return;
    applyResetLimit(target);
    const actions = target.querySelector(".customer-discovery-search-actions") || target;
    const hasLiveResults = successfulSearchRendered();
    const previous = lastSearch();
    const hasNewQueryDraft = hasLiveResults && editingDifferentSearch(target, previous);

    actions.classList.toggle("ff-discover-result-actions-visible", Boolean(hasLiveResults && previous && !hasNewQueryDraft));
    actions.classList.toggle("ff-discover-new-query-draft", Boolean(hasNewQueryDraft));
    if (!hasLiveResults || !previous) {
      removeResultControls(actions);
      return;
    }
    if (hasNewQueryDraft) {
      removeResultControls(actions);
      return;
    }

    let refresh = actions.querySelector("[data-discovery-refresh-v2]");
    if (!refresh) {
      refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "button button-secondary ff-discover-result-control";
      refresh.dataset.discoveryRefreshV2 = "";
      refresh.textContent = "Refresh results";
      refresh.addEventListener("click", refreshResults);
      actions.appendChild(refresh);
    }
    let clear = actions.querySelector("[data-discovery-clear-v2]");
    if (!clear) {
      clear = document.createElement("button");
      clear.type = "button";
      clear.className = "button button-secondary ff-discover-result-control";
      clear.dataset.discoveryClearV2 = "";
      clear.textContent = "New search";
      clear.addEventListener("click", clearAndStartNew);
      actions.appendChild(clear);
    }
    const busy = searchBusy();
    refresh.disabled = busy;
    clear.disabled = busy;
  }

  function sync() {
    queued = false;
    if (!onDiscover()) return;
    if (pendingSearch && successfulSearchRendered()) {
      saveLastSearch(pendingSearch);
      pendingSearch = null;
    }
    ensureControls();
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  document.addEventListener("submit", event => {
    if (!onDiscover()) return;
    const target = event.target?.closest?.("[data-customer-discovery-form]");
    if (!target) return;
    pendingSearch = readForm(target);
    queue();
  }, true);

  document.addEventListener("input", event => {
    if (!onDiscover()) return;
    const input = event.target?.closest?.('[data-customer-discovery-form] input[name="exactCardQuery"]');
    if (!input) return;
    queue();
  }, true);

  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  installCompletedSearchCapture();
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  queue();
})();
