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
  if (entitlementsMode === "available") {
    // Evaluations are available again by the time the lookup answers (a reservation released, or the allowance raised).
    return envelope(correlationId, { kind: "entitlements", readOnly: true,
      current: { code: "PRIVATE_BETA", accessState: "PRIVATE_BETA_ACTIVE", evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", effectiveEvaluationLimit: 5 },
      usage: { evaluationAllowanceScope: "PRIVATE_BETA_LIFETIME", completedEvaluations: 4, inProgressReservations: 0, admissionUsage: 4,
        evaluationAllowanceLimit: 5, remainingEvaluations: 1, evaluationAllowedNow: true } });
  }
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
      if (evalMode === "limit-slow") await new Promise(r => setTimeout(r, 3000));
      if (evalMode === "limit" || evalMode === "limit-slow") return json(429, { error: { code: "EVALUATION_LIMIT_REACHED", message: "Your monthly evaluation limit has been reached.", correlationId } }, { "Retry-After": "1468800" });
      // A 429 that is not the allowance: a gateway/edge rate limit with its own code, or no error body at all.
      if (evalMode === "rate-limited") return json(429, { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly.", correlationId } }, { "Retry-After": "30" });
      if (evalMode === "rate-limited-bare") return route.fulfill({ status: 429, headers: { "Retry-After": "30" }, contentType: "text/plain", body: "" });
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
  { label: "evaluations available again when the lookup answers", eval: "limit", ent: "available",
    title: /^Evaluation limit reached$/, body: /^(?!.*You have used).*No new evaluation was created for this listing and nothing was saved\./ },
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
      // A real customer action on the submit button, not a programmatic submit. On a phone, a tap. On desktop the Guided
      // Mode panel is docked over the right-hand column where the button sits (pre-existing, tracked separately), so the
      // button is used from the keyboard there: focus it and press Enter. Either way the page is left scrolled to the
      // button, below the alert.
      const submit = form.locator('.staging-form-actions button[type="submit"]');
      if (viewport.width > 600) { await submit.focus(); await page.keyboard.press("Enter"); }
      else await submit.click({ timeout: 5000 });
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
          savedDecisionShown: Boolean(document.querySelector("#main-content .customer-intelligence-hero, #main-content [data-staging-evaluation-result]")),
          inView: (() => { const r = alert.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; })(),
          focused: document.activeElement === alert,
          contradictingCoach: (() => { const coach = document.querySelector("#main-content [data-ff-recovery]");
            return coach ? coach.innerText.replace(/\s+/g, " ") : ""; })()
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
      check(`${label}: the alert is on screen after the click`, settled.inView, JSON.stringify({ inView: settled.inView }));
      check(`${label}: focus moves to the alert`, settled.focused);
      check(`${label}: no recovery card contradicts the allowance message`, !/didn.t complete|try again/i.test(settled.contradictingCoach), settled.contradictingCoach);
      check(`${label}: exactly one evaluation request was sent`, evaluationCalls.length - callsBefore === 1, `${evaluationCalls.length - callsBefore}`);
      check(`${label}: allowance lookup is read-only and single`, entitlementCalls === 1, `${entitlementCalls}`);
    } catch (error) {
      check(`${label}: completed without error`, false, String(error?.message || error).slice(0, 300));
    } finally {
      await context.close();
    }
  }
}

// --- A 429 without the allowance code is not an allowance message --------------------------------------------------
for (const mode of ["rate-limited", "rate-limited-bare"]) {
  evalMode = mode;
  entitlementsMode = "beta";
  entitlementCalls = 0;
  const label = `generic 429 (${mode})`;
  const { context, page } = await newPage({ width: 1280, height: 900 });
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    const form = await fillForm(page);
    await form.evaluate(node => node.requestSubmit());
    await page.waitForSelector("#main-content .staging-error[role=alert]", { timeout: 10000 });
    await page.waitForTimeout(800);
    const seen = await page.evaluate(() => ({
      allowancePanel: Boolean(document.querySelector("#main-content [data-evaluation-allowance-reached]")),
      text: document.querySelector("#main-content .staging-error[role=alert]")?.innerText.replace(/\s+/g, " ") || "",
      hash: location.hash
    }));
    check(`${label}: is not shown as an allowance message`, !seen.allowancePanel && !/allowance|evaluation limit|No new evaluation was created/i.test(seen.text), seen.text);
    check(`${label}: still shows an error on the Evaluate page`, seen.text.length > 0 && seen.hash === "#/evaluate", seen.text);
    check(`${label}: does not look up the allowance`, entitlementCalls === 0, `${entitlementCalls}`);
  } catch (error) {
    check(`${label}: completed without error`, false, String(error?.message || error).slice(0, 300));
  } finally {
    await context.close();
  }
}

// Local legacy /app reloads the document on every route change (production-dashboard-guard.js cleanRouteTransition);
// /app/beta keeps the document. After a reload nothing late can arrive, and the in-memory outcome is gone by design.
const LEGACY_RELOADING_PATH = /^\/app\/?$/.test(new URL(baseUrl).pathname);

// --- Late answers never draw Evaluate over a route the customer moved to ---------------------------------------------
for (const scenario of [
  // The 429 arrives at once; the read-only allowance lookup answers 4 s later, after the customer has left.
  { label: "leave while the allowance lookup is pending", eval: "limit", ent: "stall", leaveAfterAlert: true, waitMs: 5500 },
  // The 429 itself arrives 3 s after the customer has left.
  { label: "leave while the evaluation request is in flight", eval: "limit-slow", ent: "beta", leaveAfterAlert: false, waitMs: 4500 }
]) {
  for (const destination of ["#/opportunities", "#/account"]) {
    evalMode = scenario.eval;
    entitlementsMode = scenario.ent;
    entitlementCalls = 0;
    const label = `${scenario.label} -> ${destination}`;
    const { context, page } = await newPage({ width: 1280, height: 900 });
    let loads = 0; page.on("load", () => { loads += 1; });
    try {
      await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
      const form = await fillForm(page);
      const loadsAtStart = loads;
      await form.evaluate(node => node.requestSubmit());
      if (scenario.leaveAfterAlert) await page.waitForSelector("#main-content [data-evaluation-allowance-reached]", { timeout: 10000 });
      else await page.waitForTimeout(300);
      await page.evaluate(hash => { location.hash = hash; }, destination);
      await page.waitForFunction(() => !document.querySelector("#main-content .staging-evaluation-page"), null, { timeout: 5000 });
      // The route-ownership guard repairs a wrong page within milliseconds, so watch for Evaluate being drawn at any
      // moment after the customer left, not just at the end.
      await page.evaluate(() => {
        window.__evaluateRedrawnAfterLeaving = false;
        const watch = () => {
          if (document.querySelector("#main-content .staging-evaluation-page, #main-content [data-evaluation-allowance-reached]")) {
            window.__evaluateRedrawnAfterLeaving = true;
          }
        };
        new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true });
      });
      await page.waitForTimeout(scenario.waitMs);
      const after = await page.evaluate(() => ({
        hash: location.hash,
        redrawnAtAnyMoment: window.__evaluateRedrawnAfterLeaving === true,
        evaluatePage: Boolean(document.querySelector("#main-content .staging-evaluation-page")),
        allowanceAlert: Boolean(document.querySelector("[data-evaluation-allowance-reached]"))
      }));
      check(`${label}: the late answer never draws Evaluate over the new page, even briefly`,
        !after.redrawnAtAnyMoment && !after.evaluatePage && !after.allowanceAlert, JSON.stringify(after));
      check(`${label}: the customer stays where they went`, after.hash === destination
        && loads - loadsAtStart <= (LEGACY_RELOADING_PATH ? 1 : 0), `hash=${after.hash} reloads=${loads - loadsAtStart}`);
      if (LEGACY_RELOADING_PATH) continue;
      // Coming back shows the outcome they missed, with the allowance named.
      await page.evaluate(() => { location.hash = "#/evaluate"; });
      await page.waitForSelector("#main-content [data-evaluation-allowance-reached]", { timeout: 10000 });
      const back = await page.evaluate(() => document.querySelector("#main-content [data-evaluation-allowance-reached] strong")?.textContent.trim() || "");
      check(`${label}: returning to Evaluate shows the named allowance`, /Private Beta evaluation allowance/.test(back), back);
      // Plan & Usage reads entitlements itself, so the single-lookup check only applies to the other destination.
      if (destination === "#/opportunities") check(`${label}: still exactly one allowance lookup`, entitlementCalls === 1, `${entitlementCalls}`);
    } catch (error) {
      check(`${label}: completed without error`, false, String(error?.message || error).slice(0, 300));
    } finally {
      await context.close();
    }
  }
}

// --- The late allowance answer updates the alert in place and keeps fields edited after the refusal -------------------
{
  evalMode = "limit";
  entitlementsMode = "stall";
  entitlementCalls = 0;
  const label = "in-place allowance update";
  const { context, page } = await newPage({ width: 1280, height: 900 });
  try {
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    const form = await fillForm(page);
    await form.evaluate(node => node.requestSubmit());
    await page.waitForSelector("#main-content [data-evaluation-allowance-reached]", { timeout: 10000 });
    await page.evaluate(() => {
      const field = document.querySelector('#main-content [data-staging-evaluation-form] input[name="seller"]');
      field.value = "Edited after the refusal";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const named = await page.waitForFunction(() => /Private Beta evaluation allowance/.test(document.querySelector("#main-content [data-evaluation-allowance-reached] strong")?.textContent || ""), null, { timeout: 8000 })
      .then(() => true, () => false);
    const seen = await page.evaluate(() => ({
      seller: document.querySelector('#main-content [data-staging-evaluation-form] input[name="seller"]')?.value || "",
      alerts: document.querySelectorAll("#main-content [data-evaluation-allowance-reached]").length,
      ownsEvaluate: Boolean(document.querySelector("#main-content .staging-evaluation-page"))
    }));
    check(`${label}: names the allowance once the lookup answers`, named);
    check(`${label}: keeps a field edited after the refusal`, seen.seller === "Edited after the refusal", seen.seller);
    check(`${label}: exactly one alert on the page`, seen.alerts === 1 && seen.ownsEvaluate, JSON.stringify(seen));
  } catch (error) {
    check(`${label}: completed without error`, false, String(error?.message || error).slice(0, 300));
  } finally {
    await context.close();
  }
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\nEvaluate page allowance audit: ${passes.length}/${passes.length + failures.length} checks passed.`);
process.exit(failures.length ? 1 : 0);
