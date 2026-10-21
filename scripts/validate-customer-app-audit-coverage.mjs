import fs from "node:fs";

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
  if (!audit.includes(`"${route}"`)) throw new Error(`Executable auth-recovery audit missing ${route}`);
}

// The coverage matrix and audit standard documents now live in the private repository (docs/website-internal/);
// the executable audit coverage above is what this repository enforces.

console.log(`Customer audit route coverage validated for ${routePairs.length} routes.`);
