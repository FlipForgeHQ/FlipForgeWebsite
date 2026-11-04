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

  // The Getting Started page (#/beta-start) renders its own final copy, clarity check and feedback prompt (private-beta.js).

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