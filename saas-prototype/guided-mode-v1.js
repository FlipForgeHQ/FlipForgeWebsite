(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const ROOT_ID = "ff-guided-mode-root";
  const MODAL_ID = "ff-guided-mode-welcome";
  const VERSION = "v3";

  const state = {
    accountKey: "anonymous",
    session: null,
    enabled: true,
    minimized: false,
    mounted: false,
    startingNewCard: false,
    pendingNewCard: false,
    observerTimer: 0,
    highlight: null
  };

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
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
      membershipActive: false,
      membershipConfigured: false
    };
  }

  function accountHash(value) {
    let hash = 2166136261;
    const text = String(value || "anonymous").trim().toLowerCase();
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
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

  function syncSession() {
    state.session = identitySnapshot();
    state.accountKey = accountHash(state.session.email || "anonymous");
    state.enabled = read("enabled", "on") !== "off";
    return state.session;
  }

  function stepState() {
    return new Set(read("steps", "").split(",").filter(Boolean));
  }

  function markStep(step) {
    if (!step) return;
    const steps = stepState();
    if (steps.has(step)) return;
    steps.add(step);
    write("steps", [...steps].join(","));
  }

  function firstRunComplete() {
    const steps = stepState();
    return ["discover", "evaluate", "understand", "track"].every(step => steps.has(step));
  }

  function discoverHasCandidates() {
    return Boolean(document.querySelector("#main-content .customer-discovery-candidate, #main-content [data-discovery-evaluate]"));
  }

  function discoverHasIdentityAssist() {
    return Boolean(document.querySelector("#main-content .customer-discovery-identity-assist"));
  }

  function currentRecommendation() {
    const main = document.querySelector("#main-content");
    if (!main) return "";
    const text = String(main.textContent || "");
    const match = text.match(/\b(BUY|WATCH|VERIFY|PASS)\b/i);
    return match ? match[1].toUpperCase() : "";
  }

  function clearHighlight() {
    if (state.highlight) {
      state.highlight.classList.remove("ff-guide-highlight");
      state.highlight.removeAttribute("data-guide-label");
    }
    document.querySelectorAll(".ff-guide-highlight,.ff-guide-input-focus").forEach(node => {
      node.classList.remove("ff-guide-highlight", "ff-guide-input-focus");
    });
    state.highlight = null;
  }

  function highlightNode(node, label = "Do this next") {
    clearHighlight();
    if (!node) return false;
    const target = node.matches?.("input,textarea,select,button,a")
      ? node.closest("section,article,form,.panel") || node
      : node;
    state.highlight = target;
    target.classList.add("ff-guide-highlight");
    target.dataset.guideLabel = label;
    try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) { target.scrollIntoView(); }
    window.setTimeout(() => {
      if (state.highlight === target) clearHighlight();
    }, 10000);
    return true;
  }

  function discoverInput() {
    return document.querySelector('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
  }

  function focusDiscoverInput(clear = false, attempt = 0) {
    if (window.FlipForgeDiscoverFocusFix) {
      if (clear) window.FlipForgeDiscoverFocusFix.startNew?.();
      else window.FlipForgeDiscoverFocusFix.show?.();
      return;
    }
    const input = discoverInput();
    if (!input) {
      if (attempt < 15) window.setTimeout(() => focusDiscoverInput(clear, attempt + 1), 100);
      return;
    }
    if (clear) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const target = input.form?.querySelector('[name="targetMaxBuy"]');
      if (target) target.value = "";
    }
    const panel = input.closest(".customer-discovery-search") || input.form || input;
    highlightNode(panel, clear ? "Enter your new card here" : "Enter the card here");
    input.classList.add("ff-guide-input-focus");
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  }

  function startNewCard(clear = true) {
    state.startingNewCard = true;
    state.pendingNewCard = routeName() !== "discover";
    if (routeName() !== "discover") {
      window.location.hash = "#/discover";
      renderPanel();
      return;
    }
    updateDiscoverCoach();
    focusDiscoverInput(clear);
    renderPanel();
  }

  function injectGlobalNewCardButton() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions || actions.querySelector("[data-ff-global-new-card]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-button ff-global-new-card";
    button.dataset.ffGlobalNewCard = "";
    button.innerHTML = '<span aria-hidden="true">＋</span> New card';
    actions.prepend(button);
  }

  function updateDiscoverCoach() {
    if (routeName() !== "discover") return;
    const main = document.querySelector("#main-content");
    const page = main?.querySelector(".customer-discovery-page");
    const search = page?.querySelector(".customer-discovery-search");
    if (!page || !search) return;

    const hasCandidates = discoverHasCandidates();
    const hasAssist = discoverHasIdentityAssist();
    let mode = "entry";
    if (!state.startingNewCard && hasCandidates) mode = "results";
    else if (!state.startingNewCard && hasAssist) mode = "identity";

    let coach = page.querySelector("[data-ff-discover-coach]");
    if (!coach) {
      coach = document.createElement("section");
      coach.className = "ff-discover-coach";
      coach.dataset.ffDiscoverCoach = "";
      const heading = page.querySelector(".page-heading");
      if (heading) heading.insertAdjacentElement("afterend", coach);
      else page.prepend(coach);
    }

    if (coach.dataset.mode !== mode) {
      coach.dataset.mode = mode;
      if (mode === "results") {
        coach.innerHTML = '<div><span>DISCOVER · SEARCH RESULTS</span><h2>These are marketplace results from your last search.</h2><p>Review the exact listing you mean, or start another card when you are finished.</p></div><div class="ff-discover-coach-actions"><button type="button" class="button button-primary" data-ff-new-card>+ Start a new card</button><button type="button" class="button button-secondary" data-ff-previous-results>Keep reviewing these results</button></div>';
      } else if (mode === "identity") {
        coach.innerHTML = '<div><span>IDENTITY CHECK</span><h2>FlipForge found possible card matches.</h2><p>Choose <strong>Use this card</strong> when available. If a visible match is still review-only, choose <strong>Verify this match</strong> so FlipForge can retry with the exact details shown.</p></div><div class="ff-discover-coach-actions"><button type="button" class="button button-secondary" data-ff-focus-card>Change what I entered</button></div>';
      } else {
        coach.innerHTML = '<div><span>START HERE</span><h2>Enter one exact card.</h2><p>Type the card you want to evaluate in the Card identity box. Start with year, set, player and card number.</p></div><div class="ff-discover-coach-actions"><button type="button" class="button button-primary" data-ff-focus-card>Show me the card box</button></div>';
      }
    }

    if (search.previousElementSibling !== coach) coach.insertAdjacentElement("afterend", search);
    page.classList.toggle("ff-start-new-card", state.startingNewCard);
  }

  function genericTarget(route, phase = "") {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    if (route === "discover") {
      if (phase === "candidate") return main.querySelector(".customer-discovery-candidate, [data-discovery-evaluate]");
      if (phase === "identity") return main.querySelector(".customer-discovery-identity-assist");
      return main.querySelector(".customer-discovery-search, [data-customer-discovery-form]");
    }
    if (route === "evaluate") return main.querySelector("[data-staging-evaluation-form], .staging-evaluation-panel, .panel");
    if (route === "opportunities" && routeParts().length > 1) {
      const headings = [...main.querySelectorAll("h1,h2,h3,strong")];
      const heading = headings.find(node => /Decision Traceback|How to read this decision|Why FlipForge says this/i.test(String(node.textContent || "")));
      return heading?.closest("section,article,.panel") || main.querySelector(".customer-intelligence-hero, .hero-card, .panel");
    }
    if (route === "opportunities") return main.querySelector("table, .customer-opportunities-list, .staging-list, .panel");
    if (route === "tracking") return main.querySelector(".customer-lifecycle-page, .customer-management-page, .panel");
    return main.querySelector(".page-heading, .page > .panel, .panel");
  }

  function guideModel() {
    const route = routeName();
    const parts = routeParts();
    const complete = firstRunComplete();

    if (route === "dashboard") return {
      location: "Dashboard",
      title: complete ? "This is your decision overview." : "Start with one card.",
      copy: complete ? "Review saved decisions here, or start another card." : "You do not need to learn the whole dashboard first.",
      why: "One real card gives every other screen context.",
      action: { type: "new-card", label: complete ? "+ Start another card" : "Start my first card →" }
    };

    if (route === "discover") {
      if (state.startingNewCard) return {
        location: "Discover · Step 1",
        title: "Enter your card in the highlighted box.",
        copy: "Type the exact card, then choose Search connected sources.",
        why: "Every decision starts with the correct card identity.",
        action: { type: "focus-discover", label: "Take me to the card box" }
      };
      if (discoverHasIdentityAssist()) return {
        location: "Discover · Identity check",
        title: "Now confirm which card you mean.",
        copy: "Use a verified option if one is available. If the exact card is visible but says Review only, choose Verify this match.",
        why: "FlipForge will not silently select a similar card for you.",
        action: { type: "highlight", label: "Show me the card choices", phase: "identity" },
        secondary: { type: "focus-discover", label: "Change my card entry" }
      };
      if (discoverHasCandidates()) return {
        location: "Discover · Step 1",
        title: "Choose the exact listing you want evaluated.",
        copy: "These are active marketplace listings, not saved decisions.",
        why: "Evaluation starts only after you choose the listing you actually mean.",
        action: { type: "highlight", label: "Show me a listing to evaluate", phase: "candidate" },
        secondary: { type: "new-card", label: "+ Start a different card" }
      };
      return {
        location: "Discover · Step 1",
        title: "Enter one exact card.",
        copy: "Start with year, set, player and card number. Add parallel, grader and grade when known.",
        why: "Identity comes first. FlipForge should never judge the wrong card.",
        action: { type: "focus-discover", label: "Show me exactly where to enter it" }
      };
    }

    if (route === "evaluate") return {
      location: "Evaluate · Step 2",
      title: "Confirm the listing facts, then evaluate.",
      copy: "Review the exact card and all-in cost, then create the saved decision.",
      why: "Smart Opportunity creates the saved BUY, WATCH, VERIFY, or PASS result.",
      action: { type: "highlight", label: "Show me the evaluation area" },
      secondary: { type: "new-card", label: "+ Start a different card" }
    };

    if (route === "opportunities" && parts.length > 1) {
      markStep("evaluate");
      const recommendation = currentRecommendation() || "decision";
      const copy = {
        VERIFY: "VERIFY means FlipForge does not yet have enough trustworthy support for a stronger call.",
        WATCH: "WATCH means the card may be worth monitoring, but the current price or evidence does not support moving further yet.",
        PASS: "PASS means the current evidence and context do not support the opportunity.",
        BUY: "BUY is decision support only. Read the evidence and risk before acting outside FlipForge."
      }[recommendation] || "Start with the decision, then read why FlipForge reached it.";
      return {
        location: "Card Intelligence · Step 3",
        title: `Start here: ${recommendation}.`,
        copy,
        why: recommendation === "VERIFY" ? "Find what is missing before doing anything else." : "Understand the reason before moving on.",
        action: { type: "highlight", label: recommendation === "VERIFY" ? "Show me what is missing" : "Show me why" },
        secondary: { type: "understand", label: "I understand this decision →" },
        tertiary: { type: "new-card", label: "+ Start another card" }
      };
    }

    if (route === "opportunities") return {
      location: "Saved Decisions",
      title: "These are decisions you already saved.",
      copy: "Open one to review it, or start another card.",
      why: "Saved decisions are different from temporary Discover results.",
      action: { type: "highlight", label: "Show me my saved cards" },
      secondary: { type: "new-card", label: "+ Start another card" }
    };

    if (route === "tracking") {
      markStep("track");
      return {
        location: "Tracking · Step 4",
        title: firstRunComplete() ? "You completed the core FlipForge loop." : "This is where you follow a decision over time.",
        copy: "Tracking lets you return later and see what held, changed, or still needs evidence.",
        why: "Follow-up preserves the original reasoning instead of rewriting history.",
        action: firstRunComplete()
          ? { type: "new-card", label: "+ Start another card" }
          : { type: "highlight", label: "Show me the tracked decision" }
      };
    }

    if (route === "beta-start") return {
      location: "Getting Started",
      title: complete ? "Your first-card loop is complete." : "Start with one exact card.",
      copy: complete ? "Use New card whenever you want to begin again." : "Discover → Evaluate → Understand → Track.",
      why: "You do not need the advanced tools to complete your first decision.",
      action: { type: "new-card", label: complete ? "+ Start another card" : "Start my first card →" }
    };

    if (["forge-heat", "compare", "psa-advisor", "evidence", "sell", "export", "market-view", "portfolio", "alerts"].includes(route)) return {
      location: "Advanced workspace",
      title: complete ? "Use this when it helps the decision." : "You do not need this screen for your first card.",
      copy: complete ? "This is supporting analysis." : "Finish Discover → Evaluate → Understand → Track first.",
      why: "Complexity should appear only when it becomes useful.",
      action: complete ? { type: "navigate", href: "#/opportunities", label: "Return to saved decisions →" } : { type: "new-card", label: "Return to my first card →" }
    };

    return {
      location: "FlipForge Guide",
      title: "I’ll keep you on the decision path.",
      copy: "The core loop is Discover → Evaluate → Understand → Track.",
      why: "When in doubt, start with one exact card.",
      action: { type: "new-card", label: "+ Start a card" }
    };
  }

  function progressMarkup() {
    const steps = stepState();
    const order = ["discover", "evaluate", "understand", "track"];
    const completed = order.filter(step => steps.has(step)).length;
    const current = Math.min(completed, 3);
    return `<div class="ff-guide-progress"><div class="ff-guide-progress-top"><span>First-card path</span><span>${completed} / 4 complete</span></div><div class="ff-guide-track">${order.map((step,index)=>`<span data-done="${steps.has(step)}" data-current="${!steps.has(step) && index===current}"></span>`).join("")}</div></div>`;
  }

  function buttonMarkup(action, secondary = false) {
    if (!action) return "";
    return `<button type="button" class="ff-guide-action${secondary ? " secondary" : ""}" data-guide-action="${action.type}"${action.href ? ` data-guide-href="${action.href}"` : ""}${action.phase ? ` data-guide-phase="${action.phase}"` : ""}>${action.label}</button>`;
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
    injectGlobalNewCardButton();

    let markup = "";
    if (session.authenticated && session.membershipActive) {
      if (!state.enabled || state.minimized) {
        markup = '<button type="button" class="ff-guide-launcher" data-guide-open>Guide me</button>';
      } else {
        const model = guideModel();
        markup = `<aside class="ff-guide-panel" aria-label="FlipForge Guided Mode"><div class="ff-guide-head"><div><span class="ff-guide-kicker">Guided Mode · On</span><strong>Your FlipForge guide</strong></div><button type="button" class="ff-guide-icon-button" data-guide-minimize aria-label="Minimize guide">−</button></div><div class="ff-guide-body"><span class="ff-guide-location">${model.location}</span><h2>${model.title}</h2><p>${model.copy}</p><div class="ff-guide-why"><strong>Why this matters:</strong> ${model.why}</div><div class="ff-guide-actions">${buttonMarkup(model.action)}${buttonMarkup(model.secondary,true)}${buttonMarkup(model.tertiary,true)}</div></div>${progressMarkup()}<div class="ff-guide-footer"><span>Decision support only · No transaction authority</span><button type="button" data-guide-toggle>Turn Guided Mode off</button></div></aside>`;
      }
    }
    if (node.innerHTML !== markup) node.innerHTML = markup;
  }

  function welcomeSeen() {
    return read("welcome", "") === "seen";
  }

  function showWelcome(force = false) {
    const session = syncSession();
    if (!session.authenticated || !session.membershipActive) return;
    if (!force && welcomeSeen()) return;
    if (document.getElementById(MODAL_ID)) return;
    const wrapper = document.createElement("div");
    wrapper.id = MODAL_ID;
    wrapper.className = "ff-guide-modal-backdrop";
    wrapper.innerHTML = '<section class="ff-guide-modal" role="dialog" aria-modal="true" aria-labelledby="ff-guide-welcome-title"><div class="ff-guide-modal-main"><span class="ff-guide-kicker">Welcome to FlipForge Private Beta</span><h1 id="ff-guide-welcome-title">I’ll walk you through your first card.</h1><p class="ff-guide-intro">You do not need to learn every screen. Start with one exact card and I’ll tell you what to look at, why it matters, and what to do next.</p><div class="ff-guide-modal-steps"><article class="ff-guide-modal-step"><span>01 · Discover</span><strong>Enter the card.</strong><p>I’ll take you directly to the card box.</p></article><article class="ff-guide-modal-step"><span>02 · Evaluate</span><strong>Choose the exact listing.</strong><p>Review the identity, then create the saved decision.</p></article><article class="ff-guide-modal-step"><span>03 · Understand & Track</span><strong>Know why—then preserve it.</strong><p>Read the reason first, then track it over time.</p></article></div><div class="ff-guide-modal-actions"><button type="button" class="ff-guide-action" data-guide-welcome-start>Start my first card →</button><button type="button" class="ff-guide-action secondary" data-guide-welcome-tour>Show me Getting Started</button></div></div></section>';
    document.body.appendChild(wrapper);
    document.body.classList.add("ff-guide-modal-open");
    wrapper.querySelector("[data-guide-welcome-start]")?.focus();
  }

  function closeWelcome(markSeen = true) {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove("ff-guide-modal-open");
    if (markSeen) write("welcome", "seen");
    renderPanel();
  }

  function resetGuide() {
    ["welcome", "steps", "enabled"].forEach(remove);
    state.enabled = true;
    state.minimized = false;
    state.startingNewCard = false;
    state.pendingNewCard = false;
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
    if (type === "new-card") {
      startNewCard(true);
      return;
    }
    if (type === "focus-discover") {
      focusDiscoverInput(false);
      return;
    }
    if (type === "highlight") {
      const target = genericTarget(routeName(), button.dataset.guidePhase || "");
      if (!highlightNode(target) && routeName() === "discover") focusDiscoverInput(false);
      return;
    }
    if (type === "understand") {
      markStep("understand");
      renderPanel();
      const id = routeParts().length > 1 ? routeParts()[1] : "";
      const track = document.querySelector('#main-content a[href^="#/tracking"]');
      if (track) highlightNode(track, "Track this decision next");
      else window.location.hash = id ? `#/tracking/${encodeURIComponent(id)}` : "#/tracking";
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(() => {
      updateDiscoverCoach();
      injectGlobalNewCardButton();
      renderPanel();
    }, 80);
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      if (event.target.closest("[data-ff-global-new-card],[data-ff-new-card]")) {
        startNewCard(true);
        return;
      }
      if (event.target.closest("[data-ff-focus-card]")) {
        focusDiscoverInput(false);
        return;
      }
      if (event.target.closest("[data-ff-previous-results]")) {
        state.startingNewCard = false;
        updateDiscoverCoach();
        const first = document.querySelector("#main-content .customer-discovery-candidate");
        if (first) highlightNode(first, "Marketplace result");
        renderPanel();
        return;
      }
      if (event.target.closest("[data-guide-open]")) {
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
        startNewCard(true);
        return;
      }
      if (event.target.closest("[data-guide-welcome-tour]")) {
        closeWelcome(true);
        window.location.hash = "#/beta-start";
        return;
      }
      if (event.target.closest("[data-discovery-evaluate]")) markStep("discover");
      if (event.target.closest('[href^="#/tracking"]')) markStep("understand");
    }, true);

    document.addEventListener("submit", event => {
      if (event.target.matches("[data-customer-discovery-form]")) {
        markStep("discover");
        state.startingNewCard = false;
        state.pendingNewCard = false;
        renderPanel();
      }
      if (event.target.matches("[data-staging-evaluation-form]")) markStep("evaluate");
    }, true);

    window.addEventListener("hashchange", () => {
      clearHighlight();
      if (routeName() === "opportunities" && routeParts().length > 1) markStep("evaluate");
      if (routeName() === "tracking") markStep("track");
      window.setTimeout(() => {
        updateDiscoverCoach();
        renderPanel();
        if (state.pendingNewCard && routeName() === "discover") {
          state.pendingNewCard = false;
          window.setTimeout(() => focusDiscoverInput(true), 120);
        }
      }, 100);
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
    new MutationObserver(scheduleRefresh).observe(main, { childList: true, subtree: true });
  }

  function init() {
    if (!eligibleHost() || state.mounted) return;
    state.mounted = true;
    bindEvents();
    observeMain();
    syncSession();
    injectGlobalNewCardButton();
    updateDiscoverCoach();
    renderPanel();

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
    }, 150);
  }

  window.FlipForgeGuidedMode = Object.freeze({
    open: () => { state.enabled = true; state.minimized = false; write("enabled", "on"); renderPanel(); },
    restart: resetGuide,
    showWelcome: () => showWelcome(true),
    startNewCard: () => startNewCard(true),
    getProgress: () => ({ completed: [...stepState()], firstRunComplete: firstRunComplete() })
  });

  init();
})();