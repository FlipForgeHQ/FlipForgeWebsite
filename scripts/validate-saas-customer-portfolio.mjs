import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const adapter = read("saas-prototype/customer-portfolio.js");
const hook = read("saas-prototype/staging-route-hook.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 Portfolio production host is explicit", adapter.includes("PRODUCTION_HOST") && adapter.includes("goflipforge")],
  ["002 Portfolio preview host remains explicit", adapter.includes("PREVIEW_HOST") && adapter.includes("deploy-preview")],
  ["003 Portfolio app path is constrained", adapter.includes("APP_PATH") && adapter.includes("saas-prototype")],
  ["004 specialized Portfolio route precedes generic management", hook.indexOf('route === "portfolio"') < hook.indexOf("managementAdapter.handles(route)")],
  ["005 API allowlist is bounded", ["/api/v1/health", "/api/v1/portfolio", "/api/v1/opportunities"].every(value => adapter.includes(value))],
  ["006 Portfolio requests are GET-only", adapter.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(adapter)],
  ["007 same-origin credentials required", adapter.includes('credentials: "same-origin"')],
  ["008 cache disabled", adapter.includes('cache: "no-store"')],
  ["009 redirects rejected", adapter.includes('redirect: "error"')],
  ["010 no trusted tenant header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(adapter)],
  ["011 no browser service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(adapter)],
  ["012 no browser persistence", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(adapter)],
  ["013 Smart Opportunity authority validated", adapter.includes('meta.authority === "Smart Opportunity"')],
  ["014 PSA authority validated", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["015 request correlation validated", adapter.includes("meta.correlationId === expectedCorrelationId")],
  ["016 response size bounded", adapter.includes("PORTFOLIO_RESPONSE_TOO_LARGE")],
  ["017 evidence reference method fixed", adapter.includes("AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES")],
  ["018 minimum exact sales gate fixed at three", adapter.includes("reference.minimumAcceptedExactSales !== 3")],
  ["019 maximum latest-sale age fixed at thirty days", adapter.includes("reference.maximumLatestSaleAgeDays !== 30")],
  ["020 active listings prohibited from reference", adapter.includes("reference.activeListingsUsed !== false")],
  ["021 provider call prohibited during Portfolio read", adapter.includes("reference.providerCallPerformed !== false")],
  ["022 reference is not persisted valuation", adapter.includes("reference.persistedAsValuation !== false")],
  ["023 appraisal prohibited", adapter.includes("reference.appraisal !== false")],
  ["024 transaction authority prohibited", adapter.includes("reference.transactionAuthority !== false")],
  ["025 performance is unrealized only", adapter.includes("performance.realized !== false")],
  ["026 fees and taxes excluded", adapter.includes("performance.feesIncluded !== false") && adapter.includes("performance.taxesIncluded !== false")],
  ["027 liquidation estimate excluded", adapter.includes("performance.liquidationEstimate !== false")],
  ["028 partial reference coverage cannot invent whole total", adapter.includes("!data.completeReferenceCoverage && data.completePortfolioReferenceValueCents !== null")],
  ["029 partial performance coverage cannot invent whole delta", adapter.includes("!data.completePerformanceCoverage && data.completePortfolioReferenceDeltaCents !== null")],
  ["030 UI labels active asks excluded", adapter.includes("Active asks excluded")],
  ["031 UI states not appraisal", adapter.includes("not a new Smart Opportunity recommendation, appraisal")],
  ["032 production auth recovery exists", adapter.includes("/production-auth.html")]
].forEach(([name, condition]) => check(name, condition));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function envelope(correlationId, data, authority = "Smart Opportunity") {
  return { meta: { contractVersion: "1.0", engineVersion: "test-engine", authority, gradingAuthority: "Existing PSA intelligence", correlationId, limitations: [] }, data };
}

const opportunities = { kind: "opportunities", items: [{ id: "opp-fresh", title: "Ohtani Chrome PSA 10", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10" }] };
const reference = {
  available: true,
  status: "REFERENCE_AVAILABLE",
  valueCents: 70000,
  method: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
  acceptedExactCompletedSales: 4,
  minimumAcceptedExactSales: 3,
  latestSaleDate: "2026-07-28",
  latestSaleAgeDays: 5,
  maximumLatestSaleAgeDays: 30,
  marketplaces: ["CARDSIGHT"],
  exactIdentityRequired: true,
  activeListingsUsed: false,
  providerCallPerformed: false,
  persistedAsValuation: false,
  appraisal: false,
  transactionAuthority: false
};
const performance = {
  available: true,
  status: "REFERENCE_PERFORMANCE_AVAILABLE",
  method: "EVIDENCE_REFERENCE_MINUS_CUSTOMER_COST_BASIS",
  acquisitionCostCents: 52500,
  referenceValueCents: 70000,
  referenceDeltaCents: 17500,
  referenceDeltaPercent: 33.33,
  realized: false,
  feesIncluded: false,
  taxesIncluded: false,
  liquidationEstimate: false,
  appraisal: false,
  transactionAuthority: false
};
const portfolio = {
  kind: "portfolio",
  configured: true,
  transactionAuthority: false,
  currentValueConfigured: true,
  currentValueType: "EVIDENCE_SUPPORTED_REFERENCE_NOT_APPRAISAL",
  currentValueMethod: "AVERAGE_ACCEPTED_EXACT_COMPLETED_SALES",
  performanceConfigured: true,
  performanceType: "UNREALIZED_REFERENCE_COMPARISON",
  count: 1,
  totalCostBasisCents: 52500,
  referenceValueAvailableCount: 1,
  performanceAvailableCount: 1,
  completeReferenceCoverage: true,
  completePerformanceCoverage: true,
  coveredReferenceValueCents: 70000,
  coveredCostBasisCents: 52500,
  coveredReferenceDeltaCents: 17500,
  completePortfolioReferenceValueCents: 70000,
  completePortfolioReferenceDeltaCents: 17500,
  feesIncluded: false,
  taxesIncluded: false,
  liquidationEstimate: false,
  appraisal: false,
  items: [{ opportunityId: "opp-fresh", acquisitionCostCents: 52500, referenceValue: reference, referencePerformance: performance }]
};

// Sell Watch overview as returned by the hosted service (FlipForge2 SaaSSellWatchService), trimmed to what Portfolio reads.
const sellWatch = { kind: "sell-watch", configured: true, tenantScoped: true, authority: "POSITION_REVIEW_PROMPT_ONLY",
  transactionAuthority: false, acquisitionDecisionAffected: false, marketComparisonDisplayed: false,
  marketComparisonStatus: "NO_LICENSED_SOURCE_ACTIVE", count: 1, costBasisAvailableCount: 1,
  items: [{ opportunityId: "opp-fresh", acquisitionCostCents: 52500, quantity: 1, costBasisStatus: "NET_ESTIMATE_AVAILABLE",
    breakEven: [{ channel: "MARKETPLACE", channelName: "Marketplace", priceCents: 62753, costsVersion: 1 }],
    marketComparison: { displayed: false, status: "NO_LICENSED_SOURCE_ACTIVE", evaluated: true } }],
  costProfiles: [{ channel: "MARKETPLACE", channelName: "Marketplace", commissionBps: 1325, version: 1 }],
  channels: [{ channel: "MARKETPLACE", channelName: "Marketplace", costsSaved: true }] };

// Mark as Sold list as returned by FlipForge2 SaaSCustomerReportedSaleService.list(), trimmed to what Portfolio reads.
const sales = { kind: "reported-sales", label: "USER_REPORTED", dataUseEnabled: false, transactionAuthority: false,
  count: 2, realizedWithCompleteFeesCount: 1, realizedProfitWithCompleteFeesCents: 20250, needsReviewCount: 0,
  items: [
    { reportId: "rs_1", opportunityId: "opp-fresh", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", reviewStatus: "PENDING_VERIFICATION",
      sale: { salePriceCents: 165000, saleDate: "2026-10-20" },
      profitLoss: { status: "REALIZED", netProceedsCents: 141750, realizedProfitCents: 20250, realizedReturnPercent: 16.67, feesComplete: true } },
    { reportId: "rs_2", opportunityId: "opp-gone", cardIdentity: "Withdrawn card", reviewStatus: "WITHDRAWN",
      sale: { salePriceCents: 9900, saleDate: "2026-10-01" },
      profitLoss: { status: "REALIZED", netProceedsCents: 9000, realizedProfitCents: 4000, realizedReturnPercent: 80, feesComplete: true } }] };

function paused(data) {
  for (const item of data.items) {
    item.referenceValue = { ...item.referenceValue, available: false, status: "PROVIDER_STORED_HISTORY_NOT_RETAINED", valueCents: null,
      acceptedExactCompletedSales: 0, latestSaleAgeDays: null, latestSaleDate: null };
    item.referencePerformance = { ...item.referencePerformance, available: false, status: "REFERENCE_VALUE_UNAVAILABLE",
      referenceValueCents: null, referenceDeltaCents: null, referenceDeltaPercent: null };
    item.acquiredAt = "2026-09-13T00:00:00Z";
  }
  Object.assign(data, { referenceValueAvailableCount: 0, performanceAvailableCount: 0, completeReferenceCoverage: false,
    completePerformanceCoverage: false, coveredReferenceValueCents: 0, coveredCostBasisCents: 0, coveredReferenceDeltaCents: 0,
    completePortfolioReferenceValueCents: null, completePortfolioReferenceDeltaCents: null });
}

function runtime({ hostname = "deploy-preview-39--goflipforge.netlify.app", pathname = "/saas-prototype/", healthStatus = "configured", mutate = null, unauthorized = false, watch = "off", sold = "off" } = {}) {
  const calls = [];
  const gates = [];
  let uuid = 0;
  const window = { location: { hostname, pathname, hash: "#/portfolio" }, crypto: { randomUUID: () => `portfolio-${++uuid}` } };
  const payload = JSON.parse(JSON.stringify(portfolio));
  if (mutate) mutate(payload);
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId }, data: { status: healthStatus } });
    if (unauthorized) return response({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required." } }, 401);
    if (url === "/api/v1/portfolio") return response(envelope(correlationId, payload));
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, opportunities));
    if (url === "/api/v1/reported-sales") {
      if (sold === "gated") return new Promise(resolve => gates.push(() => resolve(response(envelope(correlationId, JSON.parse(JSON.stringify(sales)))))));
      if (sold === "off") return response({ error: { code: "UPSTREAM_REJECTED", message: "Route not enabled." } }, 404);
      const data = JSON.parse(JSON.stringify(sales));
      if (sold === "tampered") data.label = "VERIFIED";
      return response(envelope(correlationId, data));
    }
    if (url === "/api/v1/sell-watch") {
      if (watch === "pending") return new Promise(() => {});
      if (watch === "gated") return new Promise(resolve => gates.push(() => resolve(response(envelope(correlationId, JSON.parse(JSON.stringify(sellWatch)))))));
      if (watch === "off") return response({ error: { code: "UPSTREAM_REJECTED", message: "Route not enabled." } }, 404);
      const data = JSON.parse(JSON.stringify(sellWatch));
      if (watch === "tampered") data.marketComparisonDisplayed = true;
      return response(envelope(correlationId, data));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({ window, fetch, Response, Intl, Map, Number, String, Object, Array, Math, Date, RegExp, Promise, Set, Error, console, setTimeout, clearTimeout, queueMicrotask, encodeURIComponent });
  new vm.Script(adapter, { filename: "customer-portfolio.js" }).runInContext(context);
  // A stand-in for the shared #main-content element: it knows which page is currently painted into it.
  const main = { innerHTML: "", isConnected: true,
    querySelector(selector) { return selector === ".customer-portfolio-page" && this.innerHTML.includes("customer-portfolio-page") ? {} : null; } };
  return { window, calls, gates, main };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 15));

const preview = runtime();
check("033 preview app is eligible", preview.window.FlipForgeCustomerPortfolio.isEligible());
check("034 preview Portfolio render activates", preview.window.FlipForgeCustomerPortfolio.render(preview.main) === true);
await settle();
check("035 preview flow reads health Portfolio opportunities, then Sell Watch and recorded sales", preview.calls.map(call => call.url).join(",") === "/api/v1/health,/api/v1/portfolio,/api/v1/opportunities,/api/v1/sell-watch,/api/v1/reported-sales");
check("036 evidence reference value renders", preview.main.innerHTML.includes("$700.00"));
check("037 customer cost basis renders", preview.main.innerHTML.includes("$525.00"));
check("038 server reference delta renders", preview.main.innerHTML.includes("+$175.00") && preview.main.innerHTML.includes("+33.33%"));
check("039 active-ask exclusion renders", preview.main.innerHTML.includes("Active asks excluded"));

const empty = runtime({ mutate(data) {
  data.count = 0;
  data.totalCostBasisCents = 0;
  data.referenceValueAvailableCount = 0;
  data.performanceAvailableCount = 0;
  data.completeReferenceCoverage = false;
  data.completePerformanceCoverage = false;
  data.coveredReferenceValueCents = 0;
  data.coveredCostBasisCents = 0;
  data.coveredReferenceDeltaCents = 0;
  data.completePortfolioReferenceValueCents = null;
  data.completePortfolioReferenceDeltaCents = null;
  data.items = [];
} });
empty.window.FlipForgeCustomerPortfolio.render(empty.main);
await settle();
check("040 zero holdings use an honest empty coverage state", empty.main.innerHTML.includes("No holdings yet") && empty.main.innerHTML.includes("No holdings to evaluate"));
check("041 zero holdings do not claim partial coverage", !empty.main.innerHTML.includes("Partial coverage"));

const production = runtime({ hostname: "goflipforge.com", pathname: "/app/" });
check("042 production app is eligible", production.window.FlipForgeCustomerPortfolio.isEligible());
check("043 production Portfolio render activates", production.window.FlipForgeCustomerPortfolio.render(production.main) === true);
await settle();
check("044 production uses hardened same-origin reads", production.calls.every(call => call.options.method === "GET" && call.options.credentials === "same-origin" && call.options.cache === "no-store" && call.options.redirect === "error"));

const marketing = runtime({ hostname: "goflipforge.com", pathname: "/" });
check("045 public marketing path is ineligible", marketing.window.FlipForgeCustomerPortfolio.isEligible() === false);

const disabled = runtime({ healthStatus: "disabled" });
disabled.window.FlipForgeCustomerPortfolio.render(disabled.main);
await settle();
check("046 disabled gateway stops after health", disabled.calls.length === 1);
check("047 disabled gateway renders no sample value", /safely offline/i.test(disabled.main.innerHTML) && !disabled.main.innerHTML.includes("$700.00"));

const contaminated = runtime({ mutate: value => { value.items[0].referenceValue.activeListingsUsed = true; } });
contaminated.window.FlipForgeCustomerPortfolio.render(contaminated.main);
await settle();
check("048 active-listing contamination fails closed", contaminated.main.innerHTML.includes("PORTFOLIO_REFERENCE_CONTRACT_INVALID"));
check("049 contaminated reference never renders", !contaminated.main.innerHTML.includes("$700.00"));

check("050 Sell Watch switched off: no Sell Watch section or column", !preview.main.innerHTML.includes("data-portfolio-sell-watch") && !preview.main.innerHTML.includes("Check a price"));
check("051 the reference wording no longer says fees are excluded as if they were counted", !adapter.includes("Fees, taxes, shipping, insurance, liquidity discounts, and transaction timing are excluded")
  && preview.main.innerHTML.includes("does not subtract selling fees"));
check("052 the old evidence claim is gone from the heading", !adapter.includes("fresh governed completed-sale evidence"));

const pausedOff = runtime({ mutate: paused });
pausedOff.window.FlipForgeCustomerPortfolio.render(pausedOff.main);
await settle();
const p = pausedOff.main.innerHTML;
check("053 paused values: one clear paused message instead of per-row Unavailable", p.includes("Card values are paused") && p.includes("data-portfolio-values-paused")
  && !p.includes("Unavailable") && !p.includes("Partial coverage") && !p.includes("Coverage-aware totals"));
check("054 paused values: holdings and what was paid still shown", p.includes("Ohtani Chrome PSA 10") && p.includes("$525.00") && p.includes("Sep 13, 2026") && p.includes("Total paid"));
check("055 paused values without Sell Watch: no Check a price", !p.includes("Check a price") && !p.includes("data-portfolio-sell-watch"));

const pausedOn = runtime({ mutate: paused, watch: "on" });
pausedOn.window.FlipForgeCustomerPortfolio.render(pausedOn.main);
await settle();
const q = pausedOn.main.innerHTML;
check("056 paused values with Sell Watch: saved channels shown", q.includes("data-portfolio-sell-watch") && q.includes("Selling costs saved for: <strong>Marketplace</strong>"));
check("057 paused values with Sell Watch: each card links to Check a price on its tracked card", q.includes('href="#/tracking/opp-fresh">Check a price</a>'));
check("058 Sell Watch read is GET-only like every Portfolio read", pausedOn.calls.every(call => call.options.method === "GET"));

const tampered = runtime({ mutate: paused, watch: "tampered" });
tampered.window.FlipForgeCustomerPortfolio.render(tampered.main);
await settle();
check("059 a Sell Watch response claiming a displayed comparison is ignored; Portfolio still renders", !tampered.main.innerHTML.includes("data-portfolio-sell-watch")
  && tampered.main.innerHTML.includes("Card values are paused"));

const liveOn = runtime({ watch: "on" });
liveOn.window.FlipForgeCustomerPortfolio.render(liveOn.main);
await settle();
check("060 values available with Sell Watch: reference still shown and each card links to Check a price", liveOn.main.innerHTML.includes("$700.00")
  && liveOn.main.innerHTML.includes("Check a price") && liveOn.main.innerHTML.includes("use Check a price on a card"));
// The existing negated disclaimer (check 031) is the one place these words may appear.
const disclaimer = "not a new Smart Opportunity recommendation, appraisal, guaranteed sale value, or transaction instruction";
check("061 no instruction wording in Portfolio copy", !/\b(should|recommend(ed)?|sell now|hold this|list it|guaranteed)\b/i.test((q + liveOn.main.innerHTML).split(disclaimer).join("")));

const pending = runtime({ mutate: paused, watch: "pending" });
pending.window.FlipForgeCustomerPortfolio.render(pending.main);
await settle();
check("062 a slow Sell Watch read never holds up Portfolio: holdings render without it", pending.main.innerHTML.includes("Card values are paused")
  && pending.main.innerHTML.includes("$525.00") && !pending.main.innerHTML.includes("Loading tenant-owned Portfolio context"));

check("063 break-even price from the server shown per card with its channel", q.includes("$627.53") && q.includes("Break-even price")
  && q.includes("lowest price at which you would keep what you paid"));
check("064 Mark as Sold off: no Sold cards section", !q.includes("data-portfolio-realized"));

const soldOn = runtime({ mutate: paused, watch: "on", sold: "on" });
soldOn.window.FlipForgeCustomerPortfolio.render(soldOn.main);
await settle();
const r = soldOn.main.innerHTML;
check("065 Sold cards: server realized total, sale, what was kept and profit shown, labelled user reported", r.includes("data-portfolio-realized")
  && r.includes("+$202.50") && r.includes("$1,650.00") && r.includes("$1,417.50") && r.includes("+16.67%") && r.includes("User reported")
  && r.includes("1 sale with all fees entered"));
check("066 Sold cards: a withdrawn report is not shown", !r.includes("Withdrawn card") && r.includes("<strong>1</strong>"));
const soldTampered = runtime({ mutate: paused, watch: "on", sold: "tampered" });
soldTampered.window.FlipForgeCustomerPortfolio.render(soldTampered.main);
await settle();
check("067 a sales response claiming verification is ignored", !soldTampered.main.innerHTML.includes("data-portfolio-realized")
  && soldTampered.main.innerHTML.includes("Card values are paused"));
const soldOnly = runtime({ sold: "on", mutate(data) {
  Object.assign(data, { count: 0, totalCostBasisCents: 0, referenceValueAvailableCount: 0, performanceAvailableCount: 0,
    completeReferenceCoverage: false, completePerformanceCoverage: false, coveredReferenceValueCents: 0, coveredCostBasisCents: 0,
    coveredReferenceDeltaCents: 0, completePortfolioReferenceValueCents: null, completePortfolioReferenceDeltaCents: null, items: [] });
} });
soldOnly.window.FlipForgeCustomerPortfolio.render(soldOnly.main);
await settle();
check("068 sold cards still show when nothing is owned any more", soldOnly.main.innerHTML.includes("data-portfolio-realized")
  && soldOnly.main.innerHTML.includes("No holdings yet"));

// The route hook paints every page into the same element; Portfolio is never told the customer left.
const TRACKING = '<div class="page customer-tracking-page">Tracking</div>';
const leftDuringSales = runtime({ sold: "gated" });
leftDuringSales.window.FlipForgeCustomerPortfolio.render(leftDuringSales.main);
await settle();
leftDuringSales.main.innerHTML = TRACKING;
leftDuringSales.gates.splice(0).forEach(release => release());
await settle();
check("069 a sales response arriving after the customer left Portfolio does not repaint over the page they are on",
  leftDuringSales.main.innerHTML === TRACKING);
const leftDuringWatch = runtime({ mutate: paused, watch: "gated", sold: "gated" });
leftDuringWatch.window.FlipForgeCustomerPortfolio.render(leftDuringWatch.main);
await settle();
leftDuringWatch.main.innerHTML = TRACKING;
leftDuringWatch.gates.splice(0).forEach(release => release());
await settle();
check("070 a Sell Watch response arriving after the customer left Portfolio does not repaint either",
  leftDuringWatch.main.innerHTML === TRACKING);
leftDuringWatch.window.FlipForgeCustomerPortfolio.refresh();
await settle();
check("071 an outside refresh while another page is shown does nothing", leftDuringWatch.main.innerHTML === TRACKING);
const stayed = runtime({ mutate: paused, watch: "gated", sold: "gated" });
stayed.window.FlipForgeCustomerPortfolio.render(stayed.main);
await settle();
stayed.gates.splice(0).forEach(release => release());
await settle();
check("072 while the customer stays on Portfolio, late Sell Watch and sales responses are still added",
  stayed.main.innerHTML.includes("data-portfolio-sell-watch") && stayed.main.innerHTML.includes("data-portfolio-realized"));

// ---- Portfolio connected to Saved Decisions (2026-10-31) ----
// Each owned card links to its tracked record and saved decision, shows the saved verdict and Max Buy at decision against
// what was paid, never repeats the title as the identity line, and shows dates as "Sep 13, 2026". Legacy results show no
// Max Buy; a card whose saved decision is missing says so; a missing Max Buy is never shown as $0.00.
opportunities.items = [
  { id: "opp-fresh", title: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10", recommendation: "BUY",
    governedDecision: { available: true, recommendation: "BUY", maximumBuyPriceCents: 60000 } },
  { id: "opp-over", title: "Doncic Prizm PSA 10", cardIdentity: "2018 Prizm Luka Doncic #280 PSA 10", recommendation: "Saved WATCH",
    governedDecision: { available: true, recommendation: "WATCH", maximumBuyPriceCents: 50000 } },
  { id: "opp-legacy", title: "Acuna Update PSA 10", cardIdentity: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10", recommendation: "BUY", currentlySupported: false,
    supportedValueStatus: "LEGACY_NOT_CURRENTLY_SUPPORTED", governedDecision: { available: true, recommendation: "BUY", maximumBuyPriceCents: null } },
  { id: "opp-nomax", title: "Wembanyama Prizm PSA 10", cardIdentity: "2023 Prizm Victor Wembanyama #136 PSA 10", recommendation: "VERIFY",
    governedDecision: { available: true, recommendation: "VERIFY", maximumBuyPriceCents: null } }
];
const connected = runtime({ mutate: data => {
  paused(data);
  const base = data.items[0];
  data.items = ["opp-fresh", "opp-over", "opp-legacy", "opp-nomax", "opp-missing"].map((id, i) => ({ ...base, opportunityId: id, acquisitionCostCents: [52500, 52500, 30000, 10000, 9000][i] }));
  data.count = data.items.length;
} });
connected.window.FlipForgeCustomerPortfolio.render(connected.main);
await settle();
const c = connected.main.innerHTML;
const row = id => (c.split("<tr>").find(r => r.includes(`#/tracking/${id}"`)) || "");
check("073 owned card name links to its tracked record", c.includes('href="#/tracking/opp-fresh" data-portfolio-card-link'));
check("074 owned card links to its saved decision", c.includes('href="#/opportunities/opp-fresh" data-portfolio-decision-link'));
check("075 identity line is not a repeat of the title", row("opp-fresh").split("2018 Topps Chrome Shohei Ohtani #150 PSA 10").length === 2);
check("076 identity line still shown when it adds information", row("opp-over").includes("<small>2018 Prizm Luka Doncic #280 PSA 10</small>"));
check("077 bought date is readable", row("opp-fresh").includes("Sep 13, 2026") && !c.includes("2026-09-13"));
check("078 saved verdict and Max Buy at decision shown", row("opp-fresh").includes(">BUY<") && row("opp-fresh").includes("Max Buy $600.00 at decision"));
check("079 paid under the saved Max Buy", row("opp-fresh").includes("You paid $75.00 under it"));
check("080 paid over the saved Max Buy, and a \"Saved WATCH\" label reads WATCH", row("opp-over").includes(">WATCH<") && row("opp-over").includes("You paid $25.00 over it"));
check("081 legacy result: historical wording, no Max Buy or comparison", row("opp-legacy").includes("Saved before current evidence rules") && !row("opp-legacy").includes("Max Buy") && !row("opp-legacy").includes("You paid"));
check("082 no Max Buy at decision: says so, never $0.00", row("opp-nomax").includes("No Max Buy was set at decision") && !row("opp-nomax").includes("$0.00"));
// Combined branch: the decisions list was read, so a card missing from it has no linked decision (not a load failure).
check("083 card with no saved decision says so and offers no decision link", row("opp-missing").includes("No saved decision is linked to this card.") && !row("opp-missing").includes("could not be loaded") && !c.includes('href="#/opportunities/opp-missing"'));
check("084 Saved decision column present", c.includes("<th>Saved decision</th>"));

// ---- Combined Portfolio (#606 + #608, 2026-10-31) ----
// A Max Buy of 0 is what the engine records when no evidence-supported value was established: "no Max Buy", never $0.00.
// Sold cards show the saved decision next to each sale, and realized profit (the server's figure, after entered fees) is
// grouped by what was paid against the Max Buy at decision. A single realized source: Mark as Sold.
opportunities.items.push({ id: "opp-zero", title: "Zero Max Buy VERIFY", cardIdentity: "Zero Max Buy VERIFY", recommendation: "VERIFY",
  governedDecision: { available: true, recommendation: "VERIFY", maximumBuyPriceCents: 0, supportedValueStatus: "NOT_ESTABLISHED" } });
const zero = runtime({ mutate: data => { paused(data); data.items = [{ ...data.items[0], opportunityId: "opp-zero", acquisitionCostCents: 10000 }]; data.count = 1; } });
zero.window.FlipForgeCustomerPortfolio.render(zero.main);
await settle();
check("085 a recorded Max Buy of 0 reads \"No Max Buy was set at decision\", never $0.00", zero.main.innerHTML.includes("No Max Buy was set at decision") && !zero.main.innerHTML.includes("Max Buy $0.00"));
opportunities.items.push({ id: "opp-unestablished", title: "Unestablished VERIFY", cardIdentity: "Unestablished VERIFY", recommendation: "VERIFY",
  governedDecision: { available: true, recommendation: "VERIFY", maximumBuyPriceCents: 45000, supportedValueStatus: "NOT_ESTABLISHED", supportedValueCents: 0 } });
const unestablished = runtime({ mutate: data => { paused(data); data.items = [{ ...data.items[0], opportunityId: "opp-unestablished", acquisitionCostCents: 70000 }]; data.count = 1; } });
unestablished.window.FlipForgeCustomerPortfolio.render(unestablished.main);
await settle();
check("086 a decision that did not establish a supported value shows no Max Buy, even if one was recorded (review on #606)",
  unestablished.main.innerHTML.includes("No Max Buy was set at decision") && !unestablished.main.innerHTML.includes("Max Buy $450.00") && !unestablished.main.innerHTML.includes("You paid"));
sales.items[0].profitLoss.acquisitionCostCents = 121500;  // paid $1,215.00 against the $600.00 Max Buy saved for opp-fresh
sales.items.push({ reportId: "rs_3", opportunityId: "opp-over", cardIdentity: "2018 Prizm Luka Doncic #280 PSA 10", reviewStatus: "PENDING_VERIFICATION",
  sale: { salePriceCents: 48000, saleDate: "2026-10-25" },
  profitLoss: { status: "REALIZED", netProceedsCents: 42000, acquisitionCostCents: 45000, realizedProfitCents: -3000, realizedReturnPercent: -6.67, feesComplete: true } });
sales.items.push({ reportId: "rs_4", opportunityId: "opp-nomax", cardIdentity: "2023 Prizm Victor Wembanyama #136 PSA 10", reviewStatus: "PENDING_VERIFICATION",
  sale: { salePriceCents: 30000, saleDate: "2026-10-26" },
  profitLoss: { status: "REALIZED", netProceedsCents: 27000, acquisitionCostCents: 20000, realizedProfitCents: 7000, realizedReturnPercent: 35, feesComplete: true } });
const combined = runtime({ mutate: paused, watch: "on", sold: "on" });
combined.window.FlipForgeCustomerPortfolio.render(combined.main);
await settle();
const sold = (combined.main.innerHTML.split("data-portfolio-realized")[1] || "");
const soldRow = id => (sold.split("<tr>").find(r => r.includes(id === "opp-over" ? "Doncic" : id === "opp-nomax" ? "Wembanyama" : "Ohtani")) || "");
check("086 Sold cards: a Saved decision column next to each sale", sold.includes("<th>Saved decision</th>") && soldRow("opp-fresh").includes("Max Buy $600.00 at decision"));
check("087 Sold cards: paid over the saved Max Buy is stated with the amount", soldRow("opp-fresh").includes("You paid $615.00 over it"));
check("088 Sold cards: paid under the saved Max Buy", soldRow("opp-over").includes("You paid $50.00 under it"));
check("089 Buying discipline groups the server's realized profit by paid vs Max Buy at decision", sold.includes("data-portfolio-discipline-block")
  && /Paid at or under Max Buy<\/span><strong>[−-]\$30\.00<\/strong><small>1 sale<\/small>/.test(sold)
  && /Paid over Max Buy<\/span><strong>\+\$202\.50<\/strong><small>1 sale<\/small>/.test(sold)
  && /No Max Buy at decision<\/span><strong>\+\$70\.00<\/strong><small>1 sale<\/small>/.test(sold), (sold.match(/Buying discipline[\s\S]{0,600}/) || [""])[0].replace(/<[^>]+>/g, " ").slice(0, 300));
check("090 Buying discipline makes no accuracy or prediction claim", /not a measure of FlipForge's accuracy and not a prediction/.test(sold));
check("091 one realized source: no second realized-results panel on Portfolio", !combined.main.innerHTML.includes("data-ff-portfolio-intelligence"));

const failures = results.filter(result => !result.passed);
console.log("SaaS customer Portfolio production validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
