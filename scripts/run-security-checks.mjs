// Runs every security check in scripts/security-checks/ (one Node process each, from the repository root) and
// fails the build if any of them fails.
//
// Security pull requests add their check as a new file in that folder instead of editing the single-line build
// command in netlify.toml, so several of them can be merged one at a time, in any order, without conflicting.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, "scripts", "security-checks");
const checks = fs.existsSync(folder)
  ? fs.readdirSync(folder).filter(name => name.endsWith(".mjs")).sort()
  : [];

const failed = [];
for (const name of checks) {
  console.log(`\n[security-check] ${name}`);
  const result = spawnSync(process.execPath, [path.join(folder, name)], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) failed.push(`${name} (exit ${result.status ?? result.signal})`);
}

console.log(`\nSecurityChecks: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of failed) console.error(`FAIL | ${item}`);
if (failed.length) process.exitCode = 1;
