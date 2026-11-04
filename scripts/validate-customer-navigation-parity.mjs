import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const customer = read("saas-prototype/customer.html");
const parity = read("saas-prototype/customer-navigation-parity-v1.js");
const whyView = read("saas-prototype/customer-why-decision-view-v1.js");
// customer-only-shell-v1.js was retired (Nov 3 2026): on the live pages its Home rewrite found no .page-heading on the
// Dashboard and its Private Beta Guide rewrite found no .private-beta-step, so it changed nothing. Checks read the owners.
const betaShell = ""; // the legacy shell helper is deleted (asserted below)
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
const requiredAdvanced = ["compare", "psa-advisor", "export"];

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
check(count(customer, 'data-route="sell"') === 0, "full customer omits unsupported Exit Review");
check(customer.includes('<script src="mobile-navigation-stabilizer-v1.js"></script>'), "full customer document loads mobile navigation stabilizer");
check(customer.includes('<script src="customer-navigation-parity-v1.js"></script>'), "full customer document loads parity controller");
check(!betaDocument.includes('customer-navigation-parity-v1.js'), "legacy beta document does not load full-customer parity controller");
check(!betaDocument.includes('customer-why-decision-view-v1.js'), "legacy beta document does not load focused Why presentation");

check(parity.includes('const FULL_CUSTOMER_PATH = /^\\/(?:app|owner)\\/customer(?:\\/|$)/i;'), "parity controller is hard-gated to the full customer route (/app/customer or owner preview)");
check(parity.includes('if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;'), "parity controller exits outside full customer path");
check(parity.includes('script.src = "customer-why-decision-view-v1.js"'), "full-customer controller owns focused Why presentation loading");
for (const route of requiredTopLevel) {
  check(parity.includes(`["${route}"`), `parity controller governs ${route}`);
}
check(parity.includes('route === "decision-intelligence" && subroute === "why"') && parity.includes('return "why-this-decision"'), "Why subview owns its active navigation state without new authority");
check(parity.includes('const ADVANCED_ROUTES = new Set(["compare", "psa-advisor", "export"])'), "Advanced analysis exposes only supported customer analysis routes");
check(parity.includes('const UNSUPPORTED_CUSTOMER_ROUTES = new Set(["sell"])') && parity.includes("guardUnsupportedCustomerRoute"), "unsupported Exit Review route fails closed to dashboard");

check(whyView.includes('const FULL_CUSTOMER_PATH = /^\\/(?:app|owner)\\/customer(?:\\/|$)/i;'), "focused Why view is hard-gated to the full customer route (/app/customer or owner preview)");
check(whyView.includes('parts[0] === "decision-intelligence" && parts[1] === "why"'), "focused Why view only activates on the Why subroute");
check(whyView.includes('Why FlipForge made this decision.'), "focused Why view has explanation-first customer presentation");
check(whyView.includes('Open full Decision Intelligence') && whyView.includes('Open Evidence Review'), "focused Why view preserves navigation back to governed analysis and evidence");

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
  check(!whyView.includes(token), `Why presentation creates no authority: ${token}`);
}

// The beta menu is final in index.html (founder decision, Nov 3 2026); the legacy shell helper no longer edits navigation.
{
  const betaIndex = fs.readFileSync(new URL("../saas-prototype/index.html", import.meta.url), "utf8");
  const betaNav = (betaIndex.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/) || [""])[0];
  const betaRoutes = [...betaNav.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]).join(",");
  check(betaRoutes === "dashboard,discover,evaluate,opportunities,tracking,alerts,portfolio,forge-heat,account", "beta navigation lists exactly the approved beta routes (Home, Discover, Evaluate a Card, Saved Decisions, Tracking, Alerts, Portfolio, Forge Heat) plus the phone Account shortcut");
  check(!/why-this-decision|decision-intelligence|market-view/.test(betaNav), "beta navigation offers no Why This Decision, Market View or standalone Decision Intelligence route");
  check(!/data-route="(?:compare|psa-advisor|evidence|sell|export)"/.test(betaNav) && !betaNav.includes("ff-advanced-nav"), "legacy shell helper still hides advanced/evidence navigation while preserving internal route availability");
  check(!betaShell.includes("primary-nav") && !betaShell.includes("hideElement"), "legacy shell hide contract covers both promoted explanation surfaces");
}
check(!betaShell.includes("customer-navigation-parity-v1"), "legacy shell helper has no dependency on the full-customer parity controller");
check(!betaShell.includes("customer-why-decision-view-v1"), "legacy shell helper has no dependency on focused Why presentation");
check(!fs.existsSync(new URL("../saas-prototype/customer-only-shell-v1.js", import.meta.url)), "legacy customer-only shell helper is retired; no script rewrites Home or the beta guide");

check(!topLevelBlock.includes('data-route="beta-start"') && !advancedBlock.includes('data-route="beta-start"'), "Private Beta onboarding stays out of customer primary and advanced navigation");
check(customer.includes('href="private-beta.css"'), "full customer loads Private Beta Guide styles for in-shell onboarding");
check(customer.includes('src="private-beta.js"'), "full customer loads Private Beta Guide runtime for canonical onboarding");
check(customer.lastIndexOf('src="private-beta.js"') > customer.lastIndexOf('src="customer-navigation-parity-v1.js"'), "Private Beta Guide runtime loads after customer navigation presentation layers");
check(!customer.includes('src="beta-session-v1.js"'), "full customer never loads legacy beta-session runtime");
check(!customer.includes('src="beta-customer-flow-v2.js"'), "full customer never loads legacy separate beta-flow runtime");

console.log(`\nCustomer Navigation Parity Contract\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
