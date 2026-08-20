import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-discovery.js");
const gateway = read("netlify/functions/flipforge-api.js");
const hook = read("saas-prototype/staging-route-hook.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Discover adapter exists", adapter.includes("FlipForgeCustomerDiscovery")],
  ["002 production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["003 preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["004 app path is constrained", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["005 route hook delegates Discover", hook.includes('route === "discover"') && hook.includes("discoveryAdapter.render")],
  ["006 Discover POST route is fixed", adapter.includes('DISCOVER_PATH = "/api/v1/discover"')],
  ["007 evaluation handoff uses existing evaluation route", adapter.includes('EVALUATION_PATH = "/api/v1/evaluations"')],
  ["008 requests use same-origin credentials", adapter.includes('credentials: "same-origin"')],
  ["009 requests disable cache", adapter.includes('cache: "no-store"')],
  ["010 requests reject redirects", adapter.includes('redirect: "error"')],
  ["011 no browser tenant identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["012 no browser service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["013 no persistent discovery storage", !/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(adapter)],
  ["014 response size bounded", adapter.includes("DISCOVER_RESPONSE_TOO_LARGE")],
  ["015 Smart Opportunity authority validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["016 PSA authority validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["017 correlation validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["018 discovery kind validated", adapter.includes('data.kind !== "discover"')],
  ["019 discovery is not persisted", adapter.includes("data.discoveryPersisted !== false")],
  ["020 evaluation required before save", adapter.includes("data.evaluationRequiredToSave !== true")],
  ["021 active listing cannot become completed-sale evidence", adapter.includes("data.activeListingsAreCompletedSaleEvidence !== false")],
  ["022 tenant ownership begins only on evaluation", adapter.includes("data.tenantOwnedPersistenceCreated !== false") && adapter.includes("data.tenantOwnershipCreatedOnlyByEvaluation !== true")],
  ["023 tenant isolation is default-deny", adapter.includes('isolation.enforced !== true') && adapter.includes('isolation.defaultAccess !== "DENY"')],
  ["024 provider credentials excluded", adapter.includes("provider.providerCredentialsExposed !== false")],
  ["025 provider setup action rejected", adapter.includes('hasOwnProperty.call(provider, "action")')],
  ["026 candidate recommendation prohibited", adapter.includes('hasOwnProperty.call(item, "recommendation")')],
  ["027 candidate remains active-listing only", adapter.includes("item.activeListingOnly === true") && adapter.includes("item.completedSaleEvidence === false")],
  ["028 candidate has zero transaction authority", adapter.includes("item.transactionAuthority === false")],
  ["029 exact query length bounded", adapter.includes("exactCardQuery.length > 500")],
  ["030 result limits constrained", adapter.includes("[10, 25, 50].includes(limit)")],
  ["031 target money uses exact cents", adapter.includes("BigInt(whole) * 100n")],
  ["032 evaluation eligibility explicit", adapter.includes("item.evaluationEligible !== true")],
  ["033 evaluation listing ID sanitized", adapter.includes("SAFE_EXTERNAL_ID.test(externalListingId)")],
  ["034 evaluation marketplace allowlisted", adapter.includes("MARKETPLACES.has(marketplace)")],
  ["035 evaluation source URL validated", adapter.includes("validHttpUrl(listingUrl)")],
  ["036 evaluation idempotency key required", adapter.includes('headers["Idempotency-Key"]')],
  ["037 saved evaluation must persist to SQLite", adapter.includes("data.persistedToSqlite === true")],
  ["038 evaluation cannot verify evidence or identity", adapter.includes("data.requestCanVerifyEvidence === false") && adapter.includes("data.requestCanVerifyIdentity === false")],
  ["039 evaluation cannot recalculate PSA", adapter.includes("data.psaRecalculated === false")],
  ["040 evaluation cannot authorize transaction", adapter.includes("data.transactionAuthorized === false")],
  ["041 UI labels Discovery score not decision", adapter.includes("Discovery score") && adapter.includes("this score is not BUY/WATCH/VERIFY/PASS")],
  ["042 UI labels active listing not sold comp", adapter.includes("This active listing is not a sold comp")],
  ["043 no automated purchase controls", !/Place bid|Buy now|Checkout|Pay now|Accept offer|Create listing/.test(adapter)],
  ["044 gateway allowlists Discover POST", gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/discover$/ }')],
  ["045 gateway injects trusted tenant server-side", gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["046 gateway forbids client identity headers", gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["046A best-candidate badge follows backend selection label", adapter.includes('item.discoveryLabel === "BEST_CONNECTED_CANDIDATE"') && !adapter.includes("item.eligibleForBestConnectedCandidate === true")]
].forEach(([name, condition]) => check(name, condition));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function envelope(correlationId, data) {
  return { meta: { contractVersion: "1.0", engineVersion: "discover-test", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId }, data };
}

const candidate = {
  rank: 1,
  discoveryScore: 92,
  discoveryLabel: "BEST_CONNECTED_CANDIDATE",
  providerDisplayName: "eBay Browse",
  marketplace: "EBAY",
  title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  listingUrl: "https://www.ebay.com/itm/1234567890",
  allInAskCents: 52500,
  allInCostComplete: true,
  listingAvailability: "AVAILABLE",
  listingFreshness: "CURRENT",
  activeListingOnly: true,
  completedSaleEvidence: false,
  transactionAuthority: false,
  evaluationEligible: false,
  evidence: { trustedExactCompletedSaleCount: 4, supported: true, trustedEvidenceValueCents: 60000, calibratedConfidence: 86, risk: 32 }
};
const discover = {
  kind: "discover",
  readOnly: true,
  discoveryPersisted: false,
  evaluationRequiredToSave: true,
  activeListingsAreCompletedSaleEvidence: false,
  transactionAuthority: false,
  tenantOwnedPersistenceCreated: false,
  tenantOwnershipCreatedOnlyByEvaluation: true,
  tenantIsolation: { enforced: true, defaultAccess: "DENY" },
  provider: { name: "eBay Browse", available: true, status: "CONNECTED", providerCredentialsExposed: false, customerCanConfigureProvider: false },
  candidateCount: 1,
  evidenceSupportedCount: 1,
  coverageSummary: "1 connected candidate",
  items: [candidate]
};

function runtime({ hostname = "deploy-preview-40--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured" } = {}) {
  const calls = [];
  let uuid = 0;
  const window = { location: { hostname, pathname, href: `https://${hostname}${pathname}`, origin: `https://${hostname}`, hash: "#/discover" }, crypto: { randomUUID: () => `discover-${++uuid}` } };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (url === "/api/v1/discover") return response(envelope(correlationId, discover));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, BigInt, RegExp, Promise, Set, Map, Error, URL, FormData, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(adapter, context, { filename: "customer-discovery.js" });
  const main = { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } };
  return { window, calls, main };
}

const preview = runtime();
check("047 preview app eligible", preview.window.FlipForgeCustomerDiscovery.isEligible());
check("048 preview Discover render activates", await preview.window.FlipForgeCustomerDiscovery.render(preview.main) === true);
check("049 initial Discover render reads health only", preview.calls.length === 1 && preview.calls[0].url === "/api/v1/health");
check("050 preview uses hardened same-origin health read", preview.calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("051 production app eligible", production.window.FlipForgeCustomerDiscovery.isEligible());
check("052 production Discover render activates", await production.window.FlipForgeCustomerDiscovery.render(production.main) === true);
check("053 production reads health through same-origin gateway", production.calls.length === 1 && production.calls[0].url === "/api/v1/health");

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("054 public marketing path ineligible", marketing.window.FlipForgeCustomerDiscovery.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
await disabled.window.FlipForgeCustomerDiscovery.render(disabled.main);
check("055 disabled gateway stays health-only", disabled.calls.length === 1);
check("056 disabled gateway renders no fake candidates", /safely offline/i.test(disabled.main.innerHTML) && !disabled.main.innerHTML.includes(candidate.title));

const failures = results.filter(result => !result.passed);
console.log("SaaS customer Discover production validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;