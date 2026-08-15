import fs from "node:fs";

const checks = [];
let failed = 0;

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function check(label, condition) {
  checks.push([label, Boolean(condition)]);
  if (!condition) failed += 1;
}

const html = read("saas-prototype/index.html");
const routes = read("saas-prototype/staging-route-hook.js");
const gateway = read("netlify/functions/flipforge-api.js");
const heat = read("saas-prototype/customer-forge-heat.js");
const css = read("saas-prototype/customer-forge-heat.css");

check("Forge Heat stylesheet mounted", html.includes('href="customer-forge-heat.css"'));
check("Forge Heat script mounted", html.includes('src="customer-forge-heat.js"'));
check("Forge Heat customer navigation mounted", html.includes('data-route="forge-heat"'));
check("Forge Heat navigation is marked Pro", html.includes("forge-nav-pro"));
check("Route hook loads Forge Heat adapter", routes.includes("FlipForgeCustomerForgeHeat"));
check("Route hook renders Forge Heat customer route", routes.includes('route === "forge-heat"'));
check("Customer gateway allowlists Forge Heat GET", gateway.includes('/^\\/api\\/v1\\/forge-heat$/'));
check("Browser requests server-owned Forge Heat route", heat.includes('/api/v1/forge-heat?limit=500'));
check("Browser requires Smart Opportunity authority", heat.includes('recommendationAuthority !== "Smart Opportunity"'));
check("Browser requires clientComputed false", heat.includes("clientComputed !== false"));
check("Browser requires transactionAuthority false", heat.includes("transactionAuthority !== false"));
check("V1 scope is saved evaluated universe", heat.includes('SAVED_EVALUATED_UNIVERSE'));
check("V1 explicitly denies market-wide coverage", heat.includes("Not market-wide yet"));
check("Highest Edge copy denies net profit or ROI", heat.includes("This is not net profit or ROI."));
check("Heating Up remains evidence-gated", heat.includes("will not manufacture momentum"));
check("No browser Heat formula exists", !heat.includes("0.45 *") && !heat.includes("edgeScore") && !heat.includes("evidenceScore("));
check("Pro visual treatment exists", css.includes(".forge-heat-pro-chip") && css.includes(".forge-heat-card"));

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}`);
}
console.log(`ForgeHeatProUiValidation PASSED: ${checks.length - failed}`);
console.log(`ForgeHeatProUiValidation FAILED: ${failed}`);
if (failed) process.exit(1);
