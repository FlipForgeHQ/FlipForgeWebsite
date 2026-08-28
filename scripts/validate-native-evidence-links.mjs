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
  ["native links target exact saved Evidence route", consistency.includes('return id ? `#/evidence/${encodeURIComponent(id)}` : ""')],
  ["authoritative decision is read only from the saved Card Intelligence hero", consistency.includes('main?.querySelector(".customer-intelligence-hero")') && consistency.includes('hero.querySelectorAll(".staging-status,[data-recommendation]")')],
  ["Guided Mode is synchronized to authoritative decision", consistency.includes("function syncGuidedDecision(decision)") && consistency.includes("panel.dataset.ffAuthoritativeDecision = decision") && consistency.includes('title.textContent = `Start here: ${decision}.`')],
  ["Guided Mode decision copy covers BUY WATCH VERIFY and PASS", consistency.includes('decision === "BUY"') && consistency.includes('decision === "WATCH"') && consistency.includes('decision === "PASS"') && consistency.includes("VERIFY means FlipForge")],
  ["Evidence route distinguishes current eligibility from historical ledger", consistency.includes("Current eligibility vs. historical ledger") && consistency.includes("currently satisfy FlipForge's exact-comparable authority rules") && consistency.includes("do not restore authority")],
  ["Evidence linked rows use current-authority wording", consistency.includes('headers[4].textContent = "Current authority"') && consistency.includes('"Current eligible"') && consistency.includes('"Currently ineligible"')],
  ["stored candidate confidence is not presented as current exact confidence", consistency.includes('headers[3].textContent = "Stored source confidence"') && consistency.includes("Stored source confidence is not current exact-comparable authority")],
  ["historically linked candidate state is explicit", consistency.includes('"Historically linked"')],
  ["Evidence is Guided Mode Understand step", consistency.includes('location.textContent = "Evidence · Step 3"') && consistency.includes("This is why FlipForge reached the decision.") && consistency.includes("I understand the evidence →")],
  ["Evidence Guided Mode continues to exact Tracking record", consistency.includes('href="#/tracking/${encodeURIComponent(id)}"')],
  ["body observer repairs dynamic customer rerenders", consistency.includes("new MutationObserver(queue).observe(document.body")]
];

const failures = checks.filter(([, passed]) => !passed);
console.log("NativeEvidenceLinksValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const [name] of failures) console.error(`FAIL | ${name}`);
if (failures.length) process.exitCode = 1;
