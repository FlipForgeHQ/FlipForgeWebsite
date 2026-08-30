(() => {
  "use strict";

  const STORAGE_KEY = "flipforge:discover:last-search:v2";
  const LIMIT_KEY = "flipforge:discover:limit:v2";
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  let observer = null;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function discoverRoute() {
    return String(window.location.hash || "")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] === "discover";
  }

  function form() {
    return document.querySelector("[data-customer-discovery-form]");
  }

  function safeLimit(value) {
    const parsed = Number.parseInt(String(value || "25"), 10);
    return [10, 25, 50].includes(parsed) ? String(parsed) : "25";
  }

  function readStoredSearch() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return null;
      const exactCardQuery = String(parsed.exactCardQuery || "").trim();
      if (!exactCardQuery || exactCardQuery.length > 500) return null;
      return {
        exactCardQuery,
        targetMaxBuy: String(parsed.targetMaxBuy || "").slice(0, 40),
        limit: safeLimit(parsed.limit)
      };
    } catch (_) {
      return null;
    }
  }

  function storeSearch(target) {
    if (!target) return;
    const exact = target.querySelector('[name="exactCardQuery"]');
    const maxBuy = target.querySelector('[name="targetMaxBuy"]');
    const limit = target.querySelector('[name="limit"]');
    const exactCardQuery = String(exact?.value || "").trim().replace(/\s+/g, " ");
    if (!exactCardQuery || exactCardQuery.length > 500) return;
    const payload = {
      exactCardQuery,
      targetMaxBuy: String(maxBuy?.value || "").trim(),
      limit: safeLimit(limit?.value)
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      sessionStorage.setItem(LIMIT_KEY, payload.limit);
    } catch (_) {}
  }

  function busy(target) {
    if (!target) return true;
    const submit = target.querySelector('button[type="submit"]');
    const resolving = target.querySelector("[data-discovery-find-exact]");
    const evaluating = document.querySelector('[data-discovery-evaluate][disabled]');
    return Boolean(submit?.disabled || resolving?.disabled || evaluating);
  }

  function restorePreservedLimit(target) {
    if (!target) return;
    const select = target.querySelector('[name="limit"]');
    if (!select) return;
    let value = "25";
    try { value = safeLimit(sessionStorage.getItem(LIMIT_KEY)); } catch (_) {}
    if ([...select.options].some(option => option.value === value)) select.value = value;
  }

  function refresh(target) {
    const saved = readStoredSearch();
    if (!target || !saved || busy(target)) return;
    const exact = target.querySelector('[name="exactCardQuery"]');
    const maxBuy = target.querySelector('[name="targetMaxBuy"]');
    const limit = target.querySelector('[name="limit"]');
    if (exact) exact.value = saved.exactCardQuery;
    if (maxBuy) maxBuy.value = saved.targetMaxBuy;
    if (limit) limit.value = saved.limit;
    target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function clearAndRestart(target) {
    if (!target || busy(target)) return;
    const limit = safeLimit(target.querySelector('[name="limit"]')?.value);
    try {
      sessionStorage.setItem(LIMIT_KEY, limit);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    window.location.reload();
  }

  function ensureControls() {
    if (!eligible() || !discoverRoute()) return;
    const target = form();
    if (!target) return;
    restorePreservedLimit(target);
    let actions = target.querySelector(".customer-discovery-search-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "customer-discovery-search-actions";
      target.append(actions);
    }

    let refreshButton = actions.querySelector("[data-discovery-refresh-v2]");
    if (!refreshButton) {
      refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.className = "button button-secondary";
      refreshButton.setAttribute("data-discovery-refresh-v2", "");
      refreshButton.textContent = "Refresh results";
      refreshButton.addEventListener("click", () => refresh(form()));
      actions.append(refreshButton);
    }

    let clearButton = actions.querySelector("[data-discovery-clear-v2]");
    if (!clearButton) {
      clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "button button-secondary";
      clearButton.setAttribute("data-discovery-clear-v2", "");
      clearButton.textContent = "Clear / New search";
      clearButton.addEventListener("click", () => clearAndRestart(form()));
      actions.append(clearButton);
    }

    const isBusy = busy(target);
    refreshButton.disabled = isBusy || !readStoredSearch();
    clearButton.disabled = isBusy;
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => queueMicrotask(ensureControls));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("submit", event => {
    if (event.target?.matches?.("[data-customer-discovery-form]")) storeSearch(event.target);
  }, true);

  window.addEventListener("hashchange", () => queueMicrotask(ensureControls));
  document.addEventListener("DOMContentLoaded", () => {
    startObserver();
    ensureControls();
  }, { once: true });
  startObserver();
  queueMicrotask(ensureControls);
})();
