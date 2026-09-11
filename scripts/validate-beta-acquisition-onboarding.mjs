import fs from "node:fs";
import assert from "node:assert/strict";
import { createConversionEventHandler } from "../netlify/modern-functions/conversion-event.mjs";

class MemoryStore {
  constructor() { this.records = new Map(); }
  async setJSON(key, value) { this.records.set(key, structuredClone(value)); }
}

const conversionEvent = createConversionEventHandler({ store: new MemoryStore() });

const read = path => fs.readFileSync(path, "utf8");
const beta = read("beta-application.html");
const thankYou = read("thank-you.html");
const onboarding = read("beta-onboarding.html");
const privacy = read("privacy.html");
const client = read("assets/js/conversion-events.js");
const server = read("netlify/modern-functions/conversion-event.mjs");
const betaSession = read("saas-prototype/beta-session-v1.js");
const betaSessionCss = read("saas-prototype/beta-session-v1.css");
const appIndex = read("saas-prototype/index.html");
const css = read("assets/css/beta-onboarding-v1.css");
const docs = read("docs/PRIVATE_BETA_ACQUISITION_AND_ONBOARDING.md");
const build = read("scripts/build-assets.js");
const netlify = read("netlify.toml");
const packageJson = JSON.parse(read("package.json"));
const sitemap = read("sitemap.xml");

const sessionEvents = [
  "evaluation_started",
  "evaluation_completed",
  "decision_explanation_viewed",
  "decision_saved",
  "tracking_viewed",
];

const checks = [
  ["validator registered", packageJson.scripts?.["validate:beta-acquisition"] === "node scripts/validate-beta-acquisition-onboarding.mjs"],
  ["Netlify build runs validator", netlify.includes("npm run validate:beta-acquisition")],
  ["beta application uses same-site server intake", beta.includes('name="flipforge-private-beta-application"') && beta.includes('action="/api/beta/applications"')],
  ["beta application includes honeypot", beta.includes('name="bot-field"')],
  ["outside FormSubmit dependency removed", !beta.includes("formsubmit.co") && !privacy.includes("FormSubmit")],
  ["form start hook is mounted", beta.includes("data-beta-application-form") && client.includes("beta_form_started")],
  ["post-submit page states selection boundary", thankYou.includes("Awaiting selection review") && thankYou.includes("does not create an account")],
  ["post-submit page links to onboarding", thankYou.includes('href="beta-onboarding.html"') && thankYou.includes("data-onboarding-guide")],
  ["onboarding click and view are distinct", client.includes("onboarding_guide_clicked") && client.includes("onboarding_guide_viewed") && server.includes("onboarding_guide_clicked")],
  ["onboarding page covers invitation-only access", onboarding.includes("Invitation only") && onboarding.includes("There is no public signup")],
  ["onboarding page teaches one-card first session", onboarding.includes("One card. One decision. Clear reasons.") && onboarding.includes("Evaluate one card")],
  ["onboarding page uses Card Decision Intelligence branding", onboarding.includes("Card Decision Intelligence") && !onboarding.includes("FlipForge — Card Intelligence")],
  ["onboarding page teaches simplified beta loop", ["Evaluate", "Understand", "Save", "Track"].every(value => onboarding.includes(`<span>${value}</span>`))],
  ["onboarding page does not teach hidden full-platform tools", ["Evidence Center", "PSA Advisor", "Exit Review", "Compare saved decisions"].every(value => !onboarding.includes(value))],
  ["onboarding page covers 7 14 30 evidence", ["Day 7", "Day 14", "Day 30", "original decision stays fixed"].every(value => onboarding.includes(value))],
  ["onboarding page preserves authority boundaries", ["does not authorize a bid", "No public accuracy percentage"].every(value => onboarding.includes(value))],
  ["onboarding page has responsive layout", css.includes("@media(max-width:1000px)") && css.includes("@media(max-width:650px)")],
  ["onboarding route is indexed", sitemap.includes("https://goflipforge.com/beta-onboarding.html")],
  ["conversion layer is build-enforced", build.includes("ensureConversionEventLayer") && build.includes("privacy-conscious conversion event layer")],
  ["conversion client uses same-origin endpoint", client.includes('endpoint="/api/conversion-event"') && client.includes('credentials:"same-origin"')],
  ["marketing conversion client uses no persistent visitor state", !/cookie|localStorage|sessionStorage|indexedDB/i.test(client)],
  ["conversion service has strict allowlists", server.includes("EVENT_NAMES") && server.includes("PAGE_NAMES") && server.includes("PLACEMENTS")],
  ["conversion service excludes sensitive dimensions", ["user agent", "referrer", "query string", "email", "account", "card", "listing", "price", "recommendation"].every(value => server.includes(value))],
  ["beta session milestone names are allowlisted server-side", sessionEvents.every(value => server.includes(`\"${value}\"`))],
  ["beta session runtime emits every approved milestone", sessionEvents.every(value => betaSession.includes(`emit(\"${value}\")`))],
  ["beta session telemetry sends only event page and placement", betaSession.includes("JSON.stringify({ event, page: PAGE, placement: PLACEMENT })")],
  ["beta session runtime never sends card or listing content", !/exactCardQuery|cardIdentity|listingUrl|itemPriceCents|recommendation\s*:/i.test(betaSession)],
  ["beta session presentation files are loaded last", appIndex.includes('href="beta-session-v1.css"') && /customer-only-shell-v1\.js[\s\S]*beta-session-v1\.js[\s\S]*<\/body>/.test(appIndex)],
  ["beta session hides technical provider status and result-count control", betaSession.includes("Connected source status") && betaSession.includes("ffBetaHiddenControl") && betaSessionCss.includes("ff-beta-hidden-control")],
  ["privacy policy discloses limited events", privacy.includes("Website measurement") && privacy.includes("does not set analytics cookies") && privacy.includes("create a visitor identifier")],
  ["operating contract defines funnel", docs.includes("Application completion proxy") && docs.includes("These are directional interaction counts, not unique visitors")],
  ["operator templates exist", docs.includes("Your FlipForge private-beta invitation") && docs.includes("FlipForge day-7 evidence check")],
];

let failed = 0;
for (const [label, condition] of checks) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL - ${label}`);
  }
}

const request = (body, overrides = {}) => new Request("https://goflipforge.com/api/conversion-event", {
  method: overrides.method || "POST",
  headers: { "content-type": "application/json", origin: overrides.origin || "https://goflipforge.com" },
  body: overrides.method === "GET" ? undefined : JSON.stringify(body),
});

assert.equal((await conversionEvent(request({}, { method: "GET" }))).status, 405);
assert.equal((await conversionEvent(request({ event: "beta_cta_clicked" }, { origin: "https://example.invalid" }))).status, 403);
assert.equal((await conversionEvent(request({ event: "not_allowed", page: "home", placement: "hero" }))).status, 400);
assert.equal((await conversionEvent(request({ padding: "x".repeat(2100) }))).status, 413);

const logs = [];
const originalLog = console.log;
console.log = value => logs.push(String(value));
const accepted = await conversionEvent(request({
  event: "beta_cta_clicked",
  page: "home",
  placement: "hero",
  email: "must-not-log@example.com",
  card: "must-not-log",
  listing: "https://example.invalid/private",
}));
console.log = originalLog;
assert.equal(accepted.status, 202);
assert.equal(logs.length, 1);
const logged = JSON.parse(logs[0]);
assert.deepEqual(Object.keys(logged).sort(), ["event", "occurredAt", "page", "placement", "schemaVersion", "type"].sort());
assert.equal(logged.event, "beta_cta_clicked");
assert.ok(!logs[0].includes("must-not-log"));

for (const event of sessionEvents) {
  const response = await conversionEvent(request({ event, page: "beta-app", placement: "workflow", card: "ignored", price: 999 }));
  assert.equal(response.status, 202, `${event} should be accepted`);
}

if (failed) process.exit(1);
console.log(`Beta acquisition and onboarding validation passed: ${checks.length + 5 + sessionEvents.length} checks.`);