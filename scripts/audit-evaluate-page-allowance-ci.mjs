// "Evaluate a card" page (#/evaluate) -> 429 EVALUATION_LIMIT_REACHED.
//
// Production 2026-10-14/15: the founder's Private Beta tenant reached its lifetime allowance (5 of 5). Discover was
// fixed in #507; the Evaluate page still showed the raw code "EVALUATION_LIMIT_REACHED", the backend's "monthly"
// wording and plain-text guidance with no link to Plan & Usage.
//
// Each limit case must show a plain-language alert on the same page (no reload, no route change), say that no new
// evaluation was created, link to Plan & Usage and saved decisions, keep the typed form, and never show the raw code or
// the word "monthly" for a Private Beta allowance. Non-limit errors keep their existing panel.
// Controlled responses only: no provider, no paid evaluation, no production data.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const IDENTITY = "2018 Topps Chrome Shohei Ohtani #150 PSA 9";
let evalMode = "limit";
let entitlementsMode = "beta";
let entitlementCalls = 0;
const evaluationCalls = [];

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0", engineVersion: "evaluate-page-allowance-audit", authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: "2026-10-15T12:00:00Z",
      evidenceFreshness: "QA_FIXTURE", limitations: ["Synthetic Evaluate page allowance audit fixture only."]
    },
    data
  };
}

function entitlements(correlationId) {
  const beta = entitlementsMode !== "monthly";
  const reserved = entitlementsMode === "reserved";
  const usage = {
    evaluationAllowanceScope: beta ? "PRIVATE_BETA_LIFETIME" : "UTC_CALENDAR_MONTH",
    completedEvaluations: beta ? (reserved ? 4 : 5) : 25, inProgressReservations: reserved ? 1 : 0,
    admissionUsage: beta ? 5 : 25, evaluationAllowanceLimit: beta ? 5 : 25, remainingEvaluations: 0, evaluationAllowedNow: false
  };
  return envelope(correlationId, {
    kind: "entitlements", readOnly: true,
    current: { code: beta ? "PRIVATE_BETA" : "SCOUT", accessState: beta ? "PRIVATE_BETA_EVALUATION_ALLOWANCE_REACHED" : "MONTHLY_EVALUATION_LIMIT_REACHED",
      evaluationAllowanceScope: usage.evaluationAllowanceScope, effectiveEvaluationLimit: usage.evaluationAllowanceLimit },
    usage
  });
}

const browser = await chromium.launch({ headless: true, executablePath });
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
    } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "allowance-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "allowance-audit@flipforge.test", fullName: "Allowance Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "allowance-audit";
    const json = (status, body, headers = {}) => route.fulfill({ status, headers, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, envelope(correlationId, { status: "configured" }));
    if (url.pathname === "/api/v1/entitlements") {
      entitlementCalls += 1;
      if (request.method() !== "GET") return json(405, { error: { code: "QA_ENTITLEMENTS_MUST_BE_READ_ONLY", correlationId } });
      if (entitlementsMode === "fail") return json(503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", correlationId } });
      if (entitlementsMode === "stall") await new Promise(r => setTimeout(r, 4000));
      return json(200, entitlements(correlationId));
    }
    if (url.pathname === "/api/v1/evaluations") {
      evaluationCalls.push(request.headers()["idempotency-key"]);
      if (evalMode === "limit") return json(429, { error: { code: "EVALUATION_LIMIT_REACHED", message: "Your monthly evaluation limit has been reached.", correlationId } }, { "Retry-After": "1468800" });
      if (evalMode === "denied") return json(403, { error: { code: "ENTITLEMENT_ACCESS_DENIED", message: "Your current FlipForge access does not permit a new evaluation.", correlationId } });
    }
    // Every other read the shell makes gets an empty, valid-looking answer; nothing reaches a real service.
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  return { context, page: await context.newPage() };
}

const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

async function fillForm(page) {
  const form = page.locator("#main-content [data-staging-evaluation-form]");
  await form.waitFor({ state: "visible", timeout: 15000 });
  await form.locator('input[name="externalListingId"]').fill("900000000001");
  await form.locator('textarea[name="cardIdentity"]').fill(IDENTITY);
  await form.locator('input[name="listingUrl"]').fill("https://www.ebay.com/itm/900000000001");
  await form.locator('input[name="itemPrice"]').fill("759.95");
  await form.locator('input[name="acknowledgeBoundary"]').check();
  return form;
}

const CASES = [
  { label: "private beta lifetime", eval: "limit", ent: "beta",
    title: /^You’ve reached your Private Beta evaluation allowance\.$/, body: /No new evaluation was created for this listing and nothing was saved\. You have used 5 of 5\. Your existing saved decisions are unchanged\./ },
  { label: "private beta with reservation", eval: "limit", ent: "reserved",
    title: /^You’ve reached your Private Beta evaluation allowance\.$/, body: /You have used 5 of 5, including 1 still in progress\./ },
  { label: "monthly plan", eval: "limit", ent: "monthly",
    title: /^You’ve reached this month’s evaluation limit\.$/, body: /No new evaluation was created.*You have used 25 of 25\./, monthlyAllowed: true },
  { label: "allowance lookup fails", eval: "limit", ent: "fail",
    title: /^Evaluation limit reached$/, body: /No new evaluation was created for this listing and nothing was saved\./ },
  { label: "allowance lookup stalls", eval: "limit", ent: "stall",
    title: /^Evaluation limit reached$/, body: /No new evaluation was created/, enrichedTitle: /^You’ve reached your Private Beta evaluation allowance\.$/ },
  { label: "403 unchanged", eval: "denied", ent: "beta", nonLimit: true }
];

for (const viewport of [{ width: 1280, height: 900, name: "desktop" }, { width: 390, height: 844, name: "phone" }]) {
  for (const testCase of CASES) {
    evalMode = testCase.eval;
    entitlementsMode = testCase.ent;
    entitlementCalls = 0;
    const callsBefore = evaluationCalls.length;
    const label = `${viewport.name} / ${testCase.label}`;
    const { context, page } = await newPage(viewport);
    let loads = 0; page.on("load", () => { loads += 1; });
    try {
      await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
      const form = await fillForm(page);
      const loadsAtStart = loads;
      const hashAtStart = await page.evaluate(() => location.hash);
      const clickedAt = Date.now();
      await form.evaluate(node => node.requestSubmit());
      await page.waitForSelector("#main-content .staging-error[role=alert]", { timeout: 10000 });
      const alertAfterMs = Date.now() - clickedAt;
      if (testCase.nonLimit) {
        const text = await page.locator("#main-content .staging-error[role=alert]").innerText();
        check(`${label}: 403 keeps its existing access panel`, /does not permit a new evaluation/.test(text) && !(await page.locator("[data-evaluation-allowance-reached]").count()), text.replace(/\s+/g, " "));
        check(`${label}: 403 does not look up the allowance`, entitlementCalls === 0, `${entitlementCalls}`);
        continue;
      }
      if (testCase.ent === "stall") check(`${label}: the limit alert appears without waiting for the allowance lookup`, alertAfterMs < 2000, `${alertAfterMs} ms`);
      const read = () => page.evaluate(() => {
        const alert = document.querySelector("#main-content [data-evaluation-allowance-reached]");
        const form = document.querySelector("#main-content [data-staging-evaluation-form]");
        return alert ? {
          title: alert.querySelector("strong")?.textContent.trim(),
          text: alert.innerText.replace(/\s+/g, " "),
          links: [...alert.querySelectorAll("a[href]")].map(a => [a.getAttribute("href"), a.textContent.trim()]),
          hash: location.hash,
          identityKept: form?.querySelector('textarea[name="cardIdentity"]')?.value || "",
          savedDecisionShown: Boolean(document.querySelector("#main-content .customer-intelligence-hero, #main-content [data-staging-evaluation-result]"))
        } : null;
      });
      const first = await read();
      check(`${label}: allowance alert is shown`, Boolean(first), JSON.stringify(first));
      if (!first) continue;
      check(`${label}: title`, testCase.title.test(first.title), first.title);
      if (testCase.enrichedTitle) {
        await page.waitForFunction(() => /Private Beta evaluation allowance/.test(document.querySelector("#main-content [data-evaluation-allowance-reached] strong")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
        const later = await read();
        check(`${label}: names the allowance in place once the lookup answers`, testCase.enrichedTitle.test(later?.title || ""), later?.title);
      } else {
        await page.waitForTimeout(800);
      }
      const settled = await read();
      check(`${label}: says no new evaluation was created`, testCase.body.test(settled.text), settled.text);
      check(`${label}: links to Plan & Usage`, settled.links.some(([href, text]) => href === "#/account" && /Plan & Usage/.test(text)), JSON.stringify(settled.links));
      check(`${label}: links to saved decisions`, settled.links.some(([href]) => href === "#/opportunities"), JSON.stringify(settled.links));
      check(`${label}: never shows the raw error code`, !/EVALUATION_LIMIT_REACHED/.test(settled.text), settled.text);
      if (!testCase.monthlyAllowed) check(`${label}: never calls a Private Beta allowance monthly`, !/monthly|this month/i.test(settled.text), settled.text);
      check(`${label}: stays on the Evaluate page (no reload, no route change)`, loads === loadsAtStart && settled.hash === hashAtStart, `loads=${loads - loadsAtStart} hash=${settled.hash}`);
      check(`${label}: keeps what the customer typed`, settled.identityKept === IDENTITY, settled.identityKept);
      check(`${label}: no evaluation result is invented`, settled.savedDecisionShown === false);
      check(`${label}: exactly one evaluation request was sent`, evaluationCalls.length - callsBefore === 1, `${evaluationCalls.length - callsBefore}`);
      check(`${label}: allowance lookup is read-only and single`, entitlementCalls === 1, `${entitlementCalls}`);
    } catch (error) {
      check(`${label}: completed without error`, false, String(error?.message || error).slice(0, 300));
    } finally {
      await context.close();
    }
  }
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\nEvaluate page allowance audit: ${passes.length}/${passes.length + failures.length} checks passed.`);
process.exit(failures.length ? 1 : 0);
