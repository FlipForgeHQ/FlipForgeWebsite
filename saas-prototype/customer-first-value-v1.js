(() => {
  "use strict";

  if (window.FlipForgeCustomerFirstValueV1) return;

  const APP_PATH = /^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i;
  const DECISION_COPY = Object.freeze({
    BUY: "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.",
    WATCH: "There may be an opportunity here, but the price or evidence is not strong enough yet.",
    VERIFY: "There is not enough matching evidence yet to make this purchase confidently.",
    PASS: "The current evidence does not justify this purchase at the evaluated price."
  });
  const state = { scheduled: false, applying: false };

  function eligible() {
    return APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function text(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  // text() returns decoded characters. Anything read back from the page is server data that the
  // original renderer escaped, so it must be escaped again before it is placed in new markup.
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function exactDecision(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(DECISION_COPY, normalized) ? normalized : "";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function pageRoot() {
    return document.querySelector("#main-content");
  }

  function decisionKeyAllowed(root) {
    const route = routeName();
    // Tracking, the Saved Decisions list and Forge Heat render their own decision key (their owners).
    return route === "dashboard";
  }

  function installDecisionKey(root) {
    if (!decisionKeyAllowed(root) || root.querySelector("[data-ff-decision-key]")) return;
    const heading = root.querySelector(".page-heading");
    if (!heading) return;
    const key = document.createElement("details");
    key.className = "ff-decision-key";
    key.setAttribute("data-ff-decision-key", "");
    key.innerHTML = `<summary>What do BUY / WATCH / VERIFY / PASS mean?</summary>
      <div class="ff-decision-key-grid">
        <div><strong>BUY</strong><span>${DECISION_COPY.BUY}</span></div>
        <div><strong>WATCH</strong><span>${DECISION_COPY.WATCH}</span></div>
        <div><strong>VERIFY</strong><span>${DECISION_COPY.VERIFY}</span></div>
        <div><strong>PASS</strong><span>${DECISION_COPY.PASS}</span></div>
      </div>`;
    heading.insertAdjacentElement("afterend", key);
  }

  function annotateDecisionChips(root) {
    root.querySelectorAll(".staging-status, .status-pill").forEach(chip => {
      const decision = exactDecision(text(chip));
      // Chips rendered with their meaning already (Saved Decisions) are left as they are.
      if (!decision || chip.dataset.ffDecision === decision) return;
      chip.dataset.ffDecision = decision;
      chip.title = DECISION_COPY[decision];
      chip.setAttribute("aria-label", `${decision}. ${DECISION_COPY[decision]}`);
    });
  }

  function polishBetaStart(root) {
    const page = root.querySelector(".private-beta-page");
    if (!page) return;
    const heading = page.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Your first FlipForge decision");
      setText(heading.querySelector("h1"), "Getting Started");
      setText(heading.querySelector("p"), "Complete one real decision loop. You should know the decision, why FlipForge gave it, and what to do next.");
      const actions = heading.querySelectorAll(".page-actions a");
      if (actions[0]) setText(actions[0], "Start your first card");
      if (actions[1]) setText(actions[1], "Enter a listing manually");
    }

    const hero = page.querySelector(".private-beta-hero-copy");
    if (hero) {
      setText(hero.querySelector("h2"), "One card. One decision. One clear reason.");
      setText(hero.querySelector("p"), "Find the exact card, confirm the listing, let FlipForge evaluate it, then challenge the evidence only if you need more detail.");
    }

    const steps = [...page.querySelectorAll(".private-beta-steps > .private-beta-step")];
    if (steps.length >= 4) {
      const core = [
        ["Find", "Find the exact card", "Search connected listings or start with a manual listing. Identity comes before price."],
        ["Evaluate", "Confirm the listing and real cost", "Send the exact card and all-in cost to Smart Opportunity. The browser never chooses the recommendation."],
        ["Understand", "Read Decision → Value → Risk → Why", "You should understand what FlipForge recommends and why within seconds."],
        ["Prove", "Open the evidence", "Challenge the exact sales, exclusions, decision details, and PSA context only when you need deeper proof."]
      ];
      steps.slice(0, 4).forEach((step, index) => {
        setText(step.querySelector(".private-beta-step-copy > span"), core[index][0]);
        setText(step.querySelector("strong"), core[index][1]);
        setText(step.querySelector("small"), core[index][2]);
      });
    }

    const stepsContainer = page.querySelector(".private-beta-steps");
    if (stepsContainer && steps.length > 4 && !page.querySelector("[data-ff-advanced-journey]")) {
      const details = document.createElement("details");
      details.className = "ff-advanced-journey";
      details.setAttribute("data-ff-advanced-journey", "");
      details.innerHTML = `<summary>Explore advanced tools after your first decision</summary><div class="ff-advanced-journey-body"></div>`;
      const body = details.querySelector(".ff-advanced-journey-body");
      steps.slice(4).forEach(step => body.appendChild(step));
      stepsContainer.insertAdjacentElement("afterend", details);
    }

    const walkthroughPanel = stepsContainer?.closest("section.panel");
    if (walkthroughPanel) {
      setText(walkthroughPanel.querySelector(".panel-header h2"), "Your first FlipForge decision");
      setText(walkthroughPanel.querySelector(".panel-header p"), "Do this once before exploring the advanced tools.");
    }

    if (!page.querySelector("[data-ff-comprehension-check]")) {
      const feedback = page.querySelector("#beta-feedback");
      if (feedback) {
        const check = document.createElement("section");
        check.className = "panel ff-comprehension-check";
        check.setAttribute("data-ff-comprehension-check", "");
        check.innerHTML = `<header class="panel-header"><div><h2>The 10-second clarity check</h2><p>After Card Intelligence loads, answer these without studying the screen.</p></div></header><div class="panel-body"><ol><li><strong>What does FlipForge recommend?</strong></li><li><strong>Why did it reach that decision?</strong></li><li><strong>What would you do next?</strong></li></ol><p>If those answers are not obvious, tell us exactly where the screen made you work too hard.</p></div>`;
        feedback.insertAdjacentElement("beforebegin", check);
      }
    }

    const feedbackForm = page.querySelector("[data-private-beta-feedback]");
    const summary = feedbackForm?.querySelector('textarea[name="summary"]');
    const summaryLabel = summary?.closest("label");
    if (summaryLabel && summaryLabel.dataset.ffClarityPrompt !== "true") {
      summaryLabel.dataset.ffClarityPrompt = "true";
      const firstText = [...summaryLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE && text(node));
      if (firstText) firstText.nodeValue = "What decision did you see, why did FlipForge give it, and what would you do next? ";
      summary.placeholder = "Example: VERIFY. The exact evidence was too thin, so I would confirm the parallel before buying.";
    }
  }

  function apply() {
    if (!eligible() || state.applying) return;
    const root = pageRoot();
    if (!root) return;
    state.applying = true;
    try {
      // Tracking and Alerts label their own decision chips (customer-lifecycle.js); Evaluate renders its final copy,
      // result summary and decision-chip meaning itself (staging-evaluation.js).
      if (!["tracking", "alerts", "evaluate"].includes(routeName())) annotateDecisionChips(root);
      installDecisionKey(root);
      if (routeName() === "beta-start") polishBetaStart(root);
    } finally {
      state.applying = false;
    }
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      apply();
    });
  }

  function start() {
    if (!eligible()) return;
    const main = pageRoot();
    if (main) {
      const observer = new MutationObserver(schedule);
      observer.observe(main, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener("hashchange", schedule);
    window.addEventListener("pageshow", schedule);
    schedule();
  }

  window.FlipForgeCustomerFirstValueV1 = Object.freeze({ apply, decisionCopy: DECISION_COPY });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();