(() => {
  "use strict";

  const MAIN_SELECTOR = "#main-content";
  const INPUT_SELECTOR = '[data-customer-discovery-form] input[name="exactCardQuery"]';
  const FORM_SELECTOR = "[data-customer-discovery-form]";
  const LEGACY_WELCOME_ID = "ff-guided-mode-welcome";
  const FULL_CUSTOMER_PATH = /^\/app\/customer\/?$/i;
  let busy = false;
  let explicitDiscoverNavigation = false;

  function neutralizeLegacyWelcome() {
    document.getElementById(LEGACY_WELCOME_ID)?.remove();
    document.body?.classList.remove("ff-guide-modal-open");
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

  function installStyles() {
    if (document.getElementById("ff-discover-focus-fix-styles")) return;
    const style = document.createElement("style");
    style.id = "ff-discover-focus-fix-styles";
    style.textContent = `
      .ff-discover-direct-input{
        border-color:#e0b63e!important;
        box-shadow:0 0 0 3px rgba(226,181,65,.14)!important;
      }
    `;
    document.head.appendChild(style);
  }

  function clearDirectCue() {
    document.querySelectorAll(".ff-discover-direct-input").forEach(node => node.classList.remove("ff-discover-direct-input"));
  }

  async function withDiscoverNavigation(action) {
    explicitDiscoverNavigation = true;
    try {
      return await action();
    } finally {
      explicitDiscoverNavigation = false;
    }
  }

  async function ensureProviderDiscover({ allowNavigation = false } = {}) {
    const main = document.querySelector(MAIN_SELECTOR);
    if (!main) return null;

    let input = main.querySelector(INPUT_SELECTOR);
    if (input && routeName() === "discover") return input;

    if (routeName() !== "discover") {
      if (!allowNavigation) return null;
      window.location.hash = "#/discover";
      await new Promise(resolve => window.setTimeout(resolve, 120));
      // Explicit New Card / Focus Discover actions may navigate here once,
      // but they must never reclaim the route after newer user navigation.
      if (routeName() !== "discover") return null;
    }

    const discovery = window.FlipForgeCustomerDiscovery;
    if (discovery && typeof discovery.render === "function" && typeof discovery.isEligible === "function" && discovery.isEligible()) {
      try {
        if (routeName() !== "discover") return null;
        await discovery.render(main);
      } catch (_) {
        // The provider-backed Discover renderer owns its fail-closed error state.
      }
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (routeName() !== "discover") return null;
      input = main.querySelector(INPUT_SELECTOR);
      if (input) return input;
      await new Promise(resolve => window.setTimeout(resolve, 75));
    }
    return null;
  }

  async function showExactCardEntry({ clear = false, scroll = true } = {}) {
    if (busy) return;
    busy = true;
    try {
      neutralizeLegacyWelcome();
      installStyles();
      clearDirectCue();
      const input = await ensureProviderDiscover({ allowNavigation: explicitDiscoverNavigation });
      if (!input || routeName() !== "discover") return;

      const form = input.closest(FORM_SELECTOR) || input.form;
      if (clear) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const targetMaxBuy = form?.querySelector('[name="targetMaxBuy"]');
        if (targetMaxBuy) {
          targetMaxBuy.value = "";
          targetMaxBuy.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      if (routeName() !== "discover") return;
      input.classList.add("ff-discover-direct-input");
      if (scroll) input.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        if (routeName() !== "discover" || !input.isConnected) return;
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
        input.select?.();
      }, 300);

      window.setTimeout(() => {
        input.classList.remove("ff-discover-direct-input");
      }, 12000);
    } finally {
      busy = false;
    }
  }

  function showRouteCue() {
    if (routeName() !== "discover") return Promise.resolve();
    return showExactCardEntry({ clear: false, scroll: !fullCustomerMode() });
  }

  function enforceSearchFirst({ focus = false } = {}) {
    neutralizeLegacyWelcome();
    if (routeName() === "discover" && focus) {
      window.setTimeout(() => {
        if (routeName() === "discover") showRouteCue();
      }, 80);
    }
  }

  document.addEventListener("click", event => {
    const focusButton = event.target.closest('[data-ff-focus-card], [data-guide-action="focus-discover"]');
    if (!focusButton) return;
    window.setTimeout(() => withDiscoverNavigation(() => showExactCardEntry({ clear: false, scroll: true })), 0);
  }, true);

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-ff-global-new-card],[data-ff-new-card]")) return;
    window.setTimeout(() => withDiscoverNavigation(() => showExactCardEntry({ clear: true, scroll: true })), 160);
  }, true);

  window.addEventListener("hashchange", () => {
    neutralizeLegacyWelcome();
    if (routeName() !== "discover") {
      clearDirectCue();
      return;
    }
    window.setTimeout(() => showRouteCue(), 120);
  });

  window.addEventListener("flipforge:identity-change", () => {
    enforceSearchFirst({ focus: routeName() === "discover" });
  });

  const welcomeObserver = new MutationObserver(() => neutralizeLegacyWelcome());
  const beginRuntimeGuard = () => {
    neutralizeLegacyWelcome();
    if (document.body) welcomeObserver.observe(document.body, { childList: true });
    if (routeName() === "discover") {
      window.setTimeout(() => {
        if (routeName() === "discover") showRouteCue();
      }, 180);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", beginRuntimeGuard, { once: true });
  } else {
    beginRuntimeGuard();
  }

  window.FlipForgeDiscoverFocusFix = Object.freeze({
    show: () => withDiscoverNavigation(() => showExactCardEntry({ clear: false, scroll: true })),
    startNew: () => withDiscoverNavigation(() => showExactCardEntry({ clear: true, scroll: true })),
    enforceSearchFirst: () => enforceSearchFirst({ focus: routeName() === "discover" })
  });
})();
