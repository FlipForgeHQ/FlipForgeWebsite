import fs from "node:fs";

const html = fs.readFileSync("saas-prototype/index.html", "utf8");
const navMatch = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/);
if (!navMatch) throw new Error("Primary customer navigation is missing.");
const nav = navMatch[0];

const coreRoutes = ["dashboard", "discover", "forge-heat", "evaluate", "opportunities", "tracking", "portfolio", "alerts", "beta-start"];
const drillDownRoutes = ["compare", "psa-advisor", "evidence", "sell", "export"];
let failed = 0;

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} | ${label}`);
  if (!condition) failed++;
}

for (const route of coreRoutes) check(`core route remains in primary navigation: ${route}`, nav.includes(`data-route="${route}"`));
for (const route of drillDownRoutes) check(`drill-down route removed from primary navigation: ${route}`, !nav.includes(`data-route="${route}"`));

check("Forge Heat retains Pro treatment", nav.includes('data-route="forge-heat"') && nav.includes("forge-nav-pro"));
check("Discover precedes Forge Heat", nav.indexOf('data-route="discover"') < nav.indexOf('data-route="forge-heat"'));
check("Forge Heat precedes Evaluate", nav.indexOf('data-route="forge-heat"') < nav.indexOf('data-route="evaluate"'));
check("Compare capability remains mounted as drill-down", html.includes('src="customer-compare.js"'));
check("Evidence/PSA drill-down remains reachable through customer intelligence scripts", html.includes('src="customer-explainability.js"') && html.includes('src="customer-opportunities-bridge.js"'));
check("Audit export capability remains mounted", html.includes('src="customer-export.js"'));
check("Primary nav describes core workflow", nav.includes('aria-label="Core FlipForge workflow"'));

if (failed) throw new Error(`Consumer Pro navigation validation failed: ${failed}`);
console.log("Consumer Pro navigation is focused while expert drill-down capabilities remain mounted.");