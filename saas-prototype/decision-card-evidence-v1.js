(() => {
  "use strict";

  if (window.FlipForgeDecisionCardEvidenceV1) return;
  window.FlipForgeDecisionCardEvidenceV1 = true;

  const routeName = () => String(window.location.hash || "#/dashboard")
    .replace(/^#\/?/, "")
    .split(/[/?]/)[0] || "dashboard";

  const text = (node) => String(node?.textContent || "").trim();
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

  function gateValue(root, wantedLabel) {
    return labeledValue(root, ".ff-di-v2-gate", wantedLabel);
  }

  function receiptValue(root, wantedLabel) {
    return labeledValue(root, ".ff-di-v2-receipt-grid > div", wantedLabel);
  }

  function enhance() {
    if (routeName() !== "decision-intelligence") return;
    const root = document.querySelector('.ff-di-page[data-ff-decision-intelligence-ux="v2"], .ff-di-page[data-ff-decision-intelligence-source]');
    const command = root?.querySelector("[data-ff-di-v2-command]");
    const verdict = command?.querySelector(".ff-di-v2-verdict");
    const grid = command?.querySelector(".ff-di-v2-intelligence-grid");
    if (!root || !command || !verdict || !grid) return;

    const decision = text(verdict.querySelector(".ff-di-v2-decision")) || "UNKNOWN";
    const identity = text(verdict.querySelector(".ff-di-v2-verdict-main h2")) || "Saved opportunity";
    const why = text(verdict.querySelector(".ff-di-v2-verdict-main p")) || "FlipForge preserved the server-owned decision.";
    const supportedValue = labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Supported value");
    const confidence = labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Confidence");
    const risk = labeledValue(verdict, ".ff-di-v2-verdict-metrics > div", "Risk");
    const exactIdentity = gateValue(command, "Exact identity");
    const trustedSales = gateValue(command, "Trusted completed sales");
    const excludedEvidence = gateValue(command, "Excluded evidence");
    const ask = receiptValue(command, "Evaluated ask");
    const observed = receiptValue(command, "Observed");
    const engine = receiptValue(command, "Engine");
    const change = text(command.querySelector(".ff-di-v2-change h3")) || "Material new evidence or price/risk changes require a fresh evaluation.";
    const evidenceHref = command.querySelector(".ff-di-v2-evidence-link")?.getAttribute("href") || "#/evidence";

    const signature = JSON.stringify([
      decision, identity, why, supportedValue, confidence, risk, exactIdentity,
      trustedSales, excludedEvidence, ask, observed, engine, change, evidenceHref
    ]);

    let panel = command.querySelector("[data-ff-decision-card-evidence]");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "ff-decision-card-evidence";
      panel.dataset.ffDecisionCardEvidence = "v1";
      verdict.insertAdjacentElement("afterend", panel);
    }
    if (panel.dataset.ffDecisionCardSignature === signature) return;
    panel.dataset.ffDecisionCardSignature = signature;

    panel.innerHTML = `
      <header class="ff-dce-head">
        <div>
          <span class="ff-dce-kicker">CARD DECISION INTELLIGENCE™</span>
          <h3>Decision Card evidence</h3>
          <p>Start with the decision. Open the evidence layers only when you want the full why.</p>
        </div>
        <span class="ff-dce-state">Server-owned evidence</span>
      </header>

      <div class="ff-dce-summary" aria-label="Decision Card summary">
        <article data-tone="decision"><span>Decision</span><strong>${escapeHtml(decision)}</strong><small>${escapeHtml(why)}</small></article>
        <article data-tone="evidence"><span>Evidence</span><strong>${escapeHtml(trustedSales)}</strong><small>${escapeHtml(excludedEvidence)} excluded from authority</small></article>
        <article data-tone="risk"><span>Risk + uncertainty</span><strong>${escapeHtml(risk)}</strong><small>Confidence ${escapeHtml(confidence)}</small></article>
      </div>

      <details class="ff-dce-layers">
        <summary><span><strong>View the 7 evidence layers</strong><small>Identity → Evidence → Economics → Risk → Decision → Receipt → Outcome</small></span><span aria-hidden="true">＋</span></summary>
        <ol>
          <li data-cdi-layer="identity">
            <span class="ff-dce-number">01</span>
            <div><strong>Identity Intelligence</strong><p>${escapeHtml(identity)}</p><small>Exact identity: ${escapeHtml(exactIdentity)}</small></div>
          </li>
          <li data-cdi-layer="evidence">
            <span class="ff-dce-number">02</span>
            <div><strong>Evidence Intelligence</strong><p>${escapeHtml(trustedSales)} · ${escapeHtml(excludedEvidence)} excluded</p><small>Only authority-eligible exact completed-sale evidence can support value.</small><a href="${escapeHtml(evidenceHref)}">Open full evidence trail →</a></div>
          </li>
          <li data-cdi-layer="economics">
            <span class="ff-dce-number">03</span>
            <div><strong>Economic Intelligence</strong><p>${escapeHtml(ask)} ask · ${escapeHtml(supportedValue)} supported value</p><small>This surface presents server-owned economics and does not infer profit or recompute value.</small></div>
          </li>
          <li data-cdi-layer="risk">
            <span class="ff-dce-number">04</span>
            <div><strong>Risk + Uncertainty Intelligence</strong><p>${escapeHtml(risk)} · confidence ${escapeHtml(confidence)}</p><small>Unresolved evidence remains visible instead of being converted into false certainty.</small></div>
          </li>
          <li data-cdi-layer="decision">
            <span class="ff-dce-number">05</span>
            <div><strong>Decision Intelligence</strong><p>${escapeHtml(decision)} — ${escapeHtml(why)}</p><small>What changes it: ${escapeHtml(change)}</small></div>
          </li>
          <li data-cdi-layer="receipt">
            <span class="ff-dce-number">06</span>
            <div><strong>Decision Traceback / Decision Receipt</strong><p>${escapeHtml(observed)} · ${escapeHtml(engine)}</p><small>The attached receipt preserves what the server knew and returned.</small><button type="button" data-ff-open-decision-receipt>Open Decision Receipt</button></div>
          </li>
          <li data-cdi-layer="outcome">
            <span class="ff-dce-number">07</span>
            <div><strong>Outcome Intelligence</strong><p>Track what happened after the decision.</p><small>Use the governed Tracking workflow for 7 / 14 / 30 outcome review.</small><a href="#/tracking">Continue to Tracking →</a></div>
          </li>
        </ol>
      </details>`;
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-ff-open-decision-receipt]");
    if (!trigger) return;
    const command = trigger.closest("[data-ff-di-v2-command]");
    const receipt = command?.querySelector(".ff-di-v2-receipt");
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
