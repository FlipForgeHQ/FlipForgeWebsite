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
  ["customer check runs on saved decision detail", customerSource.includes('parts[0] !== "opportunities"') && customerSource.includes("data-ff-decision-card-evidence")],
  ["customer check captures four governed fields", ["decisionUnderstood", "nextStepClear", "evidenceImpact", "mostUsefulLayer"].every(value => customerSource.includes(value))],
  ["customer check stores no card identity or listing URL", !/cardIdentity|listingUrl|externalListingId/i.test(customerSource)],
  ["customer check posts only to beta feedback endpoint", customerSource.includes('ENDPOINT = "/api/beta/feedback"') && !/\/api\/v1\/opportunities|\/api\/v1\/evidence/i.test(customerSource)],
  ["customer check preserves authority boundary", customerSource.includes("does not change the saved decision") && customerSource.includes("evidence authority")],
  ["customer check is active-tester gated", customerSource.includes("membershipActive") && customerSource.includes("Active invited testers")],
  ["learning assets load from existing DI polish layer", loaderSource.includes("ensureBetaCdiLearningAssets") && loaderSource.includes("beta-cdi-learning-v1.js") && loaderSource.includes("beta-cdi-learning-v1.css")],
  ["operator scorecard is role-gated through existing operator endpoint", operatorSource.includes('ENDPOINT = "/api/beta/operator"') && operatorSource.includes("operatorActive")],
  ["operator scorecard is read only", operatorSource.includes('method: "GET"') && !/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(operatorSource)],
  ["operator scorecard keeps no browser persistence", !/localStorage|sessionStorage|indexedDB/i.test(operatorSource)],
  ["operator page exposes CDI scorecard", operatorHtml.includes("Decision Intelligence scorecard") && operatorHtml.includes("data-cdi-learning-scorecard")],
  ["scorecard explicitly denies accuracy meaning", operatorHtml.includes("They are not accuracy") && operatorSource.includes("not product accuracy")],
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

const valid = validateCdiLearning({
  decisionUnderstood: "YES",
  nextStepClear: "PARTLY",
  evidenceImpact: "INCREASED",
  mostUsefulLayer: "EVIDENCE",
});
assert.equal(valid.ok, true);
assert.equal(valid.signals.decisionUnderstood, "YES");

const invalid = validateCdiLearning({
  decisionUnderstood: "MAYBE",
  nextStepClear: "YES",
  evidenceImpact: "INCREASED",
  mostUsefulLayer: "EVIDENCE",
});
assert.equal(invalid.ok, false);
assert.ok(invalid.errors.includes("CDI_DECISION_UNDERSTANDING_INVALID"));

const summary = summarizeCdiLearning([
  { feedback: { learning: valid.signals } },
  { feedback: { learning: { decisionUnderstood: "PARTLY", nextStepClear: "YES", evidenceImpact: "NO_CHANGE", mostUsefulLayer: "DECISION" } } },
  { feedback: { category: "workflow" } },
]);
assert.equal(summary.responses, 2);
assert.equal(summary.decisionUnderstood.YES, 1);
assert.equal(summary.decisionUnderstood.PARTLY, 1);
assert.equal(summary.nextStepClear.YES, 1);
assert.equal(summary.evidenceImpact.INCREASED, 1);
assert.equal(summary.countingBoundary, "TESTER_COMPREHENSION_NOT_PRODUCT_ACCURACY");

if (failed) process.exitCode = 1;
else console.log("Beta CDI learning scorecard validation passed.");
