import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The customer-only Evaluate shell intentionally removes the redundant visible
// "Find exact card" action and the result-count control from the first-view UI.
// The underlying identity assist and legacy form controls remain mounted so deep
// compatibility is preserved. This adapter keeps the original destructive audit
// fixtures and assertions, but drives the same state transitions through the new
// visible primary action and sets the hidden legacy limit directly for its state-
// isolation regression check.

const sourcePath = path.resolve("scripts/audit-prebeta-customer-state-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-prebeta-customer-state-customer-shell.generated.mjs");
let source = await fs.readFile(sourcePath, "utf8");

const originalFindClicks = (source.match(/await findButton\(\)\.click\(\);/g) || []).length;
if (originalFindClicks < 4) {
  throw new Error(`Customer-state audit adapter expected at least 4 legacy Find exact card clicks, found ${originalFindClicks}.`);
}

source = source
  .replaceAll("await findButton().click();", "await searchButton().click();")
  .replace(
    'expect(await findButton().isEnabled(), "Find exact card did not re-arm after changing PSA 10 to PSA 9");',
    'expect(await searchButton().isEnabled(), "Primary Find this card action did not re-arm after changing PSA 10 to PSA 9");'
  )
  .replace(
    'await form().locator(\'select[name="limit"]\').selectOption("10");',
    'await form().locator(\'select[name="limit"]\').evaluate(select => { select.value = "10"; });'
  )
  .replace(
    'await form().locator(\'select[name="limit"]\').selectOption("25");',
    'await form().locator(\'select[name="limit"]\').evaluate(select => { select.value = "25"; });'
  );

if (source.includes("await findButton().click();")) {
  throw new Error("Customer-state audit adapter left a legacy visible Find exact card click unpatched.");
}
if (source.includes('select[name="limit"]\').selectOption')) {
  throw new Error("Customer-state audit adapter left a hidden result-limit selectOption action unpatched.");
}

await fs.writeFile(generatedPath, source, "utf8");
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await fs.unlink(generatedPath).catch(() => {});
}
