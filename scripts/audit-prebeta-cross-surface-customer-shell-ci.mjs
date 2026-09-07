import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The customer-only beta shell intentionally removes advanced/internal routes from
// visible navigation. The destructive cross-surface audit still needs to exercise
// those governed route owners to prove stale state cannot leak between them.
//
// Keep the original audit scenarios/fixtures intact and replace the helper that
// assumes audited routes remain visibly clickable in the sidebar. The customer
// shell can hide a link between a visibility check and Playwright's click action,
// so the audit must not depend on transient presentation state. Navigate governed
// routes directly by SPA hash and let each scenario verify final route ownership.

const sourcePath = path.resolve("scripts/audit-prebeta-cross-surface-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-prebeta-cross-surface-customer-shell.generated.mjs");
const source = await fs.readFile(sourcePath, "utf8");

const replacement = `async function advancedNavLink(route) {
  return {
    async click() {
      try {
        await page.evaluate(nextRoute => {
          window.location.hash = \`#/$\{nextRoute}\`;
        }, route);
      } catch (error) {
        const message = String(error?.message || error || "");
        if (!/execution context was destroyed|most likely because of a navigation/i.test(message)) {
          throw error;
        }
        // A governed SPA transition can replace the execution context immediately
        // after the hash assignment. The caller verifies the resulting URL, so
        // this specific race is safe to treat as an initiated navigation.
      }
    }
  };
}

async function clickAdvancedRoute(route, ready) {
  const link = await advancedNavLink(route);
  await link.click();
  await poll(() => page.url().includes(\`#/$\{route}\`), \`Governed route transition did not reach $\{route}\`);
  if (ready) await ready();
}`;

const pattern = /async function advancedNavLink\(route\) \{[\s\S]*?async function waitAlertsReady\(\) \{/;
const patched = source.replace(pattern, `${replacement}\n\nasync function waitAlertsReady() {`);

if (patched === source) {
  throw new Error("Cross-surface audit adapter could not find the legacy visible-navigation helper.");
}

await fs.writeFile(generatedPath, patched, "utf8");
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await fs.unlink(generatedPath).catch(() => {});
}
