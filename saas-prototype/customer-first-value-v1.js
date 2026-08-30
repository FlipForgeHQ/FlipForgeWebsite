(() => {
  "use strict";

  if (window.FlipForgeCustomerFirstValueV1) return;

  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const DECISION_COPY = Object.freeze({
    BUY: "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.",
    WATCH: "There may be an opportunity here, but the price or evidence is not strong enough yet.",
    VERIFY: "There is not enough trustworthy evidence yet to make this purchase confidently.",
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

  function exactDecision(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(DECISION_COPY, normalized) ? normalized : "";
  }

  function riskLabel(raw) {
    const score = Number.parseFloat(String(raw || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(score)) return { label: "Unavailable", score: "" };
    const bounded = Math.max(0, Math.min(100, score));
    return {
      label: bounded >= 70 ? "High" : bounded >= 35 ? "Moderate" : "Low",
      score: `${Math.round(bounded)}/100`
    };
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function pageRoot() {
    return document.querySelector("#main-content");
  }

  function decisionKeyAllowed(root) {
    const route = routeName();
    if (["dashboard", "discover", "tracking", "forge-heat", "evaluate"].includes(route)) return true;
    if (route === "opportunities" && !root.querySelector(".customer-intelligence-hero")) return true;
    return false;
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
      if (!decision) return;
      chip.dataset.ffDecision = decision;
      chip.title = DECISION_COPY[decision];
      chip.setAttribute("aria-label", `${decision}. ${DECISION_COPY[decision]}`);
    });
  }

  function replaceBoundaryWithTrustNote(root) {
    const boundary = root.querySelector(".customer-evaluation-page > .boundary-note");
    if (!boundary || boundary.dataset.ffTrustConverted === "true") return;
    const details = document.createElement("details");
    details.className = "ff-trust-note";
    details.dataset.ffTrustConverted = "true";
    details.innerHTML = `<summary>How FlipForge protects this decision</summary><p>Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the grading-guidance authority. The browser submits facts only; it cannot accept evidence, silently verify uncertain identity, predict a grade, or authorize a transaction.</p>`;
    boundary.replaceWith(details);
  }

  function installEvaluateFlow(root) {
    if (root.querySelector("[data-ff-evaluate-flow]")) return;
    const heading = root.querySelector(".customer-evaluation-page .page-heading");
    if (!heading) return;
    const flow = document.createElement("div");
    flow.className = "ff-evaluate-flow";
    flow.setAttribute("data-ff-evaluate-flow", "");
    flow.innerHTML = `<div><span>1</span><strong>Card</strong><small>Confirm the exact card and listing</small></div>
      <div><span>2</span><strong>Cost</strong><small>Enter the real all-in price</small></div>
      <div><span>3</span><strong>Decision</strong><small>Get the saved FlipForge answer</small></div>`;
    heading.insertAdjacentElement("afterend", flow);
  }

  function renameField(form, name, label, hint = "") {
    const input = form.querySelector(`[name="${name}"]`);
    const wrapper = input?.closest("label");
    if (!wrapper) return;
    const title = wrapper.querySelector(":scope > span");
    if (title) {
      const required = input.required ? " *" : "";
      setText(title, `${label}${required}`);
    }
    if (hint) {
      let small = wrapper.querySelector(":scope > small");
      if (!small) {
        small = document.createElement("small");
        wrapper.appendChild(small);
      }
      setText(small, hint);
    }
  }

  function groupOptionalEvaluateFields(form) {
    if (form.querySelector("[data-ff-evaluate-optional]")) return;
    const names = ["seller", "listingFormat", "endsAt"];
    const fields = names.map(name => form.querySelector(`[name="${name}"]`)?.closest("label")).filter(Boolean);
    if (!fields.length) return;
    const stepThree = [...form.querySelectorAll(".customer-intake-step")][2];
    if (!stepThree) return;
    const details = document.createElement("details");
    details.className = "ff-evaluate-optional";
    details.setAttribute("data-ff-evaluate-optional", "");
    details.innerHTML = `<summary>Optional listing details</summary><div class="staging-form-grid"></div>`;
    const grid = details.querySelector(".staging-form-grid");
    fields.forEach(field => grid.appendChild(field));
    stepThree.insertAdjacentElement("beforebegin", details);
  }

  function polishEvaluateForm(root) {
    const page = root.querySelector(".customer-evaluation-page");
    if (!page) return;
    const heading = page.querySelector(".page-heading");
    if (heading) {
      setText(heading.querySelector(".eyebrow"), "Before you buy");
      setText(heading.querySelector("h1"), "Evaluate a Card");
      setText(heading.querySelector("p"), "Confirm the exact card, enter the real cost, and let FlipForge return the saved decision.");
    }

    installEvaluateFlow(root);
    replaceBoundaryWithTrustNote(root);

    const panel = page.querySelector(".staging-evaluation-panel");
    if (panel) {
      setText(panel.querySelector(".panel-header h2"), "Tell FlipForge what you're considering");
      setText(panel.querySelector(".panel-header p"), "Confirm the exact card and listing, then enter what it will really cost you.");
      const badge = panel.querySelector(".panel-header .staging-status");
      if (badge && /write boundary/i.test(text(badge))) setText(badge, "Decision support");
    }

    const form = page.querySelector("[data-staging-evaluation-form]");
    if (!form) return;
    const steps = [...form.querySelectorAll(".customer-intake-step")];
    const stepCopy = [
      ["Confirm the exact card and listing", "Card number, parallel and grade/condition should match the card you actually mean."],
      ["Enter your real all-in cost", "Price, shipping, buyer premium and tax can all change the decision."],
      ["Review and get the decision", "FlipForge uses the saved engine result; the browser never chooses BUY/WATCH/VERIFY/PASS."]
    ];
    steps.forEach((step, index) => {
      if (!stepCopy[index]) return;
      setText(step.querySelector("strong"), stepCopy[index][0]);
      setText(step.querySelector("small"), stepCopy[index][1]);
    });

    renameField(form, "externalListingId", "Listing ID", "Use the marketplace listing number or other stable listing identifier.");
    renameField(form, "cardIdentity", "Exact card", "Include year, set, player, card number, parallel, and grade/condition when known.");
    renameField(form, "listingUrl", "Listing link");
    renameField(form, "itemPrice", "Price");
    renameField(form, "buyerPremium", "Buyer premium");
    renameField(form, "endsAt", "Listing end");
    groupOptionalEvaluateFields(form);

    const boundaryCheck = form.querySelector(".staging-boundary-check span");
    if (boundaryCheck) {
      setText(boundaryCheck, "I understand FlipForge provides decision support. It does not place bids or purchases, predict grades, or silently verify uncertain identity or evidence for me.");
    }
    const note = form.querySelector(".staging-form-note");
    if (note) setText(note, "Retry protection is automatic; an unchanged evaluation is not silently duplicated.");

    const submit = form.querySelector('button[type="submit"]');
    if (submit && !/evaluating/i.test(text(submit))) setText(submit, "Get FlipForge decision");
  }

  function gridValue(panel, label) {
    const target = String(label || "").toLowerCase();
    const row = [...panel.querySelectorAll(".staging-key-grid > div")]
      .find(item => text(item.querySelector("span")).toLowerCase() === target);
    return row ? text(row.querySelector("strong")) : "Unavailable";
  }

  function resultCopy(panel, prefix) {
    const target = String(prefix || "").toLowerCase();
    const row = [...panel.querySelectorAll(".staging-result-copy p")]
      .find(item => text(item.querySelector("strong")).toLowerCase().startsWith(target));
    if (!row) return "";
    const clone = row.cloneNode(true);
    clone.querySelector("strong")?.remove();
    return text(clone);
  }

  function collapseEvaluationDetail(panel) {
    if (panel.querySelector("[data-ff-evaluate-result-details]")) return;
    const body = panel.querySelector(".panel-body");
    if (!body) return;
    const actions = body.querySelector(".staging-form-actions");
    const detailNodes = [
      body.querySelector(":scope > .staging-key-grid"),
      body.querySelector(":scope > .staging-value-intelligence"),
      body.querySelector(":scope > .staging-result-copy"),
      body.querySelector(":scope > .boundary-note")
    ].filter(Boolean);
    if (!detailNodes.length) return;
    const details = document.createElement("details");
    details.className = "ff-evaluate-result-details";
    details.setAttribute("data-ff-evaluate-result-details", "");
    details.innerHTML = `<summary><span><strong>More decision detail</strong><small>Raw scores, workflow status, requirements and authority notes</small></span><span aria-hidden="true">+</span></summary><div class="ff-evaluate-result-details-body"></div>`;
    const target = details.querySelector(".ff-evaluate-result-details-body");
    detailNodes.forEach(node => target.appendChild(node));
    if (actions) actions.insertAdjacentElement("beforebegin", details);
    else body.appendChild(details);
  }

  function polishEvaluateResult(root) {
    const panel = root.querySelector(".customer-evaluation-page .staging-evaluation-result");
    if (!panel || panel.querySelector("[data-ff-evaluate-result-summary]")) return;
    const decision = exactDecision(text(panel.querySelector(".panel-header .staging-status")));
    if (!decision) return;
    const supported = gridValue(panel, "Supported value");
    const allIn = gridValue(panel, "All-in acquisition");
    const risk = riskLabel(gridValue(panel, "Risk"));
    const reason = resultCopy(panel, "Reason") || "Open Card Intelligence to inspect the saved reason trail.";
    const missing = resultCopy(panel, "Missing requirement");
    const next = resultCopy(panel, "Next action") || "Open Card Intelligence and review the evidence before acting.";

    setText(panel.querySelector(".panel-header h2"), "Your FlipForge decision");
    setText(panel.querySelector(".panel-header p"), "Read the answer first. Open Card Intelligence when you want the evidence behind it.");

    const summary = document.createElement("div");
    summary.className = "ff-evaluate-result-summary";
    summary.setAttribute("data-ff-evaluate-result-summary", "");
    const missingMarkup = missing && !/^none returned\.?$/i.test(missing)
      ? `<div class="ff-evaluate-caution"><span>Still needed</span><strong>${missing}</strong></div>`
      : "";
    summary.innerHTML = `<div class="ff-evaluate-answer"><span>Decision</span><strong>${decision}</strong><p>${DECISION_COPY[decision]}</p></div>
      <div class="ff-evaluate-result-facts">
        <div><span>Supported value</span><strong>${supported}</strong></div>
        <div><span>All-in cost</span><strong>${allIn}</strong></div>
        <div><span>Risk</span><strong>${risk.label}</strong><small>${risk.score ? `${risk.score} saved score` : "Saved score unavailable"}</small></div>
      </div>
      <div class="ff-evaluate-why"><span>Why</span><strong>${reason}</strong></div>
      ${missingMarkup}
      <div class="ff-evaluate-next"><span>What to do next</span><strong>${next}</strong></div>`;
    const body = panel.querySelector(".panel-body");
    if (body) body.insertAdjacentElement("afterbegin", summary);
    collapseEvaluationDetail(panel);
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
      annotateDecisionChips(root);
      installDecisionKey(root);
      if (routeName() === "evaluate") {
        polishEvaluateForm(root);
        polishEvaluateResult(root);
      }
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