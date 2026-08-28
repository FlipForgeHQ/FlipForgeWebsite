import fs from "node:fs";
import assert from "node:assert/strict";
import { createDeployManifest, validateDeployManifest } from "./lib/deploy-manifest.mjs";

const production = createDeployManifest({
  CONTEXT: "production",
  BRANCH: "main",
  COMMIT_REF: "d44372dac3d025565e763e925279dd550ad5a99f"
});
validateDeployManifest(production);
assert.equal(production.production, true);
assert.equal(production.productionDiagnosticsSeparated, true);
assert.equal(production.appBoundary, "PRODUCTION_SERVER_OWNED_FAIL_CLOSED");
assert.equal(production.browserRecommendationAuthority, false);
assert.equal(production.transactionAuthority, false);

const preview = createDeployManifest({
  CONTEXT: "deploy-preview",
  BRANCH: "audit/example",
  COMMIT_REF: "ad89335eee291349cf00ac47e0812a3030cc7fd0"
});
validateDeployManifest(preview);
assert.equal(preview.production, false);
assert.equal(preview.productionDiagnosticsSeparated, false);
assert.equal(preview.appBoundary, "NON_PRODUCTION_REVIEW");

const local = createDeployManifest({});
validateDeployManifest(local);
assert.equal(local.context, "local");
assert.equal(local.commitRef, "local");

const forbiddenSourcePatterns = [
  /Object\.assign\([^\n]*process\.env/,
  /\.\.\.process\.env/,
  /JSON\.stringify\(\s*process\.env/i,
  /API[_-]?KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /COOKIE/i,
  /AUTHORIZATION/i
];
const contractSource = fs.readFileSync("scripts/lib/deploy-manifest.mjs", "utf8");
const writerSource = fs.readFileSync("scripts/write-deploy-manifest.mjs", "utf8");
for (const pattern of forbiddenSourcePatterns) {
  assert.equal(pattern.test(contractSource), false, `forbidden deploy-manifest source pattern: ${pattern}`);
  assert.equal(pattern.test(writerSource), false, `forbidden deploy writer source pattern: ${pattern}`);
}
assert.equal(
  writerSource.includes("createDeployManifest(process.env)"),
  true,
  "writer must pass the build environment only through the strict manifest allowlist helper"
);

if (fs.existsSync("deploy-meta.json")) {
  const actual = JSON.parse(fs.readFileSync("deploy-meta.json", "utf8"));
  validateDeployManifest(actual);
}

console.log("Deployment manifest validation passed: safe fields, production authority boundary, preview isolation, and no raw environment serialization.");
