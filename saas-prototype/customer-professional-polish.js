(() => {
  "use strict";

  const FORGE_HEAT_ROUTE = "forge-heat";
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

  const COPY_REPLACEMENTS = [
    ["PRIVATE BETA INTELLIGENCE", "PRIVATE BETA"],
    ["BETA INTELLIGENCE", "PRIVATE BETA"],
    ["BETA PREVIEW", "PRIVATE BETA"],
    ["Authenticated tenant-scoped intelligence · Saved decisions · No transaction authority", "Card intelligence workspace · Evaluation only"],
    ["Controlled customer intelligence preview · No transaction authority", "Card intelligence preview · Evaluation only"],
    ["Controlled customer intelligence · No transaction authority", "Card intelligence workspace · Evaluation only"],
    ["Tenant access", "Private beta"],
    ["Plan state and evaluation usage are server-owned. Paid access is not active during private beta.", "Usage updates automatically. Paid access is not active during private beta."],
    ["Plan state, usage, and checkout availability are server-owned.", "Plan, usage, and checkout availability update automatically."],
    ["Plan state and usage are server-owned. Paid checkout is deferred until Core Platform Beta Complete.", "Plan and usage update automatically. Paid access is not active during private beta."],
    ["Plan state and usage are server-owned.", "Plan and usage update automatically."],
    ["Subscription and usage data stays server-owned.", "Subscription and usage update automatically."],
    ["Access and usage stay server-owned.", "Access and usage update automatically."],
    ["Review server-owned access, evaluation usage, and the planned commercial tiers for this tenant.", "Review your access, evaluation usage, and available plan details."],
    ["Server-owned", "Verified"],
    ["server-owned", "verified"],
    ["tenant-scoped", "account-specific"],
    ["Tenant-owned", "Saved"],
    ["tenant-owned", "saved"],
    ["browser-side", "local"],
    ["browser-invented", "placeholder"],
    ["authority contract", "service validation"],
    ["Planned launch plan", "Plan"],
    ["Planned commercial plans", "Plans"],
    ["These tiers remain informational during the core-platform completion sprint.", "Plan details are informational during private beta."],
    ["Billing deferred", "Not active"],
    ["Checkout deferred until Beta Complete", "Checkout unavailable in private beta"],
    ["Deferred by core-platform launch gate", "Not available in private beta"],
    ["Production payment controls are intentionally absent.", "Payments are not available in private beta."],
    ["Billing launch resumes only after the core customer product reaches Beta Complete.", "Paid access will open only after launch review is complete."],
    ["This production account screen is read-only.", "Account information is view-only during private beta."],
    ["No sample subscription or browser-invented allowance was shown.", "No placeholder subscription or allowance is shown."],
    ["Interactive prototype history for the selected opportunity.", "Recent ask and supported-value history for the selected opportunity."],
    ["Prototype customer activity, not live telemetry.", "Recent intelligence activity."],
    ["Prototype list of saved Smart Opportunity output.", "Saved decisions ranked with supporting evidence."],
    ["Prototype saved record", "Saved evaluation"],
    ["Plain-language explanation of saved authority output.", "Why this decision was reached."],
    ["Existing recommendations ranked with saved evidence context.", "Your highest-priority opportunities, ranked with supporting evidence."],
    ["Saved opportunity authority", "Card intelligence"],
    ["Tenant-owned saved intelligence", "Saved intelligence"],
    ["Forge Heat V1", "Forge Heat"]
  ];

  function routeName() {
    return String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }

  function addBrandTagline() {
    const copy = document.querySelector(".brand-copy");
    if (!copy || copy.querySelector(".brand-tagline")) return;
    const tagline = document.createElement("span");
    tagline.className = "brand-tagline";
    tagline.textContent = "Before you buy. Know Why.";
    copy.appendChild(tagline);
  }

  function consolidateAccountNavigation() {
    document.querySelector(".sidebar-footer .account-link")?.remove();
    const profile = document.querySelector(".profile-button .profile-copy");
    if (!profile) return;
    setText(profile.querySelector("strong"), "Account");
    setText(profile.querySelector("small"), "Plan & Usage");
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

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;
    nav.querySelectorAll(".ff-nav-group-label").forEach(node => node.remove());
    const alerts = nav.querySelector('[data-route="alerts"]');
    if (alerts && !alerts.hidden) alerts.hidden = true;
    const heat = nav.querySelector('[data-route="forge-heat"]');
    const opportunities = nav.querySelector('[data-route="opportunities"]');
    if (heat && opportunities && heat.previousElementSibling !== opportunities) opportunities.insertAdjacentElement("afterend", heat);
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
    setText(state, "DEV");
    nav.removeAttribute("aria-disabled");
    if (nav.getAttribute("aria-label") !== "Forge Heat, in development") nav.setAttribute("aria-label", "Forge Heat, in development");
    if (nav.getAttribute("title") !== "Forge Heat — in development") nav.setAttribute("title", "Forge Heat — in development");
  }

  function customerCopy(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script, style")) continue;
      const original = node.nodeValue || "";
      let value = original;
      for (const [from, to] of COPY_REPLACEMENTS) value = value.replaceAll(from, to);
      if (value !== original) node.nodeValue = value;
    }
  }

  function polishTrademark(root = document) {
    root.querySelectorAll("h1, h2, h3").forEach(node => {
      if (node.querySelector(".ff-trademark") || !(node.textContent || "").includes("Forge Heat™")) return;
      node.innerHTML = node.innerHTML.replace(/Forge Heat™/g, 'Forge Heat<sup class="ff-trademark">™</sup>');
    });
  }

  function polishBoundaryNotes(root = document) {
    root.querySelectorAll(".boundary-note").forEach(note => {
      if (!/Smart Opportunity remains the sole BUY\/WATCH\/VERIFY\/PASS authority/i.test(note.textContent || "")) return;
      setHtml(note, "<strong>Decision framework:</strong> Smart Opportunity provides BUY/WATCH/VERIFY/PASS recommendations. PSA Advisor provides grading guidance. Review price, liquidity, risk, seller quality, shipping, taxes, and grading before acting.");
    });
  }

  function polishDashboard() {
    if (routeName() !== "dashboard") return;
    const main = document.querySelector("#main-content");
    if (!main) return;
    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Card intelligence");
      setText(heading.querySelector("h1"), "Decision Dashboard");
      setText(heading.querySelector("p"), "See what deserves attention, why it qualifies, and what needs review before you act.");
      setHtml(heading.querySelector(".page-actions"), '<a class="button button-secondary" href="#/evaluate">Evaluate a card</a><a class="button button-primary" href="#/discover">Discover a card</a>');
    }

    main.querySelectorAll(".panel").forEach(panel => {
      const titleNode = panel.querySelector(".panel-header h2");
      const title = titleNode?.textContent?.trim();
      const description = panel.querySelector(".panel-header p");
      if (title === "Ask vs supported value") setText(description, "Recent price context for the selected opportunity.");
      if (title === "Top opportunities") setText(description, "Highest-priority saved opportunities with evidence context.");
      if (title === "Evidence readiness") setText(description, "How complete and current the supporting evidence is.");
      if (title === "Decision factors") setText(titleNode, "Decision signals");
      if (title === "Recent activity") setText(titleNode, "Recent intelligence");
    });

    const firstStack = main.querySelector(".dashboard-grid .stack:first-child");
    if (firstStack) {
      const top = [...firstStack.querySelectorAll(":scope > .panel")].find(panel => panel.querySelector(".panel-header h2")?.textContent?.trim() === "Top opportunities");
      if (top && firstStack.firstElementChild !== top) firstStack.prepend(top);
    }
  }

  function improveEmptyStates(root = document) {
    const ctas = {
      opportunities: ["Discover a card", "#/discover"],
      tracking: ["Discover a card to track", "#/discover"],
      evidence: ["Evaluate a card", "#/evaluate"],
      portfolio: ["Discover a card", "#/discover"],
      alerts: ["Review tracking", "#/tracking"]
    };
    const route = routeName();
    root.querySelectorAll(".staging-empty, .consumer-state-empty, .forge-heat-empty").forEach(state => {
      if (/No qualifying opportunities yet/i.test(state.textContent || "")) setText(state.querySelector("strong"), "No opportunities meet the evidence threshold yet.");
      if (state.querySelector("a, button") || !ctas[route]) return;
      const [label, href] = ctas[route];
      const link = document.createElement("a");
      link.className = "button button-secondary ff-empty-cta";
      link.href = href;
      link.textContent = label;
      state.appendChild(link);
    });
  }

  function forgeHeatDevelopmentView() {
    return `<div class="forge-heat-shell forge-heat-development">
      <header class="forge-heat-hero">
        <div><div class="forge-heat-title-row"><span class="eyebrow">In development</span></div><h1>Forge Heat<sup class="ff-trademark">™</sup></h1><p class="forge-heat-lead">Opportunity-ranking intelligence is being built and validated for a future release.</p></div>
        <div class="forge-heat-boundary"><strong>Current status</strong><span>Not available in private beta</span><small>No upgrade or payment required</small></div>
      </header>
      <section class="forge-heat-lock"><span class="forge-heat-lock-mark" aria-hidden="true">FH</span><div><span class="eyebrow">Roadmap feature</span><h2>Forge Heat is not available yet.</h2><p>FlipForge is validating the evidence, ranking, and history requirements before opening this feature.</p><p>When it is ready, Forge Heat will prioritize opportunities without changing the underlying Smart Opportunity recommendation.</p><a class="button button-primary" href="#/discover">Return to Discover</a></div></section>
    </div>`;
  }

  function enforceForgeHeatDevelopment() {
    if (routeName() !== FORGE_HEAT_ROUTE) return;
    const main = document.querySelector("#main-content");
    if (!main || main.querySelector(".forge-heat-development")) return;
    main.innerHTML = forgeHeatDevelopmentView();
  }

  function apply() {
    addBrandTagline();
    consolidateAccountNavigation();
    simplifyNavigation();
    installNavigationIcons();
    prepareForgeHeatNavigation();
    customerCopy(document.body);
    polishBoundaryNotes(document);
    polishDashboard();
    improveEmptyStates(document);
    enforceForgeHeatDevelopment();
    polishTrademark(document);
    document.documentElement.classList.add("ff-product-polish-ready");
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("hashchange", scheduleApply);
  window.addEventListener("pageshow", scheduleApply);
  window.addEventListener("load", scheduleApply);
  scheduleApply();
})();
