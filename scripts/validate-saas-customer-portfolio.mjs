import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const adapter = read("saas-prototype/customer-portfolio.js");
const css = read("saas-prototype/customer-portfolio.css");
const index = read("saas-prototype/index.html");
const hook = read("saas-prototype/staging-route-hook.js");
const docs = read("docs/SAAS_CUSTOMER_PORTFOLIO_REFERENCE_VALUE.md");
const packageJson = JSON.parse(read("package.json"));
const netlify = read("netlify.toml");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Portfolio adapter exists", exists("saas-prototype/customer-portfolio.js")],
  ["002 Portfolio stylesheet exists", exists("saas-prototype/customer-portfolio.css")],
  ["003 Portfolio documentation exists", exists("docs/SAAS_CUSTOMER_PORTFOLIO_REFERENCE_VALUE.md")],
  ["004 package registers Portfolio validator", packageJson.scripts?.["validate:customer-portfolio"] === "node scripts/validate-saas-customer-portfolio.mjs"],
  ["005 Netlify runs Portfolio validator", netlify.includes("npm run validate:customer-portfolio")],
  ["006 app loads Portfolio stylesheet", index.includes('href="customer-portfolio.css"')],
  ["007 app loads Portfolio adapter before route hook", index.includes('src="customer-portfolio.js"') && index.indexOf('src="customer-portfolio.js"') < index.indexOf('src="staging-route-hook.js"')],
  ["008 route hook reads specialized Portfolio adapter", hook.includes("window.FlipForgeCustomerPortfolio")],
  ["009 specialized Portfolio route precedes generic management", hook.indexOf('route === "portfolio"') < hook.indexOf("managementAdapter.handles(route)")],
  ["010 adapter is deploy-preview constrained", adapter.includes("PREVIEW_HOST") && adapter.includes("eligibleHost()")],
  ["011 adapter allowlists only health Portfolio and opportunities", ["/api/v1/health", "/api/v1/portfolio", "/api/v1/opportunities"].every(value => adapter.includes(value))],
  ["012 adapter requests are GET-only", adapter.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(adapter)],
  ["013 adapter uses same-origin credentials", adapter.includes('credentials: "same-origin"')],
  ["014 adapter disables cache", adapter.includes('cache: "no-store"')],
  ["015 adapter rejects redirects", adapter.includes('redirect: "error"')],
  ["016 browser sends no trusted tenant header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["017 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["018 browser persists no Portfolio state", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(adapter)],
  ["019 response size is bounded", adapter.includes("MAX_RESPONSE_CHARACTERS") && adapter.includes("PORTFOLIO_RESPONSE_TOO_LARGE")],
  ["020 Smart Opportunity authority is validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["021 existing PSA authority is validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["022 correlation is validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["023 current value contract requires evidence reference type", adapter.includes('EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL')],
  ["024 reference method is fixed", adapter.includes('AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES')],
  ["025 minimum accepted exact sales is validated", adapter.includes("reference.minimumAcceptedExactSales !== 3")],
  ["026 maximum evidence age is validated", adapter.includes("reference.maximumLatestSaleAgeDays !== 30")],
  ["027 active listing use must be false", adapter.includes("reference.activeListingsUsed !== false")],
  ["028 provider call during Portfolio read must be false", adapter.includes("reference.providerCallPerformed !== false")],
  ["029 valuation persistence must be false", adapter.includes("reference.persistedAsValuation !== false")],
  ["030 appraisal must be false", adapter.includes("reference.appraisal !== false")],
  ["031 transaction authority must be false", adapter.includes("reference.transactionAuthority !== false")],
  ["032 performance must be unrealized", adapter.includes("performance.realized !== false")],
  ["033 fees remain excluded", adapter.includes("performance.feesIncluded !== false")],
  ["034 taxes remain excluded", adapter.includes("performance.taxesIncluded !== false")],
  ["035 liquidation estimate remains excluded", adapter.includes("performance.liquidationEstimate !== false")],
  ["036 browser does not calculate reference cents", !/referenceValueCents\s*[-+*/]/.test(adapter)],
  ["037 browser does not calculate reference delta cents", !/referenceDeltaCents\s*=|reference\.valueCents\s*-\s*.*acquisitionCost/.test(adapter)],
  ["038 partial reference coverage requires null whole total", adapter.includes("!data.completeReferenceCoverage && data.completePortfolioReferenceValueCents !== null")],
  ["039 partial performance coverage requires null whole total", adapter.includes("!data.completePerformanceCoverage && data.completePortfolioReferenceDeltaCents !== null")],
  ["040 UI explicitly labels evidence reference", adapter.includes("Evidence reference")],
  ["041 UI explicitly labels reference performance", adapter.includes("Reference performance")],
  ["042 UI says active asks are excluded", adapter.includes("Active asks excluded")],
  ["043 UI says reference is not an appraisal", adapter.includes("not a new Smart Opportunity recommendation, appraisal")],
  ["044 UI explains complete versus partial coverage", adapter.includes("Partial coverage") && adapter.includes("Complete coverage")],
  ["045 responsive desktop-to-tablet layout exists", css.includes("@media (max-width: 1050px)")],
  ["046 responsive mobile layout exists", css.includes("@media (max-width: 680px)")],
  ["047 keyboard focus treatment exists", css.includes(":focus-visible")],
  ["048 reduced motion is respected", css.includes("prefers-reduced-motion")],
  ["049 docs preserve Smart Opportunity authority", docs.includes("Smart Opportunity remains the sole `BUY / WATCH / VERIFY / PASS` authority")],
  ["050 docs define three-sale gate", docs.includes("at least **3 accepted exact completed sales**")],
  ["051 docs define thirty-day gate", docs.includes("no more than **30 days old**")],
  ["052 docs exclude active asks", docs.includes("Active listings and asking prices are never used")],
  ["053 docs prohibit browser valuation math", docs.includes("browser formats server-returned values and does not calculate a replacement value")],
  ["054 docs retain production inactive boundary", docs.includes("Production activation remains a separate explicit decision")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "customer-lifecycle+v15.01",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-02T23:55:00Z",
      correlationId,
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: ["Reference value is not an appraisal."]
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const opportunities = {
  kind: "opportunities",
  count: 2,
  items: [
    { id: "opp-fresh", title: "Ohtani Chrome PSA 10", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10" },
    { id: "opp-stale", title: "Doncic Prizm PSA 10", cardIdentity: "2018 Panini Prizm Luka Doncic #280 PSA 10" }
  ]
};

function reference({ available, status, valueCents = null, sales, latest = null, age = null }) {
  return {
    available,
    status,
    valueCents,
    method: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
    acceptedExactCompletedSales: sales,
    minimumAcceptedExactSales: 3,
    earliestSaleDate: "2026-07-10",
    latestSaleDate: latest,
    latestSaleAgeDays: age,
    maximumLatestSaleAgeDays: 30,
    marketplaces: ["CARDSIGHT"],
    exactIdentityRequired: true,
    activeListingsUsed: false,
    providerCallPerformed: false,
    persistedAsValuation: false,
    appraisal: false,
    transactionAuthority: false
  };
}

function performance({ available, cost, referenceValue = null, delta = null, percent = null, status }) {
  return {
    available,
    status,
    method: "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS",
    acquisitionCostCents: cost,
    referenceValueCents: referenceValue,
    referenceDeltaCents: delta,
    referenceDeltaPercent: percent,
    realized: false,
    feesIncluded: false,
    taxesIncluded: false,
    liquidationEstimate: false,
    appraisal: false,
    transactionAuthority: false
  };
}

const portfolio = {
  kind: "portfolio",
  readOnly: false,
  configured: true,
  tenantScoped: true,
  sourceOfTruth: "SQLite",
  transactionAuthority: false,
  status: "EVIDENCE_SUPPORTED_REFERENCE_VALUE_AVAILABLE",
  currentValueConfigured: true,
  currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL",
  currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
  performanceConfigured: true,
  performanceType: "UNREALIZED_REFERENCE_COMPARISON",
  count: 2,
  totalCostBasisCents: 112500,
  referenceValueAvailableCount: 1,
  performanceAvailableCount: 1,
  completeReferenceCoverage: false,
  completePerformanceCoverage: false,
  coveredReferenceValueCents: 70000,
  coveredCostBasisCents: 52500,
  coveredReferenceDeltaCents: 17500,
  completePortfolioReferenceValueCents: null,
  completePortfolioReferenceDeltaCents: null,
  feesIncluded: false,
  taxesIncluded: false,
  liquidationEstimate: false,
  appraisal: false,
  items: [
    {
      opportunityId: "opp-fresh",
      trackingStatus: "OWNED",
      outcomeStatus: "ACQUIRED",
      acquisitionCostCents: 52500,
      referenceValue: reference({ available: true, status: "REFERENCE_AVAILABLE", valueCents: 70000, sales: 4, latest: "2026-07-28", age: 5 }),
      referencePerformance: performance({ available: true, cost: 52500, referenceValue: 70000, delta: 17500, percent: 33.33, status: "REFERENCE_PERFORMANCE_AVAILABLE" })
    },
    {
      opportunityId: "opp-stale",
      trackingStatus: "OWNED",
      outcomeStatus: "ACQUIRED",
      acquisitionCostCents: 60000,
      referenceValue: reference({ available: false, status: "ACCEPTED_SALES_STALE", sales: 5, latest: "2026-06-01", age: 62 }),
      referencePerformance: performance({ available: false, cost: 60000, status: "REFERENCE_VALUE_UNAVAILABLE" })
    }
  ]
};

function makeMain() {
  return {
    innerHTML: "",
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function runtime({ hostname = "deploy-preview-39--goflipforge.netlify.app", healthStatus = "configured", invalidAuthority = false, mutatePortfolio = null } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, hash: "#/portfolio" },
    crypto: { randomUUID: () => `portfolio-${++uuid}` }
  };
  const portfolioPayload = JSON.parse(JSON.stringify(portfolio));
  if (typeof mutatePortfolio === "function") mutatePortfolio(portfolioPayload);
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    }
    const authority = invalidAuthority ? "Second Engine" : "Smart Opportunity";
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, portfolioPayload, authority));
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, opportunities, authority));
    return response({ error: { code: "ROUTE_NOT_FOUND", message: "Not found", correlationId } }, 404);
  };
  const context = vm.createContext({
    window,
    fetch,
    Response,
    Intl,
    Map,
    Number,
    String,
    Object,
    Array,
    Math,
    Date,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask
  });
  new vm.Script(adapter, { filename: "customer-portfolio.js" }).runInContext(context);
  return { window, calls, main: makeMain() };
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

{
  const run = runtime();
  check("055 preview host is eligible", run.window.FlipForgeCustomerPortfolio.isEligible() === true);
  check("056 render accepts eligible preview", run.window.FlipForgeCustomerPortfolio.render(run.main) === true);
  await settle();
  check("057 configured flow reads health Portfolio and opportunities", run.calls.map(call => call.url).join("|") === "/api/v1/health|/api/v1/portfolio|/api/v1/opportunities");
  check("058 all browser requests are GET", run.calls.every(call => call.options.method === "GET"));
  check("059 all browser requests use same-origin credentials", run.calls.every(call => call.options.credentials === "same-origin"));
  check("060 all browser requests disable cache", run.calls.every(call => call.options.cache === "no-store"));
  check("061 rendered Portfolio includes fresh reference value", run.main.innerHTML.includes("$700.00"));
  check("062 rendered Portfolio includes customer cost basis", run.main.innerHTML.includes("$525.00"));
  check("063 rendered Portfolio includes server reference delta", run.main.innerHTML.includes("+$175.00"));
  check("064 rendered Portfolio includes server reference percent", run.main.innerHTML.includes("+33.33%"));
  check("065 rendered Portfolio exposes fresh evidence gate", run.main.innerHTML.includes("4 accepted exact sales") && run.main.innerHTML.includes("newest 5 days old"));
  check("066 stale holding stays unavailable", run.main.innerHTML.includes("Accepted sales are stale"));
  check("067 partial coverage refuses whole-portfolio total", run.main.innerHTML.includes("Unavailable until every holding passes evidence gates"));
  check("068 UI retains active ask exclusion", run.main.innerHTML.includes("Active asks excluded"));
  check("069 UI retains no-appraisal boundary", run.main.innerHTML.includes("not a new Smart Opportunity recommendation, appraisal"));
  check("070 UI contains no transaction control", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(run.main.innerHTML));
}

{
  const run = runtime({ healthStatus: "disabled" });
  run.window.FlipForgeCustomerPortfolio.render(run.main);
  await settle();
  check("071 disabled bridge stops after health", run.calls.length === 1 && run.calls[0].url === "/api/v1/health");
  check("072 disabled bridge shows no sample value", run.main.innerHTML.includes("safely offline") && !run.main.innerHTML.includes("$700.00"));
}

{
  const run = runtime({ hostname: "goflipforge.com" });
  check("073 production hostname is ineligible", run.window.FlipForgeCustomerPortfolio.isEligible() === false);
  check("074 production render refuses activation", run.window.FlipForgeCustomerPortfolio.render(run.main) === false && run.calls.length === 0);
}

{
  const run = runtime({ invalidAuthority: true });
  run.window.FlipForgeCustomerPortfolio.render(run.main);
  await settle();
  check("075 invalid authority fails closed", run.main.innerHTML.includes("PORTFOLIO_CONTRACT_INVALID") || run.main.innerHTML.includes("authority contract"));
  check("076 invalid authority renders no reference value", !run.main.innerHTML.includes("$700.00"));
}

{
  const run = runtime({ mutatePortfolio: value => { value.items[0].referenceValue.activeListingsUsed = true; } });
  run.window.FlipForgeCustomerPortfolio.render(run.main);
  await settle();
  check("077 active-listing contamination fails contract", run.main.innerHTML.includes("PORTFOLIO_REFERENCE_CONTRACT_INVALID"));
  check("078 contaminated reference is never rendered", !run.main.innerHTML.includes("$700.00"));
}

{
  const run = runtime({ mutatePortfolio: value => { value.completePortfolioReferenceValueCents = 130000; } });
  run.window.FlipForgeCustomerPortfolio.render(run.main);
  await settle();
  check("079 invented partial whole-portfolio total fails contract", run.main.innerHTML.includes("PORTFOLIO_REFERENCE_CONTRACT_INVALID"));
}

const passed = results.filter(result => result.passed).length;
const failed = results.length - passed;
console.log("SaaS customer Portfolio reference-value validation");
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
for (const result of results.filter(result => !result.passed)) console.error(`FAIL | ${result.name}`);
if (failed) process.exit(1);
