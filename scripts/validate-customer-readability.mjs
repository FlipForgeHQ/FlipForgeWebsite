import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("saas-prototype/index.html");
const css = read("saas-prototype/customer-readability-v1.css");
const typographyAudit = read("scripts/audit-customer-typography-ci.mjs");
const visualWorkflow = read(".github/workflows/saas-full-site-visual-qa.yml");

const readabilityLink = '<link rel="stylesheet" href="customer-readability-v1.css">';
const decisionLink = '<link rel="stylesheet" href="decision-intelligence-server-v1.css">';

function pxValue(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return unit === "rem" ? number * 16 : number;
}

const undersizedReadabilityDeclarations = [...css.matchAll(/font-size:\s*([0-9]*\.?[0-9]+)(px|rem)\b/g)]
  .map(match => ({ literal: match[0], px: pxValue(match[1], match[2]) }))
  .filter(item => item.px !== null && item.px < 14 - 0.01);

const requiredRoutes = [
  "dashboard", "beta-start", "market-view", "discover", "forge-heat", "evaluate",
  "opportunities", "tracking", "alerts", "portfolio", "decision-intelligence", "compare",
  "psa-advisor", "evidence", "sell", "export", "account"
];

const checks = [
  ["readability stylesheet is loaded", index.includes(readabilityLink)],
  ["readability stylesheet loads after accumulated customer styles", index.indexOf(readabilityLink) > index.indexOf(decisionLink)],
  ["body baseline is 16px", /body\s*\{[^}]*font-size:\s*16px;/s.test(css)],
  ["customer text floor token is 14px", css.includes("--ff-type-xs: .875rem")],
  ["supporting copy token is 15px", css.includes("--ff-type-sm: .9375rem")],
  ["normal reading token is 16px", css.includes("--ff-type-md: 1rem")],
  ["readability layer contains no explicit font size below 14px", undersizedReadabilityDeclarations.length === 0],
  ["navigation is at least normal reading size", css.includes(".primary-nav a") && css.includes("font-size: var(--ff-type-md) !important")],
  ["page descriptions are above the body baseline", css.includes("font-size: 1.0625rem !important")],
  ["table cells use at least the 15px supporting scale", /td,[\s\S]*#main-content td,[\s\S]*font-size:\s*var\(--ff-type-sm\) !important;/s.test(css)],
  ["table headers use the 14px floor", /th,[\s\S]*#main-content th[\s\S]*font-size:\s*var\(--ff-type-xs\) !important;/s.test(css)],
  ["lifecycle labels use the 14px floor", css.includes(".customer-lifecycle-fields label") && css.includes(".customer-lifecycle-history span")],
  ["lifecycle controls use 16px text", css.includes(".customer-lifecycle-fields input") && css.includes("font-size: var(--ff-type-md) !important")],
  ["Decision Intelligence microcopy uses the 14px floor", css.includes(".ff-di-mini-label") && css.includes(".ff-di-decision")],
  ["Forge Heat compact labels use the 14px floor", css.includes(".forge-heat-summary span") && css.includes(".forge-heat-tabs button")],
  ["Guided Mode body copy is at least 15px", css.includes(".ff-guide-body > p") && css.includes("font-size: var(--ff-type-sm) !important")],
  ["Guided Mode footer and progress copy use the 14px floor", css.includes(".ff-guide-progress-top") && css.includes(".ff-guide-footer button")],
  ["muted customer text uses brighter tokens", css.includes("--ff-text-muted: #cbd3dd") && css.includes("--ff-guide-muted: var(--ff-text-muted)")],
  ["mobile keeps a 16px root/body baseline", /@media \(max-width: 760px\)[\s\S]*body\s*\{[\s\S]*font-size:\s*16px;/s.test(css)],
  ["computed typography audit enforces a 14px minimum", typographyAudit.includes("const minimumTextPx = 14")],
  ["typography audit expands collapsed sections", typographyAudit.includes('document.querySelectorAll("details").forEach')],
  ["typography audit runs desktop tablet and mobile", typographyAudit.includes('["desktop", 1536, 1000]') && typographyAudit.includes('["tablet", 900, 1100]') && typographyAudit.includes('["mobile", 390, 844]')],
  ["typography audit covers every major customer route", requiredRoutes.every(route => typographyAudit.includes(`"${route}"`))],
  ["full-site visual workflow gates the computed typography audit", visualWorkflow.includes("node scripts/audit-customer-typography-ci.mjs")]
];

const failures = checks.filter(([, passed]) => !passed);
console.log("CustomerReadabilityValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
if (undersizedReadabilityDeclarations.length) {
  console.error("Undersized declarations in customer-readability-v1.css:");
  for (const item of undersizedReadabilityDeclarations) console.error(`- ${item.literal} (${item.px}px)`);
}
for (const [name] of failures) console.error(`FAIL | ${name}`);
if (failures.length) process.exitCode = 1;
