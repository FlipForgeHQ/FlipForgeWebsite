(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const CORE_ROUTES = new Set(["dashboard", "discover", "evaluate", "opportunities", "tracking", "beta-start"]);
  const SUPPORTING_ROUTES = ["market-view", "forge-heat", "portfolio", "alerts"];
  const ADVANCED_ROUTES = new Set(["market-view", "forge-heat", "portfolio", "alerts", "compare", "psa-advisor", "evidence", "sell", "export"]);
  let scheduled = false;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host)) && APP_PATH.test(String(window.location.pathname || ""));
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

  function guidedProgress() {
    const progress = window.FlipForgeGuidedMode?.getProgress?.();
    const completed = new Set(Array.isArray(progress?.completed) ? progress.completed : []);
    return {
      completed,
      firstRunComplete: progress?.firstRunComplete === true
    };
  }

  function syncGuidedState() {
    const progress = guidedProgress();
    document.documentElement.classList.toggle("ff-guided-incomplete", !progress.firstRunComplete);
    if (progress.firstRunComplete) document.documentElement.classList.remove("ff-show-advanced");
    return progress;
  }

  function setAnchorLabel(anchor, label) {
    if (!anchor) return;
    const textNode = [...anchor.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
    if (textNode) textNode.nodeValue = label;
    else anchor.append(document.createTextNode(label));
  }

  function simplifyNavigation() {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return;
    const progress = syncGuidedState();

    nav.querySelectorAll(":scope > a[data-route]").forEach(link => {
      const route = String(link.dataset.route || "");
      link.classList.toggle("ff-core-nav", CORE_ROUTES.has(route));
    });

    setAnchorLabel(nav.querySelector(':scope > a[data-route="opportunities"]'), "Saved Decisions");

    const details = nav.querySelector(".ff-advanced-nav");
    const links = details?.querySelector(".ff-advanced-nav-links");
    const summary = details?.querySelector("summary");
    if (!details || !links || !summary) return;

    const summaryText = [...summary.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (summaryText) summaryText.nodeValue = "Advanced Intelligence ";
    else summary.prepend(document.createTextNode("Advanced Intelligence "));

    let hint = summary.querySelector(".ff-advanced-hint");
    if (!hint) {
      hint = document.createElement("span");
      hint.className = "ff-advanced-hint";
      summary.appendChild(hint);
    }
    hint.textContent = progress.firstRunComplete ? "Optional" : "After your first card";

    SUPPORTING_ROUTES.forEach(route => {
      const original = nav.querySelector(`:scope > a[data-route="${route}"]`);
      if (!original) return;
      original.classList.add("ff-nav-relocated");
      original.setAttribute("aria-hidden", "true");
      original.tabIndex = -1;

      let clone = links.querySelector(`[data-ff-support-route="${route}"]`);
      if (!clone) {
        clone = original.cloneNode(true);
        clone.classList.remove("ff-nav-relocated", "active");
        clone.removeAttribute("data-route");
        clone.removeAttribute("aria-hidden");
        clone.removeAttribute("tabindex");
        clone.dataset.ffSupportRoute = route;
        clone.classList.add("ff-support-clone");
        links.prepend(clone);
      }
      clone.classList.toggle("ff-support-active", routeName() === route);
      if (routeName() === route) clone.setAttribute("aria-current", "page");
      else clone.removeAttribute("aria-current");
    });

    if (ADVANCED_ROUTES.has(routeName())) details.open = true;
  }

  const TECHNICAL_EXACT = new Map([
    ["NOT_CONFIRMED", "Not confirmed"],
    ["MIXED_DISPLAY_ONLY", "Display-only / mixed"],
    ["INSUFFICIENT_SAVED_CONTEXT", "Not enough saved context"],
    ["PSA_CONTEXT_MISSING", "PSA context missing"],
    ["NEEDS_VALUE_EVIDENCE", "Needs exact sold evidence"],
    ["GRANTED_ON_COMPLETION", "Saved after evaluation"],
    ["DENY", "Protected"]
  ]);

  const CUSTOMER_REPLACEMENTS = [
    [/\btenant-owned\b/gi, "saved to your account"],
    [/\btenant-scoped\b/gi, "account-specific"],
    [/\bSQLite saved\b/gi, "saved to your account"],
    [/\bSQLite\b/g, "your account"],
    [/\bprovider-backed\b/gi, "connected-source"],
    [/\bprovider context\b/gi, "marketplace context"],
    [/\bgoverned evidence\b/gi, "qualified evidence"],
    [/\bauthority-ineligible\b/gi, "not eligible"],
    [/\bauthority output\b/gi, "decision"],
    [/\bsole decision authority\b/gi, "decision engine"],
    [/\bsole BUY\/WATCH\/VERIFY\/PASS authority\b/gi, "BUY/WATCH/VERIFY/PASS decision engine"],
    [/Existing PSA intelligence remains the sole grading-guidance authority\.?/gi, "PSA Advisor provides grading guidance."],
    [/Smart Opportunity remains the sole BUY\/WATCH\/VERIFY\/PASS authority\.?/gi, "Smart Opportunity provides the BUY/WATCH/VERIFY/PASS decision."],
    [/No local scoring\.?/gi, "No hidden re-scoring."],
    [/authority-required/gi, "required"],
    [/authority-eligible/gi, "eligible"]
  ];

  function refineCustomerLanguage() {
    const roots = [
      document.querySelector("#main-content"),
      document.querySelector(".prototype-banner"),
      document.querySelector(".plan-card")
    ].filter(Boolean);

    roots.forEach(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style,input,textarea,select,option,code,pre")) continue;
        const original = node.nodeValue || "";
        const trimmed = original.trim();
        if (TECHNICAL_EXACT.has(trimmed)) {
          node.nodeValue = original.replace(trimmed, TECHNICAL_EXACT.get(trimmed));
          continue;
        }
        let value = original;
        CUSTOMER_REPLACEMENTS.forEach(([pattern, replacement]) => { value = value.replace(pattern, replacement); });
        if (value !== original) node.nodeValue = value;
      }
    });
  }

  function currentStep(route, parts) {
    if (route === "discover") return "discover";
    if (route === "evaluate") return "evaluate";
    if (route === "opportunities") return "understand";
    if (route === "tracking") return "track";
    if (route === "beta-start") return "";
    return parts.length ? "" : "";
  }

  function workflowStrip() {
    const main = document.querySelector("#main-content");
    const heading = main?.querySelector(".page-heading");
    const route = routeName();
    const parts = routeParts();
    if (!main || !heading || !["discover", "evaluate", "opportunities", "tracking", "beta-start"].includes(route)) return;

    const progress = guidedProgress();
    const current = currentStep(route, parts);
    const steps = [
      ["discover", "Discover", "#/discover"],
      ["evaluate", "Evaluate", "#/evaluate"],
      ["understand", "Understand", "#/opportunities"],
      ["track", "Track", "#/tracking"]
    ];

    let strip = main.querySelector("[data-ff-workflow-strip]");
    if (!strip) {
      strip = document.createElement("nav");
      strip.className = "ff-workflow-strip";
      strip.dataset.ffWorkflowStrip = "";
      strip.setAttribute("aria-label", "Your FlipForge card workflow");
      heading.insertAdjacentElement("afterend", strip);
    }

    strip.innerHTML = steps.map(([key, label, href], index) => {
      const done = progress.completed.has(key);
      const active = current === key;
      return `<a class="ff-workflow-step" href="${href}" data-done="${done}" ${active ? 'aria-current="step"' : ""}><span class="ff-workflow-step-number">${done ? "✓" : index + 1}</span><span>${label}</span></a>`;
    }).join("");
  }

  function recommendation() {
    const main = document.querySelector("#main-content");
    if (!main) return "";
    const nodes = [
      ...main.querySelectorAll(".status-pill,.customer-intelligence-hero [data-recommendation],.customer-intelligence-hero strong")
    ];
    for (const node of nodes) {
      const text = String(node.textContent || "").trim().toUpperCase();
      if (["BUY", "WATCH", "VERIFY", "PASS"].includes(text)) return text;
    }
    const match = String(main.textContent || "").match(/\b(BUY|WATCH|VERIFY|PASS)\b/i);
    return match ? match[1].toUpperCase() : "";
  }

  function decisionCopy(rec, text) {
    if (rec === "VERIFY") {
      const identity = /identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)|no confirmed .*context/i.test(text);
      const evidence = /no accepted exact completed sales|0 accepted|no exact sales|evidence-supported value is unavailable/i.test(text);
      let reason = "FlipForge does not yet have enough trustworthy support for a stronger decision.";
      if (identity && evidence) reason = "The exact card identity still needs confirmation, and there is not enough exact completed-sale evidence yet.";
      else if (identity) reason = "The exact card identity still needs confirmation before FlipForge can support a stronger decision.";
      else if (evidence) reason = "There is not enough exact completed-sale evidence yet to support a value or stronger decision.";
      return { title: "This card needs verification before you act.", reason, next: "Review what is missing, then decide whether to verify the identity or wait for stronger sold evidence." };
    }
    if (rec === "WATCH") return {
      title: "This card is worth watching—not chasing.",
      reason: "The current price or evidence does not support moving further yet.",
      next: "Add it to Tracking and watch for a better price or stronger evidence."
    };
    if (rec === "PASS") return {
      title: "The current setup does not support this opportunity.",
      reason: "Price, evidence, risk, or a combination of those factors keeps this card below FlipForge's decision threshold.",
      next: "Read why, then move on or start another card."
    };
    if (rec === "BUY") return {
      title: "The evaluated price clears the current decision checks.",
      reason: "FlipForge found enough support for a BUY decision at the evaluated price.",
      next: "Review the exact evidence and risk before taking any action outside FlipForge."
    };
    return {
      title: "Start with the decision—not the advanced details.",
      reason: "Read the plain-English result first, then open deeper intelligence only when you need it.",
      next: "Understand why the decision was reached before moving on."
    };
  }

  function markProgressiveAdvanced() {
    const main = document.querySelector("#main-content");
    if (!main || routeName() !== "opportunities" || routeParts().length < 2) return;
    const patterns = /Forge Heat|Price Intelligence|Historical sold evidence|How to read this decision|Evidence Chain|Evidence readiness|Saved PSA guidance/i;
    main.querySelectorAll("h2,h3").forEach(heading => {
      if (!patterns.test(String(heading.textContent || ""))) return;
      const section = heading.closest("section,article,.panel,.customer-intelligence-section");
      section?.classList.add("ff-progressive-advanced");
    });
  }

  function decisionSummary() {
    const main = document.querySelector("#main-content");
    const parts = routeParts();
    if (!main || parts[0] !== "opportunities" || parts.length < 2) {
      main?.querySelector?.("[data-ff-decision-summary]")?.remove();
      return;
    }

    markProgressiveAdvanced();
    const rec = recommendation();
    const copy = decisionCopy(rec, String(main.textContent || ""));
    let summary = main.querySelector("[data-ff-decision-summary]");
    if (!summary) {
      summary = document.createElement("section");
      summary.className = "ff-decision-summary";
      summary.dataset.ffDecisionSummary = "";
      const saved = main.querySelector("[data-ff-saved-decision-bar]");
      const workflow = main.querySelector("[data-ff-workflow-strip]");
      const heading = main.querySelector(".page-heading");
      const anchor = saved || workflow || heading;
      anchor?.insertAdjacentElement("afterend", summary);
    }

    const id = encodeURIComponent(parts[1]);
    const advancedHidden = document.documentElement.classList.contains("ff-guided-incomplete") && !document.documentElement.classList.contains("ff-show-advanced");
    summary.innerHTML = `<div class="ff-decision-summary-main"><div class="ff-decision-summary-kicker"><span class="ff-decision-summary-pill">${rec || "DECISION"}</span><span>Start here</span></div><h2>${copy.title}</h2><p>${copy.reason}</p><p class="ff-decision-next"><strong>What you should do next:</strong> ${copy.next}</p></div><div class="ff-decision-summary-actions"><button type="button" class="button button-primary" data-ff-show-why>Show me why →</button><a class="button button-secondary" href="#/tracking/${id}">Track this card</a><button type="button" class="button button-secondary" data-ff-new-card>+ Start another card</button><button type="button" class="button button-secondary ff-advanced-toggle" data-ff-toggle-advanced>${advancedHidden ? "Show advanced intelligence" : "Hide advanced intelligence"}</button></div>`;
  }

  function enhanceSaveConfirmation() {
    const main = document.querySelector("#main-content");
    const parts = routeParts();
    const bar = main?.querySelector("[data-ff-saved-decision-bar]");
    if (!bar || parts[0] !== "opportunities" || parts.length < 2) return;

    const justSaved = (() => {
      try { return window.sessionStorage.getItem("flipforge.pendingEvaluationSave") === "1"; } catch (_) { return false; }
    })();
    if (justSaved) {
      try { window.sessionStorage.removeItem("flipforge.pendingEvaluationSave"); } catch (_) { /* session preference only */ }
    }

    bar.classList.add("ff-save-confirmed");
    bar.classList.toggle("ff-just-saved", justSaved);
    const strong = bar.querySelector(".ff-saved-decision-copy strong");
    const small = bar.querySelector(".ff-saved-decision-copy small");
    if (strong) strong.textContent = justSaved ? "Evaluation complete & saved" : "Evaluation saved";
    if (small) small.textContent = "This decision is saved to your account. Starting another card will not remove it.";

    const actions = bar.querySelector(".ff-saved-decision-actions");
    if (actions) {
      const id = encodeURIComponent(parts[1]);
      actions.innerHTML = `<button class="button button-primary" type="button" data-ff-show-why>Understand this decision →</button><a class="button button-secondary" href="#/tracking/${id}">Track this card</a><button class="button button-secondary" type="button" data-ff-new-card>+ Start another card</button>`;
    }
  }

  function ensurePrimaryNewCard() {
    const global = document.querySelector("[data-ff-global-new-card]");
    if (global) global.classList.add("ff-primary-new-card");

    if (routeName() !== "dashboard") return;
    const actions = document.querySelector("#main-content .page-heading .page-actions");
    if (!actions || actions.querySelector("[data-ff-page-new-card]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary ff-page-new-card";
    button.dataset.ffPageNewCard = "";
    button.dataset.ffNewCard = "";
    button.textContent = "+ New card";
    actions.prepend(button);
  }

  function recoveryMarkup(title, copy, actions) {
    return `<div><span>I'm still with you</span><h3>${title}</h3><p>${copy}</p></div><div class="ff-recovery-actions">${actions}</div>`;
  }

  function addRecoveryAfter(anchor, key, html) {
    if (!anchor || document.querySelector(`[data-ff-recovery="${key}"]`)) return;
    const coach = document.createElement("section");
    coach.className = "ff-recovery-coach";
    coach.dataset.ffRecovery = key;
    coach.innerHTML = html;
    anchor.insertAdjacentElement("afterend", coach);
  }

  function recoveryGuidance() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    const route = routeName();

    main.querySelectorAll("[data-ff-recovery]").forEach(node => node.remove());

    if (route === "discover") {
      const error = main.querySelector('.customer-discovery-page .staging-error[role="alert"]');
      if (error) {
        addRecoveryAfter(error, "discover-error", recoveryMarkup(
          "The search didn't finish. Nothing was saved.",
          "Go back to the card box, confirm the exact identity, and try again. If the card number or parallel is uncertain, use Find exact card first.",
          '<button class="button button-primary" type="button" data-ff-focus-card>Show me the card box</button><button class="button button-secondary" type="button" data-ff-find-exact>Find exact card</button>'
        ));
        return;
      }

      const identity = main.querySelector(".customer-discovery-identity-assist");
      if (identity && /No selectable exact identity|No selectable|Add a year, set, player, card number/i.test(identity.textContent || "")) {
        addRecoveryAfter(identity, "identity-missing", recoveryMarkup(
          "FlipForge needs a little more card detail.",
          "Add the year, set, player, and card number first. Add the parallel, insert, grader, and grade when you know them. Then try Find exact card again.",
          '<button class="button button-primary" type="button" data-ff-focus-card>Take me back to the card box</button>'
        ));
        return;
      }

      const empty = [...main.querySelectorAll(".staging-empty")].find(node => /No active candidate|No connected listing|No active candidates/i.test(node.textContent || ""));
      if (empty) {
        addRecoveryAfter(empty, "discover-empty", recoveryMarkup(
          "No matching active listing came back yet.",
          "That does not mean the card is bad. Tighten the identity with the exact card number, parallel or grade, or use Find exact card before searching again.",
          '<button class="button button-primary" type="button" data-ff-focus-card>Refine this card</button><button class="button button-secondary" type="button" data-ff-find-exact>Find exact card</button>'
        ));
      }
    }

    if (route === "evaluate") {
      const error = main.querySelector('.staging-error[role="alert"],.consumer-state-error');
      if (error) {
        addRecoveryAfter(error, "evaluate-error", recoveryMarkup(
          "The evaluation couldn't complete. Nothing new was saved.",
          "Review the card identity and listing facts, then try again. If you are unsure about the card, return to Discover instead of guessing.",
          '<a class="button button-primary" href="#/discover">Return to Discover</a><button class="button button-secondary" type="button" data-ff-new-card>Start a different card</button>'
        ));
      }
    }
  }

  function betaMission() {
    const main = document.querySelector("#main-content");
    if (!main || routeName() !== "beta-start") return;
    if (main.querySelector("[data-ff-beta-mission]")) return;
    const workflow = main.querySelector("[data-ff-workflow-strip]");
    const heading = main.querySelector(".page-heading");
    const anchor = workflow || heading;
    if (!anchor) return;

    const mission = document.createElement("section");
    mission.className = "ff-beta-mission";
    mission.dataset.ffBetaMission = "";
    mission.innerHTML = `<span class="eyebrow">Your private-beta mission</span><h2>Evaluate one real card using only what FlipForge tells you.</h2><p>If you ever stop and wonder what to click, what a result means, or how to continue, that is a product issue—not something you are expected to figure out on your own.</p><div class="ff-beta-mission-checks"><span>Enter one exact card</span><span>Choose the correct listing</span><span>Understand the decision</span><span>Track it or start another</span></div>`;
    anchor.insertAdjacentElement("afterend", mission);
  }

  function showWhy() {
    document.documentElement.classList.add("ff-show-advanced");
    const main = document.querySelector("#main-content");
    const headings = [...(main?.querySelectorAll("h2,h3") || [])];
    const targetHeading = headings.find(node => /Decision Traceback|Why FlipForge says this|How to read this decision/i.test(String(node.textContent || "")));
    const target = targetHeading?.closest("section,article,.panel,.customer-intelligence-section") || targetHeading;
    if (!target) return;
    target.classList.remove("ff-progressive-advanced");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("ff-guide-highlight");
    target.dataset.guideLabel = "Why FlipForge reached this decision";
    window.setTimeout(() => target.classList.remove("ff-guide-highlight"), 8000);
    scheduleApply();
  }

  function toggleAdvanced() {
    const root = document.documentElement;
    root.classList.toggle("ff-show-advanced");
    scheduleApply();
  }

  function handleFindExact() {
    const button = document.querySelector("#main-content [data-discovery-find-exact]");
    if (button) {
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      button.focus({ preventScroll: true });
      button.click();
      return;
    }
    window.FlipForgeDiscoverFocusFix?.show?.();
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      if (event.target.closest("[data-discovery-evaluate]")) {
        try { window.sessionStorage.setItem("flipforge.pendingEvaluationSave", "1"); } catch (_) { /* session only */ }
      }
      if (event.target.closest("[data-ff-show-why]")) {
        event.preventDefault();
        showWhy();
        return;
      }
      if (event.target.closest("[data-ff-toggle-advanced]")) {
        event.preventDefault();
        toggleAdvanced();
        return;
      }
      if (event.target.closest("[data-ff-find-exact]")) {
        event.preventDefault();
        handleFindExact();
      }
    }, true);
  }

  function apply() {
    if (!eligibleHost()) return;
    syncGuidedState();
    simplifyNavigation();
    workflowStrip();
    ensurePrimaryNewCard();
    enhanceSaveConfirmation();
    decisionSummary();
    recoveryGuidance();
    betaMission();
    refineCustomerLanguage();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function init() {
    if (!eligibleHost()) return;
    bindEvents();
    const main = document.querySelector("#main-content");
    if (main) new MutationObserver(scheduleApply).observe(main, { childList: true, subtree: true, characterData: true });
    const nav = document.querySelector(".primary-nav");
    if (nav) new MutationObserver(scheduleApply).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    window.addEventListener("hashchange", () => {
      document.documentElement.classList.remove("ff-show-advanced");
      window.setTimeout(scheduleApply, 70);
    });
    window.addEventListener("pageshow", scheduleApply);
    window.addEventListener("load", scheduleApply);
    window.addEventListener("flipforge:identity-change", scheduleApply);
    scheduleApply();
  }

  window.FlipForgeBetaCustomerFlow = Object.freeze({
    refresh: scheduleApply,
    showWhy,
    toggleAdvanced
  });

  init();
})();
