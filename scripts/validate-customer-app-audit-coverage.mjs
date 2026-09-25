import fs from "node:fs";

const matrix = fs.readFileSync("docs/CUSTOMER_APP_AUDIT_COVERAGE.md", "utf8");
const standard = fs.readFileSync("docs/CUSTOMER_APP_AUDIT_STANDARD.md", "utf8");
const audit = fs.readFileSync("scripts/audit-customer-auth-recovery-ci.mjs", "utf8");

const routePairs = [
  ["Home / Dashboard", "dashboard"],
  ["Discover", "discover"],
  ["Evaluate", "evaluate"],
  ["Decision Intelligence", "decision-intelligence"],
  ["Why This Decision (Decision Intelligence subview)", "decision-intelligence/why"],
  ["Saved Decisions", "opportunities"],
  ["Outcome Intelligence", "tracking"],
  ["Portfolio", "portfolio"],
  ["Alerts", "alerts"],
  ["Forge Heat", "forge-heat"],
  ["Market View", "market-view"],
  ["Account", "account"],
  ["Compare", "compare"],
  ["PSA Advisor", "psa-advisor"],
  ["Evidence Review", "evidence"],
  ["Audit Export", "export"]
];

for (const [label, route] of routePairs) {
  if (!matrix.includes(`| ${label} |`)) throw new Error(`Audit coverage matrix missing ${label}`);
  if (!audit.includes(`"${route}"`)) throw new Error(`Executable auth-recovery audit missing ${route}`);
}

for (const requirement of ["Anonymous 401", "Authenticated", "Desktop", "Mobile", "Blank-state guard", "Route return", "Authority guard"]) {
  if (!matrix.includes(requirement)) throw new Error(`Audit coverage dimension missing: ${requirement}`);
}

if (!standard.includes("A customer-facing capability is not considered ready merely because it renders")) {
  throw new Error("Customer audit standard lost readiness principle");
}

console.log(`Customer audit coverage matrix validated for ${routePairs.length} routes.`);
