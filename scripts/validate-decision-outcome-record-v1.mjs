// Static checks for "Record what you did" (customer-reported outcomes v1): the panel is the customer's own,
// unverified report, goes only to /api/v1/decision-outcomes through the gateway, never sits in the CDI Signal Stack,
// never reaches marketing or product analytics, and never changes a saved decision.
import fs from "node:fs";
const read = p => fs.readFileSync(p, "utf8");
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);
const src = read("saas-prototype/decision-outcome-record-v1.js");
const gateway = read("netlify/functions/flipforge-api.js");
new Function(src);
check("module parses", true);
check("gateway allows only GET and POST /api/v1/decision-outcomes/{id}",
  gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/decision-outcomes\\/[A-Za-z0-9._:-]+$/ }')
  && gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/decision-outcomes\\/[A-Za-z0-9._:-]+$/ }')
  && !/method: "(PUT|DELETE)", pattern: \/\^\\\/api\\\/v1\\\/decision-outcomes/.test(gateway));
check("only the decision-outcomes route is called", (src.match(/fetch\(/g) || []).length === 1 && src.includes("`/api/v1/decision-outcomes/${encodeURIComponent(opportunityId)}`"));
check("only GET and POST", src.includes('["GET", "POST"].includes(method)'));
check("response must be the unverified, never-learning contract", src.includes('data.verificationStatus === "UNVERIFIED"') && src.includes("data.learningEligible === false") && src.includes("data.savedDecisionChanged === false"));
check("customer copy says it is the customer's own unverified report and never changes the decision", src.includes("It is not verified, it never changes the saved decision, and it is not used for learning."));
check("three actions: bought, passed, sold", src.includes('BOUGHT: "I bought it"') && src.includes('PASSED: "I passed"') && src.includes('SOLD: "I sold it"'));
check("never inside the CDI Signal Stack", src.includes('anchor.closest("[data-ff-cdi-signal]")') && !src.includes('class="ff-cdi'));
check("no marketing or product analytics calls", !/gtag|posthog|plausible|FlipForgeEvents|trackEvent|\/api\/v1\/events|analytics/i.test(src.replace("not used for learning", "")));
check("feature off (404) removes the panel", src.includes("error.status === 404") && src.includes("state.featureOff = true"));
check("no page-wide observer", !src.includes("MutationObserver"));
for (const page of ["saas-prototype/customer.html", "saas-prototype/index.html"]) {
  check(`${page} loads the module once, after reported sales`, (read(page).match(/decision-outcome-record-v1\.js/g) || []).length === 1);
}
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`validate-decision-outcome-record-v1: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
