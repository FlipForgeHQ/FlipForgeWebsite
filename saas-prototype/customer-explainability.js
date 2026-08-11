(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main) return;

  const METRIC_HELP = Object.freeze({
    Confidence: "How strongly the saved evidence and context support this result. It is not certainty.",
    Liquidity: "The saved liquidity factor returned by Smart Opportunity. Market activity does not remove risk.",
    Risk: "The saved uncertainty and downside factor returned by Smart Opportunity. It is not a price forecast.",
    Rank: "The saved opportunity-ranking factor returned by Smart Opportunity. It is not a price prediction."
  });

  function addMetricHelp() {
    main.querySelectorAll(".customer-intelligence-metrics article").forEach(card => {
      if (card.dataset.intelligenceHelp === "true") return;
      const label = card.querySelector("span")?.textContent?.trim() || "";
      const help = METRIC_HELP[label];
      if (!help) return;
      const note = document.createElement("small");
      note.className = "customer-metric-help";
      note.textContent = help;
      card.appendChild(note);
      card.dataset.intelligenceHelp = "true";
    });
  }

  function addSupportedValueNote() {
    const summary = main.querySelector(".customer-value-summary");
    if (!summary || summary.querySelector("[data-supported-value-note]")) return;
    const note = document.createElement("div");
    note.className = "customer-supported-value-note";
    note.dataset.supportedValueNote = "true";
    note.innerHTML = "<strong>How to read supported value</strong><span>This is the value supported by accepted evidence in the saved evaluation. It is not a guaranteed sale price or an instruction to buy.</span>";
    summary.appendChild(note);
  }

  function explainerMarkup() {
    return `<section class="panel customer-intelligence-explainer" data-intelligence-explainer>
      <header class="panel-header">
        <div>
          <h2>How to read this decision</h2>
          <p>FlipForge separates what the saved evaluation knows from what still requires judgment.</p>
        </div>
        <span class="staging-status staging-status-ok">Explainable</span>
      </header>
      <div class="panel-body customer-intelligence-explainer-grid">
        <article><span>Supported value</span><strong>Evidence-backed reference</strong><p>Uses the saved evaluation's accepted evidence. It is not a guaranteed future sale price.</p></article>
        <article><span>Confidence</span><strong>Strength of support</strong><p>Shows how strongly the saved evidence and context support the result. It is not certainty.</p></article>
        <article><span>Liquidity</span><strong>Market activity context</strong><p>Displays the saved liquidity factor returned by Smart Opportunity. Liquidity does not eliminate risk.</p></article>
        <article><span>Risk</span><strong>Uncertainty and downside</strong><p>Displays the saved risk factor. It is not a prediction of future price movement.</p></article>
        <article><span>Rank</span><strong>Saved opportunity factor</strong><p>Shows the rank returned by Smart Opportunity. It is not a price target or transaction instruction.</p></article>
        <article><span>PSA guidance</span><strong>Saved grading context</strong><p>Existing PSA intelligence can provide context, but this screen does not predict a grade.</p></article>
      </div>
      <footer>Active marketplace listings remain discovery inputs. Only eligible completed-sale evidence can support sold-market evidence in the saved decision.</footer>
    </section>`;
  }

  function addDecisionExplainer() {
    if (!main.querySelector(".customer-intelligence-hero")) return;
    if (main.querySelector("[data-intelligence-explainer]")) return;
    const grid = main.querySelector(".customer-intelligence-grid");
    if (!grid || !grid.parentNode) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = explainerMarkup().trim();
    const panel = wrapper.firstElementChild;
    if (panel) grid.parentNode.insertBefore(panel, grid);
  }

  function enhance() {
    if (!main.querySelector(".customer-intelligence-page")) return;
    addMetricHelp();
    addSupportedValueNote();
    addDecisionExplainer();
  }

  const observer = typeof MutationObserver === "function"
    ? new MutationObserver(() => enhance())
    : null;
  if (observer) observer.observe(main, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => queueMicrotask(enhance));
  queueMicrotask(enhance);
})();
