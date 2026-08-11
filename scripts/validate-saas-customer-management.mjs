import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-management.js");
const hook = read("saas-prototype/staging-route-hook.js");
const gateway = read("netlify/functions/flipforge-api.js");
const index = read("saas-prototype/index.html");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 management adapter loaded by app", index.includes('src="customer-management.js"')],
  ["002 management owns evidence PSA sell portfolio alerts", ["psa-advisor", "evidence", "sell", "portfolio", "alerts"].every(route => adapter.includes(`"${route}"`))],
  ["003 route hook delegates management routes", hook.includes("managementAdapter.handles(route)") && hook.includes("managementAdapter.render(main, route, id)")],
  ["004 production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["005 preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["006 customer app path is explicit", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["007 fixed GET paths are allowlisted", ["/api/v1/health", "/api/v1/opportunities", "/api/v1/portfolio", "/api/v1/alerts"].every(value => adapter.includes(value))],
  ["008 detail families are allowlisted", adapter.includes("(opportunities|evidence|psa-advisor)")],
  ["009 unsafe saved identifiers are rejected", adapter.includes("SAFE_ID.test(decoded)") && adapter.includes("SAFE_ID.test(state.requestedId)")],
  ["010 requests are same-origin", adapter.includes('credentials: "same-origin"')],
  ["011 requests disable cache", adapter.includes('cache: "no-store"')],
  ["012 requests reject redirects", adapter.includes('redirect: "error"')],
  ["013 management adapter is GET-only", adapter.includes('method: "GET"') && !/method:\s*["']POST/.test(adapter)],
  ["014 no trusted browser tenant identity", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["015 no browser service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["016 no browser persistence", !/localStorage|sessionStorage|document\.cookie/.test(adapter)],
  ["017 Smart Opportunity authority validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["018 PSA authority validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["019 request correlation validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["020 response size bounded", adapter.includes("MAX_RESPONSE_CHARACTERS") && adapter.includes("CUSTOMER_RESPONSE_TOO_LARGE")],
  ["021 disabled health stops tenant reads", adapter.includes('state.health?.data?.status !== "configured"')],
  ["022 disabled health substitutes no sample data", adapter.includes("no sample data was substituted")],
  ["023 evidence contract remains exact", adapter.includes('state.evidence?.data?.kind !== "evidence"') && adapter.includes("acceptedExactCompletedSales")],
  ["024 Evidence Center exposes no operator mutation", adapter.includes("cannot accept, reject, hold, relink") && !/data-(?:accept|reject|hold|relink)/.test(adapter)],
  ["025 PSA is saved non-recalculated guidance", adapter.includes('state.psa?.data?.kind !== "psa-advisor"') && adapter.includes("recalculated !== false")],
  ["026 PSA page disclaims grade prediction", adapter.includes("without predicting a grade") && adapter.includes("never runs or persists a new analysis")],
  ["027 Exit Review uses saved detail and evidence", adapter.includes("Promise.allSettled") && adapter.includes("No sell recommendation was created")],
  ["028 Exit Review exposes no transaction action", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(adapter)],
  ["029 unsupported feature state stays honest", adapter.includes("No DEV alert, mock rule, fake unread count") && adapter.includes("No holdings, cost basis, performance, or gain is fabricated")],
  ["030 production authentication handoff exists", adapter.includes("/production-auth.html")],
  ["031 gateway allowlists management GETs", ["psa-advisor", "evidence", "portfolio", "alerts"].every(value => gateway.includes(value))]
].forEach(([name, condition]) => check(name, condition));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-engine",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: []
    },
    data
  };
}

const opportunity = {
  id: "opp-1",
  title: "Saved Ohtani decision",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  recommendation: "BUY",
  ask: 525,
  supportedValue: 602,
  confidence: 86,
  liquidity: 91,
  risk: 32,
  rank: 88,
  mappingState: "CONFIRMED",
  evidence: { acceptedSales: 4 }
};

const evidenceData = {
  kind: "evidence",
  opportunityId: "opp-1",
  acceptedExactCompletedSales: 4,
  visibleButAuthorityIneligible: 1,
  linkedEvidence: [{ sourceName: "eBay", type: "SOLD_COMP", amount: 590, soldAt: "2026-07-30", identityMatch: true, authorityEligible: true }],
  manualCandidates: [],
  timeline: []
};

const psaData = {
  kind: "psa-advisor",
  opportunityId: "opp-1",
  guidanceStatus: "SAVED_GUIDANCE_AVAILABLE",
  authoritativeOpportunityRecommendation: "BUY",
  savedPsaSnapshot: { readinessStatus: "REVIEW_READY", manualVerificationRequired: false, evidenceRefreshRequired: false, freshCompEvidenceRequired: false, additionalSnapshotRequired: false },
  populationContext: { available: true, psa10Population: 1200, displayOnly: true },
  recalculated: false
};

function runtime({ hostname = "deploy-preview-35--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured", unauthorized = false } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, pathname, hash: "#/evidence/opp-1" },
    crypto: { randomUUID: () => `management-${++uuid}` }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (unauthorized) return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401);
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", items: [opportunity] }));
    if (url === "/api/v1/evidence/opp-1") return response(envelope(correlationId, evidenceData));
    if (url === "/api/v1/psa-advisor/opp-1") return response(envelope(correlationId, psaData));
    if (url === "/api/v1/opportunities/opp-1") return response(envelope(correlationId, { kind: "opportunity-detail", opportunity }));
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, { kind: "portfolio", configured: false, items: [] }));
    if (url === "/api/v1/alerts") return response(envelope(correlationId, { kind: "alerts", configured: false, items: [] }));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, FormData });
  vm.runInContext(adapter, context, { filename: "customer-management.js" });
  return { window, calls };
}

const main = () => ({ innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } });
const settle = () => new Promise(resolve => setTimeout(resolve, 45));

const preview = runtime();
check("032 preview app is eligible", preview.window.FlipForgeCustomerManagement.isEligible());
const previewMain = main();
check("033 preview Evidence render activates", preview.window.FlipForgeCustomerManagement.render(previewMain, "evidence", "opp-1") === true);
await settle();
check("034 preview Evidence uses authoritative route sequence", preview.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/evidence/opp-1");
check("035 preview Evidence renders saved evidence", previewMain.innerHTML.includes("Accepted exact sales") && previewMain.innerHTML.includes("eBay"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("036 production app is eligible", production.window.FlipForgeCustomerManagement.isEligible());
const productionMain = main();
check("037 production Evidence render activates", production.window.FlipForgeCustomerManagement.render(productionMain, "evidence", "opp-1") === true);
await settle();
check("038 production uses same-origin authoritative API", production.calls.length === 3 && production.calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("039 production renders no mock account data", !/Prototype Account|Sample holding|mock recommendation/i.test(productionMain.innerHTML));

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("040 public marketing path is ineligible", marketing.window.FlipForgeCustomerManagement.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = main();
disabled.window.FlipForgeCustomerManagement.render(disabledMain, "evidence", "opp-1");
await settle();
check("041 disabled gateway makes health request only", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("042 disabled gateway renders safe offline state", /safely offline/i.test(disabledMain.innerHTML));

const unauthorized = runtime({ hostname: "goflipforge.com", pathname: "/app/", unauthorized: true });
const unauthorizedMain = main();
unauthorized.window.FlipForgeCustomerManagement.render(unauthorizedMain, "evidence", "opp-1");
await settle();
check("043 production auth failure offers production handoff", unauthorizedMain.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorizedMain.innerHTML.includes("/production-auth.html"));

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerManagementValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
