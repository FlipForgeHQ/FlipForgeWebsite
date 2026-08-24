(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const ROOT_ID = "ff-guided-mode-root";
  const MODAL_ID = "ff-guided-mode-welcome";
  const VERSION = "v1";

  const state = {
    session: null,
    accountKey: "anonymous",
    enabled: true,
    minimized: false,
    welcomeOpen: false,
    mounted: false,
    observerQueued: false,
    highlight: null
  };

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

  function identitySnapshot() {
    return window.FlipForgeIdentity?.getSnapshot?.() || {
      authenticated: false,
      email: "",
      fullName: "",
      membershipActive: false,
      membershipConfigured: false
    };
  }

  function accountHash(value) {
    let hash = 2166136261;
    const text = String(value || "anonymous").trim().toLowerCase();
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function storageKey(name) {
    return `flipforge.guidedMode.${VERSION}.${state.accountKey}.${name}`;
  }

  function read(name, fallback = "") {
    try {
      const value = window.localStorage.getItem(storageKey(name));
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function write(name, value) {
    try { window.localStorage.setItem(storageKey(name), String(value)); } catch (_) { /* preference only */ }
  }

  function remove(name) {
    try { window.localStorage.removeItem(storageKey(name)); } catch (_) { /* preference only */ }
  }

  function stepState() {
    const raw = read("steps", "");
    return new Set(raw.split(",").filter(Boolean));
  }

  function markStep(step) {
    if (!step) return;
    const steps = stepState();
    if (!steps.has(step)) {
      steps.add(step);
      write("steps", [...steps].join(","));
    }
  }

  function firstRunComplete() {
    const steps = stepState();
    return ["discover", "evaluate", "understand", "track"].every(step => steps.has(step));
  }

  function syncSession() {
    state.session = identitySnapshot();
    state.accountKey = accountHash(state.session.email || "anonymous");
    state.enabled = read("enabled", "on") !== "off";
    return state.session;
  }

  function currentRecommendation() {
    const main = document.querySelector("#main-content");
    if (!main) return "";
    const prioritized = [
      ".customer-intelligence-hero .status-pill",
      ".customer-intelligence-hero [data-recommendation]",
      ".hero-card .status-pill",
      ".status-pill"
    ];
    for (const selector of prioritized) {
      const text = main.querySelector(selector)?.textContent?.trim().toUpperCase();
      if (["BUY", "WATCH", "VERIFY", "PASS"].includes(text)) return text;
    }
    const match = (main.textContent || "").match(/\b(BUY|WATCH|VERIFY|PASS)\b/i);
    return match ? match[1].toUpperCase() : "";
  }

  function findHeadingSection(pattern) {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    const headings = [...main.querySelectorAll("h1,h2,h3,strong")];
    const heading = headings.find(node => pattern.test(String(node.textContent || "")));
    return heading?.closest("section,article,.panel,.customer-intelligence-section,.customer-intelligence-hero") || heading || null;
  }

  function discoverHasCandidates() {
    return Boolean(document.querySelector("#main-content .customer-discovery-candidate, #main-content [data-discovery-evaluate]"));
  }

  function targetFor(route, phase = "") {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    if (route === "discover") {
      if (phase === "candidate" || discoverHasCandidates()) return main.querySelector(".customer-discovery-candidate, [data-discovery-evaluate]");
      return main.querySelector(".customer-discovery-search, [data-customer-discovery-form]");
    }
    if (route === "evaluate") return main.querySelector("[data-staging-evaluation-form], .staging-evaluation-panel");
    if (route === "opportunities" && routeParts().length > 1) {
      return findHeadingSection(/Decision Traceback|How to read this decision|Why FlipForge says this/i)
        || main.querySelector(".customer-intelligence-hero, .hero-card");
    }
    if (route === "opportunities") return main.querySelector("table, .customer-opportunities-list, .staging-list, .panel");
    if (route === "tracking") return main.querySelector(".customer-lifecycle-page, .customer-management-page, .panel");
    if (route === "beta-start") return main.querySelector("[data-private-beta-start], .private-beta-hero, .page-heading");
    return main.querySelector(".page-heading, .page > .panel, .panel");
  }

  function clearHighlight() {
    if (state.highlight) state.highlight.classList.remove("ff-guide-highlight");
    document.querySelectorAll(".ff-guide-highlight").forEach(node => node.classList.remove("ff-guide-highlight"));
    state.highlight = null;
  }

  function showTarget(route, phase = "") {
    clearHighlight();
    const target = targetFor(route, phase);
    if (!target) return;
    const node = target.matches("button,input,textarea,select,a") ? target.closest("section,article,form,.panel") || target : target;
    state.highlight = node;
    node.classList.add("ff-guide-highlight");
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      if (state.highlight === node) clearHighlight();
    }, 8000);
  }

  function navigationModel(href, label) {
    return { type: "navigate", href, label };
  }

  function highlightModel(label, phase = "") {
    return { type: "highlight", label, phase };
  }

  function guideModel() {
    const route = routeName();
    const parts = routeParts();
    const complete = firstRunComplete();

    if (route === "beta-start") return {
      location: "Getting Started",
      title: complete ? "Your first-card loop is complete." : "Start with one exact card.",
      copy: complete
        ? "You can use the full workspace now. Guided Mode will still explain unfamiliar screens whenever you need it."
        : "Your first goal is simple: find one exact card, evaluate it, understand the decision, and save it for follow-up.",
      why: complete
        ? "The guide stays available from the gold Guide button."
        : "You do not need Forge Heat, PSA Advisor, Compare, or Audit Export to complete your first decision.",
      action: complete ? navigationModel("#/dashboard", "Open my dashboard →") : navigationModel("#/discover", "Start with Discover →"),
      secondary: complete ? navigationModel("#/discover", "Evaluate another card") : highlightModel("Show me where to start")
    };

    if (route === "dashboard") return {
      location: "Dashboard",
      title: complete ? "This is your decision overview." : "Don't start by learning the dashboard.",
      copy: complete
        ? "Use this screen to see saved decisions and what deserves attention. Open a card when you want the full reasoning."
        : "The dashboard makes more sense after you complete one card from start to finish. I’ll walk you through that first.",
      why: complete ? "The dashboard summarizes saved intelligence; it does not create a decision." : "Starting with one real card gives every other screen context.",
      action: navigationModel("#/discover", complete ? "Discover another card →" : "Start my first card →")
    };

    if (route === "discover") {
      if (discoverHasCandidates()) return {
        location: "Discover · Step 1",
        title: "Now choose the exact listing you mean.",
        copy: "Compare the returned card identity carefully. A close match is not good enough—card number, parallel, grader, and grade can change the decision.",
        why: "When the exact listing is right, use Evaluate with Smart Opportunity. That is the step that creates and saves the actual FlipForge decision.",
        action: highlightModel("Show me the listing to evaluate", "candidate"),
        secondary: navigationModel("#/beta-start", "Review the first-card steps")
      };
      return {
        location: "Discover · Step 1",
        title: "Tell FlipForge exactly which card you mean.",
        copy: "Enter the identity you know: year, set, player, card number, parallel or insert, grader, and grade. If you are unsure, use Find exact card.",
        why: "Identity comes first. FlipForge should never make a confident decision about the wrong card.",
        action: highlightModel("Show me where to enter the card"),
        secondary: navigationModel("#/beta-start", "Review the first-card steps")
      };
    }

    if (route === "evaluate") return {
      location: "Evaluate · Step 2",
      title: "Give FlipForge the listing facts—then let the engine judge it.",
      copy: "Confirm the exact card identity, listing, and all-in acquisition cost. Review the authority boundary, then choose Evaluate and save.",
      why: "The browser supplies facts. Smart Opportunity creates the saved BUY, WATCH, VERIFY, or PASS decision.",
      action: highlightModel("Show me the evaluation form"),
      secondary: navigationModel("#/discover", "Go back to Discover")
    };

    if (route === "opportunities" && parts.length > 1) {
      const recommendation = currentRecommendation() || "decision";
      markStep("evaluate");
      const recommendationCopy = {
        VERIFY: "VERIFY means FlipForge does not have enough trustworthy support yet for a stronger call. This is a next-step signal, not a failure.",
        WATCH: "WATCH means the card is worth monitoring, but the current price or evidence does not support moving further yet.",
        PASS: "PASS means the current evidence and context do not support the opportunity. Read the reasons before moving on.",
        BUY: "BUY is still decision support, not transaction authority. Read the evidence and risk before taking any outside action."
      }[recommendation] || "Start with the decision, then read why FlipForge reached it before opening the advanced modules.";
      const nextCopy = recommendation === "VERIFY"
        ? "Your next job is to understand what is missing—identity, exact sold evidence, or another governed input."
        : recommendation === "WATCH"
          ? "Your next job is to understand the reason, then add the card to Tracking if you want to monitor it."
          : recommendation === "PASS"
            ? "Your next job is to understand the reason. Then move on or keep it only if you have a specific reason to monitor it."
            : "Your next job is to understand why the decision was reached before doing anything outside FlipForge.";
      return {
        location: `Card Intelligence · Step 3`,
        title: `Start here: ${recommendation}.`,
        copy: recommendationCopy,
        why: nextCopy,
        action: highlightModel(recommendation === "VERIFY" ? "Show me what is missing" : "Show me why FlipForge says this"),
        secondary: { type: "understand", label: "I understand the decision →" }
      };
    }

    if (route === "opportunities") return {
      location: "Opportunities",
      title: "These are decisions you've already saved.",
      copy: "Choose one card to open Card Intelligence. Start with the recommendation and the explanation—not the advanced scores.",
      why: "A saved card is where FlipForge connects the decision to its supporting evidence and unresolved limits.",
      action: highlightModel("Show me my saved cards"),
      secondary: navigationModel("#/discover", "Discover a new card")
    };

    if (route === "tracking") {
      markStep("track");
      return {
        location: "Tracking · Step 4",
        title: firstRunComplete() ? "You completed the core FlipForge loop." : "This is where the decision becomes useful over time.",
        copy: "Tracking preserves the saved decision so you can return later and see what held, changed, or still needs evidence.",
        why: "The 7 / 14 / 30-day checks are how FlipForge learns whether the original reasoning stayed useful without rewriting history.",
        action: firstRunComplete() ? navigationModel("#/dashboard", "Finish → Open Dashboard") : highlightModel("Show me the tracked decision"),
        secondary: navigationModel("#/discover", "Discover another card")
      };
    }

    if (["forge-heat", "compare", "psa-advisor", "evidence", "sell", "export", "market-view", "portfolio", "alerts"].includes(route)) return {
      location: "Advanced workspace",
      title: complete ? "You can use this when it helps the decision." : "You don't need this screen for your first card.",
      copy: complete
        ? "This is a supporting analysis screen. Guided Mode will keep the core recommendation and evidence boundary in context."
        : "Finish the basic Discover → Evaluate → Understand → Track loop first. Then the advanced tools will make much more sense.",
      why: "FlipForge should reveal complexity when it becomes useful—not make you learn every module up front.",
      action: complete ? navigationModel("#/opportunities", "Return to saved decisions →") : navigationModel("#/discover", "Return to my first card →")
    };

    if (route === "account") return {
      location: "Account",
      title: "This screen manages access and usage—not card decisions.",
      copy: "Return to Discover when you want to evaluate a card. Use Account for profile, plan, and access information.",
      why: "Keeping account administration separate makes the decision workflow easier to follow.",
      action: navigationModel("#/discover", "Go to Discover →")
    };

    return {
      location: "FlipForge Guide",
      title: "I’ll keep you on the decision path.",
      copy: "If this screen is unfamiliar, return to Getting Started or Discover one exact card and work forward from there.",
      why: "The basic loop is Discover → Evaluate → Understand → Track.",
      action: navigationModel("#/beta-start", "Open Getting Started →")
    };
  }

  function currentStepIndex() {
    const steps = stepState();
    if (!steps.has("discover")) return 0;
    if (!steps.has("evaluate")) return 1;
    if (!steps.has("understand")) return 2;
    if (!steps.has("track")) return 3;
    return 4;
  }

  function progressMarkup() {
    const steps = stepState();
    const order = ["discover", "evaluate", "understand", "track"];
    const current = Math.min(currentStepIndex(), 3);
    const completed = order.filter(step => steps.has(step)).length;
    return `<div class="ff-guide-progress"><div class="ff-guide-progress-top"><span>First-card path</span><span>${completed} / 4 complete</span></div><div class="ff-guide-track">${order.map((step,index)=>`<span data-done="${steps.has(step)}" data-current="${!steps.has(step) && index===current}"></span>`).join("")}</div></div>`;
  }

  function buttonMarkup(action, secondary = false) {
    if (!action) return "";
    return `<button type="button" class="ff-guide-action${secondary ? " secondary" : ""}" data-guide-action="${action.type}" ${action.href ? `data-guide-href="${action.href}"` : ""} ${action.phase ? `data-guide-phase="${action.phase}"` : ""}>${action.label}</button>`;
  }

  function root() {
    let node = document.getElementById(ROOT_ID);
    if (!node) {
      node = document.createElement("div");
      node.id = ROOT_ID;
      document.body.appendChild(node);
    }
    return node;
  }

  function renderPanel() {
    if (!eligibleHost()) return;
    const session = syncSession();
    const node = root();
    if (!session.authenticated || !session.membershipActive) {
      node.innerHTML = "";
      return;
    }
    if (!state.enabled || state.minimized) {
      node.innerHTML = `<button type="button" class="ff-guide-launcher" data-guide-open>Guide me</button>`;
      return;
    }
    const model = guideModel();
    node.innerHTML = `<aside class="ff-guide-panel" aria-label="FlipForge Guided Mode">
      <div class="ff-guide-head"><div><span class="ff-guide-kicker">Guided Mode · On</span><strong>Your FlipForge guide</strong></div><button type="button" class="ff-guide-icon-button" data-guide-minimize aria-label="Minimize guide">−</button></div>
      <div class="ff-guide-body"><span class="ff-guide-location">${model.location}</span><h2>${model.title}</h2><p>${model.copy}</p><div class="ff-guide-why"><strong>Why this matters:</strong> ${model.why}</div><div class="ff-guide-actions">${buttonMarkup(model.action)}${buttonMarkup(model.secondary,true)}</div></div>
      ${progressMarkup()}
      <div class="ff-guide-footer"><span>Decision support only · No transaction authority</span><button type="button" data-guide-toggle>Turn Guided Mode off</button></div>
    </aside>`;
  }

  function welcomeSeen() {
    return read("welcome", "") === "seen";
  }

  function showWelcome(force = false) {
    const session = syncSession();
    if (!session.authenticated || !session.membershipActive) return;
    if (!force && welcomeSeen()) return;
    if (document.getElementById(MODAL_ID)) return;
    state.welcomeOpen = true;
    const wrapper = document.createElement("div");
    wrapper.id = MODAL_ID;
    wrapper.className = "ff-guide-modal-backdrop";
    wrapper.innerHTML = `<section class="ff-guide-modal" role="dialog" aria-modal="true" aria-labelledby="ff-guide-welcome-title"><div class="ff-guide-modal-main"><span class="ff-guide-kicker">Welcome to FlipForge Private Beta</span><h1 id="ff-guide-welcome-title">I’ll walk you through your first card.</h1><p class="ff-guide-intro">You do not need to learn every screen. Start with one exact card and I’ll tell you what to look at, why it matters, and what to do next.</p><div class="ff-guide-modal-steps"><article class="ff-guide-modal-step"><span>01 · Discover</span><strong>Find the exact card.</strong><p>Confirm year, set, card number, parallel, grader, and grade before anything else.</p></article><article class="ff-guide-modal-step"><span>02 · Evaluate</span><strong>Challenge the evidence.</strong><p>FlipForge evaluates the listing and creates the saved BUY, WATCH, VERIFY, or PASS decision.</p></article><article class="ff-guide-modal-step"><span>03 · Understand & Track</span><strong>Know why—then preserve it.</strong><p>Read the reason first, then save the decision so you can revisit it later.</p></article></div><div class="ff-guide-modal-actions"><button type="button" class="ff-guide-action" data-guide-welcome-start>Start my first card →</button><button type="button" class="ff-guide-action secondary" data-guide-welcome-tour>Show me around first</button></div><p class="ff-guide-modal-note">Guided Mode stays available in the lower-right corner. You can turn it off anytime. It stores only a browser preference and never changes a decision, account entitlement, or evidence record.</p></div></section>`;
    document.body.appendChild(wrapper);
    document.body.classList.add("ff-guide-modal-open");
    wrapper.querySelector("[data-guide-welcome-start]")?.focus();
  }

  function closeWelcome(markSeen = true) {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove("ff-guide-modal-open");
    state.welcomeOpen = false;
    if (markSeen) write("welcome", "seen");
    renderPanel();
  }

  function resetGuide() {
    ["welcome","steps","enabled"].forEach(remove);
    state.enabled = true;
    state.minimized = false;
    clearHighlight();
    renderPanel();
    showWelcome(true);
  }

  function handleGuideAction(button) {
    const type = button.dataset.guideAction;
    if (type === "navigate") {
      const href = button.dataset.guideHref;
      if (href) window.location.hash = href.replace(/^#/, "");
      return;
    }
    if (type === "highlight") {
      showTarget(routeName(), button.dataset.guidePhase || "");
      return;
    }
    if (type === "understand") {
      markStep("understand");
      const parts = routeParts();
      const id = parts.length > 1 ? parts[1] : "";
      renderPanel();
      const track = document.querySelector('#main-content a[href^="#/tracking"]');
      if (track) {
        track.classList.add("ff-guide-highlight");
        state.highlight = track.closest("section,article,.panel") || track;
        state.highlight.classList.add("ff-guide-highlight");
        state.highlight.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (id) {
        window.location.hash = `#/tracking/${encodeURIComponent(id)}`;
      } else {
        window.location.hash = "#/tracking";
      }
    }
  }

  function bindGlobalEvents() {
    document.addEventListener("click", event => {
      const open = event.target.closest("[data-guide-open]");
      if (open) {
        state.enabled = true;
        state.minimized = false;
        write("enabled", "on");
        renderPanel();
        return;
      }
      if (event.target.closest("[data-guide-minimize]")) {
        state.minimized = true;
        clearHighlight();
        renderPanel();
        return;
      }
      if (event.target.closest("[data-guide-toggle]")) {
        state.enabled = false;
        state.minimized = true;
        write("enabled", "off");
        clearHighlight();
        renderPanel();
        return;
      }
      const action = event.target.closest("[data-guide-action]");
      if (action) {
        handleGuideAction(action);
        return;
      }
      if (event.target.closest("[data-guide-welcome-start]")) {
        closeWelcome(true);
        markStep("welcome");
        window.location.hash = "#/discover";
        return;
      }
      if (event.target.closest("[data-guide-welcome-tour]")) {
        closeWelcome(true);
        markStep("welcome");
        window.location.hash = "#/beta-start";
        return;
      }
      if (event.target.closest("[data-discovery-evaluate]")) markStep("discover");
      const routeLink = event.target.closest('[href^="#/tracking"]');
      if (routeLink) markStep("understand");
    }, true);

    document.addEventListener("submit", event => {
      if (event.target.matches("[data-customer-discovery-form]")) markStep("discover");
      if (event.target.matches("[data-staging-evaluation-form]")) markStep("evaluate");
    }, true);

    window.addEventListener("hashchange", () => {
      clearHighlight();
      if (routeName() === "opportunities" && routeParts().length > 1) markStep("evaluate");
      if (routeName() === "tracking") markStep("track");
      window.setTimeout(renderPanel, 60);
    });

    window.addEventListener("flipforge:identity-change", () => {
      syncSession();
      renderPanel();
      window.setTimeout(() => showWelcome(false), 120);
    });
  }

  function observeMain() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    const observer = new MutationObserver(() => {
      if (state.observerQueued) return;
      state.observerQueued = true;
      window.requestAnimationFrame(() => {
        state.observerQueued = false;
        renderPanel();
      });
    });
    observer.observe(main, { childList: true, subtree: true });
  }

  function addGuideToGettingStarted() {
    const main = document.querySelector("#main-content");
    if (!main || routeName() !== "beta-start") return;
    const actions = main.querySelector(".page-heading .page-actions");
    if (!actions || actions.querySelector("[data-guide-reset]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.dataset.guideReset = "";
    button.textContent = "Restart guided tour";
    button.addEventListener("click", resetGuide);
    actions.appendChild(button);
  }

  function init() {
    if (!eligibleHost() || state.mounted) return;
    state.mounted = true;
    bindGlobalEvents();
    observeMain();
    syncSession();
    renderPanel();

    const main = document.querySelector("#main-content");
    if (main) {
      new MutationObserver(addGuideToGettingStarted).observe(main, { childList: true, subtree: true });
      addGuideToGettingStarted();
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const session = syncSession();
      renderPanel();
      if (session.authenticated && session.membershipActive) {
        window.clearInterval(timer);
        window.setTimeout(() => showWelcome(false), 180);
      } else if (attempts > 50) {
        window.clearInterval(timer);
      }
    }, 120);
  }

  window.FlipForgeGuidedMode = Object.freeze({
    open: () => { state.enabled = true; state.minimized = false; write("enabled", "on"); renderPanel(); },
    restart: resetGuide,
    showWelcome: () => showWelcome(true),
    getProgress: () => ({ completed: [...stepState()], firstRunComplete: firstRunComplete() })
  });

  init();
})();
