import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const consistency = read("saas-prototype/decision-authority-consistency-v1.js");

const checks = [
  ["saved-decision explain controls are converted to native anchors", consistency.includes("function replaceWithEvidenceLink") && consistency.includes('document.createElement("a")')],
  ["main Show me why controls are rewritten", consistency.includes('main.querySelectorAll("[data-ff-show-why]")')],
  ["Guided Mode explain controls are rewritten", consistency.includes('document.getElementById("ff-guided-mode-root")') && consistency.includes('guide?.querySelectorAll("[data-guide-action]")')],
  ["all explain labels are covered", consistency.includes("Show me why") && consistency.includes("Show me what is missing") && consistency.includes("I understand this decision")],
  ["native links target exact saved Evidence route", consistency.includes('return `#/evidence/${encodeURIComponent(id)}`')],
  ["body observer repairs Guided Mode rerenders", consistency.includes("new MutationObserver(queue).observe(document.body")]
];

const failures = checks.filter(([, passed]) => !passed);
console.log("NativeEvidenceLinksValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const [name] of failures) console.error(`FAIL | ${name}`);
if (failures.length) process.exitCode = 1;
