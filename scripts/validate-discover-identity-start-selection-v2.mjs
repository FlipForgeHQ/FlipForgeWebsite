import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const entry = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const verify = read("saas-prototype/identity-assist-verification-v1.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Discover exposes first-class start chooser", entry.includes("How do you want to start?")],
  ["002 Find exact card is a top-level choice", entry.includes("data-ff-discover-start-find") && entry.includes("Find exact card")],
  ["003 Search active listings is a top-level choice", entry.includes("data-ff-discover-start-search") && entry.includes("Search active listings")],
  ["004 exact-card choice delegates to identity assist", entry.includes("identifyButton.click()")],
  ["005 active-listing choice delegates to existing Discover submit", entry.includes("form.requestSubmit?.()")],
  ["006 buried identity action is named consistently", !entry.includes("Help me identify it") && entry.includes('identifyButton.textContent = "Find exact card"')],
  ["007 review rows gain an explicit verification action", verify.includes("data-ff-verify-review-match") && verify.includes("Select &amp; verify")],
  ["008 only visible card-number rows receive review selection", verify.includes("rowHasCardNumber(row)") && verify.includes("if (!rowHasCardNumber(row)) return")],
  ["009 review selection uses existing server-owned resolve route", verify.includes('RESOLVE_PATH = "/api/v1/card-intelligence/resolve"')],
  ["010 review selection sends public choice fingerprint", verify.includes("query: originalQuery, candidateName, candidateDetail")],
  ["011 verification request uses same-origin credentials", verify.includes('credentials: "same-origin"')],
  ["012 verification request disables cache", verify.includes('cache: "no-store"')],
  ["013 verification request rejects redirects", verify.includes('redirect: "error"')],
  ["014 response size remains bounded", verify.includes("MAX_RESPONSE_CHARACTERS")],
  ["015 server authority metadata is validated", verify.includes('meta?.authority === "Smart Opportunity"') && verify.includes('meta?.gradingAuthority === "Existing PSA intelligence"')],
  ["016 correlation id is validated", verify.includes("meta?.correlationId === requestCorrelationId")],
  ["017 provider identifiers remain excluded", verify.includes("data?.providerIdentifierExposed === false") && verify.includes("data?.rawProviderPayloadExposed === false")],
  ["018 selection cannot accept evidence or recalculate decision", verify.includes("data?.soldEvidenceAccepted === false") && verify.includes("data?.smartOpportunityRecalculated === false")],
  ["019 selection has zero transaction authority", verify.includes("data?.transactionAuthority === false")],
  ["020 exact canonical identity is mandatory", verify.includes("data.readyForEvaluation !== true") && verify.includes("cardIdentity")],
  ["021 canonical card number required before search", verify.includes("/#\\s*[A-Za-z0-9][A-Za-z0-9.-]*/.test(canonical)")],
  ["022 canonical identity replaces customer input before search", verify.includes("input.value = canonical")],
  ["023 marketplace search begins only after successful verification", verify.indexOf("input.value = canonical") < verify.indexOf("form.requestSubmit?.()")],
  ["024 failed verification stays in identity workflow", verify.includes('button.textContent = "Select & verify"') && verify.includes("setRowStatus(row, error?.message")],
  ["025 identity selection adds no persistent browser storage", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(verify)],
  ["026 start chooser adds no new recommendation authority", !/\b(?:BUY|WATCH|PASS)\b/.test(entry)]
].forEach(([name, condition]) => check(name, condition));

const failures = results.filter(result => !result.passed);
console.log("Discover identity start + selection validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
