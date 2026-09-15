import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const customer = read("saas-prototype/customer.html");
const parity = read("saas-prototype/customer-navigation-parity-v1.js");
const betaShell = read("saas-prototype/customer-only-shell-v1.js");
const betaDocument = read("saas-prototype/index.html");

let passed = 0;
let failed = 0;
const failures = [];
function check(condition, name) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}`);
  if (condition) passed += 1;
  else { failed += 1; failures.push(name); }
}

const count = (text, token) => text.split(token).length - 1;
const topLevelBlock = customer.match(/<nav class="primary-nav"[\s\S]*?<details class="ff-advanced-nav">/)?.[0] || "";
const advancedBlock = customer.match(/<details class="ff-advanced-nav">[\s\S]*?<\/details>/)?.[0] || "";

const requiredTopLevel = [
  "dashboard",
  "discover",
  "evaluate",
  "decision-intelligence",
  "why-this-decision",
  "evidence",
  "opportunities",
  "tracking",
  "portfolio",
  "alerts",
  "forge-heat",
  "market-view"
];
const requiredAdvanced = ["compare", "psa-advisor", "sell", "export"];

for (const route of requiredTopLevel) {
  check(count(topLevelBlock, `data-route="${route}"`) === 1, `full customer has exactly one top-level ${route} link`);
}
check(customer.includes('href="#/decision-intelligence/why" data-route="why-this-decision"'), "Why This Decision is a Decision Intelligence subview");
check(customer.includes('href="#/evidence" data-route="evidence"') && customer.includes("Evidence Review"), "Evidence Review promotes the existing evidence route");
check(!advancedBlock.includes('data-route="why-this-decision"'), "Why This Decision is not duplicated in Advanced analysis");
check(!advancedBlock.includes('data-route="evidence"'), "Evidence Review is not duplicated in Advanced analysis");
for (const route of requiredAdvanced) {
  check(count(advancedBlock, `data-route="${route}"`) === 1, `Advanced analysis retains exactly one ${route} link`);
}
check(customer.includes('<script src="customer-navigation-parity-v1.js"></script>'), "full customer document loads parity controller");
check(!betaDocument.includes('customer-navigation-parity-v1.js'), "private beta document does not load full-customer parity controller");

check(parity.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'), "parity controller is hard-gated to /app/customer");
check(parity.includes('if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;'), "parity controller exits outside full customer path");
for (const route of requiredTopLevel) {
  check(parity.includes(`["${route}"`), `parity controller governs ${route}`);
}
check(parity.includes('route === "decision-intelligence" && subroute === "why"') && parity.includes('return "why-this-decision"'), "Why subview owns its active navigation state without new authority");
check(parity.includes('const ADVANCED_ROUTES = new Set(["compare", "psa-advisor", "sell", "export"])'), "Advanced analysis excludes promoted Evidence Review");

const forbiddenAuthorityTokens = [
  "evaluateAndSave(",
  "saveEvidence(",
  "saveListing(",
  "appendObservation(",
  "fetch(",
  "XMLHttpRequest",
  "recommendation =",
  "supportedValue =",
  "transactionAuthority =",
  'method: "POST"',
  "method: 'POST'"
];
for (const token of forbiddenAuthorityTokens) {
  check(!parity.includes(token), `navigation parity creates no authority: ${token}`);
}

check(betaShell.includes('const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);'), "private beta keeps its intentionally simplified four-route core");
check(betaShell.includes('"decision-intelligence", "why-this-decision", "market-view", "forge-heat", "evaluate", "portfolio", "alerts"'), "private beta explicitly hides full-customer Why and management routes from navigation");
check(betaShell.includes('"compare", "psa-advisor", "evidence", "sell", "export"'), "private beta still hides advanced/evidence navigation while preserving internal route availability");
check(betaShell.includes('"why-this-decision", "evidence"') || (betaShell.includes('"why-this-decision"') && betaShell.includes('"evidence"')), "private beta hide contract covers both promoted explanation surfaces");
check(!betaShell.includes("customer-navigation-parity-v1"), "private beta shell has no dependency on the full-customer parity controller");

check(!customer.includes('src="private-beta.js"'), "full customer never loads private-beta runtime");
check(!customer.includes('src="beta-session-v1.js"'), "full customer never loads beta-session runtime");
check(!customer.includes('src="beta-customer-flow-v2.js"'), "full customer never loads beta-flow runtime");

console.log(`\nCustomer Navigation Parity Contract\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
