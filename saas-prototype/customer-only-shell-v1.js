(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/customer-app(?:\/|$)/i;
  const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);
  const BETA_HIDDEN_NAV_ROUTES = new Set([
    "decision-intelligence", "market-view", "forge-heat", "evaluate", "portfolio", "alerts",
    "beta-start", "compare", "psa-advisor", "evidence", "sell", "export", "staging", "staging-evaluate"
  ]);
  const FULL_CUSTOMER_ROUTES = new Set([
    "dashboard", "discover", "evaluate", "decision-intelligence", "opportunities", "tracking",
    "portfolio", "alerts", "forge-heat", "market-view"
  ]);
  const MAIN = "#main-content";
  let scheduled = false;

  function fullCustomerMode() {
    return FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function eligible() {
    const path = String(window.location.pathname || "");
    return APP_PATH.test(path) || FULL_CUSTOMER_PATH.test(path);
  }

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function routeName() {
    return routeParts()[0] || "dashboard";
  }

  function replaceTextNode(anchor, value) {
    if (!anchor) return;
    const node = [...anchor.childNodes].find(item =>
      item.nodeType === Node.TEXT_NODE && String(item.nodeValue || "").trim()
    );
    if (node) {
      const leading = /^\s*/.exec(node.nodeValue || "")?.[0] || "";
      const wanted = `${leading}${value}`;
      if (node.nodeValue !== wanted) node.nodeValue = wanted;
      return;
    }
    anchor.append(document.createTextNode(value));
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }

  function hideElement(node) {
    if (!node) return;
    if (!node.hidden) node.hidden = true;
    node.setAttribute("aria-hidden", "true");
    if (node.tabIndex !== -1) node.tabIndex = -1;
    node.removeAttribute("data-ff-customer-core");
  }

  function showElement(node) {
    if (!node) return;
    if (node.hidden) node.hidden = false;
    node.removeAttribute("hidden");
    node.removeAttribute("aria-hidden");
    if (node.getAttribute("tabindex") === "-1") node.removeAttribute("tabindex");
  }

  function showCoreLink(link, label) {
    if (!link) return;
    showElement(link);
    if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
    replaceTextNode(link, label);
  }

  function fullCustomerChrome() {
    if (!fullCustomerMode()) return;

    document.documentElement.classList.add("ff-full-customer-app");
    document.body?.classList.add("ff-full-customer-app");
    document.title = "FlipForge | Customer App — Card Decision Intelligence";

    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute(
      "content",
      "FlipForge customer app for Card Decision Intelligence: discover, evaluate, understand, save, and track sports-card decisions."
    );

    hideElement(document.querySelector(".prototype-banner"));
    setText(document.querySelector(".prototype-chip"), "CUSTOMER APP");

    const plan = document.querySelector(".sidebar-footer .plan-card");
    if (plan) {
      showElement(plan);
      setText(plan.querySelector(".eyebrow"), "Customer account");
      setText(plan.querySelector("strong"), "Plan & Usage");
      const small = plan.querySelector("small");
      if (small) setText(small, "Plan state and evaluation usage are loaded from your account.");
    }

    const accountSmall = document.querySelector(".account-link small");
    setText(accountSmall, "Account");
    const profileSmall = document.querySelector(".profile-copy small");
    setText(profileSmall, "Customer");
  }

  function markCustomerSurface() {
    if (document.body?.dataset.ffSurface !== "customer") document.body.dataset.ffSurface = "customer";
    if (fullCustomerMode()) {
      fullCustomerChrome();
      return;
    }
    const chip = document.querySelector(".prototype-chip");
    setText(chip, "PRIVATE BETA");
  }

  function fullCustomerNavigation(nav) {
    const labels = new Map([
      ["dashboard", "Home"],
      ["discover", "Discover"],
      ["evaluate", "Evaluate a Card"],
      ["decision-intelligence", "Decision Intelligence"],
      ["opportunities", "Saved Decisions"],
      ["tracking", "Outcome Intelligence"],
      ["portfolio", "Portfolio"],
      ["alerts", "Alerts"],
      ["forge-heat", "Forge Heat"],
      ["market-view", "Market View"]
    ]);

    nav.querySelectorAll("a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (FULL_CUSTOMER_ROUTES.has(route)) {
        showCoreLink(link, labels.get(route));
        return;
      }
      if (["beta-start", "staging", "staging-evaluate"].includes(route)) hideElement(link);
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      showElement(advanced);
      advanced.removeAttribute("data-ff-customer-hide");
      advanced.open = false;
      advanced.querySelectorAll("a[data-route]").forEach(showElement);
    }

    const orderedRoutes = [
      "dashboard", "discover", "evaluate", "decision-intelligence", "opportunities",
      "tracking", "portfolio", "alerts", "forge-heat", "market-view"
    ];
    const insertionPoint = advanced || nav.querySelector(".staging-only-nav") || null;
    orderedRoutes.forEach(route => {
      const link = nav.querySelector(`a[data-route="${route}"]`);
      if (link) nav.insertBefore(link, insertionPoint);
    });

    delete nav.dataset.ffBetaSimpleNavigation;
    nav.dataset.ffFullCustomerNavigation = "true";
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    if (fullCustomerMode()) {
      fullCustomerNavigation(nav);
      return;
    }

    const labels = new Map([
      ["dashboard", "Home"],
      ["discover", "Evaluate a Card"],
      ["opportunities", "Saved Decisions"],
      ["tracking", "Tracking"]
    ]);

    nav.querySelectorAll("a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (CORE_ROUTES.has(route)) {
        showCoreLink(link, labels.get(route));
        return;
      }
      if (route !== "account") hideElement(link);
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      advanced.open = false;
      hideElement(advanced);
    }

    nav.dataset.ffBetaSimpleNavigation = "true";
  }

  function simplifyTopbar() {
    const search = document.querySelector("#global-search-form");

    if (fullCustomerMode()) {
      showElement(search);

      const evaluate = document.querySelector("[data-ff-global-new-card]");
      if (evaluate) {
        showElement(evaluate);
        evaluate.setAttribute("href", "#/evaluate");
        evaluate.setAttribute("aria-label", "Evaluate a card");
        const wanted = '<span aria-hidden="true">＋</span> Evaluate a card';
        if (evaluate.innerHTML !== wanted) evaluate.innerHTML = wanted;
      }

      showElement(document.querySelector('.topbar-actions a[href="#/opportunities"]'));
      showElement(document.querySelector(".notification-button"));
      showElement(document.querySelector(".profile-button"));
      return;
    }

    if (search) hideElement(search);

    const evaluate = document.querySelector("[data-ff-global-new-card]");
    if (evaluate) {
      evaluate.hidden = false;
      evaluate.removeAttribute("hidden");
      evaluate.removeAttribute("aria-hidden");
      if (evaluate.getAttribute("tabindex") === "-1") evaluate.removeAttribute("tabindex");
      evaluate.setAttribute("href", "#/discover");
      evaluate.setAttribute("aria-label", "Evaluate a card");
      const wanted = '<span aria-hidden="true">＋</span> Evaluate a card';
      if (evaluate.innerHTML !== wanted) evaluate.innerHTML = wanted;
    }

    const saved = document.querySelector('.topbar-actions a[href="#/opportunities"]');
    hideElement(saved);

    const alerts = document.querySelector(".notification-button");
    hideElement(alerts);

    const profile = document.querySelector(".profile-button");
    if (profile) {
      profile.hidden = false;
      profile.removeAttribute("hidden");
      profile.removeAttribute("aria-hidden");
      if (profile.getAttribute("tabindex") === "-1") profile.removeAttribute("tabindex");
    }
  }

  function fullCustomerHome(main, heading) {
    setText(heading.querySelector(".eyebrow"), "CARD DECISION INTELLIGENCE™");
    setText(heading.querySelector("h1"), "What card are you considering?");
    setText(
      heading.querySelector("p"),
      "Discover the card, evaluate the evidence, understand the decision, and track what changes next."
    );

    const actions = heading.querySelector(".page-actions");
    if (actions) {
      setHtml(actions,
        '<a class="button button-primary" href="#/discover">Discover a card</a>' +
        '<a class="button button-secondary" href="#/evaluate">Evaluate a card</a>'
      );
    }

    let loop = main.querySelector("[data-ff-beta-simple-loop]");
    if (!loop) {
      loop = document.createElement("section");
      loop.className = "ff-beta-simple-loop";
      loop.dataset.ffBetaSimpleLoop = "";
      heading.insertAdjacentElement("afterend", loop);
    }

    setHtml(loop, `
      <div class="ff-beta-simple-loop-copy">
        <span>THE FLIPFORGE LOOP</span>
        <strong>From card data to a defensible decision.</strong>
      </div>
      <div class="ff-beta-simple-steps ff-full-customer-steps" aria-label="FlipForge customer workflow">
        <div><b>1</b><span><strong>Discover</strong><small>Find the exact card or listing you are considering.</small></span></div>
        <div><b>2</b><span><strong>Evaluate</strong><small>Challenge identity, evidence, economics, risk, and uncertainty.</small></span></div>
        <div><b>3</b><span><strong>Understand</strong><small>See BUY, WATCH, VERIFY, or PASS with the reasons behind it.</small></span></div>
        <div><b>4</b><span><strong>Track</strong><small>Preserve T0 and follow governed T7, T14, and T30 outcomes.</small></span></div>
      </div>
    `);

    let quick = main.querySelector("[data-ff-customer-home-actions]");
    if (!quick) {
      quick = document.createElement("section");
      quick.className = "ff-customer-home-actions";
      quick.dataset.ffCustomerHomeActions = "";
      loop.insertAdjacentElement("afterend", quick);
    }

    setHtml(quick, [
      ["Decision Intelligence", "Open the governed decision and see why it changed.", "#/decision-intelligence"],
      ["Saved Decisions", "Reopen cards you already evaluated.", "#/opportunities"],
      ["Outcome Intelligence", "Follow immutable T0 through T7, T14, and T30.", "#/tracking"],
      ["Forge Heat", "Scan the discovery layer for cards worth investigating.", "#/forge-heat"]
    ].map(([title, copy, href]) =>
      `<a class="ff-customer-home-action" href="${href}"><strong>${title}</strong><small>${copy}</small></a>`
    ).join(""));

    main.querySelector("[data-ff-customer-only-note]")?.remove();
  }

  function customerHome() {
    const main = document.querySelector(MAIN);
    const isHome = routeName() === "dashboard";
    document.documentElement.classList.toggle("ff-customer-simple-home", isHome);
    if (!main || !isHome) return;

    const heading = main.querySelector(".page-heading");
    if (!heading) return;

    if (fullCustomerMode()) {
      fullCustomerHome(main, heading);
      return;
    }

    setText(heading.querySelector(".eyebrow"), "Private beta");
    setText(heading.querySelector("h1"), "What card are you considering?");
    setText(
      heading.querySelector("p"),
      "Enter one card. FlipForge will evaluate it, explain the decision, and help you track what happens next."
    );

    const actions = heading.querySelector(".page-actions");
    if (actions) {
      setHtml(actions, '<a class="button button-primary" href="#/discover">Evaluate a card</a>');
    }

    let loop = main.querySelector("[data-ff-beta-simple-loop]");
    if (!loop) {
      loop = document.createElement("section");
      loop.className = "ff-beta-simple-loop";
      loop.dataset.ffBetaSimpleLoop = "";
      heading.insertAdjacentElement("afterend", loop);
    }

    setHtml(loop, `
      <div class="ff-beta-simple-loop-copy">
        <span>HOW THE BETA WORKS</span>
        <strong>One card. One decision. Clear reasons.</strong>
      </div>
      <div class="ff-beta-simple-steps" aria-label="FlipForge beta workflow">
        <div><b>1</b><span><strong>Evaluate</strong><small>Enter the exact card you are considering.</small></span></div>
        <div><b>2</b><span><strong>Understand</strong><small>FlipForge returns BUY, WATCH, VERIFY, or PASS and explains why.</small></span></div>
        <div><b>3</b><span><strong>Track</strong><small>Save the decision and see what changes over time.</small></span></div>
      </div>
    `);

    let quick = main.querySelector("[data-ff-customer-home-actions]");
    if (!quick) {
      quick = document.createElement("section");
      quick.className = "ff-customer-home-actions";
      quick.dataset.ffCustomerHomeActions = "";
      loop.insertAdjacentElement("afterend", quick);
    }

    setHtml(quick, [
      ["Saved Decisions", "Reopen cards you already evaluated.", "#/opportunities"],
      ["Tracking", "See what changed after the original decision.", "#/tracking"]
    ].map(([title, copy, href]) =>
      `<a class="ff-customer-home-action" href="${href}"><strong>${title}</strong><small>${copy}</small></a>`
    ).join(""));

    main.querySelector("[data-ff-customer-only-note]")?.remove();
  }

  function renameSavedDecisions() {
    if (routeName() !== "opportunities") return;
    const main = document.querySelector(MAIN);
    const parts = routeParts();
    if (!main) return;
    const heading = main.querySelector(".page-heading h1");
    if (!heading) return;
    setText(heading, parts.length > 1 ? "Saved Decision" : "Saved Decisions");
  }

  function simplifyBetaGuide() {
    if (fullCustomerMode()) return;
    const main = document.querySelector(MAIN);
    if (!main || routeName() !== "beta-start") return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector("h1"), "Private Beta Guide");
      setText(heading.querySelector("p"), "Evaluate one card, understand the decision, then track it.");
    }

    const steps = [...main.querySelectorAll(".private-beta-step")];
    const labels = [
      ["Evaluate", "Enter one exact card", "Start with the card or listing you are actually considering."],
      ["Decision", "Understand why", "Read the evidence and risk behind BUY, WATCH, VERIFY, or PASS."],
      ["Track", "Follow what changes", "Save the decision and return later to compare the outcome."]
    ];

    steps.forEach((step, index) => {
      if (index >= labels.length) {
        step.dataset.ffCustomerHide = "true";
        return;
      }
      delete step.dataset.ffCustomerHide;
      const [kicker, title, copy] = labels[index];
      const copyWrap = step.querySelector(".private-beta-step-copy");
      if (!copyWrap) return;
      const nodes = copyWrap.querySelectorAll("span,strong,small");
      setText(nodes[0], kicker);
      setText(nodes[1], title);
      setText(nodes[2], copy);
    });
  }

  function apply() {
    if (!eligible()) return;
    markCustomerSurface();
    simplifyNavigation();
    simplifyTopbar();
    customerHome();
    renameSavedDecisions();
    simplifyBetaGuide();
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
    if (!eligible()) return;
    const main = document.querySelector(MAIN);
    const nav = document.querySelector(".primary-nav");
    if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
    if (nav) new MutationObserver(schedule).observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "tabindex", "open", "data-ff-customer-core"]
    });
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 40));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("flipforge:identity-change", schedule);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 600);
    schedule();
  }

  window.FlipForgeCustomerOnlyShell = Object.freeze({ refresh: schedule, fullCustomerMode });
  init();
})();
