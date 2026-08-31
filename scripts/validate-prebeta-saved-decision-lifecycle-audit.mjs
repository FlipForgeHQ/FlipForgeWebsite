import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const auditPath = "scripts/audit-prebeta-saved-decision-lifecycle-ci.mjs";
const workflowPath = ".github/workflows/prebeta-saved-decision-lifecycle-audit.yml";
const docsPath = "docs/PREBETA_SAVED_DECISION_LIFECYCLE_AUDIT.md";
const packagePath = "package.json";

const audit = exists(auditPath) ? read(auditPath) : "";
const workflow = exists(workflowPath) ? read(workflowPath) : "";
const docs = exists(docsPath) ? read(docsPath) : "";
const packageJson = exists(packagePath) ? JSON.parse(read(packagePath)) : {};

const requiredScenarios = [
  "saved decision opens exact Card Intelligence record without cross-record substitution",
  "Card Intelligence to Tracking preserves the exact opportunity id",
  "tracking selector switches records without leaking prior lifecycle state",
  "incomplete OWNED transition fails closed and does not change server state",
  "valid OWNED save uses current version and appends exactly one history event",
  "double submit while lifecycle save is in flight creates one write",
  "stale lifecycle version conflict cannot overwrite newer server state",
  "navigation away during slow save cannot repaint stale Tracking over Card Intelligence",
  "revisiting Tracking reloads the latest persisted lifecycle state",
  "Decision Dossier reads the latest lifecycle snapshot and prepares a complete digest",
  "prepared export is discarded and rebuilt after lifecycle changes",
  "export record switch cannot mix source identities",
  "browser lifecycle and export traffic never supplies tenant identity or authority"
];

const checks = [
  ["saved-decision lifecycle browser audit exists", exists(auditPath)],
  ["saved-decision lifecycle audit documentation exists", exists(docsPath)],
  ["saved-decision lifecycle CI workflow exists", exists(workflowPath)],
  ["package exposes saved-decision lifecycle audit command", packageJson?.scripts?.["audit:prebeta-saved-decision-lifecycle"] === "node scripts/audit-prebeta-saved-decision-lifecycle-ci.mjs"],
  ["all locked lifecycle scenarios remain in the browser audit", requiredScenarios.every(name => audit.includes(name))],
  ["audit emits a machine-readable lifecycle report", audit.includes("qa-artifacts/prebeta-saved-decision-lifecycle") && audit.includes("saved-decision-lifecycle-audit.json")],
  ["audit attacks optimistic lifecycle version conflicts", audit.includes("LIFECYCLE_VERSION_CONFLICT") && audit.includes("expectedVersion")],
  ["audit attacks navigation during an in-flight save", audit.includes("slowNextLifecyclePut") && audit.includes("repaint stale Tracking over Card Intelligence")],
  ["audit verifies export re-reads governed sources", audit.includes("/api/v1/evidence/") && audit.includes("/api/v1/psa-advisor/") && audit.includes("/api/v1/lifecycle/")],
  ["audit inspects tenant/user header boundaries", audit.includes("x-flipforge-tenant-id") && audit.includes("x-flipforge-user-id")],
  ["workflow validates lifecycle and export contracts before browser attacks", workflow.includes("npm run validate:customer-lifecycle") && workflow.includes("npm run validate:customer-export")],
  ["workflow runs saved-decision lifecycle browser matrix", workflow.includes("npm run audit:prebeta-saved-decision-lifecycle")],
  ["workflow uploads saved-decision lifecycle artifact", workflow.includes("flipforge-prebeta-saved-decision-lifecycle-audit") && workflow.includes("retention-days: 30")],
  ["documentation makes S1 lifecycle-state failures release-blocking", docs.includes("S1 failures block merge/release") && docs.includes("navigation-race")],
  ["documentation preserves Smart Opportunity and zero transaction authority", docs.includes("Smart Opportunity remains the recommendation authority") && docs.includes("No lifecycle or export path gains transaction authority")]
];

let failures = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS: ${label}`);
  else { failures += 1; console.error(`FAIL: ${label}`); }
}

if (audit) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, auditPath)], { encoding: "utf8" });
  if (syntax.status === 0) console.log("PASS: saved-decision lifecycle audit source passes node --check");
  else { failures += 1; console.error(`FAIL: saved-decision lifecycle audit syntax assurance: ${(syntax.stderr || syntax.stdout || "unknown syntax error").trim()}`); }
}

if (failures) process.exit(1);
console.log(`Pre-beta saved-decision lifecycle audit assurance passed (${checks.length + 1}/${checks.length + 1}).`);
