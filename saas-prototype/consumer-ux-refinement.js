(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main) return;

  const exactCopy = new Map([
    ["Staging owner review", "Owner preview"],
    ["Expanded owner review", "Owner preview"],
    ["Interactive prototype history for the selected opportunity.", "Saved ask and supported-value history for the selected opportunity."],
    ["Prototype customer activity, not live telemetry.", "Recent saved intelligence activity."],
    ["Prototype list of saved Smart Opportunity output.", "Saved Smart Opportunity decisions ranked with supporting context."],
    ["Prototype saved record", "Saved evaluation"],
    ["Plain-language explanation of saved authority output.", "Why the saved decision was reached."],
    ["Existing recommendations ranked with saved evidence context.", "Saved decisions ranked with evidence context."],
    ["Saved opportunity authority", "SAVED CARD INTELLIGENCE"],
    ["Opportunity detail", "CARD INTELLIGENCE"],
    ["Completed evaluation snapshot", "Saved evaluated card"],
    ["Engine", "Model"],
    ["Authority boundary:", "Decision rule:"],
    ["Identity boundary:", "What this changes:"]
  ]);

  const diagnosticPattern = /(invalid json|authority contract|authority boundary|browser safety limit|request failed with status|response exceeded)/i;

  function setBrand() {
    document.title = "FlipForge | Card Intelligence";
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", "FlipForge private-beta card intelligence platform.");
    const subtitle = document.querySelector(".brand-subtitle");
    if (subtitle) subtitle.textContent = "CARD INTELLIGENCE";
  }

  function replaceLeafCopy(root) {
    root.querySelectorAll("span, small, p, strong, h1, h2, h3, button, a").forEach(node => {
      if (node.children.length !== 0) return;
      const current = node.textContent.trim();
      const replacement = exactCopy.get(current);
      if (replacement) node.textContent = replacement;
    });
  }

  function refineBoundaryNotes(root) {
    root.querySelectorAll(".boundary-note").forEach(note => {
      note.innerHTML = note.innerHTML
        .replace("<strong>Authority boundary:</strong>", "<strong>Decision rule:</strong>")
        .replace("Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority.", "Smart Opportunity provides the saved BUY/WATCH/VERIFY/PASS decision. PSA guidance remains a separate grading view.");
    });
  }

  function refineCardIdentity(root) {
    const panel = root.querySelector("[data-card-intelligence-assist]");
    if (!panel) return;

    const eyebrow = panel.querySelector(".card-intelligence-heading .eyebrow");
    if (eyebrow) eyebrow.textContent = "IDENTITY INTELLIGENCE";

    const intro = panel.querySelector(".card-intelligence-heading small");
    if (intro) intro.textContent = "Search card details or use a photo to confirm the exact card before evaluation.";

    const photoNote = panel.querySelector('[data-card-intelligence-photo] label small');
    if (photoNote) photoNote.textContent = "JPEG, PNG, or WebP · maximum 4 MB. Used only to identify the card for this evaluation.";

    const boundary = panel.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>What this changes:</strong> Choosing a match fills the exact card identity for evaluation. It does not change evidence, grading guidance, or the final Smart Opportunity decision.";
    }
  }

  function refineForgeHeat(root) {
    const shell = root.querySelector(".forge-heat-shell");
    if (!shell) return;

    const eyebrow = shell.querySelector(".forge-heat-title-row .eyebrow");
    if (eyebrow) eyebrow.textContent = "PRO CARD INTELLIGENCE";

    const scopeSmall = shell.querySelector(".forge-heat-boundary small");
    if (scopeSmall) scopeSmall.textContent = "Ranks your saved evaluations · Decision support only";

    shell.querySelectorAll(".forge-heat-card-foot > span").forEach(node => {
      node.textContent = "Forge Heat prioritizes the opportunity. Smart Opportunity remains the saved decision.";
    });
  }

  function sanitizeDiagnostics(root) {
    root.querySelectorAll('.card-intelligence-error, .forge-heat-error, [role="alert"]').forEach(node => {
      if (diagnosticPattern.test(node.textContent || "")) {
        node.textContent = "This intelligence view is temporarily unavailable. Try again.";
      }
    });
  }

  function markCustomerStates(root) {
    root.querySelectorAll(".forge-heat-empty").forEach(node => node.classList.add("consumer-state", "consumer-state-empty"));
    root.querySelectorAll(".card-intelligence-message").forEach(node => node.classList.add("consumer-state"));
    root.querySelectorAll('.card-intelligence-error, .forge-heat-error, [role="alert"]').forEach(node => node.classList.add("consumer-state", "consumer-state-error"));
  }

  function apply() {
    setBrand();
    replaceLeafCopy(main);
    refineBoundaryNotes(main);
    refineCardIdentity(main);
    refineForgeHeat(main);
    sanitizeDiagnostics(main);
    markCustomerStates(main);
    document.documentElement.classList.add("consumer-ux-ready");
  }

  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => requestAnimationFrame(apply));
  window.addEventListener("pageshow", () => requestAnimationFrame(apply));
  window.addEventListener("load", () => requestAnimationFrame(apply));
  requestAnimationFrame(apply);
})();
