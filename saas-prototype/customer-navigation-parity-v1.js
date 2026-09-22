(() => {
  "use strict";

  if (window.FlipForgeCustomerNavigationParityV1) return;
  window.FlipForgeCustomerNavigationParityV1 = true;

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;

  const ROUTES = [
    ["dashboard", "#/dashboard", "Home", "⌂"],
    ["discover", "#/discover", "Discover", "◇"],
    ["evaluate", "#/evaluate", "Evaluate a Card", "◇"],
    ["decision-intelligence", "#/decision-intelligence", "Decision Intelligence", "◆"],
    ["why-this-decision", "#/decision-intelligence/why", "Why This Decision", "?"],
    ["evidence", "#/evidence", "Evidence Review", "◎"],
    ["opportunities", "#/opportunities", "Saved Decisions", "▤"],
    ["tracking", "#/tracking", "Outcome Intelligence", "◷"],
    ["portfolio", "#/portfolio", "Portfolio", "◫"],
    ["alerts", "#/alerts", "Alerts", "!"],
    ["forge-heat", "#/forge-heat", "Forge Heat", "🔥"],
    ["market-view", "#/market-view", "Market View", "◫"]
  ];
  const ADVANCED_ROUTES = new Set(["compare", "psa-advisor", "sell", "export"]);
  const TOP_LEVEL_ROUTES = new Set(ROUTES.map(([route]) => route));
  let scheduled = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function activeNavigationRoute() {
    const [route = "dashboard", subroute = ""] = routeParts();
    if (route === "decision-intelligence" && subroute === "why") return "why-this-decision";
    return route;
  }

  function ensureWhyDecisionView() {
    if (window.FlipForgeCustomerWhyDecisionViewV1) return;
    if (document.querySelector('script[data-ff-customer-why-decision-view]')) return;
    const script = document.createElement("script");
    script.src = "customer-why-decision-view-v1.js";
    script.async = false;
    script.setAttribute("data-ff-customer-why-decision-view", "");
    document.head.appendChild(script);
  }

  function show(link) {
    if (!link) return;
    if (link.hidden) link.hidden = false;
    if (link.hasAttribute("hidden")) link.removeAttribute("hidden");
    if (link.hasAttribute("aria-hidden")) link.removeAttribute("aria-hidden");
    if (link.getAttribute("tabindex") === "-1") link.removeAttribute("tabindex");
    if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
  }

  function replaceLabel(link, label) {
    if (!link) return;
    const textNode = [...link.childNodes].find(node =>
      node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim()
    );
    if (textNode) {
      const leading = /^\s*/.exec(textNode.nodeValue || "")?.[0] || "";
      const wanted = `${leading}${label}`;
      if (textNode.nodeValue !== wanted) textNode.nodeValue = wanted;
    } else {
      link.append(document.createTextNode(label));
    }
  }

  function createLink(nav, route, href, label, icon) {
    const link = document.createElement("a");
    link.href = href;
    link.dataset.route = route;
    link.setAttribute("data-ff-customer-core", "");
    link.innerHTML = `<span aria-hidden="true">${icon}</span>${label}`;
    const advanced = nav.querySelector(":scope > .ff-advanced-nav");
    nav.insertBefore(link, advanced || null);
    return link;
  }

  function canonicalLink(nav, route, href, label, icon) {
    const all = [...nav.querySelectorAll(`a[data-route="${route}"]`)];
    let link = all.find(candidate => candidate.parentElement === nav) || all[0] || null;
    if (!link) link = createLink(nav, route, href, label, icon);
    if (link.parentElement !== nav) {
      const advanced = nav.querySelector(":scope > .ff-advanced-nav");
      nav.insertBefore(link, advanced || null);
    }
    for (const duplicate of all) {
      if (duplicate !== link) duplicate.remove();
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    if (link.dataset.route !== route) link.dataset.route = route;
    replaceLabel(link, label);
    show(link);
    return link;
  }

  function normalizeAdvanced(nav) {
    const advanced = nav.querySelector(":scope > .ff-advanced-nav");
    if (!advanced) return;
    if (advanced.hidden) advanced.hidden = false;
    if (advanced.hasAttribute("hidden")) advanced.removeAttribute("hidden");
    if (advanced.hasAttribute("aria-hidden")) advanced.removeAttribute("aria-hidden");
    advanced.style.order = "130";
    advanced.querySelectorAll("a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (TOP_LEVEL_ROUTES.has(route)) {
        link.remove();
        return;
      }
      if (!ADVANCED_ROUTES.has(route)) return;
      if (link.hidden) link.hidden = false;
      if (link.hasAttribute("hidden")) link.removeAttribute("hidden");
      if (link.hasAttribute("aria-hidden")) link.removeAttribute("aria-hidden");
      if (link.getAttribute("tabindex") === "-1") link.removeAttribute("tabindex");
    });
  }

  function syncActive(nav) {
    const active = activeNavigationRoute();
    nav.querySelectorAll("a[data-route]").forEach(link => {
      const current = String(link.dataset.route || "") === active;
      if (current && link.getAttribute("aria-current") !== "page") link.setAttribute("aria-current", "page");
      if (!current && link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
    });
  }

  function bindStableNavigation(nav) {
    if (nav.dataset.ffCustomerStableNavigation === "v1") return;
    nav.dataset.ffCustomerStableNavigation = "v1";
    nav.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href^="#/"]') : null;
      if (!target || !nav.contains(target) || target.hasAttribute("download") || target.getAttribute("target")) return;
      const href = String(target.getAttribute("href") || "");
      if (!/^#\/[A-Za-z0-9._~!$&'()*+,;=:@%?\/-]+$/.test(href)) return;
      event.preventDefault();
      if (window.location.hash !== href) window.location.hash = href;
      else schedule();
    }, true);
  }

  function apply() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    ROUTES.forEach(([route, href, label, icon], index) => {
      const link = canonicalLink(nav, route, href, label, icon);
      const order = String((index + 1) * 10);
      if (link.style.order !== order) link.style.order = order;
    });
    normalizeAdvanced(nav);
    syncActive(nav);
    bindStableNavigation(nav);
    if (nav.dataset.ffCustomerNavigationParity !== "v1") nav.dataset.ffCustomerNavigationParity = "v1";
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function init() {
    ensureWhyDecisionView();
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;
    bindStableNavigation(nav);
    new MutationObserver(schedule).observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "tabindex", "data-ff-customer-core"]
    });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("resize", schedule);
    // Navigation is canonical at source and then maintained by its observer.
    // Avoid delayed passes that can visibly shift labels/order after route paint.
    schedule();
  }

  init();
})();
