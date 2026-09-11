(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);
  const BETA_HIDDEN_NAV_ROUTES = new Set([
    "decision-intelligence", "market-view", "forge-heat", "evaluate", "portfolio", "alerts",
    "beta-start", "compare", "psa-advisor", "evidence", "sell", "export", "staging", "staging-evaluate"
  ]);
  const MAIN = "#main-content";
  let scheduled = false;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
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

  function showCoreLink(link, label) {
    if (!link) return;
    if (link.hidden) link.hidden = false;
    link.removeAttribute("hidden");
    link.removeAttribute("aria-hidden");
    if (link.getAttribute("tabindex") === "-1") link.removeAttribute("tabindex");
    if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
    replaceTextNode(link, label);
  }

  function markCustomerSurface() {
    if (document.body?.dataset.ffSurface !== "customer") document.body.dataset.ffSurface = "customer";
    const chip = document.querySelector(".prototype-chip");
    setText(chip, "PRIVATE BETA");
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

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

  function customerHome() {
    const main = document.querySelector(MAIN);
    const isHome = routeName() === "dashboard";
    document.documentElement.classList.toggle("ff-customer-simple-home", isHome);
    if (!main || !isHome) return;

    const heading = main.querySelector(".page-heading");
    if (!heading) return;

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
    schedule();
  }

  window.FlipForgeCustomerOnlyShell = Object.freeze({ refresh: schedule });
  init();
})();
