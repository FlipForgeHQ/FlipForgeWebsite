(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const FULL_CUSTOMER_PATH = /^\/(?:app|owner)\/customer(?:\/|$)/i;
  const DECISION_CONTEXT_TIMEOUT_MS = 8000;
  const ENUM_LABELS = Object.freeze({
    PRIVATE_BETA_ACTIVE: "Private Beta Active",
    INVITATION_DEFAULT: "Beta Invitation",
    UNLIMITED_SUBJECT_TO_REASONABLE_USE: "Unlimited (reasonable use)",
    NOT_INCLUDED: "Not included",
    BASIC: "Basic",
    ADVANCED: "Advanced",
    CONFIRMED: "Confirmed",
    UNKNOWN: "Unknown"
  });

  let observerInstalled = false;
  let mutationQueued = false;
  let decisionGuardTimer = 0;

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function production() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function fullCustomerMode() {
    return window.FlipForgeFullCustomerEntry === true
      || FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function prettyEnum(value) {
    const raw = String(value || "").trim();
    if (!raw) return raw;
    if (ENUM_LABELS[raw]) return ENUM_LABELS[raw];
    if (!/^[A-Z][A-Z0-9_]+$/.test(raw) || !raw.includes("_")) return raw;
    return raw
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function syncAdvancedAnalysisState() {
    const advanced = document.querySelector(".primary-nav .ff-advanced-nav");
    if (!advanced) return;
    const route = routeName();
    const activeInside = [...advanced.querySelectorAll("[data-route]")]
      .some(link => link.dataset.route === route);
    advanced.open = activeInside;
  }

  function enablePlanUsageNavigation() {
    const planCard = document.querySelector(".plan-card");
    if (!planCard) return;

    // Write only when a value differs (attribute re-writes re-trigger the shell's MutationObservers).
    if (!planCard.classList.contains("ff-plan-card-link")) planCard.classList.add("ff-plan-card-link");
    if (planCard.getAttribute("role") !== "link") planCard.setAttribute("role", "link");
    if (planCard.getAttribute("tabindex") !== "0") planCard.setAttribute("tabindex", "0");
    if (planCard.getAttribute("aria-label") !== "Open Plan & Usage") planCard.setAttribute("aria-label", "Open Plan & Usage");

    if (planCard.dataset.planUsageNavigationBound === "true") return;

    const navigate = () => {
      if (window.location.hash === "#/account") {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      window.location.hash = "#/account";
    };

    planCard.addEventListener("click", event => {
      if (event.target.closest("a, button, input, select, textarea")) return;
      navigate();
    });
    planCard.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigate();
    });
    planCard.dataset.planUsageNavigationBound = "true";
  }

  // The banner, sidebar chip, plan card, account captions and document title are final in each page's markup
  // (index.html: Private Beta; customer.html: customer app). Only the platform-specific shortcut label remains here.
  function normalizeVisibleLanguage() {
    const shortcut = document.querySelector(".global-search kbd");
    if (shortcut) {
      const desired = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "") ? "⌘ K" : "Ctrl K";
      if (shortcut.textContent !== desired) shortcut.textContent = desired;
    }
  }

  function humanizeServerEnums() {
    const selectors = [
      ".customer-entitlement-current dd",
      ".customer-entitlement-plan li strong",
      ".ff-v2-table tbody td:last-child"
    ];
    document.querySelectorAll(selectors.join(",")).forEach(node => {
      const current = String(node.textContent || "").trim();
      const pretty = prettyEnum(current);
      if (pretty && pretty !== current) node.textContent = pretty;
    });
  }

  function normalizeDashboardEvidenceMetric() {
    if (routeName() !== "dashboard") return;
    document.querySelectorAll(".ff-kpi-card").forEach(card => {
      const label = card.querySelector(".ff-kpi-label");
      const note = card.querySelector(".ff-kpi-note");
      if (label && /^Evidence Ready$/i.test(String(label.textContent || "").trim())) {
        label.textContent = "Provider-mapped evidence";
      }
      if (note && /confirmed mapping with accepted sales/i.test(note.textContent || "")) {
        note.textContent = "Confirmed provider mapping + accepted sales";
      }
    });

    document.querySelectorAll(".ff-attention-item small").forEach(node => {
      const text = String(node.textContent || "");
      if (/server-reported evidence ready/i.test(text)) {
        node.textContent = text.replace(/server-reported evidence ready/ig, "provider-mapped with accepted sales");
      }
    });
  }

  function bindDecisionRetry(container) {
    container.querySelectorAll("[data-ff-di-retry]").forEach(button => {
      if (button.dataset.ffDiRetryBound === "true") return;
      button.addEventListener("click", () => {
        button.disabled = true;
        button.textContent = "Retrying…";
        window.dispatchEvent(new Event("pageshow"));
      });
      button.dataset.ffDiRetryBound = "true";
    });
  }

  function armDecisionIntelligenceGuard() {
    window.clearTimeout(decisionGuardTimer);
    if (routeName() !== "decision-intelligence") return;

    decisionGuardTimer = window.setTimeout(() => {
      if (routeName() !== "decision-intelligence") return;
      const evidence = document.querySelector(".ff-di-card-evidence .ff-di-empty");
      const population = document.querySelector(".ff-di-card-population .ff-di-empty");

      if (evidence && /^Loading\b/i.test(String(evidence.textContent || "").trim())) {
        evidence.innerHTML = `<strong>Evidence details are taking longer than expected.</strong><p>The saved decision remains unchanged and no substitute evidence is being used.</p><button class="button button-secondary" type="button" data-ff-di-retry>Retry evidence</button>`;
      }

      if (population && /^Loading\b/i.test(String(population.textContent || "").trim())) {
        population.innerHTML = `<strong>PSA population context is taking longer than expected.</strong><p>FlipForge will not borrow or estimate population for another card.</p><button class="button button-secondary" type="button" data-ff-di-retry>Retry PSA context</button>`;
      }

      const main = document.querySelector("#main-content");
      if (main) bindDecisionRetry(main);
    }, DECISION_CONTEXT_TIMEOUT_MS);
  }

  function normalizeDynamicCustomerContent() {
    enablePlanUsageNavigation();
    normalizeVisibleLanguage();
    humanizeServerEnums();
    normalizeDashboardEvidenceMetric();
  }

  function installCompletionObserver() {
    if (observerInstalled || !document.body) return;
    observerInstalled = true;
    const observer = new MutationObserver(() => {
      if (mutationQueued) return;
      mutationQueued = true;
      queueMicrotask(() => {
        mutationQueued = false;
        if (!eligible()) return;
        normalizeDynamicCustomerContent();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function apply() {
    if (!eligible()) return;
    document.body.classList.add("ff-core-platform-completion");
    syncAdvancedAnalysisState();
    normalizeDynamicCustomerContent();
    armDecisionIntelligenceGuard();
    installCompletionObserver();
  }

  document.addEventListener("DOMContentLoaded", apply, { once: true });
  window.addEventListener("hashchange", () => queueMicrotask(apply));
  window.addEventListener("flipforge:identity-change", () => queueMicrotask(apply));
  queueMicrotask(apply);
})();
