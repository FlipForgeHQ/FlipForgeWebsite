(() => {
  "use strict";

  if (window.FlipForgeCustomerPortalArchitectureV1) return;
  window.FlipForgeCustomerPortalArchitectureV1 = true;

  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;

  const PRIMARY = Object.freeze([
    ["dashboard", "#/dashboard", "Home", "⌂"],
    ["discover", "#/discover", "Discover", "◇"],
    ["opportunities", "#/opportunities", "Decisions", "◆"],
    ["tracking", "#/tracking", "Monitor", "◷"],
    ["portfolio", "#/portfolio", "Portfolio", "◫"]
  ]);

  const ROUTE_PARENT = Object.freeze({
    dashboard: "dashboard",
    discover: "discover",
    evaluate: "discover",
    "forge-heat": "discover",
    "market-view": "discover",
    opportunities: "opportunities",
    "decision-intelligence": "opportunities",
    evidence: "opportunities",
    compare: "opportunities",
    "psa-advisor": "opportunities",
    sell: "opportunities",
    export: "opportunities",
    tracking: "tracking",
    alerts: "tracking",
    portfolio: "portfolio"
  });

  let queued = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeName() {
    return routeParts()[0] || "dashboard";
  }

  function safeId(value) {
    const id = String(value || "");
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id) ? id : "";
  }

  function currentRecordId() {
    const [route, id] = routeParts();
    if (!["opportunities", "evidence", "psa-advisor", "tracking", "sell", "export"].includes(route)) return "";
    return safeId(id);
  }

  function show(node) {
    if (!node) return;
    if (node.hidden) node.hidden = false;
    if (node.hasAttribute("hidden")) node.removeAttribute("hidden");
    if (node.hasAttribute("aria-hidden")) node.removeAttribute("aria-hidden");
    if (node.getAttribute("tabindex") === "-1") node.removeAttribute("tabindex");
  }

  function hide(node) {
    if (!node) return;
    if (!node.hidden) node.hidden = true;
    if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
    if (node.getAttribute("tabindex") !== "-1") node.setAttribute("tabindex", "-1");
    if (node.hasAttribute("aria-current")) node.removeAttribute("aria-current");
  }

  function setAnchorLabel(link, label) {
    const textNode = [...link.childNodes].find(node =>
      node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim()
    );
    if (textNode) {
      const lead = /^\s*/.exec(textNode.nodeValue || "")?.[0] || "";
      textNode.nodeValue = lead + label;
    } else {
      link.append(document.createTextNode(label));
    }
  }

  function ensurePrimaryLink(nav, route, href, label, icon) {
    let link = nav.querySelector(`:scope > a[data-route="${route}"]`);
    if (!link) {
      link = document.createElement("a");
      link.dataset.route = route;
      link.innerHTML = `<span aria-hidden="true">${icon}</span>${label}`;
      nav.insertBefore(link, nav.querySelector(":scope > .ff-advanced-nav") || null);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    if (link.dataset.ffPortalPrimary !== "true") link.dataset.ffPortalPrimary = "true";
    if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
    setAnchorLabel(link, label);
    show(link);
    return link;
  }

  function normalizePrimaryNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    const keep = new Set(PRIMARY.map(([route]) => route));
    for (const link of nav.querySelectorAll(":scope > a[data-route]")) {
      const route = String(link.dataset.route || "");
      if (!keep.has(route)) hide(link);
    }

    const advanced = nav.querySelector(":scope > .ff-advanced-nav");
    if (advanced) hide(advanced);

    PRIMARY.forEach(([route, href, label, icon], index) => {
      const link = ensurePrimaryLink(nav, route, href, label, icon);
      const order = String((index + 1) * 10);
      if (link.style.order !== order) link.style.order = order;
    });

    const active = ROUTE_PARENT[routeName()] || "dashboard";
    nav.querySelectorAll(":scope > a[data-ff-portal-primary]").forEach(link => {
      const current = String(link.dataset.route || "") === active;
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    nav.dataset.ffPortalArchitecture = "v1";
  }

  function contextualLinks() {
    const route = routeName();
    if (["discover", "evaluate", "forge-heat", "market-view"].includes(route)) {
      return {
        label: "Discover",
        links: [
          ["#/discover", "Scanner", "discover"],
          ["#/evaluate", "Manual Evaluate", "evaluate"],
          ["#/forge-heat", "Forge Heat", "forge-heat"],
          ["#/market-view", "Market View", "market-view"]
        ]
      };
    }
    if (["tracking", "alerts"].includes(route)) {
      return {
        label: "Monitor",
        links: [
          ["#/tracking", "Decision Monitor", "tracking"],
          ["#/alerts", "Review Alerts", "alerts"]
        ]
      };
    }
    if (route === "opportunities" && !currentRecordId()) {
      return {
        label: "Decisions",
        links: [
          ["#/opportunities", "Saved Decisions", "opportunities"],
          ["#/compare", "Compare", "compare"]
        ]
      };
    }
    return null;
  }

  function workspaceLinks(id) {
    const encoded = encodeURIComponent(id);
    return [
      [`#/opportunities/${encoded}`, "Decision", "opportunities"],
      [`#/evidence/${encoded}`, "Evidence", "evidence"],
      [`#/psa-advisor/${encoded}`, "Grade", "psa-advisor"],
      [`#/tracking/${encoded}`, "Monitor", "tracking"],
      [`#/sell/${encoded}`, "Exit", "sell"],
      [`#/export/${encoded}`, "Receipt", "export"]
    ];
  }

  function stripMarkup(label, links, workspace = false) {
    const active = routeName();
    const items = links.map(([href, text, route]) => {
      const current = route === active;
      return `<a href="${href}" data-current="${current ? "true" : "false"}">${text}</a>`;
    }).join("");
    return `
      <nav class="${workspace ? "ff-decision-workspace-nav" : "ff-portal-context-nav"}" aria-label="${workspace ? "Decision workspace" : label + " tools"}">
        <span>${workspace ? "DECISION WORKSPACE" : label.toUpperCase()}</span>
        <div>${items}</div>
      </nav>`;
  }

  function removeArchitectureBars(page) {
    page.querySelectorAll(":scope > .ff-decision-workspace-nav, :scope > .ff-portal-context-nav").forEach(node => node.remove());
  }

  function mountContextNavigation() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    const page = main.querySelector(":scope > .page") || main.firstElementChild;
    if (!page) return;

    const id = currentRecordId();
    const context = contextualLinks();
    const signature = id ? `workspace:${routeName()}:${id}` : context ? `context:${routeName()}` : "none";
    const existing = page.querySelector(":scope > .ff-decision-workspace-nav, :scope > .ff-portal-context-nav");
    if (page.dataset.ffPortalContextSignature === signature && (signature === "none" || existing)) return;

    removeArchitectureBars(page);
    page.dataset.ffPortalContextSignature = signature;
    const heading = page.querySelector(":scope > .page-heading") || page.querySelector(".page-heading");

    if (id) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = stripMarkup("Decision", workspaceLinks(id), true);
      const nav = wrapper.firstElementChild;
      if (heading?.parentElement === page) heading.insertAdjacentElement("afterend", nav);
      else page.prepend(nav);
      page.dataset.ffDecisionWorkspace = "true";
      return;
    }

    delete page.dataset.ffDecisionWorkspace;
    if (!context) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = stripMarkup(context.label, context.links, false);
    const nav = wrapper.firstElementChild;
    if (heading?.parentElement === page) heading.insertAdjacentElement("afterend", nav);
    else page.prepend(nav);
  }

  function normalizeTopbar() {
    const evaluate = document.querySelector("[data-ff-global-new-card]");
    if (evaluate) {
      if (evaluate.getAttribute("href") !== "#/discover") evaluate.setAttribute("href", "#/discover");
      if (evaluate.getAttribute("aria-label") !== "Discover or evaluate a card") evaluate.setAttribute("aria-label", "Discover or evaluate a card");
      const wanted = '<span aria-hidden="true">＋</span> New decision';
      if (evaluate.innerHTML !== wanted) evaluate.innerHTML = wanted;
    }

    const decisions = document.querySelector('.topbar-actions a[href="#/opportunities"]');
    if (decisions) {
      show(decisions);
      if (decisions.getAttribute("aria-label") !== "Open decisions") decisions.setAttribute("aria-label", "Open decisions");
      const wanted = '<span aria-hidden="true">◆</span> Decisions';
      if (decisions.innerHTML !== wanted) decisions.innerHTML = wanted;
    }
  }

  function apply() {
    normalizePrimaryNavigation();
    normalizeTopbar();
    mountContextNavigation();
    document.documentElement.dataset.ffPortalArchitecture = "v1";
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  const nav = document.querySelector(".primary-nav");
  if (nav) {
    new MutationObserver(schedule).observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "aria-current", "style"]
    });
  }

  const main = document.querySelector("#main-content");
  if (main) {
    new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  }

  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);
  window.setTimeout(schedule, 80);
  window.setTimeout(schedule, 320);
  schedule();
})();