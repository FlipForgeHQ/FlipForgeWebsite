import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The authenticated customer shell now owns /#/dashboard as Home. The legacy
// commercial dashboard remains a valid fallback/deep implementation detail, but
// the full-site visual audit must validate the customer Home when that surface is
// rendered instead of requiring the old commercial-dashboard marker.
const sourcePath = path.resolve("scripts/audit-saas-layout-ci.mjs");
const generatedPath = path.resolve("scripts/.audit-saas-layout-customer-shell.generated.mjs");
let source = await fs.readFile(sourcePath, "utf8");

const waitNeedle = 'await page.waitForSelector("[data-commercial-dashboard-v2]", { timeout: 5000 });';
if (!source.includes(waitNeedle)) {
  throw new Error("Customer-shell layout adapter could not locate the dashboard settle assertion.");
}
source = source.replace(
  waitNeedle,
  `await page.waitForFunction(() => {
        const home = document.querySelector("[data-customer-home-v1]");
        if (home) {
          return String(home.querySelector("h1")?.textContent || "").trim() === "Before you buy, know why.";
        }
        return Boolean(document.querySelector("[data-commercial-dashboard-v2]"));
      }, { timeout: 5000 });`
);

const semanticsNeedle = `async function dashboardSemantics(page) {\n  return page.evaluate(() => {\n    const failures = [];`;
if (!source.includes(semanticsNeedle)) {
  throw new Error("Customer-shell layout adapter could not locate dashboard semantics.");
}
source = source.replace(
  semanticsNeedle,
  `async function dashboardSemantics(page) {\n  return page.evaluate(() => {\n    const failures = [];\n    const customerHome = document.querySelector("[data-customer-home-v1]");\n    if (customerHome) {\n      const heading = String(customerHome.querySelector("h1")?.textContent || "").trim();\n      if (heading !== "Before you buy, know why.") failures.push({ type: "customer-home-heading", detail: \`Customer Home heading was \${heading || "(empty)"}.\` });\n      const actions = [...document.querySelectorAll("#main-content [data-ff-customer-home-actions] a")];\n      const hrefs = actions.map(link => link.getAttribute("href"));\n      const expected = ["#/discover", "#/opportunities", "#/tracking"];\n      if (actions.length !== 3) failures.push({ type: "customer-home-action-count", detail: \`Customer Home exposed \${actions.length} guided actions, expected 3.\` });\n      expected.forEach(href => { if (!hrefs.includes(href)) failures.push({ type: "customer-home-action-missing", detail: \`Customer Home is missing \${href}.\` }); });\n      if ([...customerHome.querySelectorAll("h1")].some(node => String(node.textContent || "").trim() === "Dashboard")) failures.push({ type: "legacy-dashboard-heading-visible", detail: "Customer Home still exposes the legacy Dashboard heading." });\n      return failures;\n    }`
);

await fs.writeFile(generatedPath, source, "utf8");
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await fs.unlink(generatedPath).catch(() => {});
}
