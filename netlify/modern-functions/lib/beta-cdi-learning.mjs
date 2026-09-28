const ALLOWED = Object.freeze({
  decisionUnderstood: new Set(["YES", "PARTLY", "NO"]),
  nextStepClear: new Set(["YES", "PARTLY", "NO"]),
  evidenceImpact: new Set(["INCREASED", "NO_CHANGE", "DECREASED", "NOT_VIEWED"]),
  mostUsefulLayer: new Set([
    "IDENTITY",
    "EVIDENCE",
    "ECONOMICS",
    "RISK_UNCERTAINTY",
    "DECISION",
    "RECEIPT",
    "OUTCOME",
    "NONE",
  ]),
  surfacedImportant: new Set(["YES", "NO", "UNSURE"]),
  decisionEffect: new Set(["CHANGED", "CONFIRMED", "NEITHER"]),
  futureUse: new Set(["YES", "MAYBE", "NO"]),
});

function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function selected(input, key, allowed) {
  const value = clean(input?.[key]).toUpperCase();
  return allowed.has(value) ? value : "";
}

export function validateCdiLearning(input) {
  const raw = {
    decisionUnderstood: selected(input, "decisionUnderstood", ALLOWED.decisionUnderstood),
    nextStepClear: selected(input, "nextStepClear", ALLOWED.nextStepClear),
    evidenceImpact: selected(input, "evidenceImpact", ALLOWED.evidenceImpact),
    mostUsefulLayer: selected(input, "mostUsefulLayer", ALLOWED.mostUsefulLayer),
    surfacedImportant: selected(input, "surfacedImportant", ALLOWED.surfacedImportant),
    decisionEffect: selected(input, "decisionEffect", ALLOWED.decisionEffect),
    futureUse: selected(input, "futureUse", ALLOWED.futureUse),
  };

  const comprehensionKeys = ["decisionUnderstood", "nextStepClear", "evidenceImpact", "mostUsefulLayer"];
  const valueKeys = ["surfacedImportant", "decisionEffect", "futureUse"];
  const attemptedComprehension = comprehensionKeys.some(key => clean(input?.[key]).length > 0);
  const attemptedValue = valueKeys.some(key => clean(input?.[key]).length > 0);
  if (!attemptedComprehension && !attemptedValue) return { ok: true, signals: null, errors: [] };

  const errors = [];
  if (attemptedComprehension) {
    if (!raw.decisionUnderstood) errors.push("CDI_DECISION_UNDERSTANDING_INVALID");
    if (!raw.nextStepClear) errors.push("CDI_NEXT_STEP_INVALID");
    if (!raw.evidenceImpact) errors.push("CDI_EVIDENCE_IMPACT_INVALID");
    if (!raw.mostUsefulLayer) errors.push("CDI_LAYER_INVALID");
  }
  if (attemptedValue) {
    if (!raw.surfacedImportant) errors.push("BETA_SURFACED_IMPORTANT_INVALID");
    if (!raw.decisionEffect) errors.push("BETA_DECISION_EFFECT_INVALID");
    if (!raw.futureUse) errors.push("BETA_FUTURE_USE_INVALID");
  }

  return {
    ok: errors.length === 0,
    signals: {
      ...(attemptedComprehension ? {
        decisionUnderstood: raw.decisionUnderstood,
        nextStepClear: raw.nextStepClear,
        evidenceImpact: raw.evidenceImpact,
        mostUsefulLayer: raw.mostUsefulLayer,
      } : {}),
      ...(attemptedValue ? {
        surfacedImportant: raw.surfacedImportant,
        decisionEffect: raw.decisionEffect,
        futureUse: raw.futureUse,
      } : {}),
    },
    errors,
  };
}

export function summarizeCdiLearning(records) {
  const decisionUnderstood = { YES: 0, PARTLY: 0, NO: 0 };
  const nextStepClear = { YES: 0, PARTLY: 0, NO: 0 };
  const evidenceImpact = { INCREASED: 0, NO_CHANGE: 0, DECREASED: 0, NOT_VIEWED: 0 };
  const mostUsefulLayer = {
    IDENTITY: 0,
    EVIDENCE: 0,
    ECONOMICS: 0,
    RISK_UNCERTAINTY: 0,
    DECISION: 0,
    RECEIPT: 0,
    OUTCOME: 0,
    NONE: 0,
  };
  const surfacedImportant = { YES: 0, NO: 0, UNSURE: 0 };
  const decisionEffect = { CHANGED: 0, CONFIRMED: 0, NEITHER: 0 };
  const futureUse = { YES: 0, MAYBE: 0, NO: 0 };

  let responses = 0;
  let valueResponses = 0;
  for (const record of records || []) {
    const signals = record?.feedback?.learning;
    if (!signals || typeof signals !== "object") continue;

    const comprehensionValid = Object.hasOwn(decisionUnderstood, signals.decisionUnderstood)
      && Object.hasOwn(nextStepClear, signals.nextStepClear)
      && Object.hasOwn(evidenceImpact, signals.evidenceImpact)
      && Object.hasOwn(mostUsefulLayer, signals.mostUsefulLayer);
    if (comprehensionValid) {
      responses += 1;
      decisionUnderstood[signals.decisionUnderstood] += 1;
      nextStepClear[signals.nextStepClear] += 1;
      evidenceImpact[signals.evidenceImpact] += 1;
      mostUsefulLayer[signals.mostUsefulLayer] += 1;
    }

    const valueValid = Object.hasOwn(surfacedImportant, signals.surfacedImportant)
      && Object.hasOwn(decisionEffect, signals.decisionEffect)
      && Object.hasOwn(futureUse, signals.futureUse);
    if (valueValid) {
      valueResponses += 1;
      surfacedImportant[signals.surfacedImportant] += 1;
      decisionEffect[signals.decisionEffect] += 1;
      futureUse[signals.futureUse] += 1;
    }
  }

  const rankedLayers = Object.entries(mostUsefulLayer)
    .filter(([layer]) => layer !== "NONE")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const topLayer = rankedLayers[0]?.[1] > 0
    ? { layer: rankedLayers[0][0], count: rankedLayers[0][1] }
    : null;

  return {
    responses,
    valueResponses,
    decisionUnderstood,
    nextStepClear,
    evidenceImpact,
    mostUsefulLayer,
    surfacedImportant,
    decisionEffect,
    futureUse,
    topLayer,
    countingBoundary: "TESTER_COMPREHENSION_AND_PRODUCT_VALUE_NOT_PRODUCT_ACCURACY",
  };
}
