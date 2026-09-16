import fs from "node:fs";
import assert from "node:assert/strict";
import { validateCdiLearning, summarizeCdiLearning } from "../netlify/modern-functions/lib/beta-cdi-learning.mjs";

const read = path => fs.readFileSync(path, "utf8");
const feedbackSource = read("netlify/modern-functions/beta-feedback.mjs");
const customerSource = read("saas-prototype/beta-cdi-learning-v1.js");
const customerCss = read("saas-prototype/beta-cdi-learning-v1.css");
const loaderSource = read("saas-prototype/decision-intelligence-final-polish-v1.js");
const operatorHtml = read("operator-beta.html");
const operatorSource = read("assets/js/beta-cdi-scorecard-operator-v1.js");

const checks = [
  ["feedback intake validates CDI learning signals", feedbackSource.includes("validateCdiLearning") && feedbackSource.includes("learning: learningValidation.signals")],
  ["feedback intake binds a pseudonymous tester key", feedbackSource.includes("pseudonymousTesterKey") && feedbackSource.includes("testerKey") && !feedbackSource.includes("testerEmail")],
  ["feedback intake stamps only signed beta cohort", feedbackSource.includes("signedCohort(user)") && feedbackSource.includes("metadata?.flipforge?.cohort") && feedbackSource.includes("cohort: record.cohort")],
  ["feedback intake accepts governed beta issue severity", ["S1_BLOCKING", "S2_MAJOR", "S3_MINOR", "S4_COSMETIC"].every(value => feedbackSource.includes(value))],
  ["customer learning loads in canonical customer app", loaderSource.includes("ensureBetaCdiLearningAssets") && loaderSource.includes("beta-cdi-learning-v1.js") && !loaderSource.includes("if (fullCustomerMode()) return")],
  ["customer check runs on saved decision detail", customerSource.includes('parts[0] !== "opportunities"') && customerSource.includes("data-ff-decision-card-evidence")],
  ["customer check captures seven governed fields", ["decisionUnderstood", "nextStepClear", "evidenceImpact", "mostUsefulLayer", "surfacedImportant", "decisionEffect", "futureUse"].every(value => customerSource.includes(value))],
  ["customer first run is reduced to five mission tasks", customerSource.includes("Your 5-task Wave 1 mission") && ["Bring one real card", "Verify the exact identity", "Get the FlipForge decision", "Challenge the evidence", "Track it and tell us what changed"].every(value => customerSource.includes(value))],
  ["customer beta issue flow is severity tagged", customerSource.includes("Report a beta issue") && customerSource.includes("S1 — I cannot continue") && customerSource.includes('category: "bug"')],
  ["customer check stores no card identity or listing URL", !/cardIdentity|listingUrl|externalListingId/i.test(customerSource)],
  ["customer check posts only to beta feedback endpoint", customerSource.includes('ENDPOINT = "/api/beta/feedback"') && !/\/api\/v1\/opportunities|\/api\/v1\/evidence/i.test(customerSource)],
  ["customer check preserves authority boundary", customerSource.includes("does not change the saved decision") && customerSource.includes("evidence authority")],
  ["customer check is active-tester gated", customerSource.includes("membershipActive") && customerSource.includes("activeTester()")],
  ["operator scorecard is role-gated through existing operator endpoint", operatorSource.includes('ENDPOINT = "/api/beta/operator"') && operatorSource.includes("operatorActive")],
  ["operator scorecard is read only", operatorSource.includes('method: "GET"') && !/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(operatorSource)],
  ["operator scorecard keeps no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(operatorSource)],
  ["operator scorecard filters official metrics to Wave 1 cohort", operatorSource.includes('WAVE = "wave-1-sep-2026"') && operatorSource.includes("item?.cohort") && operatorSource.includes("waveRecords")],
  ["operator scorecard excludes missing ratings from rate denominator", operatorSource.includes("rating !== null") && operatorSource.includes('rating !== ""')],
  ["operator page exposes Wave 1 launch scorecard", operatorHtml.includes("Founder beta scorecard") && operatorHtml.includes("data-wave1-launch-scorecard") && operatorHtml.includes("data-wave1-recommendation")],
  ["operator Wave 1 rules include hold expand pause", ["BUILD FIRST 5", "HOLD AT 5", "PAUSE AND FIX", "EXPAND TO 10"].every(value => operatorSource.includes(value))],
  ["operator page uses canonical customer route", operatorHtml.includes('href="/app/customer/#/dashboard"') && !operatorHtml.includes('href="/app/#/dashboard"')],
  ["scorecard explicitly denies accuracy meaning", operatorHtml.includes("not accuracy") && operatorSource.includes("not product accuracy")],
  ["customer-visible learning text respects 14px floor", !/font-size\s*:\s*(?:[0-9]|1[0-3])px/i.test(customerCss)],
  ["learning check is responsive", customerCss.includes("@media(max-width:640px)")],
];

let failed = 0;
for (const [name, condition] of checks) {
  if (!condition) { failed += 1; console.error(`FAIL - ${name}`); }
  else console.log(`PASS - ${name}`);
}

const legacy = validateCdiLearning({ category: "evidence" });
assert.equal(legacy.ok, true);
assert.equal(legacy.signals, null);

const comprehensionOnly = validateCdiLearning({
  decisionUnderstood: "YES",
  nextStepClear: "PARTLY",
  evidenceImpact: "INCREASED",
  mostUsefulLayer: "EVIDENCE",
});
assert.equal(comprehensionOnly.ok, true);
assert.equal(comprehensionOnly.signals.decisionUnderstood, "YES");

const full = validateCdiLearning({
  decisionUnderstood: "YES",
  nextStepClear: "YES",
  evidenceImpact: "INCREASED",
  mostUsefulLayer: "EVIDENCE",
  surfacedImportant: "YES",
  decisionEffect: "CONFIRMED",
  futureUse: "YES",
});
assert.equal(full.ok, true);
assert.equal(full.signals.futureUse, "YES");
assert.equal(full.signals.decisionEffect, "CONFIRMED");

const invalid = validateCdiLearning({
  decisionUnderstood: "YES",
  nextStepClear: "YES",
  evidenceImpact: "INCREASED",
  mostUsefulLayer: "EVIDENCE",
  surfacedImportant: "SOMETIMES",
  decisionEffect: "CONFIRMED",
  futureUse: "YES",
});
assert.equal(invalid.ok, false);
assert.ok(invalid.errors.includes("BETA_SURFACED_IMPORTANT_INVALID"));

const summary = summarizeCdiLearning([
  { feedback: { learning: full.signals } },
  { feedback: { learning: { decisionUnderstood: "PARTLY", nextStepClear: "YES", evidenceImpact: "NO_CHANGE", mostUsefulLayer: "DECISION", surfacedImportant: "NO", decisionEffect: "CHANGED", futureUse: "MAYBE" } } },
  { feedback: { learning: comprehensionOnly.signals } },
  { feedback: { category: "workflow" } },
]);
assert.equal(summary.responses, 3);
assert.equal(summary.valueResponses, 2);
assert.equal(summary.decisionUnderstood.YES, 2);
assert.equal(summary.decisionUnderstood.PARTLY, 1);
assert.equal(summary.surfacedImportant.YES, 1);
assert.equal(summary.decisionEffect.CONFIRMED, 1);
assert.equal(summary.decisionEffect.CHANGED, 1);
assert.equal(summary.futureUse.YES, 1);
assert.equal(summary.countingBoundary, "TESTER_COMPREHENSION_AND_PRODUCT_VALUE_NOT_PRODUCT_ACCURACY");

if (failed) process.exitCode = 1;
else console.log("Wave 1 beta learning and launch scorecard validation passed.");
