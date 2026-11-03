(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  // One navigation manifest per surface. This script is the only owner of which customer routes appear in the
  // sidebar; other layers must not hide, unhide, clone or reorder navigation links.
  const NAV_MANIFEST = Object.freeze({
    beta: Object.freeze({
      routes: ["dashboard", "discover", "evaluate", "opportunities", "tracking", "alerts", "portfolio", "forge-heat"],
      labels: new Map([
        ["dashboard", "Home"], ["discover", "Discover"], ["evaluate", "Evaluate a Card"],
        ["opportunities", "Saved Decisions"], ["tracking", "Tracking"], ["alerts", "Alerts"],
        ["portfolio", "Portfolio"], ["forge-heat", "Forge Heat"]
      ]),
      advanced: false
    }),
    full: Object.freeze({
      routes: ["dashboard", "discover", "evaluate", "decision-intelligence", "why-this-decision", "evidence",
        "opportunities", "tracking", "portfolio", "alerts", "forge-heat", "market-view"],
      labels: new Map([
        ["dashboard", "Home"], ["discover", "Discover"], ["evaluate", "Evaluate a Card"],
        ["decision-intelligence", "Decision Intelligence"], ["why-this-decision", "Why This Decision"],
        ["evidence", "Evidence Review"], ["opportunities", "Saved Decisions"], ["tracking", "Outcome Intelligence"],
        ["portfolio", "Portfolio"], ["alerts", "Alerts"], ["forge-heat", "Forge Heat"], ["market-view", "Market View"]
      ]),
      advanced: true
    })
  });
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    discover: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
    evaluate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    opportunities: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 10 12l3 3 6-8"/><path d="M15 7h4v4"/></svg>',
    "forge-heat": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17c3-7 5-2 7-8 2 5 4 2 7-3"/><path d="M5 20h14"/></svg>',
    tracking: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M9 6V4h6v2M4 11h16"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17h10l-1.5-2V10a3.5 3.5 0 0 0-7 0v5Z"/><path d="M10 20h4"/></svg>',
    "beta-start": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
    compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
    "psa-advisor": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19V5h12v14Z"/><path d="M9 9h6M9 13h6"/></svg>',
    evidence: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-5"/></svg>',
    sell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h9"/><path d="M12 4v16"/></svg>',
    export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>'
  };

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

  // Write only when a value differs: re-setting an attribute to the same value still notifies every
  // MutationObserver watching it, and several shell scripts watch these attributes (mobile re-render loop).
  function hideElement(node) {
    if (!node) return;
    if (!node.hidden) node.hidden = true;
    if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
    if (node.tabIndex !== -1) node.tabIndex = -1;
    if (node.hasAttribute("data-ff-customer-core")) node.removeAttribute("data-ff-customer-core");
  }

  function showElement(node) {
    if (!node) return;
    if (node.hidden) node.hidden = false;
    if (node.hasAttribute("hidden")) node.removeAttribute("hidden");
    if (node.hasAttribute("aria-hidden")) node.removeAttribute("aria-hidden");
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
    if (document.title !== "FlipForge | Customer App — Card Decision Intelligence") document.title = "FlipForge | Customer App — Card Decision Intelligence";

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

  function surfaceNavigation(nav) {
    const surface = fullCustomerMode() ? "full" : "beta";
    const manifest = NAV_MANIFEST[surface];
    const visible = new Set(manifest.routes);

    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      // The mobile Account link has separate breakpoint ownership; never toggle it
      // from the route manifest on every mutation observer pass.
      if (link.classList.contains("ff-mobile-account-nav")) return;
      const route = String(link.dataset.route || "");
      if (visible.has(route)) showCoreLink(link, manifest.labels.get(route));
      else hideElement(link);
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      if (manifest.advanced) {
        showElement(advanced);
        if (advanced.hasAttribute("data-ff-customer-hide")) advanced.removeAttribute("data-ff-customer-hide");
        advanced.querySelectorAll("a[data-route]").forEach(link => {
          if (String(link.dataset.route || "") === "sell") hideElement(link);
          else showElement(link);
        });
      } else {
        if (advanced.open) advanced.open = false;
        hideElement(advanced);
      }
    }

    const current = [...nav.children]
      .filter(node => node.matches?.("a[data-route]") && visible.has(String(node.dataset.route || "")))
      .map(node => String(node.dataset.route || ""));
    // Do not detach and reinsert links on every observer pass; reorder only when the order is actually wrong.
    if (current.join("|") !== manifest.routes.join("|")) {
      const insertionPoint = advanced || nav.querySelector(".staging-only-nav") || null;
      manifest.routes.forEach(route => {
        const link = nav.querySelector(`:scope > a[data-route="${route}"]`);
        if (link) nav.insertBefore(link, insertionPoint);
      });
    }

    if (nav.dataset.ffNavSurface !== surface) nav.dataset.ffNavSurface = surface;
  }

  function consolidateAccountNavigation() {
    document.querySelector(".sidebar-footer .account-link")?.remove();
    const profile = document.querySelector(".profile-button .profile-copy");
    if (!profile) return;
    setText(profile.querySelector("strong"), "Account");
    if (!fullCustomerMode()) setText(profile.querySelector("small"), "Plan & Usage");
  }

  function installNavigationIcons() {
    document.querySelectorAll(".primary-nav [data-route]").forEach(link => {
      const route = link.getAttribute("data-route") || "";
      const icon = link.querySelector("span:first-child");
      if (!icon || !ICONS[route] || icon.dataset.ffIcon === route) return;
      icon.classList.add("ff-nav-icon");
      icon.innerHTML = ICONS[route];
      icon.dataset.ffIcon = route;
    });
  }

  function restoreInteractiveNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    nav.querySelectorAll(".ff-nav-group-label").forEach(node => node.remove());

    // Link visibility and order are owned by customer-only-shell-v1.js (route manifest). Unhiding Alerts and moving
    // Forge Heat here fought the shell's own writes on every observer pass.

    nav.querySelector('[data-route="beta-start"]')?.classList.add("ff-secondary-nav-link");
  }

  function prepareForgeHeatNavigation() {
    const nav = document.querySelector('[data-route="forge-heat"]');
    if (!nav) return;

    nav.querySelector(".forge-nav-pro")?.remove();
    let state = nav.querySelector(".forge-nav-state");
    if (!state) {
      state = document.createElement("span");
      state.className = "forge-nav-state";
      nav.appendChild(state);
    }

    setText(state, "BETA");
    nav.removeAttribute("aria-disabled");
    nav.setAttribute("aria-label", "Forge Heat beta intelligence");
    nav.setAttribute("title", "Forge Heat — beta intelligence");
  }

  // A prior build-injected mobile script used a competing four-route manifest.
  // Keep only its unique Account shortcut here; the shell owns all beta routes.
  function syncBetaMobileAccount(nav) {
    if (fullCustomerMode()) return; // /app/customer retains its separate existing mobile behavior.
    const mobile = window.matchMedia?.("(max-width: 760px)").matches === true;
    let account = nav.querySelector(":scope > a.ff-mobile-account-nav");
    if (!mobile) {
      if (account) hideElement(account);
      return;
    }
    if (!account) {
      account = document.createElement("a");
      account.href = "#/account";
      account.dataset.route = "account";
      account.className = "ff-mobile-account-nav";
      account.setAttribute("aria-label", "Open account");
      account.innerHTML = '<span aria-hidden="true">●</span>Account';
      nav.appendChild(account);
    }
    showElement(account);
    if (routeName() === "account") {
      if (account.getAttribute("aria-current") !== "page") account.setAttribute("aria-current", "page");
    } else if (account.hasAttribute("aria-current")) {
      account.removeAttribute("aria-current");
    }
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (nav) {
      surfaceNavigation(nav);
      restoreInteractiveNavigation();
      installNavigationIcons();
      prepareForgeHeatNavigation();
      syncBetaMobileAccount(nav);
    }
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
      evaluate.setAttribute("aria-label", "Discover a card");
      const wanted = '<span aria-hidden="true">＋</span> Discover a card';
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
      "Start with Discover. Confirm the exact card, choose the listing, then understand and track the decision."
    );

    const actions = heading.querySelector(".page-actions");
    if (actions) {
      setHtml(actions, '<a class="button button-primary" href="#/discover">Discover a card</a>');
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
        <div><b>1</b><span><strong>Discover</strong><small>Identify the exact card and select the listing.</small></span></div>
        <div><b>2</b><span><strong>Evaluate</strong><small>Review available evidence and risk.</small></span></div>
        <div><b>3</b><span><strong>Understand</strong><small>Read the decision and reasons behind it.</small></span></div>
        <div><b>4</b><span><strong>Track</strong><small>Return to saved decisions as evidence changes.</small></span></div>
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
    consolidateAccountNavigation();
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
    window.addEventListener("resize", schedule);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 600);
    schedule();
  }

  window.FlipForgeCustomerOnlyShell = Object.freeze({ refresh: schedule, fullCustomerMode });
  init();
})();