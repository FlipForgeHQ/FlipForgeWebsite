(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);
  const CUSTOMER_TOOL_ROUTES = new Set([
    "market-view", "forge-heat", "portfolio", "alerts",
    "decision-intelligence", "compare", "psa-advisor", "evidence", "sell", "export"
  ]);
  const INTERNAL_NAV_ROUTES = new Set(["evaluate", "staging", "staging-evaluate"]);
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
    const node = [...anchor.childNodes].find(item => item.nodeType === Node.TEXT_NODE && String(item.nodeValue || "").trim());
    if (node) {
      const leading = /^\s*/.exec(node.nodeValue || "")?.[0] || "";
      if (String(node.nodeValue || "").trim() !== value) node.nodeValue = `${leading}${value}`;
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

  function markCustomerSurface() {
    if (document.body?.dataset.ffSurface !== "customer") document.body.dataset.ffSurface = "customer";
    const chip = document.querySelector(".prototype-chip");
    setText(chip, "CUSTOMER BETA");
  }

  function ensurePublicDecisionIntelligenceLink(advanced) {
    if (!advanced) return;
    const links = advanced.querySelector(".ff-advanced-nav-links");
    const privateLink = advanced.querySelector('a[data-route="decision-intelligence"]');
    if (!links || !privateLink) return;

    replaceTextNode(privateLink, "Saved Intelligence");

    let publicLink = links.querySelector("[data-ff-public-decision-intelligence]");
    if (!publicLink) {
      publicLink = document.createElement("a");
      publicLink.href = "/decision-intelligence.html";
      publicLink.dataset.ffPublicDecisionIntelligence = "";
      publicLink.className = "ff-public-decision-intelligence";
      publicLink.setAttribute("aria-label", "Open the public Decision Intelligence exhibit");
      publicLink.innerHTML = '<span aria-hidden="true">✦</span>Decision Intelligence';
      privateLink.insertAdjacentElement("beforebegin", publicLink);
    }
    publicLink.hidden = false;
    publicLink.removeAttribute("hidden");
    publicLink.removeAttribute("aria-hidden");
    if (publicLink.tabIndex === -1) publicLink.removeAttribute("tabindex");
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;

    const labels = new Map([
      ["dashboard", "Home"],
      ["discover", "Evaluate"],
      ["opportunities", "Saved Decisions"],
      ["tracking", "Tracking"]
    ]);

    nav.querySelectorAll("a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      if (CORE_ROUTES.has(route)) {
        if (link.hidden) link.hidden = false;
        link.removeAttribute("hidden");
        if (link.getAttribute("aria-hidden") === "true") link.removeAttribute("aria-hidden");
        if (link.tabIndex === -1) link.removeAttribute("tabindex");
        if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
        replaceTextNode(link, labels.get(route));
      } else if (INTERNAL_NAV_ROUTES.has(route)) {
        if (!link.hidden) link.hidden = true;
        if (link.getAttribute("aria-hidden") !== "true") link.setAttribute("aria-hidden", "true");
        if (link.tabIndex !== -1) link.tabIndex = -1;
        link.removeAttribute("data-ff-customer-core");
      } else if (CUSTOMER_TOOL_ROUTES.has(route) && link.closest(".ff-advanced-nav")) {
        if (link.hidden) link.hidden = false;
        link.removeAttribute("hidden");
        link.removeAttribute("aria-hidden");
        if (link.tabIndex === -1) link.removeAttribute("tabindex");
        link.removeAttribute("data-ff-customer-core");
      }
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced) {
      advanced.hidden = false;
      advanced.removeAttribute("hidden");
      advanced.removeAttribute("aria-hidden");
      const summary = advanced.querySelector("summary");
      replaceTextNode(summary, "More tools");
      advanced.querySelectorAll("a[data-ff-support-route]").forEach(link => {
        link.hidden = false;
        link.removeAttribute("hidden");
        link.removeAttribute("aria-hidden");
        if (link.tabIndex === -1) link.removeAttribute("tabindex");
      });
      ensurePublicDecisionIntelligenceLink(advanced);
      if (CUSTOMER_TOOL_ROUTES.has(routeName())) advanced.open = true;
    }
  }

  function simplifyTopbar() {
    const evaluate = document.querySelector("[data-ff-global-new-card]");
    if (evaluate) {
      if (evaluate.getAttribute("href") !== "#/discover") evaluate.setAttribute("href", "#/discover");
      if (evaluate.getAttribute("aria-label") !== "Evaluate a card") evaluate.setAttribute("aria-label", "Evaluate a card");
      const wanted = '<span aria-hidden="true">＋</span> Evaluate a card';
      if (evaluate.innerHTML !== wanted) evaluate.innerHTML = wanted;
    }

    const saved = document.querySelector('.topbar-actions a[href="#/opportunities"]');
    if (saved) {
      if (saved.getAttribute("aria-label") !== "Open saved decisions") saved.setAttribute("aria-label", "Open saved decisions");
      const wanted = '<span aria-hidden="true">◷</span> Saved Decisions';
      if (saved.innerHTML !== wanted) saved.innerHTML = wanted;
    }

    const search = document.querySelector("#global-search");
    if (search && search.getAttribute("placeholder") !== "Search cards or saved decisions…") {
      search.setAttribute("placeholder", "Search cards or saved decisions…");
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
    setText(heading.querySelector("h1"), "Before you buy, know why.");
    setText(heading.querySelector("p"), "Evaluate an exact card, understand the decision, and track what happens next.");

    const actions = heading.querySelector(".page-actions");
    if (actions) {
      const wanted = '<a class="button button-primary" href="#/discover">Evaluate a card</a>';
      setHtml(actions, wanted);
    }

    let quick = main.querySelector("[data-ff-customer-home-actions]");
    if (!quick) {
      quick = document.createElement("section");
      quick.className = "ff-customer-home-actions";
      quick.dataset.ffCustomerHomeActions = "";
      heading.insertAdjacentElement("afterend", quick);
    }

    const wanted = [
      ["01", "Evaluate a card", "Enter the exact card or listing and let FlipForge guide you to a decision.", "#/discover"],
      ["02", "Review saved decisions", "Return to cards you already evaluated and see what the evidence supports.", "#/opportunities"],
      ["03", "Check tracking", "Follow saved cards and see what changed after the original decision.", "#/tracking"]
    ].map(([step, title, copy, href]) => `<a class="ff-customer-home-action" href="${href}"><span>${step}</span><strong>${title}</strong><small>${copy}</small></a>`).join("");
    setHtml(quick, wanted);

    let note = main.querySelector("[data-ff-customer-only-note]");
    if (!note) {
      note = document.createElement("div");
      note.className = "ff-customer-only-note";
      note.dataset.ffCustomerOnlyNote = "";
      note.innerHTML = '<strong>Customer interface:</strong> FlipForge keeps internal operator controls, diagnostics, provider administration, cohort tools, and audit operations out of this workspace.';
      quick.insertAdjacentElement("afterend", note);
    }
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

  function simplifyWorkflowStrip() {
    const strip = document.querySelector(`${MAIN} [data-ff-workflow-strip]`);
    if (!strip) return;
    const labels = ["Find card", "Evaluate", "Understand", "Track"];
    strip.querySelectorAll(".ff-workflow-step").forEach((step, index) => {
      const text = step.querySelector("span:last-child");
      if (labels[index]) setText(text, labels[index]);
    });
  }

  function simplifyBetaGuide() {
    const main = document.querySelector(MAIN);
    if (!main || routeName() !== "beta-start") return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector("h1"), "Private Beta Guide");
      setText(heading.querySelector("p"), "One card. One decision. One tracking loop. Tell us where the experience is unclear.");
    }

    const steps = [...main.querySelectorAll(".private-beta-step")];
    const labels = [
      ["Evaluate", "Find one exact card", "Start with the card or listing you are actually considering."],
      ["Decision", "Get the FlipForge decision", "Let the decision system return BUY, WATCH, VERIFY, or PASS."],
      ["Why", "Understand the two strongest reasons", "Read the evidence and risk that most directly support the result."],
      ["Track", "Save it and follow what happens", "Keep the decision so you can review the outcome later."]
    ];

    steps.forEach((step, index) => {
      if (index >= labels.length) {
        if (step.dataset.ffCustomerHide !== "true") step.dataset.ffCustomerHide = "true";
        return;
      }
      if (step.dataset.ffCustomerHide) delete step.dataset.ffCustomerHide;
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
    simplifyWorkflowStrip();
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
    if (nav) new MutationObserver(schedule).observe(nav, { childList: true, subtree: true });
    window.addEventListener("hashchange", () => window.setTimeout(schedule, 40));
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("flipforge:identity-change", schedule);
    schedule();
  }

  window.FlipForgeCustomerOnlyShell = Object.freeze({ refresh: schedule });
  init();
})();
