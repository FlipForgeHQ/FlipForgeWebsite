import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  index: read("saas-prototype/index.html"),
  guard: read("saas-prototype/production-dashboard-guard.js"),
  legacyApp: read("saas-prototype/app.js"),
  dashboard: read("saas-prototype/commercial-dashboard-v2.js"),
  build: read("scripts/build-identity-client.mjs"),
  css: read("saas-prototype/commercial-dashboard-v2.css"),
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
  ["003 production Dashboard guard exists", fs.existsSync(path.join(root, "saas-prototype/production-dashboard-guard.js"))],
  ["004 production Dashboard guard loads before legacy app router", files.index.includes('src="production-dashboard-guard.js"') && files.index.indexOf('src="production-dashboard-guard.js"') < files.index.indexOf('src="app.js"')],
  ["005 production Dashboard guard is production-host restricted", files.guard.includes('/^(?:www\\.)?goflipforge\\.com$/i')],
  ["006 production Dashboard guard is app-path restricted", files.guard.includes('/^\\/(?:app|saas-prototype)(?:\\/|$)/i')],
  ["007 production Dashboard guard is dashboard-route restricted", files.guard.includes('route === "dashboard"')],
  ["008 production Dashboard guard recognizes authoritative render", files.guard.includes('[data-commercial-dashboard-v2]')],
  ["009 production Dashboard guard exposes no prototype data dependency", !/FlipForgePrototypeData|data\.dashboard|data\.opportunities/.test(files.guard)],
  ["010 production Dashboard guard uses honest authoritative loading language", files.guard.includes("Loading tenant-owned FlipForge intelligence") && files.guard.includes("Loading authoritative dashboard data")],
  ["011 legacy prototype Dashboard remains identifiable for non-production cleanup", files.legacyApp.includes("Prototype customer activity, not live telemetry") && files.legacyApp.includes("already-governed mock records")],
  ["012 commercial Dashboard uses fixed health path", files.dashboard.includes('health: "/api/v1/health"')],
  ["013 commercial Dashboard uses fixed dashboard path", files.dashboard.includes('dashboard: "/api/v1/dashboard"')],
  ["014 commercial Dashboard uses fixed opportunities path", files.dashboard.includes('opportunities: "/api/v1/opportunities"')],
  ["015 commercial Dashboard is production eligible", files.dashboard.includes('/^(?:www\\.)?goflipforge\\.com$/i') && files.dashboard.includes("PRODUCTION_HOST.test(host)")],
  ["016 commercial Dashboard uses same-origin credentials", files.dashboard.includes('credentials: "same-origin"')],
  ["017 commercial Dashboard disables caching", files.dashboard.includes('cache: "no-store"')],
  ["018 commercial Dashboard rejects redirects", files.dashboard.includes('redirect: "error"')],
  ["019 commercial Dashboard validates contract version", files.dashboard.includes('meta.contractVersion === CONTRACT_VERSION')],
  ["020 commercial Dashboard validates request correlation", files.dashboard.includes('meta.correlationId === requestCorrelationId')],
  ["021 commercial Dashboard validates Smart Opportunity authority", files.dashboard.includes('meta.authority === "Smart Opportunity"')],
  ["022 commercial Dashboard validates existing PSA authority", files.dashboard.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["023 commercial Dashboard exposes no browser tenant identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.dashboard)],
  ["024 commercial Dashboard contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.dashboard)],
  ["025 commercial Dashboard fails closed on unavailable bridge", files.dashboard.includes("CUSTOMER_API_NOT_CONFIGURED") && files.dashboard.includes("fails closed")],
  ["026 commercial Dashboard preserves server order", files.dashboard.includes("server order preserved") && files.dashboard.includes("Records stay in the order returned by the authoritative service")],
  ["027 commercial Dashboard keeps Market Index unavailable", files.dashboard.includes("NOT CONFIGURED") && files.dashboard.includes("rather than presenting a fabricated index or chart")],
  ["028 commercial Dashboard forbids browser authority", files.dashboard.includes("No browser scoring, evidence acceptance, grade prediction, purchase, sale, or transaction authority")],
  ["029 production build injects commercial Dashboard stylesheet", files.build.includes('commercial-dashboard-v2.css') && files.build.includes("injectCommercialDashboard(appIndex)")],
  ["030 production build injects commercial Dashboard script", files.build.includes('commercial-dashboard-v2.js')],
  ["031 production build injects commercial Dashboard before commercial polish", files.build.indexOf("injectCommercialDashboard(appIndex)") < files.build.indexOf("injectCommercialAppPolish(appIndex)")],
  ["032 gateway remains trusted tenant injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["033 Dashboard CSS has desktop layout", files.css.includes("ff-kpi-grid")],
  ["034 Dashboard CSS has responsive rules", /@media\s*\(max-width:/.test(files.css)],
  ["035 docs require server-owned production Dashboard", files.docs.includes("Production Dashboard is server-owned") && files.docs.includes("goflipforge.com/app/")],
  ["036 docs prohibit production prototype fallback", files.docs.includes("must never appear on production") && files.docs.includes("production-dashboard-guard.js")],
  ["037 docs preserve Smart Opportunity authority", files.docs.includes("Smart Opportunity remains the sole")],
  ["038 docs preserve PSA authority", files.docs.includes("Existing PSA intelligence remains the sole")],
  ["039 docs preserve SQLite source of truth", files.docs.includes("SQLite remains the source of truth")],
  ["040 docs preserve zero transaction authority", files.docs.includes("No customer surface has transaction authority")]
].forEach(([name, condition]) => check(name, condition));

function guardRuntime({ hostname = "goflipforge.com", pathname = "/app/", hash = "#/dashboard", initialHtml = "" } = {}) {
  let observerCallback = null;
  const main = {
    innerHTML: initialHtml,
    querySelector(selector) {
      if (selector === "[data-commercial-dashboard-v2]") return this.innerHTML.includes("data-commercial-dashboard-v2") ? {} : null;
      if (selector === "[data-production-dashboard-guard]") return this.innerHTML.includes("data-production-dashboard-guard") ? {} : null;
      return null;
    }
  };
  class MutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const window = {
    location: { hostname, pathname, hash },
    addEventListener() {}
  };
  const document = {
    querySelector(selector) { return selector === "#main-content" ? main : null; }
  };
  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    queueMicrotask: callback => callback(),
    String,
    RegExp
  });
  vm.runInContext(files.guard, context, { filename: "production-dashboard-guard.js" });
  return { main, triggerMutation: () => observerCallback?.() };
}

const guarded = guardRuntime({ initialHtml: '<div data-prototype-dashboard>PROTOTYPE_SENTINEL</div>' });
check("041 production Dashboard starts behind authoritative guard", guarded.main.innerHTML.includes("data-production-dashboard-guard") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));
guarded.main.innerHTML = '<div data-prototype-dashboard>PROTOTYPE_SENTINEL</div>';
guarded.triggerMutation();
check("042 production guard removes a later legacy prototype overwrite", guarded.main.innerHTML.includes("data-production-dashboard-guard") && !guarded.main.innerHTML.includes("PROTOTYPE_SENTINEL"));
guarded.main.innerHTML = '<div data-commercial-dashboard-v2>AUTHORITATIVE_SENTINEL</div>';
guarded.triggerMutation();
check("043 production guard preserves authoritative commercial Dashboard", guarded.main.innerHTML.includes("AUTHORITATIVE_SENTINEL") && !guarded.main.innerHTML.includes("data-production-dashboard-guard"));

const wwwGuarded = guardRuntime({ hostname: "www.goflipforge.com", initialHtml: "WWW_PROTOTYPE_SENTINEL" });
check("044 www production host is guarded", wwwGuarded.main.innerHTML.includes("data-production-dashboard-guard") && !wwwGuarded.main.innerHTML.includes("WWW_PROTOTYPE_SENTINEL"));

const previewGuarded = guardRuntime({ hostname: "deploy-preview-174--goflipforge.netlify.app", pathname: "/saas-prototype/", initialHtml: "PREVIEW_SENTINEL" });
check("045 deploy preview keeps explicit prototype behavior", previewGuarded.main.innerHTML === "PREVIEW_SENTINEL");
const localGuarded = guardRuntime({ hostname: "localhost", pathname: "/saas-prototype/", initialHtml: "LOCAL_SENTINEL" });
check("046 localhost keeps explicit prototype behavior", localGuarded.main.innerHTML === "LOCAL_SENTINEL");
const productionOtherRoute = guardRuntime({ hash: "#/discover", initialHtml: "DISCOVER_SENTINEL" });
check("047 production guard does not interfere with non-Dashboard routes", productionOtherRoute.main.innerHTML === "DISCOVER_SENTINEL");

function authorityEnvelope(correlationId, data, overrides = {}) {
  return {
    meta: {
      contractVersion: overrides.contractVersion || "1.0",
      engineVersion: "test-smart-opportunity+psa",
      authority: overrides.authority || "Smart Opportunity",
      gradingAuthority: overrides.gradingAuthority || "Existing PSA intelligence",
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: ["Decision support only."],
      correlationId: overrides.correlationId || correlationId,
      generatedAt: "2026-08-27T22:00:00.000Z"
    },
    data
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function commercialRuntime({ healthStatus = "configured", dataStatus = 200, authority = "Smart Opportunity", gradingAuthority = "Existing PSA intelligence", mismatchCorrelation = false } = {}) {
  const calls = [];
  let uuid = 0;
  const main = {
    innerHTML: '<div data-prototype-dashboard>PROTOTYPE_SENTINEL</div>',
    querySelector() { return null; }
  };
  const window = {
    location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/dashboard" },
    crypto: { randomUUID: () => `dashboard-correlation-${++uuid}` },
    addEventListener() {}
  };
  const document = {
    title: "",
    body: { classList: { add() {} } },
    querySelector(selector) {
      if (selector === "#main-content") return main;
      return null;
    }
  };
  const opportunities = [
    { id: "opp-first", title: "Tenant Decision Alpha", cardIdentity: "Card A #1 PSA 10", platform: "EBAY", recommendation: "BUY", ask: 525, supportedValue: 602, confidence: 86, liquidity: 82, risk: 21, rank: 91, evidence: { acceptedSales: 4 }, mappingState: "CONFIRMED" },
    { id: "opp-second", title: "Tenant Decision Beta", cardIdentity: "Card B #2 PSA 9", platform: "EBAY", recommendation: "VERIFY", ask: 410, supportedValue: 445, confidence: 73, liquidity: 66, risk: 48, rank: 74, evidence: { acceptedSales: 0 }, mappingState: "NOT_CONFIRMED" }
  ];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return jsonResponse({
        meta: { contractVersion: "1.0", correlationId },
        data: { status: healthStatus, bridgeEnabled: healthStatus === "configured", upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true }
      });
    }
    if (dataStatus !== 200) {
      const code = dataStatus === 401 ? "AUTHENTICATION_REQUIRED" : dataStatus === 403 ? "TENANT_MEMBERSHIP_REQUIRED" : "UPSTREAM_REJECTED";
      return jsonResponse({ error: { code, message: "Authoritative request denied.", correlationId } }, dataStatus);
    }
    const correlationOverride = mismatchCorrelation ? `${correlationId}-mismatch` : correlationId;
    if (url === "/api/v1/dashboard") {
      return jsonResponse(authorityEnvelope(correlationId, {
        kind: "dashboard",
        metrics: { trackedOpportunities: 2, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 1 }
      }, { authority, gradingAuthority, correlationId: correlationOverride }));
    }
    if (url === "/api/v1/opportunities") {
      return jsonResponse(authorityEnvelope(correlationId, { kind: "opportunities", count: opportunities.length, items: opportunities }, { authority, gradingAuthority, correlationId: correlationOverride }));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({
    window,
    document,
    fetch,
    Response,
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
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask: callback => callback(),
    encodeURIComponent,
    decodeURIComponent
  });
  vm.runInContext(files.dashboard, context, { filename: "commercial-dashboard-v2.js" });
  return { main, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40));

const production = commercialRuntime();
await settle();
check("048 production commercial Dashboard loads health dashboard opportunities", production.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/dashboard,/api/v1/opportunities");
check("049 production Dashboard renders authoritative tenant metrics", production.main.innerHTML.includes("Tracked Decisions") && production.main.innerHTML.includes(">2<") && production.main.innerHTML.includes("Needs Verification"));
check("050 production Dashboard renders server-returned decisions", production.main.innerHTML.includes("Tenant Decision Alpha") && production.main.innerHTML.includes("Tenant Decision Beta"));
check("051 production Dashboard preserves server decision order", production.main.innerHTML.indexOf("Tenant Decision Alpha") < production.main.innerHTML.indexOf("Tenant Decision Beta"));
check("052 production Dashboard preserves server recommendations", production.main.innerHTML.includes(">BUY<") && production.main.innerHTML.includes(">VERIFY<"));
check("053 production Dashboard removes prototype sentinel immediately", !production.main.innerHTML.includes("PROTOTYPE_SENTINEL"));
check("054 production Dashboard requests are GET same-origin no-store redirect-error", production.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("055 production Dashboard sends correlation IDs", production.calls.every(call => /^dashboard-correlation-\d+$/.test(call.options.headers["X-Correlation-Id"])));
check("056 production Dashboard exposes no transaction action", !/Place bid|Buy now|Checkout|Pay now|List for sale/.test(production.main.innerHTML));
check("057 production Dashboard renders explicit authority boundary", production.main.innerHTML.includes("Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority") && production.main.innerHTML.includes("Existing PSA intelligence remains the sole grading-guidance authority"));

const disabled = commercialRuntime({ healthStatus: "disabled" });
await settle();
check("058 disabled bridge stops after health", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("059 disabled bridge fails closed without prototype content", disabled.main.innerHTML.includes("CUSTOMER_API_NOT_CONFIGURED") && disabled.main.innerHTML.includes("fails closed") && !disabled.main.innerHTML.includes("PROTOTYPE_SENTINEL") && !disabled.main.innerHTML.includes("Tenant Decision Alpha"));

for (const status of [401, 403, 500]) {
  const failed = commercialRuntime({ dataStatus: status });
  await settle();
  check(`060-${status} request failure fails closed`, failed.main.innerHTML.includes(status === 401 ? "AUTHENTICATION_REQUIRED" : status === 403 ? "TENANT_MEMBERSHIP_REQUIRED" : "UPSTREAM_REJECTED") && !failed.main.innerHTML.includes("PROTOTYPE_SENTINEL") && !failed.main.innerHTML.includes("Tenant Decision Alpha"));
}

const invalidAuthority = commercialRuntime({ authority: "Second Engine" });
await settle();
check("061 invalid recommendation authority fails closed", invalidAuthority.main.innerHTML.includes("DASHBOARD_CONTRACT_INVALID") && !invalidAuthority.main.innerHTML.includes("Tenant Decision Alpha") && !invalidAuthority.main.innerHTML.includes("PROTOTYPE_SENTINEL"));
const invalidPsa = commercialRuntime({ gradingAuthority: "Browser PSA" });
await settle();
check("062 invalid PSA authority fails closed", invalidPsa.main.innerHTML.includes("DASHBOARD_CONTRACT_INVALID") && !invalidPsa.main.innerHTML.includes("Tenant Decision Alpha") && !invalidPsa.main.innerHTML.includes("PROTOTYPE_SENTINEL"));
const invalidCorrelation = commercialRuntime({ mismatchCorrelation: true });
await settle();
check("063 mismatched correlation fails closed", invalidCorrelation.main.innerHTML.includes("DASHBOARD_CONTRACT_INVALID") && !invalidCorrelation.main.innerHTML.includes("Tenant Decision Alpha") && !invalidCorrelation.main.innerHTML.includes("PROTOTYPE_SENTINEL"));

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerDashboardValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
