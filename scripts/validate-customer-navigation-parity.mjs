import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const customer = read("saas-prototype/customer.html");
const portal = read("saas-prototype/customer-portal-architecture-v1.js");
const portalCss = read("saas-prototype/customer-portal-architecture-v1.css");
const parity = read("saas-prototype/customer-navigation-parity-v1.js");
const whyView = read("saas-prototype/customer-why-decision-view-v1.js");
const betaShell = read("saas-prototype/customer-only-shell-v1.js");
const betaDocument = read("saas-prototype/index.html");
const mobile = read("saas-prototype/mobile-navigation-stabilizer-v1.js");

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

const mountedDeepRoutes = [
  "dashboard", "discover", "evaluate", "decision-intelligence", "why-this-decision",
  "evidence", "opportunities", "tracking", "portfolio", "alerts", "forge-heat", "market-view"
];
for (const route of mountedDeepRoutes) {
  check(count(topLevelBlock, `data-route="${route}"`) === 1, `underlying customer document keeps exactly one mounted ${route} route`);
}
for (const route of ["compare", "psa-advisor", "sell", "export"]) {
  check(count(advancedBlock, `data-route="${route}"`) === 1, `underlying customer document keeps exactly one deep ${route} route`);
}

check(customer.includes('href="customer-portal-architecture-v1.css"'), "full customer loads portal architecture stylesheet");
check(customer.includes('src="customer-portal-architecture-v1.js"'), "full customer loads portal architecture runtime");
check(customer.indexOf('src="customer-portal-architecture-v1.js"') < customer.indexOf('src="customer-navigation-parity-v1.js"'), "portal architecture owns navigation before legacy parity compatibility");
check(!betaDocument.includes("customer-portal-architecture-v1"), "limited Beta does not load full portal architecture");
check(!betaDocument.includes("customer-discover-scanner-v1"), "limited Beta does not load full customer scanner");

check(portal.includes('const FULL_CUSTOMER_PATH = /^\\/app\\/customer(?:\\/|$)/i;'), "portal architecture is hard-gated to /app/customer");
check(portal.includes('if (!FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))) return;'), "portal architecture exits outside full customer path");

const fivePrimary = [
  '["dashboard", "#/dashboard", "Home", "⌂"]',
  '["discover", "#/discover", "Discover", "◇"]',
  '["opportunities", "#/opportunities", "Decisions", "◆"]',
  '["tracking", "#/tracking", "Monitor", "◷"]',
  '["portfolio", "#/portfolio", "Portfolio", "◫"]'
];
for (const token of fivePrimary) check(portal.includes(token), `five-destination portal contains ${token}`);
check(!portal.includes('["evaluate", "#/evaluate", "Evaluate a Card"'), "Manual Evaluate is not a sixth primary portal destination");
check(portal.includes('"Manual Evaluate"') && portal.includes('"Forge Heat"') && portal.includes('"Market View"'), "Discover owns contextual Evaluate, Forge Heat and Market View");
check(portal.includes('"Decision Monitor"') && portal.includes('"Review Alerts"'), "Monitor owns contextual tracking and alerts");
check(portal.includes('"Saved Decisions"') && portal.includes('"Compare"'), "Decisions owns saved-list and compare context");

for (const label of ["Decision", "Evidence", "Grade", "Monitor", "Exit", "Receipt"]) {
  check(portal.includes(`"${label}"`), `Decision Workspace includes ${label}`);
}
for (const route of ["opportunities", "evidence", "psa-advisor", "tracking", "sell", "export"]) {
  check(portal.includes(`#/${route}/\${encoded}`) || portal.includes(`#/${route}/`), `Decision Workspace preserves ${route} route`);
}
check(portal.includes("encodeURIComponent(id)"), "Decision Workspace encodes and preserves exact saved decision id");
check(portal.includes('"decision-intelligence": "opportunities"') && portal.includes('evidence: "opportunities"'), "deep decision/evidence views map back to Decisions");
check(portal.includes('alerts: "tracking"'), "Alerts maps back to Monitor");

check(portal.includes('script.src = "customer-why-decision-view-v1.js"'), "portal preserves focused Why compatibility route");
check(whyView.includes('Why FlipForge made this decision.'), "focused Why view remains explanation-first");
check(whyView.includes("Open full Decision Intelligence") && whyView.includes("Open Evidence Review"), "focused Why keeps governed handoffs");

check(parity.includes("if (window.FlipForgeCustomerPortalArchitectureV1) return;"), "legacy navigation parity yields to portal architecture");
check(betaShell.includes("if (window.FlipForgeCustomerPortalArchitectureV1) return;"), "legacy full-customer shell navigation yields to portal architecture");
check(mobile.includes("if (fullCustomerMode() && window.FlipForgeCustomerPortalArchitectureV1) return;"), "mobile stabilizer yields to portal architecture");
check(mobile.includes('html:not([data-ff-portal-architecture="v1"]) .primary-nav > a[data-ff-customer-core]'), "mobile force-visible CSS is disabled under portal architecture");
check(mobile.includes('html.ff-full-customer-app:not([data-ff-portal-architecture="v1"]) .primary-nav > .ff-advanced-nav'), "mobile cannot resurrect Advanced sidebar under portal architecture");

check(betaShell.includes('const CORE_ROUTES = new Set(["dashboard", "discover", "opportunities", "tracking"]);'), "Beta retains intentionally limited four-route core");
check(betaShell.includes('"decision-intelligence", "why-this-decision", "market-view", "forge-heat", "evaluate", "portfolio", "alerts"'), "Beta continues hiding full-portal routes");
check(!betaDocument.includes("customer-navigation-parity-v1.js"), "Beta does not load full-customer legacy parity controller");
check(!betaDocument.includes("customer-why-decision-view-v1.js"), "Beta does not load focused full-customer Why runtime directly");

check(portalCss.includes(".ff-decision-workspace-nav"), "portal styles Decision Workspace navigation");
check(portalCss.includes("@media (max-width: 860px)") && portalCss.includes("@media (max-width: 520px)"), "portal contextual navigation is responsive");
check(portalCss.includes("prefers-reduced-motion"), "portal respects reduced motion");

const forbiddenAuthorityTokens = [
  "evaluateAndSave(", "saveEvidence(", "saveListing(", "appendObservation(",
  "fetch(", "XMLHttpRequest", "recommendation =", "supportedValue =",
  "transactionAuthority =", 'method: "POST"', "method: 'POST'"
];
for (const token of forbiddenAuthorityTokens) {
  check(!portal.includes(token), `portal architecture creates no authority: ${token}`);
  check(!whyView.includes(token), `Why presentation creates no authority: ${token}`);
}

console.log(`\nCustomer Portal Navigation Contract\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failures.length) failures.forEach(item => console.log(` - ${item}`));
if (failed > 0) process.exit(1);
