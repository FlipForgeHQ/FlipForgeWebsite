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
const dashboard = read("saas-prototype/production-dashboard-guard.js");
const opportunities = read("saas-prototype/customer-opportunities.js");
const opportunitiesBridge = read("saas-prototype/customer-opportunities-bridge.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

const requiredScripts = [
  "production-dashboard-guard.js",
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

check("Dashboard has a dedicated production fail-closed guard", dashboard.includes("PRODUCTION_HOST") && dashboard.includes("CUSTOMER_API_NOT_CONFIGURED") && dashboard.includes("[data-commercial-dashboard-v2]"));
check("Discover is routed to the dedicated customer adapter", hook.includes('route === "discover"') && hook.includes("discoveryAdapter.render(main)"));
check("Evaluate uses the shared customer renderer", hook.includes('route === "evaluate"') && hook.includes("evaluationAdapter.renderCustomer(main)"));
check("Saved Decisions / Card Intelligence uses the production opportunity bridge", hook.includes("FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities") && hook.includes('route === "opportunities" && renderOpportunityRoute(id)'));
check("Opportunity detail renderer validates exact requested ids", opportunities.includes("state.requestedId") && opportunities.includes("/api/v1/opportunities/${encoded}") && opportunities.includes("SAFE_ID"));
check("Opportunity bridge does not require staging diagnostics in production", opportunitiesBridge.includes("const stagingAdapter = window.FlipForgeStagingReadAdapter") && opportunitiesBridge.includes("const customerAdapter = window.FlipForgeCustomerOpportunities") && !opportunitiesBridge.includes("if (!stagingAdapter || !customerAdapter) return"));
check("Tracking route is owned by lifecycle adapter", lifecycle.includes('const ROUTES = new Set(["tracking", "portfolio", "alerts"])') && hook.includes("lifecycleAdapter.handles(route)"));
check("Portfolio has a dedicated customer adapter before generic lifecycle handling", hook.includes('route === "portfolio"') && hook.indexOf('route === "portfolio"') < hook.indexOf("lifecycleAdapter.handles(route)"));
check("Alerts has a server-owned lifecycle path", lifecycle.includes('"alerts"') && lifecycle.includes('"/api/v1/alerts"'));
check("PSA Advisor is owned by customer management", management.includes('const ROUTES = new Set(["psa-advisor", "evidence", "sell", "portfolio", "alerts"])') && hook.includes("managementAdapter.handles(route)"));
check("Evidence is owned by customer management", management.includes('"evidence"') && management.includes('"/api/v1/(opportunities|evidence|psa-advisor)') === false);
check("Exit Review is owned by customer management", management.includes('"sell"'));
check("Compare is routed to the dedicated customer adapter", hook.includes('route === "compare"') && hook.includes("compareAdapter.render(main"));
check("Forge Heat is routed to the dedicated customer adapter", hook.includes('route === "forge-heat"') && hook.includes("forgeHeatAdapter.render(main)"));
check("Market View is routed to the dedicated customer adapter", hook.includes('route === "market-view"') && hook.includes("marketViewAdapter.render(main)"));
check("Audit Export is routed through the customer export adapter", hook.includes("exportAdapter.handles(route)") && hook.includes("exportAdapter.render(main, id)"));
check("Account / Plan & Usage is routed to customer entitlements", hook.includes('route === "account"') && hook.includes("entitlementsAdapter.render(main)"));
check("Decision Intelligence production host cannot fall back to prototype rows", decision.includes("if (productionHost())") && decision.includes('state.source = "error"') && decision.includes('state.source = "prototype"'));
check("Decision Intelligence validates Smart Opportunity authority", decision.includes('meta.authority === "Smart Opportunity"'));
check("Decision Intelligence validates PSA authority", decision.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("Customer route hook has no transaction action", !/buy now|place bid|checkout|execute purchase/i.test(hook));

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
