(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;

  function fullCustomerMode() {
    return FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function mobile() {
    return window.matchMedia?.(MOBILE_QUERY).matches === true;
  }

  function activeRoute() {
    const parts = String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
    if (parts[0] === "decision-intelligence" && parts[1] === "why") return "why-this-decision";
    return parts[0] || "dashboard";
  }

  function ensureStyle() {
    if (document.querySelector("#ff-mobile-navigation-stabilizer-style")) return;
    const style = document.createElement("style");
    style.id = "ff-mobile-navigation-stabilizer-style";
    style.textContent = `
      @media (max-width:760px) {
        .primary-nav > a[data-ff-customer-core],
        .primary-nav > .ff-mobile-account-nav {
          visibility:visible !important;
          opacity:1 !important;
          display:grid !important;
        }
        html:not(.ff-full-customer-app) .primary-nav > .ff-advanced-nav {
          display:none !important;
        }
        html.ff-full-customer-app .primary-nav > .ff-advanced-nav {
          display:block !important;
          visibility:visible !important;
          opacity:1 !important;
        }
      }`;
    document.head.appendChild(style);
  }

  // Writes only when a value actually differs: re-setting an attribute to the same value still notifies
  // MutationObservers, and this script observes these attributes, so unconditional writes looped every frame.
  function setHidden(node, hidden) {
    if (hidden) {
      if (!node.hasAttribute("hidden")) node.hidden = true;
      if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
    } else {
      if (node.hasAttribute("hidden")) node.removeAttribute("hidden");
      if (node.hasAttribute("aria-hidden")) node.removeAttribute("aria-hidden");
    }
  }

  function restoreLink(link) {
    if (!link) return;
    setHidden(link, false);
    if (link.getAttribute("tabindex") === "-1") link.removeAttribute("tabindex");
    if (link.classList.contains("ff-nav-relocated")) link.classList.remove("ff-nav-relocated");
  }

  function ensureAccountLink(nav) {
    let account = nav.querySelector('[data-route="account"]');
    if (account) {
      restoreLink(account);
      return account;
    }

    account = document.createElement("a");
    account.href = "#/account";
    account.dataset.route = "account";
    account.className = "ff-mobile-account-nav";
    account.setAttribute("aria-label", "Open account");
    account.innerHTML = '<span aria-hidden="true">●</span>Account';
    nav.appendChild(account);
    return account;
  }

  function syncActiveRoute(nav) {
    const current = activeRoute();
    nav.querySelectorAll("[data-route]").forEach(link => {
      if (link.getAttribute("data-route") === current) {
        if (link.getAttribute("aria-current") !== "page") link.setAttribute("aria-current", "page");
      } else if (link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
    });
  }

  function apply() {
    if (!mobile()) return;
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    ensureStyle();
    // Which links are visible is decided by customer-only-shell-v1.js (one route manifest per surface, all widths).
    // This layer only adds the phone Account link and keeps the active link in sync; it used to hide Alerts,
    // Portfolio, Forge Heat and Evaluate on phones from its own copy of the old four-route list, fighting the shell
    // every frame.

    const account = ensureAccountLink(nav);
    restoreLink(account);
    syncActiveRoute(nav);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "aria-hidden", "tabindex", "class", "data-ff-customer-core"]
  });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("resize", schedule);
  schedule();
})();
