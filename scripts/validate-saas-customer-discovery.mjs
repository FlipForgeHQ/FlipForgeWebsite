import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  adapter: read("saas-prototype/customer-discovery.js"),
  css: read("saas-prototype/customer-discovery.css"),
  hook: read("saas-prototype/staging-route-hook.js"),
  index: read("saas-prototype/index.html"),
  gateway: read("netlify/functions/flipforge-api.js"),
  package: read("package.json"),
  netlify: read("netlify.toml")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer discovery adapter exists", files.adapter.includes("FlipForgeCustomerDiscovery")],
  ["002 adapter is strict-mode isolated", files.adapter.startsWith("(() =>") && files.adapter.includes('"use strict"')],
  ["003 adapter is deploy-preview constrained", files.adapter.includes("PREVIEW_HOST") && files.adapter.includes("eligibleHost")],
  ["004 Discover uses fixed POST route", files.adapter.includes('DISCOVER_PATH = "/api/v1/discover"')],
  ["005 Evaluate handoff uses existing evaluation route", files.adapter.includes('EVALUATION_PATH = "/api/v1/evaluations"')],
  ["006 discovery stylesheet is loaded", files.index.includes('href="customer-discovery.css"')],
  ["007 discovery script is loaded before route hook", files.index.indexOf('src="customer-discovery.js"') < files.index.indexOf('src="staging-route-hook.js"')],
  ["008 route hook captures discovery adapter", files.hook.includes("FlipForgeCustomerDiscovery")],
  ["009 route hook overrides Discover placeholder", files.hook.includes('route === "discover"') && files.hook.includes("discoveryAdapter.render")],
  ["010 browser sends discover as POST", files.adapter.includes('method: "POST"') && files.adapter.includes("DISCOVER_PATH")],
  ["011 browser uses same-origin credentials", files.adapter.includes('credentials: "same-origin"')],
  ["012 browser disables cache", files.adapter.includes('cache: "no-store"')],
  ["013 browser rejects redirects", files.adapter.includes('redirect: "error"')],
  ["014 browser never sends trusted tenant header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.adapter)],
  ["015 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(files.adapter)],
  ["016 browser stores no discovery state persistently", !/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(files.adapter)],
  ["017 response size is bounded", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("DISCOVER_RESPONSE_TOO_LARGE")],
  ["018 Smart Opportunity authority is validated", files.adapter.includes('meta.authority === "Smart Opportunity"')],
  ["019 PSA authority is validated", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["020 correlation IDs are validated", files.adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["021 discover kind is validated", files.adapter.includes('data.kind !== "discover"')],
  ["022 discovery persistence denial is validated", files.adapter.includes("data.discoveryPersisted !== false")],
  ["023 evaluation-required-to-save is validated", files.adapter.includes("data.evaluationRequiredToSave !== true")],
  ["024 active listing evidence boundary is validated", files.adapter.includes("data.activeListingsAreCompletedSaleEvidence !== false")],
  ["025 tenant-owned persistence boundary is validated", files.adapter.includes("data.tenantOwnedPersistenceCreated !== false")],
  ["026 tenant ownership waits for evaluation", files.adapter.includes("data.tenantOwnershipCreatedOnlyByEvaluation !== true")],
  ["027 tenant isolation is validated", files.adapter.includes('isolation.enforced !== true') && files.adapter.includes('isolation.defaultAccess !== "DENY"')],
  ["028 provider credentials must be excluded", files.adapter.includes("provider.providerCredentialsExposed !== false")],
  ["029 browser rejects provider setup action", files.adapter.includes('Object.prototype.hasOwnProperty.call(provider, "action")')],
  ["030 candidate cannot contain recommendation", files.adapter.includes('hasOwnProperty.call(item, "recommendation")')],
  ["031 candidate must remain active listing only", files.adapter.includes("item.activeListingOnly === true")],
  ["032 candidate cannot become completed sale evidence", files.adapter.includes("item.completedSaleEvidence === false")],
  ["033 candidate has no transaction authority", files.adapter.includes("item.transactionAuthority === false")],
  ["034 exact query length is bounded", files.adapter.includes("exactCardQuery.length > 500")],
  ["035 result limit is constrained", files.adapter.includes("[10, 25, 50].includes(limit)")],
  ["036 target cost is exact cents", files.adapter.includes("BigInt(whole) * 100n")],
  ["037 target cost is bounded", files.adapter.includes("MAX_COST_CENTS")],
  ["038 evaluation eligibility is required", files.adapter.includes("item.evaluationEligible !== true")],
  ["039 evaluation listing id is sanitized", files.adapter.includes("SAFE_EXTERNAL_ID.test(externalListingId)")],
  ["040 evaluation marketplace is allowlisted", files.adapter.includes("MARKETPLACES.has(marketplace)")],
  ["041 evaluation URL is validated", files.adapter.includes("validHttpUrl(listingUrl)")],
  ["042 evaluation cents must be safe integers", files.adapter.includes("Number.isSafeInteger(value)")],
  ["043 evaluation uses fresh idempotency key", files.adapter.includes("newIdempotencyKey") && files.adapter.includes('headers["Idempotency-Key"]')],
  ["044 evaluation response requires saved SQLite", files.adapter.includes("data.persistedToSqlite === true")],
  ["045 evaluation response requires tenant ownership", files.adapter.includes("data.tenantOwned === true")],
  ["046 evaluation response rejects evidence verification", files.adapter.includes("data.requestCanVerifyEvidence === false")],
  ["047 evaluation response rejects identity verification", files.adapter.includes("data.requestCanVerifyIdentity === false")],
  ["048 evaluation response rejects PSA recalculation", files.adapter.includes("data.psaRecalculated === false")],
  ["049 evaluation response rejects transaction authority", files.adapter.includes("data.transactionAuthorized === false")],
  ["050 evaluation only accepts Smart Opportunity decisions", files.adapter.includes("DECISIONS.has")],
  ["051 saved result navigates to opportunity detail", files.adapter.includes("#/opportunities/${encodeURIComponent(result.payload.data.opportunityId)}")],
  ["052 UI calls score Discovery score", files.adapter.includes("Discovery score")],
  ["053 UI states score is not BUY/WATCH/VERIFY/PASS", files.adapter.includes("this score is not BUY/WATCH/VERIFY/PASS")],
  ["054 UI limits best candidate to connected sources", files.adapter.includes("best across currently connected sources")],
  ["055 UI identifies active listing as not sold comp", files.adapter.includes("This active listing is not a sold comp")],
  ["056 no auto-buy controls exist", !/Place bid|Buy now|Checkout|Pay now|Accept offer|Create listing/.test(files.adapter)],
  ["057 gateway allowlists Discover POST", files.gateway.includes('{ method: "POST", pattern: /^\\/api\\/v1\\/discover$/ }')],
  ["058 gateway keeps Discover non-idempotent while evaluations and exact checkout require keys", files.gateway.includes('const isEvaluation = method === "POST" && path === "/api/v1/evaluations"') && files.gateway.includes('const isCheckout = method === "POST" && path === CHECKOUT_PATH') && files.gateway.includes('if (!isEvaluation && !isCheckout) return { ok: true, value: null }')],
  ["059 gateway forwards Discover body", files.gateway.includes('body: method === "POST" || method === "PUT" ? body : undefined')],
  ["060 gateway remains trusted tenant injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["061 gateway forbids browser identity headers", files.gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["062 gateway health states search persistence false", files.gateway.includes("discoverySearchPersistence: false")],
  ["063 responsive desktop-to-tablet layout exists", files.css.includes("@media (max-width: 1100px)")],
  ["064 responsive mobile layout exists", files.css.includes("@media (max-width: 680px)")],
  ["065 visible keyboard focus exists", files.css.includes(":focus-visible")],
  ["066 reduced motion is respected", files.css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "discover+test",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-02T22:30:00Z",
      correlationId,
      evidenceFreshness: "ACTIVE_LISTING_DISCOVERY_ONLY",
      limitations: ["Decision support only."]
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const discoverCandidate = {
  rank: 1,
  discoveryScore: 92,
  discoveryLabel: "BEST_CONNECTED_CANDIDATE",
  eligibleForBestConnectedCandidate: true,
  evidenceSupportedBargain: true,
  pricePosition: "12.5% below trusted exact median",
  nextAction: "Evaluate with Smart Opportunity before acting.",
  issues: [],
  providerId: "EBAY_BROWSE",
  providerDisplayName: "eBay Browse",
  sourceMode: "AUTHORIZED_API",
  marketplace: "EBAY",
  externalListingId: "1234567890",
  cardIdentityQuery: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  listingUrl: "https://www.ebay.com/itm/1234567890",
  imageUrl: "https://i.ebayimg.com/card.jpg",
  itemPriceCents: 50000,
  shippingCents: 2500,
  buyerPremiumCents: 0,
  taxCents: 0,
  allInAskCents: 52500,
  allInCostComplete: true,
  seller: "seller-one",
  sellerFeedbackScore: 10000,
  condition: "PSA 10",
  listingFormat: "FIXED_PRICE",
  matchQuality: "EXACT_MATCH",
  retrievedAt: "2026-08-02T22:30:00Z",
  listingAvailability: "AVAILABLE",
  listingFreshness: "CURRENT",
  rankEligible: true,
  evidence: {
    supported: true,
    trustedExactCompletedSaleCount: 3,
    trustedEvidenceValueCents: 60000,
    calibratedConfidence: 88,
    risk: 22,
    identityStatus: "CONFIRMED",
    evidenceQualityStatus: "STRONG"
  },
  evaluationEligible: true,
  evaluationRequest: {
    externalListingId: "1234567890",
    marketplace: "EBAY",
    cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    listingUrl: "https://www.ebay.com/itm/1234567890",
    seller: "seller-one",
    itemPriceCents: 50000,
    shippingCents: 2500,
    buyerPremiumCents: 0,
    taxCents: 0,
    listingFormat: "FIXED_PRICE"
  },
  activeListingOnly: true,
  completedSaleEvidence: false,
  transactionAuthority: false
};

function makeMain() {
  const handlers = new Map();
  const form = {
    values: {
      exactCardQuery: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
      targetMaxBuy: "525.00",
      limit: "25"
    },
    addEventListener(type, handler) { handlers.set(`form:${type}`, handler); }
  };
  const evaluateButton = {
    dataset: { discoveryEvaluate: "0" },
    addEventListener(type, handler) { handlers.set(`evaluate:${type}`, handler); }
  };
  return {
    innerHTML: "",
    querySelector(selector) {
      if (selector === "[data-customer-discovery-form]" && this.innerHTML.includes("data-customer-discovery-form")) return form;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-discovery-evaluate]" && this.innerHTML.includes("data-discovery-evaluate")) return [evaluateButton];
      return [];
    },
    submit() {
      const handler = handlers.get("form:submit");
      if (!handler) throw new Error("Search submit handler was not bound.");
      handler({ preventDefault() {} });
    },
    evaluate() {
      const handler = handlers.get("evaluate:click");
      if (!handler) throw new Error("Evaluate handler was not bound.");
      handler({ preventDefault() {} });
    },
    handlers,
    form
  };
}

class FakeFormData {
  constructor(form) { this.values = form.values || {}; }
  get(name) { return Object.prototype.hasOwnProperty.call(this.values, name) ? this.values[name] : null; }
}

function runtime({ hostname = "deploy-preview-38--goflipforge.netlify.app", healthStatus = "configured", invalidDiscover = false } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, hash: "#/discover" },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    }
    if (url === "/api/v1/discover") {
      const data = {
        kind: invalidDiscover ? "second-engine-discover" : "discover",
        readOnly: true,
        query: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
        targetMaxBuyCents: 52500,
        requestedLimit: 25,
        provider: { id: "EBAY_BROWSE", name: "eBay Browse", automated: true, available: true, status: "Connected", customerCanConfigureProvider: false, providerCredentialsExposed: false },
        candidateCount: 1,
        evidenceSupportedCount: 1,
        evidenceSupportedBestAvailable: true,
        coverageSummary: "Best candidate found across currently connected sources.",
        items: [discoverCandidate],
        discoveryPersisted: false,
        evaluationRequiredToSave: true,
        activeListingsAreCompletedSaleEvidence: false,
        transactionAuthority: false,
        tenantOwnedPersistenceCreated: false,
        tenantOwnershipCreatedOnlyByEvaluation: true,
        tenantIsolation: { enforced: true, defaultAccess: "DENY", tenantAuditKey: "redacted-test", visibleOpportunityCount: 0 }
      };
      return response(envelope(correlationId, data));
    }
    if (url === "/api/v1/evaluations") {
      const requestId = options.headers["Idempotency-Key"];
      return response(envelope(correlationId, {
        kind: "evaluation",
        requestId,
        opportunityId: "EBAY-1234567890",
        persistedToSqlite: true,
        tenantOwned: true,
        requestCanVerifyEvidence: false,
        requestCanVerifyIdentity: false,
        evidenceAcceptedByRequest: false,
        psaRecalculated: false,
        transactionAuthorized: false,
        providerCredentialsExposed: false,
        decision: { recommendation: "WATCH" },
        tenantIsolation: { enforced: true, idempotencyScope: "TENANT", opportunityOwnership: "GRANTED_ON_COMPLETION", defaultAccess: "DENY" }
      }));
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, BigInt, RegExp, Promise, Set, Map, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, JSON, FormData: FakeFormData, URL });
  vm.runInContext(files.adapter, context, { filename: "customer-discovery.js" });
  return { window, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 90));

const live = runtime();
const main = makeMain();
const rendered = await live.window.FlipForgeCustomerDiscovery.render(main);
await settle();
check("067 Discover renders on deploy preview", rendered === true);
check("068 Discover checks gateway health first", live.calls.length === 1 && live.calls[0].url === "/api/v1/health");
check("069 search form renders after health", main.innerHTML.includes("Search connected active listings") && main.handlers.has("form:submit"));
main.submit();
await settle();
check("070 search uses Discover POST", live.calls.some(call => call.url === "/api/v1/discover" && call.options.method === "POST"));
const searchCall = live.calls.find(call => call.url === "/api/v1/discover");
const searchBody = JSON.parse(searchCall.options.body);
check("071 search body carries exact identity", searchBody.exactCardQuery.includes("Ohtani"));
check("072 search body carries bounded limit", searchBody.limit === 25);
check("073 search body carries integer target cents", searchBody.targetMaxBuyCents === 52500);
check("074 search sends no idempotency key", !Object.prototype.hasOwnProperty.call(searchCall.options.headers, "Idempotency-Key"));
check("075 results render Discovery score", main.innerHTML.includes("Discovery score") && main.innerHTML.includes("92"));
check("076 results disclose connected-source scope", main.innerHTML.includes("best across currently connected sources"));
check("077 result discloses active listing not sold comp", main.innerHTML.includes("not a sold comp"));
check("078 explicit Evaluate action is bound", main.handlers.has("evaluate:click"));
main.evaluate();
await settle();
const evaluationCall = live.calls.find(call => call.url === "/api/v1/evaluations");
check("079 explicit action submits evaluation POST", Boolean(evaluationCall) && evaluationCall.options.method === "POST");
check("080 evaluation carries idempotency key", SAFE_KEY(evaluationCall?.options?.headers?.["Idempotency-Key"]));
const evaluationBody = JSON.parse(evaluationCall.options.body);
check("081 evaluation handoff preserves listing identity", evaluationBody.externalListingId === "1234567890" && evaluationBody.marketplace === "EBAY");
check("082 evaluation handoff preserves exact card identity", evaluationBody.cardIdentity.includes("Ohtani"));
check("083 evaluation handoff preserves all-in components", evaluationBody.itemPriceCents === 50000 && evaluationBody.shippingCents === 2500);
check("084 evaluation handoff contains no recommendation", !Object.prototype.hasOwnProperty.call(evaluationBody, "recommendation"));
check("085 evaluation handoff contains no tenant", !Object.keys(evaluationBody).some(key => /tenant/i.test(key)));
check("086 evaluation handoff contains no evidence override", !Object.keys(evaluationBody).some(key => /accepted|evidence/i.test(key)));
check("087 successful evaluation navigates to saved opportunity", live.window.location.hash === "#/opportunities/EBAY-1234567890");

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = makeMain();
await disabled.window.FlipForgeCustomerDiscovery.render(disabledMain);
await settle();
check("088 disabled bridge makes health request only", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("089 disabled bridge renders honest offline state", disabledMain.innerHTML.includes("safely offline") && disabledMain.innerHTML.includes("no sample results"));

const invalid = runtime({ invalidDiscover: true });
const invalidMain = makeMain();
await invalid.window.FlipForgeCustomerDiscovery.render(invalidMain);
await settle();
invalidMain.submit();
await settle();
check("090 invalid Discover contract fails closed", invalidMain.innerHTML.includes("DISCOVER_CONTRACT_INVALID"));
check("091 invalid contract exposes no Evaluate result action", !invalidMain.innerHTML.includes("data-discovery-evaluate"));

const production = runtime({ hostname: "goflipforge.com" });
const productionMain = makeMain();
const productionRendered = await production.window.FlipForgeCustomerDiscovery.render(productionMain);
check("092 production refuses discovery adapter", productionRendered === false && production.calls.length === 0);

function SAFE_KEY(value) {
  return /^[A-Za-z0-9._-]{8,100}$/.test(String(value || ""));
}

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerDiscoveryValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
