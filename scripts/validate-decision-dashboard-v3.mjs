// Static contract for Dashboard V3 Slice 2 (behind the flag): Decision Command Center +
// Decision Dossier sections 2-7. Executes the renderer's pure markup functions against
// fixtures in a sandbox (no DOM, no network) and checks the source for authority rules.
// The fixtures are exported for the Playwright audit (scripts/audit-decision-dashboard-v3-ci.mjs).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

/* ------------------------------ fixtures ------------------------------ */

const G1 = "governed-decision-read-v1";

function governed(overrides = {}) {
  return {
    available: true, status: "GOVERNED_SNAPSHOT", source: "IMMUTABLE_DECISION_SNAPSHOT", readModelVersion: G1,
    recommendation: "WATCH", baseRecommendation: "WATCH", guardrailApplied: true, profitabilityCappedBuy: false,
    profitabilityGateStatus: "MARGIN_OF_SAFETY_NOT_MET", allInAskCents: 64000, maximumBuyPriceCents: 60879,
    expectedNetProfitCents: 5520, conservativeNetProfitCents: 2210, stressNetProfitCents: -4100,
    expectedRoiBasisPoints: 863, conservativeRoiBasisPoints: 345, stressRoiBasisPoints: -641,
    modeledEstimate: true, profitGuaranteed: false, supportedValueStatus: "ESTABLISHED", supportedValueCents: 81250,
    exactTrustedCompCount: 12, confidence: 82, risk: 35,
    reason: "WATCH: expected and conservative modeled net economics stay positive but miss the margin of safety.",
    nextAction: "Track the listing and wait for a better price or stronger evidence.",
    missingRequirement: "None - evidence is ready for review",
    whatWouldChange: ["An all-in ask at or below the Max Buy would meet the margin of safety."],
    whatWouldChangeSource: "DECISION_RECEIPT", evaluatedAt: "2026-10-06T23:54:50Z", snapshotCount: 2,
    workflowStatus: "ACTIVE_WATCHLIST", transactionAuthority: false, immutable: true,
    ...overrides
  };
}

function item(id, overrides = {}, governedOverrides = {}) {
  const gd = governed(governedOverrides);
  return {
    id, databaseId: 1, platform: "EBAY",
    title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9", cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
    recommendation: gd.recommendation, baseRecommendation: gd.baseRecommendation, recommendationSource: "GOVERNED_SNAPSHOT",
    ask: gd.allInAskCents === null ? null : gd.allInAskCents / 100,
    supportedValue: gd.supportedValueCents === null ? null : gd.supportedValueCents / 100,
    supportedValueCents: gd.supportedValueCents, supportedValueStatus: gd.supportedValueStatus, supportedValueStatusReason: null,
    confidence: gd.confidence, risk: gd.risk, liquidity: 75, rank: 72, mappingState: "CONFIRMED",
    evidence: { acceptedSales: 12, earliestSaleDate: "2026-05-24T01:06:00Z", latestSaleDate: "2026-10-03T03:13:01Z", marketplaces: ["CARDSIGHT_EBAY"] },
    governedDecision: gd,
    ...overrides
  };
}

export const FIXTURE_IDS = Object.freeze({ capped: "EBAY-QA-CAPPED-001", verify: "EBAY-QA-VERIFY-002", pass: "EBAY-QA-PASS-003" });

export function g1Items() {
  return [
    item(FIXTURE_IDS.capped, {}, {
      recommendation: "WATCH", baseRecommendation: "BUY", profitabilityCappedBuy: true, profitabilityGateStatus: "MARGIN_OF_SAFETY_NOT_MET"
    }),
    item(FIXTURE_IDS.verify, {
      title: "2024 Panini Prizm #301 Caleb Williams PSA 10", cardIdentity: "2024 Panini Prizm #301 Caleb Williams PSA 10",
      supportedValueStatusReason: "NO_EXACT_EVIDENCE", mappingState: "NOT_CONFIRMED",
      evidence: { acceptedSales: 0, earliestSaleDate: null, latestSaleDate: null, marketplaces: [] }
    }, {
      recommendation: "VERIFY", baseRecommendation: "VERIFY", guardrailApplied: false, supportedValueStatus: "NOT_ESTABLISHED",
      supportedValueCents: null, maximumBuyPriceCents: null, expectedNetProfitCents: null, conservativeNetProfitCents: null,
      stressNetProfitCents: null, expectedRoiBasisPoints: null, conservativeRoiBasisPoints: null, stressRoiBasisPoints: null,
      exactTrustedCompCount: 0, confidence: 40, risk: 80, missingRequirement: "exact completed-sale evidence for this card",
      reason: "VERIFY: no exact completed-sale evidence is accepted for this card yet.",
      nextAction: "Confirm the exact card identity before relying on this listing.", whatWouldChange: []
    }),
    item(FIXTURE_IDS.pass, {
      title: "2022 Topps Update #US44 Julio Rodriguez PSA 10", cardIdentity: "2022 Topps Update #US44 Julio Rodriguez PSA 10"
    }, {
      recommendation: "PASS", baseRecommendation: "PASS", allInAskCents: 75995, profitabilityGateStatus: "NEGATIVE_NET_ECONOMICS",
      expectedNetProfitCents: -5520, conservativeNetProfitCents: -9779, stressNetProfitCents: -15116,
      expectedRoiBasisPoints: -726, conservativeRoiBasisPoints: -1287, stressRoiBasisPoints: -1989,
      reason: "PASS: modeled net economics are negative at this ask.", nextAction: "Skip this listing."
    })
  ];
}

export function envelope(correlationId, data, extra = {}) {
  return {
    meta: {
      contractVersion: "1.0", engineVersion: "dashboard-v3-qa", authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: "2026-10-07T02:00:00Z",
      evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic Dashboard V3 audit fixture only."], ...extra
    },
    data
  };
}

export function opportunitiesData(items, { g1 = true } = {}) {
  return { kind: "opportunities", ...(g1 ? { governedDecisionReadModelVersion: G1 } : {}), count: items.length, readOnly: true,
    tenantIsolation: { enforced: true, defaultAccess: "DENY", visibleOpportunityCount: items.length }, items };
}

export function dashboardData(items, { g1 = true, needsVerification = 1 } = {}) {
  return { kind: "dashboard", ...(g1 ? { governedDecisionReadModelVersion: G1 } : {}), readOnly: true,
    tenantIsolation: { enforced: true, defaultAccess: "DENY", visibleOpportunityCount: items.length },
    metrics: { trackedOpportunities: items.length, needsVerification, evidenceReady: 0, populationContextAvailable: 0 },
    opportunities: items };
}

export function detailData(source) {
  return {
    kind: "opportunity", readOnly: true, governedDecisionReadModelVersion: G1,
    opportunity: { ...source, valueIntelligence: { basis: "DIRECT_EXACT_SOLD", explanation: "Supported value is backed by trusted exact completed-sale evidence.", recommendationAuthority: false } },
    priceIntelligence: {
      kind: "counterfactual-price-intelligence", readOnly: true, thresholdsInvented: false, changesRecommendationAuthority: false,
      transitions: source.id === FIXTURE_IDS.capped ? [{ allInAskCents: 60800, recommendation: "BUY" }] : []
    }
  };
}

export function snapshotFor(items) {
  return {
    dashboard: envelope("qa-dashboard", dashboardData(items)),
    opportunities: envelope("qa-opportunities", opportunitiesData(items))
  };
}

/* ------------------------------ checks ------------------------------ */

function loadRenderer() {
  const source = read("saas-prototype/decision-dashboard-v3.js");
  const window = { location: { hostname: "example.invalid", pathname: "/", search: "", hash: "" } };
  const context = vm.createContext({ window, Intl, Date, Number, String, Object, Array, Math, JSON, URLSearchParams, console });
  vm.runInContext(source, context, { filename: "decision-dashboard-v3.js" });
  if (!window.FlipForgeDashboardV3) throw new Error("Renderer did not publish window.FlipForgeDashboardV3");
  return { api: window.FlipForgeDashboardV3, source, window };
}

function runChecks() {
  const passes = [];
  const failures = [];
  const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

  const { api, source, window } = loadRenderer();
  const css = read("saas-prototype/decision-dashboard-v3.css");
  const v2 = read("saas-prototype/commercial-dashboard-v2.js");
  const guard = read("saas-prototype/production-dashboard-guard.js");
  const build = read("scripts/build-identity-client.mjs");
  const ownership = read("saas-prototype/customer-route-ownership-v1.js");
  const guided = read("saas-prototype/guided-mode-v1.js");

  check("S01 renderer does not claim the route outside the customer app", window.FlipForgeDashboardRenderer === undefined);

  const items = g1Items();
  const snapshot = snapshotFor(items);
  const view = api.viewFromSnapshot(snapshot, "", "ready", {});
  const html = api.markupForView(view);
  check("S02 default selected decision is items[0].id", view.selectedId === items[0].id && html.includes(`data-ffv3-selected="${items[0].id}"`));
  check("S03 ledger keeps server order", (() => {
    const order = [...html.matchAll(/data-ffv3-select="([^"]+)"/g)].map(match => match[1]);
    return JSON.stringify(order) === JSON.stringify(items.map(entry => entry.id));
  })());
  check("S04 capped BUY renders governed WATCH plus guardrail tag", /data-ffv3-section="verdict"[\s\S]*?data-verdict="watch"[\s\S]*?data-ffv3-guardrail[^>]*>Held by margin-of-safety rule/.test(html));
  check("S05 capped dossier lists margin-of-safety hold under unknowns", /data-unknown="capped"/.test(html));
  check("S06 'Modeled estimate' label present on modeled economics", html.includes(">Modeled estimate<"));
  check("S07 Breakeven and Sell number absent", !/breakeven/i.test(html) && !/sell number/i.test(html) && !/breakeven|sell number/i.test(source));
  const classTokens = markup => [...markup.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/).filter(Boolean));
  const V2_CLASS = /^(?:ff-commercial|ff-kpi|ff-v2|ff-dashboard|ff-decision-spotlight|ff-recommendation-pill|ff-factor|ff-distribution|ff-donut|ff-attention|ff-market)|^(?:page|button|button-primary|button-secondary)$/;
  check("S08 V3 root carries no V2 classes", classTokens(html).length > 0 && classTokens(html).every(token => token.startsWith("ffv3-") || token === "is-selected") && !classTokens(html).some(token => V2_CLASS.test(token)));

  const verifyView = api.viewFromSnapshot(snapshot, items[1].id, "ready", {});
  const verifyHtml = api.markupForView(verifyView);
  const verifyDossier = verifyHtml.slice(verifyHtml.indexOf('data-ffv3-section="dossier"'), verifyHtml.indexOf('data-ffv3-section="ledger"'));
  check("S09 VERIFY with no supported value shows 'Not established', never $0", verifyDossier.includes("Not established") && !/\$0(?![\d,])/.test(verifyDossier));
  check("S10 null economics render 'Not calculated for this decision'", (verifyDossier.match(/Not calculated for this decision/g) || []).length >= 6);
  check("S11 VERIFY framed as intelligence outcome", verifyDossier.includes("FlipForge needs exact completed-sale evidence for this card before it will commit."));
  check("S12 unknowns derive from server facts (supported, sales, mapping)", ['data-unknown="supported"', 'data-unknown="sales"', 'data-unknown="mapping"'].every(token => verifyDossier.includes(token)));

  const passView = api.viewFromSnapshot(snapshot, items[2].id, "ready", {});
  const passHtml = api.markupForView(passView);
  check("S13 PASS renders governed PASS and negative modeled economics without $0", /data-ffv3-section="verdict"[\s\S]*?data-verdict="pass"/.test(passHtml) && passHtml.includes("-$55") && !/\$0(?![\d,])/.test(passHtml));

  const detailed = api.viewFromSnapshot(snapshot, items[0].id, "ready", { [items[0].id]: detailData(items[0]) });
  const detailedHtml = api.markupForView(detailed);
  check("S14 'Read-only price check' labels server price boundary", /data-ffv3-price-check[\s\S]*?Read-only price check/.test(detailedHtml));
  check("S15 governed whatWouldChange shown before price boundary", detailedHtml.indexOf("An all-in ask at or below") < detailedHtml.indexOf("Read-only price check"));
  check("S16 supported-value basis from lazy-loaded detail", detailedHtml.includes("DIRECT_EXACT_SOLD"));

  const failed = api.markupForView(api.viewFromSnapshot(snapshot, items[0].id, "failed", {}));
  check("S17 partial evidence failure keeps verdict/economics/next action", failed.includes("data-ffv3-evidence-unavailable") && failed.includes('data-ffv3-section="economics"') && failed.includes('data-ffv3-section="next-action"'));

  const emptyHtml = api.markupForView(api.viewFromSnapshot(snapshotFor([]), "", "ready", {}));
  check("S18 empty state shows four-checks first-decision panel", emptyHtml.includes('data-ffv3-state="empty"') && (emptyHtml.match(/<li><b>0[1-4]<\/b>/g) || []).length === 4);

  const loading = api.loadingMarkup();
  check("S19 loading is skeleton-shaped and never first-use", loading.includes('data-ffv3-skeleton="dossier"') && loading.includes('data-ffv3-skeleton="ledger"') && !/first card|first decision|four checks/i.test(loading));

  const e401 = api.errorMarkup({ status: 401, code: "AUTH_REQUIRED" }, "/production-auth.html");
  const e403 = api.errorMarkup({ status: 403, code: "SEAT", reason: "BETA_FULL" }, "/x");
  const e403b = api.errorMarkup({ status: 403, code: "SEAT", reason: "NOT_ADMITTED" }, "/x");
  const e5xx = api.errorMarkup({ status: 503, code: "UPSTREAM_UNAVAILABLE", correlationId: "corr-123" }, "/x");
  const offline = api.errorMarkup({ code: "CUSTOMER_API_NOT_CONFIGURED" }, "/x");
  check("S20 401 shows sign-in", e401.includes('data-ffv3-state-panel="401"') && e401.includes("Sign in securely"));
  check("S21 403 seat uses existing NOT_ADMITTED / BETA_FULL messaging", e403.includes("Beta full: the FlipForge Private Beta has no open seats right now.") && e403b.includes("Not admitted: your invitation is active"));
  check("S22 5xx shows load failure + Retry + correlation id", e5xx.includes("data-ffv3-refresh") && e5xx.includes("corr-123") && e5xx.includes(">Retry<"));
  check("S23 bridge disabled: offline, no sample data", offline.includes("Decision data is offline.") && !offline.includes("data-ffv3-select"));
  check("S24 error/loading states carry no first-use content", [e401, e403, e5xx, offline, loading].every(markup => !/Evaluate your first card|four checks/i.test(markup)));

  check("S25 G1 contract detection", api.isG1Contract({ data: { governedDecisionReadModelVersion: G1 } }) && !api.isG1Contract({ data: {} }));
  check("S26 renderer source performs no sort/rank on items", !/\.sort\s*\(|\.toSorted\s*\(|\.reverse\s*\(/.test(source));
  check("S27 renderer fetches only allowlisted endpoints", (() => {
    const literals = [...source.matchAll(/["'`](\/api\/v1\/[^"'`$]*)/g)].map(match => match[1]);
    const allowed = new Set(["/api/v1/health", "/api/v1/dashboard", "/api/v1/opportunities", "/api/v1/opportunities/"]);
    return literals.length >= 4 && literals.every(literal => allowed.has(literal)) && /function allowlisted/.test(source) && /method: "GET"/.test(source) && !/method: "(?:POST|PUT|PATCH|DELETE)"/.test(source);
  })());
  check("S28 browser computes no verdict/Max Buy/profitability", !/maximumBuyPriceCents\s*=|recommendation\s*=\s*["'](?:BUY|WATCH|VERIFY|PASS)/.test(source) && !/profitabilityCappedBuy\s*=(?!=)/.test(source));
  check("S29 activation flag: query, localStorage key, disable switch, G1 gate", source.includes('get("dashboard") === "v3"') && source.includes('"flipforge.dashboard.renderer"') && source.includes("window.FlipForgeDashboardV3Disabled") && /!isG1Contract\(dashboard\) \|\| !isG1Contract\(opportunities\)/.test(source));
  check("S30 pre-G1 falls back to V2", /function fallBackToV2[\s\S]*FlipForgeDashboardRenderer = "v2"[\s\S]*FlipForgeDashboardV2Reload/.test(source));
  check("S31 Re-evaluate uses the normal Evaluate path", /href="#\/evaluate" data-ffv3-action="re-evaluate"/.test(source) && !/\/api\/v1\/evaluations/.test(source));

  const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("C01 CSS: no gradients, no blue, no neon", !/gradient\(/i.test(cssRules) && !/\bblue\b|\bcyan\b|\bmagenta\b|#0{2}[0-9a-f]{2}ff|#[0-9a-f]{4}ff\b/i.test(cssRules));
  check("C02 CSS: Geist Sans", /font-family:\s*"Geist Sans"/.test(css));
  check("C03 CSS: confidence bar gold, other factor bars silver", /\.ffv3-bar-fill\s*\{[^}]*var\(--ffv3-silver\)/.test(css) && /data-tone="gold"\]\s*\.ffv3-bar-fill\s*\{[^}]*var\(--ffv3-gold\)/.test(css));
  check("C04 CSS: desktop 34% ledger + sticky dossier, mobile dossier first", /min-width:\s*1200px[\s\S]*minmax\(0,\s*34%\)[\s\S]*position:\s*sticky/.test(css) && /grid-template-areas:\s*"dossier"\s*"ledger"/.test(css));
  const contrast = (foreground, background) => {
    const luminance = hex => {
      const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const [a, b] = [luminance(foreground), luminance(background)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const token = name => (css.match(new RegExp(`--ffv3-${name}:\\s*(#[0-9a-f]{6})`, "i")) || [])[1];
  const ratios = ["buy", "watch", "verify", "pass"].map(name => [name, contrast(token(name), token("panel")), contrast(token(name), token("charcoal"))]);
  check("C05 semantic colors meet WCAG AA on charcoal", ratios.every(([, panel, charcoal]) => panel >= 4.5 && charcoal >= 4.5), ratios.map(([name, panel]) => `${name}:${panel.toFixed(2)}`).join(" "));

  check("V01 V2 stand-down guard present in every V2 render path", (v2.match(/if \(window\.FlipForgeDashboardRenderer === "v3"\) return;/g) || []).length >= 4);
  check("V02 V2 remains the default renderer (not deleted)", /data-commercial-dashboard-v2/.test(v2) && /queueMicrotask\(apply\)/.test(v2));
  check("V03 production guard recognizes V3 root", guard.includes('main.querySelector("[data-decision-dashboard-v3]")'));
  check("V04 build injects V3 before V2", /injectDashboardV3\(appIndex\);\s*\ninjectCommercialDashboard\(appIndex\);/.test(build));
  check("V05 route ownership accepts V3 dashboard root", ownership.includes('dashboard: ".customer-dashboard-page, [data-decision-dashboard-v3]"'));
  check("V06 guided mode reads V3 tracked count", guided.includes("[data-decision-dashboard-v3][data-ffv3-tracked]"));

  for (const line of passes) console.log(`PASS ${line}`);
  for (const line of failures) console.log(`FAIL ${line}`);
  console.log(`Dashboard V3 Slice 2 static contract: ${passes.length}/${passes.length + failures.length} passed.`);
  if (failures.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runChecks();
