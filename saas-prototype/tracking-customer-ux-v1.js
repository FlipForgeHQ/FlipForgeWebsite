(() => {
  "use strict";

  if (window.__ffTrackingRouteTransitionV2 === true) return;

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const STORAGE_KEY = "flipforge.trackingContext.v1";

  function plainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  function trackingIdFromHref(href) {
    const match = String(href || "").match(/^#\/tracking\/([^/?#]+)$/);
    if (!match) return "";
    try {
      const id = decodeURIComponent(match[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function remember(id) {
    try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (_) { /* session context only */ }
  }

  function dispatchCurrentRoute() {
    try {
      window.dispatchEvent(new HashChangeEvent("hashchange", {
        oldURL: window.location.href,
        newURL: window.location.href
      }));
    } catch (_) {
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  document.addEventListener("click", event => {
    if (!plainLeftClick(event)) return;
    const link = event.target.closest?.('a[href^="#/tracking/"]');
    if (!link) return;

    const id = trackingIdFromHref(link.getAttribute("href"));
    if (!id) return;

    // This listener is loaded before tracking-navigation-reload-v1.js and owns
    // exact Tracking links. Keeping the transition inside the SPA avoids the
    // overlapping hard-reload navigation that caused Tracking to disappear.
    event.preventDefault();
    event.stopImmediatePropagation();
    remember(id);

    const nextHash = `#/tracking/${encodeURIComponent(id)}`;
    const owner = window.FlipForgeCustomerRouteOwnership;
    if (owner && typeof owner.rememberExplicitIntent === "function") {
      owner.rememberExplicitIntent(nextHash);
    }

    if (window.location.hash === nextHash) {
      dispatchCurrentRoute();
      return;
    }
    window.location.hash = nextHash;
  }, true);

  window.__ffTrackingRouteTransitionV2 = true;
})();

(() => {
  "use strict";

  // Tracking presentation is owned by tracking-navigation-reload-v1.js.
  // This file now owns only the downstream Alerts and Portfolio customer polish.
  const MAIN = "#main-content";
  let queued = false;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function friendlyReviewTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(parsed);
  }

  function polishAlertItems(page) {
    page.querySelectorAll(".customer-lifecycle-alerts article").forEach(article => {
      setText(article.querySelector(".eyebrow"), "Review reminder");
      const detail = article.querySelector("p");
      if (detail) {
        const raw = String(detail.textContent || "").replace(/^Review at\s+/i, "").trim();
        const formatted = friendlyReviewTime(raw);
        if (formatted) setText(detail, `Review: ${formatted}`);
      }
      setText(article.querySelector('a[href^="#/tracking/"]'), "Open tracking");
    });
  }

  function polishAlertLimits(page) {
    const panels = [...page.querySelectorAll("section.panel")];
    const limits = panels.find(section => /Delivery boundary|Private beta reminder limits/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (!limits) return;

    setText(limits.querySelector("h2"), "Private beta reminder limits");
    setText(limits.querySelector(".panel-header p"), "Reminders currently appear inside FlipForge. Email, SMS, and push delivery are not active in private beta.");

    [...limits.querySelectorAll(".customer-management-checklist > div")].forEach(row => {
      const strong = row.querySelector("strong");
      const small = row.querySelector("small");
      const title = String(strong?.textContent || "").trim();
      if (/SQLite rule persistence|account rule persistence|your account rule persistence/i.test(title)) {
        setText(strong, "In-app reminders");
        setText(small, "Saved to your account and shown here when they are due.");
      } else if (/Email, SMS,? (?:and|&) push/i.test(title)) {
        setText(strong, "Email, SMS & push");
        setText(small, "Not available in private beta yet.");
      } else if (/Zero transaction authority|No automatic transactions/i.test(title)) {
        setText(strong, "No automatic transactions");
        setText(small, "A reminder cannot buy, sell, list, bid, or pay for anything.");
      }
    });
  }

  function polishAlerts() {
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Review reminders");
    setText(heading?.querySelector("p"), "See which saved cards need attention and open Tracking when you want to change a reminder.");

    const actions = heading?.querySelector(".page-actions");
    setText(actions?.querySelector('a[href="#/tracking"]'), "Manage reminders");

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>Reminder boundary:</strong> Alerts tell you when to revisit a saved card. They never rescore the decision or execute a transaction.";
    }

    [...page.querySelectorAll(".customer-management-metrics article")].forEach(article => {
      const label = article.querySelector("span");
      const strong = article.querySelector("strong");
      const value = String(label?.textContent || "").trim();
      if (/Enabled rules/i.test(value)) setText(label, "Active reminders");
      if (/Reviews due/i.test(value)) setText(label, "Due now");
      if (/In-app queue/i.test(value)) setText(label, "In-app reminders");
      if (/Email \/ push/i.test(value)) {
        setText(label, "Email & push");
        if (/Not connected/i.test(String(strong?.textContent || ""))) setText(strong, "Not in beta");
      }
    });

    const panels = [...page.querySelectorAll("section.panel")];
    const reminders = panels.find(section => /Review reminders|Your reminders/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (reminders) {
      setText(reminders.querySelector("h2"), "Your reminders");
      setText(reminders.querySelector(".panel-header p"), "Cards you scheduled to revisit in FlipForge.");

      const availability = reminders.querySelector(".staging-status");
      if (/IN_APP_REVIEW_ALERTS_AVAILABLE/i.test(String(availability?.textContent || ""))) {
        setText(availability, "In-app reminders available");
      }

      reminders.querySelectorAll(".staging-empty").forEach(empty => {
        const strong = empty.querySelector("strong");
        if (/No review reminder is enabled|No reminders yet/i.test(String(strong?.textContent || ""))) {
          setText(strong, "No reminders yet.");
          setText(empty.querySelector("p"), "Choose Review in Tracking, set a review date, and save. FlipForge will keep the in-app reminder with that saved card.");
          setText(empty.querySelector('a[href="#/tracking"]'), "Open tracking");
        }
      });
    }

    polishAlertItems(page);
    polishAlertLimits(page);
    page.dataset.ffAlertsCustomerUx = "v2";
  }

  function polishPortfolio() {
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Collection tracking");
    setText(heading?.querySelector("p"), "See the cards you marked as owned and the purchase cost you recorded for each one.");

    const actions = heading?.querySelector(".page-actions");
    setText(actions?.querySelector('a[href="#/tracking"]'), "Manage owned cards");

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>Portfolio boundary:</strong> Portfolio uses purchase facts you saved in Tracking. It does not estimate current market value, profit, loss, fees, taxes, or tell you when to sell.";
    }

    [...page.querySelectorAll(".customer-management-metrics article")].forEach(article => {
      const label = article.querySelector("span");
      const strong = article.querySelector("strong");
      const value = String(label?.textContent || "").trim();
      if (/Current holdings/i.test(value)) setText(label, "Owned cards");
      if (/Total cost basis/i.test(value)) setText(label, "Total purchase cost");
      if (/Current value/i.test(value)) {
        setText(label, "Market value");
        if (/Not calculated/i.test(String(strong?.textContent || ""))) setText(strong, "Not shown yet");
      }
      if (/Transactions/i.test(value)) {
        setText(label, "Buying & selling");
        if (/Disabled/i.test(String(strong?.textContent || ""))) setText(strong, "Not available");
      }
    });

    const panels = [...page.querySelectorAll("section.panel")];
    const holdings = panels.find(section => /Tenant-owned holdings|Owned cards/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (holdings) {
      setText(holdings.querySelector("h2"), "Owned cards");
      setText(holdings.querySelector(".panel-header p"), "Cards you marked as Owned in Tracking.");
      const badge = holdings.querySelector(".staging-status");
      if (badge) setText(badge, "Saved");

      [...holdings.querySelectorAll("thead th")].forEach(header => {
        const value = String(header.textContent || "").trim();
        if (/Cost basis/i.test(value)) setText(header, "Purchase cost");
        if (/Acquired/i.test(value)) setText(header, "Purchase date");
      });

      holdings.querySelectorAll("tbody tr").forEach(row => {
        const rawId = row.querySelector("td:first-child small");
        if (rawId) rawId.style.display = "none";
        setText(row.querySelector('a[href^="#/tracking/"]'), "Open tracking");
      });

      holdings.querySelectorAll(".staging-empty").forEach(empty => {
        const strong = empty.querySelector("strong");
        if (/No current holdings/i.test(String(strong?.textContent || ""))) {
          setText(strong, "No owned cards yet.");
          setText(empty.querySelector("p"), "When you mark a saved card as Owned and add its purchase details, it will appear here.");
          setText(empty.querySelector('a[href="#/tracking"]'), "Open tracking");
        }
      });
    }

    const limitation = panels.find(section => /No supported-value total or performance chart was created|Market value and performance/i.test(String(section.textContent || "")));
    if (limitation) {
      setText(limitation.querySelector("strong"), "Market value and performance are not shown yet.");
      setText(limitation.querySelector("p"), "Portfolio currently uses only the purchase facts you recorded. FlipForge will not invent a gain or loss without a governed current-value snapshot.");
    }

    page.dataset.ffPortfolioCustomerUx = "v1";
  }

  function polishCurrentRoute() {
    queued = false;
    const route = routeName();
    if (route === "alerts") polishAlerts();
    if (route === "portfolio") polishPortfolio();
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(polishCurrentRoute);
  }

  const main = document.querySelector(MAIN);
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(queue).observe(main, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  queue();
})();
