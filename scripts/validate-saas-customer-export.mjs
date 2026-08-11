import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-export.js");
const hook = read("saas-prototype/staging-route-hook.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 export adapter exists", adapter.includes("FlipForgeCustomerExport")],
  ["002 adapter is strict-mode isolated", adapter.startsWith("(() =>") && adapter.includes('"use strict"')],
  ["003 production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["004 preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["005 app path is constrained", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["006 export route is explicit", adapter.includes('return route === "export"')],
  ["007 route hook delegates export", hook.includes("FlipForgeCustomerExport") && hook.includes("exportAdapter.render")],
  ["008 health and opportunities paths fixed", adapter.includes('"/api/v1/health"') && adapter.includes('"/api/v1/opportunities"')],
  ["009 detail sources identifier constrained", adapter.includes("(opportunities|evidence|psa-advisor|lifecycle)") && adapter.includes("SAFE_ID")],
  ["010 export reads GET only", adapter.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(adapter)],
  ["011 same-origin credentials required", adapter.includes('credentials: "same-origin"')],
  ["012 cache disabled", adapter.includes('cache: "no-store"')],
  ["013 redirects rejected", adapter.includes('redirect: "error"')],
  ["014 no browser tenant header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["015 no browser service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["016 no dossier browser persistence", !/localStorage|sessionStorage|document\.cookie|indexedDB/i.test(adapter)],
  ["017 Smart Opportunity authority validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["018 PSA authority validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["019 correlation validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["020 response size bounded", adapter.includes("EXPORT_RESPONSE_TOO_LARGE")],
  ["021 opportunity detail and ID matched", adapter.includes("EXPORT_OPPORTUNITY_INVALID")],
  ["022 evidence detail and ID matched", adapter.includes("EXPORT_EVIDENCE_INVALID")],
  ["023 saved PSA must not recalculate", adapter.includes("psa?.recalculated !== false")],
  ["024 lifecycle history required", adapter.includes("!Array.isArray(lifecycle?.history)")],
  ["025 all four sources required atomically", adapter.includes("Promise.all([") && ["sources.opportunity", "sources.evidence", "sources.psa", "sources.lifecycle"].every(value => adapter.includes(value))],
  ["026 deterministic canonicalization exists", adapter.includes("function canonicalize") && adapter.includes("Object.keys(value).sort()")],
  ["027 SHA-256 integrity digest required", adapter.includes('crypto.subtle.digest("SHA-256"')],
  ["028 digest is explicitly not signature", adapter.includes("it is not a digital signature")],
  ["029 export marks complete and not partial", adapter.includes("complete: true") && adapter.includes("partialExport: false")],
  ["030 export records Smart Opportunity and PSA authorities", adapter.includes('recommendation: "Smart Opportunity"') && adapter.includes('gradingGuidance: "Existing PSA intelligence"')],
  ["031 export records SQLite source", adapter.includes('sourceOfTruth: "SQLite"')],
  ["032 export denies transaction authority", adapter.includes("transactionAuthority: false")],
  ["033 active listings remain non-evidence", adapter.includes("Active listings are discovery context and are not completed-sale evidence")],
  ["034 current portfolio value is not invented", adapter.includes("Current portfolio value and performance are not calculated")],
  ["035 JSON includes governed source set", ["savedOpportunity", "governedEvidence", "savedPsaGuidance", "customerLifecycle"].every(value => adapter.includes(value))],
  ["036 CSV includes digest and lifecycle history", adapter.includes('["manifest", "payload_sha256"') && adapter.includes("lifecycle_history_${index + 1}")],
  ["037 filenames sanitized", adapter.includes("replace(/[^A-Za-z0-9._-]/g")],
  ["038 download uses Blob URL and revokes it", adapter.includes("new Blob") && adapter.includes("URL.createObjectURL") && adapter.includes("URL.revokeObjectURL")],
  ["039 no partial fallback", adapter.includes("No partial export or browser-stored fallback was created")],
  ["040 production auth handoff exists", adapter.includes("/production-auth.html")]
].forEach(([name, condition]) => check(name, condition));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function envelope(correlationId, data) {
  return { meta: { contractVersion: "1.0", engineVersion: "test-engine", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId }, data };
}
const item = { id: "opp-1", title: "Saved Ohtani decision", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "WATCH", ask: 525, supportedValue: 600, confidence: 82, liquidity: 75, risk: 38 };
const opportunityDetail = { kind: "opportunity-detail", opportunity: item };
const evidence = { kind: "evidence", opportunityId: "opp-1", acceptedExactCompletedSales: 4 };
const psa = { kind: "psa-advisor", opportunityId: "opp-1", guidanceStatus: "SAVED_GUIDANCE_AVAILABLE", recalculated: false };
const lifecycle = { kind: "lifecycle-detail", opportunityId: "opp-1", lifecycle: { trackingStatus: "WATCHING", outcomeStatus: "NONE", version: 1 }, history: [] };

function runtime({ hostname = "deploy-preview-37--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured", unauthorized = false } = {}) {
  const calls = [];
  let uuid = 0;
  const window = { location: { hostname, pathname, hash: "#/export/opp-1" }, crypto: { randomUUID: () => `export-${++uuid}`, subtle: { digest: async () => new Uint8Array(32).buffer } }, URL };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (unauthorized) return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required." } }, 401);
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", items: [item] }));
    if (url === "/api/v1/opportunities/opp-1") return response(envelope(correlationId, opportunityDetail));
    if (url === "/api/v1/evidence/opp-1") return response(envelope(correlationId, evidence));
    if (url === "/api/v1/psa-advisor/opp-1") return response(envelope(correlationId, psa));
    if (url === "/api/v1/lifecycle/opp-1") return response(envelope(correlationId, lifecycle));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Map, Error, URL, Blob, TextEncoder, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(adapter, context, { filename: "customer-export.js" });
  return { window, calls, main: { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 40));

const preview = runtime();
check("041 preview app eligible", preview.window.FlipForgeCustomerExport.isEligible());
check("042 preview export render activates", preview.window.FlipForgeCustomerExport.render(preview.main, "opp-1") === true);
await settle();
check("043 preview reads complete source set", preview.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/opportunities/opp-1,/api/v1/evidence/opp-1,/api/v1/psa-advisor/opp-1,/api/v1/lifecycle/opp-1");
check("044 preview renders complete source checklist", preview.main.innerHTML.includes("Complete source set") && preview.main.innerHTML.includes("Governed evidence ledger"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("045 production app eligible", production.window.FlipForgeCustomerExport.isEligible());
check("046 production export render activates", production.window.FlipForgeCustomerExport.render(production.main, "opp-1") === true);
await settle();
check("047 production uses hardened same-origin GETs", production.calls.length === 6 && production.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("048 public marketing path ineligible", marketing.window.FlipForgeCustomerExport.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
disabled.window.FlipForgeCustomerExport.render(disabled.main, "opp-1");
await settle();
check("049 disabled gateway stops after health", disabled.calls.length === 1);
check("050 disabled gateway creates no sample dossier", /safely offline/i.test(disabled.main.innerHTML));

const unauthorized = runtime({ hostname: "goflipforge.com", pathname: "/app/", unauthorized: true });
unauthorized.window.FlipForgeCustomerExport.render(unauthorized.main, "opp-1");
await settle();
check("051 production auth failure offers production handoff", unauthorized.main.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorized.main.innerHTML.includes("/production-auth.html"));

const failures = results.filter(result => !result.passed);
console.log("SaaS customer Decision Dossier production validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
