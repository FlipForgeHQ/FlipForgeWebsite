import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Customer Home now intentionally owns /#/dashboard on production, preview, and
// local customer-app mounts. Keep the original commercial-dashboard validator as
// the authority/boundary test, but adapt only its presentation-era assertions so
// it validates the simplified Home rather than requiring the legacy Dashboard UI.
const sourcePath = path.resolve("scripts/validate-saas-customer-dashboard.mjs");
const generatedPath = path.resolve("scripts/.validate-saas-customer-dashboard-customer-shell.generated.mjs");
let source = await fs.readFile(sourcePath, "utf8");

const replacements = [
  [
    'files.packageJson.scripts?.["validate:customer-dashboard"] === "node scripts/validate-saas-customer-dashboard.mjs"',
    'files.packageJson.scripts?.["validate:customer-dashboard"] === "node scripts/validate-saas-customer-dashboard-customer-shell.mjs"'
  ],
  [
    'if (selector === "[data-production-dashboard-guard]") return this.innerHTML.includes("data-production-dashboard-guard") ? {} : null;\n      return null;',
    'if (selector === "[data-production-dashboard-guard]") return this.innerHTML.includes("data-production-dashboard-guard") ? {} : null;\n      if (selector === "[data-customer-home-v1]") return this.innerHTML.includes("data-customer-home-v1") ? {} : null;\n      return null;'
  ],
  [
    'check("041 production Dashboard starts behind authoritative guard", guarded.main.innerHTML.includes("data-production-dashboard-guard") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));',
    'check("041 production Dashboard resolves to simplified customer Home", guarded.main.innerHTML.includes("data-customer-home-v1") && guarded.main.innerHTML.includes("Before you buy, know why.") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));'
  ],
  [
    'check("042 production guard removes a later legacy prototype overwrite", guarded.main.innerHTML.includes("data-production-dashboard-guard") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));',
    'check("042 customer Home removes a later legacy prototype overwrite", guarded.main.innerHTML.includes("data-customer-home-v1") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));'
  ],
  [
    'check("043 production guard preserves authoritative commercial Dashboard", guarded.main.innerHTML.includes("AUTHORITATIVE_SENTINEL") && !guarded.main.innerHTML.includes("data-production-dashboard-guard"));',
    'check("043 customer Home presentation replaces the advanced commercial Dashboard", guarded.main.innerHTML.includes("data-customer-home-v1") && !guarded.main.innerHTML.includes("AUTHORITATIVE_SENTINEL") && !guarded.main.innerHTML.includes("data-production-dashboard-guard"));'
  ],
  [
    'check("044 www production host is guarded", wwwGuarded.main.innerHTML.includes("data-production-dashboard-guard") && !wwwGuarded.main.innerHTML.includes("WWW_PROTOTYPE_SENTINEL"));',
    'check("044 www production host receives simplified customer Home", wwwGuarded.main.innerHTML.includes("data-customer-home-v1") && !wwwGuarded.main.innerHTML.includes("WWW_PROTOTYPE_SENTINEL"));'
  ],
  [
    'check("045 deploy preview keeps explicit prototype behavior", previewGuarded.main.innerHTML === "PREVIEW_SENTINEL");',
    'check("045 deploy preview customer app receives simplified Home", previewGuarded.main.innerHTML.includes("data-customer-home-v1") && !previewGuarded.main.innerHTML.includes("PREVIEW_SENTINEL"));'
  ],
  [
    'check("046 localhost keeps explicit prototype behavior", localGuarded.main.innerHTML === "LOCAL_SENTINEL");',
    'check("046 localhost customer app receives simplified Home", localGuarded.main.innerHTML.includes("data-customer-home-v1") && !localGuarded.main.innerHTML.includes("LOCAL_SENTINEL"));'
  ]
];

for (const [needle, replacement] of replacements) {
  if (!source.includes(needle)) {
    throw new Error(`Customer Dashboard adapter could not locate expected validator fragment: ${needle.slice(0, 96)}`);
  }
  source = source.replace(needle, replacement);
}

await fs.writeFile(generatedPath, source, "utf8");
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await fs.unlink(generatedPath).catch(() => {});
}
