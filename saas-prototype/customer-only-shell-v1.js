(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
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

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
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

  // Navigation, top bar, banner, chip, plan card and account captions are final in each page's markup
  // (index.html for the Private Beta, customer.html for the customer app). Nothing here edits the shell.
  function apply() {
    if (!eligible()) return;
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
    if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
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