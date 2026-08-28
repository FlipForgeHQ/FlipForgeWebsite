(() => {
  "use strict";

  const TRACKING_STATUS_LABELS = Object.freeze({
    WATCHING: "Watching",
    REVIEW: "Review",
    OWNED: "Owned",
    SOLD: "Sold",
    PASSED: "Passed",
    ARCHIVED: "Archived"
  });

  function normalizeCardDisplay(value) {
    return String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeNodeText(node) {
    if (!node || typeof node.textContent !== "string") return;
    const normalized = normalizeCardDisplay(node.textContent);
    if (normalized && normalized !== node.textContent) node.textContent = normalized;
  }

  function normalizeTrackingStatusLabels(page) {
    const select = page.querySelector('select[name="trackingStatus"]');
    if (!select) return;
    [...select.options].forEach(option => {
      const raw = String(option.value || option.textContent || "").trim().toUpperCase();
      if (!TRACKING_STATUS_LABELS[raw]) return;
      option.value = raw;
      option.textContent = TRACKING_STATUS_LABELS[raw];
    });
  }

  function normalizeLifecycleDisplay(root = document) {
    const page = root.querySelector?.(".customer-lifecycle-page")
      || document.querySelector?.(".customer-lifecycle-page");
    if (!page) return;

    page.querySelectorAll("select[data-lifecycle-select] option").forEach(normalizeNodeText);
    page.querySelectorAll(".customer-lifecycle-grid h2, .customer-lifecycle-grid h3, .customer-lifecycle-alerts h3, table tbody td:first-child strong")
      .forEach(normalizeNodeText);
    normalizeTrackingStatusLabels(page);

    page.setAttribute("data-ff-lifecycle-display-normalized", "true");
  }

  const main = document.getElementById("main-content");
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(() => normalizeLifecycleDisplay(main))
      .observe(main, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => normalizeLifecycleDisplay(document));
  normalizeLifecycleDisplay(document);

  window.FlipForgeLifecycleDisplay = {
    normalizeCardDisplay,
    normalizeLifecycleDisplay
  };
})();
