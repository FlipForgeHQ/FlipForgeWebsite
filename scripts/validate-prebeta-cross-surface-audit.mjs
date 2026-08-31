import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const auditPath = "scripts/audit-prebeta-cross-surface-ci.mjs";
const workflowPath = ".github/workflows/prebeta-cross-surface-audit.yml";
const docPath = "docs/PREBETA_CROSS_SURFACE_AUDIT.md";
const packageJson = read("package.json");
const betaGate = read("scripts/validate-saas-beta-complete-gate.mjs");
const audit = exists(auditPath) ? read(auditPath) : "";
const workflow = exists(workflowPath) ? read(workflowPath) : "";
const doc = exists(docPath) ? read(docPath) : "";

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

const syntax = exists(auditPath)
  ? spawnSync(process.execPath, ["--check", path.join(root, auditPath)], { encoding: "utf8" })
  : { status: 1 };

check("001 browser audit exists", exists(auditPath));
check("002 audit parses as JavaScript", syntax.status === 0);
check("003 workflow exists", exists(workflowPath));
check("004 locked audit document exists", exists(docPath));
check("005 package command wires audit", packageJson.includes('"audit:prebeta-cross-surface": "node scripts/audit-prebeta-cross-surface-ci.mjs"'));
check("006 beta complete statically requires audit", betaGate.includes("PREBETA_CROSS_SURFACE_AUDIT.md") && betaGate.includes("audit-prebeta-cross-surface-ci.mjs") && betaGate.includes("prebeta-cross-surface-audit.yml"));

const surfaces = ["alerts", "portfolio", "forge-heat", "market-view", "compare", "psa-advisor", "evidence", "sell"];
for (const surface of surfaces) {
  check(`surface ${surface} is attacked`, audit.includes(`\"${surface}\"`) || audit.includes(`\"${surface}/`));
  const documentedName = surface.replaceAll("-", " ");
  check(`surface ${surface} is documented`, doc.toLowerCase().includes(documentedName));
}

const scenarios = [
  "Alerts renders server-owned reminders without external delivery authority",
  "Portfolio renders only governed reference context and no invented holding",
  "Portfolio to Alerts transition cannot leave stale Portfolio ownership",
  "Forge Heat locked state cannot surface fabricated opportunities",
  "Forge Heat to Market View transition removes stale Heat UI",
  "Market View stays scoped to saved evaluated universe and never claims market-wide intelligence",
  "Market View revisit reloads fresh server state instead of cached summary",
  "Compare keeps two saved records independent and creates no winner",
  "Compare swap cannot mix or duplicate saved identities",
  "PSA Advisor reads saved guidance and does not recalculate or predict a grade",
  "Evidence Center stays read-only and exact-record scoped",
  "Evidence record switch cannot leak the prior card identity",
  "Exit Review uses saved context only and exposes no sell transaction action",
  "Malformed Market View authority fails closed instead of rendering invented intelligence",
  "Rapid cross-surface route churn settles on the final governed owner",
  "Cross-surface browser requests never supply tenant identity or recommendation transaction authority"
];
for (const scenario of scenarios) check(`scenario locked: ${scenario}`, audit.includes(`runScenario(\"${scenario}\"`));

check("031 audit uses production app path", audit.includes('http://127.0.0.1:4173/app'));
check("032 browser identity is mocked without tenant header", audit.includes("FlipForgeIdentity") && !audit.includes("X-FlipForge-Tenant-Id"));
check("033 authority envelopes require Smart Opportunity by default", audit.includes('authority = "Smart Opportunity"'));
check("034 malformed authority attack is explicit", audit.includes('badMarketAuthority ? "Browser Fake" : "Smart Opportunity"'));
check("035 Forge Heat locked fixture cannot fabricate cards", audit.includes("locked: true") && audit.includes("top5: []") && audit.includes("hiddenGems: []"));
check("036 Market View fixture is not market-wide", audit.includes('code: "SAVED_EVALUATED_UNIVERSE"') && audit.includes("marketWide: false") && audit.includes("continuousMarketScannerActive: false"));
check("037 Portfolio fixture forbids appraisal and transaction authority", audit.includes("appraisal: false") && audit.includes("transactionAuthority: false"));
check("038 PSA fixture is saved non-recalculated guidance", audit.includes("recalculated: false"));
check("039 report is machine-readable JSON", audit.includes("cross-surface-audit.json") && audit.includes("JSON.stringify(report"));
check("040 report enumerates all eight surfaces", audit.includes('surfaces: ["alerts", "portfolio", "forge-heat", "market-view", "compare", "psa-advisor", "evidence", "sell"]'));
check("041 workflow builds production app assets", workflow.includes("npm run build:identity"));
check("042 workflow validates route authority and surface contracts", workflow.includes("validate:production-route-authority") && workflow.includes("validate:customer-management") && workflow.includes("validate:customer-portfolio") && workflow.includes("validate:customer-compare") && workflow.includes("validate:market-view"));
check("043 workflow installs Playwright", workflow.includes("playwright@1.55.0") && workflow.includes("playwright install --with-deps chromium"));
check("044 workflow runs destructive browser matrix", workflow.includes("npm run audit:prebeta-cross-surface"));
check("045 workflow uploads audit artifact", workflow.includes("flipforge-prebeta-cross-surface-audit") && workflow.includes("retention-days: 30"));
check("046 docs lock S1 merge blocking", doc.includes("S1") && doc.includes("blocks merge"));
check("047 docs require future real bugs to become regression tests", doc.includes("must be added to this matrix before the defect is considered closed"));
check("048 docs preserve Smart Opportunity authority", doc.includes("Smart Opportunity remains the sole recommendation authority"));
check("049 docs preserve PSA authority", doc.includes("Existing PSA intelligence remains the grading-guidance authority"));
check("050 docs preserve no transaction authority", doc.includes("no transaction authority"));

const failures = results.filter(result => !result.passed);
console.log("FlipForge Pre-Beta Cross-Surface Audit Assurance");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
