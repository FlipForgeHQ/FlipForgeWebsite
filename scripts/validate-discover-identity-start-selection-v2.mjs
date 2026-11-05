import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
// Discover's reading order is rendered by its owner; the emphasis layer that rearranged it was removed (Nov 3 2026).
const entryRetired = !fs.existsSync(path.join(root, "saas-prototype/discover-card-entry-emphasis-v1.js"));
// The identity check's row labels, "Select & verify" and variant folding are rendered by the Discover owner since
// Nov 3 2026 (identity-assist-verification-v1.js, which re-decorated the panel after every render, was removed).
const discovery = read("saas-prototype/customer-discovery.js");
const verify = discovery.slice(discovery.indexOf("const COLLAPSED_REVIEW_COUNT = 4;"), discovery.indexOf("  function providerPanel() {"));
const guide = read("saas-prototype/guided-mode-v1.js");
const markup = discovery.slice(discovery.indexOf("function renderCurrentMarkup()"), discovery.indexOf("function focusDiscoverResults()"));
// Discover's labels, result clarity and helper loading moved into the owner and the page markup (Nov 3 2026).
const pages = ["saas-prototype/index.html", "saas-prototype/customer.html"].map(read);
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Discover renders the card-entry panel as the primary task", markup.includes("customer-discovery-page ff-discover-above-fold") && entryRetired],
  ["002 Find exact card remains a top-level form action", discovery.includes('exact: "Find exact card"') && discovery.includes('data-discovery-find-exact aria-label="${escapeHtml(labels.exactAria)}"')],
  ["003 Search active listings remains a top-level form action", discovery.includes('submit: "Search active listings"') && discovery.includes('<button class="button button-primary" type="submit" aria-label="${escapeHtml(labels.submitAria)}"')],
  ["004 card entry is placed directly under the page heading unless identity confirmation is active", markup.includes("${heading}${identityAssistPanel()}${identityRecovery()}${searchPanel()}")],
  ["005 Guided Mode adds no coach into the Discover page", !guide.includes("data-ff-discover-coach") && !guide.includes("updateDiscoverCoach")],
  ["006 workflow education follows the card entry and results", markup.indexOf("${searchPanel()}") < markup.indexOf("${workflowStripMarkup()}") && markup.indexOf("${resultsPanel()}") < markup.indexOf("${workflowStripMarkup()}")],
  ["007 decision terminology cannot precede the card entry", !discovery.includes("data-ff-decision-key") && markup.indexOf("${searchPanel()}") < markup.indexOf("Decision framework:</strong> Discover ranks")],
  ["008 buried identity action is named consistently", !discovery.includes("Help me identify it") && discovery.includes('exact: "Find exact card"')],
  ["009 review rows gain an explicit verification action", verify.includes("data-ff-verify-review-match") && verify.includes("Select &amp; verify")],
  ["010 only visible card-number rows receive review selection", verify.includes("const verifiable = Boolean(String(row?.cardNumber || \"\").trim())") && verify.includes("const action = item.verifiable")],
  ["011 review selection uses existing server-owned resolve route", discovery.includes('CARD_INTELLIGENCE_RESOLVE_PATH = "/api/v1/card-intelligence/resolve"') && verify.includes("cardIntelligenceRequest(CARD_INTELLIGENCE_RESOLVE_PATH, { query: originalQuery, candidateName, candidateDetail })")],
  ["012 review selection sends public choice fingerprint", verify.includes("{ query: originalQuery, candidateName, candidateDetail }")],
  ["013 verification request uses same-origin credentials", discovery.includes('credentials: "same-origin"')],
  ["014 verification request disables cache", discovery.includes('cache: "no-store"')],
  ["015 verification request rejects redirects", discovery.includes('redirect: "error"')],
  ["016 response size remains bounded", discovery.includes("if (text.length > MAX_RESPONSE_CHARACTERS)")],
  ["017 server authority metadata is validated", discovery.includes('meta.authority === "Smart Opportunity"') && discovery.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["018 correlation id is validated", discovery.includes("meta.correlationId === expectedCorrelationId")],
  ["019 provider identifiers remain excluded", discovery.includes("data.providerIdentifierExposed === false") && discovery.includes("data.rawProviderPayloadExposed === false")],
  ["020 selection cannot accept evidence or recalculate decision", discovery.includes("data.soldEvidenceAccepted === false") && discovery.includes("data.smartOpportunityRecalculated === false")],
  ["021 selection has zero transaction authority", discovery.includes("data.transactionAuthority === false")],
  ["022 exact canonical identity is mandatory", verify.includes("data.readyForEvaluation !== true") && verify.includes("cardIdentity")],
  ["023 canonical card number required before search", verify.includes("/#\\s*[A-Za-z0-9][A-Za-z0-9.-]*/.test(canonical)")],
  ["024 canonical identity replaces customer input before search", verify.includes("input.value = canonical")],
  ["025 marketplace search begins only after successful verification", verify.indexOf("input.value = canonical") > 0 && verify.indexOf("input.value = canonical") < verify.indexOf("search(form)")],
  ["026 failed verification stays in identity workflow", verify.includes('button.textContent = "Select & verify"') && verify.includes("status({ text: error?.message")],
  ["027 identity selection adds no persistent browser storage", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(verify)],
  ["028 Discover has no separate presentation layer that could add recommendation wording", entryRetired],
  ["029 only the primary selectable row is labeled exact match", verify.includes("const primaryIndex = rows.findIndex(identitySelectable);") && verify.includes('${primary ? "Use exact match" : "Select &amp; verify"}')],
  ["030 alternate selectable rows use secondary styling", verify.includes('${primary ? "button-primary" : "button-secondary"}')],
  ["031 displayed composite is labeled Factor score", discovery.includes("<small>Factor score</small>") && !discovery.includes("<small>Discovery score</small>")],
  ["032 rank explanation says factor score is not sole sort key", discovery.includes("Rank is not sorted by factor score alone")],
  ["033 lower complete all-in ask is explained before factor-score tie break", discovery.includes("lower complete all-in ask") && discovery.includes("factor score as a tie-breaker")],
  ["034 excluded identity-review evaluate button is removed", discovery.includes("${identityReview ? '<span class=\"staging-status staging-status-verify\" data-ff-evaluation-unavailable>")],
  ["035 excluded row shows non-actionable evaluation status", discovery.includes("Not eligible for evaluation")],
  ["036 redundant pre-search chooser is removed", !discovery.includes("How do you want to start?") && !discovery.includes("data-ff-discover-start-find")],
  ["037 primary entry order comes from every owner render (no rearranging observer)", entryRetired && markup.includes("${searchPanel()}")],
  ["038 no page loads a separate identity decorator script", pages.every(page => !page.includes("identity-assist-verification-v1.js"))],
  ["039 the identity decorator layer is removed (the owner renders the identity check)", !fs.existsSync(path.join(root, "saas-prototype/identity-assist-verification-v1.js"))],
  ["040 identity verification stylesheet is loaded with the cache-busting version", pages.every(page => page.includes('href="identity-assist-verification-v1.css?v=20260930-5"'))],
  ["041 no script injects the identity helper (the pages list it once)", pages.every(page => !page.includes("identity-assist-verification-v1.js"))],
  ["042 identity assist owns each asynchronous search by request serial", discovery.includes("requestSerial: 0") && discovery.includes("requestSerial !== state.identityAssist.requestSerial")],
  ["043 changed card input invalidates current identity-assist ownership", discovery.includes('identityInput?.addEventListener("input"') && discovery.includes("state.identityAssist.requestSerial += 1")],
  ["044 identity selection is bound to the query that rendered it", discovery.includes("const selectionOwnerQuery = normalizeIdentityQuery(state.identityAssist.query)") && discovery.includes("resolveIdentity(index, selectionOwnerQuery)")],
  ["045 stale selection fails closed against current assist draft and visible query", discovery.includes("ownedQuery !== currentQuery") && discovery.includes("ownedQuery !== draftQuery") && discovery.includes("ownedQuery !== visibleQuery")],
  ["046 Discover entry text is rendered once by the owner (no rewrite layer)", entryRetired && discovery.includes("<label><span>Card</span>")],
  ["047 Discover has no entry decorator observing its own writes", entryRetired],
  ["048 Guided Mode does not reorder the Discover page", !guide.includes("insertAdjacentElement(\"afterend\", coach)") && !guide.includes('coach.insertAdjacentElement("afterend", search)')],
  ["049 required identity confirmation is rendered above card search", markup.includes('const identityRequired = state.identityAssist.active ? " ff-discover-identity-required" : ""') && markup.indexOf("${identityAssistPanel()}") < markup.indexOf("${searchPanel()}")],
  ["050 identity panel owns a direct change-card escape hatch", discovery.includes("data-discovery-change-identity-entry") && discovery.includes("changeIdentityEntryButton?.addEventListener")],
  ["051 identity panel is automatically surfaced when required", discovery.includes("function focusIdentityCheck()") && discovery.includes('panel.scrollIntoView({ behavior: "smooth", block: "start" })')],
  ["051a nearby identity variants are visible without an extra expansion step", verify.includes("const VISIBLE_REVIEW_WITH_EXACT = 2;") && verify.includes("hasSelectable ? VISIBLE_REVIEW_WITH_EXACT : COLLAPSED_REVIEW_COUNT")],
  ["051b identity review uses explicit card-number data instead of fragile display parsing", discovery.includes("data-ff-card-number") && verify.includes("String(row?.cardNumber || \"\")")],
  ["052 completed search surfaces actionable results without animated scroll chasing", discovery.includes("function focusDiscoverResults()") && discovery.includes('root.style.scrollBehavior = "auto"') && discovery.includes('results.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" })') && !discovery.includes('results.scrollIntoView({ behavior: "smooth", block: "start" })')],
  ["053 result cards follow the search task and its outcome", markup.includes("${searchPanel()}${errorPanel()}${searchErrorRecovery()}${notice}${state.data ? `${resultsPanel()}")],
  ["054 provider diagnostics no longer precede completed results", discovery.includes('state.data ? `${resultsPanel()}${emptyResultsRecovery()}${provider}`')]

].forEach(([name, condition]) => check(name, condition));

const failures = results.filter(result => !result.passed);
console.log("Discover identity start + selection validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
