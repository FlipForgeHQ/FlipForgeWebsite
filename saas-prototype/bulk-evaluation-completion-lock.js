(() => {
  "use strict";

  function applyCompletionLock() {
    const panel = document.querySelector("[data-bulk-evaluation]");
    if (!panel) return;
    const run = panel.querySelector("[data-bulk-run]");
    if (!run) return;

    const statuses = [...panel.querySelectorAll(".bulk-status")]
      .map(node => String(node.textContent || "").trim().toUpperCase())
      .filter(Boolean);
    if (!statuses.length) return;

    const hasReady = statuses.includes("READY");
    const hasRunning = statuses.includes("RUNNING");
    const hasError = statuses.includes("ERROR");
    const hasFinished = statuses.includes("COMPLETE") || hasError;

    if (hasFinished && !hasReady && !hasRunning) {
      run.disabled = true;
      run.textContent = hasError ? "Upload corrected CSV" : "Batch complete";
      run.setAttribute("aria-disabled", "true");
    }
  }

  const observer = new MutationObserver(applyCompletionLock);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", applyCompletionLock);
  window.addEventListener("hashchange", () => setTimeout(applyCompletionLock, 0));
  setTimeout(applyCompletionLock, 0);
})();
