(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const CORE_ROUTES = [
    "dashboard",
    "market-view",
    "discover",
    "forge-heat",
    "evaluate",
    "opportunities",
    "tracking",
    "portfolio",
    "alerts",
    "beta-start"
  ];

  const routeLabel = {
    "market-view": "Market View",
    "forge-heat": "Forge Heat",
    "beta-start": "Getting Started",
    account: "Account"
  };

  function mobile() {
    return window.matchMedia?.(MOBILE_QUERY).matches === true;
  }

  function activeRoute() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function ensureStyle() {
    if (document.querySelector("#ff-mobile-navigation-stabilizer-style")) return;
    const style = document.createElement("style");
    style.id = "ff-mobile-navigation-stabilizer-style";
    style.textContent = `
      @media (max-width:760px) {
        .primary-nav > a[data-route="market-view"],
        .primary-nav > a[data-route="alerts"],
        .primary-nav > a[data-route="beta-start"],
        .primary-nav > a.ff-nav-relocated,
        .primary-nav > .ff-mobile-account-nav {
          display:grid !important;
          visibility:visible !important;
          opacity:1 !important;
        }
      }`;
    document.head.appendChild(style);
  }

  function restoreLink(link) {
    if (!link) return;
    link.hidden = false;
    link.removeAttribute("hidden");
    link.removeAttribute("aria-hidden");
    if (link.getAttribute("tabindex") === "-1") link.removeAttribute("tabindex");
    link.classList.remove("ff-nav-relocated");
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
    account.setAttribute("aria-label", "Open account and plan usage");
    account.innerHTML = '<span aria-hidden="true">●</span>Account';

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) advanced.insertAdjacentElement("beforebegin", account);
    else nav.appendChild(account);
    return account;
  }

  function syncActiveRoute(nav) {
    const current = activeRoute();
    nav.querySelectorAll("[data-route]").forEach(link => {
      if (link.getAttribute("data-route") === current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function apply() {
    if (!mobile()) return;
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    ensureStyle();
    CORE_ROUTES.forEach(route => restoreLink(nav.querySelector(`[data-route="${route}"]`)));
    const account = ensureAccountLink(nav);
    restoreLink(account);

    nav.querySelectorAll("[data-route]").forEach(link => {
      const route = link.getAttribute("data-route") || "";
      if (!CORE_ROUTES.includes(route) && route !== "account") return;
      restoreLink(link);
      if (!link.textContent.trim() && routeLabel[route]) link.textContent = routeLabel[route];
    });

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
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "tabindex", "class"] });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("resize", schedule);
  schedule();
})();
