(() => {
  "use strict";

  const MAIN = "#main-content";
  const INPUT = '[data-customer-discovery-form] input[name="exactCardQuery"]';

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function loadIdentityAssistVerification() {
    if (!document.querySelector('link[data-ff-identity-assist-verification]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "identity-assist-verification-v1.css";
      link.dataset.ffIdentityAssistVerification = "";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-ff-identity-assist-verification]')) {
      const script = document.createElement("script");
      script.src = "identity-assist-verification-v1.js";
      script.defer = true;
      script.dataset.ffIdentityAssistVerification = "";
      document.body.appendChild(script);
    }
  }

  function loadDiscoverControls() {
    if (document.querySelector('script[data-ff-discover-controls-v2]')) return;
    const script = document.createElement("script");
    script.src = "customer-discovery-controls-v2.js?v=20260830-1";
    script.defer = true;
    script.dataset.ffDiscoverControlsV2 = "";
    document.body.appendChild(script);
  }

  function decorate() {
    if (routeName() !== "discover") return;
    const main = document.querySelector(MAIN);
    const input = main?.querySelector(INPUT);
    if (!input) return;

    const label = input.closest("label");
    if (!label) return;

    const labelText = label.querySelector(":scope > span");
    if (labelText) labelText.textContent = "CARD IDENTITY — ENTER THE CARD YOU WANT TO EVALUATE";

    input.placeholder = "Example: 2018 Topps Chrome Shohei Ohtani #150 PSA 9";
    input.setAttribute("aria-label", "Card identity — start here");

    if (!label.querySelector(".ff-card-entry-helper")) {
      const helper = document.createElement("small");
      helper.className = "ff-card-entry-helper";
      helper.textContent = "Start with year, set, player and card number. Add parallel, grader and grade when you know them.";
      input.insertAdjacentElement("afterend", helper);
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorate();
    });
  }

  loadIdentityAssistVerification();
  loadDiscoverControls();
  const main = document.querySelector(MAIN);
  if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);
  schedule();
})();
