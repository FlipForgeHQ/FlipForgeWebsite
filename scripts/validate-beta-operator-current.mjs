import fs from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./validate-beta-operator-workflow.mjs", import.meta.url);
const tempPath = new URL("./.validate-beta-operator-workflow.current.mjs", import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pinnedBlobsVersion = String(packageJson.dependencies?.["@netlify/blobs"] || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(pinnedBlobsVersion)) {
  throw new Error("@netlify/blobs must remain pinned to an exact version.");
}

const original = fs.readFileSync(sourcePath, "utf8");
const dependencyAssertion = 'packageJson.dependencies?.["@netlify/blobs"] === "10.7.9"';
const registrationAssertion = 'packageJson.scripts?.["validate:beta-operator"] === "node scripts/validate-beta-operator-workflow.mjs"';
const legacyTenantAssertion = 'operatorSource.includes("filter(role => !role.startsWith(TENANT_ROLE_PREFIX))") && coreSource.includes(\'ACTIVE_ROLE = "flipforge-active"\')';
const termsGatedTenantAssertion = 'operatorSource.includes("TERMS_PENDING_ROLE") && operatorSource.includes("roles.push(`${TENANT_ROLE_PREFIX}${tenantId}`)") && operatorSource.includes("roles.push(requiresTerms ? TERMS_PENDING_ROLE : ACTIVE_ROLE)") && coreSource.includes(\'ACTIVE_ROLE = "flipforge-active"\')';
if (!original.includes(dependencyAssertion) || !original.includes(registrationAssertion) || !original.includes(legacyTenantAssertion)) {
  throw new Error("Beta operator validator contract changed; review this compatibility runner.");
}
const current = original
  .replace(dependencyAssertion, `packageJson.dependencies?.["@netlify/blobs"] === "${pinnedBlobsVersion}"`)
  .replace(registrationAssertion, 'packageJson.scripts?.["validate:beta-operator"] === "node scripts/validate-beta-operator-current.mjs"')
  .replace(legacyTenantAssertion, termsGatedTenantAssertion);
fs.writeFileSync(tempPath, current, "utf8");
try {
  const result = spawnSync(process.execPath, [tempPath.pathname], { stdio: "inherit", cwd: process.cwd() });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempPath, { force: true });
}
