import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  index: read("saas-prototype/index.html"),
  readAdapter: read("saas-prototype/staging-browser.js"),
  evaluationAdapter: read("saas-prototype/staging-evaluation.js"),
  customerAdapter: read("saas-prototype/customer-opportunities.js"),
  opportunityBridge: read("saas-prototype/customer-opportunities-bridge.js"),
  routeHook: read("saas-prototype/staging-route-hook.js"),
  css: read("saas-prototype/customer-intelligence.css"),
  gateway: read("netlify/functions/flipforge-api.js"),
  docs: read("docs/SAAS_CUSTOMER_INTELLIGENCE_LOOP.md")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer intelligence stylesheet is loaded", files.index.includes('href="customer-intelligence.css"')],
  ["002 deploy previews replace the mock Evaluate route", files.routeHook.includes('route === "evaluate"') && files.routeHook.includes("evaluationAdapter.renderCustomer(main)")],
  ["003 customer Opportunity routes use the dedicated customer adapter", files.routeHook.includes('route === "opportunities"') && files.routeHook.includes("renderOpportunityRoute(id)") && files.routeHook.includes("FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities")],
  ["004 production Opportunity routing does not depend on the staging adapter", files.opportunityBridge.includes("window.FlipForgeCustomerOpportunitiesBridge = customerBridge") && !files.opportunityBridge.includes("if (!stagingAdapter || !customerAdapter) return") && !files.routeHook.includes("adapter.renderCustomer(main, id)")],
  ["005 customer route uses a distinct private beta banner", files.routeHook.includes("PRIVATE BETA INTELLIGENCE")],
  ["006 customer list promises no mock fallback", files.readAdapter.includes("never substitutes mock records")],
  ["007 tracked state is tied to SQLite", files.readAdapter.includes("Tracked in SQLite") && files.readAdapter.includes("SQLite saved")],
  ["008 Card Intelligence has a Decision Traceback", files.readAdapter.includes("Card Intelligence") && files.readAdapter.includes("Decision Traceback")],
  ["009 traceback covers identity evidence factors and authority", ["1 · Identity", "2 · Evidence", "3 · Market factors", "4 · Authority output"].every(value => files.readAdapter.includes(value))],
  ["010 evidence chain renders only returned linked evidence", files.readAdapter.includes("linkedEvidenceTable") && files.readAdapter.includes("evidence?.linkedEvidence")],
  ["011 evidence exclusions remain visible", files.readAdapter.includes("visibleButAuthorityIneligible") && files.readAdapter.includes("authority-ineligible")],
  ["012 saved PSA context is read without grade prediction", files.readAdapter.includes("Saved PSA guidance") && files.readAdapter.includes("no grade is predicted here")],
  ["013 customer Evaluate is guided into three sections", ["Listing and exact card identity", "Complete acquisition cost", "Confirm the authority boundary"].every(value => files.evaluationAdapter.includes(value))],
  ["014 evaluation result opens Card Intelligence", files.evaluationAdapter.includes("Open Card Intelligence") && files.evaluationAdapter.includes('"#/opportunities/"')],
  ["015 evaluation persists and grants tenant ownership", files.evaluationAdapter.includes("persisted to SQLite") && files.evaluationAdapter.includes("granted tenant ownership")],
  ["016 recommendation authority stays server-side", files.docs.includes("Smart Opportunity remains the sole") && files.docs.includes("browser never calculates")],
  ["017 PSA authority stays server-side", files.docs.includes("Existing PSA intelligence remains the sole")],
  ["018 no production activation is added", files.docs.includes("Production remains disabled")],
  ["019 no customer transaction authority is added", files.docs.includes("No bid, checkout, payment, purchase, listing, or resale authority")],
  ["020 read adapter sends no trusted identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.readAdapter)],
  ["021 evaluation adapter sends no trusted identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.evaluationAdapter)],
  ["022 browser adapters contain no service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.readAdapter + files.evaluationAdapter + files.customerAdapter + files.opportunityBridge)],
  ["023 browser adapters do not persist auth or request state", !/localStorage|sessionStorage|document\.cookie/.test(files.readAdapter + files.evaluationAdapter + files.customerAdapter + files.opportunityBridge)],
  ["024 gateway remains the trusted tenant injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["025 customer layout is responsive", files.css.includes("@media (max-width: 1050px)") && files.css.includes("@media (max-width: 430px)")],
  ["026 customer layout respects reduced motion", files.css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, extras = {}) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-smart-opportunity+psa",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: ["Decision support only."],
      correlationId,
      ...extras
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeReadMain() {
  return { innerHTML: "", focus() {}, querySelectorAll() { return []; } };
}

function readRuntime() {
  const nav = { hidden: true };
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname: "deploy-preview-31--goflipforge.netlify.app", hash: "#/opportunities" },
    crypto: { randomUUID: () => `customer-correlation-${++uuid}` }
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-route='staging']") return nav;
      if (selector === "#main-content") return makeReadMain();
      return null;
    }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlation = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId: correlation }, data: { status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true } });
    if (url === "/api/v1/dashboard") return response(envelope(correlation, { kind: "dashboard", metrics: { trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 0 } }));
    if (url === "/api/v1/opportunities") return response(envelope(correlation, { kind: "opportunities", items: [{ id: "EBAY-card-001", title: "Saved Ohtani", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", platform: "EBAY", recommendation: "BUY", ask: 525, supportedValue: 602, confidence: 86, liquidity: 91, risk: 32, rank: 88, evidence: { acceptedSales: 4 }, mappingState: "CONFIRMED" }] }));
    if (url === "/api/v1/opportunities/EBAY-card-001") return response(envelope(correlation, { kind: "opportunity-detail", opportunity: { id: "EBAY-card-001", title: "Saved Ohtani", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", platform: "EBAY", recommendation: "BUY", workflowStatus: "BUY_READY_CANDIDATE", ask: 525, supportedValue: 602, confidence: 86, liquidity: 91, risk: 32, rank: 88, evidenceCount: 4, mappingState: "CONFIRMED", contextStatus: "READY", statusMessage: "Saved governed evidence supports the decision.", observedAt: "2026-08-02T15:45:00Z", evidence: { acceptedSales: 4, averagePrice: 602, latestSaleDate: "2026-07-29" }, authorityBoundary: "Decision support only." } }));
    if (url === "/api/v1/evidence/EBAY-card-001") return response(envelope(correlation, { kind: "evidence", acceptedExactCompletedSales: 4, visibleButAuthorityIneligible: 1, linkedEvidence: [{ sourceName: "eBay", type: "SOLD_COMP", amount: 602, soldAt: "2026-07-29", identityMatch: true, authorityEligible: true }] }));
    if (url === "/api/v1/psa-advisor/EBAY-card-001") return response(envelope(correlation, { kind: "psa-advisor", guidanceStatus: "SAVED_GUIDANCE_AVAILABLE", savedPsaSnapshot: { readinessStatus: "READY", manualVerificationRequired: true }, populationContext: { psa10Population: 1200, psa9Population: 900 }, recalculated: false }));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, document, fetch, Response, URL, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(files.readAdapter, context, { filename: "staging-browser.js" });
  return { window, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 30));
const readState = readRuntime();
const listMain = makeReadMain();
check("027 customer read adapter is eligible on deploy preview", readState.window.FlipForgeStagingReadAdapter.isEligible());
check("028 customer render entrypoint exists", typeof readState.window.FlipForgeStagingReadAdapter.renderCustomer === "function");
readState.window.FlipForgeStagingReadAdapter.renderCustomer(listMain);
await settle();
check("029 customer list loads health dashboard and opportunities", readState.calls.slice(0, 3).map(call => call.url).join(",") === "/api/v1/health,/api/v1/dashboard,/api/v1/opportunities");
check("030 customer list renders tracked authoritative record", listMain.innerHTML.includes("Tracked Opportunities") && listMain.innerHTML.includes("Saved Ohtani") && listMain.innerHTML.includes("SQLite saved"));
check("031 customer list states no mock substitution", listMain.innerHTML.includes("never substitutes mock records"));
check("032 customer reads use same-origin cookie controls", readState.calls.slice(0, 3).every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store"));

const detailMain = makeReadMain();
readState.window.FlipForgeStagingReadAdapter.renderCustomer(detailMain, "EBAY-card-001");
await settle();
check("033 Card Intelligence loads detail evidence and PSA", readState.calls.slice(-3).map(call => call.url).join(",") === "/api/v1/opportunities/EBAY-card-001,/api/v1/evidence/EBAY-card-001,/api/v1/psa-advisor/EBAY-card-001");
check("034 Card Intelligence renders saved recommendation and factors", detailMain.innerHTML.includes("Card Intelligence") && detailMain.innerHTML.includes("Decision Traceback") && detailMain.innerHTML.includes("BUY_READY_CANDIDATE"));
check("035 Card Intelligence renders evidence eligibility", detailMain.innerHTML.includes("Exact match") && detailMain.innerHTML.includes("Eligible") && detailMain.innerHTML.includes("4 accepted"));
check("036 Card Intelligence renders saved PSA without recalculation", detailMain.innerHTML.includes("SAVED_GUIDANCE_AVAILABLE") && detailMain.innerHTML.includes("Recalculated") && detailMain.innerHTML.includes(">No<"));
check("037 Card Intelligence exposes no transaction action", !/Place bid|Buy now|Checkout|Pay now/.test(detailMain.innerHTML));

function makeForm(values) {
  return {
    values: { ...values },
    handler: null,
    addEventListener(type, handler) { if (type === "submit") this.handler = handler; },
    submit() { this.handler({ preventDefault() {} }); }
  };
}

class TestFormData {
  constructor(form) { this.values = form.values; }
  get(name) { return Object.prototype.hasOwnProperty.call(this.values, name) ? this.values[name] : null; }
}

function evaluationRuntime() {
  const form = makeForm({ externalListingId: "customer-card-001", marketplace: "EBAY", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", listingUrl: "https://example.invalid/customer-card-001", seller: "seller", itemPrice: "525.25", shipping: "8.50", buyerPremium: "0", tax: "42.02", listingFormat: "FIXED_PRICE", endsAt: "", acknowledgeBoundary: "yes" });
  const main = { innerHTML: "", querySelector(selector) { return selector === "[data-staging-evaluation-form]" ? form : null; } };
  const calls = [];
  let uuid = 0;
  const window = { location: { hostname: "deploy-preview-31--goflipforge.netlify.app", hash: "#/evaluate" }, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` } };
  const document = { querySelector() { return { hidden: true }; } };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    const requestId = options.headers["Idempotency-Key"];
    return response(envelope(correlationId, { kind: "evaluation", requestId, opportunityId: "EBAY-customer-card-001", idempotentReplay: false, persistedToSqlite: true, tenantOwned: true, normalizedRequest: { allInAskCents: 57577 }, decision: { recommendation: "BUY", workflowStatus: "BUY_READY_CANDIDATE", supportedValueCents: 60200, exactTrustedCompCount: 4, confidence: 86, risk: 32, reason: "Saved governed evidence supports the decision.", missingRequirement: null, nextAction: "Review the saved evidence before acting." }, requestCanVerifyEvidence: false, requestCanVerifyIdentity: false, evidenceAcceptedByRequest: false, psaRecalculated: false, transactionAuthorized: false, providerCredentialsExposed: false, tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" } }));
  };
  const context = vm.createContext({ window, document, fetch, Response, URL, Intl, Math, Date, Object, Array, String, Number, Boolean, BigInt, RegExp, Promise, Set, FormData: TestFormData, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(files.evaluationAdapter, context, { filename: "staging-evaluation.js" });
  return { window, form, main, calls };
}

const evaluation = evaluationRuntime();
check("038 customer evaluation entrypoint exists", typeof evaluation.window.FlipForgeStagingEvaluationAdapter.renderCustomer === "function");
evaluation.window.FlipForgeStagingEvaluationAdapter.renderCustomer(evaluation.main);
check("039 customer intake renders guided steps", evaluation.main.innerHTML.includes("Evaluate and track a card") && evaluation.main.innerHTML.includes("Complete acquisition cost"));
evaluation.form.submit();
await settle();
check("040 customer evaluation posts once through same-origin gateway", evaluation.calls.length === 1 && evaluation.calls[0].url === "/api/v1/evaluations" && evaluation.calls[0].options.credentials === "same-origin");
check("041 result is saved and tracked", evaluation.main.innerHTML.includes("Authoritative decision saved") && evaluation.main.innerHTML.includes("persisted to SQLite") && evaluation.main.innerHTML.includes("granted tenant ownership"));
check("042 result opens the real customer detail route", evaluation.main.innerHTML.includes("#/opportunities/EBAY-customer-card-001") && evaluation.main.innerHTML.includes("Open Card Intelligence"));
check("043 result displays backend all-in acquisition", evaluation.main.innerHTML.includes("All-in acquisition") && evaluation.main.innerHTML.includes("$575.77"));

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerIntelligenceLoopValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
