(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const PRIMARY_ROUTES = ["dashboard", "discover", "opportunities", "tracking"];

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
        .primary-nav > a[data-ff-customer-core],
        .primary-nav > .ff-mobile-account-nav {
          visibility:visible !important;
          opacity:1 !important;
          display:grid !important;
        }
        .primary-nav > .ff-advanced-nav {
          display:none !important;
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
    account.setAttribute("aria-label", "Open account");
    account.innerHTML = '<span aria-hidden="true">●</span>Account';
    nav.appendChild(account);
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
    PRIMARY_ROUTES.forEach(route => restoreLink(nav.querySelector(`[data-route="${route}"]`)));

    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (!PRIMARY_ROUTES.includes(route) && route !== "account") {
        link.hidden = true;
        link.setAttribute("aria-hidden", "true");
        link.tabIndex = -1;
        link.removeAttribute("data-ff-customer-core");
      }
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      advanced.open = false;
      advanced.hidden = true;
      advanced.setAttribute("aria-hidden", "true");
    }

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