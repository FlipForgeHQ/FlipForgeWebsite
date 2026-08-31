(() => {
  "use strict";

  const STORAGE_KEY = "flipforge.trackingContext.v1";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAIN = "#main-content";
  let queued = false;
  let repairing = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
  }

  function detailId() {
    const [route, id = ""] = routeParts();
    if (!["opportunities", "evidence", "tracking"].includes(route)) return "";
    return SAFE_ID.test(id) ? id : "";
  }

  function remember(id) {
    if (!SAFE_ID.test(String(id || ""))) return;
    try { window.sessionStorage.setItem(STORAGE_KEY, String(id)); } catch (_) { /* session preference only */ }
  }

  function remembered() {
    try {
      const value = String(window.sessionStorage.getItem(STORAGE_KEY) || "");
      return SAFE_ID.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  function idFromHref(href, route) {
    const match = String(href || "").match(new RegExp(`#/${route}/([^/?#]+)`));
    if (!match) return "";
    try {
      const value = decodeURIComponent(match[1]);
      return SAFE_ID.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  function keepTrackingNavInContext() {
    const [route] = routeParts();
    const nav = document.querySelector('.primary-nav [data-route="tracking"]');
    if (!nav) return;
    const id = detailId();
    if ((route === "opportunities" || route === "evidence") && id) {
      nav.setAttribute("href", `#/tracking/${encodeURIComponent(id)}`);
      nav.dataset.ffTrackingContext = id;
      remember(id);
      return;
    }
    if (route !== "tracking") {
      nav.setAttribute("href", "#/tracking");
      delete nav.dataset.ffTrackingContext;
    }
  }

  function restoreGenericTrackingRoute() {
    const [route, id = ""] = routeParts();
    if (route !== "tracking" || id) return false;
    const pending = remembered();
    if (!pending) return false;
    window.location.hash = `#/tracking/${encodeURIComponent(pending)}`;
    return true;
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function relabelSelect(select, labels) {
    if (!select) return;
    [...select.options].forEach(option => {
      const raw = String(option.value || option.textContent || "").trim().toUpperCase();
      if (!labels[raw]) return;
      option.value = raw;
      option.textContent = labels[raw];
    });
  }

  function polishTracking(main) {
    const page = main?.querySelector(".customer-lifecycle-page");
    if (!page || page.dataset.ffTrackingContextPolish === "v1") return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Decision follow-up");
    setText(heading?.querySelector("p"), "Set a review date, update ownership, or record what happened next for this saved decision.");

    const metrics = [...page.querySelectorAll(".customer-management-metrics article")];
    for (const article of metrics) {
      const label = article.querySelector("span");
      if (String(label?.textContent || "").trim() === "Selected version") setText(label, "Updates saved");
    }

    const cardPanel = [...page.querySelectorAll("section.panel")].find(section => section.querySelector("[data-lifecycle-form]"));
    if (cardPanel) {
      setText(cardPanel.querySelector(".panel-header p"), "Update how you're following this card. Changes are saved to your account.");
      const button = cardPanel.querySelector('[data-lifecycle-form] button[type="submit"]');
      if (button && !/Saving/i.test(button.textContent || "")) setText(button, "Save tracking");
      setText(cardPanel.querySelector(".customer-lifecycle-submit small"), "Owned cards need purchase details. Sold cards also need sale details. Reminders need a review time.");

      relabelSelect(cardPanel.querySelector('select[name="trackingStatus"]'), {
        WATCHING: "Watching",
        REVIEW: "Review",
        OWNED: "Owned",
        SOLD: "Sold",
        PASSED: "Passed",
        ARCHIVED: "Archived"
      });
      relabelSelect(cardPanel.querySelector('select[name="outcomeStatus"]'), {
        NONE: "No outcome yet",
        ACQUIRED: "Acquired",
        SOLD: "Sold",
        PASSED: "Passed"
      });

      cardPanel.querySelectorAll(".customer-lifecycle-fields label > span").forEach(label => {
        const value = String(label.textContent || "").trim();
        const replacements = {
          "Tracking status": "Status",
          "Acquisition cost": "Purchase cost",
          "Acquired date": "Purchase date",
          "Disposition proceeds": "Sale proceeds",
          "Disposition date": "Sale date"
        };
        if (replacements[value]) label.textContent = replacements[value];
      });
    }

    const history = [...page.querySelectorAll("section.panel")].find(section => /Lifecycle history/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (history) {
      setText(history.querySelector("h2"), "Tracking history");
      setText(history.querySelector(".panel-header p"), "A record of changes to this card, newest first.");
    }

    page.dataset.ffTrackingContextPolish = "v1";
  }

  function verifyExactTracking(main) {
    const [route, expected = ""] = routeParts();
    if (route !== "tracking" || !SAFE_ID.test(expected) || !main) return;
    remember(expected);

    const page = main.querySelector(".customer-lifecycle-page");
    if (!page) return;
    const cardLink = page.querySelector('.page-actions a[href^="#/opportunities/"]');
    const actual = idFromHref(cardLink?.getAttribute("href"), "opportunities");
    if (!actual || actual === expected || repairing) return;

    const adapter = window.FlipForgeCustomerLifecycle;
    if (!adapter || typeof adapter.render !== "function" || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return;
    repairing = true;
    main.innerHTML = "";
    adapter.render(main, "tracking", expected);
    window.setTimeout(() => { repairing = false; queue(); }, 250);
  }

  function renderExactTracking(id) {
    if (!SAFE_ID.test(String(id || ""))) return false;
    const main = document.querySelector(MAIN);
    const adapter = window.FlipForgeCustomerLifecycle;
    if (!main || !adapter || typeof adapter.render !== "function" || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
    main.innerHTML = "";
    adapter.render(main, "tracking", id);
    return true;
  }

  function sync() {
    queued = false;
    keepTrackingNavInContext();
    if (restoreGenericTrackingRoute()) return;
    const main = document.querySelector(MAIN);
    verifyExactTracking(main);
    // Tracking context owns exact-record routing only. Customer-facing Tracking
    // presentation is owned by tracking-navigation-reload-v1.js so a lifecycle
    // re-render cannot be overwritten by this older polish layer.
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(sync);
  }

  document.addEventListener("click", event => {
    const evidenceContinue = event.target.closest?.("[data-ff-evidence-understood]");
    if (evidenceContinue) {
      const hrefId = idFromHref(evidenceContinue.getAttribute("href"), "tracking");
      const currentId = detailId();
      const id = hrefId || currentId;
      if (!id) return;
      remember(id);

      // Preserve native browser behavior for modified clicks/new tabs. Own the
      // ordinary left-click so another in-page handler cannot swallow the
      // Evidence -> Tracking transition.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const nextHash = `#/tracking/${encodeURIComponent(id)}`;
      if (window.location.hash === nextHash) {
        renderExactTracking(id);
        return;
      }
      window.location.hash = nextHash;
      return;
    }

    const trackingNav = event.target.closest?.('.primary-nav [data-route="tracking"]');
    if (trackingNav) {
      const id = detailId();
      const [route] = routeParts();
      if ((route === "opportunities" || route === "evidence") && id) {
        trackingNav.setAttribute("href", `#/tracking/${encodeURIComponent(id)}`);
        remember(id);
      }
    }
  }, true);

  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  if (document.body) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();
})();

(() => {
  "use strict";

  if (window.__ffSavedDecisionRouteOwnershipGuardV1 === true) return;

  const MAIN = "#main-content";
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const STORAGE_KEY = "flipforge.trackingContext.v1";
  let repairTimer = 0;
  let repairing = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
  }

  function isPlainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  function trackingIdFromHref(href) {
    const match = String(href || "").match(/#\/tracking\/([^/?#]+)/);
    if (!match) return "";
    try {
      const id = decodeURIComponent(match[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function remember(id) {
    if (!SAFE_ID.test(String(id || ""))) return;
    try { window.sessionStorage.setItem(STORAGE_KEY, String(id)); } catch (_) { /* session context only */ }
  }

  function finishRepair() {
    window.setTimeout(() => {
      repairing = false;
      scheduleRepair();
    }, 150);
  }

  function mountTracking(main, id) {
    const adapter = window.FlipForgeCustomerLifecycle;
    if (!main || !SAFE_ID.test(id) || !adapter || typeof adapter.render !== "function" || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
    repairing = true;
    main.innerHTML = "";
    adapter.render(main, "tracking", id);
    finishRepair();
    return true;
  }

  function mountOpportunity(main, id) {
    const adapter = window.FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities;
    if (!main || !SAFE_ID.test(id) || !adapter || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
    const renderer = typeof adapter.renderCustomer === "function" ? adapter.renderCustomer : adapter.render;
    if (typeof renderer !== "function") return false;
    repairing = true;
    main.innerHTML = "";
    renderer.call(adapter, main, id);
    finishRepair();
    return true;
  }

  function mountExport(main, id) {
    const adapter = window.FlipForgeCustomerExport;
    if (!main || !SAFE_ID.test(id) || !adapter || typeof adapter.render !== "function" || typeof adapter.isEligible !== "function" || !adapter.isEligible()) return false;
    repairing = true;
    main.innerHTML = "";
    adapter.render(main, id);
    finishRepair();
    return true;
  }

  function repairRouteOwnership() {
    repairTimer = 0;
    if (repairing) return;
    const main = document.querySelector(MAIN);
    if (!main) return;

    const [route, id = ""] = routeParts();
    if (route === "tracking" && SAFE_ID.test(id)) {
      remember(id);
      if (!main.querySelector(".customer-lifecycle-page")) mountTracking(main, id);
      return;
    }

    // A completed Tracking request must never repaint a different saved-decision
    // route after the customer has already navigated away.
    if (main.querySelector(".customer-lifecycle-page")) {
      if (route === "opportunities" && SAFE_ID.test(id)) {
        mountOpportunity(main, id);
        return;
      }
      if (route === "export" && SAFE_ID.test(id)) {
        mountExport(main, id);
      }
    }
  }

  function scheduleRepair() {
    if (repairTimer) window.clearTimeout(repairTimer);
    repairTimer = window.setTimeout(repairRouteOwnership, 40);
  }

  document.addEventListener("click", event => {
    const link = event.target.closest?.('a[href^="#/tracking/"]');
    if (!link || !isPlainLeftClick(event)) return;

    const id = trackingIdFromHref(link.getAttribute("href"));
    if (!id) return;
    const [route] = routeParts();
    if (!["opportunities", "evidence", "export", "portfolio", "alerts"].includes(route)) return;

    remember(id);
    event.preventDefault();
    event.stopImmediatePropagation();
    const nextHash = `#/tracking/${encodeURIComponent(id)}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    window.setTimeout(() => {
      if (window.location.hash === nextHash) {
        const main = document.querySelector(MAIN);
        if (main && !main.querySelector(".customer-lifecycle-page")) mountTracking(main, id);
      }
    }, 0);
  }, true);

  const main = document.querySelector(MAIN);
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRepair).observe(main, { childList: true, subtree: false });
  }
  window.addEventListener("hashchange", scheduleRepair);
  window.addEventListener("pageshow", scheduleRepair);
  window.addEventListener("load", scheduleRepair);
  scheduleRepair();

  window.__ffSavedDecisionRouteOwnershipGuardV1 = true;
})();