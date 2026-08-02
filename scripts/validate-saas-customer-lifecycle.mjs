import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  adapter: read("saas-prototype/customer-lifecycle.js"),
  css: read("saas-prototype/customer-lifecycle.css"),
  hook: read("saas-prototype/staging-route-hook.js"),
  index: read("saas-prototype/index.html"),
  gateway: read("netlify/functions/flipforge-api.js"),
  beta: read("saas-prototype/private-beta.js"),
  docs: read("docs/SAAS_CUSTOMER_LIFECYCLE_WORKSPACE.md"),
  betaDocs: read("docs/SAAS_PRIVATE_BETA_READINESS.md"),
  package: read("package.json"),
  netlify: read("netlify.toml")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer lifecycle adapter exists", files.adapter.includes("FlipForgeCustomerLifecycle")],
  ["002 lifecycle adapter is strict-mode isolated", files.adapter.includes('"use strict"') && files.adapter.startsWith("(() =>")],
  ["003 lifecycle adapter is deploy-preview constrained", files.adapter.includes("PREVIEW_HOST") && files.adapter.includes("eligibleHost()")],
  ["004 lifecycle adapter owns tracking portfolio and alerts", ["tracking", "portfolio", "alerts"].every(route => files.adapter.includes(`"${route}"`))],
  ["005 route hook prefers lifecycle adapter", files.hook.includes("FlipForgeCustomerLifecycle") && files.hook.indexOf("lifecycleAdapter") < files.hook.indexOf("managementAdapter.render")],
  ["006 Tracking is present in primary navigation", files.index.includes('href="#/tracking"') && files.index.includes('data-route="tracking"')],
  ["007 lifecycle stylesheet is loaded", files.index.includes('href="customer-lifecycle.css"')],
  ["008 lifecycle script is loaded before route hook", files.index.indexOf('src="customer-lifecycle.js"') < files.index.indexOf('src="staging-route-hook.js"')],
  ["009 browser uses fixed health route", files.adapter.includes('"/api/v1/health"')],
  ["010 browser uses fixed opportunities route", files.adapter.includes('"/api/v1/opportunities"')],
  ["011 browser uses fixed lifecycle list route", files.adapter.includes('"/api/v1/lifecycle"')],
  ["012 browser lifecycle detail is identifier constrained", files.adapter.includes('/^\\/api\\/v1\\/lifecycle\\/([^/?#]+)$/') && files.adapter.includes("SAFE_ID")],
  ["013 browser supports GET and PUT only", files.adapter.includes('method !== "GET" && method !== "PUT"') && !/method\s*!==\s*["']POST/.test(files.adapter)],
  ["014 lifecycle PUT is record constrained", files.adapter.includes("Lifecycle writes require one tenant-owned saved opportunity")],
  ["015 lifecycle PUT sends JSON only", files.adapter.includes('"Content-Type": "application/json"') && files.adapter.includes("JSON.stringify(options.body")],
  ["016 requests use same-origin credentials", files.adapter.includes('credentials: "same-origin"')],
  ["017 requests disable cache", files.adapter.includes('cache: "no-store"')],
  ["018 requests reject redirects", files.adapter.includes('redirect: "error"')],
  ["019 browser sends no trusted tenant identity", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.adapter)],
  ["020 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(files.adapter)],
  ["021 browser persists no customer state", !/localStorage|sessionStorage|document\.cookie/.test(files.adapter)],
  ["022 browser validates Smart Opportunity authority", files.adapter.includes('meta.authority === "Smart Opportunity"')],
  ["023 browser validates existing PSA authority", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["024 browser validates correlation ids", files.adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["025 browser bounds response size", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("LIFECYCLE_RESPONSE_TOO_LARGE")],
  ["026 Tracking requires SQLite lifecycle kind", files.adapter.includes('state.lifecycle?.data?.kind !== "lifecycle"') && files.adapter.includes('sourceOfTruth !== "SQLite"')],
  ["027 lifecycle detail must match selected record", files.adapter.includes('kind !== "lifecycle-detail"') && files.adapter.includes("state.selectedId")],
  ["028 lifecycle history must be an array", files.adapter.includes("!Array.isArray(state.detail?.data?.history)")],
  ["029 lifecycle form submits optimistic version", files.adapter.includes("expectedVersion") && files.adapter.includes('name="expectedVersion"')],
  ["030 tracking status supports customer workflow", ["WATCHING", "REVIEW", "OWNED", "SOLD", "PASSED", "ARCHIVED"].every(value => files.adapter.includes(value))],
  ["031 outcome status remains explicit", ["NONE", "ACQUIRED", "SOLD", "PASSED"].every(value => files.adapter.includes(value))],
  ["032 acquisition facts are customer entered", files.adapter.includes("acquisitionCostCents") && files.adapter.includes("acquiredAt")],
  ["033 disposition facts are customer entered", files.adapter.includes("dispositionProceedsCents") && files.adapter.includes("disposedAt")],
  ["034 review reminder requires review time", files.adapter.includes("A review time is required")],
  ["035 tracking view renders append-only history", files.adapter.includes("append-only event") && files.adapter.includes("Lifecycle history")],
  ["036 Portfolio reads configured lifecycle projection", files.adapter.includes('state.feature?.data?.kind !== state.route') && files.adapter.includes('configured !== true')],
  ["037 Portfolio displays cost basis cents", files.adapter.includes("totalCostBasisCents") && files.adapter.includes("moneyFromCents")],
  ["038 Portfolio refuses invented current value", files.adapter.includes("does not invent current value") && files.adapter.includes("No supported-value total or performance chart was created")],
  ["039 Alerts display in-app review rules", files.adapter.includes("In-app review queue") && files.adapter.includes("REVIEW_DUE")],
  ["040 Alerts disclose delivery disabled", files.adapter.includes("notificationDeliveryConfigured") && files.adapter.includes("Email / push")],
  ["041 no lifecycle transaction controls exist", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(files.adapter)],
  ["042 gateway allowlists lifecycle GET list", files.gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle$/ }')],
  ["043 gateway allowlists lifecycle GET detail", files.gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["044 gateway allowlists lifecycle PUT detail", files.gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["045 gateway forwards PUT body", files.gateway.includes('method === "POST" || method === "PUT" ? body : undefined')],
  ["046 gateway advertises PUT in allowed methods", files.gateway.includes('"Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"')],
  ["047 gateway preserves lifecycle conflict code", files.gateway.includes('upstreamCode === "LIFECYCLE_VERSION_CONFLICT"')],
  ["048 gateway remains trusted tenant injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId")],
  ["049 gateway still forbids client identity headers", files.gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["050 beta guide includes retention loop", files.beta.includes("Tracking → Portfolio → Alerts")],
  ["051 beta guide discloses value boundary", files.beta.includes("Current value and performance remain unavailable")],
  ["052 beta guide discloses delivery boundary", files.beta.includes("External alert delivery is not connected")],
  ["053 docs preserve sole recommendation authority", files.docs.includes("Smart Opportunity remains the sole")],
  ["054 docs preserve PSA authority", files.docs.includes("Existing PSA intelligence remains the sole")],
  ["055 docs preserve SQLite source of truth", files.docs.includes("SQLite remains the source of truth")],
  ["056 docs preserve tenant 404", files.docs.includes("non-disclosing `404`")],
  ["057 docs preserve optimistic conflict", files.docs.includes("409 LIFECYCLE_VERSION_CONFLICT")],
  ["058 docs preserve zero transaction authority", files.docs.includes("No bid, purchase, listing, offer, checkout, payment, or transfer")],
  ["059 docs keep production disabled", files.docs.includes("Production remains unchanged and disabled")],
  ["060 beta docs record lifecycle persistence", files.betaDocs.includes("optimistic version checks and append-only history")],
  ["061 beta docs reject invented performance", files.betaDocs.includes("Current value, gain/loss, fees, taxes, and liquidation value remain unavailable")],
  ["062 beta docs keep external delivery unavailable", files.betaDocs.includes("Email, SMS, push, marketplace actions")],
  ["063 lifecycle validator is in package scripts", files.package.includes('"validate:customer-lifecycle"')],
  ["064 Netlify build includes lifecycle validation", files.netlify.includes("validate:customer-lifecycle")],
  ["065 responsive tablet layout exists", files.css.includes("@media (max-width: 1050px)")],
  ["066 responsive mobile layout exists", files.css.includes("@media (max-width: 680px)")],
  ["067 keyboard focus treatment exists", files.css.includes(":focus-visible")],
  ["068 reduced motion is respected", files.css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "customer-lifecycle+test",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-02T19:30:00Z",
      correlationId,
      evidenceFreshness: "CUSTOMER_WORKFLOW_FACTS",
      limitations: ["Decision support only."]
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const opportunity = {
  id: "opp-1",
  title: "Saved Ohtani decision",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10"
};

const lifecycleRecord = {
  opportunityId: "opp-1",
  trackingStatus: "WATCHING",
  reviewAt: "2030-08-02T15:00:00Z",
  outcomeStatus: "NONE",
  acquisitionCostCents: null,
  acquiredAt: null,
  dispositionProceedsCents: null,
  disposedAt: null,
  alertEnabled: true,
  version: 1,
  createdAt: "2026-08-02T19:00:00Z",
  updatedAt: "2026-08-02T19:00:00Z"
};

function makeMain() {
  let submitHandler = null;
  const form = {
    addEventListener(type, handler) { if (type === "submit") submitHandler = handler; }
  };
  return {
    innerHTML: "",
    focus() {},
    querySelector(selector) {
      if (selector === "[data-lifecycle-form]" && this.innerHTML.includes("data-lifecycle-form")) return form;
      return null;
    },
    submit(values) {
      if (!submitHandler) throw new Error("Lifecycle submit handler was not bound.");
      submitHandler({ preventDefault() {}, currentTarget: form });
      form.values = values;
    },
    form,
    getSubmitHandler() { return submitHandler; }
  };
}

class FakeFormData {
  constructor(form) { this.values = form.values || {}; }
  get(name) { return Object.prototype.hasOwnProperty.call(this.values, name) ? this.values[name] : null; }
}

function runtime({ hostname = "deploy-preview-36--goflipforge.netlify.app", healthStatus = "configured", invalidAuthority = false, lifecycleItems = [lifecycleRecord] } = {}) {
  const calls = [];
  let uuid = 0;
  let currentRecord = { ...lifecycleRecord };
  const window = {
    location: { hostname, hash: "#/tracking/opp-1" },
    crypto: { randomUUID: () => `customer-lifecycle-${++uuid}` }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    }
    const authority = invalidAuthority ? "Second Engine" : "Smart Opportunity";
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", count: 1, items: [opportunity] }, authority));
    if (url === "/api/v1/lifecycle") return response(envelope(correlationId, { kind: "lifecycle", configured: true, sourceOfTruth: "SQLite", count: lifecycleItems.length, items: lifecycleItems }, authority));
    if (url === "/api/v1/lifecycle/opp-1" && options.method === "GET") return response(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: "opp-1", lifecycle: currentRecord, history: [{ eventId: 1, eventType: "CREATED", trackingStatus: currentRecord.trackingStatus, outcomeStatus: currentRecord.outcomeStatus, recordVersion: currentRecord.version, recordedAt: currentRecord.updatedAt }] }, authority));
    if (url === "/api/v1/lifecycle/opp-1" && options.method === "PUT") {
      const body = JSON.parse(options.body);
      currentRecord = { ...currentRecord, ...body, version: currentRecord.version + 1, updatedAt: "2026-08-02T20:00:00Z" };
      return response(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: "opp-1", lifecycle: currentRecord, history: [] }, authority));
    }
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, { kind: "portfolio", configured: true, readOnly: false, currentValueConfigured: false, performanceConfigured: false, transactionAuthority: false, count: 1, totalCostBasisCents: 52500, items: [{ ...currentRecord, trackingStatus: "OWNED", outcomeStatus: "ACQUIRED", acquisitionCostCents: 52500, acquiredAt: "2026-08-02T12:00:00Z" }] }, authority));
    if (url === "/api/v1/alerts") return response(envelope(correlationId, { kind: "alerts", configured: true, readOnly: false, notificationDeliveryConfigured: false, dueCount: 0, count: 1, status: "IN_APP_REVIEW_ALERTS_AVAILABLE", items: [{ opportunityId: "opp-1", kind: "REVIEW_DUE", reviewAt: "2030-08-02T15:00:00Z", due: false, enabled: true, recordVersion: 1 }] }, authority));
    throw new Error(`Unexpected request: ${url} ${options.method}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, JSON, FormData: FakeFormData });
  vm.runInContext(files.adapter, context, { filename: "customer-lifecycle.js" });
  return { window, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 55));

const tracking = runtime();
const trackingMain = makeMain();
check("069 lifecycle adapter exposes route matcher", tracking.window.FlipForgeCustomerLifecycle.handles("tracking") && !tracking.window.FlipForgeCustomerLifecycle.handles("discover"));
check("070 Tracking renders on eligible preview", tracking.window.FlipForgeCustomerLifecycle.render(trackingMain, "tracking", "opp-1") === true);
await settle();
check("071 Tracking loads health opportunities lifecycle and detail", tracking.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/lifecycle,/api/v1/lifecycle/opp-1");
check("072 Tracking renders saved title and state", trackingMain.innerHTML.includes("Saved Ohtani decision") && trackingMain.innerHTML.includes("WATCHING"));
check("073 Tracking renders selected optimistic version", trackingMain.innerHTML.includes("Selected version</span><strong>1"));
check("074 Tracking renders append-only history", trackingMain.innerHTML.includes("Lifecycle history") && trackingMain.innerHTML.includes("CREATED"));
check("075 Tracking binds lifecycle form", typeof trackingMain.getSubmitHandler() === "function");
check("076 Tracking initial requests are secure GETs", tracking.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

trackingMain.form.values = {
  trackingStatus: "REVIEW",
  outcomeStatus: "NONE",
  reviewAt: "2030-08-03T10:00",
  alertEnabled: "on",
  acquisitionCost: "",
  acquiredAt: "",
  dispositionProceeds: "",
  disposedAt: "",
  expectedVersion: "1"
};
trackingMain.getSubmitHandler()({ preventDefault() {}, currentTarget: trackingMain.form });
await settle();
const writeCall = tracking.calls.find(call => call.options.method === "PUT");
const writeBody = writeCall ? JSON.parse(writeCall.options.body) : {};
check("077 Tracking submits one lifecycle PUT", Boolean(writeCall) && writeCall.url === "/api/v1/lifecycle/opp-1");
check("078 Tracking PUT carries optimistic version", writeBody.expectedVersion === 1);
check("079 Tracking PUT carries explicit status and outcome", writeBody.trackingStatus === "REVIEW" && writeBody.outcomeStatus === "NONE");
check("080 Tracking PUT carries normalized reminder instant", typeof writeBody.reviewAt === "string" && writeBody.reviewAt.endsWith("Z") && writeBody.alertEnabled === true);
check("081 Tracking PUT contains no tenant or authority override", !/tenant|recommendation|grade|evidence/i.test(JSON.stringify(writeBody)));

const portfolio = runtime();
const portfolioMain = makeMain();
portfolio.window.FlipForgeCustomerLifecycle.render(portfolioMain, "portfolio");
await settle();
check("082 Portfolio loads health projection and labels", portfolio.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/portfolio,/api/v1/opportunities");
check("083 Portfolio renders customer cost basis", portfolioMain.innerHTML.includes("$525.00") && portfolioMain.innerHTML.includes("Saved Ohtani decision"));
check("084 Portfolio renders no invented gain", portfolioMain.innerHTML.includes("Not calculated") && portfolioMain.innerHTML.includes("No supported-value total or performance chart was created"));

const alerts = runtime();
const alertsMain = makeMain();
alerts.window.FlipForgeCustomerLifecycle.render(alertsMain, "alerts");
await settle();
check("085 Alerts loads health projection and labels", alerts.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/alerts,/api/v1/opportunities");
check("086 Alerts renders persisted review rule", alertsMain.innerHTML.includes("REVIEW_DUE") && alertsMain.innerHTML.includes("Saved Ohtani decision"));
check("087 Alerts renders delivery boundary", alertsMain.innerHTML.includes("Not connected") && alertsMain.innerHTML.includes("Email, SMS, and push"));

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = makeMain();
disabled.window.FlipForgeCustomerLifecycle.render(disabledMain, "tracking");
await settle();
check("088 disabled lifecycle makes health request only", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("089 disabled lifecycle is honest", disabledMain.innerHTML.includes("safely offline") && disabledMain.innerHTML.includes("no tenant request or customer write"));

const invalid = runtime({ invalidAuthority: true });
const invalidMain = makeMain();
invalid.window.FlipForgeCustomerLifecycle.render(invalidMain, "tracking", "opp-1");
await settle();
check("090 invalid authority fails closed", invalidMain.innerHTML.includes("LIFECYCLE_CONTRACT_INVALID") && !invalidMain.innerHTML.includes("Saved Ohtani decision"));

const missing = runtime({ lifecycleItems: [] });
const missingMain = makeMain();
missing.window.FlipForgeCustomerLifecycle.render(missingMain, "tracking", "other-tenant-record");
await settle();
check("091 unavailable selected record stops before detail read", missing.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/lifecycle" && missingMain.innerHTML.includes("RESOURCE_NOT_FOUND"));

const production = runtime({ hostname: "goflipforge.com" });
const productionMain = makeMain();
check("092 production refuses lifecycle adapter", production.window.FlipForgeCustomerLifecycle.render(productionMain, "tracking") === false && production.calls.length === 0);

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerLifecycleValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
