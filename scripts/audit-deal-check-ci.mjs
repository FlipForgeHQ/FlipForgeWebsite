// Rendered audit for Deal Check™ / Scenario Lab™ / Decision Receipt Pro™ on the real saved-decision route
// (#/opportunities/{id}), desktop and phone. Controlled synthetic responses only: no provider, no evaluation, no
// production data. Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
// Screenshots: FLIPFORGE_DEAL_CHECK_SCREENSHOT_DIR (default artifacts/deal-check).
import fs from "node:fs";
import { chromium } from "playwright";
import { details, timeline, envelope, IDS } from "./fixtures/deal-check/fixtures.mjs";

const reportCrash = error => { console.log(`::error title=deal-check crash::${String(error?.message || error).split("\n")[0].slice(0, 400)}`); process.exit(1); };
process.on("unhandledRejection", reportCrash);
process.on("uncaughtException", reportCrash);

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const screenshotDir = process.env.FLIPFORGE_DEAL_CHECK_SCREENSHOT_DIR || "artifacts/deal-check";
fs.mkdirSync(screenshotDir, { recursive: true });

const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);
const D = details();
const browser = await chromium.launch({ headless: true, executablePath });
const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };

async function open(viewport, id, { disabled = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const requests = [];
  await context.addInitScript(flag => {
    try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); localStorage.setItem("flipforge.guidedMode.enabled", "false"); } catch (_) {}
    if (flag) window.FlipForgeDealCheckDisabled = true;
  }, disabled);
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "deal-check@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "deal-check@flipforge.test", fullName: "Deal Check Audit", membershipActive: true, membershipConfigured: true }) });` }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    requests.push(`${request.method()} ${p}`);
    const cid = request.headers()["x-correlation-id"] || "deal-check-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    const idOf = prefix => decodeURIComponent(p.slice(prefix.length));
    if (p === "/api/v1/health") return json(200, envelope(cid, { status: "configured", bridgeEnabled: true }));
    if (p.startsWith("/api/v1/opportunities/")) { const d = D[idOf("/api/v1/opportunities/")]; return d ? json(200, envelope(cid, d)) : json(404, { error: { code: "NOT_FOUND", correlationId: cid } }); }
    if (p.startsWith("/api/v1/lifecycle/")) { const t = timeline(idOf("/api/v1/lifecycle/")); return t ? json(200, envelope(cid, t)) : json(404, { error: { code: "NOT_FOUND", correlationId: cid } }); }
    if (p.startsWith("/api/v1/evidence/")) return json(200, envelope(cid, { kind: "evidence", opportunityId: idOf("/api/v1/evidence/"), acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 0, acceptedSales: [], excludedSales: [], transactionAuthority: false }));
    if (p.startsWith("/api/v1/psa-advisor/")) return json(200, envelope(cid, { kind: "psa-advisor", opportunityId: idOf("/api/v1/psa-advisor/"), recalculated: false, available: false }));
    if (p === "/api/v1/entitlements") return json(200, envelope(cid, { kind: "entitlements", readOnly: true, current: { code: "PRIVATE_BETA", accessState: "PRIVATE_BETA_ACTIVE", effectiveEvaluationLimit: 5 }, usage: { completedEvaluations: 1, evaluationAllowanceLimit: 5, remainingEvaluations: 4, evaluationAllowedNow: true } }));
    if (p === "/api/v1/forge-heat") return json(200, envelope(cid, { kind: "forge-heat", items: [], access: { allowed: true } }));
    return json(404, { error: { code: "QA_NOT_MOCKED", message: p, correlationId: cid } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error.message || error)));
  await page.goto(`${baseUrl}/#/opportunities/${encodeURIComponent(id)}`, { waitUntil: "load" });
  return { context, page, requests, errors };
}

async function settle(page) {
  await page.waitForSelector("[data-ff-deal-check]", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const [name, id] of Object.entries(IDS)) {
    const label = `${vpName}/${name}`;
    const { context, page, requests, errors } = await open(viewport, id);
    await settle(page);
    const g = D[id].opportunity.governedDecision;
    const facts = await page.evaluate(() => {
      const section = document.querySelector("[data-ff-deal-check]");
      if (!section) return null;
      const hero = document.querySelector(".customer-intelligence-hero");
      const small = [...section.querySelectorAll("*")].filter(el => {
        const style = getComputedStyle(el);
        const direct = [...el.childNodes].some(node => node.nodeType === 3 && node.nodeValue.trim());
        return direct && style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length && parseFloat(style.fontSize) < 14;
      }).map(el => `${el.tagName}.${el.className}:${getComputedStyle(el).fontSize}`);
      return {
        afterHero: Boolean(hero) && Boolean(hero.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING) && [...document.querySelectorAll("#main-content [data-ff-cdi-stack-host], #main-content section[data-ff-decision-card-evidence]")].every(el => section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
        count: document.querySelectorAll("[data-ff-deal-check]").length,
        verdict: section.querySelector(".ffdc-verdict")?.textContent.trim(),
        figures: [...section.querySelectorAll("[data-ffdc-figures] .ffdc-figure")].map(f => f.textContent.replace(/\s+/g, " ").trim()),
        text: section.innerText,
        ladder: Boolean(section.querySelector("[data-ffdc-ladder]")),
        labBlocked: Boolean(section.querySelector("[data-ffdc-lab-blocked]")),
        receipt: Boolean(section.querySelector("[data-ffdc-receipt]")),
        small,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sectionOverflow: section.scrollWidth - section.clientWidth
      };
    });
    check(`${label}: Deal Check renders once`, facts && facts.count === 1, JSON.stringify(facts?.count));
    if (!facts) { await context.close(); continue; }
    check(`${label}: placed under the decision hero, before the deeper evidence sections`, facts.afterHero);
    check(`${label}: verdict equals the governed verdict`, facts.verdict === g.recommendation, facts.verdict);
    check(`${label}: Decision Receipt Pro section present`, facts.receipt);
    check(`${label}: decision summary shows profit, exit difficulty and evidence`, /Potential profit/i.test(facts.text) && /Exit difficulty/i.test(facts.text) && /Evidence & risk/i.test(facts.text));
    check(`${label}: exit difficulty never favourable without saved evidence`, !(name === "verify" || name === "legacy") || !/Exit difficulty\s*(Lower|Moderate)/i.test(facts.text));
    check(`${label}: no text below 14px`, facts.small.length === 0, facts.small.slice(0, 4).join(" | "));
    check(`${label}: no horizontal page overflow`, facts.overflowX <= 1 && facts.sectionOverflow <= 1, `${facts.overflowX}/${facts.sectionOverflow}`);
    check(`${label}: no $0.00 shown for missing values`, !/(Max Buy|Break-even buy price|Supported value)\s*\$0\.00/.test(facts.text));
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
    check(`${label}: only GET requests, no evaluation or write`, requests.every(r => r.startsWith("GET ")) && !requests.some(r => /evaluations|sell-watch|reported-sales/.test(r)), requests.join(","));
    if (g.maximumBuyPriceCents && name !== "legacy") {
      const maxBuy = `$${(g.maximumBuyPriceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      check(`${label}: shows the saved Max Buy`, facts.figures.some(f => f.includes("Max Buy") && f.includes(maxBuy)), facts.figures.join(" | "));
      check(`${label}: price ladder drawn`, facts.ladder);
    }
    if (name === "verifyThin") {
      check(`${label}: thin VERIFY shows Max Buy for reference only`, /for reference until the evidence clears/.test(facts.text) && /Reference only/.test(facts.text));
    }
    if (name === "verify" || name === "legacy") {
      check(`${label}: no $0.00 anywhere in Deal Check`, !/\$0\.00/.test(facts.text), (facts.text.match(/.{0,40}\$0\.00.{0,20}/) || [""])[0]);
      check(`${label}: Scenario Lab blocked`, facts.labBlocked);
      check(`${label}: no Max Buy figure value`, facts.figures.some(f => /Max Buy\s*(Not set|Not calculated)/.test(f)), facts.figures.join(" | "));
    }
    if (name === "buy") {
      check(`${label}: Max Buy reasoning names the binding limit`, /Sets Max Buy/i.test(facts.text));
      check(`${label}: history shows an older VERIFY receipt with Max Buy not set`, /Max Buy Not set/.test(facts.text.replace(/\s+/g, " ")));
      check(`${label}: decision history shows both frozen receipts`, /WATCH[\s\S]*Oct 20, 2026|Oct 20, 2026[\s\S]*WATCH/.test(facts.text) && /never rescored/.test(facts.text));
    }
    await page.screenshot({ path: `${screenshotDir}/${vpName}-${name}.png`, fullPage: true });
    await page.locator("[data-ff-deal-check]").screenshot({ path: `${screenshotDir}/${vpName}-${name}-deal-check.png` });

    if (name === "watch") {
      // Scenario Lab interaction: simulate a lower price; the saved decision must not change.
      const requestsBeforeLab = requests.length;
      await page.locator("[data-ffdc-lab] > summary").click();
      const item = page.locator('[data-ffdc-lab-form] input[name="price"]');
      await item.fill("600");
      await page.waitForTimeout(200);
      const sim = await page.evaluate(() => {
        const section = document.querySelector("[data-ff-deal-check]");
        return {
          banner: section.querySelector("[data-ffdc-simulation]")?.textContent || "",
          out: (section.querySelector("[data-ffdc-lab-out]")?.textContent || "").replace(/\s+/g, " "),
          verdict: section.querySelector(".ffdc-verdict")?.textContent.trim(),
          maxBuy: [...section.querySelectorAll("[data-ffdc-figures] .ffdc-figure")].map(f => f.textContent.replace(/\s+/g, " ")).find(t => t.includes("Max Buy")),
          heroVerdictStillThere: Boolean(document.querySelector(".customer-intelligence-hero"))
        };
      });
      const expectedMax = `$${(g.maximumBuyPriceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      check(`${label}: simulation is labelled`, /SIMULATION/.test(sim.banner));
      check(`${label}: simulated price shown against saved Max Buy`, /\$600\.00/.test(sim.out) && /saved Max Buy/.test(sim.out), sim.out.slice(0, 200));
      check(`${label}: saved verdict and Max Buy unchanged after simulation`, sim.verdict === g.recommendation && sim.maxBuy.includes(expectedMax), `${sim.verdict} ${sim.maxBuy}`);
      check(`${label}: simulation result contains no verdict`, !/\b(BUY|WATCH|VERIFY|PASS)\b/.test(sim.out.replace(/BUY, WATCH, VERIFY or PASS/g, "")), sim.out.slice(0, 160));
      await page.locator('[data-ffdc-lab-form] input[value="custom"]').check();
      await page.locator('[data-ffdc-lab-form] input[name="fee"]').fill("10");
      await page.locator('[data-ffdc-lab-form] input[name="targetProfit"]').fill("75");
      await page.waitForTimeout(200);
      const custom = (await page.locator("[data-ffdc-lab-out]").textContent()).replace(/\s+/g, " ");
      check(`${label}: own-costs mode uses the saved supported value`, /\$850\.00/.test(custom) && /Most you could pay for your target/.test(custom), custom.slice(0, 200));
      check(`${label}: simulation made no requests at all`, requests.length === requestsBeforeLab, requests.slice(requestsBeforeLab).join(","));
      await page.locator('[data-ffdc-lab-form] input[name="price"]').fill("");
      await page.waitForTimeout(150);
      const emptyOut = (await page.locator("[data-ffdc-lab-out]").textContent()).replace(/\s+/g, " ");
      check(`${label}: empty price is refused, not replaced by the saved ask`, /Enter an all-in price/.test(emptyOut), emptyOut.slice(0, 120));
      await page.locator('[data-ffdc-lab-form] input[name="price"]').fill("600");
      await page.locator("[data-ffdc-lab]").screenshot({ path: `${screenshotDir}/${vpName}-${name}-scenario-lab.png` });
    }
    await context.close();
  }
}

// Kill switch: disabled renders nothing and leaves the existing page intact.
{
  const { context, page } = await open(VIEWPORTS.desktop, IDS.buy, { disabled: true });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({ deal: Boolean(document.querySelector("[data-ff-deal-check]")), hero: Boolean(document.querySelector(".customer-intelligence-hero")) }));
  check("kill switch: no Deal Check, existing saved-decision page unchanged", !state.deal && state.hero, JSON.stringify(state));
  await context.close();
}

// Route change away removes Deal Check.
{
  const { context, page } = await open(VIEWPORTS.desktop, IDS.buy);
  await settle(page);
  await page.evaluate(() => { location.hash = "#/dashboard"; });
  await page.waitForTimeout(1200);
  check("leaving the saved decision removes Deal Check", !(await page.$("[data-ff-deal-check]")));
  await page.evaluate(id => { location.hash = `#/opportunities/${encodeURIComponent(id)}`; }, IDS.pass);
  await settle(page);
  const verdict = await page.evaluate(() => document.querySelector("[data-ff-deal-check] .ffdc-verdict")?.textContent.trim());
  check("switching cards shows the new card's governed verdict only", verdict === "PASS", verdict);
  await context.close();
}

await browser.close();
console.log("DealCheckRenderedAudit");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.log(`FAIL: ${failure}`);
if (failures.length) process.exit(1);
