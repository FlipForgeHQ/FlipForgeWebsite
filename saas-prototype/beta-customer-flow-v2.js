(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const MAIN = "#main-content";
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

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (!node) return;
    const template = document.createElement("template");
    template.innerHTML = value;
    const normalized = template.innerHTML;
    if (node.innerHTML !== normalized) node.innerHTML = normalized;
  }

  function guidedProgress() {
    const progress = window.FlipForgeGuidedMode?.getProgress?.();
    return {
      completed: new Set(Array.isArray(progress?.completed) ? progress.completed : []),
      firstRunComplete: progress?.firstRunComplete === true
    };
  }

  function syncGuidedState() {
    const progress = guidedProgress();
    document.documentElement.classList.toggle("ff-guided-incomplete", !progress.firstRunComplete);
    return progress;
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
    // Specific phrases first so the generic rules below never produce broken copy
    // such as "Saved your account records" or "your saved to your account workspace".
    [/\b(?:Saved|Tenant-owned) SQLite records\b/gi, "Saved decisions in your account"],
    [/\byour (?:tenant-owned|saved) workspace\b/gi, "your account"],
    [/\btenant-owned\b/gi, "saved to your account"],
    [/\btenant-scoped\b/gi, "account-specific"],
    [/\bSQLite saved\b/gi, "saved to your account"],
    [/\bSQLite\b/g, "your account"],
    [/\bprovider-backed\b/gi, "connected-source"],
    [/\bProvider context\b/g, "Marketplace context"],
    [/\bprovider context\b/gi, "marketplace context"],
    [/\bgoverned evidence\b/gi, "qualified evidence"],
    [/\bauthority-ineligible\b/gi, "not eligible"],
    // Keep a capital where the phrase starts a label ("4 · Authority output" -> "4 · Decision", not "4 · decision").
    [/\bAuthority output\b/g, "Decision"],
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
    const roots = [document.querySelector(MAIN), document.querySelector(".prototype-banner"), document.querySelector(".plan-card")].filter(Boolean);
    roots.forEach(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style,input,textarea,select,option,code,pre")) continue;
        const original = node.nodeValue || "";
        const trimmed = original.trim();
        if (TECHNICAL_EXACT.has(trimmed)) {
          const replacement = original.replace(trimmed, TECHNICAL_EXACT.get(trimmed));
          if (replacement !== original) node.nodeValue = replacement;
          continue;
        }
        let value = original;
        CUSTOMER_REPLACEMENTS.forEach(([pattern, replacement]) => { value = value.replace(pattern, replacement); });
        if (value !== original) node.nodeValue = value;
      }
    });
  }

  function workflowStrip() {
    const main = document.querySelector(MAIN);
    const heading = main?.querySelector(".page-heading");
    const route = routeName();
    // Saved Decisions and the saved decision page render their own strip (customer-opportunities.js).
    if (!main || !heading || !["discover", "evaluate", "tracking", "beta-start"].includes(route)) return;

    const progress = guidedProgress();
    // The Private Beta presents three steps (Evaluate / Decision / Track); the customer app shows four. The strip is
    // rendered with the surface's final labels and numbers (no CSS relabelling or hidden step).
    const beta = window.FlipForgePrivateBetaEntry === true;
    const current = route === "discover" ? "discover" : route === "evaluate" ? (beta ? "discover" : "evaluate") : route === "tracking" ? "track" : "";
    const steps = beta ? [
      ["discover", "Evaluate", "#/discover"],
      ["understand", "Decision", "#/opportunities"],
      ["track", "Track", "#/tracking"]
    ] : [
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

    const signature = steps.map(([key]) => `${key}:${progress.completed.has(key) ? "1" : "0"}:${current === key ? "1" : "0"}`).join("|");
    if (strip.dataset.ffWorkflowSignature === signature) return;
    const html = steps.map(([key, label, href], index) => {
      const done = progress.completed.has(key);
      const active = current === key;
      const currentAttribute = active ? ' aria-current="step"' : "";
      return `<a class="ff-workflow-step" href="${href}" data-done="${done}"${currentAttribute}><span class="ff-workflow-step-number">${done ? "✓" : index + 1}</span><span>${label}</span></a>`;
    }).join("");
    strip.innerHTML = html;
    strip.dataset.ffWorkflowSignature = signature;
  }

  function recoveryHtml(title, copy, actions) {
    return `<div><span>I'm still with you</span><h3>${title}</h3><p>${copy}</p></div><div class="ff-recovery-actions">${actions}</div>`;
  }

  function setRecovery(key, anchor, html) {
    const main = document.querySelector(MAIN);
    if (!main || !anchor) return;
    let coach = main.querySelector("[data-ff-recovery]");
    if (!coach) {
      coach = document.createElement("section");
      coach.className = "ff-recovery-coach";
      coach.dataset.ffRecovery = key;
      anchor.insertAdjacentElement("afterend", coach);
    } else if (coach.dataset.ffRecovery !== key) {
      coach.dataset.ffRecovery = key;
      anchor.insertAdjacentElement("afterend", coach);
    }
    setHtml(coach, html);
  }

  function clearRecovery() {
    document.querySelector(`${MAIN} [data-ff-recovery]`)?.remove();
  }

  function recoveryGuidance() {
    const main = document.querySelector(MAIN);
    if (!main) return;
    const route = routeName();

    if (route === "discover") {
      // An evaluation alert (data-discovery-evaluate-error) states its own outcome and next step; this coach is for
      // search failures only and must never add "Nothing was saved" to an evaluation whose outcome may be unknown.
      const error = main.querySelector('.customer-discovery-page .staging-error[role="alert"]:not([data-discovery-evaluate-error])');
      if (error) {
        setRecovery("discover-error", error, recoveryHtml("The search didn't finish. Nothing was saved.", "Go back to the card box, confirm the exact identity, and try again. If the card number or parallel is uncertain, use Check card identity first.", '<button class="button button-primary" type="button" data-ff-focus-card>Show me the card box</button><button class="button button-secondary" type="button" data-ff-find-exact>Check card identity</button>'));
        return;
      }

      const identity = main.querySelector(".customer-discovery-identity-assist");
      if (identity && /No selectable exact identity|No selectable|Add a year, set, player, card number/i.test(identity.textContent || "")) {
        setRecovery("identity-missing", identity, recoveryHtml("FlipForge needs a little more card detail.", "Add the year, set, player, and card number first. Add the parallel, insert, grader, and grade when you know them. Then try Check card identity again.", '<button class="button button-primary" type="button" data-ff-focus-card>Take me back to the card box</button>'));
        return;
      }

      const empty = [...main.querySelectorAll(".staging-empty")].find(node => /No active candidate|No connected listing|No active candidates/i.test(node.textContent || ""));
      if (empty) {
        setRecovery("discover-empty", empty, recoveryHtml("No matching active listing came back yet.", "That does not mean the card is bad. Tighten the identity with the exact card number, parallel or grade, or use Check card identity before searching again.", '<button class="button button-primary" type="button" data-ff-focus-card>Refine this card</button><button class="button button-secondary" type="button" data-ff-find-exact>Check card identity</button>'));
        return;
      }
      clearRecovery();
      return;
    }

    if (route === "evaluate") {
      // The allowance alert (data-evaluation-allowance-reached) is definite and states its own next steps (Plan &
      // Usage, saved decisions). This coach's "didn't complete here ... try again" would contradict it.
      const error = main.querySelector('.staging-error[role="alert"]:not([data-evaluation-allowance-reached]),.consumer-state-error:not([data-evaluation-allowance-reached])');
      if (error) {
        setRecovery("evaluate-error", error, recoveryHtml("The evaluation didn't complete here.", "If it finished on FlipForge's side, it is in your saved decisions. Review the card identity and listing facts, then try again. If you are unsure about the card, return to Discover instead of guessing.", '<a class="button button-primary" href="#/discover">Return to Discover</a><button class="button button-secondary" type="button" data-ff-new-card>Start a different card</button>'));
        return;
      }
    }
    clearRecovery();
  }

  function betaMission() {
    const main = document.querySelector(MAIN);
    if (!main || routeName() !== "beta-start" || main.querySelector("[data-ff-beta-mission]")) return;
    const anchor = main.querySelector("[data-ff-workflow-strip]") || main.querySelector(".page-heading");
    if (!anchor) return;
    const mission = document.createElement("section");
    mission.className = "ff-beta-mission";
    mission.dataset.ffBetaMission = "";
    mission.innerHTML = `<span class="eyebrow">Your private-beta mission</span><h2>Evaluate one real card using only what FlipForge tells you.</h2><p>If you ever stop and wonder what to click, what a result means, or how to continue, that is a product issue—not something you are expected to figure out on your own.</p><div class="ff-beta-mission-checks"><span>Enter one exact card</span><span>Choose the correct listing</span><span>Understand the decision</span><span>Track it or start another</span></div>`;
    anchor.insertAdjacentElement("afterend", mission);
  }

  function handleFindExact() {
    const button = document.querySelector(`${MAIN} [data-discovery-find-exact]`);
    if (button) {
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
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
      if (event.target.closest("[data-ff-find-exact]")) {
        event.preventDefault();
        handleFindExact();
      }
    }, true);
  }

  function apply() {
    if (!eligibleHost()) return;
    syncGuidedState();
    workflowStrip();
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
    const main = document.querySelector(MAIN);
    if (main) new MutationObserver(scheduleApply).observe(main, { childList: true, subtree: true });
    window.addEventListener("hashchange", () => window.setTimeout(scheduleApply, 70));
    window.addEventListener("pageshow", scheduleApply);
    window.addEventListener("load", scheduleApply);
    window.addEventListener("flipforge:identity-change", scheduleApply);
    scheduleApply();
  }

  window.FlipForgeBetaCustomerFlow = Object.freeze({ refresh: scheduleApply });
  init();
})();
