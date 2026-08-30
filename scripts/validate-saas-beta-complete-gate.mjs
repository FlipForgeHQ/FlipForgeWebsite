import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const plan = read("docs/SAAS_CORE_PLATFORM_COMPLETION_PLAN.md");
const liveQa = read("docs/SAAS_BETA_COMPLETE_LIVE_QA.md");
const index = read("saas-prototype/index.html");
const discovery = read("saas-prototype/customer-discovery.js");
const discoverEmphasis = read("saas-prototype/discover-card-entry-emphasis-v1.js");
const identityAssistVerification = read("saas-prototype/identity-assist-verification-v1.js");
const discoverControls = read("saas-prototype/customer-discovery-controls-v2.js");
const evaluation = read("saas-prototype/staging-evaluation.js");
const opportunities = read("saas-prototype/customer-opportunities.js");
const explainability = read("saas-prototype/customer-explainability.js");
const lifecycle = read("saas-prototype/customer-lifecycle.js");
const compare = read("saas-prototype/customer-compare.js");
const management = read("saas-prototype/customer-management.js");
const portfolio = read("saas-prototype/customer-portfolio.js");
const exportAdapter = read("saas-prototype/customer-export.js");
const account = read("saas-prototype/customer-account.js");
const gateway = read("netlify/functions/flipforge-api.js");
const customerCss = read("saas-prototype/customer-intelligence.css");
const discoveryCss = read("saas-prototype/customer-discovery.css");
const lifecycleCss = read("saas-prototype/customer-lifecycle.css");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });
const before = (left, right) => index.indexOf(left) >= 0 && index.indexOf(left) < index.indexOf(right);
const coreAdapters = [discovery, evaluation, opportunities, compare, lifecycle, management, portfolio, exportAdapter, account];

check("001 locked completion plan exists", exists("docs/SAAS_CORE_PLATFORM_COMPLETION_PLAN.md") && plan.includes("LOCKED PRODUCT PRIORITY"));
check("002 live Beta Complete QA checklist exists", exists("docs/SAAS_BETA_COMPLETE_LIVE_QA.md") && liveQa.includes("LIVE PROOF REQUIRED"));
check("003 live QA explicitly says CI alone is insufficient", liveQa.includes("green static/CI gate is a prerequisite") && liveQa.includes("Beta Complete requires one controlled"));
check("004 live QA requires signed-in production session", liveQa.includes("signed-in production customer session") && liveQa.includes("goflipforge.com/app/"));
check("005 live QA contains all ten numbered workflow steps", Array.from({ length: 10 }, (_, index) => `## ${index + 1}.`).every(marker => liveQa.includes(marker)));
check("006 final decision requires exact main commit CI", liveQa.includes("exact `main` commit") && liveQa.includes("SaaS Beta Complete Gate"));
check("007 final decision requires production deploy", liveQa.includes("Netlify production deploy") && liveQa.includes("successful"));
check("008 final decision blocks severe workflow defects", liveQa.includes("Severity 1") && liveQa.includes("Severity 2"));
check("009 billing remains deferred in locked plan", plan.includes("paid-billing launch work") && plan.includes("deferred until"));
check("010 live QA keeps billing out of scope", liveQa.includes("Paid checkout and customer portal activation are out of scope"));

check("011 Discover customer adapter loads before route hook", before('src="customer-discovery.js"', 'src="staging-route-hook.js"'));
check("012 Evaluate adapter loads before route hook", before('src="staging-evaluation.js"', 'src="staging-route-hook.js"'));
check("013 Card Intelligence adapter and bridge load before route hook", before('src="customer-opportunities.js"', 'src="customer-opportunities-bridge.js"') && before('src="customer-opportunities-bridge.js"', 'src="staging-route-hook.js"'));
check("014 explainability layer loads before route hook", before('src="customer-explainability.js"', 'src="staging-route-hook.js"'));
check("015 lifecycle adapter loads before route hook", before('src="customer-lifecycle.js"', 'src="staging-route-hook.js"'));
check("016 production account bridge loads before route hook", before('src="customer-account-bridge.js"', 'src="staging-route-hook.js"'));

check("017 Discover remains explicit active-listing discovery", discovery.includes("activeListingOnly") && discovery.includes("completedSaleEvidence"));
check("018 Discover keeps active asks separate from sold evidence", discovery.includes("This active listing is not a sold comp") && discovery.includes("activeListingsAreCompletedSaleEvidence"));
check("019 Discover source URL comes from returned candidate", discovery.includes("listingUrl") && !discovery.includes("ebay.com/itm/${"));
check("020 Discover score stays separate from recommendation", discovery.includes("Discovery score") && discovery.includes("not BUY/WATCH/VERIFY/PASS"));
check("021 Evaluate posts only to fixed evaluation endpoint", evaluation.includes('EVALUATION_PATH = "/api/v1/evaluations"'));
check("022 Evaluate requires SQLite persistence and tenant ownership", evaluation.includes("data.persistedToSqlite === true") && evaluation.includes("data.tenantOwned === true"));
check("023 Evaluate rejects transaction authority", evaluation.includes("data.transactionAuthorized === false"));
check("024 Card Intelligence validates Smart Opportunity authority", opportunities.includes('meta.authority === "Smart Opportunity"'));
check("025 Card Intelligence validates existing PSA authority", opportunities.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("026 Card Intelligence exposes Decision Traceback", opportunities.includes("Decision Traceback") && opportunities.includes("4 · Authority output"));
check("027 Card Intelligence exposes Evidence Chain", opportunities.includes("Evidence Chain") && opportunities.includes("acceptedExactCompletedSales"));
check("028 explainability says confidence is not certainty", explainability.includes("It is not certainty"));
check("029 explainability says supported value is not guaranteed", explainability.includes("not a guaranteed sale price"));
check("030 explainability says PSA guidance is not a grade prediction", explainability.includes("does not predict a grade"));

check("031 lifecycle supports expected customer states", ["WATCHING", "REVIEW", "OWNED", "SOLD", "PASSED", "ARCHIVED"].every(state => lifecycle.includes(state)));
check("032 lifecycle requires acquisition facts for ownership", lifecycle.includes("OWNED requires acquisition facts"));
check("033 lifecycle requires disposition facts for sold state", lifecycle.includes("SOLD requires acquisition and disposition facts"));
check("034 lifecycle keeps append-only history visible", lifecycle.includes("append-only") && lifecycle.includes("Lifecycle history"));
check("035 alerts disclose external delivery boundary", lifecycle.includes("notificationDeliveryConfigured") && lifecycle.includes("Email / push"));
check("036 portfolio refuses invented current value", lifecycle.includes("does not invent current value") || lifecycle.includes("Current value") && lifecycle.includes("Not calculated"));
check("037 compare does not invent a winner", compare.includes("No browser-side score or winner is created") && compare.includes("does not rerank, rescore, or select a winner"));
check("038 customer management retains evidence/PSA/sell boundaries", ["evidence", "psa-advisor", "sell"].every(route => management.includes(route)));
check("039 Decision Dossier requires complete export", exportAdapter.includes("complete: true") && exportAdapter.includes("partialExport: false"));
check("040 production Plan & Usage is read-only", account.includes("readOnly") && account.includes("Production payment controls are intentionally absent"));

check("041 all core adapters use same-origin credentials", coreAdapters.every(source => source.includes('credentials: "same-origin"')));
check("042 all networked core adapters disable cache", coreAdapters.every(source => source.includes('cache: "no-store"')));
check("043 all networked core adapters reject redirects", coreAdapters.every(source => source.includes('redirect: "error"')));
check("044 browser core adapters do not trust tenant/user headers", coreAdapters.every(source => !/X-FlipForge-(?:Tenant|User)-Id/i.test(source)));
check("045 browser core adapters expose no service token", coreAdapters.every(source => !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(source)));
check("046 gateway injects tenant identity server-side", gateway.includes("[TENANT_HEADER]: tenant.tenantId"));
check("047 gateway rejects browser identity headers", gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN"));
check("048 no core customer adapter adds execution controls", coreAdapters.every(source => !/Place bid|Buy now|Pay now|Accept offer|Create listing/i.test(source)));
check("049 production account contains no checkout request", !/billing\/paddle\/checkout|CHECKOUT_PATH|data-customer-checkout-plan/i.test(account));
check("050 core workflow stays independent of Paddle activation", ![discovery, evaluation, opportunities, compare, lifecycle, management, portfolio, exportAdapter, account].some(source => /PADDLE_LIVE|CUSTOMER_PORTAL_ENABLED|Paddle\.Checkout/.test(source)));

check("051 customer intelligence has responsive breakpoints", customerCss.includes("@media (max-width: 1050px)") && customerCss.includes("@media (max-width: 650px)"));
check("052 discovery has responsive breakpoints", discoveryCss.includes("@media (max-width: 1100px)") && discoveryCss.includes("@media (max-width: 680px)"));
check("053 lifecycle has responsive behavior", lifecycleCss.includes("@media") && lifecycleCss.includes("max-width"));
check("054 customer intelligence respects reduced motion", customerCss.includes("prefers-reduced-motion"));
check("055 discovery respects reduced motion", discoveryCss.includes("prefers-reduced-motion"));
check("056 live QA includes desktop tablet mobile", ["desktop viewport", "tablet viewport", "mobile viewport"].every(value => liveQa.includes(value)));

check("057 static core-production validator exists", exists("scripts/validate-saas-core-production-loop.mjs"));
check("058 explainability validator exists", exists("scripts/validate-saas-customer-explainability.mjs"));
check("059 production account validator exists", exists("scripts/validate-saas-production-account.mjs"));
check("060 live QA protects secret handling", ["service tokens", "provider credentials", "raw JWTs", "tenant IDs"].every(value => liveQa.includes(value)));

check("061 Discover exact-card action is unmistakable", discoverEmphasis.includes('searchButton.textContent = "Search active listings"') && discoverEmphasis.includes('identifyButton.textContent = "Help me identify it"'));
check("062 Discover exact candidate is primary", identityAssistVerification.includes('useButton.textContent = "Use exact match"') && identityAssistVerification.includes("ff-identity-selectable"));
check("063 Discover variants use progressive disclosure", identityAssistVerification.includes("COLLAPSED_REVIEW_COUNT = 4") && identityAssistVerification.includes("ff-identity-hidden") && identityAssistVerification.includes("Show ${hiddenCount}"));
check("064 Discover entered grade is consolidated", identityAssistVerification.includes("Grade filter from your search") && identityAssistVerification.includes("cleanInheritedGrade"));
check("065 Discover result controls wait for live results", discoverControls.includes("if (!hasLiveResults || !previous)") && discoverControls.includes("removeResultControls(actions)"));
check("066 Discover evaluation requires exact listing identity", discovery.includes('String(item.matchQuality || "") !== "EXACT_MATCH"') && discovery.includes("evaluationBlockReason"));
check("067 non-exact provider results are separated from exact ranking", discovery.includes("excluded provider result") && discovery.includes("identity not confirmed") && discovery.includes("cannot be evaluated as the searched card"));
check("068 Discover exposes ranking context and explanation", discovery.includes("Ranking context:") && discovery.includes("Why this result is ranked here") && discovery.includes("rankingExplanation"));
check("069 Discover defers ranking explanation to server-owned factors", discovery.includes("server-owned ranking factors when available."));

const failures = results.filter(result => !result.passed);
console.log("FlipForge SaaS Beta Complete Static Gate");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
console.log("LIVE_PROOF_REQUIRED: true");
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
