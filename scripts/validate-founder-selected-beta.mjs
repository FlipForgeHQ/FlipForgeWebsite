import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

const operator = read("operator-beta.html");
const founderUi = read("assets/js/beta-founder-select.js");
const founderFn = read("netlify/modern-functions/beta-founder-select.mjs");
const operatorFn = read("netlify/modern-functions/beta-operator.mjs");
const termsFn = read("netlify/modern-functions/beta-terms-acceptance.mjs");
const termsGate = read("assets/js/beta-invite-terms-gate.js");
const injector = read("scripts/inject-beta-invite-terms-gate.mjs");

check("001 operator loads founder-selected UI", operator.includes("beta-founder-select.js"));
check("002 founder endpoint is operator-authenticated", founderFn.includes("isOperator(user)") && founderFn.includes('path: "/api/beta/founder-select"'));
check("003 founder record is approved but terms remain unaccepted", founderFn.includes('status: "APPROVED"') && founderFn.includes('betaTermsAccepted: false') && founderFn.includes('selectionSource: "FOUNDER_SELECTED"'));
check("004 founder intake deduplicates by email index", founderFn.includes("emailIndexKey(email)") && founderFn.includes("onlyIfNew: true"));
check("005 direct founder UI sends invitation after record creation", founderUi.includes('OPERATOR_ENDPOINT="/api/beta/operator"') && founderUi.includes('action:"invite"') && founderUi.includes('applicationId:application.id') && founderUi.includes('expectedVersion:Number(application.version)'));
check("006 direct founder UI is a single Send private beta invite action", founderUi.includes("Send private beta invite") && founderUi.includes("Invite a tester") && !founderUi.includes("Add founder-selected tester"));
check("007 invitation UI requires explicit Beta Terms checkbox", termsGate.includes("data-beta-terms-accept") && termsGate.includes("/beta-terms.html") && termsGate.includes("stopImmediatePropagation"));
check("008 founder invitation withholds active role until Terms", operatorFn.includes('TERMS_PENDING_ROLE = "flipforge-terms-pending"') && operatorFn.includes('access: requiresTerms ? "terms_pending" : "active"') && operatorFn.includes('roles.push(requiresTerms ? TERMS_PENDING_ROLE : ACTIVE_ROLE)'));
check("009 founder activation sync waits for Terms receipt", operatorFn.includes("founderTermsPending(application)") && operatorFn.includes("if (founderTermsPending(application)) return application"));
check("010 terms receipt accepts only bound beta membership", termsFn.includes("BETA_MEMBERSHIP_REQUIRED") && termsFn.includes("APPLICATION_IDENTITY_MISMATCH") && termsFn.includes("TENANT_MEMBERSHIP_MISMATCH"));
check("011 Terms acceptance promotes founder-selected membership", termsFn.includes("promoteFounderSelected") && termsFn.includes("TERMS_PENDING_ROLE") && termsFn.includes("roles.push(ACTIVE_ROLE)"));
check("012 terms receipt uses versioned conditional write", termsFn.includes('BETA_TERMS_VERSION = "2026-08-15"') && termsFn.includes("onlyIfMatch: etag"));
check("013 invitation acceptance is persisted for retry before workspace use", termsGate.includes("PENDING_KEY") && termsGate.includes("/api/beta/terms-acceptance") && termsGate.includes("Finalizing your beta access"));
check("014 terms gate injects into public callback and app surfaces", injector.includes('inject("index.html")') && injector.includes('saas-prototype'));
check("015 founder UI defaults Wave 1 cohort", founderUi.includes('wave-1-sep-2026'));
check("016 public applications remain separately reviewable", operator.includes("Public application queue") && operator.includes("UNDER_REVIEW") && operator.includes("WAITLISTED"));
check("017 no payment or transaction authority is added", !founderFn.includes("checkout") && !termsFn.includes("checkout") && operator.includes("No billing or transaction authority is granted"));

for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
const failed = checks.filter(item => !item.passed);
if (failed.length) {
  console.error(`Founder-selected beta validation failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Founder-selected beta validation passed: ${checks.length}/${checks.length}`);
