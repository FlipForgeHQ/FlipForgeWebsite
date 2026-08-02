import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  index: read("saas-prototype/index.html"),
  adapter: read("saas-prototype/staging-browser.js"),
  hook: read("saas-prototype/staging-route-hook.js"),
  css: read("saas-prototype/customer-dashboard.css"),
  beta: read("saas-prototype/private-beta.js"),
  docs: read("docs/SAAS_CUSTOMER_DASHBOARD.md"),
  packageJson: JSON.parse(read("package.json")),
  netlify: read("netlify.toml"),
  gateway: read("netlify/functions/flipforge-api.js")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer Dashboard validator is registered", files.packageJson.scripts?.["validate:customer-dashboard"] === "node scripts/validate-saas-customer-dashboard.mjs"],
  ["002 Netlify build runs customer Dashboard validation", files.netlify.includes("npm run validate:customer-dashboard")],
  ["003 customer Dashboard stylesheet exists", fs.existsSync(path.join(root, "saas-prototype/customer-dashboard.css"))],
  ["004 app loads customer Dashboard stylesheet", files.index.includes('href="customer-dashboard.css"')],
  ["005 customer Dashboard documentation exists", fs.existsSync(path.join(root, "docs/SAAS_CUSTOMER_DASHBOARD.md"))],
  ["006 deploy previews replace the mock Dashboard route", files.hook.includes('route === "dashboard"') && files.hook.includes("adapter.renderCustomerDashboard(main)")],
  ["007 production keeps the existing prototype Dashboard", files.hook.includes("adapter.isEligible()")],
  ["008 adapter exposes a dedicated customer Dashboard entrypoint", files.adapter.includes("function renderCustomerDashboard") && files.adapter.includes("renderCustomerDashboard," )],
  ["009 Dashboard uses the existing read adapter", files.adapter.includes('currentSurface = "customer-dashboard"')],
  ["010 Dashboard reads the fixed health path", files.adapter.includes('health: "/api/v1/health"')],
  ["011 Dashboard reads the fixed dashboard path", files.adapter.includes('dashboard: "/api/v1/dashboard"')],
  ["012 Dashboard reads the fixed opportunities path", files.adapter.includes('opportunities: "/api/v1/opportunities"')],
  ["013 Dashboard reads both tenant projections together", files.adapter.includes("state.dashboard, state.opportunities")],
  ["014 Dashboard displays server tracked count", files.adapter.includes("metrics.trackedOpportunities")],
  ["015 Dashboard displays server evidence-ready count", files.adapter.includes("metrics.evidenceReady")],
  ["016 Dashboard displays server population count", files.adapter.includes("metrics.populationContextAvailable")],
  ["017 Dashboard displays server verification count", files.adapter.includes("metrics.needsVerification") && files.adapter.includes("Server-reported review count")],
  ["018 saved decisions retain server order", files.adapter.includes("Records remain in the order returned by the server") && !files.adapter.includes("dashboardOpportunityCards().sort")],
  ["019 Dashboard links to real Evaluate", files.adapter.includes('href="#/evaluate">Evaluate a card')],
  ["020 Dashboard links to tracked opportunities", files.adapter.includes('href="#/opportunities">Tracked cards')],
  ["021 Dashboard links to Compare", files.adapter.includes('href="#/compare"')],
  ["022 Dashboard makes SQLite authority explicit", files.adapter.includes("tenant-owned SQLite record") && files.adapter.includes("SQLite source of truth")],
  ["023 Dashboard makes Smart Opportunity authority explicit", files.adapter.includes("Smart Opportunity projection") && files.adapter.includes("Recommendation authority")],
  ["024 Dashboard forbids browser reranking and rescoring", files.adapter.includes("does not rerank, rescore")],
  ["025 Dashboard forbids evidence acceptance and grade prediction", files.adapter.includes("accept evidence, predict a grade")],
  ["026 Dashboard exposes zero transaction authority", files.adapter.includes("Transaction authority") && files.adapter.includes(">None<")],
  ["027 disabled Dashboard refuses sample substitution", files.adapter.includes("no sample dashboard was substituted")],
  ["028 empty Dashboard offers a real evaluation next step", files.adapter.includes("No saved decisions yet") && files.adapter.includes("Evaluate one exact card")],
  ["029 Dashboard requests use same-origin credentials", files.adapter.includes('credentials: "same-origin"')],
  ["030 Dashboard requests disable caching", files.adapter.includes('cache: "no-store"')],
  ["031 Dashboard requests reject redirects", files.adapter.includes('redirect: "error"')],
  ["032 browser sends no tenant identity", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.adapter)],
  ["033 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.adapter)],
  ["034 browser persists no Dashboard or identity state", !/localStorage|sessionStorage|document\.cookie/.test(files.adapter)],
  ["035 gateway remains the trusted tenant injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["036 Dashboard remains deploy-preview constrained", files.adapter.includes("deploy-preview-") && !files.adapter.includes("www.goflipforge.com")],
  ["037 Dashboard CSS has four-metric desktop layout", files.css.includes("grid-template-columns: repeat(4")],
  ["038 Dashboard CSS has tablet layout", files.css.includes("@media (max-width: 1050px)")],
  ["039 Dashboard CSS has mobile layout", files.css.includes("@media (max-width: 680px)")],
  ["040 Dashboard CSS has keyboard focus treatment", files.css.includes(":focus-visible")],
  ["041 Dashboard CSS respects reduced motion", files.css.includes("prefers-reduced-motion")],
  ["042 Beta Guide now lists the real customer intelligence loop", files.beta.includes("Discover → Evaluate → Intelligence → Traceback → Compare → Track")],
  ["043 Beta Guide no longer lists Dashboard as a sample", !files.beta.includes("Dashboard, Discover, Portfolio, Sell, and Alerts")],
  ["044 docs prohibit a second engine or ranking layer", files.docs.includes("does not create a dashboard database, recommendation engine, review engine, ranking layer")],
  ["045 docs retain production-disabled boundary", files.docs.includes("Production keeps the existing static prototype behavior")],
  ["046 docs disclose the current incomplete capabilities", files.docs.includes("current value") && files.docs.includes("email, SMS, or push") && files.docs.includes("Billing, paid-plan entitlements") && files.docs.includes("No customer surface has transaction authority")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-smart-opportunity+psa",
      authority,
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

function makeMain() {
  return { innerHTML: "", focus() {}, querySelectorAll() { return []; } };
}

function runtime({ hostname = "deploy-preview-34--goflipforge.netlify.app", healthStatus = "configured", dataStatus = 200, invalidAuthority = false } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, hash: "#/dashboard" },
    crypto: { randomUUID: () => `dashboard-correlation-${++uuid}` }
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-route='staging']") return { hidden: true };
      if (selector === "#main-content") return makeMain();
      return null;
    },
    createElement() { return {}; }
  };
  const opportunities = [
    { id: "opp-first", title: "First returned decision", cardIdentity: "Card A", platform: "EBAY", recommendation: "BUY", ask: 525, supportedValue: 602, confidence: 86, evidence: { acceptedSales: 4 }, mappingState: "CONFIRMED" },
    { id: "opp-second", title: "Second returned decision", cardIdentity: "Card B", platform: "EBAY", recommendation: "VERIFY", ask: 410, supportedValue: 445, confidence: 73, evidence: { acceptedSales: 0 }, mappingState: "NOT_CONFIRMED" }
  ];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlation = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId: correlation }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured", upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true } });
    }
    if (url === "/api/v1/dashboard") {
      if (dataStatus !== 200) return response({ error: { code: dataStatus === 401 ? "AUTHENTICATION_REQUIRED" : "UPSTREAM_REJECTED", message: "Request denied.", correlationId: correlation } }, dataStatus);
      return response(envelope(correlation, { kind: "dashboard", metrics: { trackedOpportunities: 2, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 1 } }, invalidAuthority ? "Second Engine" : "Smart Opportunity"));
    }
    if (url === "/api/v1/opportunities") {
      if (dataStatus !== 200) return response({ error: { code: dataStatus === 401 ? "AUTHENTICATION_REQUIRED" : "UPSTREAM_REJECTED", message: "Request denied.", correlationId: correlation } }, dataStatus);
      return response(envelope(correlation, { kind: "opportunities", count: opportunities.length, items: opportunities }));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, document, fetch, Response, URL, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(files.adapter, context, { filename: "staging-browser.js" });
  return { window, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 30));

const configured = runtime();
const configuredMain = makeMain();
check("047 customer Dashboard adapter is eligible", configured.window.FlipForgeStagingReadAdapter.isEligible());
check("048 customer Dashboard runtime entrypoint exists", typeof configured.window.FlipForgeStagingReadAdapter.renderCustomerDashboard === "function");
configured.window.FlipForgeStagingReadAdapter.renderCustomerDashboard(configuredMain);
await settle();
check("049 Dashboard loads health dashboard and opportunities", configured.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/dashboard,/api/v1/opportunities");
check("050 Dashboard renders authoritative metrics", configuredMain.innerHTML.includes("Tracked decisions</span><strong>2") && configuredMain.innerHTML.includes("Needs verification</span><strong>1"));
check("051 Dashboard renders returned decisions", configuredMain.innerHTML.includes("First returned decision") && configuredMain.innerHTML.includes("Second returned decision"));
check("052 Dashboard preserves returned order", configuredMain.innerHTML.indexOf("First returned decision") < configuredMain.innerHTML.indexOf("Second returned decision"));
check("053 Dashboard renders returned recommendations", configuredMain.innerHTML.includes(">BUY<") && configuredMain.innerHTML.includes(">VERIFY<"));
check("054 Dashboard renders authority state", configuredMain.innerHTML.includes("Smart Opportunity") && configuredMain.innerHTML.includes("Transaction authority"));
check("055 Dashboard uses secure read controls", configured.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("056 Dashboard exposes no transaction action", !/Place bid|Buy now|Checkout|Pay now|List for sale/.test(configuredMain.innerHTML));

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = makeMain();
disabled.window.FlipForgeStagingReadAdapter.renderCustomerDashboard(disabledMain);
await settle();
check("057 disabled Dashboard makes only public health request", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("058 disabled Dashboard is honest and mock-free", disabledMain.innerHTML.includes("safely offline") && disabledMain.innerHTML.includes("no sample dashboard was substituted") && !disabledMain.innerHTML.includes("First returned decision"));

const unauthorized = runtime({ dataStatus: 401 });
const unauthorizedMain = makeMain();
unauthorized.window.FlipForgeStagingReadAdapter.renderCustomerDashboard(unauthorizedMain);
await settle();
check("059 authentication failure shows secure sign-in", unauthorizedMain.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorizedMain.innerHTML.includes("Sign in securely"));
check("060 Dashboard sign-in returns to Dashboard", unauthorizedMain.innerHTML.includes("%23%2Fdashboard"));
check("061 authentication failure leaks no saved record", !unauthorizedMain.innerHTML.includes("First returned decision"));

const invalid = runtime({ invalidAuthority: true });
const invalidMain = makeMain();
invalid.window.FlipForgeStagingReadAdapter.renderCustomerDashboard(invalidMain);
await settle();
check("062 invalid authority envelope fails closed", invalidMain.innerHTML.includes("STAGING_CONTRACT_INVALID") && !invalidMain.innerHTML.includes("Tracked decisions</span><strong>2"));

const production = runtime({ hostname: "goflipforge.com" });
const productionMain = makeMain();
check("063 production refuses real Dashboard adapter", production.window.FlipForgeStagingReadAdapter.renderCustomerDashboard(productionMain) === false && production.calls.length === 0);

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerDashboardValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
