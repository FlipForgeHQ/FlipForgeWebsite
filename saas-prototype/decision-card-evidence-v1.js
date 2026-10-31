(() => {
  "use strict";

  if (window.FlipForgeDecisionCardEvidenceV1) return;
  window.FlipForgeDecisionCardEvidenceV1 = true;

  const routeParts = () => String(window.location.hash || "#/dashboard")
    .replace(/^#\/?/, "")
    .split(/[/?]/)
    .filter(Boolean)
    .map((value) => {
      try { return decodeURIComponent(value); } catch (_) { return value; }
    });
  const routeName = () => routeParts()[0] || "dashboard";
  const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Headings are read, never shown. Pages rendered by an earlier build (cached script, older backend) still carry the
  // legacy headings, so each lookup accepts the current label and the label it replaced.
  const ACCEPTED_SALES_LABELS = ["Accepted exact sales", "Matched sales", "Trusted sales"];
  const ACCEPTED_GATE_LABELS = ["Matched exact sales", "Trusted completed sales"];

  function labeledValue(root, selector, wantedLabel) {
    const wanted = Array.isArray(wantedLabel) ? wantedLabel : [wantedLabel];
    const rows = [...root.querySelectorAll(selector)];
    const match = rows.find((row) => wanted.includes(text(row.querySelector("span"))));
    return match ? text(match.querySelector("strong")) : "Unavailable";
  }

  function metricValue(root, wantedLabel) {
    return labeledValue(root, ".customer-intelligence-metrics article", wantedLabel);
  }

  function summaryValue(root, wantedLabel) {
    const wanted = Array.isArray(wantedLabel) ? wantedLabel : [wantedLabel];
    const summary = root.querySelector(".customer-value-summary");
    if (!summary) return "Unavailable";
    const nodes = [...summary.children];
    for (let index = 0; index < nodes.length; index += 1) {
      if (!wanted.includes(text(nodes[index]))) continue;
      const next = nodes[index + 1];
      if (next?.tagName === "STRONG") return text(next);
    }
    return "Unavailable";
  }

  function numericFromPage(root, labels) {
    const candidates = [...root.querySelectorAll("article,section,div")];
    for (const candidate of candidates) {
      const span = text(candidate.querySelector(":scope > span"));
      if (!labels.includes(span)) continue;
      const strong = text(candidate.querySelector(":scope > strong"));
      if (/^\d+$/.test(strong)) return strong;
    }
    const pageText = text(root);
    for (const label of labels) {
      const match = pageText.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)`, "i"));
      if (match) return match[1];
    }
    return "Unavailable";
  }

  // Identity state of the saved card. The card is matched to the exact catalog entry; it is never described as
  // "verified" (that word is reserved and never applied to identity or to reported sales).
  function exactIdentityState(root, record) {
    if (record) return String(record.mappingState || "").toUpperCase() === "CONFIRMED" ? "Exact match" : "Needs review";
    const page = text(root);
    if (/catalog link pending|identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)/i.test(page)) return "Needs review";
    if (/catalog linked|mapping\s*(?:state\s*)?CONFIRMED|exact identity[^.]{0,30}(?:verified|confirmed)/i.test(page)) return "Exact match";
    return "Review exact identity";
  }

  // Risk and confidence come from the saved record the page loaded (governedDecision.risk first), never from text.
  function scoreFromRecord(record, kind) {
    const display = window.FlipForgeTrustDisplay;
    if (!display || !record) return null;
    return display.scoreText(kind === "risk" ? display.riskValue(record) : display.confidenceValue(record));
  }

  function opportunityModel() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return null;
    const root = document.querySelector("#main-content");
    const summary = root?.querySelector("[data-ff-decision-summary]");
    const hero = root?.querySelector(".customer-intelligence-hero");
    if (!root || !summary || !hero) return null;

    // The hero status is the saved verdict; the summary pill is derived from it and never consulted first.
    // A legacy result's hero reads "SAVED BUY" (customer-trust-display-v1.js); the verdict is the last word either way.
    const heroStatus = text(hero.querySelector(".staging-status")).toUpperCase().replace(/^SAVED\s+/, "");
    const decision = ["BUY", "WATCH", "VERIFY", "PASS"].find(value => value === heroStatus) || "UNKNOWN";
    const identity = text(hero.querySelector(".customer-hero-title h2")) || "Saved card";
    const identityDetail = text(hero.querySelector(".customer-hero-copy > p"));
    const reasonParagraphs = [...summary.querySelectorAll(".ff-decision-summary-main > p")]
      .filter((node) => !node.classList.contains("ff-decision-next"));
    const why = text(reasonParagraphs[0]) || "FlipForge preserved the server-owned decision.";
    const change = text(summary.querySelector(".ff-decision-next")).replace(/^what you should do next:\s*/i, "") || "Material new evidence or price/risk changes require a fresh evaluation.";
    const accepted = numericFromPage(root, ACCEPTED_SALES_LABELS);
    const excluded = numericFromPage(root, ["Visible but ineligible", "Excluded from authority"]);
    // customer-decision-clarity-v1.js renames "Current ask" to "Listing price" and "Risk" to "Decision risk";
    // both labels are accepted, and the saved record is read first.
    const record = window.FlipForgeTrustDisplay?.recordFor(hero) || null;
    const ask = summaryValue(root, ["Listing price", "Current ask"]);
    const supportedValue = summaryValue(root, "Supported value");
    const confidence = scoreFromRecord(record, "confidence") || metricValue(root, "Confidence");
    const risk = scoreFromRecord(record, "risk") || metricValue(root, ["Decision risk", "Risk"]);
    const observed = text(hero.querySelector(".customer-tracked-state small")) || "Saved server observation";
    const id = encodeURIComponent(parts[1]);

    return {
      root,
      anchor: summary,
      decision,
      identity: identityDetail && identityDetail !== identity ? `${identity} · ${identityDetail}` : identity,
      why,
      change,
      accepted,
      excluded,
      ask,
      supportedValue,
      confidence,
      risk,
      exactIdentity: exactIdentityState(root, record),
      legacy: Boolean(hero.querySelector("[data-ff-legacy-result]") || root.querySelector(".customer-intelligence-hero [data-ff-legacy-result]")),
      economics: economicsOf(root),
      observed,
      evidenceHref: `#/evidence/${id}`,
      trackingHref: `#/tracking/${id}`,
      receiptMode: "reference"
    };
  }

  function decisionIntelligenceModel() {
    if (routeName() !== "decision-intelligence") return null;
    const root = document.querySelector('.ff-di-page[data-ff-decision-intelligence-source]');
    const command = root?.querySelector("[data-ff-di-v2-command]");
    const verdict = command?.querySelector(".ff-di-v2-verdict");
    if (!root || !command || !verdict) return null;

    return {
      root: command,
      anchor: verdict,
      decision: text(verdict.querySelector(".ff-di-v2-decision")) || "UNKNOWN",
      identity: text(verdict.querySelector(".ff-di-v2-verdict-main h2")) || "Saved opportunity",
      why: text(verdict.querySelector(".ff-di-v2-verdict-main p")) || "FlipForge preserved the server-owned decision.",
      change: text(command.querySelector(".ff-di-v2-change h3")) || "Material new evidence or price/risk changes require a fresh evaluation.",
      accepted: labeledValue(command, ".ff-di-v2-gate", ACCEPTED_GATE_LABELS),
      excluded: labeledValue(command, ".ff-di-v2-gate", "Excluded evidence"),
      ask: labeledValue(command, ".ff-di-v2-receipt-grid > div", "Evaluated ask"),
      supportedValue: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Supported value"),
      confidence: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Confidence"),
      risk: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Risk"),
      exactIdentity: labeledValue(command, ".ff-di-v2-gate", "Exact identity"),
      legacy: Boolean(command.querySelector("[data-ff-legacy-result]") || root.querySelector("[data-ff-legacy-result]")),
      economics: economicsOf(command),
      observed: labeledValue(command, ".ff-di-v2-receipt-grid > div", "Observed"),
      evidenceHref: command.querySelector(".ff-di-v2-evidence-link")?.getAttribute("href") || "#/evidence",
      trackingHref: "#/tracking",
      receiptMode: command.querySelector(".ff-di-v2-receipt") ? "attached" : "reference"
    };
  }

  function evidenceSummary(model) {
    const trusted = model.accepted === "Unavailable" ? "Qualified evidence" : model.accepted;
    const excluded = model.excluded === "Unavailable" ? "See trail" : `${model.excluded} excluded`;
    return { trusted, excluded };
  }

  // Buyer-facing interpretation of the SAVED server verdict. This layer explains
  // consequences; it does not calculate a new price, recommendation or confidence.
  const CARD_IMPACT_COPY = Object.freeze({
    BUY: ["Evidence supports considering this purchase", "For the evaluated card and asking price, FlipForge's saved decision supports BUY within the recorded risks and limits. The recommendation is not a guarantee or permission to transact."],
    WATCH: ["Not enough advantage to act yet", "The saved decision did not establish a strong enough buying opportunity at the evaluated conditions. Monitor the price, qualified evidence and risk before requesting a new evaluation."],
    VERIFY: ["Resolve the uncertainty before acting", "FlipForge could not establish enough certainty for this exact card at the evaluated conditions. Check the identity and the qualifying evidence before deciding whether to buy."],
    PASS: ["This deal does not meet the decision standard", "The saved evidence, economics and risk did not justify buying this card at the evaluated conditions. That is a judgment about this specific deal, not a prediction of the card's future value."],
    UNKNOWN: ["A supported verdict is not available", "The saved record does not provide a current supported BUY, WATCH, VERIFY or PASS interpretation. Review the original server decision and its evidence."],
  });
  // A legacy result (saved before current evidence rules; its evidence is withheld) keeps its saved verdict visible as
  // historical and never gets current-support wording such as "Evidence supports considering this purchase".
  function legacyImpact(decision) {
    return [
      "Saved before current evidence rules · not currently supported",
      "This is the recommendation saved on its date, before FlipForge's current evidence rules. The evidence behind it is withheld, so it does not support acting now. It is kept exactly as it was made and is not rescored."
    ];
  }
  const LEGACY_NEXT_STEP = "Evaluate the card again for a result under current evidence rules before relying on it. FlipForge does not bid or buy for you.";
  // Non-transactional next steps for each saved verdict. Wording only; nothing here is a calculation.
  const NEXT_STEP_COPY = Object.freeze({
    BUY: "Check the listing, the card's condition and the total cost yourself, then decide whether to proceed. FlipForge does not bid or buy for you.",
    WATCH: "Keep the card on your watch list. Come back if the price changes or new exact sales appear, and ask for a fresh evaluation then.",
    VERIFY: "Confirm the exact card (year, set, number, parallel, grade) and look for qualifying sales before relying on this result.",
    PASS: "You can move on from this listing at the evaluated price. If the price or costs change materially, request a fresh evaluation.",
    UNKNOWN: "Open the original saved decision and its evidence before acting on this card.",
  });
  const ECONOMICS_LABELS = Object.freeze([
    ["Max buy", ["Max buy", "Max Buy", "Maximum buy"]],
    ["Estimated costs", ["Estimated costs", "Costs", "Total costs", "Fees and shipping"]],
    ["Breakeven", ["Breakeven", "Break-even", "Break-even price", "Breakeven price"]],
    ["Potential profit", ["Potential profit", "Estimated profit", "Net profit"]],
  ]);
  // Reads a value the saved decision page already shows. Never computes or infers one.
  function shownValue(root, labels) {
    if (!root) return "";
    const wanted = labels.map((label) => label.toLowerCase());
    for (const node of root.querySelectorAll("span,dt,label,small,h3,th")) {
      if (!wanted.includes(text(node).toLowerCase().replace(/:$/, ""))) continue;
      const sibling = node.nextElementSibling;
      if (sibling && /^(STRONG|DD|TD|B)$/.test(sibling.tagName) && text(sibling)) return text(sibling);
      const inner = node.parentElement?.querySelector(":scope > strong");
      if (inner && inner !== node && text(inner)) return text(inner);
    }
    return "";
  }
  function economicsOf(root) {
    const out = {};
    for (const [key, labels] of ECONOMICS_LABELS) out[key] = shownValue(root, labels);
    return out;
  }
  function hasEconomics(model) {
    return Object.values(model.economics || {}).some(Boolean);
  }
  function economicsRows(model) {
    return ECONOMICS_LABELS
      .filter(([key]) => model.economics?.[key])
      .map(([key]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(model.economics[key])}</dd></div>`)
      .join("");
  }
  function nextReviewCopy(change) {
    const value = String(change || "").trim();
    // Raw internal status codes are not meaningful actions and must never
    // silently become a purported reason for changing this card's value.
    if (value && !/^[A-Z0-9]+(?:[ _][A-Z0-9]+)*$/.test(value) && value.length <= 450) return value;
    return "New exact evidence, changes to the listing price or costs, or a resolved identity/risk question require a new evaluation. The saved original decision stays unchanged.";
  }

  function render(model) {
    const evidence = evidenceSummary(model);
    const impact = model.legacy ? legacyImpact(model.decision) : (CARD_IMPACT_COPY[model.decision] || CARD_IMPACT_COPY.UNKNOWN);
    const nextStep = model.legacy ? LEGACY_NEXT_STEP : (NEXT_STEP_COPY[model.decision] || NEXT_STEP_COPY.UNKNOWN);
    const confidenceLabel = model.legacy ? "Confidence at the time" : "Confidence";
    // The original evidence of a legacy result is withheld; a bare 0 would read as "no evidence was used".
    if (model.legacy && (evidence.trusted === "0" || evidence.trusted === 0 || evidence.trusted === "Qualified evidence")) {
      evidence.trusted = "Withheld";
      evidence.excluded = "Original evidence withheld";
    }
    const signature = JSON.stringify([
      model.decision, model.identity, model.why, model.change, model.accepted, model.excluded,
      model.ask, model.supportedValue, model.economics, model.confidence, model.risk, model.exactIdentity,
      model.observed, model.evidenceHref, model.trackingHref, model.receiptMode, model.legacy === true
    ]);

    let panel = model.root.querySelector("[data-ff-decision-card-evidence]");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "ff-decision-card-evidence ff-dce-passport-motion";
      panel.dataset.ffDecisionCardEvidence = "v1";
      model.anchor.insertAdjacentElement("afterend", panel);
    }
    if (panel.dataset.ffDecisionCardSignature === signature) return;
    panel.dataset.ffDecisionCardSignature = signature;
    panel.classList.add("ff-dce-passport-motion");

    const receiptAction = model.receiptMode === "attached"
      ? '<button type="button" data-ff-open-decision-receipt>Open Decision Receipt</button>'
      : '<span class="ff-dce-boundary">Receipt authority remains server-owned; this beta card does not reconstruct it in the browser.</span>';

    panel.innerHTML = `
      <header class="ff-dce-head">
        <div>
          <span class="ff-dce-kicker">CARD DECISION INTELLIGENCE™</span>
          <h3>Evidence behind this decision</h3>
          <p>The decision stays first. Expand the seven layers when you want the proof behind it.</p>
        </div>
        <span class="ff-dce-state">Saved evidence</span>
      </header>

      <div class="ff-dce-summary" aria-label="Decision Card evidence summary">
        <article data-tone="identity"><span>Exact card</span><strong>${escapeHtml(model.exactIdentity)}</strong><small>${escapeHtml(model.identity)}</small></article>
        <article data-tone="evidence"><span>Evidence</span><strong>${escapeHtml(evidence.trusted)}</strong><small>${escapeHtml(evidence.excluded)}</small></article>
        <article data-tone="risk"><span>Risk + uncertainty</span><strong>${escapeHtml(model.risk)}</strong><small>${escapeHtml(confidenceLabel)} ${escapeHtml(model.confidence)}</small></article>
      </div>

      <section class="ff-dce-impact" aria-labelledby="ff-dce-impact-title">
        <div class="ff-dce-impact-lead">
          <span>WHAT THIS DECISION MEANS FOR THIS CARD</span>
          <h4 id="ff-dce-impact-title">${escapeHtml(model.decision)} · ${escapeHtml(impact[0])}</h4>
          <p>${escapeHtml(impact[1])}</p>
        </div>
        <details class="ff-dce-more" open>
          <summary><strong>Why FlipForge decided this</strong><small>The evidence and factors behind the saved verdict</small></summary>
          <p>${escapeHtml(model.why)}</p>
          <p class="ff-dce-note">Card: ${escapeHtml(model.identity)} · Identity status: ${escapeHtml(model.exactIdentity)}</p>
        </details>
        <details class="ff-dce-more">
          <summary><strong>What it means financially</strong><small>Only values the saved decision actually shows</small></summary>
          <dl class="ff-dce-impact-grid">
            <div><dt>Evaluated asking price</dt><dd>${escapeHtml(model.ask)}</dd></div>
            <div><dt>Supported value</dt><dd>${escapeHtml(model.supportedValue)}</dd></div>
            ${economicsRows(model)}
          </dl>
          <p class="ff-dce-note">${hasEconomics(model) ? "Figures are shown exactly as the saved server decision recorded them." : "The saved decision does not show a Max Buy, costs, breakeven or potential profit for this card. FlipForge does not estimate them in the browser."}</p>
        </details>
        <details class="ff-dce-more">
          <summary><strong>How reliable this information is</strong><small>Evidence counted, excluded, and uncertainty</small></summary>
          <dl class="ff-dce-impact-grid">
            <div><dt>Evidence that counted</dt><dd>${escapeHtml(evidence.trusted)}</dd></div>
            <div><dt>Excluded or unqualified</dt><dd>${escapeHtml(evidence.excluded)}</dd></div>
            <div><dt>Decision risk</dt><dd>${escapeHtml(model.risk)}</dd></div>
            <div><dt>${escapeHtml(confidenceLabel)}</dt><dd>${escapeHtml(model.confidence)}</dd></div>
          </dl>
          <p class="ff-dce-note">Confidence and risk scores describe the evidence behind this decision. They are not probabilities of a future outcome.</p>
        </details>
        <div class="ff-dce-impact-next"><strong>What to do next</strong><p>${escapeHtml(nextStep)}</p></div>
        <div class="ff-dce-impact-next"><strong>What could change the conclusion</strong><p>${escapeHtml(nextReviewCopy(model.change))}</p></div>
        <p class="ff-dce-impact-disclosure">Decision support only. Not investment advice. No transaction authority. The original saved decision is not rescored in this report. The full Decision Receipt and traceback are below.</p>
      </section>

      <details class="ff-dce-layers">
        <summary><span><strong>View the 7 evidence layers</strong><small>Identity → Evidence → Economics → Risk → Decision → Traceback → Outcome</small></span><span aria-hidden="true">＋</span></summary>
        <ol>
          <li data-cdi-layer="identity"><span class="ff-dce-number">01</span><div><strong>Identity Intelligence</strong><p>${escapeHtml(model.identity)}</p><small>Exact identity: ${escapeHtml(model.exactIdentity)}</small></div></li>
          <li data-cdi-layer="evidence"><span class="ff-dce-number">02</span><div><strong>Evidence Intelligence</strong><p>${escapeHtml(evidence.trusted)} · ${escapeHtml(evidence.excluded)}</p><small>Only authority-eligible exact completed-sale evidence can support value.</small><a href="${escapeHtml(model.evidenceHref)}">Open full evidence trail →</a></div></li>
          <li data-cdi-layer="economics"><span class="ff-dce-number">03</span><div><strong>Economic Intelligence</strong><p>${escapeHtml(model.ask)} ask · ${escapeHtml(model.supportedValue)} supported value</p><small>This surface presents server-owned economics and does not infer profit or recompute value.</small></div></li>
          <li data-cdi-layer="risk"><span class="ff-dce-number">04</span><div><strong>Risk + Uncertainty Intelligence</strong><p>${escapeHtml(model.risk)} · confidence ${escapeHtml(model.confidence)}</p><small>Unresolved evidence remains visible instead of being converted into false certainty.</small></div></li>
          <li data-cdi-layer="decision"><span class="ff-dce-number">05</span><div><strong>Decision Intelligence</strong><p>${escapeHtml(model.decision)} — ${escapeHtml(model.why)}</p><small>${escapeHtml(model.change)}</small></div></li>
          <li data-cdi-layer="traceback"><span class="ff-dce-number">06</span><div><strong>Traceback Intelligence</strong><p>${escapeHtml(model.observed)}</p><small>The receipt preserves what the governed system knew and returned.</small>${receiptAction}</div></li>
          <li data-cdi-layer="outcome"><span class="ff-dce-number">07</span><div><strong>Outcome Intelligence</strong><p>Track what happened after the decision.</p><small>Use the governed Tracking workflow for 7 / 14 / 30 outcome review.</small><a href="${escapeHtml(model.trackingHref)}">Continue to Tracking →</a></div></li>
        </ol>
      </details>`;

    [...panel.querySelectorAll(".ff-dce-layers li")].forEach((item,index)=>item.style.setProperty("--ff-dce-i",String(index)));
  }

  function enhance() {
    const model = opportunityModel() || decisionIntelligenceModel();
    if (model) render(model);
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element ? event.target.closest("[data-ff-open-decision-receipt]") : null;
    if (!trigger) return;
    const container = trigger.closest("[data-ff-di-v2-command]");
    const receipt = container?.querySelector(".ff-di-v2-receipt");
    if (!receipt) return;
    receipt.open = true;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    receipt.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  });

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  window.addEventListener("hashchange", schedule);
  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  schedule();
})();
