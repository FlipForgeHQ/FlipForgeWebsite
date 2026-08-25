import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("saas-prototype/index.html");
const routeHook = read("saas-prototype/staging-route-hook.js");
const evaluation = read("saas-prototype/staging-evaluation.js");
const opportunities = read("saas-prototype/customer-opportunities.js");
const bridge = read("saas-prototype/customer-opportunities-bridge.js");
const discovery = read("saas-prototype/customer-discovery.js");
const compare = read("saas-prototype/customer-compare.js");
const lifecycle = read("saas-prototype/customer-lifecycle.js");
const management = read("saas-prototype/customer-management.js");
const portfolio = read("saas-prototype/customer-portfolio.js");
const exportAdapter = read("saas-prototype/customer-export.js");
const gateway = read("netlify/functions/flipforge-api.js");

const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const before = (left, right) => index.indexOf(left) >= 0 && index.indexOf(left) < index.indexOf(right);

check("001 customer Opportunities adapter is loaded", index.includes('src="customer-opportunities.js"'));
check("002 customer Opportunities bridge is loaded", index.includes('src="customer-opportunities-bridge.js"'));
check("003 staging browser loads before customer bridge", before('src="staging-browser.js"', 'src="customer-opportunities-bridge.js"'));
check("004 customer Opportunities loads before bridge", before('src="customer-opportunities.js"', 'src="customer-opportunities-bridge.js"'));
check("005 bridge loads before unchanged route hook capture", before('src="customer-opportunities-bridge.js"', 'src="staging-route-hook.js"'));
check("006 bridge sends customer reads to dedicated adapter", bridge.includes("customerAdapter.render(main, id)"));
check("007 bridge keeps staging render on original adapter", bridge.includes("stagingAdapter.render(main, id)"));
check("008 bridge intentionally does not proxy customer dashboard", !bridge.includes("renderCustomerDashboard"));

check("009 evaluation has explicit production host", evaluation.includes("PRODUCTION_HOST") && evaluation.includes("goflipforge"));
check("010 evaluation keeps preview/local diagnostic host", evaluation.includes("ALLOWED_HOST") && evaluation.includes("deploy-preview"));
check("011 evaluation separates customer and diagnostic eligibility", evaluation.includes("customerEligibleHost") && evaluation.includes("diagnosticEligibleHost"));
check("012 production customer Evaluate uses renderCustomer", routeHook.includes('route === "evaluate"') && routeHook.includes("evaluationAdapter.renderCustomer(main)"));
check("013 evaluation diagnostic surface remains separate", evaluation.includes("isDiagnosticEligible") && evaluation.includes("restricted to deploy previews"));
check("014 evaluation POST remains fixed", evaluation.includes('EVALUATION_PATH = "/api/v1/evaluations"'));
check("015 evaluation remains same-origin no-store fail-closed", evaluation.includes('credentials: "same-origin"') && evaluation.includes('cache: "no-store"') && evaluation.includes('redirect: "error"'));
check("016 evaluation idempotency remains required", evaluation.includes('"Idempotency-Key": idempotencyKey'));
check("017 evaluation requires tenant-owned SQLite persistence", evaluation.includes("data.persistedToSqlite === true") && evaluation.includes("data.tenantOwned === true"));
check("018 evaluation cannot verify evidence or identity", evaluation.includes("data.requestCanVerifyEvidence === false") && evaluation.includes("data.requestCanVerifyIdentity === false"));
check("019 evaluation cannot recalculate PSA", evaluation.includes("data.psaRecalculated === false"));
check("020 evaluation cannot authorize transactions", evaluation.includes("data.transactionAuthorized === false"));

check("021 Card Intelligence has explicit production host", opportunities.includes("PRODUCTION_HOST") && opportunities.includes("goflipforge"));
check("022 Card Intelligence constrains production to app path", opportunities.includes("APP_PATH") && opportunities.includes("PRODUCTION_HOST.test(host)"));
check("023 Card Intelligence fixed list routes are read-only", ["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities"].every(value => opportunities.includes(value)) && opportunities.includes('method: "GET"'));
check("024 Card Intelligence detail families are allowlisted", opportunities.includes("(opportunities|evidence|psa-advisor)"));
check("025 Card Intelligence validates Smart Opportunity authority", opportunities.includes('meta.authority === "Smart Opportunity"'));
check("026 Card Intelligence validates PSA authority", opportunities.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("027 Card Intelligence shows Decision Traceback without conflating provider mapping and exact identity", opportunities.includes("Decision Traceback") && opportunities.includes("1 · Provider catalog link") && opportunities.includes("2 · Evidence") && opportunities.includes("4 · Authority output") && !opportunities.includes('mappingConfirmed ? "Exact identity confirmed" : "Identity needs verification"'));
check("028 Card Intelligence shows Evidence Chain", opportunities.includes("Evidence Chain") && opportunities.includes("acceptedExactCompletedSales"));
check("029 Card Intelligence links the rest of customer workflow", ["#/compare", "#/evidence/", "#/psa-advisor/", "#/tracking/", "#/export/"].every(value => opportunities.includes(value)));
check("030 Card Intelligence explicitly has no execution authority", opportunities.includes("No bid, checkout, payment, evidence acceptance, or grade prediction is authorized"));

const promotedAdapters = [discovery, compare, lifecycle, management, portfolio, exportAdapter];
check("031 promoted customer adapters all identify production host", promotedAdapters.every(source => source.includes("PRODUCTION_HOST") && source.includes("goflipforge")));
check("032 promoted customer adapters use same-origin auth", promotedAdapters.every(source => source.includes('credentials: "same-origin"')));
check("033 promoted customer adapters disable cache", promotedAdapters.every(source => source.includes('cache: "no-store"')));
check("034 promoted customer adapters reject redirects", promotedAdapters.every(source => source.includes('redirect: "error"')));
check("035 browser adapters do not trust tenant identity headers", [evaluation, opportunities, ...promotedAdapters].every(source => !/X-FlipForge-(?:Tenant|User)-Id/i.test(source)));
check("036 browser adapters do not expose service bearer token", [evaluation, opportunities, ...promotedAdapters].every(source => !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(source)));

check("037 gateway still injects trusted tenant server-side", gateway.includes("[TENANT_HEADER]: tenant.tenantId"));
check("038 gateway still forbids browser identity headers", gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN"));
check("039 gateway allowlists Discover", gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/discover$/ }'));
check("040 gateway allowlists Evaluate", gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/evaluations$/ }'));
check("041 gateway allowlists saved Opportunities", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/opportunities$/ }'));
check("042 gateway allowlists Compare", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/compare$/ }') || gateway.includes("/api/v1/compare"));
check("043 gateway allowlists lifecycle reads and writes", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle$/ }') && gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }'));

check("044 active-listing discovery remains non-evidence", discovery.includes("activeListingsAreCompletedSaleEvidence !== false") && discovery.includes("This active listing is not a sold comp"));
check("045 Portfolio still rejects active-listing reference contamination", portfolio.includes("reference.activeListingsUsed !== false"));
check("046 Portfolio still refuses invented whole totals under partial coverage", portfolio.includes("!data.completeReferenceCoverage && data.completePortfolioReferenceValueCents !== null"));
check("047 lifecycle alerts disclose external notification delivery boundary", lifecycle.includes("notificationDeliveryConfigured") && lifecycle.includes("Email / push"));
check("048 Decision Dossier remains complete not partial", exportAdapter.includes("complete: true") && exportAdapter.includes("partialExport: false"));
check("049 no customer adapter adds purchase or checkout controls", [discovery, opportunities, compare, lifecycle, management, portfolio, exportAdapter].every(source => !/Place bid|Buy now|Pay now|Accept offer|Create listing/.test(source)));
check("050 customer core loop remains independent of billing activation", ![discovery, evaluation, opportunities, compare, lifecycle, management, portfolio, exportAdapter].some(source => /PADDLE_LIVE|CUSTOMER_PORTAL_ENABLED|checkout\.open|Paddle\.Checkout/.test(source)));

const failures = checks.filter(item => !item.passed);
console.log("FlipForge SaaS Core Production Loop Validation");
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
