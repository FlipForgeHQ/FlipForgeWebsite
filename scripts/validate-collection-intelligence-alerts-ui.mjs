import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const script = read("saas-prototype/collection-intelligence-alerts-v1.js");
const css = read("saas-prototype/collection-intelligence-alerts-v1.css");
const html = read("saas-prototype/index.html");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 isolated IIFE", script.startsWith("(() =>") && script.includes('"use strict"')],
  ["002 production and preview hosts constrained", script.includes("PRODUCTION_HOST") && script.includes("PREVIEW_HOST") && script.includes("APP_PATH")],
  ["003 projection only activates on Alerts", script.includes('currentRoute() !== "alerts"')],
  ["004 existing route owner is not replaced", !script.includes("FlipForgeCustomerLifecycle =") && !script.includes("staging-route-hook")],
  ["005 reads existing Alerts endpoint", script.includes('fetch("/api/v1/alerts"')],
  ["006 GET only", script.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(script)],
  ["007 same-origin credentials", script.includes('credentials: "same-origin"')],
  ["008 cache disabled", script.includes('cache: "no-store"')],
  ["009 redirects rejected", script.includes('redirect: "error"')],
  ["010 no client identity headers", !/X-FlipForge-(?:Tenant|User)-Id/i.test(script)],
  ["011 no service token", !/FLIPFORGE_API_SERVICE_TOKEN|Authorization:\s*[`"']Bearer/i.test(script)],
  ["012 no browser persistence", !/localStorage|sessionStorage|document\.cookie/.test(script)],
  ["013 Smart Opportunity authority validated", script.includes('meta.authority === "Smart Opportunity"')],
  ["014 PSA authority validated", script.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["015 correlation IDs validated", script.includes("meta.correlationId === expectedCorrelationId")],
  ["016 response size bounded", script.includes("MAX_RESPONSE_CHARACTERS")],
  ["017 Collection Signals remain additive", script.includes("collectionSignals") && script.includes("dailyIntelligence")],
  ["018 ordinary movement suppression explained", script.includes("Ordinary movement is suppressed")],
  ["019 recommendation boundary explicit", script.includes("Signal ≠ recommendation") && script.includes("Smart Opportunity remains the BUY / WATCH / VERIFY / PASS authority")],
  ["020 external delivery remains disabled", script.includes("Email, SMS, push") && script.includes("transaction delivery remain disabled")],
  ["021 failure is child-panel only", script.includes("The existing Alerts route remains available") && script.includes("no browser-only signal was created")],
  ["022 script loaded after lifecycle owner", html.includes('<script src="customer-lifecycle.js"></script>\n  <script src="collection-intelligence-alerts-v1.js"></script>')],
  ["023 stylesheet loaded", html.includes('<link rel="stylesheet" href="collection-intelligence-alerts-v1.css">')],
  ["024 responsive signal layout", css.includes(".ff-collection-signal") && css.includes("@media (max-width: 900px)") && css.includes("@media (max-width: 560px)")],
  ["025 no transaction controls", !/Buy now|Place bid|Checkout|Pay now|Create listing|Accept offer/.test(script)]
].forEach(([name, condition]) => check(name, condition));

const window = {
  location: {
    hostname: "deploy-preview-517--goflipforge.netlify.app",
    pathname: "/saas-prototype/",
    hash: "#/alerts"
  },
  crypto: { randomUUID: () => "collection-alerts-validation" },
  addEventListener() {}
};
const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; },
  createElement() { return {}; }
};
class MutationObserver {
  constructor() {}
  observe() {}
}
const context = vm.createContext({
  window,
  document,
  MutationObserver,
  fetch: async () => { throw new Error("network not used in render validation"); },
  Response,
  JSON,
  Math,
  Date,
  Number,
  String,
  Array,
  Object,
  RegExp,
  Promise,
  Set,
  Error,
  console,
  setTimeout,
  clearTimeout
});
vm.runInContext(script, context, { filename: "collection-intelligence-alerts-v1.js" });
const api = window.FlipForgeCollectionIntelligenceAlerts;
check("026 public helper is available", Boolean(api) && api.version === "v1.0");
check("027 preview app eligibility is true", api?.isEligible?.() === true);

const payload = {
  kind: "alerts",
  configured: true,
  notificationDeliveryConfigured: false,
  collectionSignalCount: 1,
  collectionSignals: [{
    kind: "COLLECTION_SIGNAL",
    itemId: "ohtani-150",
    collectionName: "My Collection",
    cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    observedAt: "2026-09-15T18:00:00Z",
    severity: "IMPORTANT",
    whatChanged: [
      "Supported Value changed from $240.00 to $275.00.",
      "Evidence Quality changed from THIN to VERIFIED."
    ],
    whyItMatters: "The evidence picture changed enough to cross a governed monitoring threshold.",
    decisionChanged: true,
    governedDecision: "VERIFY",
    inspectNext: ["Evidence Review", "Decision Intelligence", "Decision Receipt"],
    transactionAuthority: false
  }],
  dailyIntelligence: {
    kind: "daily-intelligence",
    status: "IMPORTANT_REVIEW_AVAILABLE",
    headline: "Important Collection Intelligence changes need review.",
    materialChangeCount: 1,
    importantCount: 1,
    evidenceAttentionCount: 1,
    decisionChangedCount: 1,
    topSignals: []
  }
};
const markup = api.renderMarkup(payload);
check("028 Daily Intelligence renders", markup.includes("Daily Intelligence") && markup.includes("Important Collection Intelligence changes need review."));
check("029 Collection Signals render", markup.includes("Collection Signals") && markup.includes("Shohei Ohtani"));
check("030 What Changed renders from server facts", markup.includes("Supported Value changed from $240.00 to $275.00."));
check("031 Why It Matters renders from server facts", markup.includes("The evidence picture changed enough"));
check("032 governed decision change is visible", markup.includes("VERIFY") && markup.includes("Decision changed"));
check("033 inspect-next routing labels render", markup.includes("Evidence Review") && markup.includes("Decision Intelligence") && markup.includes("Decision Receipt"));
check("034 customer boundary is visible", markup.includes("Review prompt only") && markup.includes("No recommendation"));

const legacyMarkup = api.renderMarkup({ kind: "alerts", configured: true, items: [] });
check("035 older backend fails soft without inventing signals",
  legacyMarkup.includes("has not exposed Collection Signals")
    && legacyMarkup.includes("Nothing is reconstructed in the browser"));

const emptyMarkup = api.renderMarkup({
  kind: "alerts",
  configured: true,
  collectionSignalCount: 0,
  collectionSignals: [],
  dailyIntelligence: {
    kind: "daily-intelligence",
    status: "NO_MATERIAL_CHANGE",
    headline: "No material Collection Intelligence changes in the last 24 hours.",
    materialChangeCount: 0,
    importantCount: 0,
    evidenceAttentionCount: 0,
    decisionChangedCount: 0,
    topSignals: []
  }
});
check("036 honest no-material-change state renders",
  emptyMarkup.includes("No material changes in the last 24 hours")
    && emptyMarkup.includes("does not turn ordinary single-tick market movement into noise"));

const failures = results.filter(result => !result.passed);
console.log("Collection Intelligence Alerts UI validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;