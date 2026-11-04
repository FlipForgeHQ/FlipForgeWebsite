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

  // Every route renders its own workflow strip (Discover, Evaluate, customer-opportunities.js, customer-lifecycle.js);
  // the saved decision page renders its summary and save confirmation itself (customer-opportunities.js).

  function bindEvents() {
    document.addEventListener("click", event => {
      if (event.target.closest("[data-discovery-evaluate]")) {
        try { window.sessionStorage.setItem("flipforge.pendingEvaluationSave", "1"); } catch (_) { /* session only */ }
      }
    }, true);
  }

  // The private beta (/app/beta) screens render their final customer wording themselves (owners, private-beta.js and the
  // provider-evidence notice), so this app-wide text rewrite runs only in the full customer app (/app/customer).
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  function apply() {
    if (!eligibleHost()) return;
    syncGuidedState();
    if (FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) refineCustomerLanguage();
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
