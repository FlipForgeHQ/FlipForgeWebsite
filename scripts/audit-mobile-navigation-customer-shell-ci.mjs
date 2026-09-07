import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The customer-only shell intentionally exposes exactly four primary drawer
// destinations. The full route registry remains mounted for deep-link and
// cross-surface authority tests, but hidden/internal routes are not customer tap
// targets. Reuse the existing mobile-navigation audit mechanics and fixtures while
// narrowing only its visible-drawer route matrix to the actual customer surface.

const sourcePath = path.resolve("scripts/audit-mobile-navigation-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-mobile-navigation-customer-shell.generated.mjs");
let source = await fs.readFile(sourcePath, "utf8");

const routeBlock = /const routes = \[[\s\S]*?\];/;
if (!routeBlock.test(source)) {
  throw new Error("Mobile navigation customer-shell adapter could not locate the route matrix.");
}

source = source
  .replace(routeBlock, `const routes = [\n  "dashboard",\n  "discover",\n  "opportunities",\n  "tracking"\n];`)
  .replace('dashboard: /^Dashboard$/i,', 'dashboard: /^Before you buy, know why\\.$/i,')
  .replace('discover: /^Discover$/i,', 'discover: /^One card\\. One decision\\. Know why\\.$/i,')
  .replace('opportunities: /^Opportunities$/i,', 'opportunities: /^Saved Decisions$/i,');

if (!source.includes('const routes = [\n  "dashboard",\n  "discover",\n  "opportunities",\n  "tracking"\n];')) {
  throw new Error("Mobile navigation customer-shell adapter did not lock the four visible customer routes.");
}

await fs.writeFile(generatedPath, source, "utf8");
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await fs.unlink(generatedPath).catch(() => {});
}
