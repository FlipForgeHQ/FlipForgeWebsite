import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");

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
      title: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 9",
      cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 9",
      platform: "EBAY",
      recommendation: "PASS",
      workflowStatus: "PASS",
      ask: 3999.99,
      supportedValue: 3500,
      confidence: 80,
      liquidity: 70,
      risk: 35,
      rank: 40,
      evidenceCount: 6,
      observedAt: "2026-08-25T00:00:00Z",
      mappingState: "NOT_CONFIRMED",
      evidence: { acceptedSales: 6, averagePrice: 3500, latestSaleDate: "2026-08-24" },
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

const checks = [
  ["detail render starts", started === true],
  ["exactly three direct reads", calls.length === 3],
  ["no health preflight", !calls.includes("/api/v1/health")],
  ["no dashboard preflight", !calls.includes("/api/v1/dashboard")],
  ["no saved-list preflight", !calls.includes("/api/v1/opportunities")],
  ["decision renders", main.innerHTML.includes(">PASS<")],
  ["supported value renders", main.innerHTML.includes("Supported value")],
  ["loading state clears", !main.innerHTML.includes("Loading card intelligence…")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
