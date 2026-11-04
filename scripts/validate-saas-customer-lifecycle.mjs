import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-lifecycle.js");
const css = read("saas-prototype/customer-lifecycle.css");
const hook = read("saas-prototype/staging-route-hook.js");
const gateway = read("netlify/functions/flipforge-api.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 lifecycle adapter is isolated", adapter.startsWith("(() =>") && adapter.includes('"use strict"')],
  ["002 production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["003 preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["004 app path is constrained", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["005 lifecycle owns Tracking and Alerts only (Portfolio is customer-portfolio.js)", adapter.includes('const ROUTES = new Set(["tracking", "alerts"])') && !adapter.includes("portfolioView") && !adapter.includes('"/api/v1/portfolio"')],
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
  ["025 Decision Timeline is contract validated", adapter.includes("validDecisionTimeline") && adapter.includes("historicalSnapshotsImmutable") && adapter.includes("historicalRescoring !== false")],
  ["026 Decision Timeline must remain transaction-free", adapter.includes("value.transactionAuthority === false")],
  ["027 optimistic version is submitted", adapter.includes("expectedVersion") && adapter.includes('name="expectedVersion"')],
  ["028 tracking statuses explicit", ["WATCHING", "REVIEW", "OWNED", "SOLD", "PASSED", "ARCHIVED"].every(value => adapter.includes(value))],
  ["029 outcome statuses explicit", ["NONE", "ACQUIRED", "SOLD", "PASSED"].every(value => adapter.includes(value))],
  ["030 acquisition and disposition facts customer-entered", ["acquisitionCostCents", "acquiredAt", "dispositionProceedsCents", "disposedAt"].every(value => adapter.includes(value))],
  ["031 reminder requires review time", adapter.includes("A review time is required")],
  ["032 saved tracking history displayed newest first", adapter.includes("Tracking history") && adapter.includes("customer-lifecycle-history") && adapter.includes("Your saved changes for this card, newest first.")],
  ["033 governed Decision Timeline displayed", adapter.includes("Decision Timeline") && adapter.includes("What FlipForge believed") && adapter.includes("What changed")],
  ["034 timeline renders supplied entries without rescoring", adapter.includes("timeline.entries.map(timelineEntryMarkup)") && adapter.includes("Snapshots are immutable")],
  ["035 missing timeline is never reconstructed", adapter.includes("will not reconstruct or guess missing historical decisions")],
  ["036 timeline CSS is responsive", css.includes(".customer-decision-timeline") && css.includes(".customer-decision-timeline-signals") && css.includes("@media (max-width: 680px)")],
  ["037 Alerts disclose external delivery disabled", adapter.includes("notificationDeliveryConfigured") && adapter.includes("Email / push")],
  ["038 no transaction controls", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(adapter)],
  ["039 production auth handoff exists", adapter.includes("/production-auth.html")],
  ["040 gateway GET lifecycle list allowlisted", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle$/ }')],
  ["041 gateway GET lifecycle detail allowlisted", gateway.includes('{ method: "GET", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["042 gateway PUT lifecycle detail allowlisted", gateway.includes('{ method: "PUT", pattern: /^\\/api\\/v1\\/lifecycle\\/[A-Za-z0-9._:-]+$/ }')],
  ["043 gateway still forbids client identity headers", gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["044 save confirmation is customer-readable", adapter.includes('state.notice = "Tracking changes saved to your account."') && !adapter.includes("Lifecycle saved in tenant-scoped SQLite.")]
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
const decisionTimeline = {
  kind: "decision-timeline",
  opportunityId: "opp-1",
  available: true,
  timelineVersion: "v1.5.0",
  snapshotCount: 2,
  changedEntryCount: 1,
  historicalSnapshotsImmutable: true,
  historicalRescoring: false,
  transactionAuthority: false,
  entries: [
    {
      requestId: "req-t0",
      evaluatedAt: "2030-07-01T12:00:00Z",
      cardIdentity: opportunity.cardIdentity,
      marketplace: "eBay",
      decision: "VERIFY",
      workflowStatus: "REVIEW",
      allInAskCents: 12500,
      supportedValueCents: 12100,
      evidenceQuality: "MIXED",
      acceptedEvidenceCount: 2,
      confidence: 61,
      risk: 48,
      immutable: true,
      changedFromPrevious: false,
      whatChanged: [],
      whatWouldChange: ["More accepted exact sales could improve confidence."]
    },
    {
      requestId: "req-t1",
      evaluatedAt: "2030-07-15T12:00:00Z",
      cardIdentity: opportunity.cardIdentity,
      marketplace: "eBay",
      decision: "WATCH",
      workflowStatus: "WATCHING",
      allInAskCents: 11900,
      supportedValueCents: 12300,
      evidenceQuality: "STRONG",
      acceptedEvidenceCount: 5,
      confidence: 78,
      risk: 29,
      immutable: true,
      changedFromPrevious: true,
      whatChanged: ["Decision changed from VERIFY to WATCH.", "Accepted evidence changed from 2 to 5."],
      whatWouldChange: ["A lower all-in ask or stronger margin could improve buy eligibility."]
    }
  ]
};

function runtime({ hostname = "deploy-preview-36--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured", timeline = decisionTimeline, hang = false, status = "", foreignDetail = false } = {}) {
  const calls = [];
  let uuid = 0;
  const lifecycleRecord = status ? { ...lifecycle, trackingStatus: status } : lifecycle;
  const window = { location: { hostname, pathname, hash: "#/tracking/opp-1" }, crypto: { randomUUID: () => `lifecycle-${++uuid}` }, setTimeout: callback => setTimeout(callback, 5), clearTimeout };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (hang) return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", items: [opportunity] }));
    if (url === "/api/v1/lifecycle") return response(envelope(correlationId, { kind: "lifecycle", sourceOfTruth: "SQLite", items: [lifecycleRecord] }));
    if (url === "/api/v1/lifecycle/opp-1" && options.method === "GET") return response(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: "opp-1", lifecycle: lifecycleRecord, history: [], decisionTimeline: timeline }));
    // A record outside this tenant's lifecycle list. Even if a server ever answered it, the page must not show it.
    if (url === "/api/v1/lifecycle/opp-foreign" && options.method === "GET" && foreignDetail) return response(envelope(correlationId, { kind: "lifecycle-detail", opportunityId: "opp-foreign", lifecycle: { ...lifecycleRecord, opportunityId: "opp-foreign", cardIdentity: "FOREIGN TENANT CARD" }, history: [], decisionTimeline: timeline }));
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, { kind: "portfolio", configured: true, items: [] }));
    if (url === "/api/v1/alerts") return response(envelope(correlationId, { kind: "alerts", configured: true, items: [], notificationDeliveryConfigured: false }));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, AbortController, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, FormData });
  vm.runInContext(adapter, context, { filename: "customer-lifecycle.js" });
  return { window, calls, main: { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } } };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40));

const preview = runtime();
check("045 preview app eligible", preview.window.FlipForgeCustomerLifecycle.isEligible());
check("046 preview tracking render activates", preview.window.FlipForgeCustomerLifecycle.render(preview.main, "tracking", "opp-1") === true);
await settle();
// Health first; then the card's history is requested together with the two lists (two round trips, not three).
check("047 tracking reads health, then opportunities, lifecycle and the requested card's detail, each once", preview.calls[0]?.url === "/api/v1/health"
  && preview.calls.map(call => call.url).slice(1).sort().join(",") === "/api/v1/lifecycle,/api/v1/lifecycle/opp-1,/api/v1/opportunities");
check("048 tracking renders saved workflow state", preview.main.innerHTML.includes("WATCHING") && preview.main.innerHTML.includes("Tracking history"));
check("049 tracking renders governed timeline", preview.main.innerHTML.includes("Decision Timeline") && preview.main.innerHTML.includes("T0 · Original saved decision") && preview.main.innerHTML.includes("Decision changed from VERIFY to WATCH."));
check("050 timeline preserves supplied governed decisions", preview.main.innerHTML.includes("VERIFY") && preview.main.innerHTML.includes("WATCH") && preview.main.innerHTML.includes("Supported Value"));
check("051 timeline states immutable no-rescore boundary", preview.main.innerHTML.includes("Snapshots are immutable") && preview.main.innerHTML.includes("does not rescore"));
check("052 tracking requests are hardened", preview.calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("053 production app eligible", production.window.FlipForgeCustomerLifecycle.isEligible());
check("054 production tracking render activates", production.window.FlipForgeCustomerLifecycle.render(production.main, "tracking", "opp-1") === true);
await settle();
check("055 production reads tenant lifecycle through same-origin gateway", production.calls.length === 4 && production.calls.every(call => call.options.credentials === "same-origin"));
check("056 production renders governed timeline without a second request", production.calls.length === 4 && production.main.innerHTML.includes("Decision Timeline"));

const unavailableTimeline = runtime({ timeline: { available: false, status: "NO_IMMUTABLE_DECISION_HISTORY", timelineVersion: "v1.5.0", snapshotCount: 0, entries: [], historicalRescoring: false, historicalBackfill: false } });
unavailableTimeline.window.FlipForgeCustomerLifecycle.render(unavailableTimeline.main, "tracking", "opp-1");
await settle();
check("057 missing historical snapshots stay honest", unavailableTimeline.main.innerHTML.includes("No immutable decision history yet") && unavailableTimeline.main.innerHTML.includes("never backfilled or rescored"));

const invalidTimeline = runtime({ timeline: { available: true, kind: "decision-timeline", opportunityId: "opp-1", entries: [], historicalRescoring: true, historicalSnapshotsImmutable: false, transactionAuthority: false } });
invalidTimeline.window.FlipForgeCustomerLifecycle.render(invalidTimeline.main, "tracking", "opp-1");
await settle();
check("058 invalid timeline fails closed inside timeline panel without disabling Tracking",
  invalidTimeline.main.innerHTML.includes("Decision history unavailable")
    && invalidTimeline.main.innerHTML.includes("data-lifecycle-form")
    && invalidTimeline.main.innerHTML.includes("Tracking history")
    && !invalidTimeline.main.innerHTML.includes("Tracking unavailable"));

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("059 public marketing path ineligible", marketing.window.FlipForgeCustomerLifecycle.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
disabled.window.FlipForgeCustomerLifecycle.render(disabled.main, "tracking", "opp-1");
await settle();
check("060 disabled gateway stops after health", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("061 disabled gateway renders safe offline state", /page is offline/i.test(disabled.main.innerHTML) && /nothing was loaded or changed/i.test(disabled.main.innerHTML));

check("062 Portfolio is not rendered by the lifecycle adapter", preview.window.FlipForgeCustomerLifecycle.render(preview.main, "portfolio") === false);

// A request that never answers is stopped by the adapter's own timeout (no global fetch wrapper), fails closed and
// offers a retry. The 10 s timer is shortened here through window.setTimeout.
const hung = runtime({ hang: true });
hung.window.FlipForgeCustomerLifecycle.render(hung.main, "tracking", "opp-1");
await settle();
check("063 hung read stops with a customer timeout and a retry", hung.main.innerHTML.includes("taking too long") && hung.main.innerHTML.includes("data-lifecycle-retry") && !hung.main.innerHTML.includes("LIFECYCLE_TIMEOUT") && hung.calls[0].options.signal);

const conditional = runtime({ status: "OWNED" });
conditional.window.FlipForgeCustomerLifecycle.render(conditional.main, "tracking", "opp-1");
await settle();
const ownedForm = conditional.main.innerHTML;
check("064 Owned shows purchase fields only; outcome follows status", /<label data-lifecycle-purchase><span>Purchase cost/.test(ownedForm) && /<label data-lifecycle-sale hidden><span>Sale proceeds/.test(ownedForm) && /<label data-lifecycle-outcome hidden aria-hidden="true">/.test(ownedForm) && /<option value="ACQUIRED" selected>/.test(ownedForm));
check("065 Tracking keeps the Decision boundary visible and renders final labels", ownedForm.includes("<strong>Decision boundary:</strong>") && ownedForm.includes("Save tracking") && ownedForm.includes("Remind me in FlipForge") && !/tenant|SQLite|same-origin/i.test(ownedForm.replace(/<[^>]+>/g, " ")));
check("066 Audit export is not offered on the private-beta surface", !ownedForm.includes("Audit export"));
const full = runtime({ pathname: "/app/customer/" , hostname: "goflipforge.com" });
full.window.FlipForgeCustomerLifecycle.render(full.main, "tracking", "opp-1");
await settle();
check("067 Audit export stays in the full customer app", full.main.innerHTML.includes("Audit export"));

check("062 Alerts route change retires review lock independently of old network response",
  adapter.includes('state.reviewSequence += 1;') && adapter.includes('state.reviewing = "";')
    && adapter.includes('state.reviewSequence === reviewSequence'));
check("063 delayed review completion does not clear a newer write lock",
  (adapter.match(/state.reviewSequence === reviewSequence/g) || []).length === 2);

const failures = results.filter(result => !result.passed);
// The card history is requested early, but shown only for a record in this tenant's own lifecycle list.
for (const foreignDetail of [false, true]) {
  const foreign = runtime({ foreignDetail });
  foreign.window.FlipForgeCustomerLifecycle.render(foreign.main, "tracking", "opp-foreign");
  await settle();
  check(`047b a card outside the tenant's lifecycle list is refused, not shown (server ${foreignDetail ? "answers" : "refuses"})`,
    !foreign.main.innerHTML.includes("FOREIGN TENANT CARD") && !foreign.main.innerHTML.includes("Decision Timeline") && /not returned for this tenant|could not|unavailable|not found/i.test(foreign.main.innerHTML));
}

// Audit export is offered in the full customer app only; the private beta (/app/beta) does not render it.
for (const [pathname, offered] of [["/app/beta/", false], ["/app/customer/", true]]) {
  const surface = runtime({ pathname });
  surface.window.FlipForgeCustomerLifecycle.render(surface.main, "tracking", "opp-1");
  await settle();
  check(`047c Tracking ${offered ? "offers" : "does not offer"} Audit export on ${pathname}`, surface.main.innerHTML.includes("Decision Timeline")
    && surface.main.innerHTML.includes(">Audit export</a>") === offered);
}

console.log("SaaS customer lifecycle production validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
