import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const auditPath = "scripts/audit-prebeta-customer-state-ci.mjs";
const workflowPath = ".github/workflows/prebeta-customer-state-audit.yml";
const docsPath = "docs/PREBETA_CUSTOMER_STATE_AUDIT.md";
const packagePath = "package.json";

const audit = exists(auditPath) ? read(auditPath) : "";
const workflow = exists(workflowPath) ? read(workflowPath) : "";
const docs = exists(docsPath) ? read(docsPath) : "";
const packageJson = exists(packagePath) ? JSON.parse(read(packagePath)) : {};

const requiredScenarios = [
  "baseline imperfect identity resolves before marketplace search",
  "PSA 10 to PSA 9 re-arms without + New card",
  "player change replaces previous card state",
  "Refresh results repeats the completed search exactly",
  "no-results state does not trap the next search",
  "removing a grade does not inherit the old grade",
  "changing identity while assist is open invalidates the old selection",
  "transient provider failure can be corrected and retried",
  "explicit evaluation handoff does not poison Discover on return",
  "double submit collapses to one in-flight search",
  "target max buy and result limit do not leak between searches",
  "card-number change replaces the previous identity",
  "browser requests never supply tenant identity or transaction authority"
];

const checks = [
  ["destructive browser audit exists", exists(auditPath)],
  ["audit documentation exists", exists(docsPath)],
  ["dedicated CI workflow exists", exists(workflowPath)],
  ["package exposes audit command", packageJson?.scripts?.["audit:prebeta-customer-state"] === "node scripts/audit-prebeta-customer-state-ci.mjs"],
  ["all locked destructive scenarios remain in the browser audit", requiredScenarios.every(name => audit.includes(name))],
  ["audit emits a machine-readable report", audit.includes("qa-artifacts/prebeta-customer-state") && audit.includes("customer-state-audit.json")],
  ["audit inspects tenant/user header boundaries", audit.includes("x-flipforge-tenant-id") && audit.includes("x-flipforge-user-id")],
  ["audit checks explicit evaluation handoff", audit.includes('/api/v1/evaluations') && audit.includes("qa-opportunity-1")],
  ["workflow runs deterministic Discover validation first", workflow.includes("npm run validate:customer-discovery")],
  ["workflow runs destructive browser matrix", workflow.includes("npm run audit:prebeta-customer-state")],
  ["workflow uploads the audit artifact", workflow.includes("flipforge-prebeta-customer-state-audit") && workflow.includes("retention-days: 30")],
  ["documentation defines blocking severity", docs.includes("Any S1 failure blocks merge/release") && docs.includes("Any reproducible S2 workflow failure blocks beta expansion")],
  ["documentation requires regression capture for real bugs", docs.includes("add the exact reproduction sequence to this matrix before closing the defect")]
];

let failures = 0;
for (const [label, passed] of checks) {
  if (passed) {
    console.log(`PASS: ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${label}`);
  }
}

if (audit) {
  try {
    new Function(audit.replace(/^import .*$/gm, ""));
    console.log("PASS: destructive audit source parses after import stripping");
  } catch (error) {
    failures += 1;
    console.error(`FAIL: destructive audit syntax assurance: ${error.message}`);
  }
}

if (failures) process.exit(1);
console.log(`Pre-beta customer-state audit assurance passed (${checks.length + 1}/${checks.length + 1}).`);
