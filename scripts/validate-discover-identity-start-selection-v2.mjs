import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const entry = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const verify = read("saas-prototype/identity-assist-verification-v1.js");
const discovery = read("saas-prototype/customer-discovery.js");
const guide = read("saas-prototype/guided-mode-v1.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Discover promotes the live card-entry panel", entry.includes("function promoteSearchPanel(main)") && entry.includes('page?.querySelector(":scope > .customer-discovery-search")')],
  ["002 Find exact card remains a top-level form action", entry.includes('identifyButton.textContent = "Find exact card"') && entry.includes('form?.querySelector("[data-discovery-find-exact]")')],
  ["003 Search active listings remains a top-level form action", entry.includes('searchButton.textContent = "Search active listings"') && entry.includes("form?.querySelector('button[type=\"submit\"]')")],
  ["004 card entry is placed directly under the page heading", entry.includes('heading.insertAdjacentElement("afterend", search)')],
  ["005 Guided Mode education follows the card entry", entry.includes("const coach = page.querySelector") && entry.includes("for (const node of [coach, workflow, decisionKey, boundary])")],
  ["006 workflow education follows the card entry", entry.includes('page.querySelector(":scope > [data-ff-workflow-strip]")')],
  ["007 decision terminology cannot precede the card entry", entry.includes('page.querySelector(":scope > [data-ff-decision-key]")') && entry.includes("let anchor = search")],
  ["008 buried identity action is named consistently", !entry.includes("Help me identify it") && entry.includes('identifyButton.textContent = "Find exact card"')],
  ["009 review rows gain an explicit verification action", verify.includes("data-ff-verify-review-match") && verify.includes("Select &amp; verify")],
  ["010 only visible card-number rows receive review selection", verify.includes("rowHasCardNumber(row)") && verify.includes("if (!rowHasCardNumber(row)) return")],
  ["011 review selection uses existing server-owned resolve route", verify.includes('RESOLVE_PATH = "/api/v1/card-intelligence/resolve"')],
  ["012 review selection sends public choice fingerprint", verify.includes("query: originalQuery, candidateName, candidateDetail")],
  ["013 verification request uses same-origin credentials", verify.includes('credentials: "same-origin"')],
  ["014 verification request disables cache", verify.includes('cache: "no-store"')],
  ["015 verification request rejects redirects", verify.includes('redirect: "error"')],
  ["016 response size remains bounded", verify.includes("MAX_RESPONSE_CHARACTERS")],
  ["017 server authority metadata is validated", verify.includes('meta?.authority === "Smart Opportunity"') && verify.includes('meta?.gradingAuthority === "Existing PSA intelligence"')],
  ["018 correlation id is validated", verify.includes("meta?.correlationId === requestCorrelationId")],
  ["019 provider identifiers remain excluded", verify.includes("data?.providerIdentifierExposed === false") && verify.includes("data?.rawProviderPayloadExposed === false")],
  ["020 selection cannot accept evidence or recalculate decision", verify.includes("data?.soldEvidenceAccepted === false") && verify.includes("data?.smartOpportunityRecalculated === false")],
  ["021 selection has zero transaction authority", verify.includes("data?.transactionAuthority === false")],
  ["022 exact canonical identity is mandatory", verify.includes("data.readyForEvaluation !== true") && verify.includes("cardIdentity")],
  ["023 canonical card number required before search", verify.includes("/#\\s*[A-Za-z0-9][A-Za-z0-9.-]*/.test(canonical)")],
  ["024 canonical identity replaces customer input before search", verify.includes("input.value = canonical")],
  ["025 marketplace search begins only after successful verification", verify.indexOf("input.value = canonical") < verify.indexOf("form.requestSubmit?.()")],
  ["026 failed verification stays in identity workflow", verify.includes('button.textContent = "Select & verify"') && verify.includes("setRowStatus(row, error?.message")],
  ["027 identity selection adds no persistent browser storage", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(verify)],
  ["028 Discover presentation adds no new recommendation authority", !/\b(?:BUY|WATCH|PASS)\b/.test(entry)],
  ["029 only the primary selectable row is labeled exact match", verify.includes("const primarySelectableRow = selectableRows[0] || null") && verify.includes('useButton.textContent = isPrimary ? "Use exact match" : "Select & verify"')],
  ["030 alternate selectable rows use secondary styling", verify.includes('useButton.classList.toggle("button-primary", isPrimary)') && verify.includes('useButton.classList.toggle("button-secondary", !isPrimary)')],
  ["031 displayed composite is labeled Factor score", entry.includes('label.textContent = "Factor score"')],
  ["032 rank explanation says factor score is not sole sort key", entry.includes("Rank is not sorted by factor score alone")],
  ["033 lower complete all-in ask is explained before factor-score tie break", entry.includes("lower complete all-in ask") && entry.includes("factor score as a tie-breaker")],
  ["034 excluded identity-review evaluate button is removed", entry.includes('.customer-discovery-candidate-review [data-discovery-evaluate]') && entry.includes("button.replaceWith(status)")],
  ["035 excluded row shows non-actionable evaluation status", entry.includes("Not eligible for evaluation")],
  ["036 redundant pre-search chooser is removed", !entry.includes("How do you want to start?") && !entry.includes("data-ff-discover-start-find")],
  ["037 primary entry is reasserted after rerenders without self-observation", entry.includes("observer = new MutationObserver") && entry.includes("decorateWithoutSelfObservation") && entry.includes("promoteSearchPanel(main)")],
  ["038 identity helper uses an explicit cache-busting version", entry.includes('IDENTITY_HELPER_VERSION = "20260831-3"')],
  ["039 identity verification script is loaded with the cache-busting version", entry.includes('script.src = `identity-assist-verification-v1.js?v=${IDENTITY_HELPER_VERSION}`')],
  ["040 identity verification stylesheet is loaded with the cache-busting version", entry.includes('link.href = `identity-assist-verification-v1.css?v=${IDENTITY_HELPER_VERSION}`')],
  ["041 stale identity helper elements are replaced when the version differs", entry.includes("existingScript?.remove()") && entry.includes("existingLink?.remove()") && entry.includes("ffIdentityAssistVerificationVersion")],
  ["042 identity assist owns each asynchronous search by request serial", discovery.includes("requestSerial: 0") && discovery.includes("requestSerial !== state.identityAssist.requestSerial")],
  ["043 changed card input invalidates current identity-assist ownership", discovery.includes('identityInput?.addEventListener("input"') && discovery.includes("state.identityAssist.requestSerial += 1")],
  ["044 identity selection is bound to the query that rendered it", discovery.includes("const selectionOwnerQuery = normalizeIdentityQuery(state.identityAssist.query)") && discovery.includes("resolveIdentity(index, selectionOwnerQuery)")],
  ["045 stale selection fails closed against current assist draft and visible query", discovery.includes("ownedQuery !== currentQuery") && discovery.includes("ownedQuery !== draftQuery") && discovery.includes("ownedQuery !== visibleQuery")],
  ["046 Discover entry text rewrites are idempotent", entry.includes('labelText.textContent !== "Card"') && entry.includes('searchButton.textContent !== "Search active listings"') && entry.includes('identifyButton.textContent !== "Find exact card"')],
  ["047 Discover entry observer disconnects during owned writes", entry.includes("observer.disconnect()") && entry.includes("decorateWithoutSelfObservation") && entry.includes("observeMain()")],
  ["048 Guided Mode follows canonical search-first ordering", guide.includes('search.insertAdjacentElement("afterend", coach)') && !guide.includes('coach.insertAdjacentElement("afterend", search)')]
].forEach(([name, condition]) => check(name, condition));

const failures = results.filter(result => !result.passed);
console.log("Discover identity start + selection validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
