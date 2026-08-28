import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("saas-prototype/index.html");
const hook = read("saas-prototype/staging-route-hook.js");
const lifecycle = read("saas-prototype/customer-lifecycle.js");
const management = read("saas-prototype/customer-management.js");
const decision = read("saas-prototype/decision-intelligence-v1.js");
const dashboardGuard = read("saas-prototype/production-dashboard-guard.js");
const commercialDashboard = read("saas-prototype/commercial-dashboard-v2.js");
const opportunities = read("saas-prototype/customer-opportunities.js");
const opportunitiesBridge = read("saas-prototype/customer-opportunities-bridge.js");
const discovery = read("saas-prototype/customer-discovery.js");
const saveFlow = read("saas-prototype/customer-save-flow-v1.js");
const betaFlow = read("saas-prototype/beta-customer-flow-v2.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

const requiredScripts = [
  "production-dashboard-guard.js",
  "commercial-dashboard-v2.js",
  "staging-evaluation.js",
  "customer-opportunities.js",
  "customer-opportunities-bridge.js",
  "customer-compare.js",
  "customer-lifecycle.js",
  "customer-management.js",
  "customer-portfolio.js",
  "customer-export.js",
  "customer-discovery.js",
  "customer-forge-heat.js",
  "customer-market-view.js",
  "customer-entitlements.js",
  "decision-intelligence-v1.js",
  "staging-route-hook.js"
];

for (const script of requiredScripts) {
  check(`production app retains ${script}`, index.includes(`<script src="${script}"></script>`));
}

check("Dashboard has a dedicated production prototype guard", dashboardGuard.includes("PRODUCTION_HOST") && dashboardGuard.includes("[data-commercial-dashboard-v2]") && dashboardGuard.includes("[data-production-dashboard-guard]"));
check("Commercial Dashboard fails closed when bridge is unavailable", commercialDashboard.includes("CUSTOMER_API_NOT_CONFIGURED") && commercialDashboard.includes("bridgeEnabled") && commercialDashboard.includes('credentials: "same-origin"'));
check("Commercial Dashboard validates Smart Opportunity authority", commercialDashboard.includes('meta.authority === "Smart Opportunity"') && commercialDashboard.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("Discover is routed to the dedicated customer adapter", hook.includes('route === "discover"') && hook.includes("discoveryAdapter.render(main)"));
check("Discover releases the evaluation lock before opening saved Card Intelligence", discovery.includes('state.evaluatingIndex = -1;\n      window.location.hash = `#/opportunities/${encodeURIComponent(result.payload.data.opportunityId)}`;'));
check("Discover clears any stale evaluation lock whenever the route is rendered again", discovery.includes('async function render(main) {\n    state.main = main;\n    state.evaluatingIndex = -1;'));
check("Evaluate uses the shared customer renderer", hook.includes('route === "evaluate"') && hook.includes("evaluationAdapter.renderCustomer(main)"));
check("Saved Decisions / Card Intelligence uses the production opportunity bridge", hook.includes("FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities") && hook.includes('route === "opportunities" && renderOpportunityRoute(id)'));
check("Opportunity detail renderer validates exact requested ids", opportunities.includes("state.requestedId") && opportunities.includes("/api/v1/opportunities/${encoded}") && opportunities.includes("SAFE_ID"));
check("Opportunity bridge does not require staging diagnostics in production", opportunitiesBridge.includes("const stagingAdapter = window.FlipForgeStagingReadAdapter") && opportunitiesBridge.includes("const customerAdapter = window.FlipForgeCustomerOpportunities") && !opportunitiesBridge.includes("if (!stagingAdapter || !customerAdapter) return"));
check("Understand decision CTA is present in the customer beta flow", betaFlow.includes("data-ff-show-why") && betaFlow.includes("Understand this decision →"));
check("Understand decision CTA has deterministic scroll/focus behavior with Evidence fallback", saveFlow.includes("function focusDecisionWhy()") && saveFlow.includes('[data-ff-show-why]') && saveFlow.includes("target.scrollIntoView") && saveFlow.includes('window.location.hash = `#/evidence/${encodeURIComponent(id)}`'));
check("Tracking route is owned by lifecycle adapter", lifecycle.includes('const ROUTES = new Set(["tracking", "portfolio", "alerts"])') && hook.includes("lifecycleAdapter.handles(route)"));
check("Tracking lifecycle reads/writes stay server-owned", lifecycle.includes('"/api/v1/lifecycle"') && lifecycle.includes('/api/v1/lifecycle/${') && lifecycle.includes('credentials: "same-origin"'));
check("Portfolio has a dedicated customer adapter before generic lifecycle handling", hook.includes('route === "portfolio"') && hook.indexOf('route === "portfolio"') < hook.indexOf("lifecycleAdapter.handles(route)"));
check("Alerts has a server-owned lifecycle path", lifecycle.includes('"alerts"') && lifecycle.includes('"/api/v1/alerts"'));
check("PSA Advisor is owned by customer management", management.includes('const ROUTES = new Set(["psa-advisor", "evidence", "sell", "portfolio", "alerts"])') && hook.includes("managementAdapter.handles(route)") && management.includes('/api/v1/psa-advisor/${encoded}'));
check("Evidence is owned by customer management", management.includes('"evidence"') && management.includes('/api/v1/evidence/${encoded}'));
check("Exit Review is owned by customer management", management.includes('"sell"') && management.includes("sellView"));
check("Compare is routed to the dedicated customer adapter", hook.includes('route === "compare"') && hook.includes("compareAdapter.render(main"));
check("Forge Heat is routed to the dedicated customer adapter", hook.includes('route === "forge-heat"') && hook.includes("forgeHeatAdapter.render(main)"));
check("Market View is routed to the dedicated customer adapter", hook.includes('route === "market-view"') && hook.includes("marketViewAdapter.render(main)"));
check("Audit Export is routed through the customer export adapter", hook.includes("exportAdapter.handles(route)") && hook.includes("exportAdapter.render(main, id)"));
check("Account / Plan & Usage is routed to customer entitlements", hook.includes('route === "account"') && hook.includes("entitlementsAdapter.render(main)"));
check("Decision Intelligence production host cannot fall back to prototype rows", decision.includes("if (productionHost())") && decision.includes('state.source = "error"') && decision.includes('state.source = "prototype"'));
check("Decision Intelligence validates Smart Opportunity authority", decision.includes('meta.authority === "Smart Opportunity"'));
check("Decision Intelligence validates PSA authority", decision.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("Customer route hook has no transaction action", !/buy now|place bid|execute purchase/i.test(hook));

const sourceRoutes = [
  "dashboard",
  "discover",
  "evaluate",
  "opportunities",
  "tracking",
  "alerts",
  "portfolio",
  "forge-heat",
  "market-view",
  "decision-intelligence",
  "compare",
  "psa-advisor",
  "evidence",
  "sell",
  "export",
  "account"
];

for (const route of sourceRoutes) {
  check(`navigation route ${route} remains represented in production source`, index.includes(`data-route="${route}"`) || index.includes(`href="#/${route}`));
}

const failures = results.filter(result => !result.passed);
console.log("ProductionRouteAuthorityValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
