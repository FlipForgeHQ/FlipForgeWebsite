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
  css: read("saas-prototype/staging-browser.css"),
  gateway: read("netlify/functions/flipforge-api.js")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

const staticChecks = [
  ["001 staging stylesheet is loaded", files.index.includes('href="staging-browser.css"')],
  ["002 staging adapter is loaded", files.index.includes('src="staging-browser.js"')],
  ["003 staging route hook is loaded", files.index.includes('src="staging-route-hook.js"')],
  ["004 route hook loads after core application", files.index.indexOf('src="staging-route-hook.js"') > files.index.indexOf('src="app.js"')],
  ["005 route hook loads after all cockpit augmenters", files.index.indexOf('src="staging-route-hook.js"') > files.index.indexOf('src="sidebar-edge-fix.js"')],
  ["006 staging navigation is hidden by default", /data-route="staging"[^>]*hidden/.test(files.index)],
  ["007 staging navigation has a dedicated class", files.index.includes('class="staging-only-nav"')],
  ["008 adapter restricts execution to deploy preview or localhost", files.adapter.includes("deploy-preview-") && files.adapter.includes("localhost") && files.adapter.includes("127\\.0\\.0\\.1")],
  ["009 production hostname is not allowlisted", !files.adapter.includes("www.goflipforge.com") && !files.adapter.includes("goflipforge.com|")],
  ["010 browser calls only same-origin API paths", files.adapter.includes('"/api/v1/health"') && !/https?:\/\//.test(files.adapter)],
  ["011 browser requests are GET only", files.adapter.includes('method: "GET"') && !/method:\s*"POST"/.test(files.adapter)],
  ["012 credentials remain same-origin", files.adapter.includes('credentials: "same-origin"')],
  ["013 browser caching is disabled", files.adapter.includes('cache: "no-store"')],
  ["014 browser redirects are refused", files.adapter.includes('redirect: "error"')],
  ["015 browser response size is bounded", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("STAGING_RESPONSE_TOO_LARGE")],
  ["016 invalid JSON fails closed", files.adapter.includes("STAGING_INVALID_JSON")],
  ["017 successful data envelopes require contract v1", files.adapter.includes('meta.contractVersion === CONTRACT_VERSION')],
  ["018 successful data envelopes require Smart Opportunity", files.adapter.includes('meta.authority === "Smart Opportunity"')],
  ["019 successful data envelopes require existing PSA intelligence", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["020 correlation IDs must match", files.adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["021 adapter never sends tenant identity", !/X-FlipForge-Tenant-Id/i.test(files.adapter)],
  ["022 adapter never sends user identity", !/X-FlipForge-User-Id/i.test(files.adapter)],
  ["023 adapter never references service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.adapter)],
  ["024 adapter never stores tokens in local storage", !/localStorage/.test(files.adapter)],
  ["025 adapter never stores tokens in session storage", !/sessionStorage/.test(files.adapter)],
  ["026 adapter never writes cookies", !/document\.cookie/.test(files.adapter)],
  ["027 adapter obtains optional signed identity token in memory", files.adapter.includes("window.netlifyIdentity") && files.adapter.includes("user.jwt()")],
  ["028 adapter validates saved resource identifiers", files.adapter.includes("SAFE_ID") && files.adapter.includes("INVALID_OPPORTUNITY_ID")],
  ["029 adapter uses an explicit read-path allowlist", files.adapter.includes("READ_PATHS") && files.adapter.includes("requireAllowedPath")],
  ["030 adapter does not expose evaluation POST", !/evaluations/.test(files.adapter)],
  ["031 adapter does not mutate prototype data", !/FlipForgePrototypeData/.test(files.adapter)],
  ["032 adapter explicitly forbids mock fallback", files.hook.includes("No mock fallback") && files.adapter.includes("never falls back to mock records")],
  ["033 staging route has an authority boundary", files.adapter.includes("Smart Opportunity and existing PSA intelligence remain authoritative")],
  ["034 detail route states no browser-side calculation", files.adapter.includes("No browser-side calculation")],
  ["035 detail route cannot rescore or predict grades", files.adapter.includes("cannot rescore, rerank, accept evidence, or predict a grade")],
  ["036 partial context failures do not fabricate replacements", files.adapter.includes("No replacement or fabricated data was shown")],
  ["037 disabled gateway prevents customer data calls", files.adapter.includes('data.status === "configured"') && files.adapter.includes("No customer data request was attempted")],
  ["038 staging banner is restored outside staging route", files.hook.includes("restoreBanner") && files.hook.includes('route !== "staging"')],
  ["039 route hook delegates only staging route", files.hook.includes('if (route !== "staging")')],
  ["040 route hook preserves focus and scroll reset", files.hook.includes("preventScroll: true") && files.hook.includes("window.scrollTo")],
  ["041 staging CSS preserves hidden navigation", files.css.includes(".staging-only-nav[hidden]") && files.css.includes("display: none !important")],
  ["042 staging CSS is responsive", files.css.includes("@media (max-width: 560px)")],
  ["043 staging CSS has focus-visible treatment", files.css.includes(":focus-visible")],
  ["044 staging CSS respects reduced motion", files.css.includes("prefers-reduced-motion")],
  ["045 gateway remains the only tenant-header injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId") && !files.adapter.includes("TENANT_HEADER")]
];
staticChecks.forEach(([name, condition]) => check(name, condition));

function makeMain() {
  return { innerHTML: "", focus() {}, querySelectorAll() { return []; } };
}

function makeDocument(nav) {
  return {
    querySelector(selector) {
      if (selector === "[data-route='staging']") return nav;
      if (selector === "#main-content") return makeMain();
      return null;
    }
  };
}

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-engine",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-07-30T21:00:00Z",
      correlationId
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function runtime({ hostname, fetchImpl, identity = null }) {
  const nav = { hidden: true };
  const window = {
    location: { hostname, hash: "#/staging" },
    crypto: { randomUUID: (() => { let n = 0; return () => `corr-${++n}`; })() },
    netlifyIdentity: identity
  };
  const context = vm.createContext({
    window,
    document: makeDocument(nav),
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
    console,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent
  });
  vm.runInContext(files.adapter, context, { filename: "staging-browser.js" });
  return { window, nav };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

const calls = [];
const configured = runtime({
  hostname: "deploy-preview-20--goflipforge.netlify.app",
  identity: { currentUser: () => ({ jwt: async () => "signed-preview-token" }) },
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const correlation = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId: correlation }, data: {
      status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true
    } });
    if (url === "/api/v1/dashboard") return response(envelope(correlation, { kind: "dashboard", metrics: {
      trackedOpportunities: 1, evidenceReady: 1, populationContextAvailable: 1, needsVerification: 0
    }, opportunities: [] }));
    if (url === "/api/v1/opportunities") return response(envelope(correlation, { kind: "opportunities", items: [{
      id: "opp-1", title: "Saved Ohtani", cardIdentity: "2018 Topps Chrome Ohtani", recommendation: "BUY",
      ask: 525, supportedValue: 602, confidence: 86, evidence: { acceptedSales: 4 }, mappingState: "CONFIRMED"
    }] }));
    if (url === "/api/v1/opportunities/opp-1") return response(envelope(correlation, { kind: "opportunity-detail", opportunity: {
      id: "opp-1", title: "Saved Ohtani", cardIdentity: "2018 Topps Chrome Ohtani", recommendation: "BUY",
      ask: 525, supportedValue: 602, confidence: 86, liquidity: 91, risk: 32, rank: 88, evidenceCount: 4,
      mappingState: "CONFIRMED", contextStatus: "READY", evidence: { acceptedSales: 4, averagePrice: 602, latestSaleDate: "2026-07-29" }
    } }));
    if (url === "/api/v1/evidence/opp-1") return response(envelope(correlation, {
      kind: "evidence", acceptedExactCompletedSales: 4, visibleButAuthorityIneligible: 1
    }));
    if (url === "/api/v1/psa-advisor/opp-1") return response(envelope(correlation, {
      kind: "psa-advisor", guidanceStatus: "SAVED_GUIDANCE_AVAILABLE", populationContext: {
        available: true, psa10Population: 1200, psa9Population: 900
      }
    }));
    throw new Error(`Unexpected URL ${url}`);
  }
});

check("046 deploy-preview navigation becomes visible", configured.nav.hidden === false);
check("047 deploy-preview adapter reports eligible", configured.window.FlipForgeStagingReadAdapter.isEligible() === true);
const baseMain = makeMain();
configured.window.FlipForgeStagingReadAdapter.render(baseMain, "");
await settle();
check("048 configured base route calls health dashboard and opportunities", calls.slice(0, 3).map(call => call.url).join(",") === "/api/v1/health,/api/v1/dashboard,/api/v1/opportunities");
check("049 signed identity token is forwarded only as Authorization", calls.slice(0, 3).every(call => call.options.headers.Authorization === "Bearer signed-preview-token"));
check("050 no browser tenant header is sent at runtime", calls.slice(0, 3).every(call => !("X-FlipForge-Tenant-Id" in call.options.headers)));
check("051 runtime requests use same-origin safety options", calls.slice(0, 3).every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("052 authoritative metrics render", baseMain.innerHTML.includes("Tracked opportunities") && baseMain.innerHTML.includes(">1<"));
check("053 authoritative opportunity renders", baseMain.innerHTML.includes("Saved Ohtani") && baseMain.innerHTML.includes("2018 Topps Chrome Ohtani"));
check("054 rendered base route states no mock fallback", baseMain.innerHTML.includes("never falls back to mock records"));

const detailMain = makeMain();
configured.window.FlipForgeStagingReadAdapter.render(detailMain, "opp-1");
await settle();
check("055 detail route requests detail evidence and PSA only", calls.slice(-3).map(call => call.url).join(",") === "/api/v1/opportunities/opp-1,/api/v1/evidence/opp-1,/api/v1/psa-advisor/opp-1");
check("056 saved decision detail renders without recalculation", detailMain.innerHTML.includes("Saved decision factors") && detailMain.innerHTML.includes("No browser-side calculation"));
check("057 saved evidence and PSA context render", detailMain.innerHTML.includes("Accepted exact sales") && detailMain.innerHTML.includes("SAVED_GUIDANCE_AVAILABLE"));

const invalidBefore = calls.length;
const invalidMain = makeMain();
configured.window.FlipForgeStagingReadAdapter.render(invalidMain, "bad id");
await settle();
check("058 unsafe saved identifier is rejected before fetch", calls.length === invalidBefore && invalidMain.innerHTML.includes("INVALID_OPPORTUNITY_ID"));

const disabledCalls = [];
const disabled = runtime({
  hostname: "deploy-preview-21--goflipforge.netlify.app",
  fetchImpl: async (url, options) => {
    disabledCalls.push(url);
    return response({ meta: { contractVersion: "1.0", correlationId: options.headers["X-Correlation-Id"] }, data: {
      status: "disabled", bridgeEnabled: false, upstreamConfigured: false, authenticationRequired: true, tenantMembershipRequired: true
    } });
  }
});
const disabledMain = makeMain();
disabled.window.FlipForgeStagingReadAdapter.render(disabledMain, "");
await settle();
check("059 disabled gateway stops after public health", disabledCalls.length === 1 && disabledCalls[0] === "/api/v1/health");
check("060 disabled gateway is shown honestly", disabledMain.innerHTML.includes("Staging gateway is not active") && disabledMain.innerHTML.includes("No customer data request was attempted"));

const unauthorized = runtime({
  hostname: "deploy-preview-22--goflipforge.netlify.app",
  fetchImpl: async (url, options) => {
    const correlation = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId: correlation }, data: {
      status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true
    } });
    return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", correlationId: correlation } }, 401);
  }
});
const unauthorizedMain = makeMain();
unauthorized.window.FlipForgeStagingReadAdapter.render(unauthorizedMain, "");
await settle();
check("061 unauthenticated configured gateway fails visibly", unauthorizedMain.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorizedMain.innerHTML.includes("signed-in preview user"));
check("062 unauthenticated error contains no opportunity data", !unauthorizedMain.innerHTML.includes("Saved Ohtani") && !unauthorizedMain.innerHTML.includes("Tracked opportunities"));

let productionFetches = 0;
const production = runtime({
  hostname: "goflipforge.com",
  fetchImpl: async () => { productionFetches++; return response({}); }
});
const productionMain = makeMain();
production.window.FlipForgeStagingReadAdapter.render(productionMain, "");
await settle();
check("063 production host keeps staging navigation hidden", production.nav.hidden === true);
check("064 production host performs no staging fetch", productionFetches === 0);
check("065 production host shows restricted diagnostic route", productionMain.innerHTML.includes("restricted to deploy previews"));

const failures = results.filter(result => !result.passed);
console.log("SaaSStagingBrowserReadAdapterValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
