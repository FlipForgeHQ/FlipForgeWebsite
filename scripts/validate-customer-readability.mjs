import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("saas-prototype/index.html");
const css = read("saas-prototype/customer-readability-v1.css");

const readabilityLink = '<link rel="stylesheet" href="customer-readability-v1.css">';
const decisionLink = '<link rel="stylesheet" href="decision-intelligence-server-v1.css">';

const checks = [
  ["readability stylesheet is loaded", index.includes(readabilityLink)],
  ["readability stylesheet loads after accumulated customer styles", index.indexOf(readabilityLink) > index.indexOf(decisionLink)],
  ["body baseline is 16px", /body\s*\{[^}]*font-size:\s*16px;/s.test(css)],
  ["normal panel copy uses the customer medium scale", css.includes("#main-content .panel-body") && css.includes("font-size: var(--ff-type-md)")],
  ["page descriptions are near 16px", css.includes("#main-content .page-heading p") && css.includes("font-size: .98rem")],
  ["table cells are raised above legacy 11px", /td\s*\{[^}]*font-size:\s*\.875rem;/s.test(css)],
  ["table headers have a readable floor", /th\s*\{[^}]*font-size:\s*\.72rem;/s.test(css)],
  ["lifecycle field labels are at least 12px", css.includes(".customer-lifecycle-fields label") && css.includes("font-size: var(--ff-type-xs)")],
  ["lifecycle controls are enlarged", css.includes("min-height: 46px") && css.includes("font-size: .9rem")],
  ["lifecycle history is enlarged", css.includes(".customer-lifecycle-history span") && css.includes("font-size: .8rem")],
  ["buttons use a larger customer scale", css.includes(".button") && css.includes("font-size: .84rem")],
  ["Decision Intelligence microcopy is raised", css.includes(".ff-di-card > p") && css.includes("font-size: .84rem")],
  ["mobile keeps a 16px baseline", /@media \(max-width: 760px\)[\s\S]*body \{ font-size: 16px; \}/.test(css)]
];

const failures = checks.filter(([, passed]) => !passed);
console.log("CustomerReadabilityValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const [name] of failures) console.error(`FAIL | ${name}`);
if (failures.length) process.exitCode = 1;
