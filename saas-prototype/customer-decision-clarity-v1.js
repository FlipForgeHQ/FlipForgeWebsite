(() => {
  "use strict";

  if (window.FlipForgeDecisionClarityV1) return;

  const DECISION_COPY = Object.freeze({
    BUY: "The saved evidence supports this purchase at the evaluated price, within the stated risks and limits.",
    WATCH: "There may be an opportunity here, but the price or evidence is not strong enough yet.",
    VERIFY: "There is not enough matching evidence yet to make this purchase confidently.",
    PASS: "The current evidence does not justify this purchase at the evaluated price.",
    UNKNOWN: "FlipForge has not returned a customer-facing decision for this saved record."
  });

  const state = { scheduled: false, applying: false };

  function text(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function decisionLabel(root) {
    const chip = root.querySelector(".customer-intelligence-hero .customer-hero-title .staging-status");
    // Saved decisions show the chip as "Saved BUY"; the verdict is the last word either way.
    const value = text(chip).toUpperCase().replace(/^SAVED\s+/, "");
    return Object.prototype.hasOwnProperty.call(DECISION_COPY, value) ? value : "UNKNOWN";
  }

  function metric(root, name) {
    const target = String(name || "").toLowerCase();
    const article = [...root.querySelectorAll(".customer-intelligence-metrics article")]
      .find(row => text(row.querySelector("span")).toLowerCase() === target);
    return article ? text(article.querySelector("strong")) : "";
  }

  // Decision risk as the API returned it for this saved card (governedDecision.risk, else risk). Display only.
  // It used to be scraped from the metric text: "35/100" with every non-digit removed became 35100, which was
  // clamped to 100 and shown as "High — 100/100" for a saved risk of 35.
  function savedRecord(root) {
    const hero = root.querySelector(".customer-intelligence-hero");
    return window.FlipForgeTrustDisplay?.recordFor(hero) || null;
  }

  function riskBand(score) {
    if (window.FlipForgeTrustDisplay) return window.FlipForgeTrustDisplay.riskBand(score);
    const bounded = Math.max(0, Math.min(100, score));
    return bounded >= 70 ? "High" : bounded >= 35 ? "Moderate" : "Low";
  }

  function riskDisplay(root) {
    const record = savedRecord(root);
    let score = null;
    if (record) {
      score = window.FlipForgeTrustDisplay.riskValue(record);
    } else {
      // No saved record registered: read only a whole "N/100" score; anything else is unavailable.
      const match = String(metric(root, "Decision risk") || metric(root, "Risk")).match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*100\s*$/);
      score = match ? Number(match[1]) : null;
    }
    if (score === null || !Number.isFinite(score)) return { label: "Unavailable", score: "" };
    return { label: riskBand(score), score: `${score}/100` };
  }

  function legacyRecord(root) {
    return Boolean(root.querySelector(".customer-intelligence-hero [data-ff-legacy-result]"));
  }

  function valueFacts(root) {
    const summary = root.querySelector(".customer-value-summary");
    if (!summary) return { ask: "Unavailable", supported: "Unavailable" };
    const labels = [...summary.querySelectorAll(":scope > span")];
    const values = [...summary.querySelectorAll(":scope > strong")];
    const facts = {
      ask: values[0] ? text(values[0]) : "Unavailable",
      supported: values[1] ? text(values[1]) : "Unavailable"
    };
    setText(labels[0], "Ask when evaluated"); // the saved evaluation's ask, not a re-checked listing
    setText(labels[1], "Supported value");
    const gap = summary.querySelector(":scope > small");
    if (gap && /saved value gap/i.test(gap.textContent || "")) {
      setText(gap, String(gap.textContent || "").replace(/saved value gap/ig, "difference from supported value"));
    }
    return facts;
  }

  function panelByHeading(root, pattern) {
    return [...root.querySelectorAll("section.panel")]
      .find(panel => pattern.test(text(panel.querySelector(".panel-header h2"))));
  }

  function evidenceFact(root) {
    const detail = panelByHeading(root, /Decision Traceback|Decision details/i);
    const steps = detail ? [...detail.querySelectorAll(".customer-trace-step")] : [];
    const evidenceStep = steps.find(step => /^2\s*·\s*Evidence/i.test(text(step.querySelector("span")))) || steps[1];
    if (!evidenceStep) return "Evidence details are available below.";
    const title = text(evidenceStep.querySelector("strong"));
    if (!title) return "Evidence details are available below.";
    return title.endsWith(".") ? title : `${title}.`;
  }

  function createWhyPanel(root, decision, facts, risk) {
    if (root.querySelector("[data-ff-decision-why]")) return;
    const hero = root.querySelector(".customer-intelligence-hero");
    if (!hero) return;

    const valueReason = legacyRecord(root)
      ? "Value: not currently supported. This result was saved before current evidence rules."
      : facts.supported && facts.supported !== "Unavailable"
      ? `Value: supported value is ${facts.supported} against a ${facts.ask} listing price.`
      : "Value: no supported value is shown without accepted exact completed-sale evidence.";
    const evidenceReason = `Evidence: ${evidenceFact(root)}`;
    const riskReason = risk.score
      ? `Decision risk: ${risk.label} (${risk.score}). This is the saved decision risk; deeper market-factor values are inputs, not replacements for this score.`
      : "Decision risk: the saved decision risk is unavailable for this record.";

    const panel = document.createElement("section");
    panel.className = "panel ff-decision-why";
    panel.setAttribute("data-ff-decision-why", "");
    panel.innerHTML = `<div class="panel-body">
      <div class="ff-why-head"><span class="eyebrow">Why</span><h2>${legacyRecord(root) ? `Why FlipForge saved ${escapeHtml(decision)}` : `Why FlipForge says ${escapeHtml(decision)}`}</h2></div>
      <ul class="ff-why-list">
        <li>${escapeHtml(valueReason)}</li>
        <li>${escapeHtml(evidenceReason)}</li>
        <li>${escapeHtml(riskReason)}</li>
      </ul>
      <div class="ff-why-actions">
        <button class="button button-primary" type="button" data-ff-scroll-target="ff-evidence-chain">View evidence</button>
        <button class="button button-secondary" type="button" data-ff-scroll-target="ff-decision-details">See decision details</button>
      </div>
    </div>`;
    hero.insertAdjacentElement("afterend", panel);
  }

  // "2026-10-08T17:55:16.566881179Z" -> "Oct 8, 2026" (UTC date). Anything that is not an ISO timestamp is kept as is.
  function readableDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/.exec(String(value || "").trim());
    if (!match) return value;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${months[month - 1]} ${Number(match[3])}, ${match[1]}` : value;
  }

  function simplifySavedState(root) {
    const tracked = root.querySelector(".customer-tracked-state");
    if (!tracked) return;
    const strong = tracked.querySelector("strong");
    const small = tracked.querySelector("small");
    setText(strong, "Decision saved");
    if (small && !/^Saved to your account/.test(text(small))) {
      const original = text(small);
      const raw = original.includes("·") ? original.split("·").slice(-1)[0].trim() : original;
      const marker = readableDate(raw);
      setText(small, marker ? `Saved to your account · ${marker}` : "Saved to your account");
    }
  }

  function promoteDecisionMeaning(root, decision, risk) {
    const copy = root.querySelector(".customer-intelligence-hero .customer-hero-copy");
    if (!copy) return;
    let meaning = copy.querySelector(".ff-decision-meaning");
    if (!meaning) {
      meaning = document.createElement("p");
      meaning.className = "ff-decision-meaning";
      copy.querySelector(".customer-hero-title")?.insertAdjacentElement("afterend", meaning);
    }
    // A legacy result keeps its saved recommendation visible as historical, without current-support copy.
    setText(meaning, legacyRecord(root)
      ? `Saved recommendation: ${decision}. ${window.FlipForgeTrustDisplay?.LEGACY_HISTORICAL || "It is not presented as currently supported."}`
      : (DECISION_COPY[decision] || DECISION_COPY.UNKNOWN));

    let riskChip = copy.querySelector(".ff-risk-summary");
    if (!riskChip) {
      riskChip = document.createElement("div");
      riskChip.className = "ff-risk-summary";
      meaning.insertAdjacentElement("afterend", riskChip);
    }
    const markup = `<span>Decision risk</span><strong>${escapeHtml(risk.label)}</strong>${risk.score ? `<small>${escapeHtml(risk.score)} saved decision risk</small>` : ""}`;
    if (riskChip.innerHTML !== markup) riskChip.innerHTML = markup;
  }

  function clarifyRiskSemantics(root) {
    const riskMetric = [...root.querySelectorAll(".customer-intelligence-metrics article")]
      .find(article => ["risk", "decision risk"].includes(text(article.querySelector("span")).toLowerCase()));
    setText(riskMetric?.querySelector("span"), "Decision risk");

    const detail = panelByHeading(root, /Decision Traceback|Decision details/i);
    const marketStep = detail
      ? [...detail.querySelectorAll(".customer-trace-step")]
        .find(step => /^3\s*·\s*Market factors/i.test(text(step.querySelector("span"))))
      : null;
    const marketTitle = marketStep?.querySelector("strong");
    if (marketTitle && /\bRisk\b/i.test(text(marketTitle)) && !/Market risk factor/i.test(text(marketTitle))) {
      setText(marketTitle, text(marketTitle).replace(/\bRisk\b/i, "Market risk factor"));
    }
    const marketDetail = marketStep?.querySelector("p");
    const distinction = "Market risk is one saved input; the saved decision risk is shown at the top.";
    if (marketDetail && !/saved decision risk is shown at the top/i.test(text(marketDetail))) {
      setText(marketDetail, `${text(marketDetail)} ${distinction}`.trim());
    }
  }

  function collapseAdvancedMetrics(root) {
    const metrics = root.querySelector(".customer-intelligence-metrics");
    if (!metrics || metrics.closest(".ff-decision-advanced")) return;
    const details = document.createElement("details");
    details.className = "panel ff-decision-advanced";
    details.innerHTML = `<summary><span><strong>More decision detail</strong><small>Confidence, liquidity, market factors and rank</small></span><span aria-hidden="true">+</span></summary>`;
    metrics.insertAdjacentElement("beforebegin", details);
    details.appendChild(metrics);
  }

  function renameDeepSections(root) {
    const traceback = panelByHeading(root, /Decision Traceback|Decision details/i);
    const evidence = panelByHeading(root, /^Evidence Chain$|^Evidence$/i);
    const readiness = panelByHeading(root, /Evidence readiness|Evidence details/i);
    const psa = panelByHeading(root, /Saved PSA guidance|PSA context/i);

    if (traceback) {
      if (traceback.id !== "ff-decision-details") traceback.id = "ff-decision-details";
      setText(traceback.querySelector(".panel-header h2"), "Decision details");
      setText(traceback.querySelector(".panel-header p"), "How the saved decision was reached. No browser-side scoring.");
    }
    if (evidence) {
      if (evidence.id !== "ff-evidence-chain") evidence.id = "ff-evidence-chain";
      setText(evidence.querySelector(".panel-header h2"), "Evidence");
      setText(evidence.querySelector(".panel-header p"), "Exact completed-sale evidence that can support the saved decision, plus excluded rows.");
    }
    if (readiness) {
      setText(readiness.querySelector(".panel-header h2"), "Evidence details");
      setText(readiness.querySelector(".panel-header p"), "What the engine could and could not use.");
    }
    if (psa) {
      if (psa.id !== "ff-psa-context") psa.id = "ff-psa-context";
      setText(psa.querySelector(".panel-header h2"), "PSA context");
      setText(psa.querySelector(".panel-header p"), "Saved PSA guidance from the existing grading intelligence. No grade is predicted here.");
    }

    root.querySelectorAll(".customer-decision-boundary .eyebrow").forEach(node => {
      setText(node, "Before you buy. Know Why.");
    });
  }

  function simplifyList(root) {
    if (root.querySelector(".customer-intelligence-hero")) return;
    const heading = root.querySelector(".page-heading");
    if (heading && /Opportunities/i.test(text(heading.querySelector("h1")))) {
      setText(heading.querySelector("p"), "Saved decisions, value context, and evidence — all in one place.");
    }
    const list = root.querySelector(".customer-intelligence-list");
    if (list) {
      setText(list.querySelector(".panel-header h2"), "Saved decisions");
      setText(list.querySelector(".panel-header p"), "Open a card to see the decision, value, risk, why, and evidence.");
      setText(list.querySelector(".panel-header .staging-status"), "Saved");
    }
  }

  function apply() {
    if (state.applying) return;
    state.applying = true;
    try {
      const root = document.querySelector("#main-content .customer-intelligence-page");
      if (!root) return;
      simplifyList(root);
      const hero = root.querySelector(".customer-intelligence-hero");
      if (!hero) return;

      const decision = decisionLabel(root);
      const risk = riskDisplay(root);
      const facts = valueFacts(root);
      clarifyRiskSemantics(root);

      if (hero.dataset.ffDecisionClarity !== "v1") hero.dataset.ffDecisionClarity = "v1";
      setText(root.querySelector(".page-heading p"), "Decision, value, risk, why, and evidence — with deeper detail when you need it.");

      simplifySavedState(root);
      promoteDecisionMeaning(root, decision, risk);
      const interactiveWhy = root.querySelector("[data-ff-cdi-stack], [data-ff-cdi-stack-host]");
      if (interactiveWhy) root.querySelector("[data-ff-decision-why]")?.remove();
      else createWhyPanel(root, decision, facts, risk);
      collapseAdvancedMetrics(root);
      renameDeepSections(root);
    } finally {
      state.applying = false;
    }
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    window.requestAnimationFrame(() => {
      state.scheduled = false;
      apply();
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-ff-scroll-target]");
    if (!button) return;
    const id = String(button.getAttribute("data-ff-scroll-target") || "");
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const main = document.getElementById("main-content");
  if (main) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("load", schedule, { once: true });

  window.FlipForgeDecisionClarityV1 = Object.freeze({ apply: schedule });
  schedule();
})();
