(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const ROOT_ID = "ff-guided-mode-root";
  const VERSION = "v3";

  const state = {
    accountKey: "anonymous",
    session: null,
    enabled: true,
    minimized: false,
    userOpened: false,
    mounted: false,
    observerTimer: 0,
    highlight: null
  };

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function privateBetaSurface() {
    const path = String(window.location.pathname || "");
    return APP_PATH.test(path) && !/^\/(?:app|owner)\/customer(?:\/|$)/i.test(path);
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

  // A customer who already has saved decisions is not a first-time user, whatever the
  // locally stored step progress says. On the Dashboard, show the compact "Guide me"
  // launcher instead of a panel that covers the decision and says "Start with one card".
  // Uses only the server-reported Tracked Decisions count rendered by the Dashboard.
  function dashboardHasSavedDecisions() {
    if (routeName() !== "dashboard") return false;
    const v3 = document.querySelector("#main-content [data-decision-dashboard-v3][data-ffv3-tracked]");
    if (v3) return Number(v3.getAttribute("data-ffv3-tracked")) > 0;
    const cards = [...document.querySelectorAll("#main-content .ff-kpi-card")];
    const card = cards.find(node => /Tracked Decisions/i.test(String(node.textContent || "")));
    const value = String(card?.querySelector(".ff-kpi-value")?.textContent || "").replace(/[^0-9]/g, "");
    return value !== "" && Number(value) > 0;
  }

  // Dashboard V3 suppresses the floating "Guide me" launcher (Visual Lock V1 §5.4) so it never
  // covers the decision. Uses V3's own activation state: the renderer claim, the kill switch and
  // the rendered V3 root. V2, the kill-switch fallback and every other route keep the launcher.
  function dashboardV3Active() {
    return routeName() === "dashboard" && window.FlipForgeDashboardRenderer === "v3" && !window.FlipForgeDashboardV3Disabled
      && Boolean(document.querySelector("#main-content [data-decision-dashboard-v3]"));
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

  // The saved verdict from the Card Intelligence hero only (rendered from the saved record, absent while loading).
  // Never page text: legends name every verdict. Unknown keeps the neutral "Start with the decision" copy.
  function currentRecommendation() {
    const hero = document.querySelector("#main-content .customer-intelligence-hero");
    if (!hero) return "";
    for (const node of hero.querySelectorAll(".staging-status,[data-recommendation]")) {
      const value = String(node.textContent || "").trim().toUpperCase();
      if (["BUY", "WATCH", "VERIFY", "PASS"].includes(value)) return value;
    }
    return "";
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

  // A control the customer can actually use: never a hidden element, a file picker or something with no size (the
  // Bulk CSV panel's hidden <input type=file> was highlighted instead of the manual evaluation form).
  function usableControl(node) {
    if (!node || node.hidden || node.closest?.("[hidden]")) return false;
    if (String(node.getAttribute?.("type") || "").toLowerCase() === "file") return false;
    if (String(node.getAttribute?.("type") || "").toLowerCase() === "hidden") return false;
    const rect = node.getBoundingClientRect?.();
    if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    const style = window.getComputedStyle?.(node);
    return !(style && (style.display === "none" || style.visibility === "hidden"));
  }

  function highlightNode(node, label = "Do this next") {
    clearHighlight();
    if (!node) return false;
    const direct = node.matches?.("input,textarea,select,button,a[href]") && usableControl(node) ? node : null;
    const actionable = direct || [...(node.querySelectorAll?.(
      '[data-discovery-evaluate]:not([disabled]),[data-ff-show-why],[href^="#/tracking"],button.button-primary:not([disabled]),a.button-primary,input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href]'
    ) || [])].find(usableControl) || null;
    const target = actionable || node;
    state.highlight = target;
    target.classList.add("ff-guide-highlight");
    target.dataset.guideLabel = label;
    try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) { target.scrollIntoView(); }
    window.setTimeout(() => {
      if (state.highlight === target) clearHighlight();
    }, 8000);
    return true;
  }

  // Discover owns its card box: clearing it for a new card, focusing it and its focus cue are customer-discovery.js.
  function focusDiscoverInput(clear = false) {
    const discovery = window.FlipForgeCustomerDiscovery;
    if (clear) discovery?.startNewCard?.();
    else discovery?.focusCardEntry?.();
  }

  function startNewCard() {
    focusDiscoverInput(true);
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

  function genericTarget(route, phase = "") {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    if (route === "discover") {
      if (phase === "candidate") return main.querySelector(".customer-discovery-candidate, [data-discovery-evaluate]");
      if (phase === "identity") return main.querySelector(".customer-discovery-identity-assist");
      return main.querySelector(".customer-discovery-search, [data-customer-discovery-form]");
    }
    // The manual evaluation form first, then its panel, then any panel; one query at a time so document order cannot
    // pick the Bulk CSV panel that comes before it.
    if (route === "evaluate") {
      return main.querySelector("[data-staging-evaluation-form]")
        || main.querySelector(".staging-evaluation-panel")
        || main.querySelector(".panel");
    }
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
      const known = currentRecommendation();
      const recommendation = known || "decision";
      const copy = {
        VERIFY: "VERIFY means FlipForge does not yet have enough matching evidence for a stronger call.",
        WATCH: "WATCH means the card may be worth monitoring, but the current price or evidence does not support moving further yet.",
        PASS: "PASS means the current evidence and context do not support the opportunity.",
        BUY: "BUY is decision support only. Read the evidence and risk before acting outside FlipForge."
      }[recommendation] || "Start with the decision, then read why FlipForge reached it.";
      return {
        location: "Card Intelligence · Step 3",
        title: known ? `Start here: ${recommendation}.` : "Loading your saved decision.",
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

  function currentGuideStep() {
    const route = routeName();
    const parts = routeParts();
    if (route === "discover") return "discover";
    if (route === "evaluate") return "evaluate";
    if (route === "opportunities" && parts.length > 1) return "understand";
    if (route === "opportunities") return "understand";
    if (route === "tracking") return "track";
    return "";
  }

  function rememberDecisionFromRoute() {
    const parts = routeParts();
    if ((parts[0] === "opportunities" || parts[0] === "tracking") && parts[1]) {
      write("lastDecisionId", parts[1]);
      return parts[1];
    }
    return read("lastDecisionId", "");
  }

  function guideStepHref(step) {
    const id = rememberDecisionFromRoute();
    if (step === "discover") return "#/discover";
    if (step === "evaluate") return "#/discover";
    if (step === "understand") return id ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities";
    if (step === "track") return id ? `#/tracking/${encodeURIComponent(id)}` : "#/tracking";
    return "#/dashboard";
  }

  function goToGuideStep(step) {
    if (step === "discover") {
      if (routeName() === "discover") focusDiscoverInput(false);
      else window.location.hash = "#/discover";
      return;
    }
    if (step === "evaluate") {
      if (routeName() !== "discover") {
        window.location.hash = "#/discover";
        window.setTimeout(() => {
          const target = genericTarget("discover", discoverHasCandidates() ? "candidate" : "");
          if (!highlightNode(target, discoverHasCandidates() ? "Evaluate this listing" : "Enter the card first")) focusDiscoverInput(false);
        }, 180);
        return;
      }
      const target = genericTarget("discover", discoverHasCandidates() ? "candidate" : discoverHasIdentityAssist() ? "identity" : "");
      if (!highlightNode(target, discoverHasCandidates() ? "Evaluate this listing" : discoverHasIdentityAssist() ? "Confirm the exact card" : "Enter the card first")) {
        focusDiscoverInput(false);
      }
      return;
    }
    window.location.hash = guideStepHref(step);
  }

  function guideNavModel() {
    const route = routeName();
    const parts = routeParts();
    const id = rememberDecisionFromRoute();

    if (route === "dashboard" || route === "beta-start") {
      return { back: null, next: { type: "new-card", label: "Next: choose a card →" } };
    }
    if (route === "discover") {
      if (discoverHasCandidates()) {
        return {
          back: { type: "navigate", href: "#/dashboard", label: "← Back" },
          next: { type: "guide-step", step: "evaluate", label: "Next: evaluate listing →" }
        };
      }
      if (discoverHasIdentityAssist()) {
        return {
          back: { type: "navigate", href: "#/dashboard", label: "← Back" },
          next: { type: "guide-step", step: "evaluate", label: "Next: confirm card →" }
        };
      }
      return {
        back: { type: "navigate", href: "#/dashboard", label: "← Back" },
        next: { type: "focus-discover", label: "Next: enter the card →" }
      };
    }
    if (route === "evaluate") {
      return {
        back: { type: "navigate", href: "#/discover", label: "← Back to card" },
        next: { type: "highlight", label: "Next: complete evaluation →" }
      };
    }
    if (route === "opportunities" && parts.length > 1) {
      return {
        back: { type: "navigate", href: "#/opportunities", label: "← Saved decisions" },
        next: { type: "understand", label: "Next: track this card →" }
      };
    }
    if (route === "opportunities") {
      return {
        back: { type: "navigate", href: "#/discover", label: "← Back to card" },
        next: id
          ? { type: "navigate", href: `#/opportunities/${encodeURIComponent(id)}`, label: "Next: open last decision →" }
          : { type: "highlight", label: "Next: open a saved decision →" }
      };
    }
    if (route === "tracking") {
      return {
        back: { type: "navigate", href: id ? `#/opportunities/${encodeURIComponent(id)}` : "#/opportunities", label: "← Back to decision" },
        next: { type: "new-card", label: "Next: evaluate another card →" }
      };
    }
    return {
      back: { type: "navigate", href: "#/opportunities", label: "← Saved decisions" },
      next: { type: "navigate", href: "#/discover", label: "Next: evaluate a card →" }
    };
  }

  function progressMarkup() {
    const steps = stepState();
    const order = [
      ["discover", "1", "Card"],
      ["evaluate", "2", "Evaluate"],
      ["understand", "3", "Why"],
      ["track", "4", "Track"]
    ];
    const completed = order.filter(([step]) => steps.has(step)).length;
    const current = currentGuideStep();
    return `<div class="ff-guide-progress"><div class="ff-guide-progress-top"><span>First-card path</span><span>${completed} / 4 complete</span></div><div class="ff-guide-step-nav" role="navigation" aria-label="Guided Mode steps">${order.map(([step,number,label])=>`<button type="button" data-guide-step="${step}" data-done="${steps.has(step)}" data-current="${current===step}" aria-current="${current===step ? "step" : "false"}" aria-label="Step ${number} of ${order.length}: ${label}${steps.has(step) ? " (done)" : current === step ? " (current)" : ""}"><span>${number}</span><strong>${label}</strong></button>`).join("")}</div></div>`;
  }

  function guideNavMarkup() {
    const nav = guideNavModel();
    return `<div class="ff-guide-route-nav">${nav.back ? buttonMarkup(nav.back,true) : '<span></span>'}${nav.next ? buttonMarkup(nav.next) : ""}</div>`;
  }

  function buttonMarkup(action, secondary = false) {
    if (!action) return "";
    return `<button type="button" class="ff-guide-action${secondary ? " secondary" : ""}" data-guide-action="${action.type}"${action.href ? ` data-guide-href="${action.href}"` : ""}${action.phase ? ` data-guide-phase="${action.phase}"` : ""}${action.step ? ` data-guide-step="${action.step}"` : ""}>${action.label}</button>`;
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
      if (!state.enabled || state.minimized || (!state.userOpened && dashboardHasSavedDecisions())) {
        markup = dashboardV3Active() ? "" : '<button type="button" class="ff-guide-launcher" data-guide-open>Guide me</button>';
      } else {
        const model = guideModel();
        markup = `<aside class="ff-guide-panel" aria-label="FlipForge Guided Mode"><div class="ff-guide-head"><div><span class="ff-guide-kicker">Guided Mode · On</span><strong>Your FlipForge guide</strong></div><div class="ff-guide-head-actions"><button type="button" class="ff-guide-icon-button" data-guide-minimize aria-label="Minimize guide" title="Minimize">−</button><button type="button" class="ff-guide-icon-button ff-guide-close" data-guide-toggle aria-label="Close guide (turns Guided Mode off)" title="Close">×</button></div></div>${progressMarkup()}<div class="ff-guide-body"><span class="ff-guide-location">${model.location}</span><h2>${model.title}</h2><p>${model.copy}</p><div class="ff-guide-why"><strong>Why this matters:</strong> ${model.why}</div><div class="ff-guide-actions">${buttonMarkup(model.action)}${buttonMarkup(model.secondary,true)}${buttonMarkup(model.tertiary,true)}</div></div>${guideNavMarkup()}<div class="ff-guide-footer"><span>Decision support only · No transaction authority</span></div></aside>`;
      }
    }
    if (node.innerHTML !== markup) node.innerHTML = markup;
  }

  function resetGuide() {
    ["welcome", "steps", "enabled"].forEach(remove);
    state.enabled = true;
    state.minimized = false;
    clearHighlight();
    renderPanel();
  }

  function handleGuideAction(button) {
    const type = button.dataset.guideAction;
    if (type === "navigate") {
      const href = button.dataset.guideHref;
      if (href) window.location.hash = href.replace(/^#/, "");
      return;
    }
    if (type === "guide-step") {
      goToGuideStep(button.dataset.guideStep || "");
      return;
    }
    if (type === "new-card") {
      startNewCard();
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

  // Debounced refresh with a ceiling. Other enhancements keep mutating #main-content
  // for several seconds after a route renders; a pure 80ms debounce kept restarting and
  // left the guide stale for ~5s (e.g. the full panel covering a returning customer's
  // Dashboard on mobile). Refresh at most REFRESH_MAX_WAIT_MS after the first pending
  // mutation; later mutations still schedule a trailing refresh.
  const REFRESH_DEBOUNCE_MS = 80;
  const REFRESH_MAX_WAIT_MS = 250;
  function scheduleRefresh() {
    const now = Date.now();
    if (state.observerTimer && now - state.observerFirstPending >= REFRESH_MAX_WAIT_MS) return;
    if (!state.observerTimer) state.observerFirstPending = now;
    window.clearTimeout(state.observerTimer);
    const elapsed = now - state.observerFirstPending;
    state.observerTimer = window.setTimeout(() => {
      state.observerTimer = null;
      injectGlobalNewCardButton();
      renderPanel();
    }, Math.max(0, Math.min(REFRESH_DEBOUNCE_MS, REFRESH_MAX_WAIT_MS - elapsed)));
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      // "+ Start a new card", "New card" and "Focus card entry" are Discover actions (customer-discovery.js).
      if (event.target.closest("[data-guide-open]")) {
        state.enabled = true;
        state.minimized = false;
        state.userOpened = true;
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
      const step = event.target.closest("[data-guide-step]");
      if (step) {
        goToGuideStep(step.dataset.guideStep || "");
        return;
      }
      const action = event.target.closest("[data-guide-action]");
      if (action) {
        handleGuideAction(action);
        return;
      }
      if (event.target.closest("[data-discovery-evaluate]")) markStep("discover");
      if (event.target.closest('[href^="#/tracking"]')) markStep("understand");
    }, true);

    document.addEventListener("submit", event => {
      if (event.target.matches("[data-customer-discovery-form]")) {
        markStep("discover");
        renderPanel();
      }
      if (event.target.matches("[data-staging-evaluation-form]")) markStep("evaluate");
    }, true);

    window.addEventListener("hashchange", () => {
      clearHighlight();
      if (routeName() === "opportunities" && routeParts().length > 1) markStep("evaluate");
      if (routeName() === "tracking") markStep("track");
      window.setTimeout(renderPanel, 100);
    });

    window.addEventListener("flipforge:identity-change", () => {
      syncSession();
      renderPanel();
    });
  }

  // The panel title names the saved verdict ("Start here: WATCH."). It must change in the same frame as the card on the
  // page, not after the refresh debounce: when a customer switches cards the previous verdict otherwise stays on screen
  // for ~100 ms over a loading page or a different card. Mutation callbacks run before the next paint.
  function syncVerdictNow() {
    const title = document.querySelector(`#${ROOT_ID} .ff-guide-panel h2`);
    if (!title) return;
    const shown = (String(title.textContent || "").match(/Start here:\s*(BUY|WATCH|VERIFY|PASS)\b/i) || [])[1]?.toUpperCase() || "";
    const expected = routeName() === "opportunities" && routeParts().length > 1 ? currentRecommendation() : "";
    if (shown && shown !== expected) renderPanel();
  }

  function observeMain() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    new MutationObserver(() => {
      syncVerdictNow();
      scheduleRefresh();
    }).observe(main, { childList: true, subtree: true });
  }

  // Phones start with the guide minimized to its launcher so the card box, Search listings, Check card identity and
  // the main navigation stay visible. Tapping "Guide me" opens the full guide. Desktop and tablet are unchanged.
  function phoneViewport() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
    } catch (_) {
      return false;
    }
  }

  function init() {
    if (!eligibleHost() || state.mounted) return;
    state.mounted = true;
    if ((phoneViewport() || privateBetaSurface()) && !state.userOpened) state.minimized = true;
    bindEvents();
    observeMain();
    syncSession();
    injectGlobalNewCardButton();
    renderPanel();

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const session = syncSession();
      renderPanel();
      if (session.authenticated && session.membershipActive) {
        window.clearInterval(timer);
      } else if (attempts > 50) {
        window.clearInterval(timer);
      }
    }, 150);
  }

  window.FlipForgeGuidedMode = Object.freeze({
    open: () => { state.enabled = true; state.minimized = false; state.userOpened = true; write("enabled", "on"); renderPanel(); },
    restart: resetGuide,
    startNewCard: () => startNewCard(),
    getProgress: () => ({ completed: [...stepState()], firstRunComplete: firstRunComplete() })
  });

  init();
})();