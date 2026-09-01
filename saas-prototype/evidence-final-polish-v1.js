(() => {
  "use strict";

  let scheduled = false;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function cleanDuplicateOptions(select) {
    if (!select || select.dataset.ffEvidenceLabels === "true") return;
    const options = [...select.options];
    const totals = new Map();
    options.forEach(option => {
      const base = String(option.textContent || "").trim();
      totals.set(base, (totals.get(base) || 0) + 1);
    });
    const seen = new Map();
    options.forEach(option => {
      const base = String(option.textContent || "").trim();
      if ((totals.get(base) || 0) < 2) return;
      const ordinal = (seen.get(base) || 0) + 1;
      seen.set(base, ordinal);
      option.textContent = `${base} — saved record ${ordinal}`;
    });
    select.dataset.ffEvidenceLabels = "true";
  }

  function friendlySourceCell(cell) {
    if (!cell) return;
    const source = cell.querySelector("strong");
    const type = cell.querySelector("small");
    if (String(source?.textContent || "").trim() === "CARDSIGHT_EBAY") setText(source, "CardSight / eBay");
    if (String(type?.textContent || "").trim() === "SOLD_COMP") setText(type, "Completed sale");
  }

  function polishTimeline(main) {
    const timeline = main.querySelector(".customer-management-timeline");
    if (!timeline) return;

    timeline.querySelectorAll("article").forEach(article => {
      const event = article.querySelector("strong");
      const reason = article.querySelector("p");
      const eventText = String(event?.textContent || "").trim();
      const reasonText = String(reason?.textContent || "").trim();

      if (eventText === "EVIDENCE_ATTACHED") setText(event, "Evidence accepted");
      if (eventText === "PSA_SNAPSHOT_ATTACHED") setText(event, "PSA context saved");

      const countMatch = reasonText.match(/^SOLD_COMP accepted; unique exact-card uncontested valid sold source count=(\d+)$/i);
      if (countMatch) {
        setText(reason, `Completed sale accepted into the saved exact-card evidence set. Saved accepted-sale count: ${countMatch[1]}.`);
      } else if (reasonText === "Immutable PSA readiness context captured at handoff.") {
        setText(reason, "Saved PSA readiness context recorded with this decision.");
      } else if (reasonText === "Missing PSA context captured without inventing data.") {
        setText(reason, "Missing PSA context was preserved without filling the gap with estimated data.");
      }
    });
  }

  function apply() {
    scheduled = false;
    if (routeName() !== "evidence") return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const selector = main.querySelector("[data-customer-management-select]");
    cleanDuplicateOptions(selector);
    setText(main.querySelector(".customer-management-selector > span"), "Saved card");

    const metrics = main.querySelector(".customer-management-metrics");
    metrics?.querySelectorAll("article").forEach(article => {
      const label = article.querySelector("span");
      if (String(label?.textContent || "").trim() === "Manual candidates") setText(label, "Review candidates");
    });

    main.querySelectorAll("table tbody tr").forEach(row => friendlySourceCell(row.children[0]));
    polishTimeline(main);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(apply);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
