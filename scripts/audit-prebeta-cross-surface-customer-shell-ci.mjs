import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The customer-only beta shell intentionally removes advanced/internal routes from
// visible navigation. The destructive cross-surface audit still needs to exercise
// those governed route owners to prove stale state cannot leak between them.
//
// Keep the original audit scenarios/fixtures intact and only replace its helper
// that assumes every audited route is clickable in the visible sidebar. When a
// route is intentionally hidden, the audit navigates by SPA hash instead. This is
// equivalent to a saved/deep link and keeps route-authority coverage without
// re-exposing operator/advanced UI to customers.

const sourcePath = path.resolve("scripts/audit-prebeta-cross-surface-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-prebeta-cross-surface-customer-shell.generated.mjs");
const source = await fs.readFile(sourcePath, "utf8");

const replacement = `async function clickAdvancedRoute(route, ready) {
  const href = \`#/$\{route}\`;
  const directLink = page.locator(\`.primary-nav a[href="$\{href}"]\`).first();

  if (await directLink.isVisible().catch(() => false)) {
    await directLink.click();
  } else {
    await page.evaluate(nextRoute => {
      window.location.hash = \`#/$\{nextRoute}\`;
    }, route);
  }

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
