import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../saas-prototype/customer-opportunities.js", import.meta.url), "utf8");
const bridgeSource = fs.readFileSync(new URL("../saas-prototype/customer-opportunities-bridge.js", import.meta.url), "utf8");
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

function mainNode(initialHtml = "") {
  return {
    innerHTML: initialHtml,
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function makeRuntime({ route = false, initialHtml = "" } = {}) {
  const calls = [];
  let uuid = 0;
  const main = mainNode(initialHtml);
  const window = {
    location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/opportunities/EBAY-live-001" },
    crypto: { randomUUID: () => `detail-fast-${++uuid}` },
    addEventListener() {},
    scrollTo() {}
  };
  const document = {
    querySelector(selector) {
      if (selector === "#main-content") return main;
      return null;
    },
    createElement() {
      return { setAttribute() {}, prepend() {} };
    }
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
        rank: 79,
        evidenceCount: 43,
        observedAt: "2026-08-28T00:00:00Z",
        mappingState: "CONFIRMED",
        evidence: { acceptedSales: 43, averagePrice: 855, latestSaleDate: "2026-08-27" },
        authorityBoundary: "Smart Opportunity remains authoritative."
      }
    }));
    if (url === "/api/v1/evidence/EBAY-live-001") return response(envelope(correlationId, {
      kind: "evidence",
      opportunityId: "EBAY-live-001",
      acceptedExactCompletedSales: 43,
      visibleButAuthorityIneligible: 0,
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
    document,
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
    queueMicrotask,
    encodeURIComponent,
    decodeURIComponent
  });

  vm.runInContext(source, context, { filename: "customer-opportunities.js" });
  if (route) vm.runInContext(routeHookSource, context, { filename: "staging-route-hook.js" });
  return { window, main, calls };
}

const direct = makeRuntime();
const started = direct.window.FlipForgeCustomerOpportunities.render(direct.main, "EBAY-live-001");
await new Promise(resolve => setTimeout(resolve, 40));

const checks = [
  ["detail render starts", started === true],
  ["exactly three direct reads", direct.calls.length === 3],
  ["no health preflight", !direct.calls.includes("/api/v1/health")],
  ["no dashboard preflight", !direct.calls.includes("/api/v1/dashboard")],
  ["no saved-list preflight", !direct.calls.includes("/api/v1/opportunities")],
  ["decision renders", direct.main.innerHTML.includes(">PASS<")],
  ["requested PSA 9 identity renders", direct.main.innerHTML.includes("2018 Topps Chrome Shohei Ohtani #150 PSA 9")],
  ["supported value renders", direct.main.innerHTML.includes("Supported value")],
  ["loading state clears", !direct.main.innerHTML.includes("Loading card intelligence…")],
  ["production bridge no longer requires staging adapter", !bridgeSource.includes("if (!stagingAdapter || !customerAdapter) return")],
  ["production bridge exports dedicated customer entrypoint", bridgeSource.includes("window.FlipForgeCustomerOpportunitiesBridge = customerBridge")],
  ["route hook prefers dedicated customer opportunity adapter", routeHookSource.includes("window.FlipForgeCustomerOpportunitiesBridge || window.FlipForgeCustomerOpportunities")],
  ["route hook does not route opportunities through staging adapter", !routeHookSource.includes("adapter.renderCustomer(main, id)")]
];

const routed = makeRuntime({ route: true, initialHtml: "PROTOTYPE_SENTINEL opp-ohtani-150 Ohtani Chrome Refractor PSA 10" });
await new Promise(resolve => setTimeout(resolve, 50));
checks.push(
  ["production route works with staging adapter absent", typeof routed.window.FlipForgeStagingReadAdapter === "undefined" && routed.calls.length === 3],
  ["production route requests the exact authoritative id", routed.calls[0] === "/api/v1/opportunities/EBAY-live-001"],
  ["production route replaces pre-existing prototype content", !routed.main.innerHTML.includes("PROTOTYPE_SENTINEL") && !routed.main.innerHTML.includes("opp-ohtani-150")],
  ["production route cannot leak unrelated prototype identity", !routed.main.innerHTML.includes("Ohtani Chrome Refractor PSA 10")],
  ["production route renders requested saved identity", routed.main.innerHTML.includes("2018 Topps Chrome Shohei Ohtani #150 PSA 9")],
  ["production route renders server recommendation", routed.main.innerHTML.includes(">PASS<")]
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
