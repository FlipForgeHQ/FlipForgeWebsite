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

  function disambiguate(select) {
    if (!select || select.dataset.ffDiLabels === "true") return;
    const options = [...select.options];
    const totals = new Map();
    options.forEach(option => {
      const label = String(option.textContent || "").trim();
      totals.set(label, (totals.get(label) || 0) + 1);
    });
    const seen = new Map();
    options.forEach(option => {
      const label = String(option.textContent || "").trim();
      if ((totals.get(label) || 0) < 2) return;
      const ordinal = (seen.get(label) || 0) + 1;
      seen.set(label, ordinal);
      option.textContent = `${label} — saved record ${ordinal}`;
    });
    select.dataset.ffDiLabels = "true";
  }

  function polishDecisionIntelligence() {
    disambiguate(document.querySelector("#ff-di-primary"));
    disambiguate(document.querySelector("#ff-di-compare"));
  }

  function polishCompare() {
    const main = document.querySelector("#main-content");
    if (!main) return;

    const boundary = main.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>How this works:</strong> Compare reads saved records from your account. It never uses mock records, accepts evidence, predicts a grade, reranks cards, or authorizes a transaction.";
    }

    const chooseHeading = [...main.querySelectorAll("h2,h3")].find(node =>
      /choose two tracked records/i.test(String(node.textContent || ""))
    );
    if (chooseHeading) {
      setText(chooseHeading, "Choose two saved records");
      const helper = chooseHeading.parentElement?.querySelector("p");
      if (helper) setText(helper, "Choose two different saved opportunities from your account.");
    }

    const limits = [...main.querySelectorAll("details")].find(details =>
      /important limits|known limitations/i.test(String(details.querySelector("summary")?.textContent || ""))
    );
    if (limits) {
      limits.innerHTML = `<summary>Important limits</summary><ul>
        <li>Compare does not create a new BUY, WATCH, VERIFY, or PASS decision.</li>
        <li>Active listings are never treated as completed-sale evidence.</li>
        <li>Compare cannot buy, sell, bid, list, pay, or authorize a transaction.</li>
      </ul>`;
    }
  }

  function apply() {
    scheduled = false;
    const route = routeName();
    if (route === "decision-intelligence") polishDecisionIntelligence();
    if (route === "compare") polishCompare();
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
