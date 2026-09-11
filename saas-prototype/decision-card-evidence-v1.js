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

  function labeledValue(root, selector, wantedLabel) {
    const rows = [...root.querySelectorAll(selector)];
    const match = rows.find((row) => text(row.querySelector("span")) === wantedLabel);
    return match ? text(match.querySelector("strong")) : "Unavailable";
  }

  function metricValue(root, wantedLabel) {
    return labeledValue(root, ".customer-intelligence-metrics article", wantedLabel);
  }

  function summaryValue(root, wantedLabel) {
    const summary = root.querySelector(".customer-value-summary");
    if (!summary) return "Unavailable";
    const nodes = [...summary.children];
    for (let index = 0; index < nodes.length; index += 1) {
      if (text(nodes[index]) !== wantedLabel) continue;
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

  function exactIdentityState(root) {
    const page = text(root);
    if (/CardSight catalog linked|mapping\s*(?:state\s*)?CONFIRMED|exact identity[^.]{0,30}(?:verified|confirmed)/i.test(page)) return "Verified";
    if (/catalog link pending|identity needs verification|mapping\s*(?:not confirmed|NOT_CONFIRMED)/i.test(page)) return "Needs review";
    return "Review exact identity";
  }

  function opportunityModel() {
    const parts = routeParts();
    if (parts[0] !== "opportunities" || parts.length < 2) return null;
    const root = document.querySelector("#main-content");
    const summary = root?.querySelector("[data-ff-decision-summary]");
    const hero = root?.querySelector(".customer-intelligence-hero");
    if (!root || !summary || !hero) return null;

    const decision = text(summary.querySelector(".ff-decision-summary-pill"))
      || text(hero.querySelector(".staging-status"))
      || "UNKNOWN";
    const identity = text(hero.querySelector(".customer-hero-title h2")) || "Saved card";
    const identityDetail = text(hero.querySelector(".customer-hero-copy > p"));
    const reasonParagraphs = [...summary.querySelectorAll(".ff-decision-summary-main > p")]
      .filter((node) => !node.classList.contains("ff-decision-next"));
    const why = text(reasonParagraphs[0]) || "FlipForge preserved the server-owned decision.";
    const change = text(summary.querySelector(".ff-decision-next")) || "Material new evidence or price/risk changes require a fresh evaluation.";
    const accepted = numericFromPage(root, ["Accepted exact sales", "Trusted sales"]);
    const excluded = numericFromPage(root, ["Visible but ineligible", "Excluded from authority"]);
    const ask = summaryValue(root, "Current ask");
    const supportedValue = summaryValue(root, "Supported value");
    const confidence = metricValue(root, "Confidence");
    const risk = metricValue(root, "Risk");
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
      exactIdentity: exactIdentityState(root),
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
      accepted: labeledValue(command, ".ff-di-v2-gate", "Trusted completed sales"),
      excluded: labeledValue(command, ".ff-di-v2-gate", "Excluded evidence"),
      ask: labeledValue(command, ".ff-di-v2-receipt-grid > div", "Evaluated ask"),
      supportedValue: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Supported value"),
      confidence: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Confidence"),
      risk: labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Risk"),
      exactIdentity: labeledValue(command, ".ff-di-v2-gate", "Exact identity"),
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

  function render(model) {
    const evidence = evidenceSummary(model);
    const signature = JSON.stringify([
      model.decision, model.identity, model.why, model.change, model.accepted, model.excluded,
      model.ask, model.supportedValue, model.confidence, model.risk, model.exactIdentity,
      model.observed, model.evidenceHref, model.trackingHref, model.receiptMode
    ]);

    let panel = model.root.querySelector("[data-ff-decision-card-evidence]");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "ff-decision-card-evidence";
      panel.dataset.ffDecisionCardEvidence = "v1";
      model.anchor.insertAdjacentElement("afterend", panel);
    }
    if (panel.dataset.ffDecisionCardSignature === signature) return;
    panel.dataset.ffDecisionCardSignature = signature;

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
        <span class="ff-dce-state">Server-owned evidence</span>
      </header>

      <div class="ff-dce-summary" aria-label="Decision Card evidence summary">
        <article data-tone="identity"><span>Exact card</span><strong>${escapeHtml(model.exactIdentity)}</strong><small>${escapeHtml(model.identity)}</small></article>
        <article data-tone="evidence"><span>Evidence</span><strong>${escapeHtml(evidence.trusted)}</strong><small>${escapeHtml(evidence.excluded)}</small></article>
        <article data-tone="risk"><span>Risk + uncertainty</span><strong>${escapeHtml(model.risk)}</strong><small>Confidence ${escapeHtml(model.confidence)}</small></article>
      </div>

      <details class="ff-dce-layers">
        <summary><span><strong>View the 7 evidence layers</strong><small>Identity → Evidence → Economics → Risk → Decision → Receipt → Outcome</small></span><span aria-hidden="true">＋</span></summary>
        <ol>
          <li data-cdi-layer="identity"><span class="ff-dce-number">01</span><div><strong>Identity Intelligence</strong><p>${escapeHtml(model.identity)}</p><small>Exact identity: ${escapeHtml(model.exactIdentity)}</small></div></li>
          <li data-cdi-layer="evidence"><span class="ff-dce-number">02</span><div><strong>Evidence Intelligence</strong><p>${escapeHtml(evidence.trusted)} · ${escapeHtml(evidence.excluded)}</p><small>Only authority-eligible exact completed-sale evidence can support value.</small><a href="${escapeHtml(model.evidenceHref)}">Open full evidence trail →</a></div></li>
          <li data-cdi-layer="economics"><span class="ff-dce-number">03</span><div><strong>Economic Intelligence</strong><p>${escapeHtml(model.ask)} ask · ${escapeHtml(model.supportedValue)} supported value</p><small>This surface presents server-owned economics and does not infer profit or recompute value.</small></div></li>
          <li data-cdi-layer="risk"><span class="ff-dce-number">04</span><div><strong>Risk + Uncertainty Intelligence</strong><p>${escapeHtml(model.risk)} · confidence ${escapeHtml(model.confidence)}</p><small>Unresolved evidence remains visible instead of being converted into false certainty.</small></div></li>
          <li data-cdi-layer="decision"><span class="ff-dce-number">05</span><div><strong>Decision Intelligence</strong><p>${escapeHtml(model.decision)} — ${escapeHtml(model.why)}</p><small>${escapeHtml(model.change)}</small></div></li>
          <li data-cdi-layer="receipt"><span class="ff-dce-number">06</span><div><strong>Decision Traceback / Decision Receipt</strong><p>${escapeHtml(model.observed)}</p><small>The receipt preserves what the governed system knew and returned.</small>${receiptAction}</div></li>
          <li data-cdi-layer="outcome"><span class="ff-dce-number">07</span><div><strong>Outcome Intelligence</strong><p>Track what happened after the decision.</p><small>Use the governed Tracking workflow for 7 / 14 / 30 outcome review.</small><a href="${escapeHtml(model.trackingHref)}">Continue to Tracking →</a></div></li>
        </ol>
      </details>`;
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
    receipt.scrollIntoView({ behavior: "smooth", block: "center" });
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
