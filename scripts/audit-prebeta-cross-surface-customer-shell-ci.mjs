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
// routes directly by SPA hash and reassert the target briefly if an earlier async
// route owner races the final transition. A deep-link reload is used only as a
// last-resort audit fallback; each scenario still verifies the final governed DOM.

const sourcePath = path.resolve("scripts/audit-prebeta-cross-surface-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-prebeta-cross-surface-customer-shell.generated.mjs");
const source = await fs.readFile(sourcePath, "utf8");

const replacement = `async function advancedNavLink(route) {
  return {
    async click() {
      const target = \`#/$\{route}\`;
      let lastError = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await page.evaluate(nextRoute => {
            window.location.hash = \`#/$\{nextRoute}\`;
          }, route);
        } catch (error) {
          lastError = error;
          const message = String(error?.message || error || "");
          if (!/execution context was destroyed|most likely because of a navigation/i.test(message)) {
            throw error;
          }
        }

        await page.waitForTimeout(90);
        if (page.url().includes(target)) {
          await page.waitForTimeout(90);
          if (page.url().includes(target)) return;
        }
      }

      // Customer-shell presentation guards can legitimately remove hidden routes
      // from in-app navigation. The destructive audit may still deep-link to those
      // governed owners so their state/authority boundaries remain testable.
      try {
        const appRoot = page.url().split("/#/")[0];
        await page.goto(appRoot + "/#/" + route, { waitUntil: "domcontentloaded", timeout: 12_000 });
        return;
      } catch (error) {
        throw lastError || error;
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
