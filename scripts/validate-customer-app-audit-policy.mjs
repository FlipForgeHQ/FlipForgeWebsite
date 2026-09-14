import fs from "node:fs";

const policy = fs.readFileSync("docs/CUSTOMER_APP_AUDIT_POLICY.md", "utf8");
const workflow = fs.readFileSync(".github/workflows/full-customer-app-assurance.yml", "utf8");

for (const clause of [
  "New customer route",
  "New protected action",
  "New API-backed surface",
  "New navigation or shell control",
  "New decision/evidence/outcome presentation",
  "New authentication or entitlement behavior",
  "the repair must include a regression audit"
]) {
  if (!policy.includes(clause)) throw new Error(`Customer audit policy clause missing: ${clause}`);
}

if (!workflow.includes("Full Customer App Assurance")) throw new Error("Customer audit policy is detached from the full customer workflow");
console.log("Customer app audit policy validated.");
