(() => {
  "use strict";

  const ENDPOINT = "/api/beta/operator";
  const WAVE = "wave-1-sep-2026";
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

  function waveMetric(name, value) {
    const node = document.querySelector(`[data-wave1-metric="${name}"]`);
    if (node) node.textContent = String(value ?? 0);
  }

  function status(text, tone = "neutral") {
    const node = document.querySelector("[data-cdi-learning-status]");
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function waveStatus(text, tone = "neutral") {
    const node = document.querySelector("[data-wave1-recommendation]");
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function percent(numerator, denominator) {
    return denominator ? `${Math.round((numerator / denominator) * 100)}%` : "—";
  }

  function comprehensionSummary(records) {
    const result = {
      responses: 0,
      decisionYes: 0,
      decisionPartly: 0,
      nextYes: 0,
      evidenceUp: 0,
      evidenceDown: 0,
      valueResponses: 0,
      surfacedYes: 0,
      decisionChanged: 0,
      decisionConfirmed: 0,
      futureYes: 0,
      futureMaybe: 0,
      layers: Object.fromEntries(Object.keys(LABELS).map(key => [key, 0])),
    };

    for (const record of records || []) {
      const learning = record?.feedback?.learning;
      if (!learning || typeof learning !== "object") continue;
      if (["YES", "PARTLY", "NO"].includes(learning.decisionUnderstood)
        && ["YES", "PARTLY", "NO"].includes(learning.nextStepClear)
        && ["INCREASED", "NO_CHANGE", "DECREASED", "NOT_VIEWED"].includes(learning.evidenceImpact)) {
        result.responses += 1;
        if (learning.decisionUnderstood === "YES") result.decisionYes += 1;
        if (learning.decisionUnderstood === "PARTLY") result.decisionPartly += 1;
        if (learning.nextStepClear === "YES") result.nextYes += 1;
        if (learning.evidenceImpact === "INCREASED") result.evidenceUp += 1;
        if (learning.evidenceImpact === "DECREASED") result.evidenceDown += 1;
        if (Object.hasOwn(result.layers, learning.mostUsefulLayer)) result.layers[learning.mostUsefulLayer] += 1;
      }
      if (["YES", "NO", "UNSURE"].includes(learning.surfacedImportant)
        && ["CHANGED", "CONFIRMED", "NEITHER"].includes(learning.decisionEffect)
        && ["YES", "MAYBE", "NO"].includes(learning.futureUse)) {
        result.valueResponses += 1;
        if (learning.surfacedImportant === "YES") result.surfacedYes += 1;
        if (learning.decisionEffect === "CHANGED") result.decisionChanged += 1;
        if (learning.decisionEffect === "CONFIRMED") result.decisionConfirmed += 1;
        if (learning.futureUse === "YES") result.futureYes += 1;
        if (learning.futureUse === "MAYBE") result.futureMaybe += 1;
      }
    }

    const top = Object.entries(result.layers)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    result.topLayer = top && top[1] > 0 ? `${LABELS[top[0]]} (${top[1]})` : "No signal yet";
    return result;
  }

  function latestByTester(records, predicate) {
    const sorted = [...(records || [])].sort((left, right) => String(right?.submittedAt || "").localeCompare(String(left?.submittedAt || "")));
    const byTester = new Map();
    for (const record of sorted) {
      if (!predicate(record)) continue;
      const key = String(record?.testerKey || "").trim();
      if (!key || byTester.has(key)) continue;
      byTester.set(key, record);
    }
    return [...byTester.values()];
  }

  function waveSummary(applications, records) {
    const waveApps = (applications || []).filter(item => String(item?.cohort || "").toLowerCase() === WAVE);
    const waveRecords = (records || []).filter(item => String(item?.cohort || "").toLowerCase() === WAVE);
    const invited = waveApps.filter(item => item?.invitedAt || ["INVITE_SENT", "ACTIVATED"].includes(item?.status)).length;
    const activated = waveApps.filter(item => item?.status === "ACTIVATED").length;

    const learningByTester = latestByTester(waveRecords, item => item?.feedback?.checkpoint === "GENERAL" && item?.feedback?.learning);
    const ratingByTester = latestByTester(waveRecords, item => item?.feedback?.checkpoint === "GENERAL"
      && item?.feedback?.rating !== null
      && item?.feedback?.rating !== ""
      && Number.isFinite(Number(item.feedback.rating)));
    const clear = ratingByTester.filter(item => Number(item.feedback.rating) >= 4).length;
    const blocked = ratingByTester.filter(item => Number(item.feedback.rating) <= 2).length;
    const severe = waveRecords.filter(item =>
      item?.feedback?.category === "bug"
      && ["S1_BLOCKING", "S2_MAJOR"].includes(item?.feedback?.betaIssue?.severity)
      && item?.status !== "RESOLVED");

    const valueByTester = learningByTester.filter(item => {
      const learning = item?.feedback?.learning || {};
      return ["YES", "NO", "UNSURE"].includes(learning.surfacedImportant)
        && ["CHANGED", "CONFIRMED", "NEITHER"].includes(learning.decisionEffect)
        && ["YES", "MAYBE", "NO"].includes(learning.futureUse);
    });
    const surfacedYes = valueByTester.filter(item => item.feedback.learning.surfacedImportant === "YES").length;
    const changedOrConfirmed = valueByTester.filter(item => ["CHANGED", "CONFIRMED"].includes(item.feedback.learning.decisionEffect)).length;
    const futureYes = valueByTester.filter(item => item.feedback.learning.futureUse === "YES").length;

    const activationRate = invited ? activated / invited : 0;
    const blockedRate = ratingByTester.length ? blocked / ratingByTester.length : 0;
    let recommendation = "BUILD FIRST 5";
    let tone = "neutral";
    if (invited >= 5) {
      recommendation = "HOLD AT 5";
      if (severe.length || (ratingByTester.length >= 3 && blockedRate >= 0.30)) {
        recommendation = "PAUSE AND FIX";
        tone = "error";
      } else if (invited >= 3 && activationRate < 0.70) {
        recommendation = "HOLD — FIX ACTIVATION";
        tone = "warn";
      } else if (learningByTester.length >= 3 && futureYes >= 3) {
        recommendation = "EXPAND TO 10";
        tone = "ok";
      }
    }

    return {
      invited,
      activated,
      firstSession: learningByTester.length,
      clear,
      blocked,
      rated: ratingByTester.length,
      severe,
      activationRate,
      blockedRate,
      recommendation,
      tone,
      surfacedYes,
      changedOrConfirmed,
      futureYes,
    };
  }

  function renderComprehension(summary) {
    metric("responses", summary.responses);
    metric("decision-clear", summary.decisionYes);
    metric("decision-partly", summary.decisionPartly);
    metric("next-clear", summary.nextYes);
    metric("evidence-up", summary.evidenceUp);
    metric("evidence-down", summary.evidenceDown);
    metric("value-responses", summary.valueResponses);
    metric("surfaced-important", summary.surfacedYes);
    metric("future-use", summary.futureYes);
    const topLayer = document.querySelector('[data-cdi-learning-metric="top-layer"]');
    if (topLayer) topLayer.textContent = summary.topLayer;
    status(
      summary.responses
        ? `${summary.responses} Wave 1 comprehension response${summary.responses === 1 ? "" : "s"}; ${summary.valueResponses} include product-value signals. These counts measure tester understanding and usefulness, not product accuracy.`
        : "No Wave 1 structured comprehension checks have been submitted yet.",
      summary.responses ? "ok" : "neutral"
    );
  }

  function renderWave(summary) {
    waveMetric("invited", summary.invited);
    waveMetric("activated", summary.activated);
    waveMetric("activation-rate", percent(summary.activated, summary.invited));
    waveMetric("first-session", summary.firstSession);
    waveMetric("clear-rate", percent(summary.clear, summary.rated));
    waveMetric("blocked-rate", percent(summary.blocked, summary.rated));
    waveMetric("severe-blockers", summary.severe.length);
    waveMetric("surfaced-important", summary.surfacedYes);
    waveMetric("changed-confirmed", summary.changedOrConfirmed);
    waveMetric("future-use", summary.futureYes);
    waveStatus(`${summary.recommendation} — Wave 1 rule-based operating signal, not an accuracy or market-performance claim.`, summary.tone);

    const list = document.querySelector("[data-wave1-blockers]");
    if (!list) return;
    if (!summary.severe.length) {
      list.innerHTML = '<div class="ff-operator-empty"><strong>No unresolved S1/S2 beta blockers</strong><p>Severe issue reports will appear here without card identities, listing URLs, tenant IDs, or credentials.</p></div>';
      return;
    }
    list.innerHTML = summary.severe.map(item => {
      const severity = String(item?.feedback?.betaIssue?.severity || "").replaceAll("_", " ");
      const route = String(item?.feedback?.route || "unknown");
      const copy = String(item?.feedback?.summary || "Issue reported");
      return `<article class="ff-wave1-blocker"><span>${severity} · ${route}</span><strong>${copy.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</strong></article>`;
    }).join("");
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
      const waveRecords = (payload.feedback || []).filter(item => String(item?.cohort || "").toLowerCase() === WAVE);
      const comprehension = comprehensionSummary(waveRecords);
      renderComprehension(comprehension);
      renderWave(waveSummary(payload.applications || [], payload.feedback || []));
    } catch (_) {
      status("The Decision Intelligence scorecard could not refresh. No tester data was changed.", "error");
      waveStatus("Wave 1 scorecard could not refresh. No tester data was changed.", "error");
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
