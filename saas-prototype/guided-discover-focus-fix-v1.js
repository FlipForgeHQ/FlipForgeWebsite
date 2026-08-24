(() => {
  "use strict";

  const MAIN_SELECTOR = "#main-content";
  const INPUT_SELECTOR = '[data-customer-discovery-form] input[name="exactCardQuery"]';
  const FORM_SELECTOR = "[data-customer-discovery-form]";
  const HINT_ID = "ff-discover-direct-hint";
  let busy = false;

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
      #${HINT_ID}{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:10px 14px;border:1px solid rgba(226,181,65,.9);border-radius:10px;background:rgba(226,181,65,.12);color:#f2cb67;font-weight:800;letter-spacing:.04em;box-shadow:0 0 0 1px rgba(226,181,65,.16),0 12px 32px rgba(0,0,0,.28)}
      #${HINT_ID} span{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:999px;background:#d6a92f;color:#090d12;font-size:16px}
      .ff-discover-direct-form{position:relative!important;outline:3px solid rgba(226,181,65,.9)!important;outline-offset:7px!important;border-radius:12px!important;box-shadow:0 0 0 8px rgba(226,181,65,.08),0 0 36px rgba(226,181,65,.22)!important}
      .ff-discover-direct-input{border-color:#e0b63e!important;box-shadow:0 0 0 4px rgba(226,181,65,.2)!important;background:rgba(226,181,65,.055)!important}
      @media (prefers-reduced-motion:no-preference){.ff-discover-direct-form{animation:ffDiscoverPulse 1.1s ease-in-out 2}@keyframes ffDiscoverPulse{0%,100%{outline-color:rgba(226,181,65,.55)}50%{outline-color:#f2cb67;box-shadow:0 0 0 11px rgba(226,181,65,.13),0 0 42px rgba(226,181,65,.3)}}}
    `;
    document.head.appendChild(style);
  }

  function clearDirectCue() {
    document.getElementById(HINT_ID)?.remove();
    document.querySelectorAll(".ff-discover-direct-form").forEach(node => node.classList.remove("ff-discover-direct-form"));
    document.querySelectorAll(".ff-discover-direct-input").forEach(node => node.classList.remove("ff-discover-direct-input"));
  }

  async function ensureProviderDiscover() {
    const main = document.querySelector(MAIN_SELECTOR);
    if (!main) return null;
    let input = main.querySelector(INPUT_SELECTOR);
    if (input) return input;

    const discovery = window.FlipForgeCustomerDiscovery;
    if (routeName() !== "discover") {
      window.location.hash = "#/discover";
      await new Promise(resolve => window.setTimeout(resolve, 120));
    }

    if (discovery && typeof discovery.render === "function" && typeof discovery.isEligible === "function" && discovery.isEligible()) {
      try {
        await discovery.render(main);
      } catch (_) {
        // The provider-backed Discover renderer owns its fail-closed error state.
      }
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      input = main.querySelector(INPUT_SELECTOR);
      if (input) return input;
      await new Promise(resolve => window.setTimeout(resolve, 75));
    }
    return null;
  }

  async function showExactCardEntry({ clear = false } = {}) {
    if (busy) return;
    busy = true;
    try {
      installStyles();
      clearDirectCue();
      const input = await ensureProviderDiscover();
      if (!input) return;

      const form = input.closest(FORM_SELECTOR) || input.form;
      const label = input.closest("label") || input.parentElement;
      if (clear) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const targetMaxBuy = form?.querySelector('[name="targetMaxBuy"]');
        if (targetMaxBuy) {
          targetMaxBuy.value = "";
          targetMaxBuy.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      const hint = document.createElement("div");
      hint.id = HINT_ID;
      hint.setAttribute("role", "status");
      hint.innerHTML = '<span aria-hidden="true">↓</span><strong>TYPE YOUR CARD HERE</strong> — start with year, set, player and card number.';
      (label || input).insertAdjacentElement("beforebegin", hint);

      form?.classList.add("ff-discover-direct-form");
      input.classList.add("ff-discover-direct-input");
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
        input.select?.();
      }, 300);

      window.setTimeout(() => {
        form?.classList.remove("ff-discover-direct-form");
        input.classList.remove("ff-discover-direct-input");
      }, 12000);
    } finally {
      busy = false;
    }
  }

  document.addEventListener("click", event => {
    const focusButton = event.target.closest('[data-ff-focus-card], [data-guide-action="focus-discover"]');
    if (!focusButton) return;
    window.setTimeout(() => showExactCardEntry({ clear: false }), 0);
  }, true);

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-ff-global-new-card],[data-ff-new-card]")) return;
    window.setTimeout(() => showExactCardEntry({ clear: true }), 160);
  }, true);

  window.addEventListener("hashchange", () => {
    if (routeName() !== "discover") clearDirectCue();
  });

  window.FlipForgeDiscoverFocusFix = Object.freeze({
    show: () => showExactCardEntry({ clear: false }),
    startNew: () => showExactCardEntry({ clear: true })
  });
})();
