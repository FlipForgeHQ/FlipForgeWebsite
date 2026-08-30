(() => {
  "use strict";

  const LAST_SEARCH_KEY = "flipforge.discover.lastSearch.v2";
  const RESET_LIMIT_KEY = "flipforge.discover.resetLimit.v2";
  const MAIN_SELECTOR = "#main-content";
  let pendingSearch = null;
  let queued = false;

  function onDiscover() {
    return String(window.location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0] === "discover";
  }

  function main() { return document.querySelector(MAIN_SELECTOR); }
  function form() { return main()?.querySelector?.("[data-customer-discovery-form]") || null; }

  function readForm(target) {
    if (!target) return null;
    const query = String(target.querySelector('[name="exactCardQuery"]')?.value || "").trim();
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
      return { query: String(parsed.query), targetMaxBuy: String(parsed.targetMaxBuy || ""), limit: String(parsed.limit) };
    } catch (_) { return null; }
  }

  function searchBusy() {
    const root = main();
    const primary = form()?.querySelector('button[type="submit"]');
    return Boolean(primary?.disabled || root?.querySelector?.("[data-discovery-evaluate][disabled]") || root?.querySelector?.("[data-discovery-find-exact][disabled]"));
  }

  function successfulSearchRendered() {
    const root = main();
    if (!root || root.querySelector(".staging-error")) return false;
    return Boolean(root.querySelector(".customer-discovery-results") || root.querySelector(".customer-discovery-notice"));
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

  function ensureControls() {
    if (!onDiscover()) return;
    const target = form();
    if (!target) return;
    applyResetLimit(target);
    const actions = target.querySelector(".customer-discovery-search-actions") || target;
    let refresh = actions.querySelector("[data-discovery-refresh-v2]");
    if (!refresh) {
      refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "button button-secondary";
      refresh.dataset.discoveryRefreshV2 = "";
      refresh.textContent = "Refresh results";
      refresh.addEventListener("click", refreshResults);
      actions.appendChild(refresh);
    }
    let clear = actions.querySelector("[data-discovery-clear-v2]");
    if (!clear) {
      clear = document.createElement("button");
      clear.type = "button";
      clear.className = "button button-secondary";
      clear.dataset.discoveryClearV2 = "";
      clear.textContent = "Clear / New search";
      clear.addEventListener("click", clearAndStartNew);
      actions.appendChild(clear);
    }
    const busy = searchBusy();
    refresh.disabled = busy || !lastSearch();
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

  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  queue();
})();
