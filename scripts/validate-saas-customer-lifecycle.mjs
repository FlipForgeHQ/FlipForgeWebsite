import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-lifecycle.js");
const hook = read("saas-prototype/staging-route-hook.js");
const gateway = read("netlify/functions/flipforge-api.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 lifecycle adapter is isolated", adapter.startsWith("(() =>") && adapter.includes('"use strict"')],
  ["002 production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["003 preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["004 app path is constrained", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["005 lifecycle owns tracking portfolio alerts", ["tracking", "portfolio", "alerts"].every(route => adapter.includes(`"${route}"`))],
  ["006 route hook prefers lifecycle adapter", hook.includes("FlipForgeCustomerLifecycle") && hook.indexOf("lifecycleAdapter") < hook.indexOf("managementAdapter.render")],
  ["007 lifecycle list path fixed", adapter.includes('"/api/v1/lifecycle"')],
  ["008 lifecycle detail path identifier constrained", adapter.includes('/^\\/api\\/v1\\/lifecycle\\/([^/?#]+)$/') && adapter.includes("SAFE_ID")],
  ["009 browser allows GET and PUT only", adapter.includes('method !== "GET" && method !== "PUT"')],
  ["010 PUT is one-record constrained", adapter.includes("Lifecycle writes require one tenant-owned saved opportunity")],
  ["011 PUT sends JSON only", adapter.includes('"Content-Type": "application/json"') && adapter.includes("JSON.stringify(options.body")],
  ["012 requests use same-origin credentials", adapter.includes('credentials: "same-origin"')],
  ["013 requests disable cache", adapter.includes('cache: "no-store"')],
  ["014 requests reject redirects", adapter.includes('redirect: "error"')],
  ["015 no trusted browser tenant header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["016 no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["017 no browser persistence", !/localStorage|sessionStorage|document\.cookie/.test(adapter)],
  ["018 Smart Opportunity authority validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["019 PSA authority validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["020 correlation IDs validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["021 response size bounded", adapter.includes("LIFECYCLE_RESPONSE_TOO_LARGE")],
  ["022 Tracking requires SQLite source", adapter.includes('sourceOfTruth !== "SQLite"')],
  ["023 lifecycle detail must match selected ID", adapter.includes('kind !== "lifecycle-detail"') && adapter.includes("state.selectedId")],
  ["024 lifecycle history required", adapter.includes("!Array.isArray(state.detail?.data?.history)")],
  ["025 optimistic version is submitted", adapter.includes("expectedVersion") && adapter.includes('name="expectedVersion"')],
  ["026 tracking statuses explicit", ["WATCHING", "REVIEW", "OWNED", "SOLD", "PASSED", "ARCHIVED"].every(value => adapter.includes(value))],
  ["027 outcome statuses explicit", ["NONE", "ACQUIRED", "SOLD", "PASSED"].every(value => adapter.includes(value))],
  ["028 acquisition and disposition facts customer-entered", ["acquisitionCostCents", "acquiredAt", "dispositionProceedsCents", "disposedAt"].every(value => adapter.includes(value))],
  ["029 reminder requires review time", adapter.includes("A review time is required")],
  ["030 append-only history displayed", adapter.includes("Lifecycle history") && adapter.includes("append-only")],
  ["031 Alerts disclose external delivery disabled", adapter.includes("notificationDeliveryConfigured") && adapter.includes("Email / push")],
  ["032 no transaction controls", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(adapter)],
  ["033 production auth handoff exists", adapter.includes("/production-auth.html")],
  ["034 gateway GET lifecycle list allowlisted", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle$/ }')],
  ["035 gateway GET lifecycle detail allowlisted", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["036 gateway PUT lifecycle detail allowlisted", gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["037 gateway still forbids client identity headers", gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["038 save confirmation is customer-readable", adapter.includes('state.notice = "Tracking changes saved to your account."') && !adapter.includes("Lifecycle saved in tenant-scoped SQLite.")]
].forEach(([name, condition]) => check(name, condition));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function envelope(correlationId, data) {
  return { meta: { contractVersion: "1.0", engineVersion: "test-engine", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId }, data };
}

const opportunity = { id: "opp-1", title: "Saved Ohtani decision", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10" };
const lifecycle = {
  opportunityId: "opp-1",
  trackingStatus: "WATCHING",
  reviewAt: "2030-08-02T15:00:00Z",
  outcomeStatus: "NONE",
  acquisitionCostCents: null,
  acquiredAt: null,
  dispositionProceedsCents: null,
  disposedAt: null,
  alertEnabled: true,
  version: 1
};

function runtime({ hostname = "deploy-preview-36--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured" } = {}) {
  const calls = [];
  let uuid = 0;
  const window = { location: { hostname, pathname, hash: "#/tracking/opp-1" }, crypto: { randomUUID: () => `lifecycle-${++uuid}` } };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", items: [opportunity] }));
    if (url === "/api/v1/lifecycle") return response(envelope(correlationId, { kind: "lifecycle", sourceOfTruth: "SQLite", items: [lifecycle] }));
    if (url === "/api/v1/lifecycle/opp-1" && options.method === "GET") return response(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: "opp-1", lifecycle, history: [] }));
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, { kind: "portfolio", configured: true, items: [] }));
    if (url === "/api/v1/alerts") return response(envelope(correlationId, { kind: "alerts", configured: true, items: [], notificationDeliveryConfigured: false }));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, FormData });
  vm.runInContext(adapter, context, { filename: "customer-lifecycle.js" });
  return { window, calls, main: { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } } };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40));

const preview = runtime();
check("039 preview app eligible", preview.window.FlipForgeCustomerLifecycle.isEligible());
check("040 preview tracking render activates", preview.window.FlipForgeCustomerLifecycle.render(preview.main, "tracking", "opp-1") === true);
await settle();
check("041 tracking reads health opportunities lifecycle detail", preview.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/lifecycle,/api/v1/lifecycle/opp-1");
check("042 tracking renders saved workflow state", preview.main.innerHTML.includes("WATCHING") && preview.main.innerHTML.includes("Lifecycle history"));
check("043 tracking requests are hardened", preview.calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("044 production app eligible", production.window.FlipForgeCustomerLifecycle.isEligible());
check("045 production tracking render activates", production.window.FlipForgeCustomerLifecycle.render(production.main, "tracking", "opp-1") === true);
await settle();
check("046 production reads tenant lifecycle through same-origin gateway", production.calls.length === 4 && production.calls.every(call => call.options.credentials === "same-origin"));

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("047 public marketing path ineligible", marketing.window.FlipForgeCustomerLifecycle.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
disabled.window.FlipForgeCustomerLifecycle.render(disabled.main, "tracking", "opp-1");
await settle();
check("048 disabled gateway stops after health", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("049 disabled gateway renders safe offline state", /safely offline/i.test(disabled.main.innerHTML));

const failures = results.filter(result => !result.passed);
console.log("SaaS customer lifecycle production validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
