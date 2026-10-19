// Guided Mode on Evaluate points at the manual evaluation form, not at a hidden control in the Bulk CSV panel.
//
// Found 2026-10-19: "Show me the evaluation area" and "Next: complete evaluation →" ran
// main.querySelector("[data-staging-evaluation-form], .staging-evaluation-panel, .panel"), which returns the first match
// in document order - the Bulk CSV panel - and then highlighted that panel's hidden <input type=file>. Nothing visible
// was highlighted and the page did not scroll to the form.
//
// For desktop and phone the audit presses each of the two guide buttons and checks that the highlighted element is the
// manual form's first field (name="externalListingId"), that it is visible and scrolled into view, and that no hidden,
// file or zero-size element is highlighted. It also checks the accessibility fixes shipped with it: the four Guided
// Mode step buttons have explicit labels ("Step 1 of 4: Card ..."), and a disabled button (the Bulk CSV "Evaluate CSV"
// button before a file is chosen) looks unavailable (opacity .55, not-allowed cursor).
// Controlled responses only: no evaluation is submitted, no provider is called.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import { chromium } from "playwright";

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const browser = await chromium.launch({ headless: true, executablePath });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 761 });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
    } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "guide-target-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "guide-target-audit@flipforge.test", fullName: "Guide Target Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const evaluationCalls = [];
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "guide-target-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, { meta: { correlationId }, data: { status: "configured" } });
    if (url.pathname === "/api/v1/evaluations") {
      evaluationCalls.push(request.method());
      return json(429, { error: { code: "EVALUATION_LIMIT_REACHED", message: "No evaluation in this audit.", correlationId } });
    }
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message.slice(0, 160)));
  return { context, page, errors, evaluationCalls };
}

async function openGuide(page) {
  await page.waitForFunction(() => document.querySelector(".ff-guide-panel, .ff-guide-launcher"), null, { timeout: 15000 }).catch(() => {});
  if (await page.locator(".ff-guide-panel").count()) return true;
  const launcher = page.locator(".ff-guide-launcher");
  if (await launcher.count()) {
    await launcher.first().click();
    await page.waitForTimeout(400);
  }
  return (await page.locator(".ff-guide-panel").count()) > 0;
}

function highlightState(page) {
  return page.evaluate(() => {
    const target = document.querySelector(".ff-guide-highlight");
    const expected = document.querySelector('#main-content [data-staging-evaluation-form] [name="externalListingId"]');
    if (!target) return { found: false, expectedFound: Boolean(expected) };
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      found: true,
      expectedFound: Boolean(expected),
      isExpected: target === expected,
      tag: `${target.tagName.toLowerCase()}${target.getAttribute("type") ? `[type=${target.getAttribute("type")}]` : ""}${target.getAttribute("name") ? `[name=${target.getAttribute("name")}]` : ""}`,
      hidden: Boolean(target.hidden || target.closest("[hidden]")) || style.display === "none" || style.visibility === "hidden",
      file: String(target.getAttribute("type") || "").toLowerCase() === "file",
      zeroSize: rect.width <= 0 || rect.height <= 0,
      inView: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      insideBulk: Boolean(target.closest(".bulk-evaluation, [data-bulk-evaluation], .bulk-actions"))
    };
  });
}

async function pressGuideButton(page, label) {
  const button = page.locator(".ff-guide-panel button.ff-guide-action", { hasText: label });
  if (!(await button.count())) return false;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await button.first().click();
  // Smooth scrolling settles well within 1.5 s.
  await page.waitForTimeout(1500);
  return true;
}

try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const { context, page, errors, evaluationCalls } = await newPage(viewport);
    await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
    await page.waitForSelector("#main-content [data-staging-evaluation-form]", { timeout: 15000 });
    // Let the route finish settling (late renders reset the scroll position), as a customer would before pressing.
    await page.waitForTimeout(1500);
    const bulkFirst = await page.evaluate(() => {
      const form = document.querySelector("#main-content [data-staging-evaluation-form]");
      const firstPanel = document.querySelector("#main-content .panel");
      return Boolean(firstPanel && form && !firstPanel.contains(form) && (firstPanel.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    check(`${label}: precondition - a panel without the manual form comes before it on Evaluate (the case that failed)`, bulkFirst);
    check(`${label}: Guided Mode panel is open on Evaluate`, await openGuide(page));

    for (const buttonLabel of ["Show me the evaluation area", "Next: complete evaluation →"]) {
      const pressed = await pressGuideButton(page, buttonLabel);
      check(`${label}: "${buttonLabel}" is offered on Evaluate`, pressed);
      if (!pressed) continue;
      const state = await highlightState(page);
      check(`${label}: "${buttonLabel}" highlights the manual evaluation form's first field (name="externalListingId")`, state.found && state.isExpected, state.tag || "nothing highlighted");
      check(`${label}: "${buttonLabel}" never highlights a hidden, file or zero-size element`, state.found && !state.hidden && !state.file && !state.zeroSize && !state.insideBulk,
        JSON.stringify({ tag: state.tag, hidden: state.hidden, file: state.file, zeroSize: state.zeroSize, insideBulk: state.insideBulk }));
      check(`${label}: "${buttonLabel}" scrolls the field into view`, state.found && state.inView, state.tag || "");
    }

    const steps = await page.evaluate(() => [...document.querySelectorAll(".ff-guide-panel .ff-guide-step-nav button")].map(button => button.getAttribute("aria-label") || ""));
    check(`${label}: the four Guided Mode step buttons have explicit labels ("Step N of 4: ...")`,
      steps.length === 4 && steps.every((value, index) => new RegExp(`^Step ${index + 1} of 4: (?:Card|Evaluate|Why|Track)(?: \\((?:done|current)\\))?$`).test(value)), JSON.stringify(steps));

    const disabled = await page.evaluate(() => {
      const button = document.querySelector("#main-content [data-bulk-run]");
      if (!button) return null;
      const style = getComputedStyle(button);
      return { disabled: button.disabled, opacity: Number(style.opacity), cursor: style.cursor, text: button.textContent.trim() };
    });
    check(`${label}: the disabled "Evaluate CSV" button looks unavailable (opacity .55, not-allowed cursor)`,
      Boolean(disabled && disabled.disabled && Math.abs(disabled.opacity - 0.55) < 0.01 && disabled.cursor === "not-allowed"), JSON.stringify(disabled));
    check(`${label}: no evaluation was submitted`, evaluationCalls.length === 0, String(evaluationCalls.length));
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (error) {
  failures.push(`audit did not complete: ${String(error.message || error).split("\n")[0]}`);
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Guided Mode evaluation target audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nGuided Mode evaluation target audit: ${passes.length}/${passes.length + failures.length} passed.`);
process.exit(failures.length ? 1 : 0);
