(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const ROOT_ID = "ff-guided-mode-root";
  const MODAL_ID = "ff-guided-mode-welcome";
  const VERSION = "v2";

  const state = {
    session: null,
    accountKey: "anonymous",
    enabled: true,
    minimized: false,
    mounted: false,
    observerQueued: false,
    highlight: null,
    startingNewCard: false,
    pendingNewCard: false
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
    return new Set(read("steps", "").split(",").filter(Boolean));
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
    const selectors = [
      ".customer-intelligence-hero .status-pill",
      ".customer-intelligence-hero [data-recommendation]",
      ".hero-card .status-pill",
      ".status-pill"
    ];
    for (const selector of selectors) {
      const text = main.querySelector(selector)?.textContent?.trim().toUpperCase();
      if (["BUY", "WATCH", "VERIFY", "PASS"].includes(text)) return text;
    }
    const match = (main.textContent || "").match(/\b(BUY|WATCH|VERIFY|PASS)\b/i);
    return match ? match[1].toUpperCase() : "";
  }

  function discoverHasCandidates() {
    return Boolean(document.querySelector("#main-content .customer-discovery-candidate, #main-content [data-discovery-evaluate]"));
  }

  function discoverInput() {
    return document.querySelector('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
  }

  function clearHighlight() {
    if (state.highlight) state.highlight.classList.remove("ff-guide-highlight");
    document.querySelectorAll(".ff-guide-highlight,.ff-guide-input-focus").forEach(node => {
      node.classList.remove("ff-guide-highlight");
      node.classList.remove("ff-guide-input-focus");
    });
    state.highlight = null;
  }

  function highlightNode(node, label = "Do this next") {
    clearHighlight();
    if (!node) return false;
    const target = node.matches("input,textarea,select,button,a")
      ? node.closest("section,article,form,.panel") || node
      : node;
    state.highlight = target;
    target.classList.add("ff-guide-highlight");
    target.dataset.guideLabel = label;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      if (state.highlight === target) clearHighlight();
    }, 10000);
    return true;
  }

  function focusDiscoverInput({ clear = false, attempt = 0 } = {}) {
    const input = discoverInput();
    if (!input) {
      if (attempt < 12) window.setTimeout(() => focusDiscoverInput({ clear, attempt: attempt + 1 }), 100);
      return;
    }
    const page = input.closest(".customer-discovery-page");
    if (page && clear) page.classList.add("ff-start-new-card");
    if (clear) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const target = input.form?.querySelector('[name="targetMaxBuy"]');
      if (target) target.value = "";
    }
    const panel = input.closest(".customer-discovery-search") || input.form || input;
    highlightNode(panel, clear ? "Enter your new card here" : "Enter the card here");
    input.classList.add("ff-guide-input-focus");
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => input.focus({ preventScroll: true }), 250);
  }

  function startNewCard(clear = true) {
    state.startingNewCard = true;
    if (routeName() !== "discover") {
      state.pendingNewCard = true;
      window.location.hash = "#/discover";
      return;
    }
    state.pendingNewCard = false;
    decorateDiscover();
    focusDiscoverInput({ clear });
  }

  function scrollToPreviousResults() {
    const first = document.querySelector("#main-content .customer-discovery-candidate");
    if (first) highlightNode(first, "Marketplace result");
  }

  function decorateDiscover() {
    if (routeName() !== "discover") return;
    const main = document.querySelector("#main-content");
    const page = main?.querySelector(".customer-discovery-page");
    const search = page?.querySelector(".customer-discovery-search");
    if (!page || !search) return;

    let coach = page.querySelector("[data-ff-discover-coach]");
    if (!coach) {
      coach = document.createElement("section");
      coach.className = "ff-discover-coach";
      coach.dataset.ffDiscoverCoach = "";
      const heading = page.querySelector(".page-heading");
      if (heading) heading.insertAdjacentElement("afterend", coach);
      else page.prepend(coach);
    }

    const hasCandidates = discoverHasCandidates();
    const newCard = state.startingNewCard || page.classList.contains("ff-start-new-card");
    coach.innerHTML = hasCandidates && !newCard
      ? `<div><span>DISCOVER · SEARCH RESULTS</span><h2>These cards are marketplace results from your last search.</h2><p>They are not cards already saved to your account. To enter a different card, start a new card search below.</p></div><div class="ff-discover-coach-actions"><button type="button" class="button button-primary" data-ff-new-card>+ Start a new card</button><button type="button" class="button button-secondary" data-ff-previous-results>Keep reviewing these results</button></div>`
      : `<div><span>START HERE</span><h2>Enter one exact card.</h2><p>Type the card you want to evaluate in the Card identity box. Include the year, set, player, card number, parallel or insert, grader, and grade when you know them.</p></div><div class="ff-discover-coach-actions"><button type="button" class="button button-primary" data-ff-focus-card>Show me the card box</button></div>`;

    if (search.previousElementSibling !== coach) coach.insertAdjacentElement("afterend", search);

    const oldLabel = page.querySelector("[data-ff-results-label]");
    oldLabel?.remove();
    const firstCandidate = page.querySelector(".customer-discovery-candidate");
    if (firstCandidate && !newCard) {
      const label = document.createElement("div");
      label.className = "ff-discover-results-label";
      label.dataset.ffResultsLabel = "";
      label.innerHTML = `<strong>Marketplace results</strong><span>These are active listings returned for the card above. Review the identity before evaluating one.</span>`;
      firstCandidate.insertAdjacentElement("beforebegin", label);
    }

    if (newCard) page.classList.add("ff-start-new-card");
    else page.classList.remove("ff-start-new-card");
  }

  function injectGlobalNewCardButton() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions || actions.querySelector("[data-ff-global-new-card]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-button ff-global-new-card";
    button.dataset.ffGlobalNewCard = "";
    button.innerHTML = `<span aria-hidden="true">＋</span> New card`;
    actions.prepend(button);
  }

  function findHeadingSection(pattern) {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    const headings = [...main.querySelectorAll("h1,h2,h3,strong")];
    const heading = headings.find(node => pattern.test(String(node.textContent || "")));
    return heading?.closest("section,article,.panel,.customer-intelligence-section,.customer-intelligence-hero") || heading || null;
  }

  function genericTarget(route, phase = "") {
    const main = document.querySelector("#main-content");
    if (!main) return null;
    if (route === "discover") {
      if (phase === "candidate") return main.querySelector(".customer-discovery-candidate, [data-discovery-evaluate]");
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

  function navigationModel(href, label) {
    return { type: "navigate", href, label };
  }

  function actionModel(type, label, phase = "") {
    return { type, label, phase };
  }

  function guideModel() {
    const route = routeName();
    const parts = routeParts();
    const complete = firstRunComplete();

    if (route === "beta-start") return {
      location: "Getting Started",
      title: complete ? "Your first-card loop is complete." : "Start with one exact card.",
      copy: complete
        ? "You know the core path now. Use New card whenever you want to begin another decision."
        : "Your first goal is simple: find one exact card, evaluate it, understand the decision, and save it for follow-up.",
      why: complete ? "You can still reopen Guided Mode anytime." : "You do not need the advanced tools to complete your first decision.",
      action: actionModel("new-card", complete ? "Start another card →" : "Start my first card →"),
      secondary: complete ? navigationModel("#/dashboard", "Open Dashboard") : null
    };

    if (route === "dashboard") return {
      location: "Dashboard",
      title: complete ? "This is your decision overview." : "Start with a card—not the dashboard.",
      copy: complete
        ? "Use this screen to review saved decisions. Use New card when you want to evaluate something else."
        : "The dashboard makes more sense after you complete one card from start to finish.",
      why: "A real card gives every other screen context.",
      action: actionModel("new-card", complete ? "Start another card →" : "Start my first card →")
    };

    if (route === "discover") {
      if (state.startingNewCard) return {
        location: "Discover · Step 1",
        title: "Enter your new card in the box I highlighted.",
        copy: "Type the exact card you want to evaluate. Then choose Search connected sources.",
        why: "Every FlipForge decision starts by getting the card identity right.",
        action: actionModel("focus-discover", "Take me to the card box")
      };
      if (discoverHasCandidates()) return {
        location: "Discover · Step 1",
        title: "These are marketplace listings from your last card search.",
        copy: "They are not saved cards. Review a listing if you are still working on that card, or start a new card if you are finished.",
        why: "Discover can return several active listings for one card. Evaluation happens only after you choose the listing you actually mean.",
        action: actionModel("highlight", "Show me a listing to evaluate", "candidate"),
        secondary: actionModel("new-card", "+ Start a different card")
      };
      return {
        location: "Discover · Step 1",
        title: "Enter one exact card.",
        copy: "Use the Card identity box. Include year, set, player, card number, parallel or insert, grader, and grade when you know them.",
        why: "Identity comes first. FlipForge should never judge the wrong card.",
        action: actionModel("focus-discover", "Show me exactly where to enter it")
      };
    }

    if (route === "evaluate") return {
      location: "Evaluate · Step 2",
      title: "Confirm the listing facts, then evaluate.",
      copy: "Review the exact card identity, listing, and all-in acquisition cost. Then choose Evaluate and save.",
      why: "Smart Opportunity creates the saved BUY, WATCH, VERIFY, or PASS decision.",
      action: actionModel("highlight", "Show me the evaluation form"),
      secondary: actionModel("new-card", "Start a different card")
    };

    if (route === "opportunities" && parts.length > 1) {
      const recommendation = currentRecommendation() || "decision";
      markStep("evaluate");
      const recommendationCopy = {
        VERIFY: "VERIFY means FlipForge does not have enough trustworthy support yet for a stronger call.",
        WATCH: "WATCH means the card may be worth monitoring, but the current price or evidence does not support moving further yet.",
        PASS: "PASS means the current evidence and context do not support the opportunity.",
        BUY: "BUY is decision support, not transaction authority. Read the evidence and risk before acting outside FlipForge."
      }[recommendation] || "Start with the decision, then read why FlipForge reached it.";
      return {
        location: "Card Intelligence · Step 3",
        title: `Start here: ${recommendation}.`,
        copy: recommendationCopy,
        why: recommendation === "VERIFY"
          ? "Your next job is to understand what is missing—identity, exact sold evidence, or another required input."
          : "Your next job is to understand why this decision was reached before doing anything else.",
        action: actionModel("highlight", recommendation === "VERIFY" ? "Show me what is missing" : "Show me why"),
        secondary: actionModel("understand", "I understand this decision →"),
        tertiary: actionModel("new-card", "+ Start another card")
      };
    }

    if (route === "opportunities") return {
      location: "Opportunities",
      title: "These are decisions you've already saved.",
      copy: "Open one to review its reasoning, or start another card whenever you are ready.",
      why: "Saved decisions are different from the active marketplace listings shown in Discover.",
      action: actionModel("highlight", "Show me my saved cards"),
      secondary: actionModel("new-card", "+ Start another card")
    };

    if (route === "tracking") {
      markStep("track");
      return {
        location: "Tracking · Step 4",
        title: firstRunComplete() ? "You completed the core FlipForge loop." : "This is where the decision becomes useful over time.",
        copy: "Tracking preserves the decision so you can return later and see what held, changed, or still needs evidence.",
        why: "The 7 / 14 / 30-day checks preserve the original reasoning instead of rewriting history.",
        action: firstRunComplete() ? actionModel("new-card", "+ Start another card") : actionModel("highlight", "Show me the tracked decision"),
        secondary: firstRunComplete() ? navigationModel("#/dashboard", "Open Dashboard") : actionModel("new-card", "Start another card")
      };
    }

    if (["forge-heat", "compare", "psa-advisor", "evidence", "sell", "export", "market-view", "portfolio", "alerts"].includes(route)) return {
      location: "Advanced workspace",
      title: complete ? "Use this when it helps the decision." : "You don't need this screen for your first card.",
      copy: complete
        ? "This is supporting analysis. Start a new card anytime from the New card button at the top."
        : "Finish Discover → Evaluate → Understand → Track first.",
      why: "FlipForge should reveal complexity only when it becomes useful.",
      action: complete ? navigationModel("#/opportunities", "Return to saved decisions →") : actionModel("new-card", "Return to my first card →"),
      secondary: complete ? actionModel("new-card", "+ Start another card") : null
    };

    if (route === "account") return {
      location: "Account",
      title: "This screen manages access and usage—not card decisions.",
      copy: "Use New card when you want to evaluate another card.",
      why: "Keeping account administration separate makes the decision workflow easier to follow.",
      action: actionModel("new-card", "+ Start a card")
    };

    return {
      location: "FlipForge Guide",
      title: "I’ll keep you on the decision path.",
      copy: "The basic loop is Discover → Evaluate → Understand → Track.",
      why: "When in doubt, start with one exact card.",
      action: actionModel("new-card", "+ Start a card")
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
    injectGlobalNewCardButton();
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
      <div class="ff-guide-body"><span class="ff-guide-location">${model.location}</span><h2>${model.title}</h2><p>${model.copy}</p><div class="ff-guide-why"><strong>Why this matters:</strong> ${model.why}</div><div class="ff-guide-actions">${buttonMarkup(model.action)}${buttonMarkup(model.secondary,true)}${buttonMarkup(model.tertiary,true)}</div></div>
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
    const wrapper = document.createElement("div");
    wrapper.id = MODAL_ID;
    wrapper.className = "ff-guide-modal-backdrop";
    wrapper.innerHTML = `<section class="ff-guide-modal" role="dialog" aria-modal="true" aria-labelledby="ff-guide-welcome-title"><div class="ff-guide-modal-main"><span class="ff-guide-kicker">Welcome to FlipForge Private Beta</span><h1 id="ff-guide-welcome-title">I’ll walk you through your first card.</h1><p class="ff-guide-intro">You do not need to learn every screen. Start with one exact card and I’ll tell you what to look at, why it matters, and what to do next.</p><div class="ff-guide-modal-steps"><article class="ff-guide-modal-step"><span>01 · Discover</span><strong>Enter the card.</strong><p>I’ll take you directly to the card box and show you where to type.</p></article><article class="ff-guide-modal-step"><span>02 · Evaluate</span><strong>Choose the exact listing.</strong><p>Review the listing identity, then let Smart Opportunity create the saved decision.</p></article><article class="ff-guide-modal-step"><span>03 · Understand & Track</span><strong>Know why—then preserve it.</strong><p>Read the decision reason first, then track it if you want to follow it over time.</p></article></div><div class="ff-guide-modal-actions"><button type="button" class="ff-guide-action" data-guide-welcome-start>Start my first card →</button><button type="button" class="ff-guide-action secondary" data-guide-welcome-tour>Show me Getting Started</button></div><p class="ff-guide-modal-note">A permanent New card button stays in the top bar so you never have to figure out how to begin again.</p></div></section>`;
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
    ["welcome","steps","enabled"].forEach(remove);
    state.enabled = true;
    state.minimized = false;
    state.startingNewCard = false;
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
      focusDiscoverInput({ clear: false });
      return;
    }
    if (type === "highlight") {
      const target = genericTarget(routeName(), button.dataset.guidePhase || "");
      if (!highlightNode(target)) {
        if (routeName() === "discover") focusDiscoverInput({ clear: false });
      }
      return;
    }
    if (type === "understand") {
      markStep("understand");
      const id = routeParts().length > 1 ? routeParts()[1] : "";
      renderPanel();
      const track = document.querySelector('#main-content a[href^="#/tracking"]');
      if (track) highlightNode(track, "Track this decision next");
      else window.location.hash = id ? `#/tracking/${encodeURIComponent(id)}` : "#/tracking";
    }
  }

  function bindGlobalEvents() {
    document.addEventListener("click", event => {
      if (event.target.closest("[data-ff-global-new-card],[data-ff-new-card]")) {
        startNewCard(true);
        return;
      }
      if (event.target.closest("[data-ff-focus-card]")) {
        focusDiscoverInput({ clear: false });
        return;
      }
      if (event.target.closest("[data-ff-previous-results]")) {
        state.startingNewCard = false;
        document.querySelector("#main-content .customer-discovery-page")?.classList.remove("ff-start-new-card");
        decorateDiscover();
        scrollToPreviousResults();
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
        markStep("welcome");
        startNewCard(true);
        return;
      }
      if (event.target.closest("[data-guide-welcome-tour]")) {
        closeWelcome(true);
        markStep("welcome");
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
        document.querySelector("#main-content .customer-discovery-page")?.classList.remove("ff-start-new-card");
      }
      if (event.target.matches("[data-staging-evaluation-form]")) markStep("evaluate");
    }, true);

    window.addEventListener("hashchange", () => {
      clearHighlight();
      if (routeName() === "opportunities" && routeParts().length > 1) markStep("evaluate");
      if (routeName() === "tracking") markStep("track");
      window.setTimeout(() => {
        decorateDiscover();
        injectGlobalNewCardButton();
        renderPanel();
        if (state.pendingNewCard && routeName() === "discover") {
          state.pendingNewCard = false;
          window.setTimeout(() => focusDiscoverInput({ clear: true }), 80);
        }
      }, 80);
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
    new MutationObserver(() => {
      if (state.observerQueued) return;
      state.observerQueued = true;
      window.requestAnimationFrame(() => {
        state.observerQueued = false;
        decorateDiscover();
        injectGlobalNewCardButton();
        renderPanel();
      });
    }).observe(main, { childList: true, subtree: true });
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
    injectGlobalNewCardButton();
    decorateDiscover();
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
      injectGlobalNewCardButton();
      decorateDiscover();
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
    startNewCard: () => startNewCard(true),
    getProgress: () => ({ completed: [...stepState()], firstRunComplete: firstRunComplete() })
  });

  init();
})();