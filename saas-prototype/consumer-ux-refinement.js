(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  if (!main) return;

  const exactCopy = new Map([
    ["Staging owner review", "Owner preview"],
    ["Expanded owner review", "Owner preview"],
    ["Interactive prototype history for the selected opportunity.", "Recent ask and supported-value history for the selected opportunity."],
    ["Prototype customer activity, not live telemetry.", "Recent intelligence activity."],
    ["Prototype list of saved Smart Opportunity output.", "Saved decisions ranked with supporting evidence."],
    ["Prototype saved record", "Saved evaluation"],
    ["Plain-language explanation of saved authority output.", "Why this decision was reached."],
    ["Existing recommendations ranked with saved evidence context.", "Your highest-priority opportunities, ranked with supporting evidence."],
    ["Saved opportunity authority", "Card intelligence"],
    ["Opportunity detail", "Card intelligence"],
    ["Tenant-owned saved intelligence", "Saved intelligence"],
    ["Completed evaluation snapshot", "Saved evaluated card"],
    ["Engine", "Model"],
    ["SQLite saved", "Saved"],
    ["Tracked in SQLite", "Tracked"],
    ["Execution authority", "Transaction actions"],
    ["Authority boundary:", "Decision framework:"],
    ["Identity boundary:", "What this changes:"],
    ["Customer boundary:", "How this works:"]
  ]);

  const diagnosticPattern = /(invalid json|authority contract|authority boundary|browser safety limit|request failed with status|response exceeded)/i;
  const technicalCodePattern = /^[A-Z][A-Z0-9_:-]{4,}$/;

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHtml(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }

  function setBrand() {
    if (document.title !== "FlipForge | Card Intelligence") document.title = "FlipForge | Card Intelligence";
    const description = document.querySelector('meta[name="description"]');
    if (description && description.getAttribute("content") !== "FlipForge private-beta card intelligence platform.") {
      description.setAttribute("content", "FlipForge private-beta card intelligence platform.");
    }
    setText(document.querySelector(".brand-subtitle"), "CARD INTELLIGENCE");
  }

  function replaceLeafCopy(root) {
    root.querySelectorAll("span, small, p, strong, h1, h2, h3, button, a").forEach(node => {
      if (node.children.length !== 0) return;
      const current = node.textContent.trim();
      const replacement = exactCopy.get(current);
      if (replacement && current !== replacement) setText(node, replacement);
    });
  }

  function refineBoundaryNotes(root) {
    root.querySelectorAll(".boundary-note").forEach(note => {
      const refined = note.innerHTML
        .replace("<strong>Authority boundary:</strong>", "<strong>Decision framework:</strong>")
        .replace("<strong>Decision rule:</strong>", "<strong>Decision framework:</strong>")
        .replace("<strong>Customer boundary:</strong>", "<strong>How this works:</strong>")
        .replace("Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. Existing PSA intelligence remains the sole grading-guidance authority.", "Smart Opportunity provides BUY/WATCH/VERIFY/PASS recommendations. PSA Advisor provides grading guidance. This screen does not recalculate either.")
        .replace("Smart Opportunity provides the saved BUY/WATCH/VERIFY/PASS decision. PSA guidance remains a separate grading view.", "Smart Opportunity provides BUY/WATCH/VERIFY/PASS recommendations. PSA Advisor provides grading guidance. This screen does not recalculate either.");
      setHtml(note, refined);
    });
  }

  function refineCardIdentity(root) {
    const panel = root.querySelector("[data-card-intelligence-assist]");
    if (!panel) return;

    setText(panel.querySelector(".card-intelligence-heading .eyebrow"), "Identity intelligence");
    setText(panel.querySelector(".card-intelligence-heading small"), "Search card details or use a photo to confirm the exact card before evaluation.");
    setText(panel.querySelector('[data-card-intelligence-photo] label small'), "JPEG, PNG, or WebP · maximum 4 MB. Used only to identify the card for this evaluation.");
    setHtml(
      panel.querySelector(".boundary-note"),
      "<strong>What this changes:</strong> Choosing a match fills the exact card identity for evaluation. It does not change evidence, grading guidance, or the final Smart Opportunity recommendation."
    );
  }

  function refineForgeHeat(root) {
    const shell = root.querySelector(".forge-heat-shell");
    if (!shell) return;

    const isDevelopment = shell.classList.contains("forge-heat-development");
    setText(shell.querySelector(".forge-heat-title-row .eyebrow"), isDevelopment ? "In development" : "Forge Heat");
    setText(shell.querySelector(".forge-heat-boundary small"), isDevelopment
      ? "Not available in private beta"
      : "Ranks saved evaluations · Decision support only");
    shell.querySelectorAll(".forge-heat-card-foot > span").forEach(node => {
      setText(node, "Forge Heat prioritizes the opportunity. Smart Opportunity remains the saved recommendation.");
    });
  }

  function refineErrorPanels(root) {
    root.querySelectorAll('.staging-error[role="alert"] .panel-body > strong').forEach(node => {
      const current = node.textContent.trim();
      if (technicalCodePattern.test(current)) setText(node, "We couldn't complete that request.");
    });
  }

  function sanitizeDiagnostics(root) {
    root.querySelectorAll('.card-intelligence-error, .forge-heat-error, [role="alert"]').forEach(node => {
      if (diagnosticPattern.test(node.textContent || "")) {
        setText(node, "This intelligence view is temporarily unavailable. Try again.");
      }
    });
  }

  function markCustomerStates(root) {
    root.querySelectorAll(".forge-heat-empty, .staging-empty").forEach(node => node.classList.add("consumer-state", "consumer-state-empty"));
    root.querySelectorAll(".staging-loading").forEach(node => node.classList.add("consumer-state", "consumer-state-loading"));
    root.querySelectorAll(".card-intelligence-message").forEach(node => node.classList.add("consumer-state"));
    root.querySelectorAll('.card-intelligence-error, .forge-heat-error, .staging-error[role="alert"]').forEach(node => node.classList.add("consumer-state", "consumer-state-error"));
  }

  function apply() {
    setBrand();
    replaceLeafCopy(main);
    refineBoundaryNotes(main);
    refineCardIdentity(main);
    refineForgeHeat(main);
    refineErrorPanels(main);
    sanitizeDiagnostics(main);
    markCustomerStates(main);
    document.documentElement.classList.add("consumer-ux-ready");
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleApply);
  window.addEventListener("pageshow", scheduleApply);
  window.addEventListener("load", scheduleApply);
  scheduleApply();
})();
