(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"];
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  const FULL_CUSTOMER_ROUTES = [
    "dashboard", "discover", "evaluate", "decision-intelligence", "why-this-decision", "evidence",
    "opportunities", "tracking", "portfolio", "alerts", "forge-heat", "market-view"
  ];

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

    // The drawer's Account entry shows the same initials avatar as the desktop Account control, with a visible
    // "Account" label, so the circle is never an unexplained icon.
    account = document.createElement("a");
    account.href = "#/account";
    account.dataset.route = "account";
    account.className = "ff-mobile-account-nav";
    account.setAttribute("aria-label", "Account: Plan & Usage and sign-out");
    account.innerHTML = '<span class="avatar ff-mobile-account-avatar" aria-hidden="true" data-ff-account-initials></span><span class="ff-mobile-account-copy"><strong>Account</strong><small>Plan &amp; Usage</small></span>';
    syncAccountInitials(account);
    nav.appendChild(account);
    return account;
  }

  function syncAccountInitials(account) {
    const target = account?.querySelector("[data-ff-account-initials]");
    if (!target) return;
    const source = String(document.querySelector(".profile-button .avatar")?.textContent || "").trim();
    if (source && target.textContent !== source) target.textContent = source;
  }

  // Alerts lives in the desktop/tablet top bar; on phones the top bar has no room, so the drawer carries a labelled
  // Alerts entry next to Account. It has no data-route, so route-visibility rules for the core list never hide it.
  function ensureAlertsLink(nav, account) {
    let alerts = nav.querySelector("[data-ff-mobile-alerts]");
    if (!alerts) {
      alerts = document.createElement("a");
      alerts.href = "#/alerts";
      alerts.className = "ff-mobile-account-nav ff-mobile-alerts-nav";
      alerts.setAttribute("data-ff-mobile-alerts", "");
      alerts.setAttribute("aria-label", "Alerts: review reminders for your saved cards");
      alerts.innerHTML = '<span class="ff-mobile-alerts-icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 17h10l-1.5-2V10a3.5 3.5 0 0 0-7 0v5Z"/><path d="M10 20h4"/></svg></span><span class="ff-mobile-account-copy"><strong>Alerts</strong><small>Review reminders</small></span>';
    }
    if (alerts.nextElementSibling !== account) nav.insertBefore(alerts, account);
    const current = activeRoute() === "alerts";
    if (current && alerts.getAttribute("aria-current") !== "page") alerts.setAttribute("aria-current", "page");
    if (!current && alerts.hasAttribute("aria-current")) alerts.removeAttribute("aria-current");
    return alerts;
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
    const routes = fullCustomerMode() ? FULL_CUSTOMER_ROUTES : PRIMARY_ROUTES;
    routes.forEach(route => restoreLink(nav.querySelector(`[data-route="${route}"]`)));

    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (!routes.includes(route) && route !== "account") {
        setHidden(link, true);
        if (link.getAttribute("tabindex") !== "-1") link.tabIndex = -1;
        if (link.hasAttribute("data-ff-customer-core")) link.removeAttribute("data-ff-customer-core");
      }
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      if (fullCustomerMode()) {
        setHidden(advanced, false);
      } else {
        if (advanced.open) advanced.open = false;
        setHidden(advanced, true);
      }
    }

    const account = ensureAccountLink(nav);
    restoreLink(account);
    syncAccountInitials(account);
    ensureAlertsLink(nav, account);
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
