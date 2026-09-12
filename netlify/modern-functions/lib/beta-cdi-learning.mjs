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
  };

  const attempted = ["decisionUnderstood", "nextStepClear", "evidenceImpact", "mostUsefulLayer"]
    .some(key => clean(input?.[key]).length > 0);
  if (!attempted) return { ok: true, signals: null, errors: [] };

  const errors = [];
  if (!raw.decisionUnderstood) errors.push("CDI_DECISION_UNDERSTANDING_INVALID");
  if (!raw.nextStepClear) errors.push("CDI_NEXT_STEP_INVALID");
  if (!raw.evidenceImpact) errors.push("CDI_EVIDENCE_IMPACT_INVALID");
  if (!raw.mostUsefulLayer) errors.push("CDI_LAYER_INVALID");
  return { ok: errors.length === 0, signals: raw, errors };
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

  let responses = 0;
  for (const record of records || []) {
    const signals = record?.feedback?.learning;
    if (!signals || typeof signals !== "object") continue;
    if (!Object.hasOwn(decisionUnderstood, signals.decisionUnderstood)) continue;
    if (!Object.hasOwn(nextStepClear, signals.nextStepClear)) continue;
    if (!Object.hasOwn(evidenceImpact, signals.evidenceImpact)) continue;
    if (!Object.hasOwn(mostUsefulLayer, signals.mostUsefulLayer)) continue;
    responses += 1;
    decisionUnderstood[signals.decisionUnderstood] += 1;
    nextStepClear[signals.nextStepClear] += 1;
    evidenceImpact[signals.evidenceImpact] += 1;
    mostUsefulLayer[signals.mostUsefulLayer] += 1;
  }

  const rankedLayers = Object.entries(mostUsefulLayer)
    .filter(([layer]) => layer !== "NONE")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const topLayer = rankedLayers[0]?.[1] > 0
    ? { layer: rankedLayers[0][0], count: rankedLayers[0][1] }
    : null;

  return {
    responses,
    decisionUnderstood,
    nextStepClear,
    evidenceImpact,
    mostUsefulLayer,
    topLayer,
    countingBoundary: "TESTER_COMPREHENSION_NOT_PRODUCT_ACCURACY",
  };
}
