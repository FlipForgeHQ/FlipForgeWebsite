import fs from "node:fs";

// The customer audit policy document now lives in the private repository (docs/website-internal/); this check keeps
// the part that lives here: the policy's enforcement workflow.
const workflow = fs.readFileSync(".github/workflows/full-customer-app-assurance.yml", "utf8");

if (!workflow.includes("Full Customer App Assurance")) throw new Error("Customer audit policy is detached from the full customer workflow");
console.log("Customer app audit policy validated.");
