import fs from "node:fs";

// Since Nov 4 2026 the private beta page (index.html) does not load the card cockpit (the beta does not offer it); the full
// customer app (customer.html) does, and the load-order checks below run there.
const index = fs.readFileSync("saas-prototype/customer.html", "utf8");
if (fs.readFileSync("saas-prototype/index.html", "utf8").includes("customer-card-cockpit.js")) throw new Error("the beta page must not load the card cockpit");
const cockpit = fs.readFileSync("saas-prototype/customer-card-cockpit.js", "utf8");
const heat = fs.readFileSync("saas-prototype/customer-forge-heat.js", "utf8");

const checks = [
  ["cockpit script mounted", index.includes('<script src="customer-card-cockpit.js"></script>')],
  ["cockpit loads server Forge Heat endpoint", cockpit.includes('fetch("/api/v1/forge-heat?limit=500"')],
  ["cockpit validates Smart Opportunity authority", cockpit.includes('meta.authority === "Smart Opportunity"')],
  ["cockpit validates existing PSA authority", cockpit.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["cockpit rejects Heat recommendation authority", cockpit.includes('forgeHeatRecommendationAuthority !== false')],
  ["cockpit rejects browser-computed Heat", cockpit.includes('clientComputed !== false')],
  ["cockpit rejects transaction authority", cockpit.includes('transactionAuthority !== false')],
  ["cockpit limits Heat scope to saved evaluated universe", cockpit.includes('data.scope.code !== "SAVED_EVALUATED_UNIVERSE"')],
  ["cockpit has explicit withheld state", cockpit.includes("Forge Heat withheld")],
  ["cockpit has explicit not-surfaced state", cockpit.includes("Not currently surfaced")],
  ["cockpit does not infer missing Heat", cockpit.includes("The browser does not infer a Heat score")],
  ["cockpit links to Forge Heat", cockpit.includes('href="#/forge-heat"')],
  ["Forge Heat page remains server-owned", heat.includes("SERVER") || heat.includes("server-owned") || heat.includes("clientComputed")]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}`);
  if (!ok) failed++;
}

if (failed) throw new Error(`Pro card cockpit validation failed: ${failed}`);
console.log(`Validated ${checks.length} Pro card cockpit contracts.`);