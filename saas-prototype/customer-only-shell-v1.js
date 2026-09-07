(() => {
  "use strict";

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);
  const HIDDEN_NAV_ROUTES = new Set([
    "market-view", "forge-heat", "evaluate", "portfolio", "alerts", "beta-start",
    "decision-intelligence", "compare", "psa-advisor", "evidence", "sell", "export",
    "staging", "staging-evaluate"
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
      .filter(Boolean)
      .map(value => {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      });
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
        if (link.getAttribute("aria-hidden") === "true") link.removeAttribute("aria-hidden");
        if (link.tabIndex === -1) link.removeAttribute("tabindex");
        if (!link.hasAttribute("data-ff-customer-core")) link.setAttribute("data-ff-customer-core", "");
        replaceTextNode(link, labels.get(route));
      } else if (HIDDEN_NAV_ROUTES.has(route)) {
        if (!link.hidden) link.hidden = true;
        if (link.getAttribute("aria-hidden") !== "true") link.setAttribute("aria-hidden", "true");
        if (link.tabIndex !== -1) link.tabIndex = -1;
        link.removeAttribute("data-ff-customer-core");
      }
    });

    const advanced = nav.querySelector(".ff-advanced-nav");
    if (advanced && !advanced.hidden) advanced.hidden = true;
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
    const labels = ["Enter card", "Confirm", "Decision", "Save & track"];
    strip.querySelectorAll(".ff-workflow-step").forEach((step, index) => {
      const text = step.querySelector("span:last-child");
      if (labels[index]) setText(text, labels[index]);
    });
  }

  function ensureEvaluateSteps(main, activeIndex) {
    const heading = main?.querySelector(".page-heading");
    if (!main || !heading) return;

    let strip = main.querySelector("[data-ff-evaluate-steps]");
    if (!strip) {
      strip = document.createElement("nav");
      strip.className = "ff-evaluate-steps";
      strip.dataset.ffEvaluateSteps = "";
      strip.setAttribute("aria-label", "FlipForge evaluation progress");
      heading.insertAdjacentElement("afterend", strip);
    }

    const labels = ["Enter card", "Confirm", "Decision", "Save & track"];
    const wanted = labels.map((label, index) => {
      const active = index === activeIndex;
      const complete = index < activeIndex;
      return `<span class="ff-evaluate-step" data-active="${active}" data-complete="${complete}"${active ? ' aria-current="step"' : ""}><b>${complete ? "✓" : index + 1}</b><span>${label}</span></span>`;
    }).join("");
    setHtml(strip, wanted);
  }

  function simplifyEvaluateFlow() {
    const main = document.querySelector(MAIN);
    const active = routeName() === "discover";
    document.documentElement.classList.toggle("ff-customer-evaluate-live", active);
    if (!main || !active) return;

    const heading = main.querySelector(".page-heading");
    if (!heading) return;
    setText(heading.querySelector(".eyebrow"), "Evaluate");
    setText(heading.querySelector("h1"), "One card. One decision. Know why.");
    setText(heading.querySelector("p"), "Start with the exact card you are considering. FlipForge confirms identity, finds connected listings, and sends only the listing you choose to Smart Opportunity.");
    const headingActions = heading.querySelector(".page-actions");
    if (headingActions && !headingActions.hidden) headingActions.hidden = true;

    const hasConfirmation = Boolean(main.querySelector(".customer-discovery-identity-assist, .customer-discovery-results"));
    ensureEvaluateSteps(main, hasConfirmation ? 1 : 0);

    const pageBoundary = main.querySelector(".customer-discovery-page > .boundary-note");
    if (pageBoundary) {
      setHtml(pageBoundary, "<strong>Customer boundary:</strong> FlipForge evaluates and explains. It does not buy, bid, pay, or list cards.");
    }

    const searchPanel = main.querySelector(".customer-discovery-search");
    if (searchPanel) {
      setText(searchPanel.querySelector(".panel-header h2"), "What card are you looking at?");
      setText(searchPanel.querySelector(".panel-header p"), "Enter the exact identity you know. If the card needs clarification, FlipForge will ask you to confirm it before searching connected listings.");

      const identityInput = searchPanel.querySelector('input[name="exactCardQuery"]');
      const targetInput = searchPanel.querySelector('input[name="targetMaxBuy"]');
      const limitSelect = searchPanel.querySelector('select[name="limit"]');
      setText(identityInput?.closest("label")?.querySelector("span"), "Card or exact identity");
      setText(targetInput?.closest("label")?.querySelector("span"), "Max price you would consider (optional)");
      const limitLabel = limitSelect?.closest("label");
      if (limitLabel && limitLabel.dataset.ffEvaluateHide !== "true") limitLabel.dataset.ffEvaluateHide = "true";

      const primary = searchPanel.querySelector('button[type="submit"]');
      if (primary && !primary.disabled) setText(primary, "Find this card");
      const secondary = searchPanel.querySelector("[data-discovery-find-exact]");
      if (secondary && !secondary.classList.contains("ff-evaluate-secondary-find")) secondary.classList.add("ff-evaluate-secondary-find");
      setText(searchPanel.querySelector(".customer-discovery-search-help"), "Include year, set, player, card number, parallel and grade when you know them. FlipForge will not silently choose between similar cards.");
    }

    const identity = main.querySelector(".customer-discovery-identity-assist");
    if (identity) {
      setText(identity.querySelector(".eyebrow"), "Confirm card");
      setText(identity.querySelector(".panel-header h2"), "Confirm the exact card");
      setText(identity.querySelector(".panel-header p"), "Choose the card that matches what you are considering. FlipForge will not guess when more than one identity is possible.");
      const boundary = identity.querySelector(".boundary-note");
      if (boundary) setHtml(boundary, "<strong>Why confirmation matters:</strong> Only the exact card you select can move forward to listing search and evaluation.");
    }

    const providerGrid = main.querySelector(".customer-discovery-provider");
    const providerPanel = providerGrid?.closest(".panel");
    if (providerPanel) {
      const status = String(providerPanel.querySelector(".staging-status")?.textContent || "");
      providerPanel.classList.toggle("ff-evaluate-provider-collapsed", /connected/i.test(status));
    }

    const results = main.querySelector(".customer-discovery-results");
    if (results) {
      const summary = results.querySelector(".customer-discovery-summary");
      setText(summary?.querySelector("strong"), "Choose the listing you want evaluated");
      setText(summary?.querySelector("span"), "These are active listings for the exact card. Pick the listing you are actually considering, then FlipForge will run the decision engine.");

      results.querySelectorAll(".customer-discovery-candidate:not(.customer-discovery-candidate-review)").forEach(candidate => {
        const button = candidate.querySelector("[data-discovery-evaluate]");
        if (button && !button.disabled) setText(button, "Get FlipForge decision");
        const boundary = candidate.querySelector(".boundary-note");
        if (boundary) setHtml(boundary, "<strong>Not a decision yet:</strong> Choose this listing to run Smart Opportunity and create the saved BUY, WATCH, VERIFY, or PASS result.");
      });
    }
  }

  function traceReasonData(main) {
    const rows = [...main.querySelectorAll(".customer-trace-step")].map((step, index) => {
      const copy = step.querySelector("div");
      const label = String(copy?.querySelector("span")?.textContent || "").trim();
      const title = String(copy?.querySelector("strong")?.textContent || "").trim();
      const detail = String(copy?.querySelector("p")?.textContent || "").trim();
      const warning = Boolean(step.querySelector(".check-mark.warn"));
      const priority = warning ? 0 : /evidence/i.test(label) ? 1 : /market factors/i.test(label) ? 2 : /provider catalog/i.test(label) ? 3 : 4;
      return { label, title, detail, warning, priority, index };
    }).filter(item => item.title && item.detail && !/authority output/i.test(item.label));

    rows.sort((left, right) => left.priority - right.priority || left.index - right.index);
    return rows.slice(0, 2);
  }

  function ensureDecisionReasons(main, id) {
    const hero = main.querySelector(".customer-intelligence-hero");
    if (!hero) return;
    const reasons = traceReasonData(main);
    if (!reasons.length) return;

    let section = main.querySelector("[data-ff-decision-reasons]");
    if (!section) {
      section = document.createElement("section");
      section.className = "ff-decision-reasons";
      section.dataset.ffDecisionReasons = "";
      hero.insertAdjacentElement("afterend", section);
    }

    const signature = JSON.stringify(reasons.map(item => [item.label, item.title, item.detail, item.warning]));
    if (section.dataset.ffReasonSignature !== signature) {
      section.dataset.ffReasonSignature = signature;
      section.replaceChildren();

      const heading = document.createElement("div");
      heading.className = "ff-decision-reasons-heading";
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "Why this decision";
      const title = document.createElement("h2");
      title.textContent = "The two strongest reasons";
      const copy = document.createElement("p");
      copy.textContent = "These reasons are taken from the saved FlipForge decision trace. No new browser-side score or recommendation is created here.";
      heading.append(eyebrow, title, copy);
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "ff-decision-reasons-list";
      reasons.forEach((reason, index) => {
        const article = document.createElement("article");
        article.className = "ff-decision-reason";
        const number = document.createElement("b");
        number.textContent = String(index + 1);
        const body = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = reason.label.replace(/^\d+\s*·\s*/, "");
        const strong = document.createElement("strong");
        strong.textContent = reason.title;
        const paragraph = document.createElement("p");
        paragraph.textContent = reason.detail;
        body.append(label, strong, paragraph);
        article.append(number, body);
        list.appendChild(article);
      });
      section.appendChild(list);

      const actions = document.createElement("div");
      actions.className = "ff-decision-reasons-actions";
      const track = document.createElement("a");
      track.className = "button button-primary";
      track.href = `#/tracking/${encodeURIComponent(id)}`;
      track.textContent = "Track this card";
      const evidence = document.createElement("button");
      evidence.className = "button button-secondary";
      evidence.type = "button";
      evidence.dataset.ffEvaluateEvidenceToggle = "";
      evidence.setAttribute("aria-expanded", "false");
      evidence.textContent = "View full evidence";
      actions.append(track, evidence);
      section.appendChild(actions);

      const boundary = document.createElement("div");
      boundary.className = "ff-evaluate-decision-boundary";
      boundary.innerHTML = "<strong>Decision support only:</strong> FlipForge does not buy, bid, pay, accept offers, or list cards.";
      section.appendChild(boundary);
    }
  }

  function simplifyDecisionDetail() {
    const main = document.querySelector(MAIN);
    const parts = routeParts();
    const active = parts[0] === "opportunities" && parts.length > 1;
    document.documentElement.classList.toggle("ff-customer-decision-live", active);
    if (!active) {
      document.documentElement.classList.remove("ff-evaluate-show-advanced");
      return;
    }
    if (!main) return;

    const heading = main.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Saved decision");
      setText(heading.querySelector("h1"), "Your FlipForge decision");
      setText(heading.querySelector("p"), "Decision first. Two strongest reasons next. Open the full evidence only when you want the deeper detail.");
      const actions = heading.querySelector(".page-actions");
      if (actions && !actions.hidden) actions.hidden = true;
    }

    ensureEvaluateSteps(main, 2);
    ensureDecisionReasons(main, parts[1]);

    main.querySelector(".customer-intelligence-hero")?.classList.add("ff-evaluate-decision-hero");
    main.querySelector(".customer-intelligence-grid")?.classList.add("ff-evaluate-detail-advanced");
    main.querySelector(".staging-value-intelligence")?.classList.add("ff-evaluate-detail-advanced");
    main.querySelectorAll(".ff-progressive-advanced").forEach(section => section.classList.add("ff-evaluate-detail-advanced"));

    const toggle = main.querySelector("[data-ff-evaluate-evidence-toggle]");
    if (toggle) {
      const shown = document.documentElement.classList.contains("ff-evaluate-show-advanced");
      toggle.setAttribute("aria-expanded", String(shown));
      setText(toggle, shown ? "Hide full evidence" : "View full evidence");
    }
  }

  function simplifyTrackingProgress() {
    const main = document.querySelector(MAIN);
    const active = routeName() === "tracking";
    document.documentElement.classList.toggle("ff-customer-track-live", active);
    if (!main || !active) return;
    ensureEvaluateSteps(main, 3);
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
      ["Decision", "Get the FlipForge decision", "Let the server-owned decision engine return BUY, WATCH, VERIFY, or PASS."],
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
    simplifyEvaluateFlow();
    simplifyDecisionDetail();
    simplifyTrackingProgress();
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
    document.addEventListener("click", event => {
      const toggle = event.target.closest?.("[data-ff-evaluate-evidence-toggle]");
      if (!toggle) return;
      event.preventDefault();
      const shown = !document.documentElement.classList.contains("ff-evaluate-show-advanced");
      document.documentElement.classList.toggle("ff-evaluate-show-advanced", shown);
      toggle.setAttribute("aria-expanded", String(shown));
      setText(toggle, shown ? "Hide full evidence" : "View full evidence");
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