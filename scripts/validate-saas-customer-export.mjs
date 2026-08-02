import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  adapter: read("saas-prototype/customer-export.js"),
  css: read("saas-prototype/customer-export.css"),
  hook: read("saas-prototype/staging-route-hook.js"),
  index: read("saas-prototype/index.html"),
  intelligence: read("saas-prototype/staging-browser.js"),
  lifecycle: read("saas-prototype/customer-lifecycle.js"),
  beta: read("saas-prototype/private-beta.js"),
  docs: read("docs/SAAS_CUSTOMER_DECISION_DOSSIER.md"),
  betaDocs: read("docs/SAAS_PRIVATE_BETA_READINESS.md"),
  package: read("package.json"),
  netlify: read("netlify.toml")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 export adapter exists", files.adapter.includes("FlipForgeCustomerExport")],
  ["002 adapter is strict-mode isolated", files.adapter.startsWith("(() =>") && files.adapter.includes('"use strict"')],
  ["003 adapter is preview constrained", files.adapter.includes("PREVIEW_HOST") && files.adapter.includes("eligibleHost")],
  ["004 export route is explicit", files.adapter.includes('return route === "export"')],
  ["005 Export is in navigation", files.index.includes('href="#/export"') && files.index.includes('data-route="export"')],
  ["006 export stylesheet is loaded", files.index.includes('href="customer-export.css"')],
  ["007 export script loads before route hook", files.index.indexOf('src="customer-export.js"') < files.index.indexOf('src="staging-route-hook.js"')],
  ["008 route hook loads export adapter", files.hook.includes("FlipForgeCustomerExport") && files.hook.includes("exportAdapter.render")],
  ["009 Card Intelligence links export", files.intelligence.includes('["export", "Audit export"]')],
  ["010 Tracking links export", files.lifecycle.includes('href="#/export/${encodeURIComponent(state.selectedId || "")}"')],
  ["011 browser reads fixed health route", files.adapter.includes('"/api/v1/health"')],
  ["012 browser reads fixed opportunities route", files.adapter.includes('"/api/v1/opportunities"')],
  ["013 detail sources are identifier constrained", files.adapter.includes('(opportunities|evidence|psa-advisor|lifecycle)') && files.adapter.includes("SAFE_ID")],
  ["014 export uses GET only", files.adapter.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(files.adapter)],
  ["015 requests use same-origin credentials", files.adapter.includes('credentials: "same-origin"')],
  ["016 requests disable caching", files.adapter.includes('cache: "no-store"')],
  ["017 requests reject redirects", files.adapter.includes('redirect: "error"')],
  ["018 browser sends no trusted identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.adapter)],
  ["019 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(files.adapter)],
  ["020 browser stores no dossier", !/localStorage|sessionStorage|document\.cookie|indexedDB/i.test(files.adapter)],
  ["021 authority contract is exact", files.adapter.includes('meta.authority === "Smart Opportunity"')],
  ["022 grading authority contract is exact", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["023 correlation ID is validated", files.adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["024 response size is bounded", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("EXPORT_RESPONSE_TOO_LARGE")],
  ["025 opportunity detail kind and ID are matched", files.adapter.includes('kind !== "opportunity-detail"') && files.adapter.includes("EXPORT_OPPORTUNITY_INVALID")],
  ["026 evidence kind and ID are matched", files.adapter.includes('kind !== "evidence"') && files.adapter.includes("EXPORT_EVIDENCE_INVALID")],
  ["027 PSA is saved not recalculated", files.adapter.includes('kind !== "psa-advisor"') && files.adapter.includes("psa?.recalculated !== false")],
  ["028 lifecycle includes history", files.adapter.includes('kind !== "lifecycle-detail"') && files.adapter.includes("!Array.isArray(lifecycle?.history)")],
  ["029 all four detail sources are required", ["sources.opportunity", "sources.evidence", "sources.psa", "sources.lifecycle"].every(value => files.adapter.includes(value))],
  ["030 source requests are atomic", files.adapter.includes("Promise.all([") && !files.adapter.includes("Promise.allSettled")],
  ["031 deterministic canonicalization exists", files.adapter.includes("function canonicalize") && files.adapter.includes("Object.keys(value).sort()")],
  ["032 Web Crypto SHA-256 is required", files.adapter.includes('crypto.subtle.digest("SHA-256"')],
  ["033 digest unavailability fails closed", files.adapter.includes("EXPORT_DIGEST_UNAVAILABLE")],
  ["034 manifest identifies complete export", files.adapter.includes("complete: true") && files.adapter.includes("partialExport: false")],
  ["035 SHA-256 is not called a signature", files.adapter.includes("it is not a digital signature")],
  ["036 JSON export includes authority boundary", files.adapter.includes('recommendation: "Smart Opportunity"') && files.adapter.includes('gradingGuidance: "Existing PSA intelligence"')],
  ["037 JSON export records SQLite source", files.adapter.includes('sourceOfTruth: "SQLite"')],
  ["038 JSON export denies transaction authority", files.adapter.includes("transactionAuthority: false")],
  ["039 no invented current value", files.adapter.includes("Current portfolio value and performance are not calculated")],
  ["040 active listings stay ineligible", files.adapter.includes("Active listings are discovery context and are not completed-sale evidence")],
  ["041 JSON contains governed source set", ["savedOpportunity", "governedEvidence", "savedPsaGuidance", "customerLifecycle"].every(value => files.adapter.includes(value))],
  ["042 CSV carries payload digest", files.adapter.includes('["manifest", "payload_sha256"')],
  ["043 CSV includes lifecycle events", files.adapter.includes("lifecycle_history_${index + 1}")],
  ["044 CSV escapes spreadsheet values", files.adapter.includes("function csvCell") && files.adapter.includes("replace(/\"/g, '\"\"')")],
  ["045 download filenames are sanitized", files.adapter.includes("replace(/[^A-Za-z0-9._-]/g")],
  ["046 downloads use Blob URLs", files.adapter.includes("new Blob") && files.adapter.includes("URL.createObjectURL") && files.adapter.includes("URL.revokeObjectURL")],
  ["047 download link prevents opener", files.adapter.includes('anchor.rel = "noopener"')],
  ["048 no partial export copy exists", files.adapter.includes("No partial export or browser-stored fallback was created")],
  ["049 disabled bridge creates no sample", files.adapter.includes("no tenant data was read and no sample dossier was created")],
  ["050 Beta Guide includes dossier", files.beta.includes("Create a Decision Dossier") && files.beta.includes("SHA-256 integrity manifest")],
  ["051 Beta limits identify real export", files.beta.includes("Decision Dossier audit export")],
  ["052 docs require complete source match", files.docs.includes("all four sources") && files.docs.includes("No partial dossier")],
  ["053 docs preserve recommendation authority", files.docs.includes("Smart Opportunity remains the sole recommendation authority")],
  ["054 docs preserve grading authority", files.docs.includes("Existing PSA intelligence remains the sole grading-guidance authority")],
  ["055 docs preserve SQLite authority", files.docs.includes("SQLite remains the source of truth")],
  ["056 docs disclose digest boundary", files.docs.includes("It is not a digital signature")],
  ["057 docs preserve zero transaction authority", files.docs.includes("bid, purchase, listing, offer, checkout, payment, or transfer")],
  ["058 docs keep production disabled", files.docs.includes("Production remains unchanged and disabled")],
  ["059 private beta docs identify export", files.betaDocs.includes("Decision Dossier export") && files.betaDocs.includes("SHA-256")],
  ["060 package exposes export validation", files.package.includes('"validate:customer-export"')],
  ["061 Netlify build runs export validation", files.netlify.includes("validate:customer-export")],
  ["062 responsive tablet layout exists", files.css.includes("@media (max-width: 900px)")],
  ["063 responsive mobile layout exists", files.css.includes("@media (max-width: 680px)")],
  ["064 keyboard focus is visible", files.css.includes(":focus-visible")],
  ["065 reduced motion is respected", files.css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "decision-dossier+test",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-02T21:00:00Z",
      evidenceFreshness: "SAVED_GOVERNED_CONTEXT",
      limitations: ["Decision support only."]
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const item = {
  id: "opp-1",
  title: "Saved Ohtani decision",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  recommendation: "WATCH",
  ask: 525,
  supportedValue: 600,
  confidence: 82,
  liquidity: 75,
  risk: 35
};

const evidence = {
  kind: "evidence",
  opportunityId: "opp-1",
  acceptedExactCompletedSales: 2,
  visibleButAuthorityIneligible: 1,
  linkedEvidence: [],
  timeline: []
};

const psa = {
  kind: "psa-advisor",
  opportunityId: "opp-1",
  recalculated: false,
  guidanceStatus: "SAVED_GUIDANCE_AVAILABLE",
  savedPsaSnapshot: { capturedAt: "2026-08-02T19:00:00Z" }
};

const lifecycle = {
  kind: "lifecycle-detail",
  opportunityId: "opp-1",
  lifecycle: { opportunityId: "opp-1", trackingStatus: "WATCHING", outcomeStatus: "NONE", version: 1 },
  history: [{ eventId: 1, eventType: "CREATED", trackingStatus: "WATCHING", outcomeStatus: "NONE", recordVersion: 1, recordedAt: "2026-08-02T19:00:00Z" }]
};

function makeMain() {
  const handlers = new Map();
  const element = selector => ({
    value: "opp-1",
    addEventListener(type, handler) { handlers.set(`${selector}:${type}`, handler); }
  });
  return {
    innerHTML: "",
    focus() {},
    querySelector(selector) {
      if (!this.innerHTML.includes(selector.replace(/^\[data-|\]$/g, ""))) return null;
      return element(selector);
    },
    click(selector) {
      const handler = handlers.get(`${selector}:click`);
      if (!handler) throw new Error(`No click handler for ${selector}`);
      return handler({ preventDefault() {} });
    },
    handlers
  };
}

function runtime({ hostname = "deploy-preview-37--goflipforge.netlify.app", healthStatus = "configured", authority = "Smart Opportunity", requestedMismatch = false, digestAvailable = true } = {}) {
  const calls = [];
  const downloads = [];
  let uuid = 0;
  const window = {
    location: { hostname, hash: "#/export/opp-1" },
    crypto: {
      randomUUID: () => `customer-export-${++uuid}`,
      subtle: digestAvailable ? { digest: async () => new Uint8Array(32).fill(0xab).buffer } : null
    }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", count: 1, items: [item] }, authority));
    if (url === "/api/v1/opportunities/opp-1") return response(envelope(correlationId, { kind: "opportunity-detail", opportunity: requestedMismatch ? { ...item, id: "other" } : item }, authority));
    if (url === "/api/v1/evidence/opp-1") return response(envelope(correlationId, evidence, authority));
    if (url === "/api/v1/psa-advisor/opp-1") return response(envelope(correlationId, psa, authority));
    if (url === "/api/v1/lifecycle/opp-1") return response(envelope(correlationId, lifecycle, authority));
    throw new Error(`Unexpected request ${url}`);
  };
  const document = {
    createElement(tag) {
      if (tag !== "a") throw new Error(`Unexpected element ${tag}`);
      return { click() { downloads.push({ href: this.href, download: this.download, rel: this.rel }); } };
    }
  };
  const URL = {
    createObjectURL(blob) { return `blob:test-${blob.size}`; },
    revokeObjectURL(url) { downloads.push({ revoked: url }); }
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Map, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, JSON, TextEncoder, Uint8Array, Blob, URL, document });
  vm.runInContext(files.adapter, context, { filename: "customer-export.js" });
  return { window, calls, downloads };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 80));

const live = runtime();
const liveMain = makeMain();
check("066 export adapter handles route", live.window.FlipForgeCustomerExport.handles("export") && !live.window.FlipForgeCustomerExport.handles("portfolio"));
check("067 export renders on preview", live.window.FlipForgeCustomerExport.render(liveMain, "opp-1") === true);
await settle();
check("068 export loads complete source set", live.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/opportunities/opp-1,/api/v1/evidence/opp-1,/api/v1/psa-advisor/opp-1,/api/v1/lifecycle/opp-1");
check("069 all export reads use GET", live.calls.every(call => call.options.method === "GET"));
check("070 all export reads use secure browser options", live.calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));
check("071 complete source set is rendered", liveMain.innerHTML.includes("Complete source set") && liveMain.innerHTML.includes("Governed evidence ledger") && liveMain.innerHTML.includes("Lifecycle snapshot"));
check("072 prepare control is bound", liveMain.handlers.has("[data-customer-export-prepare]:click"));
await liveMain.click("[data-customer-export-prepare]");
await settle();
check("073 digest is rendered", liveMain.innerHTML.includes("abababababababababababababababababababababababababababababababab"));
check("074 manifest discloses digest boundary", liveMain.innerHTML.includes("not a digital signature"));
check("075 prepared package remains memory-only", liveMain.innerHTML.includes("Nothing was uploaded or saved to browser storage"));
check("076 JSON download is bound", liveMain.handlers.has("[data-customer-export-json]:click"));
check("077 CSV download is bound", liveMain.handlers.has("[data-customer-export-csv]:click"));
liveMain.click("[data-customer-export-json]");
liveMain.click("[data-customer-export-csv]");
check("078 JSON download filename is safe", live.downloads.some(entry => entry.download === "flipforge-decision-dossier-opp-1.json" && entry.rel === "noopener"));
check("079 CSV download filename is safe", live.downloads.some(entry => entry.download === "flipforge-decision-dossier-opp-1.csv" && entry.rel === "noopener"));
check("080 download URLs are revoked", live.downloads.filter(entry => entry.revoked).length === 2);

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = makeMain();
disabled.window.FlipForgeCustomerExport.render(disabledMain, "opp-1");
await settle();
check("081 disabled bridge makes health request only", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("082 disabled bridge renders honest offline state", disabledMain.innerHTML.includes("safely offline") && disabledMain.innerHTML.includes("no sample dossier"));

const mismatch = runtime({ requestedMismatch: true });
const mismatchMain = makeMain();
mismatch.window.FlipForgeCustomerExport.render(mismatchMain, "opp-1");
await settle();
check("083 mismatched record fails closed", mismatchMain.innerHTML.includes("EXPORT_OPPORTUNITY_INVALID") && mismatchMain.innerHTML.includes("No partial export"));
check("084 mismatch exposes no prepare control", !mismatchMain.innerHTML.includes("data-customer-export-prepare"));

const invalidAuthority = runtime({ authority: "Second Engine" });
const invalidAuthorityMain = makeMain();
invalidAuthority.window.FlipForgeCustomerExport.render(invalidAuthorityMain, "opp-1");
await settle();
check("085 invalid authority fails before detail export", invalidAuthorityMain.innerHTML.includes("EXPORT_CONTRACT_INVALID") && invalidAuthority.calls.length === 2);

const otherTenant = runtime();
const otherTenantMain = makeMain();
otherTenant.window.FlipForgeCustomerExport.render(otherTenantMain, "other-tenant-record");
await settle();
check("086 unowned requested ID stops before detail reads", otherTenant.calls.length === 2 && otherTenantMain.innerHTML.includes("RESOURCE_NOT_FOUND"));

const noDigest = runtime({ digestAvailable: false });
const noDigestMain = makeMain();
noDigest.window.FlipForgeCustomerExport.render(noDigestMain, "opp-1");
await settle();
await noDigestMain.click("[data-customer-export-prepare]");
await settle();
check("087 missing Web Crypto fails closed", noDigestMain.innerHTML.includes("EXPORT_DIGEST_UNAVAILABLE"));
check("088 missing digest creates no download", noDigest.downloads.length === 0);

const production = runtime({ hostname: "goflipforge.com" });
const productionMain = makeMain();
check("089 production refuses export adapter", production.window.FlipForgeCustomerExport.render(productionMain, "opp-1") === false && production.calls.length === 0);

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerExportValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;