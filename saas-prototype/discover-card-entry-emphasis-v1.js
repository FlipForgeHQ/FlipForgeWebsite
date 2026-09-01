(() => {
  "use strict";

  const MAIN = "#main-content";
  const INPUT = '[data-customer-discovery-form] input[name="exactCardQuery"]';
  const IDENTITY_HELPER_VERSION = "20260831-3";

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function loadIdentityAssistVerification() {
    const existingLink = document.querySelector('link[data-ff-identity-assist-verification]');
    if (!existingLink || existingLink.dataset.ffIdentityAssistVerificationVersion !== IDENTITY_HELPER_VERSION) {
      existingLink?.remove();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `identity-assist-verification-v1.css?v=${IDENTITY_HELPER_VERSION}`;
      link.dataset.ffIdentityAssistVerification = "";
      link.dataset.ffIdentityAssistVerificationVersion = IDENTITY_HELPER_VERSION;
      document.head.appendChild(link);
    }
    const existingScript = document.querySelector('script[data-ff-identity-assist-verification]');
    if (!existingScript || existingScript.dataset.ffIdentityAssistVerificationVersion !== IDENTITY_HELPER_VERSION) {
      existingScript?.remove();
      const script = document.createElement("script");
      script.src = `identity-assist-verification-v1.js?v=${IDENTITY_HELPER_VERSION}`;
      script.defer = true;
      script.dataset.ffIdentityAssistVerification = "";
      script.dataset.ffIdentityAssistVerificationVersion = IDENTITY_HELPER_VERSION;
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

  function promoteSearchPanel(main) {
    const page = main?.querySelector(".customer-discovery-page");
    const heading = page?.querySelector(":scope > .page-heading");
    const search = page?.querySelector(":scope > .customer-discovery-search");
    if (!page || !heading || !search) return;

    page.classList.add("ff-discover-above-fold");

    // Search is the primary Discover job. Keep it immediately under the page
    // heading so workflow education and decision terminology cannot bury it.
    if (heading.nextElementSibling !== search) {
      heading.insertAdjacentElement("afterend", search);
    }

    const coach = page.querySelector(":scope > [data-ff-discover-coach]");
    const workflow = page.querySelector(":scope > [data-ff-workflow-strip]");
    const decisionKey = page.querySelector(":scope > [data-ff-decision-key]");
    const boundary = [...page.querySelectorAll(":scope > .boundary-note")]
      .find(node => /decision framework|authority boundary/i.test(String(node.textContent || "")));

    let anchor = search;
    for (const node of [coach, workflow, decisionKey, boundary]) {
      if (!node || node === anchor) continue;
      if (anchor.nextElementSibling !== node) anchor.insertAdjacentElement("afterend", node);
      anchor = node;
    }
  }

  function decorateResultClarity(main) {
    const results = main?.querySelector(".customer-discovery-results");
    if (!results) return;

    results.querySelectorAll(".customer-discovery-score small").forEach(label => {
      label.textContent = "Factor score";
    });

    const summary = results.querySelector(".customer-discovery-summary");
    if (summary && !summary.querySelector("[data-ff-ranking-order-note]")) {
      const note = document.createElement("small");
      note.dataset.ffRankingOrderNote = "";
      note.style.display = "block";
      note.style.marginTop = "6px";
      note.textContent = "Rank is not sorted by factor score alone. After eligibility, evidence support, confidence/risk, availability and freshness, FlipForge prefers the lower complete all-in ask before using factor score as a tie-breaker.";
      summary.appendChild(note);
    }

    results.querySelectorAll(".customer-discovery-candidate-review [data-discovery-evaluate]").forEach(button => {
      const status = document.createElement("span");
      status.className = "staging-status staging-status-verify";
      status.dataset.ffEvaluationUnavailable = "";
      status.textContent = "Not eligible for evaluation";
      button.replaceWith(status);
    });
  }

  function decorate() {
    if (routeName() !== "discover") return;
    const main = document.querySelector(MAIN);
    if (!main) return;

    promoteSearchPanel(main);
    decorateResultClarity(main);

    const input = main.querySelector(INPUT);
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
      helper.textContent = "Not sure of the exact card? Find and confirm it first. Already know it? Search active listings.";
      input.insertAdjacentElement("afterend", helper);
    }

    const form = main.querySelector("[data-customer-discovery-form]");
    const searchButton = form?.querySelector('button[type="submit"]');
    if (searchButton && !searchButton.disabled) searchButton.textContent = "Search active listings";
    if (searchButton) {
      searchButton.setAttribute("aria-label", "Search active listings for this card");
      searchButton.title = "Use this when you already know the exact card identity.";
    }

    const identifyButton = form?.querySelector("[data-discovery-find-exact]");
    if (identifyButton && !identifyButton.disabled) identifyButton.textContent = "Find exact card";
    if (identifyButton) {
      identifyButton.setAttribute("aria-label", "Find and confirm the exact card");
      identifyButton.title = "Use this when you are unsure which base, parallel, variation, or card number is correct.";
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
