import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");
const routeHookSource = fs.readFileSync(new URL("../saas-prototype/staging-route-hook.js", import.meta.url), "utf8");

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-smart-opportunity",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-25T00:00:00Z",
      correlationId
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const calls = [];
let uuid = 0;
const window = {
  location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/opportunities/EBAY-live-001" },
  crypto: { randomUUID: () => `detail-fast-${++uuid}` }
};

const fetchImpl = async (url, options) => {
  calls.push(url);
  const correlationId = options.headers["X-Correlation-Id"];
  if (url === "/api/v1/opportunities/EBAY-live-001") return response(envelope(correlationId, {
    kind: "opportunity-detail",
    opportunity: {
      id: "EBAY-live-001",
      title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
      cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
      platform: "EBAY",
      recommendation: "PASS",
      workflowStatus: "PASS",
      ask: 904.98,
      supportedValue: 855,
      confidence: 83,
      liquidity: 70,
      risk: 35,
      rank: 40,
      evidenceCount: 6,
      observedAt: "2026-08-25T00:00:00Z",
      mappingState: "CONFIRMED",
      evidence: { acceptedSales: 6, averagePrice: 855, latestSaleDate: "2026-08-24" },
      authorityBoundary: "Smart Opportunity remains authoritative."
    }
  }));
  if (url === "/api/v1/evidence/EBAY-live-001") return response(envelope(correlationId, {
    kind: "evidence",
    opportunityId: "EBAY-live-001",
    acceptedExactCompletedSales: 6,
    visibleButAuthorityIneligible: 2,
    linkedEvidence: []
  }));
  if (url === "/api/v1/psa-advisor/EBAY-live-001") return response(envelope(correlationId, {
    kind: "psa-advisor",
    opportunityId: "EBAY-live-001",
    guidanceStatus: "INSUFFICIENT_SAVED_CONTEXT",
    savedPsaSnapshot: null,
    populationContext: { psa10Population: 0, psa9Population: 0 },
    recalculated: false
  }));
  throw new Error(`Unexpected preflight request: ${url}`);
};

const context = vm.createContext({
  window,
  fetch: fetchImpl,
  Response,
  URL,
  Intl,
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Promise,
  Set,
  console,
  setTimeout,
  clearTimeout,
  encodeURIComponent,
  decodeURIComponent
});

vm.runInContext(source, context, { filename: "customer-opportunities.js" });
const main = { innerHTML: "", querySelectorAll() { return []; } };
const started = window.FlipForgeCustomerOpportunities.render(main, "EBAY-live-001");
await new Promise(resolve => setTimeout(resolve, 40));

const routeRenderCalls = [];
const routeMain = {
  innerHTML: "prototype fallback must not survive",
  focus() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const routeWindow = {
  location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/opportunities/EBAY-live-001" },
  FlipForgeCustomerOpportunities: {
    isEligible: () => true,
    render(target, id) {
      routeRenderCalls.push({ target, id });
      target.innerHTML = `authoritative:${id}`;
      return true;
    }
  },
  addEventListener() {},
  scrollTo() {}
};
const routeDocument = {
  querySelector(selector) {
    if (selector === "#main-content") return routeMain;
    return null;
  },
  createElement() {
    return {};
  }
};
const routeContext = vm.createContext({
  window: routeWindow,
  document: routeDocument,
  console,
  queueMicrotask(callback) { callback(); }
});
vm.runInContext(routeHookSource, routeContext, { filename: "staging-route-hook.js" });

const checks = [
  ["detail render starts", started === true],
  ["exactly three direct reads", calls.length === 3],
  ["no health preflight", !calls.includes("/api/v1/health")],
  ["no dashboard preflight", !calls.includes("/api/v1/dashboard")],
  ["no saved-list preflight", !calls.includes("/api/v1/opportunities")],
  ["decision renders", main.innerHTML.includes(">PASS<")],
  ["supported value renders", main.innerHTML.includes("Supported value")],
  ["loading state clears", !main.innerHTML.includes("Loading card intelligence…")],
  ["production Opportunities route starts without staging read adapter", routeRenderCalls.length === 1],
  ["production Opportunities route preserves authoritative opportunity id", routeRenderCalls[0]?.id === "EBAY-live-001"],
  ["production Opportunities route replaces prototype fallback", routeMain.innerHTML === "authoritative:EBAY-live-001"]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
