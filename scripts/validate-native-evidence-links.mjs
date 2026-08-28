import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const consistency = read("saas-prototype/decision-authority-consistency-v1.js");
const evidenceSplit = read("saas-prototype/evidence-authority-split-v1.js");
const appIndex = read("saas-prototype/index.html");
const managementCss = read("saas-prototype/customer-management.css");

const checks = [
  ["saved-decision explain controls are converted to native anchors", consistency.includes("function replaceWithEvidenceLink") && consistency.includes('document.createElement("a")')],
  ["main Show me why controls are rewritten", consistency.includes('main.querySelectorAll("[data-ff-show-why]")')],
  ["Guided Mode explain controls are rewritten", consistency.includes('document.getElementById("ff-guided-mode-root")') && consistency.includes('guide?.querySelectorAll("[data-guide-action]")')],
  ["native links target exact saved Evidence route", consistency.includes('return id ? `#/evidence/${encodeURIComponent(id)}` : ""')],
  ["authoritative decision is read only from the saved Card Intelligence hero", consistency.includes('main?.querySelector(".customer-intelligence-hero")') && consistency.includes('hero.querySelectorAll(".staging-status,[data-recommendation]")')],
  ["Guided Mode is synchronized to authoritative decision", consistency.includes("function syncGuidedDecision(decision)") && consistency.includes("panel.dataset.ffAuthoritativeDecision = decision")],
  ["Evidence page leads with why and trust", consistency.includes('h1.textContent = "Why FlipForge trusts this decision"') && consistency.includes("Evidence behind this decision")],
  ["Evidence proof explicitly contrasts trusted and excluded rows", consistency.includes("More data is not automatically better evidence") && consistency.includes("Trusted now") && consistency.includes("Excluded now")],
  ["Evidence funnel is derived only from server-returned metrics", consistency.includes("const possibleLinked = accepted + ineligible") && consistency.includes('metricValue(main, "Accepted exact sales")') && consistency.includes('metricValue(main, "Visible but ineligible")')],
  ["Evidence linked rows use current-authority wording", consistency.includes('headers[4].textContent = "Current authority"') && consistency.includes('"Current eligible"') && consistency.includes('"Currently ineligible"')],
  ["stored candidate confidence is not presented as current exact confidence", consistency.includes('headers[3].textContent = "Stored source confidence"') && consistency.includes("Stored source confidence is not current exact-comparable authority")],
  ["candidate pool and audit history use progressive disclosure", consistency.includes("function makeDisclosure") && consistency.includes("Review candidate pool") && consistency.includes("View full audit trail")],
  ["Evidence is Guided Mode Understand step", consistency.includes('location.textContent = "Evidence · Step 3"') && consistency.includes("See what FlipForge trusted—and what it refused to use.")],
  ["Evidence continues to exact Tracking record", consistency.includes('data-ff-evidence-understood') && consistency.includes('href="#/tracking/${encodeURIComponent(id)}"')],
  ["Tracking route has explicit ownership repair", consistency.includes("function ensureTrackingOwnership(main)") && consistency.includes('adapter.render(main, "tracking", id)')],
  ["locked tagline casing is normalized", consistency.includes('"Before you buy. Know why."') && consistency.includes('"Know Why."')],
  ["Evidence v2 has dedicated responsive visual hierarchy", managementCss.includes("Evidence Experience v2") && managementCss.includes(".ff-evidence-proof-hero") && managementCss.includes(".ff-evidence-funnel") && managementCss.includes(".ff-evidence-next-step")],
  ["Evidence proof and next-step layout collapse on smaller screens", managementCss.includes("@media (max-width: 760px)") && managementCss.includes(".ff-evidence-funnel") && managementCss.includes(".ff-evidence-next-step")],
  ["body observer repairs dynamic customer rerenders", consistency.includes("new MutationObserver(queue).observe(document.body")],
  ["Evidence authority split runtime is loaded after the consistency layer", appIndex.indexOf('decision-authority-consistency-v1.js') > -1 && appIndex.indexOf('evidence-authority-split-v1.js') > appIndex.indexOf('decision-authority-consistency-v1.js')],
  ["trusted table contains only server-authority-eligible rows", evidenceSplit.includes('linked.filter(item => item?.authorityEligible === true)') && evidenceSplit.includes('data-ff-trusted-evidence-table')],
  ["excluded table contains only server-authority-ineligible rows", evidenceSplit.includes('linked.filter(item => item?.authorityEligible !== true)') && evidenceSplit.includes('data-ff-excluded-evidence-table')],
  ["excluded rows explain server-returned rejection reason", evidenceSplit.includes('item.rejectionReason') && evidenceSplit.includes('What FlipForge excluded — and why')],
  ["Evidence split validates the server authority envelope", evidenceSplit.includes('payload?.meta?.authority !== "Smart Opportunity"') && evidenceSplit.includes('payload?.meta?.gradingAuthority !== "Existing PSA intelligence"') && evidenceSplit.includes('payload?.meta?.correlationId !== requestCorrelationId')],
  ["Evidence split fails closed on count disagreement", evidenceSplit.includes('trusted.length !== trustedCount') && evidenceSplit.includes('excluded.length !== excludedCount') && evidenceSplit.includes('ffEvidenceAuthoritySplit = "invalid"')]
];

const failures = checks.filter(([, passed]) => !passed);
console.log("EvidenceExperienceValidation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const [name] of failures) console.error(`FAIL | ${name}`);
if (failures.length) process.exitCode = 1;
