import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const required = [
  "scripts/validate-full-customer-app.mjs",
  "scripts/audit-full-customer-route-ci.mjs",
  "scripts/audit-customer-auth-recovery-ci.mjs",
  "scripts/audit-customer-shell-parity-ci.mjs",
  ".github/workflows/full-customer-app-assurance.yml"
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing customer audit authority file: ${file}`);
}

const workflow = read(".github/workflows/full-customer-app-assurance.yml");
const recovery = read("scripts/audit-customer-auth-recovery-ci.mjs");

const routes = ["dashboard", "discover", "evaluate", "decision-intelligence", "opportunities", "tracking", "portfolio", "alerts", "forge-heat", "market-view", "account", "compare", "psa-advisor", "evidence", "export"];
for (const route of routes) {
  if (!recovery.includes(`"${route}"`)) throw new Error(`Customer audit route missing: ${route}`);
}

if (!workflow.includes("node scripts/audit-customer-auth-recovery-ci.mjs")) throw new Error("Full Customer App Assurance is not running auth recovery audit");
if (!workflow.includes("push:") || !workflow.includes("- main")) throw new Error("Full Customer App Assurance does not verify main after merge");

console.log(`Customer app audit standard validated for ${routes.length} governed routes.`);
