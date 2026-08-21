(() => {
  "use strict";

  const FORGE_HEAT_ROUTE = "#/forge-heat";

  function addBrandTagline() {
    const copy = document.querySelector(".brand-copy");
    if (!copy || copy.querySelector(".brand-tagline")) return;
    const tagline = document.createElement("span");
    tagline.className = "brand-tagline";
    tagline.textContent = "Before you buy. Know Why.";
    copy.appendChild(tagline);
  }

  function consolidateAccountNavigation() {
    document.querySelector(".sidebar-footer .account-link")?.remove();
    const profile = document.querySelector(".profile-button .profile-copy");
    if (!profile) return;
    const title = profile.querySelector("strong");
    const detail = profile.querySelector("small");
    if (title) title.textContent = "Account";
    if (detail) detail.textContent = "Plan & Usage";
  }

  function polishPlanLanguage(root = document) {
    const replacements = [
      ["Plan state and evaluation usage are server-owned.", "Plan and usage update automatically."],
      ["Plan state, usage, and checkout availability are server-owned.", "Plan, usage, and checkout availability update automatically."],
      ["Plan state and usage are server-owned.", "Plan and usage update automatically."],
      ["Subscription and usage data stays server-owned.", "Subscription and usage data updates automatically."],
      ["Access and usage stay server-owned.", "Access and usage update automatically."],
      ["Review server-owned access, evaluation usage, and the planned commercial tiers for this tenant.", "Review your access, evaluation usage, and planned commercial tiers."],
      ["Server-owned", "Updates automatically"]
    ];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const original = node.nodeValue || "";
      let value = original;
      for (const [from, to] of replacements) value = value.replaceAll(from, to);
      if (value !== original) node.nodeValue = value;
    }
  }

  function prepareForgeHeatNavigation() {
    const nav = document.querySelector('[data-route="forge-heat"]');
    if (!nav) return;
    const icon = nav.querySelector("span:first-child");
    if (icon) icon.textContent = "⌁";
    nav.querySelector(".forge-nav-pro")?.remove();
    if (!nav.querySelector(".forge-nav-state")) {
      const state = document.createElement("span");
      state.className = "forge-nav-state";
      state.textContent = "In development";
      nav.appendChild(state);
    }
    nav.setAttribute("aria-disabled", "true");
    nav.setAttribute("title", "Forge Heat is in development");
    nav.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function forgeHeatDevelopmentView() {
    return `<div class="forge-heat-shell forge-heat-development">
      <header class="forge-heat-hero">
        <div>
          <div class="forge-heat-title-row"><span class="eyebrow">IN DEVELOPMENT</span></div>
          <h1>Forge Heat™</h1>
          <p class="forge-heat-lead">Opportunity-ranking intelligence is being built and validated for a future release.</p>
        </div>
        <div class="forge-heat-boundary"><strong>Current status</strong><span>Not available in private beta</span><small>No paid access required or implied · No transaction authority</small></div>
      </header>
      <section class="forge-heat-lock">
        <span class="forge-heat-lock-mark" aria-hidden="true">⌁</span>
        <div><span class="eyebrow">Roadmap feature</span><h2>Forge Heat is not available yet.</h2><p>FlipForge is validating the evidence, ranking, and history requirements before opening this feature to customers.</p><p>No Pro upgrade or payment is required for an unfinished feature.</p><a class="button button-primary" href="#/discover">Return to Discover</a></div>
      </section>
    </div>`;
  }

  function enforceForgeHeatDevelopment() {
    if (window.location.hash !== FORGE_HEAT_ROUTE) return;
    const main = document.querySelector("#main-content");
    if (!main || main.querySelector(".forge-heat-development")) return;
    main.innerHTML = forgeHeatDevelopmentView();
  }

  function observeCustomerCopy() {
    const root = document.body;
    if (!root) return;
    const observer = new MutationObserver(() => {
      polishPlanLanguage(root);
      enforceForgeHeatDevelopment();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    addBrandTagline();
    consolidateAccountNavigation();
    prepareForgeHeatNavigation();
    polishPlanLanguage(document.body);
    enforceForgeHeatDevelopment();
    observeCustomerCopy();
    window.addEventListener("hashchange", () => setTimeout(enforceForgeHeatDevelopment, 0));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
