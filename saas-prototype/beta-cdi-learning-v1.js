(() => {
  "use strict";

  if (window.FlipForgeBetaCdiLearningV1) return;
  window.FlipForgeBetaCdiLearningV1 = true;

  const ENDPOINT = "/api/beta/feedback";
  let queued = false;

  function routeParts() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)
      .filter(Boolean);
  }

  function activeTester() {
    const session = window.FlipForgeIdentity?.getSnapshot?.();
    return Boolean(session?.authenticated && session?.membershipActive);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function select(name, label, options) {
    return `<label><span>${esc(label)}</span><select name="${esc(name)}" required><option value="">Choose one</option>${options.map(([value, copy]) => `<option value="${esc(value)}">${esc(copy)}</option>`).join("")}</select></label>`;
  }

  function markup() {
    return `<details class="ff-beta-cdi-check" data-ff-beta-cdi-check>
      <summary><span><strong>30-second beta check</strong><small>Was this decision clear and useful?</small></span><span aria-hidden="true">＋</span></summary>
      <form data-ff-beta-cdi-form>
        <div class="ff-beta-cdi-intro"><span>CARD DECISION INTELLIGENCE™</span><p>Help us measure comprehension—not whether you agree with the decision.</p></div>
        <div class="ff-beta-cdi-grid">
          ${select("decisionUnderstood", "Did you understand the decision?", [["YES", "Yes"], ["PARTLY", "Partly"], ["NO", "No"]])}
          ${select("nextStepClear", "Did you know what to do next?", [["YES", "Yes"], ["PARTLY", "Partly"], ["NO", "No"]])}
          ${select("evidenceImpact", "What did the evidence do to your confidence?", [["INCREASED", "Increased it"], ["NO_CHANGE", "No change"], ["DECREASED", "Decreased it"], ["NOT_VIEWED", "I did not view the evidence"]])}
          ${select("mostUsefulLayer", "What helped most?", [["IDENTITY", "Exact card identity"], ["EVIDENCE", "Trusted vs. excluded evidence"], ["ECONOMICS", "Price and supported value"], ["RISK_UNCERTAINTY", "Risk and uncertainty"], ["DECISION", "Why FlipForge made the call"], ["RECEIPT", "Decision Receipt / traceback"], ["OUTCOME", "Tracking what happens next"], ["NONE", "Nothing yet"]])}
        </div>
        <label class="ff-beta-cdi-note"><span>Anything confusing? <small>Optional</small></span><textarea name="note" maxlength="600" placeholder="Tell us where you hesitated or what you expected to see."></textarea></label>
        <div class="ff-beta-cdi-actions"><button class="button button-secondary" type="submit">Send beta check</button><p data-ff-beta-cdi-message role="status" aria-live="polite"></p></div>
        <p class="ff-beta-cdi-boundary">This feedback does not change the saved decision, evidence authority, supported value, grading guidance, or transaction authority. Do not enter card identities, listing URLs, passwords, tokens, or other sensitive data.</p>
      </form>
    </details>`;
  }

  function anchor(main) {
    return main.querySelector("[data-ff-decision-card-evidence]")
      || main.querySelector("[data-ff-decision-summary]")
      || main.querySelector(".customer-intelligence-hero");
  }

  function ensure() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return;
    const main = document.querySelector("#main-content");
    if (!main || main.querySelector("[data-ff-beta-cdi-check]")) return;
    const target = anchor(main);
    if (!target) return;
    target.insertAdjacentHTML("afterend", markup());
    const form = main.querySelector("[data-ff-beta-cdi-form]");
    const message = main.querySelector("[data-ff-beta-cdi-message]");
    const button = form?.querySelector('button[type="submit"]');
    if (!form || !message || !button) return;
    if (!activeTester()) {
      button.disabled = true;
      message.textContent = "Active invited testers can submit this check.";
      return;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const decisionUnderstood = String(data.get("decisionUnderstood") || "");
      const nextStepClear = String(data.get("nextStepClear") || "");
      const evidenceImpact = String(data.get("evidenceImpact") || "");
      const mostUsefulLayer = String(data.get("mostUsefulLayer") || "");
      if (!decisionUnderstood || !nextStepClear || !evidenceImpact || !mostUsefulLayer) {
        message.textContent = "Answer all four quick questions before sending.";
        message.dataset.tone = "error";
        return;
      }
      const note = String(data.get("note") || "").trim();
      const payload = {
        category: "decision-explanation",
        route: "opportunities",
        checkpoint: "GENERAL",
        summary: note || "Card Decision Intelligence comprehension check completed.",
        decisionUnderstood,
        nextStepClear,
        evidenceImpact,
        mostUsefulLayer,
      };
      button.disabled = true;
      message.textContent = "Sending…";
      message.dataset.tone = "neutral";
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("feedback rejected");
        form.reset();
        message.textContent = "Thank you. This helps us measure whether the decision is understandable.";
        message.dataset.tone = "ok";
      } catch (_) {
        message.textContent = "The beta check could not be saved. Your decision was not affected.";
        message.dataset.tone = "error";
      } finally {
        button.disabled = false;
      }
    });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      ensure();
    });
  }

  window.addEventListener("hashchange", schedule);
  window.addEventListener("flipforge:identity-change", schedule);
  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
