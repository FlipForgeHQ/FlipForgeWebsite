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

  function routeName() {
    return routeParts()[0] || "dashboard";
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

  async function postFeedback(payload) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("feedback rejected");
    return response;
  }

  function missionStep(number, title, copy, href, action) {
    return `<div class="private-beta-step ff-wave1-step">
      <span class="private-beta-step-number">${number}</span>
      <span class="private-beta-step-copy"><span>Task ${number}</span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>
      <a class="button button-secondary" href="${esc(href)}">${esc(action)}</a>
    </div>`;
  }

  function ensureMission() {
    if (routeName() !== "beta-start" || !activeTester()) return;
    const steps = document.querySelector(".private-beta-steps");
    if (!steps || steps.dataset.ffWave1Mission === "true") return;
    steps.dataset.ffWave1Mission = "true";
    const panel = steps.closest(".panel");
    const heading = panel?.querySelector(".panel-header h2");
    const helper = panel?.querySelector(".panel-header p");
    if (heading) heading.textContent = "Your 5-task Wave 1 mission";
    if (helper) helper.textContent = "Use one real card you would seriously consider buying. Finish this loop before exploring the rest of FlipForge.";
    steps.innerHTML = [
      missionStep(1, "Bring one real card", "Use a sports-card listing you would genuinely consider buying—not a made-up test case.", "#/discover", "Find the card"),
      missionStep(2, "Verify the exact identity", "Confirm year, set, player, card number, parallel or variation, grader, and grade before trusting the result.", "#/discover", "Check identity"),
      missionStep(3, "Get the FlipForge decision", "Use the real all-in acquisition cost and read BUY, WATCH, VERIFY, or PASS before opening deeper analysis.", "#/evaluate", "Evaluate"),
      missionStep(4, "Challenge the evidence", "Open the saved decision and inspect what evidence was accepted, excluded, or withheld and whether the reasoning makes sense.", "#/opportunities", "Review decision"),
      missionStep(5, "Track it and tell us what changed", "Save or track the decision, then complete the structured beta check on the saved decision screen. Report anything that blocked or confused you.", "#/opportunities", "Finish mission"),
    ].join("");
  }

  function bugMarkup() {
    return `<details class="ff-beta-bug-report" data-ff-beta-bug-report>
      <summary><span><strong>Report a beta issue</strong><small>Something broken, misleading, or blocking?</small></span><span aria-hidden="true">＋</span></summary>
      <form data-ff-beta-bug-form>
        <div class="ff-beta-cdi-intro"><span>FAST BUG REPORT</span><p>Tell us the impact and what happened. Keep card identities, listing URLs, passwords, tokens, and other private data out of this report.</p></div>
        <div class="ff-beta-cdi-grid">
          ${select("severity", "How serious is it?", [["S1_BLOCKING", "S1 — I cannot continue"], ["S2_MAJOR", "S2 — Major workflow problem"], ["S3_MINOR", "S3 — Minor problem"], ["S4_COSMETIC", "S4 — Cosmetic / polish"]])}
          <label><span>What happened?</span><textarea name="summary" maxlength="1200" required placeholder="Describe the behavior and where you saw it."></textarea></label>
          <label><span>What did you expect?</span><textarea name="expected" maxlength="800" placeholder="Optional: what should have happened instead?"></textarea></label>
        </div>
        <div class="ff-beta-cdi-actions"><button class="button button-secondary" type="submit">Send issue</button><p data-ff-beta-bug-message role="status" aria-live="polite"></p></div>
        <p class="ff-beta-cdi-boundary">Issue reports are operational feedback only. They never modify a saved decision, evidence, supported value, grading guidance, or transaction authority.</p>
      </form>
    </details>`;
  }

  function bindBugReporter(node) {
    const form = node?.querySelector("[data-ff-beta-bug-form]");
    const message = node?.querySelector("[data-ff-beta-bug-message]");
    const button = form?.querySelector('button[type="submit"]');
    if (!form || !message || !button || form.dataset.ffBound === "true") return;
    form.dataset.ffBound = "true";
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const severity = String(data.get("severity") || "");
      const summary = String(data.get("summary") || "").trim();
      const expected = String(data.get("expected") || "").trim();
      if (!severity || summary.length < 10) {
        message.textContent = "Choose a severity and describe what happened.";
        message.dataset.tone = "error";
        return;
      }
      button.disabled = true;
      message.textContent = "Sending…";
      message.dataset.tone = "neutral";
      try {
        await postFeedback({
          category: "bug",
          route: routeName(),
          checkpoint: "GENERAL",
          summary,
          expected,
          severity,
        });
        form.reset();
        message.textContent = "Issue received. It is now in the operator review queue.";
        message.dataset.tone = "ok";
      } catch (_) {
        message.textContent = "The issue could not be saved. No FlipForge decision data was changed.";
        message.dataset.tone = "error";
      } finally {
        button.disabled = false;
      }
    });
  }

  function ensureBugReporter() {
    if (routeName() !== "beta-start" || !activeTester()) return;
    const feedbackPanel = document.querySelector("#beta-feedback");
    if (!feedbackPanel || document.querySelector("[data-ff-beta-bug-report]")) return;
    feedbackPanel.insertAdjacentHTML("afterend", bugMarkup());
    bindBugReporter(document.querySelector("[data-ff-beta-bug-report]"));
  }

  function decisionMarkup() {
    return `<details class="ff-beta-cdi-check" data-ff-beta-cdi-check>
      <summary><span><strong>60-second beta check</strong><small>Was this decision clear—and did it create value?</small></span><span aria-hidden="true">＋</span></summary>
      <form data-ff-beta-cdi-form>
        <div class="ff-beta-cdi-intro"><span>CARD DECISION INTELLIGENCE™</span><p>Measure comprehension and usefulness—not whether you agree with the decision.</p></div>
        <div class="ff-beta-cdi-grid">
          ${select("decisionUnderstood", "Did you understand the decision?", [["YES", "Yes"], ["PARTLY", "Partly"], ["NO", "No"]])}
          ${select("nextStepClear", "Did you know what to do next?", [["YES", "Yes"], ["PARTLY", "Partly"], ["NO", "No"]])}
          ${select("evidenceImpact", "What did the evidence do to your confidence?", [["INCREASED", "Increased it"], ["NO_CHANGE", "No change"], ["DECREASED", "Decreased it"], ["NOT_VIEWED", "I did not view the evidence"]])}
          ${select("mostUsefulLayer", "What helped most?", [["IDENTITY", "Exact card identity"], ["EVIDENCE", "Trusted vs. excluded evidence"], ["ECONOMICS", "Price and supported value"], ["RISK_UNCERTAINTY", "Risk and uncertainty"], ["DECISION", "Why FlipForge made the call"], ["RECEIPT", "Decision Receipt / traceback"], ["OUTCOME", "Tracking what happens next"], ["NONE", "Nothing yet"]])}
          ${select("surfacedImportant", "Did FlipForge surface something important you might have missed?", [["YES", "Yes"], ["NO", "No"], ["UNSURE", "Unsure"]])}
          ${select("decisionEffect", "What did the reasoning do to your planned decision?", [["CHANGED", "Changed it"], ["CONFIRMED", "Confirmed it"], ["NEITHER", "Neither"]])}
          ${select("futureUse", "Would you use FlipForge before another meaningful card purchase?", [["YES", "Yes"], ["MAYBE", "Maybe"], ["NO", "No"]])}
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

  function ensureDecisionCheck() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2 || !activeTester()) return;
    const main = document.querySelector("#main-content");
    if (!main || main.querySelector("[data-ff-beta-cdi-check]")) return;
    const target = anchor(main);
    if (!target) return;
    target.insertAdjacentHTML("afterend", decisionMarkup());
    const form = main.querySelector("[data-ff-beta-cdi-form]");
    const message = main.querySelector("[data-ff-beta-cdi-message]");
    const button = form?.querySelector('button[type="submit"]');
    if (!form || !message || !button) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const fields = ["decisionUnderstood", "nextStepClear", "evidenceImpact", "mostUsefulLayer", "surfacedImportant", "decisionEffect", "futureUse"];
      const values = Object.fromEntries(fields.map(name => [name, String(data.get(name) || "")]));
      if (fields.some(name => !values[name])) {
        message.textContent = "Answer all seven quick questions before sending.";
        message.dataset.tone = "error";
        return;
      }
      const note = String(data.get("note") || "").trim();
      const payload = {
        category: "decision-explanation",
        route: "opportunities",
        checkpoint: "GENERAL",
        summary: note || "Card Decision Intelligence comprehension and product-value check completed.",
        ...values,
      };
      button.disabled = true;
      message.textContent = "Sending…";
      message.dataset.tone = "neutral";
      try {
        await postFeedback(payload);
        form.reset();
        message.textContent = "Thank you. This helps us measure whether the reasoning is understandable and useful.";
        message.dataset.tone = "ok";
      } catch (_) {
        message.textContent = "The beta check could not be saved. Your decision was not affected.";
        message.dataset.tone = "error";
      } finally {
        button.disabled = false;
      }
    });
  }

  function ensure() {
    ensureMission();
    ensureBugReporter();
    ensureDecisionCheck();
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
