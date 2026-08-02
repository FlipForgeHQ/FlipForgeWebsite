import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

const packageJson = JSON.parse(read("package.json"));
const netlify = read("netlify.toml");
const index = read("saas-prototype/index.html");
const beta = read("saas-prototype/private-beta.js");
const css = read("saas-prototype/private-beta.css");
const docs = read("docs/SAAS_PRIVATE_BETA_READINESS.md");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 private beta validator is registered", packageJson.scripts?.["validate:private-beta"] === "node scripts/validate-saas-private-beta-readiness.mjs"],
  ["002 Netlify build runs private beta validation", netlify.includes("npm run validate:private-beta")],
  ["003 private beta adapter exists", exists("saas-prototype/private-beta.js")],
  ["004 private beta styles exist", exists("saas-prototype/private-beta.css")],
  ["005 private beta documentation exists", exists("docs/SAAS_PRIVATE_BETA_READINESS.md")],
  ["006 app loads private beta stylesheet", index.includes('href="private-beta.css"')],
  ["007 app loads private beta adapter last", index.includes('src="private-beta.js"') && index.lastIndexOf('src="private-beta.js"') > index.lastIndexOf('src="account-lifecycle.js"')],
  ["008 Beta Guide is present in primary navigation", index.includes('href="#/beta-start" data-route="beta-start"')],
  ["009 sidebar identifies invitation-only private beta", index.includes("Private beta") && index.includes("Invitation only")],
  ["010 fake prototype usage allowance was removed", !index.includes("12 / 50") && index.includes("Usage meter") && index.includes("Not active")],
  ["011 feedback form is statically registered for Netlify", index.includes('name="flipforge-private-beta-feedback"') && index.includes('data-netlify="true"')],
  ["012 feedback form includes a honeypot", index.includes('netlify-honeypot="bot-field"') && index.includes('name="bot-field"')],
  ["013 feedback form has a stable form-name field", index.includes('name="form-name" value="flipforge-private-beta-feedback"')],
  ["014 beta adapter is deploy-preview constrained", beta.includes("PREVIEW_HOST") && beta.includes("eligibleHost()")],
  ["015 first-run route is beta-start", beta.includes('const ROUTE = "beta-start"')],
  ["016 first-run uses only a named onboarding preference", beta.includes('const ONBOARDING_KEY = "flipforge.privateBeta.onboarding.v1"')],
  ["017 onboarding preference stores only complete", beta.includes('const ONBOARDING_VALUE = "complete"') && beta.includes("setItem(ONBOARDING_KEY, ONBOARDING_VALUE)")],
  ["018 onboarding preference can be reset", beta.includes("removeItem(ONBOARDING_KEY)")],
  ["019 no session storage is used", !beta.includes("sessionStorage")],
  ["020 no auth or business data is written to browser storage", !/localStorage\.(?:setItem|getItem)\([^\n]*(?:email|token|tenant|card|listing|evaluation|opportunity|recommendation)/i.test(beta)],
  ["021 first-run requires authenticated active membership", beta.includes("session.authenticated && session.membershipActive")],
  ["022 diagnostic staging routes are excluded from redirect", beta.includes('route === "staging" || route === "staging-evaluate"')],
  ["023 beta route reads sanitized Identity snapshot", beta.includes("FlipForgeIdentity.getSnapshot") && !beta.includes("getUser(")],
  ["024 beta route never reads Identity roles", !/appMetadata|app_metadata|\.roles\b/.test(beta)],
  ["025 live status reads same-origin gateway health", beta.includes('fetch("/api/v1/health"') && beta.includes('credentials: "same-origin"')],
  ["026 health request disables cache", beta.includes('cache: "no-store"')],
  ["027 health failure never substitutes mock data", beta.includes("no mock response was substituted")],
  ["028 disabled bridge is reported honestly", beta.includes("Safely offline") && beta.includes("disabled between controlled beta sessions")],
  ["029 available bridge requires configured and enabled", beta.includes('health.data?.status === "configured" && health.data?.bridgeEnabled')],
  ["030 production is explicitly inactive", beta.includes('statusCard("Production", "Inactive"')],
  ["031 Smart Opportunity remains sole authority", beta.includes("Smart Opportunity remains the sole recommendation authority")],
  ["032 existing PSA authority remains explicit", beta.includes("Existing PSA intelligence remains the sole grading-guidance authority")],
  ["033 SQLite remains source of truth", beta.includes("SQLite remains the source of truth")],
  ["034 public signup remains unavailable", beta.includes("No public signup") && !beta.includes("signup(")],
  ["035 billing remains unavailable", beta.includes("No billing") && beta.includes("No paid limits")],
  ["036 transaction execution remains unavailable", beta.includes("checkout, payment, purchase, listing, sale")],
  ["037 manual Evaluate is identified as the real entry path", beta.includes("Provider-backed Discover is not yet active") && beta.includes("Evaluate is the real customer entry path")],
  ["038 sample routes are disclosed", ["Dashboard", "Discover", "Compare", "Portfolio", "Sell", "Alerts"].every(value => beta.includes(value))],
  ["039 tester walkthrough covers full customer loop", ["Evaluate one exact card", "Open Card Intelligence", "Challenge the Decision Traceback", "Send focused feedback"].every(value => beta.includes(value))],
  ["039a feedback shortcut preserves the SPA route", beta.includes("data-private-beta-feedback-link") && beta.includes('querySelector("#beta-feedback")?.scrollIntoView') && !beta.includes('href="#beta-feedback"')],
  ["040 feedback is restricted to active invited testers", beta.includes("!session.authenticated || !session.membershipActive")],
  ["041 feedback summary is required and bounded", beta.includes('maxlength="2000"') && beta.includes("summary.length > 2000")],
  ["042 expected feedback is bounded", beta.includes('maxlength="1200"')],
  ["043 feedback posts URL-encoded to same origin", beta.includes('fetch("/"') && beta.includes('"Content-Type": "application/x-www-form-urlencoded"')],
  ["044 feedback posts through same-origin credentials", beta.includes('credentials: "same-origin"')],
  ["045 feedback payload names are allowlisted", beta.includes('["form-name", "category", "rating", "summary", "expected", "contactAllowed"]')],
  ["046 feedback payload includes route context only", beta.includes('payload.set("route", routeName())')],
  ["047 feedback email requires explicit follow-up permission", beta.includes('input.get("contactAllowed") === "yes" && session.email') && beta.includes('payload.set("testerEmail", session.email)')],
  ["048 feedback payload does not collect tenant ID", !/payload\.set\(["']tenant/i.test(beta)],
  ["049 feedback payload does not collect card or listing data", !/payload\.set\(["'](?:card|listing|opportunity|evaluation)/i.test(beta)],
  ["050 feedback warns against sensitive or card-specific content", ["passwords", "access tokens", "provider keys", "tenant IDs", "card listing URLs", "card identities"].every(value => beta.includes(value))],
  ["050a preview shell uses sanitized tester identity", beta.includes("function syncShell") && beta.includes("session.fullName") && !/syncShell[\s\S]{0,1000}session\.email/.test(beta)],
  ["051 feedback failure cannot claim evaluation loss", beta.includes("Your evaluation data was not affected")],
  ["052 responsive private beta layout exists", css.includes("@media (max-width: 1050px)") && css.includes("@media (max-width: 650px)")],
  ["053 reduced motion is respected", css.includes("prefers-reduced-motion")],
  ["054 docs prohibit a second application or engine", docs.includes("does not create another application, recommendation engine")],
  ["055 docs define the single non-sensitive preference value", docs.includes("flipforge.privateBeta.onboarding.v1") && docs.includes("value `complete`")],
  ["056 docs retain production-disabled boundary", docs.includes("Production remains inactive")],
  ["057 docs retain deploy-preview gateway control", docs.includes("gateway disabled unless a separately approved deploy-preview")],
  ["058 docs enumerate feedback exclusions", docs.includes("password, raw JWT, refresh token, tenant ID, provider credential, service token")],
  ["058a docs make contact email opt-in", docs.includes("included only when the tester checks the explicit follow-up permission")],
  ["059 docs identify incomplete sample routes", docs.includes("Dashboard, Discover, Compare, Portfolio, Sell, and Alerts")],
  ["060 docs retain zero transaction authority", docs.includes("No evidence acceptance") && docs.includes("resale authority")]
].forEach(([name, condition]) => check(name, condition));

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

function runtime({ hash, authenticated, membershipActive, healthStatus = "disabled", bridgeEnabled = false, storage = makeStorage() }) {
  const main = { innerHTML: "", focus() {} };
  const bannerTitle = { textContent: "NON-PRODUCTION PROTOTYPE" };
  const bannerCopy = { textContent: "Mock responses only" };
  const banner = { querySelector(selector) { return selector === "strong" ? bannerTitle : selector === "span" ? bannerCopy : null; } };
  const listeners = {};
  const window = {
    location: { hostname: "deploy-preview-32--goflipforge.netlify.app", hash },
    localStorage: storage,
    FlipForgeIdentity: {
      getSnapshot: () => ({ authenticated, email: authenticated ? "tester@example.com" : "", fullName: authenticated ? "Beta Tester" : "", membershipActive, membershipConfigured: membershipActive })
    },
    addEventListener(type, handler) { listeners[type] = handler; },
    requestAnimationFrame(handler) { handler(); },
    scrollTo() {}
  };
  const document = {
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === "#main-content") return main;
      if (selector === ".prototype-banner") return banner;
      return null;
    }
  };
  const fetch = async url => {
    if (url !== "/api/v1/health") throw new Error(`Unexpected runtime request: ${url}`);
    return new Response(JSON.stringify({ meta: { contractVersion: "1.0" }, data: { status: healthStatus, bridgeEnabled } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const context = vm.createContext({ window, document, fetch, Response, FormData, URLSearchParams, Object, Array, String, Number, Boolean, RegExp, Promise, Error, CustomEvent: class {}, console, setTimeout, clearTimeout });
  vm.runInContext(beta, context, { filename: "private-beta.js" });
  return { window, main, bannerTitle, bannerCopy, storage, listeners };
}

const firstRun = runtime({ hash: "#/dashboard", authenticated: true, membershipActive: true });
check("061 active first-run tester is routed to Beta Guide", firstRun.window.location.hash === "#/beta-start");

const signedOut = runtime({ hash: "#/dashboard", authenticated: false, membershipActive: false });
check("062 signed-out visitor is not redirected", signedOut.window.location.hash === "#/dashboard");

const staging = runtime({ hash: "#/staging", authenticated: true, membershipActive: true });
check("063 staging diagnostic route is not redirected", staging.window.location.hash === "#/staging");

const completedStorage = makeStorage({ "flipforge.privateBeta.onboarding.v1": "complete" });
const completed = runtime({ hash: "#/dashboard", authenticated: true, membershipActive: true, storage: completedStorage });
check("064 completed first-run preference suppresses redirect", completed.window.location.hash === "#/dashboard");
check("065 public API reports completed preference", completed.window.FlipForgePrivateBeta.preferenceComplete());

const betaRoute = runtime({ hash: "#/beta-start", authenticated: true, membershipActive: true, healthStatus: "configured", bridgeEnabled: true });
await new Promise(resolve => setTimeout(resolve, 20));
check("066 Beta Guide renders for eligible preview", betaRoute.main.innerHTML.includes("Private Beta Guide") && betaRoute.main.innerHTML.includes("Tester walkthrough"));
check("067 active session renders active tester state", betaRoute.main.innerHTML.includes("Active tester"));
check("068 configured health renders available API", betaRoute.main.innerHTML.includes("Customer API") && betaRoute.main.innerHTML.includes("Available"));
check("069 Beta Guide banner replaces prototype wording", betaRoute.bannerTitle.textContent === "PRIVATE BETA GUIDE" && betaRoute.bannerCopy.textContent.includes("Invitation only"));
check("070 rendered guide contains no invited account email", !betaRoute.main.innerHTML.includes("tester@example.com"));

const failures = results.filter(result => !result.passed);
console.log("SaaSPrivateBetaReadinessValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
