import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const files = {
  index: read("saas-prototype/index.html"),
  guard: read("saas-prototype/production-dashboard-guard.js"),
  legacyApp: read("saas-prototype/app.js"),
  dashboard: read("saas-prototype/commercial-dashboard-v2.js"),
  polish: read("saas-prototype/commercial-app-polish-v2.js"),
  build: read("scripts/build-identity-client.mjs"),
  audit: read("scripts/audit-saas-layout-ci.mjs"),
  workflow: read(".github/workflows/saas-full-site-visual-qa.yml")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 commercial Dashboard uses fixed health endpoint", files.dashboard.includes('health: "/api/v1/health"')],
  ["002 commercial Dashboard uses fixed dashboard endpoint", files.dashboard.includes('dashboard: "/api/v1/dashboard"')],
  ["003 commercial Dashboard uses fixed opportunities endpoint", files.dashboard.includes('opportunities: "/api/v1/opportunities"')],
  ["004 commercial Dashboard sends same-origin credentials", files.dashboard.includes('credentials: "same-origin"')],
  ["005 commercial Dashboard disables response caching", files.dashboard.includes('cache: "no-store"')],
  ["006 commercial Dashboard rejects redirects", files.dashboard.includes('redirect: "error"')],
  ["007 commercial Dashboard validates Smart Opportunity authority", files.dashboard.includes('meta.authority === "Smart Opportunity"')],
  ["008 commercial Dashboard validates existing PSA authority", files.dashboard.includes('meta.gradingAuthority === "Existing PSA intelligence"')],
  ["009 commercial Dashboard validates request correlation", files.dashboard.includes('meta.correlationId === requestCorrelationId')],
  ["010 commercial Dashboard exposes no browser tenant identity header", !/X-FlipForge-(?:Tenant|User)-Id/i.test(files.dashboard)],
  ["011 commercial Dashboard contains no service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.dashboard)],
  ["012 commercial Dashboard keeps Market Index unavailable", files.dashboard.includes("Market Index") && files.dashboard.includes("NOT CONFIGURED") && files.dashboard.includes("does not yet have an authoritative market-wide index engine")],
  ["013 commercial Dashboard keeps zero transaction authority", files.dashboard.includes("No browser scoring, evidence acceptance, grade prediction, purchase, sale, or transaction authority")],
  ["014 production build injects commercial Dashboard stylesheet", files.build.includes('commercial-dashboard-v2.css') && files.build.includes("injectCommercialDashboard(appIndex)")],
  ["015 production build injects commercial Dashboard script", files.build.includes('commercial-dashboard-v2.js')],
  ["016 production build injects commercial polish after Dashboard", files.build.indexOf("injectCommercialDashboard(appIndex)") < files.build.indexOf("injectCommercialAppPolish(appIndex)")],
  ["017 production guard is wired before the legacy app router", files.index.includes('src="production-dashboard-guard.js"') && files.index.indexOf('src="production-dashboard-guard.js"') < files.index.indexOf('src="app.js"')],
  ["018 production guard is restricted to goflipforge production hosts", files.guard.includes('/^(?:www\\.)?goflipforge\\.com$/i')],
  ["019 production guard is restricted to the Dashboard route", files.guard.includes('route === "dashboard"')],
  ["020 production guard recognizes authoritative Dashboard output", files.guard.includes('[data-commercial-dashboard-v2]')],
  ["021 production guard contains no prototype data authority", !/FlipForgePrototypeData|data\.dashboard|data\.opportunities/.test(files.guard)],
  ["022 production guard emits only authoritative loading state", files.guard.includes("Loading tenant-owned FlipForge intelligence") && files.guard.includes("Loading authoritative dashboard data")],
  ["023 retained legacy Dashboard is still clearly prototype-only debt", files.legacyApp.includes("Prototype customer activity, not live telemetry") && files.legacyApp.includes("already-governed mock records")],
  ["024 commercial polish normalizes card-number display artifacts", files.polish.includes("function normalizeCardDisplay") && files.polish.includes('"$1#$2"')],
  ["025 commercial polish normalizes Dashboard spotlight", files.polish.includes("function normalizeCommercialDashboard") && files.polish.includes(".ff-decision-identity")],
  ["026 commercial polish suppresses duplicate exact-card identity", files.polish.includes("identity.hidden = true") && files.polish.includes('identity.setAttribute("aria-hidden", "true")')],
  ["027 commercial polish requires accepted sales for supported value", files.polish.includes("acceptedSales !== null && acceptedSales > 0") && files.polish.includes("supportedAmount !== null && supportedAmount > 0")],
  ["028 commercial polish shows unavailable instead of unsupported zero value", files.polish.includes('supportedValue.textContent = "Unavailable"')],
  ["029 commercial polish shows unavailable instead of unsupported value gap", files.polish.includes('gapValue.textContent = "Unavailable"')],
  ["030 commercial polish applies the same rule to recent saved decisions", files.polish.includes('cells[3].textContent = "Unavailable"') && files.polish.includes("cells[5].textContent")],
  ["031 commercial polish observes asynchronous Dashboard renders", files.polish.includes("new MutationObserver") && files.polish.includes("normalizeCommercialDashboard(main)")],
  ["032 browser QA uses malformed duplicate zero-evidence stress fixture", files.audit.includes("Ohtani %150") && files.audit.includes("supportedValue: 0") && files.audit.includes("acceptedSales: 0")],
  ["033 browser QA enables the authoritative customer bridge fixture", files.audit.includes("bridgeEnabled: true")],
  ["034 browser QA explicitly requires commercial Dashboard render", files.audit.includes("commercial-dashboard-not-rendered") && files.audit.includes("[data-commercial-dashboard-v2]")],
  ["035 browser QA rejects malformed card-number display", files.audit.includes("card-number-display-artifact")],
  ["036 browser QA rejects duplicate Dashboard identity", files.audit.includes("duplicate-card-identity")],
  ["037 browser QA rejects unsupported zero valuation", files.audit.includes("unsupported-zero-valuation")],
  ["038 browser QA rejects unsupported value gap", files.audit.includes("unsupported-value-gap")],
  ["039 browser QA runs from production-equivalent app mount", files.audit.includes('http://127.0.0.1:4173/app')],
  ["040 visual QA workflow builds injected production assets first", files.workflow.includes("npm run build:identity")],
  ["041 visual QA workflow probes production-equivalent app path", files.workflow.includes("http://127.0.0.1:4173/app/")],
  ["042 visual QA workflow gates Dashboard semantics", files.workflow.includes("Gate actionable layout and Dashboard semantic failures")]
].forEach(([name, condition]) => check(name, condition));

const failures = results.filter(result => !result.passed);
console.log("SaaSCommercialDashboardLiveQAValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
