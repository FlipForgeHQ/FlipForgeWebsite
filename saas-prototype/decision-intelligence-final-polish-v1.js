(() => {
  "use strict";

  let scheduled = false;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
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

  function apply() {
    scheduled = false;
    if (routeName() !== "decision-intelligence") return;
    disambiguate(document.querySelector("#ff-di-primary"));
    disambiguate(document.querySelector("#ff-di-compare"));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(apply);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();
