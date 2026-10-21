// Rollback read isolation: the website gateway never hands the browser an individual provider sale's price, date,
// link, title or row id, or the provider's name, whichever backend build answers. Fixtures mirror the pre-containment
// read paths listed in the FlipForge2 compliance document on rollback read isolation (docs/compliance/), section 2.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filter = require(path.join(root, "netlify/functions/provider-disclosure-filter.js"));

const results = [];
const check = (name, condition, detail = "") => results.push({ name, passed: Boolean(condition), detail });

const OLD_COMMIT = "c0d71fc917d17af66f83483bb4b3b2e568ed6272";
const NEW_COMMIT = "21971d380985116177e073ef7a4efafb7832e048";

function envelope(correlationId, commit, data, limitations = [], guard = null) {
  return {
    meta: {
      ...(guard ? { evidenceStorageGuard: guard, providerEvidenceMode: "PROVIDER_SALES_OFF" } : {}),
      contractVersion: "1.0",
      engineVersion: "gateway-disclosure-validation",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-10-19T15:00:00Z",
      correlationId,
      runtimeBuildCommit: commit,
      limitations
    },
    data
  };
}

const independentRow = {
  id: "ledger-ind-1", recordedAt: "2026-10-01T00:00:00Z", type: "COMPLETED_SALE", sourceName: "LICENSED_DEALER_CSV",
  sourceUrl: "https://dealer.example.invalid/sale/1", amount: 120.5, soldAt: "2026-09-30", accepted: true
};
const providerRow = {
  id: "ledger-cs-7", recordedAt: "2026-09-12T00:00:00Z", type: "COMPLETED_SALE", sourceName: "CARDSIGHT_EBAY",
  sourceUrl: "https://www.ebay.com/itm/123456789", amount: 98.0, soldAt: "2026-09-10", accepted: true,
  rejectionReason: "Accepted governed CardSight completed sale"
};

const fixtures = {
  "/api/v1/evidence/opp-1": () => ({
    linkedEvidence: [providerRow, independentRow],
    manualCandidates: [{
      id: "cand-cs-1", sourceMarketplace: "CARDSIGHT", sourceUrl: "https://www.ebay.com/itm/987", saleTitle: "2020 Prizm",
      salePrice: 77, saleDate: "2026-09-01"
    }],
    timeline: [{ referenceId: "ledger-cs-7", label: "Sale linked" }, { referenceId: "ledger-ind-1", label: "Sale linked" }],
    liveCardSightEvidence: { sales: [{ price: 1, soldAt: "2026-10-18" }] },
    decisionTime: { supportedValue: 98 }
  }),
  "/api/v1/dashboard": () => ({
    opportunities: [{
      id: "opp-1",
      statusMessage: "Accepted governed CardSight completed-sale evidence supports this decision.",
      evidence: {
        acceptedSales: 1, averagePrice: 98, priceStatus: "VERIFIED", earliestSaleDate: "2026-09-10",
        latestSaleDate: "2026-09-10", marketplaces: ["CARDSIGHT_EBAY"], priceIndependentlyVerified: false
      }
    }]
  }),
  "/api/v1/portfolio": () => ({
    items: [{
      id: "pos-1",
      referenceValue: {
        available: true, valueCents: 9800, acceptedExactCompletedSales: 1, earliestSaleDate: "2026-09-10",
        latestSaleDate: "2026-09-10", marketplaces: ["CARDSIGHT"], sourceLineageSha256: "abc",
        supportingSourceUrls: ["https://www.ebay.com/itm/123456789"]
      },
      referencePerformance: { referenceValueCents: 9800 }
    }]
  }),
  "/api/v1/lifecycle/opp-1": () => ({
    decisionChangeIntelligence: {
      outcomeReconciliation: {
        checkpoints: [{
          day: 7, observedSupportedValueCents: 10100, supportedValueChangePercent: 3.06,
          provenance: {
            windowSaleCount: 1, windowSourceUrls: ["https://www.ebay.com/itm/555"],
            supportingSourceUrls: ["https://www.ebay.com/itm/556"], earliestSaleDate: "2026-09-20",
            latestSaleDate: "2026-09-20", sourceLineageSha256: "def"
          }
        }]
      }
    }
  }),
  "/api/v1/opportunities/opp-1": () => ({
    opportunity: {
      id: "opp-1", sourceUrl: "https://www.ebay.com/itm/listing-being-evaluated",
      evidence: { acceptedSales: 2, averagePrice: 101, marketplaces: ["CARDSIGHT_EBAY"] },
      valueIntelligence: { analogCompletedSaleCount: 1, referenceLowCents: 9800, referenceMidpointCents: 9800, referenceHighCents: 9800 }
    }
  }),
  "/api/v1/discover": () => ({
    soldEvidenceRefresh: { provider: "CARDSIGHT", message: "CardSight historical pricing is not connected." },
    items: [{
      listingUrl: "https://www.ebay.com/itm/active-1", itemPriceCents: 9000,
      evidence: { trustedExactCompletedSaleCount: 1, trustedEvidenceValueCents: 9800 }
    }]
  }),
  "/api/v1/evaluations": () => ({
    semanticReplay: true,
    decision: { recommendation: "BUY", exactTrustedCompCount: 1, supportedValueCents: 9800 },
    profitability: { maximumBuyPriceCents: 8100, expectedNetProfitCents: 900, exactTrustedCompCount: 1 },
    evidenceEnrichment: {
      provider: "CARDSIGHT", message: "CardSight historical pricing is not connected.",
      ledgerProjectionMessage: "0 governed CardSight completed sale(s) projected; status CARDSIGHT_SUSPENDED_V1."
    }
  })
};

const limitations = ["CardSight sale evidence is governed.", "Status CARDSIGHT_SUSPENDED_V1 applies."];

// ---------------------------------------------------------------------------------------------------------------
// Unit: pure filter
// ---------------------------------------------------------------------------------------------------------------
for (const strict of [true, false]) {
  for (const [route, data] of Object.entries(fixtures)) {
    const result = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, data(), limitations), { path: route, strict });
    if (strict && (route === "/api/v1/portfolio" || route.startsWith("/api/v1/evidence/"))) {
      check(`strict ${route}: withheld entirely`, result.ok === false && result.withheld === true);
      continue;
    }
    check(`${strict ? "strict" : "standard"} ${route}: filter accepts envelope`, result.ok);
    const leaks = filter.violations(result.payload);
    check(`${strict ? "strict" : "standard"} ${route}: no provider sale field or name remains`, leaks.length === 0, leaks.join("; "));
  }
}

{
  const out = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/evidence/opp-1"]()),
    { path: "/api/v1/evidence/opp-1", strict: false }).payload.data;
  check("evidence: provider ledger row dropped", out.linkedEvidence.length === 1 && out.linkedEvidence[0].id === "ledger-ind-1");
  check("evidence: independent row keeps price, date and link", out.linkedEvidence[0].amount === 120.5 &&
    out.linkedEvidence[0].soldAt === "2026-09-30" && out.linkedEvidence[0].sourceUrl.startsWith("https://dealer."));
  check("evidence: provider manual candidate dropped", out.manualCandidates.length === 0);
  check("evidence: live provider block dropped", !Object.keys(out).some(k => /live.*(card.?sight|provider)/i.test(k)));
  check("evidence: timeline reference to dropped row nulled", out.timeline[0].referenceId === null &&
    out.timeline[1].referenceId === "ledger-ind-1");
  check("evidence: withheld flag set", out.providerRowsWithheld === true);
}

{
  const strictOut = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/dashboard"]()),
    { path: "/api/v1/dashboard", strict: true }).payload.data.opportunities[0];
  check("dashboard strict: opportunity id preserved", strictOut.id === "opp-1");
  check("dashboard strict: single-sale average withheld", strictOut.evidence.averagePrice === null);
  check("dashboard strict: sale dates withheld", strictOut.evidence.earliestSaleDate === null && strictOut.evidence.latestSaleDate === null);
  check("dashboard strict: accepted count kept", strictOut.evidence.acceptedSales === 1);
  check("dashboard: status message neutral", !/card\s*sight/i.test(strictOut.statusMessage) && /data provider/i.test(strictOut.statusMessage));

  const standardOut = filter.filterBackendPayload(envelope("cid", NEW_COMMIT, fixtures["/api/v1/dashboard"]()),
    { path: "/api/v1/dashboard", strict: false }).payload.data.opportunities[0];
  check("dashboard standard: numbers not altered", standardOut.evidence.averagePrice === 98);
  check("dashboard standard: marketplace label neutral", standardOut.evidence.marketplaces[0] === "Reported completed sale (data provider)");
}

{
  const p = filter.filterBackendPayload(envelope("cid", NEW_COMMIT, fixtures["/api/v1/portfolio"]()),
    { path: "/api/v1/portfolio", strict: false }).payload.data.items[0];
  check("portfolio: sale links removed", !("supportingSourceUrls" in p.referenceValue));
  check("portfolio: lineage sale dates removed", !("earliestSaleDate" in p.referenceValue) && !("latestSaleDate" in p.referenceValue));
  check("portfolio: marketplace list kept as an array (UI contract)", Array.isArray(p.referenceValue.marketplaces));
}

{
  const c = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/lifecycle/opp-1"]()),
    { path: "/api/v1/lifecycle/opp-1", strict: true }).payload.data.decisionChangeIntelligence.outcomeReconciliation.checkpoints[0];
  check("lifecycle: window and supporting sale links removed", !("windowSourceUrls" in c.provenance) && !("supportingSourceUrls" in c.provenance));
  check("lifecycle strict: one-sale checkpoint value withheld", c.observedSupportedValueCents === null);
  check("lifecycle strict: one-sale change percent withheld", c.supportedValueChangePercent === null);
  check("lifecycle: window count kept", c.provenance.windowSaleCount === 1);
}

{
  const o = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/opportunities/opp-1"]()),
    { path: "/api/v1/opportunities/opp-1", strict: true }).payload.data.opportunity;
  check("opportunity: evaluated listing link kept (not a sale)", o.sourceUrl === "https://www.ebay.com/itm/listing-being-evaluated");
  check("opportunity strict: one-analog reference withheld", o.valueIntelligence.referenceLowCents === null &&
    o.valueIntelligence.referenceHighCents === null);
}

{
  const d = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/discover"]()),
    { path: "/api/v1/discover", strict: true }).payload.data;
  check("discover: active listing kept", d.items[0].listingUrl === "https://www.ebay.com/itm/active-1" && d.items[0].itemPriceCents === 9000);
  check("discover strict: one-sale trusted value withheld", d.items[0].evidence.trustedEvidenceValueCents === null);
  check("discover: provider code neutral", d.soldEvidenceRefresh.provider === "DATA_PROVIDER");
}

{
  const already = filter.filterBackendPayload(envelope("cid", NEW_COMMIT, fixtures["/api/v1/dashboard"]()),
    { path: "/api/v1/dashboard", strict: false }).payload;
  const twice = filter.filterBackendPayload(already, { path: "/api/v1/dashboard", strict: false }).payload;
  check("filter is idempotent on sanitized payloads", JSON.stringify(twice.data) === JSON.stringify(already.data));
  check("meta names the gateway filter", twice.meta.gatewayDisclosureFilter === filter.VERSION);
  check("limitations neutral", twice.meta.limitations === undefined || twice.meta.limitations.every(l => !/card\s*sight/i.test(l)));
}

{
  const strictEval = filter.filterBackendPayload(envelope("cid", OLD_COMMIT, fixtures["/api/v1/evaluations"]()),
    { path: "/api/v1/evaluations", strict: true }).payload.data;
  check("evaluation strict: a replayed one-sale decision's value and Max Buy are withheld",
    strictEval.decision.supportedValueCents === null && strictEval.profitability.maximumBuyPriceCents === null &&
    strictEval.decision.recommendation === "BUY" && strictEval.decision.saleDetailsWithheld === true);
  const standardEval = filter.filterBackendPayload(envelope("cid", NEW_COMMIT, fixtures["/api/v1/evaluations"]()),
    { path: "/api/v1/evaluations", strict: false }).payload.data;
  check("evaluation standard: values from a guard-aware build are not altered", standardEval.decision.supportedValueCents === 9800);
}

check("non-object body fails closed", filter.filterBackendPayload([1, 2]).ok === false &&
  filter.filterBackendPayload(null).ok === false && filter.filterBackendPayload("x").ok === false);
check("meta without guard fields is not containment-aware", filter.containmentAwareMeta({ runtimeBuildCommit: OLD_COMMIT }) === false);
check("meta with failed guard is not containment-aware", filter.containmentAwareMeta({
  evidenceStorageGuard: "FAILED: not a database", providerEvidenceMode: "PROVIDER_SALES_OFF" }) === false);
check("meta with verified guard but no mode is not containment-aware", filter.containmentAwareMeta({ evidenceStorageGuard: "VERIFIED" }) === false);
check("meta with verified guard is containment-aware", filter.containmentAwareMeta({
  evidenceStorageGuard: "VERIFIED", providerEvidenceMode: "PROVIDER_SALES_OFF" }) === true);
check("missing meta is not containment-aware", filter.containmentAwareMeta(undefined) === false);

// ---------------------------------------------------------------------------------------------------------------
// Integration: the real gateway handler, upstream mocked
// ---------------------------------------------------------------------------------------------------------------
const envNames = ["CONTEXT", "FLIPFORGE_API_BRIDGE_ENABLED", "FLIPFORGE_API_BASE_URL", "FLIPFORGE_API_SERVICE_TOKEN",
  "FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW", "FLIPFORGE_API_PREVIEW_TENANT_ID", "FLIPFORGE_API_ALLOWED_ORIGINS"];
const savedEnv = Object.fromEntries(envNames.map(n => [n, process.env[n]]));
const savedFetch = globalThis.fetch;
const savedConsole = { info: console.info, warn: console.warn, error: console.error };
console.info = console.warn = console.error = () => {};

process.env.CONTEXT = "deploy-preview";
process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
process.env.FLIPFORGE_API_BASE_URL = "https://backend.example.invalid";
process.env.FLIPFORGE_API_SERVICE_TOKEN = "validation-service-token-not-a-secret-000000";
process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";

function headerOf(init, name) {
  const headers = init && init.headers ? init.headers : {};
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : "";
}

function jsonFetchResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name.toLowerCase() === "content-length" ? String(Buffer.byteLength(text)) : null) },
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    text: async () => text
  };
}

function installUpstream({ servingCommit, guard }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push(u.pathname);
    const correlationId = headerOf(init, "X-Correlation-Id");
    const fixture = fixtures[u.pathname];
    return jsonFetchResponse(envelope(correlationId, servingCommit, fixture ? fixture() : {}, limitations, guard));
  };
  return calls;
}

function gatewayEvent(method, pathName) {
  return {
    httpMethod: method,
    path: pathName,
    headers: { host: "deploy-preview-517--goflipforge.netlify.app", "idempotency-key": "validation-key-0001" },
    multiValueHeaders: {},
    queryStringParameters: {},
    rawQuery: "",
    body: method === "POST" ? JSON.stringify({ query: "validation" }) : ""
  };
}

async function freshHandler() {
  const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
  delete require.cache[require.resolve(gatewayPath)];
  return require(gatewayPath).handler;
}

const scenarios = [
  { name: "old build (no guard marker)", servingCommit: OLD_COMMIT, guard: null, expectStrict: true },
  { name: "guard-aware build, guard verified", servingCommit: NEW_COMMIT, guard: "VERIFIED", expectStrict: false },
  { name: "guard-aware build, guard failed", servingCommit: NEW_COMMIT, guard: "FAILED: not a database", expectStrict: true }
];

try {
  for (const scenario of scenarios) {
    const handler = await freshHandler();
    const calls = installUpstream(scenario);
    for (const route of Object.keys(fixtures)) {
      const method = route === "/api/v1/discover" || route === "/api/v1/evaluations" ? "POST" : "GET";
      const response = await handler(gatewayEvent(method, route), {});
      const body = JSON.parse(response.body || "{}");
      const withheldRoute = scenario.expectStrict && (route === "/api/v1/portfolio" || route.startsWith("/api/v1/evidence/"));
      check(`gateway [${scenario.name}] ${route}: ${withheldRoute ? "503 withheld" : "200"}`,
        response.statusCode === (withheldRoute ? 503 : 200), `status ${response.statusCode} ${response.body && response.body.slice(0, 200)}`);
      const leaks = filter.violations(body);
      check(`gateway [${scenario.name}] ${route}: no provider sale field or name`, leaks.length === 0, leaks.join("; "));
      if (withheldRoute) {
        check(`gateway [${scenario.name}] ${route}: withheld body carries no value`, !/9800|valueCents|ebay\.com|dealer\./.test(response.body) &&
          body.error && body.error.code === "TEMPORARILY_UNAVAILABLE");
      } else {
        check(`gateway [${scenario.name}] ${route}: mode ${scenario.expectStrict ? "strict" : "standard"}`,
          body.meta && body.meta.gatewayDisclosureMode === (scenario.expectStrict ? "STRICT_PRE_CONTAINMENT" : "STANDARD"));
      }
      check(`gateway [${scenario.name}] ${route}: exactly one upstream call`, calls.length === 1, calls.join(","));
      calls.length = 0;
      check(`gateway [${scenario.name}] ${route}: no raw sale link in body`,
        !/ebay\.com\/itm\/(123456789|987|555|556)/.test(response.body));
    }
  }

  // A rollback between two requests on one warm function instance: the old build's very first response is strict.
  {
    const handler = await freshHandler();
    installUpstream({ servingCommit: NEW_COMMIT, guard: "VERIFIED" });
    const first = JSON.parse((await handler(gatewayEvent("GET", "/api/v1/dashboard"), {})).body);
    installUpstream({ servingCommit: OLD_COMMIT, guard: null });
    const second = JSON.parse((await handler(gatewayEvent("GET", "/api/v1/dashboard"), {})).body);
    check("rollback between requests: guard-aware response standard", first.meta.gatewayDisclosureMode === "STANDARD");
    check("rollback between requests: old build's first response strict", second.meta.gatewayDisclosureMode === "STRICT_PRE_CONTAINMENT" &&
      second.data.opportunities[0].evidence.averagePrice === null);
  }
} finally {
  globalThis.fetch = savedFetch;
  Object.assign(console, savedConsole);
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
}

const failed = results.filter(r => !r.passed);
for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"} ${r.name}${!r.passed && r.detail ? ` :: ${r.detail}` : ""}`);
console.log(`\nGateway provider disclosure: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exit(1);
