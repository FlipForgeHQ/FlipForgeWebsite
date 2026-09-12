(() => {
  "use strict";

  const ENDPOINT = "/api/beta/operator";
  const LABELS = Object.freeze({
    IDENTITY: "Identity",
    EVIDENCE: "Evidence",
    ECONOMICS: "Economics",
    RISK_UNCERTAINTY: "Risk + uncertainty",
    DECISION: "Decision",
    RECEIPT: "Decision Receipt",
    OUTCOME: "Outcome",
  });
  let busy = false;

  function metric(name, value) {
    const node = document.querySelector(`[data-cdi-learning-metric="${name}"]`);
    if (node) node.textContent = String(value ?? 0);
  }

  function status(text, tone = "neutral") {
    const node = document.querySelector("[data-cdi-learning-status]");
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function summarize(records) {
    const result = {
      responses: 0,
      decisionYes: 0,
      decisionPartly: 0,
      nextYes: 0,
      evidenceUp: 0,
      evidenceDown: 0,
      layers: Object.fromEntries(Object.keys(LABELS).map(key => [key, 0])),
    };

    for (const record of records || []) {
      const learning = record?.feedback?.learning;
      if (!learning || typeof learning !== "object") continue;
      if (!["YES", "PARTLY", "NO"].includes(learning.decisionUnderstood)) continue;
      if (!["YES", "PARTLY", "NO"].includes(learning.nextStepClear)) continue;
      if (!["INCREASED", "NO_CHANGE", "DECREASED", "NOT_VIEWED"].includes(learning.evidenceImpact)) continue;
      result.responses += 1;
      if (learning.decisionUnderstood === "YES") result.decisionYes += 1;
      if (learning.decisionUnderstood === "PARTLY") result.decisionPartly += 1;
      if (learning.nextStepClear === "YES") result.nextYes += 1;
      if (learning.evidenceImpact === "INCREASED") result.evidenceUp += 1;
      if (learning.evidenceImpact === "DECREASED") result.evidenceDown += 1;
      if (Object.hasOwn(result.layers, learning.mostUsefulLayer)) result.layers[learning.mostUsefulLayer] += 1;
    }

    const top = Object.entries(result.layers)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    result.topLayer = top && top[1] > 0 ? `${LABELS[top[0]]} (${top[1]})` : "No signal yet";
    return result;
  }

  function render(summary) {
    metric("responses", summary.responses);
    metric("decision-clear", summary.decisionYes);
    metric("decision-partly", summary.decisionPartly);
    metric("next-clear", summary.nextYes);
    metric("evidence-up", summary.evidenceUp);
    metric("evidence-down", summary.evidenceDown);
    const topLayer = document.querySelector('[data-cdi-learning-metric="top-layer"]');
    if (topLayer) topLayer.textContent = summary.topLayer;
    status(
      summary.responses
        ? `${summary.responses} structured comprehension response${summary.responses === 1 ? "" : "s"}. These counts measure tester understanding, not product accuracy.`
        : "No structured comprehension checks have been submitted yet.",
      summary.responses ? "ok" : "neutral"
    );
  }

  async function load() {
    if (busy || !document.querySelector("[data-cdi-learning-scorecard]")) return;
    const identity = window.FlipForgeIdentity?.getSnapshot?.();
    if (!identity?.authenticated || !identity?.operatorActive) return;
    busy = true;
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("operator unavailable");
      const payload = await response.json();
      render(summarize(payload.feedback || []));
    } catch (_) {
      status("The Decision Intelligence scorecard could not refresh. No tester data was changed.", "error");
    } finally {
      busy = false;
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-operator-refresh]")) window.setTimeout(load, 400);
  });
  window.addEventListener("flipforge:identity-change", () => window.setTimeout(load, 50));
  window.addEventListener("pageshow", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();
