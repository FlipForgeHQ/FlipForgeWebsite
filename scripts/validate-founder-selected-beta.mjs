import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

const operator = read("operator-beta.html");
const founderUi = read("assets/js/beta-founder-select.js");
const founderFn = read("netlify/modern-functions/beta-founder-select.mjs");
const termsFn = read("netlify/modern-functions/beta-terms-acceptance.mjs");
const termsGate = read("assets/js/beta-invite-terms-gate.js");
const injector = read("scripts/inject-beta-invite-terms-gate.mjs");

check("001 operator loads founder-selected UI", operator.includes("beta-founder-select.js"));
check("002 founder endpoint is operator-authenticated", founderFn.includes("isOperator(user)") && founderFn.includes('path: "/api/beta/founder-select"'));
check("003 founder record is approved but terms remain unaccepted", founderFn.includes('status: "APPROVED"') && founderFn.includes('betaTermsAccepted: false') && founderFn.includes('selectionSource: "FOUNDER_SELECTED"'));
check("004 founder intake deduplicates by email index", founderFn.includes("emailIndexKey(email)") && founderFn.includes("onlyIfNew: true"));
check("005 invitation UI requires explicit Beta Terms checkbox", termsGate.includes("data-beta-terms-accept") && termsGate.includes("/beta-terms.html") && termsGate.includes("stopImmediatePropagation"));
check("006 terms receipt is bound to authenticated active tester", termsFn.includes("isActiveTester(user)") && termsFn.includes("APPLICATION_IDENTITY_MISMATCH"));
check("007 terms receipt uses versioned conditional write", termsFn.includes('BETA_TERMS_VERSION = "2026-08-15"') && termsFn.includes("onlyIfMatch: entry.etag"));
check("008 invitation acceptance is persisted for retry before workspace use", termsGate.includes("PENDING_KEY") && termsGate.includes("/api/beta/terms-acceptance") && termsGate.includes("Finalizing your beta access"));
check("009 terms gate injects into public callback and app surfaces", injector.includes('inject("index.html")') && injector.includes('saas-prototype'));
check("010 founder UI defaults Wave 1 cohort", founderUi.includes('wave-1-sep-2026'));

for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`Founder-selected beta validation failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Founder-selected beta validation passed: ${checks.length}/${checks.length}`);
