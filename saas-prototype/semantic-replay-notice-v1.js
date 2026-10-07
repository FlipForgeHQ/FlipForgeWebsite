// Already-evaluated notice for server semantic replay.
//
// When the backend answers an evaluation from an existing saved decision (same tenant, listing, card
// identity and ask; data.semanticReplay === true), no evaluation was used. Discover still opens that
// saved decision; this module tells the customer so on the saved decision page.
//
// The marker holds only the saved opportunity id and a timestamp, lives in this tab's sessionStorage
// so it survives the saved decision page reload, and expires after TTL_MS. It never stores listing,
// card, price or tenant data.
(() => {
  "use strict";

  const KEY = "flipforge.semanticReplayNotice";
  const PENDING_SAVE_KEY = "flipforge.pendingEvaluationSave";
  const TTL_MS = 30000;
  const WATCH_MS = 15000;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:|-]{0,199}$/;
  const MESSAGE = "Already evaluated — this is your saved decision for this listing and price. No evaluation was used.";

  function readMarker() {
    try {
      const marker = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
      if (!marker || typeof marker.id !== "string" || !SAFE_ID.test(marker.id) || !Number.isFinite(marker.at)) return null;
      if (Date.now() - marker.at > TTL_MS) {
        window.sessionStorage.removeItem(KEY);
        return null;
      }
      return marker;
    } catch (_) {
      return null;
    }
  }

  function clearMarker() {
    try { window.sessionStorage.removeItem(KEY); } catch (_) { /* session only */ }
  }

  function watch() {
    const marker = readMarker();
    if (!marker) return;
    const target = `#/opportunities/${encodeURIComponent(marker.id)}`;
    const startedAt = Date.now();
    let reached = false;
    const timer = window.setInterval(() => {
      const onTarget = window.location.hash === target;
      if (onTarget) reached = true;
      if ((reached && !onTarget) || Date.now() - startedAt > WATCH_MS) {
        window.clearInterval(timer);
        clearMarker();
        return;
      }
      if (!onTarget) return;
      const host = document.querySelector("#main-content")?.firstElementChild;
      if (!host || host.querySelector("[data-ff-already-evaluated]")) return;
      const notice = document.createElement("div");
      notice.className = "customer-discovery-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("data-ff-already-evaluated", "");
      notice.textContent = MESSAGE;
      host.prepend(notice);
    }, 250);
  }

  window.addEventListener("flipforge:semantic-replay", event => {
    const id = String(event?.detail?.opportunityId || "");
    if (!SAFE_ID.test(id)) return;
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
      // No new evaluation ran, so the saved decision page must not say "Evaluation complete".
      window.sessionStorage.removeItem(PENDING_SAVE_KEY);
    } catch (_) { /* session only */ }
    watch();
  });

  watch();
})();
