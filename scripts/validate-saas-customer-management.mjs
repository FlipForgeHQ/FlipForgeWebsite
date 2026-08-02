import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const files = {
  adapter: read("saas-prototype/customer-management.js"),
  css: read("saas-prototype/customer-management.css"),
  index: read("saas-prototype/index.html"),
  hook: read("saas-prototype/staging-route-hook.js"),
  featurePages: read("saas-prototype/feature-pages.js"),
  staging: read("saas-prototype/staging-browser.js"),
  beta: read("saas-prototype/private-beta.js"),
  betaDocs: read("docs/SAAS_PRIVATE_BETA_READINESS.md"),
  docs: read("docs/SAAS_CUSTOMER_MANAGEMENT_WORKSPACE.md"),
  gateway: read("netlify/functions/flipforge-api.js"),
  netlify: read("netlify.toml"),
  packageJson: JSON.parse(read("package.json"))
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer management validator is registered", files.packageJson.scripts?.["validate:customer-management"] === "node scripts/validate-saas-customer-management.mjs"],
  ["002 Netlify build runs customer management validation", files.netlify.includes("npm run validate:customer-management")],
  ["003 customer management adapter exists", exists("saas-prototype/customer-management.js")],
  ["004 customer management styles exist", exists("saas-prototype/customer-management.css")],
  ["005 customer management documentation exists", exists("docs/SAAS_CUSTOMER_MANAGEMENT_WORKSPACE.md")],
  ["006 app loads customer management stylesheet", files.index.includes('href="customer-management.css"')],
  ["007 app loads customer management adapter before route hook", files.index.indexOf('src="customer-management.js"') > files.index.indexOf('src="customer-compare.js"') && files.index.indexOf('src="customer-management.js"') < files.index.indexOf('src="staging-route-hook.js"')],
  ["008 management adapter is deploy-preview constrained", files.adapter.includes("PREVIEW_HOST") && files.adapter.includes("eligibleHost()")],
  ["009 management adapter owns five customer routes", ["psa-advisor", "evidence", "sell", "portfolio", "alerts"].every(route => files.adapter.includes(`"${route}"`))],
  ["010 route hook delegates management routes", files.hook.includes("managementAdapter.handles(route)") && files.hook.includes("managementAdapter.render(main, route, id)")],
  ["011 mock feature renderer yields on managed preview routes", files.featurePages.includes("window.FlipForgeCustomerManagement.handles(route)") && files.featurePages.includes("window.FlipForgeCustomerManagement.isEligible()")],
  ["012 fixed API paths are allowlisted", ["/api/v1/health", "/api/v1/opportunities", "/api/v1/portfolio", "/api/v1/alerts"].every(value => files.adapter.includes(value))],
  ["013 detail API path families are allowlisted", files.adapter.includes("(opportunities|evidence|psa-advisor)")],
  ["014 unsafe saved identifiers are rejected", files.adapter.includes("SAFE_ID.test(decoded)") && files.adapter.includes("SAFE_ID.test(state.requestedId)")],
  ["015 requests use same-origin credentials", files.adapter.includes('credentials: "same-origin"')],
  ["016 requests disable cache", files.adapter.includes('cache: "no-store"')],
  ["017 requests reject redirects", files.adapter.includes('redirect: "error"')],
  ["018 management adapter is GET-only", files.adapter.includes('method: "GET"') && !/method:\s*["']POST/.test(files.adapter)],
  ["019 browser sends no trusted tenant identity", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.adapter)],
  ["020 browser contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(files.adapter)],
  ["021 browser persists no customer management state", !/localStorage|sessionStorage|document\.cookie/.test(files.adapter)],
  ["022 browser validates Smart Opportunity authority", files.adapter.includes('meta.authority === "Smart Opportunity"')],
  ["023 browser validates existing PSA authority", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["024 browser validates request correlation", files.adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["025 response size is bounded", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("CUSTOMER_RESPONSE_TOO_LARGE")],
  ["026 disabled health stops tenant reads", files.adapter.includes('state.health?.data?.status !== "configured"')],
  ["027 disabled health has no mock fallback", files.adapter.includes("no sample data was substituted")],
  ["028 evidence route requires evidence kind", files.adapter.includes('state.evidence?.data?.kind !== "evidence"')],
  ["029 evidence response must match selected opportunity", files.adapter.includes("state.evidence?.data?.opportunityId") && files.adapter.includes("state.selectedId")],
  ["030 Evidence Center renders linked evidence", files.adapter.includes("Linked evidence") && files.adapter.includes("linkedEvidence")],
  ["031 Evidence Center renders manual candidates", files.adapter.includes("Manual evidence candidates") && files.adapter.includes("manualCandidates")],
  ["032 Evidence Center renders ledger history", files.adapter.includes("Evidence history") && files.adapter.includes("timeline")],
  ["033 Evidence Center exposes no operator mutation", files.adapter.includes("cannot accept, reject, hold, relink") && !/data-(?:accept|reject|hold|relink)/.test(files.adapter)],
  ["034 PSA route requires psa-advisor kind", files.adapter.includes('state.psa?.data?.kind !== "psa-advisor"')],
  ["035 PSA route requires saved non-recalculated response", files.adapter.includes("state.psa?.data?.recalculated !== false")],
  ["036 PSA Advisor renders saved snapshot", files.adapter.includes("Saved PSA snapshot") && files.adapter.includes("savedPsaSnapshot")],
  ["037 PSA Advisor renders population context", files.adapter.includes("Population context") && files.adapter.includes("populationContext")],
  ["038 PSA Advisor disclaims grade prediction", files.adapter.includes("never runs or persists a new analysis") && files.adapter.includes("without predicting a grade")],
  ["039 Exit Review reads detail and evidence together", files.adapter.includes("Promise.allSettled") && files.adapter.includes("/api/v1/opportunities/") && files.adapter.includes("/api/v1/evidence/")],
  ["040 Exit Review uses saved factors", ["Liquidity", "Risk", "Confidence", "Accepted exact sales"].every(value => files.adapter.includes(value))],
  ["041 Exit Review creates no new timing score", files.adapter.includes("No sell recommendation was created") && !/readinessScore|timingScore|sellScore/.test(files.adapter)],
  ["042 Exit Review creates no fee estimate", files.adapter.includes("does not invent transaction assumptions") && !/feeAmount|estimatedNet|marketplaceFeePercent/.test(files.adapter)],
  ["043 Exit Review contains no transaction control", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(files.adapter)],
  ["044 Portfolio reads authoritative status", files.adapter.includes('request(`/api/v1/${state.route}`)') && files.adapter.includes('state.feature?.data?.kind !== state.route')],
  ["045 Alerts reads authoritative status", files.adapter.includes("feature status response") && files.adapter.includes("configured")],
  ["046 unavailable routes do not show mock items", files.adapter.includes("No DEV alert, mock rule, fake unread count") && files.adapter.includes("No holdings, cost basis, performance, or gain is fabricated")],
  ["047 topbar removes fake unread count", files.index.includes('aria-label="Alerts"') && !files.index.includes("Alerts, 3 unread") && !files.index.includes('<span class="notification-dot">3</span>')],
  ["048 topbar removes stale prototype date", files.index.includes("Saved intelligence") && !files.index.includes("Jul 21–28, 2026")],
  ["049 Card Intelligence links to management lanes", ["Evidence", "PSA guidance", "Exit review"].every(value => files.staging.includes(value)) && files.staging.includes("customerManagementLink")],
  ["050 management route selection stays in SPA", files.adapter.includes("window.location.hash = `#/${state.route}/")],
  ["051 unknown tenant record fails before detail read", files.adapter.includes("The requested tracked card was not returned for this tenant")],
  ["052 feature status requires boolean configured", files.adapter.includes('typeof state.feature?.data?.configured !== "boolean"')],
  ["053 feature status requires items array", files.adapter.includes("!Array.isArray(state.feature?.data?.items)")],
  ["054 docs prohibit a second authority or database", files.docs.includes("does not create another application, recommendation engine, evidence authority, PSA authority, alert database, portfolio database")],
  ["055 docs preserve SQLite and tenant gateway", files.docs.includes("saved SQLite records") && files.docs.includes("server-injected trusted tenant header")],
  ["056 docs state unavailable write contracts", files.docs.includes("customer holdings, custom alert rules, delivery, review schedules, or outcome writes")],
  ["057 docs retain production inactive boundary", files.docs.includes("Production keeps the existing inactive prototype behavior")],
  ["058 docs retain zero transaction authority", files.docs.includes("guaranteed proceeds, listing, offer, checkout, payment")],
  ["059 Beta Guide includes management lane", files.beta.includes("Evidence Center → PSA Advisor → Exit Review")],
  ["060 Beta Guide identifies provider-backed Discover as the remaining sample", files.beta.includes("Discovery remains a sample") && files.beta.includes("Provider-backed Discover")],
  ["061 Beta Guide reports Portfolio and Alerts status only", files.beta.includes("Portfolio and Alerts are status-only") && files.beta.includes("configured=false")],
  ["062 Beta Guide discloses missing customer writes", files.beta.includes("Custom alerts, review schedules, holdings, and outcomes")],
  ["063 private Beta docs identify real management routes", files.betaDocs.includes("Evidence Center, saved PSA guidance, and Exit Review")],
  ["064 private Beta docs identify authoritative unavailable routes", files.betaDocs.includes("Portfolio and Alerts read authoritative capability status")],
  ["065 gateway already allowlists all management GETs", ["psa-advisor", "evidence", "portfolio", "alerts"].every(value => files.gateway.includes(value))],
  ["066 responsive desktop-to-tablet layout exists", files.css.includes("@media (max-width: 1050px)")],
  ["067 responsive mobile layout exists", files.css.includes("@media (max-width: 680px)")],
  ["068 keyboard focus treatment exists", files.css.includes(":focus-visible")],
  ["069 reduced motion is respected", files.css.includes("prefers-reduced-motion")]
].forEach(([name, condition]) => check(name, condition));

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-smart-opportunity+psa",
      authority,
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-02T18:00:00Z",
      correlationId,
      evidenceFreshness: "CURRENT_SAVED_CONTEXT",
      limitations: ["Decision support only."]
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeMain() {
  return {
    innerHTML: "",
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const opportunity = {
  id: "opp-1",
  title: "Saved Ohtani decision",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  platform: "EBAY",
  recommendation: "BUY",
  workflowStatus: "BUY_READY_CANDIDATE",
  ask: 525,
  supportedValue: 602,
  confidence: 86,
  liquidity: 91,
  risk: 32,
  rank: 88,
  mappingState: "CONFIRMED",
  evidence: { acceptedSales: 4 }
};

const evidenceData = {
  kind: "evidence",
  readOnly: true,
  opportunityId: "opp-1",
  cardIdentity: opportunity.cardIdentity,
  acceptedExactCompletedSales: 4,
  visibleButAuthorityIneligible: 2,
  linkedEvidence: [
    { id: 1, sourceName: "eBay", type: "SOLD_COMP", amount: 590, soldAt: "2026-07-30", identityMatch: true, authorityEligible: true }
  ],
  manualCandidates: [
    { id: 2, saleTitle: "Candidate sale", sourceMarketplace: "Manual", salePrice: 575, saleDate: "2026-07-29", matchConfidence: 72, linkedToOpportunity: false, candidateOnly: true }
  ],
  timeline: [
    { id: 3, recordedAt: "2026-07-31T12:00:00Z", eventType: "EVIDENCE_ACCEPTED", previousState: "HOLD", currentState: "ACCEPTED", reason: "Exact completed sale confirmed." }
  ],
  internalOperatorFieldsExcluded: true,
  authorityBoundary: "Smart Opportunity remains authoritative."
};

const psaData = {
  kind: "psa-advisor",
  readOnly: true,
  opportunityId: "opp-1",
  cardIdentity: opportunity.cardIdentity,
  authoritativeOpportunityRecommendation: "BUY",
  guidanceStatus: "SAVED_GUIDANCE_AVAILABLE",
  savedPsaSnapshot: {
    capturedAt: "2026-07-31T12:00:00Z",
    readinessStatus: "REVIEW_READY",
    reviewPriority: 82,
    recommendationCeiling: "WATCH",
    manualVerificationRequired: true,
    evidenceRefreshRequired: false,
    freshCompEvidenceRequired: false,
    additionalSnapshotRequired: true,
    latestPsaScore: 74,
    latestPsaImpact: "DISPLAY_ONLY",
    sourceVersion: "psa-v1"
  },
  populationContext: { available: true, psa10Population: 1200, psa9Population: 2100, totalPopulation: 4200, freshness: "CURRENT", displayOnly: true },
  authorityConflict: null,
  authorityBoundary: "Existing PSA intelligence only.",
  recalculated: false
};

function runtime({ hostname = "deploy-preview-35--goflipforge.netlify.app", healthStatus = "configured", unauthorized = false, invalidAuthority = false } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, hash: "#/evidence/opp-1" },
    crypto: { randomUUID: () => `customer-management-${++uuid}` }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") {
      return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus, bridgeEnabled: healthStatus === "configured" } });
    }
    if (unauthorized) {
      return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", correlationId } }, 401);
    }
    const authority = invalidAuthority ? "Second Engine" : "Smart Opportunity";
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, { kind: "opportunities", count: 1, items: [opportunity] }, authority));
    if (url === "/api/v1/opportunities/opp-1") return response(envelope(correlationId, { kind: "opportunity-detail", opportunity }, authority));
    if (url === "/api/v1/evidence/opp-1") return response(envelope(correlationId, evidenceData, authority));
    if (url === "/api/v1/psa-advisor/opp-1") return response(envelope(correlationId, psaData, authority));
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, { kind: "portfolio", readOnly: true, configured: false, status: "PORTFOLIO_SOURCE_NOT_CONNECTED", items: [] }, authority));
    if (url === "/api/v1/alerts") return response(envelope(correlationId, { kind: "alerts", readOnly: true, configured: false, status: "CUSTOMER_ALERT_SOURCE_NOT_CONNECTED", items: [] }, authority));
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent });
  vm.runInContext(files.adapter, context, { filename: "customer-management.js" });
  return { window, calls };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40));

const evidence = runtime();
const evidenceMain = makeMain();
check("070 management API exposes route matcher", evidence.window.FlipForgeCustomerManagement.handles("evidence") && !evidence.window.FlipForgeCustomerManagement.handles("discover"));
check("071 Evidence route renders on eligible preview", evidence.window.FlipForgeCustomerManagement.render(evidenceMain, "evidence", "opp-1") === true);
await settle();
check("072 Evidence loads health list and selected ledger", evidence.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/evidence/opp-1");
check("073 Evidence renders authoritative counts", evidenceMain.innerHTML.includes("Accepted exact sales</span><strong>4") && evidenceMain.innerHTML.includes("Visible but ineligible</span><strong>2"));
check("074 Evidence renders linked row", evidenceMain.innerHTML.includes("eBay") && evidenceMain.innerHTML.includes("SOLD_COMP") && evidenceMain.innerHTML.includes("Eligible"));
check("075 Evidence renders manual candidate", evidenceMain.innerHTML.includes("Candidate sale") && evidenceMain.innerHTML.includes("Candidate only"));
check("076 Evidence renders ledger event", evidenceMain.innerHTML.includes("EVIDENCE_ACCEPTED") && evidenceMain.innerHTML.includes("Exact completed sale confirmed"));
check("077 Evidence uses secure reads", evidence.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const psa = runtime();
const psaMain = makeMain();
psa.window.FlipForgeCustomerManagement.render(psaMain, "psa-advisor", "opp-1");
await settle();
check("078 PSA loads health list and selected saved guidance", psa.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/psa-advisor/opp-1");
check("079 PSA renders saved guidance state", psaMain.innerHTML.includes("SAVED_GUIDANCE_AVAILABLE") && psaMain.innerHTML.includes("REVIEW_READY"));
check("080 PSA renders non-recalculated state", psaMain.innerHTML.includes("Recalculated</span><strong>No"));
check("081 PSA renders population context", psaMain.innerHTML.includes("PSA 10 population") && psaMain.innerHTML.includes("1200"));
check("082 PSA renders review requirements", psaMain.innerHTML.includes("Manual verification") && psaMain.innerHTML.includes("Additional snapshot"));

const sell = runtime();
const sellMain = makeMain();
sell.window.FlipForgeCustomerManagement.render(sellMain, "sell", "opp-1");
await settle();
check("083 Exit Review loads health list detail and evidence", sell.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities,/api/v1/opportunities/opp-1,/api/v1/evidence/opp-1");
check("084 Exit Review preserves saved recommendation", sellMain.innerHTML.includes(">BUY<") && sellMain.innerHTML.includes("No sell recommendation was created"));
check("085 Exit Review renders saved market factors", sellMain.innerHTML.includes("Liquidity</span><strong>91/100") && sellMain.innerHTML.includes("Risk</span><strong>32/100"));
check("086 Exit Review discloses outside costs", sellMain.innerHTML.includes("Marketplace and payment fees") && sellMain.innerHTML.includes("Shipping, insurance, and taxes"));
check("087 Exit Review exposes no transaction action", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(sellMain.innerHTML));

const portfolio = runtime();
const portfolioMain = makeMain();
portfolio.window.FlipForgeCustomerManagement.render(portfolioMain, "portfolio");
await settle();
check("088 Portfolio reads health and authoritative status only", portfolio.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/portfolio");
check("089 Portfolio renders honest unavailable state", portfolioMain.innerHTML.includes("PORTFOLIO_SOURCE_NOT_CONNECTED") && portfolioMain.innerHTML.includes("Not connected"));
check("090 Portfolio renders no mock holdings or gains", !portfolioMain.innerHTML.includes("Mahomes") && !portfolioMain.innerHTML.includes("Unrealized change"));

const alerts = runtime();
const alertsMain = makeMain();
alerts.window.FlipForgeCustomerManagement.render(alertsMain, "alerts");
await settle();
check("091 Alerts reads health and authoritative status only", alerts.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/alerts");
check("092 Alerts renders honest unavailable state", alertsMain.innerHTML.includes("CUSTOMER_ALERT_SOURCE_NOT_CONNECTED") && alertsMain.innerHTML.includes("Not connected"));
check("093 Alerts renders no fake rules or toggles", !/Create alert|Pause|Enable|Ohtani supported value/.test(alertsMain.innerHTML) && alertsMain.innerHTML.includes("No DEV alert, mock rule, fake unread count"));

const disabled = runtime({ healthStatus: "disabled" });
const disabledMain = makeMain();
disabled.window.FlipForgeCustomerManagement.render(disabledMain, "evidence", "opp-1");
await settle();
check("094 disabled workspace makes public health request only", disabled.calls.length === 1 && disabled.calls[0].url === "/api/v1/health");
check("095 disabled workspace is honest and mock-free", disabledMain.innerHTML.includes("safely offline") && disabledMain.innerHTML.includes("no sample data was substituted"));

const unauthorized = runtime({ unauthorized: true });
const unauthorizedMain = makeMain();
unauthorized.window.FlipForgeCustomerManagement.render(unauthorizedMain, "evidence", "opp-1");
await settle();
check("096 authentication failure renders secure sign-in", unauthorizedMain.innerHTML.includes("AUTHENTICATION_REQUIRED") && unauthorizedMain.innerHTML.includes("Sign in securely"));
check("097 authentication failure leaks no saved record", !unauthorizedMain.innerHTML.includes("Saved Ohtani decision"));

const invalid = runtime({ invalidAuthority: true });
const invalidMain = makeMain();
invalid.window.FlipForgeCustomerManagement.render(invalidMain, "evidence", "opp-1");
await settle();
check("098 invalid authority fails closed", invalidMain.innerHTML.includes("CUSTOMER_CONTRACT_INVALID") && !invalidMain.innerHTML.includes("Candidate sale"));

const unknown = runtime();
const unknownMain = makeMain();
unknown.window.FlipForgeCustomerManagement.render(unknownMain, "evidence", "other-tenant-record");
await settle();
check("099 unknown record stops before detail read", unknown.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/opportunities" && unknownMain.innerHTML.includes("RESOURCE_NOT_FOUND"));

const production = runtime({ hostname: "goflipforge.com" });
const productionMain = makeMain();
check("100 production refuses customer management adapter", production.window.FlipForgeCustomerManagement.render(productionMain, "evidence", "opp-1") === false && production.calls.length === 0);

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerManagementValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
