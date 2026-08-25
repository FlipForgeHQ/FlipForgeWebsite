import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../saas-prototype/customer-opportunities-bridge.js", import.meta.url), "utf8");
const opportunityId = "EBAY-ext-recovery-001";
const calls = [];
let originalRenderCalls = 0;
let uuid = 0;

function envelope(correlationId, data) {
  return { meta: { contractVersion: "1.0", engineVersion: "test-smart-opportunity", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId }, data };
}

const main = {
  _html: "",
  textContent: "",
  set innerHTML(value) { this._html = String(value); this.textContent = this._html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); },
  get innerHTML() { return this._html; },
  querySelector() { return { addEventListener() {} }; }
};

const customerAdapter = {
  isEligible: () => true,
  render(target, id) { originalRenderCalls += 1; target.innerHTML = `<div>Loading card intelligence… ${id}</div>`; return true; }
};
const stagingAdapter = { isEligible: () => true, render: () => true, reset() {} };
const window = {
  location: { hash: `#/opportunities/${opportunityId}` },
  crypto: { randomUUID: () => `recovery-${++uuid}` },
  FlipForgeStagingReadAdapter: stagingAdapter,
  FlipForgeCustomerOpportunities: customerAdapter
};

const fetchImpl = async (url, options) => {
  calls.push(url);
  const correlationId = options.headers["X-Correlation-Id"];
  if (url !== `/api/v1/opportunities/${opportunityId}`) throw new Error(`Unexpected recovery request: ${url}`);
  return new Response(JSON.stringify(envelope(correlationId, {
    kind: "opportunity-detail",
    opportunity: {
      id: opportunityId,
      title: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 9",
      cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 Refractor PSA 9",
      platform: "EBAY",
      recommendation: "PASS",
      ask: 3999.99,
      supportedValue: 3500,
      confidence: 80,
      liquidity: 70,
      risk: 35,
      rank: 40,
      observedAt: "2026-08-25T00:00:00Z",
      mappingState: "NOT_CONFIRMED",
      evidence: { acceptedSales: 6 }
    }
  })), { status: 200, headers: { "content-type": "application/json" } });
};

const fastTimeout = (fn, ms) => setTimeout(fn, ms >= 7000 ? 50 : 0);
const context = vm.createContext({ window, fetch: fetchImpl, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, console, encodeURIComponent, decodeURIComponent, setTimeout: fastTimeout });
vm.runInContext(source, context, { filename: "customer-opportunities-bridge.js" });
const started = window.FlipForgeStagingReadAdapter.renderCustomer(main, opportunityId);
await new Promise(resolve => setTimeout(resolve, 30));

const checks = [
  ["normal customer renderer starts first", started === true && originalRenderCalls === 1],
  ["recovery performs one direct saved-detail read", calls.length === 1 && calls[0] === `/api/v1/opportunities/${opportunityId}`],
  ["recovery does not block on Evidence or PSA", !calls.some(url => url.includes("/evidence/") || url.includes("/psa-advisor/"))],
  ["loading state is replaced", !main.textContent.includes("Loading card intelligence")],
  ["authoritative decision renders", main.innerHTML.includes(">PASS<")],
  ["saved identity renders", main.innerHTML.includes("Ohtani #150 Refractor PSA 9")],
  ["supported value renders", main.innerHTML.includes("$3,500")],
  ["no execution authority is introduced", main.innerHTML.includes("Execution authority") && main.innerHTML.includes("None")]
];

let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} | ${name}`); if (!ok) failed += 1; }
if (failed) process.exit(1);