import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("scripts/customer-audit-manifest.json", "utf8"));
const recovery = fs.readFileSync("scripts/audit-customer-auth-recovery-ci.mjs", "utf8");

if (manifest.surface !== "full-customer-app") throw new Error("Customer audit manifest surface changed");
if (!Array.isArray(manifest.routes) || manifest.routes.length < 16) throw new Error("Customer audit manifest route coverage is incomplete");
for (const route of manifest.routes) {
  if (!recovery.includes(`"${route}"`)) throw new Error(`Executable customer auth audit missing manifest route: ${route}`);
}
for (const state of ["anonymous-401", "authenticated", "authorized-data", "empty-data", "unavailable-upstream"]) {
  if (!manifest.requiredStates.includes(state)) throw new Error(`Customer audit manifest state missing: ${state}`);
}
for (const assertion of ["visible-next-action", "nonblank-workspace", "route-preserving-auth-return", "authority-boundary", "no-synthetic-fallback"]) {
  if (!manifest.requiredAssertions.includes(assertion)) throw new Error(`Customer audit manifest assertion missing: ${assertion}`);
}
console.log(`Customer audit manifest validated: ${manifest.routes.length} routes.`);
