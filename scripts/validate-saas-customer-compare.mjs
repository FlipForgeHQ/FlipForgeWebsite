import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const packageJson = JSON.parse(read("package.json"));
const netlify = read("netlify.toml");
const index = read("saas-prototype/index.html");
const adapter = read("saas-prototype/customer-compare.js");
const css = read("saas-prototype/customer-compare.css");
const hook = read("saas-prototype/staging-route-hook.js");
const guard = read("saas-prototype/route-guard.js");
const beta = read("saas-prototype/private-beta.js");
const betaDocs = read("docs/SAAS_PRIVATE_BETA_READINESS.md");
const docs = read("docs/SAAS_CUSTOMER_COMPARE.md");
const gateway = read("netlify/functions/flipforge-api.js");
const readAdapter = read("saas-prototype/staging-browser.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer Compare validator is registered", packageJson.scripts?.["validate:customer-compare"] === "node scripts/validate-saas-customer-compare.mjs"],
  ["002 Netlify build runs customer Compare validation", netlify.includes("npm run validate:customer-compare")],
  ["003 customer Compare adapter exists", exists("saas-prototype/customer-compare.js")],
  ["004 customer Compare styles exist", exists("saas-prototype/customer-compare.css")],
  ["005 customer Compare documentation exists", exists("docs/SAAS_CUSTOMER_COMPARE.md")],
  ["006 app loads customer Compare stylesheet", index.includes('href="customer-compare.css"')],
  ["007 app loads customer Compare adapter before route hook", index.indexOf('src="customer-compare.js"') > index.indexOf('src="staging-evaluation.js"') && index.indexOf('src="customer-compare.js"') < index.indexOf('src="staging-route-hook.js"')],
  ["008 deploy-preview route hook replaces mock Compare", hook.includes('route === "compare"') && hook.includes("compareAdapter.render(main")],
  ["009 production retains existing prototype Compare", hook.includes("compareAdapter.isEligible()")],
  ["010 Compare uses the private beta intelligence banner", hook.includes("showCustomerIntelligenceBanner()")],
  ["011 route hook parses query separately from route", hook.includes('split(/[/?]/)')],
  ["012 route guard exposes only one-time preferred selection", guard.includes("consumePendingLeftId") && guard.includes("pendingLeftId = null")],
  ["013 Compare adapter is deploy-preview constrained", adapter.includes("ALLOWED_HOST") && adapter.includes("eligibleHost()")],
  ["014 Compare adapter has an explicit safe ID rule", adapter.includes("SAFE_ID") && adapter.includes("INVALID_COMPARISON_SELECTION")],
  ["015 Compare requires two distinct IDs", adapter.includes("leftId === rightId") && adapter.includes("new Set(ids).size !== 2")],
  ["016 Compare request is same-origin", adapter.includes('credentials: "same-origin"')],
  ["017 Compare request disables cache", adapter.includes('cache: "no-store"')],
  ["018 Compare request refuses redirects", adapter.includes('redirect: "error"')],
  ["019 Compare request is GET-only", adapter.includes('method: "GET"') && !adapter.includes('method: "POST"')],
  ["020 Compare path is exact and allowlisted", adapter.includes('url.pathname !== "/api/v1/compare"') && adapter.includes('url.searchParams.getAll("ids").length !== 1')],
  ["021 response size is bounded", adapter.includes("MAX_RESPONSE_CHARACTERS") && adapter.includes("COMPARE_RESPONSE_TOO_LARGE")],
  ["022 invalid JSON fails closed", adapter.includes("COMPARE_INVALID_JSON")],
  ["023 authority envelope is required", ["Smart Opportunity", "Existing PSA intelligence", "COMPARE_CONTRACT_INVALID"].every(value => adapter.includes(value))],
  ["024 exact request correlation is required", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["025 tenant opportunities load before Compare", adapter.indexOf("OPPORTUNITIES_PATH") < adapter.indexOf("async function loadComparison")],
  ["026 Compare response kind is checked", adapter.includes('payload?.data?.kind !== "compare"')],
  ["027 Compare response count is checked", adapter.includes("payload?.data?.count !== 2")],
  ["028 returned IDs must match requested order", adapter.includes("returnedIds[0] !== state.leftId") && adapter.includes("returnedIds[1] !== state.rightId")],
  ["029 backend comparison boundary is required", adapter.includes('typeof payload?.data?.comparisonBoundary !== "string"')],
  ["030 no browser-side recommendation calculation exists", !/calculateRecommendation|recommendationScore|selectWinner|winnerClass/i.test(adapter)],
  ["031 no client-side sort or ranking exists", !/\.sort\s*\(|rerank\s*\(/i.test(adapter)],
  ["032 no browser persistence exists", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(adapter + guard)],
  ["033 no trusted identity header exists", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["034 no service token exists in browser adapter", !/FLIPFORGE_API_SERVICE_TOKEN/.test(adapter)],
  ["035 disabled bridge is safely offline", adapter.includes("Direct Comparison is safely offline") && adapter.includes("no mock comparison was substituted")],
  ["036 authentication failure offers secure sign-in", adapter.includes("Sign in securely") && adapter.includes("status === 401")],
  ["037 membership failure remains explicit", adapter.includes("status === 403")],
  ["038 two saved records are required", adapter.includes("Two saved opportunities are required")],
  ["039 identity equivalence is displayed", adapter.includes("sameExactCardIdentity") && adapter.includes("Same exact-card identity")],
  ["040 different identities are not treated as comps", adapter.includes("Different exact-card identities") && adapter.includes("not as interchangeable comp evidence")],
  ["041 Compare and Card Intelligence link both directions", adapter.includes('href="#/opportunities/${encodeURIComponent(id)}"') && readAdapter.includes('compare.href = `#/compare?left=${encodeURIComponent(currentId)}`')],
  ["042 no save-comparison claim exists", !/Save comparison|comparison saved|persist comparison/i.test(adapter)],
  ["043 table displays saved authority factors", ["Saved decision", "Current ask", "Supported value", "Confidence", "Liquidity", "Risk", "Rank", "Accepted completed sales", "Mapping state", "Workflow"].every(value => adapter.includes(value))],
  ["044 table does not declare a winner", adapter.includes("No new recommendation") && adapter.includes("No browser-side score or winner is created")],
  ["045 customer transaction authority remains absent", adapter.includes("Transaction authority") && adapter.includes(">None<")],
  ["046 gateway already allowlists Compare", gateway.includes('pattern: /^\\/api\\/v1\\/compare$/')],
  ["047 private Beta guide now includes Compare", beta.includes("Compare two saved decisions") && beta.includes("Traceback → Compare → Track")],
  ["048 Compare remains a real route in the current customer loop", beta.includes("Discover → Evaluate → Intelligence → Traceback → Compare → Track") && beta.includes("Evidence Center → PSA Advisor → Exit Review") && beta.includes("Provider may be unavailable") && !beta.includes("Dashboard, Discover, Compare, Portfolio")],
  ["049 private Beta docs mark Compare server-backed", betaDocs.includes("Decision Traceback, Compare, Evidence Center") && !betaDocs.includes("Dashboard, Discover, Compare, Portfolio")],
  ["050 Compare docs prohibit another engine", docs.includes("does not create another recommendation engine")],
  ["051 Compare docs retain SQLite authority", docs.includes("SQLite remains the source of truth")],
  ["052 Compare docs retain no-winner boundary", docs.includes("does not rerank, rescore, select a winner")],
  ["053 Compare docs retain production-disabled boundary", docs.includes("Production remains disabled")],
  ["054 responsive comparison layout exists", css.includes("@media (max-width: 900px)") && css.includes("@media (max-width: 680px)")],
  ["055 reduced motion is respected", css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-smart-opportunity+psa",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: ["Decision support only."],
      correlationId
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function opportunity(id, recommendation, ask, supported) {
  return {
    id,
    title: `Saved ${id}`,
    cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    platform: "EBAY",
    ask,
    supportedValue: supported,
    discountPercent: 12.5,
    confidence: 86,
    liquidity: 91,
    risk: 32,
    rank: 88,
    evidenceCount: 4,
    recommendation,
    workflowStatus: recommendation === "BUY" ? "BUY_READY_CANDIDATE" : "WATCH",
    mappingState: "CONFIRMED",
    evidence: { acceptedSales: 4 },
    population: { available: true, psa10Population: 1200 }
  };
}

function runtime({ healthStatus = "configured", opportunityStatus = 200 } = {}) {
  const calls = [];
  const main = { innerHTML: "", querySelector() { return null; } };
  let uuid = 0;
  const items = [
    opportunity("opp-a", "BUY", 525, 602),
    opportunity("opp-b", "WATCH", 550, 610)
  ];
  const window = {
    location: { hostname: "deploy-preview-33--goflipforge.netlify.app", hash: "#/compare" },
    crypto: { randomUUID: () => `compare-correlation-${++uuid}` }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlation = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId: correlation }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    }
    if (url === "/api/v1/opportunities") {
      if (opportunityStatus !== 200) {
        return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", correlationId: correlation } }, opportunityStatus);
      }
      return response(envelope(correlation, { kind: "opportunities", count: 2, items }));
    }
    if (url.startsWith("/api/v1/compare?ids=")) {
      const ids = new URL(url, "https://comparison.invalid").searchParams.get("ids").split(",");
      const compared = ids.map(id => items.find(item => item.id === id));
      return response(envelope(correlation, {
        kind: "compare",
        readOnly: true,
        count: 2,
        sameExactCardIdentity: true,
        items: compared,
        comparisonBoundary: "Values and recommendations are displayed exactly as saved. This route does not rerank, rescore, or select a winner."
      }));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, URL, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(adapter, context, { filename: "customer-compare.js" });
  return { window, main, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 45));

const configured = runtime();
check("056 customer Compare is eligible on deploy preview", configured.window.FlipForgeCustomerCompare.isEligible());
check("057 customer Compare render entrypoint exists", typeof configured.window.FlipForgeCustomerCompare.render === "function");
configured.window.FlipForgeCustomerCompare.render(configured.main, "opp-b");
await settle();
check("058 configured Compare loads health list and comparison", configured.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/compare?ids=opp-b%2Copp-a");
check("059 preferred saved record is placed on the left", configured.main.innerHTML.includes('<option value="opp-b" selected>') && configured.main.innerHTML.includes("Saved opp-b"));
check("060 comparison renders both authoritative decisions", configured.main.innerHTML.includes("Direct Comparison") && configured.main.innerHTML.includes("BUY") && configured.main.innerHTML.includes("WATCH"));
check("061 comparison renders identity relationship and boundary", configured.main.innerHTML.includes("Same exact-card identity") && configured.main.innerHTML.includes("No new recommendation"));
check("062 comparison renders no prototype data or transaction action", !/Prototype Account|Place bid|Buy now|Checkout|Pay now/.test(configured.main.innerHTML));
check("063 every configured request uses hardened same-origin GET", configured.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("064 browser sends no identity or service-secret header", configured.calls.every(call => !Object.keys(call.options.headers).some(name => /tenant|user|authorization/i.test(name))));

const disabled = runtime({ healthStatus: "disabled" });
disabled.window.FlipForgeCustomerCompare.render(disabled.main);
await settle();
check("065 disabled gateway makes only the health request", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("066 disabled gateway renders safe offline state", disabled.main.innerHTML.includes("Direct Comparison is safely offline") && disabled.main.innerHTML.includes("no mock comparison was substituted"));

const unauthorized = runtime({ opportunityStatus: 401 });
unauthorized.window.FlipForgeCustomerCompare.render(unauthorized.main);
await settle();
check("067 authentication failure stops before Compare", unauthorized.calls.length === 2 && !unauthorized.calls.some(call => call.url.startsWith("/api/v1/compare")));
check("068 authentication failure renders secure recovery action", unauthorized.main.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorized.main.innerHTML.includes("Sign in securely"));

const productionContext = vm.createContext({
  window: { location: { hostname: "goflipforge.com", hash: "#/compare" } },
  fetch: async () => { throw new Error("Production request must not run."); },
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
  Error,
  console,
  setTimeout,
  clearTimeout,
  encodeURIComponent,
  decodeURIComponent
});
vm.runInContext(adapter, productionContext, { filename: "customer-compare-production.js" });
check("069 production host is ineligible", productionContext.window.FlipForgeCustomerCompare.isEligible() === false);
check("070 production render refuses activation", productionContext.window.FlipForgeCustomerCompare.render({ innerHTML: "unchanged", querySelector() { return null; } }) === false);

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerCompareValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
