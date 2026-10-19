// Legacy evidence-label compatibility (source-truth wording).
//
// The customer evidence headings were renamed ("Trusted completed sales" -> "Matched exact sales",
// "Trusted sales" -> "Matched sales"). Pages rendered by an earlier build (a cached script or an older backend) still
// carry the old headings. This audit runs the real Decision Card evidence layer and the real CDI signal stack in a
// headless browser against both the current and the legacy headings, and checks that the accepted-sales count is read
// in every case and that the legacy heading is never shown to the customer.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const read = file => fs.readFile(path.resolve(file), "utf8");
const cardScript = await read("saas-prototype/decision-card-evidence-v1.js");
const stackScript = await read("saas-prototype/customer-cdi-signal-stack-v1.js");

let passed = 0;
let failed = 0;
function check(label, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS | ${label}`); }
  else { failed += 1; console.log(`FAIL | ${label}${detail ? ` [${detail}]` : ""}`); }
}

const decisionIntelligencePage = gateLabel => `<!doctype html><html><body><main id="main-content">
  <div class="ff-di-page" data-ff-decision-intelligence-source="server">
    <div class="ff-di-controls"></div>
    <section data-ff-di-v2-command>
      <article class="ff-di-v2-verdict">
        <span class="ff-di-v2-decision">WATCH</span>
        <div class="ff-di-v2-verdict-main"><h2>2018 Topps Chrome Shohei Ohtani #150 PSA 9</h2><p>Saved reason.</p></div>
        <div class="ff-di-v2-verdict-metrics"><div><span>Supported value</span><strong>$813</strong></div><div><span>Confidence</span><strong>82/100</strong></div><div><span>Risk</span><strong>35/100</strong></div></div>
      </article>
      <div class="ff-di-v2-gate"><span>Exact identity</span><strong>Verified</strong></div>
      <div class="ff-di-v2-gate"><span>${gateLabel}</span><strong>7 accepted</strong></div>
      <div class="ff-di-v2-gate"><span>Excluded evidence</span><strong>2</strong></div>
      <div class="ff-di-v2-receipt-grid"><div><span>Evaluated ask</span><strong>$640</strong></div><div><span>Observed</span><strong>2026-10-01</strong></div></div>
      <div class="ff-di-v2-change"><h3>Two more matched sales would change the call.</h3></div>
    </section>
  </div></main></body></html>`;

const savedDecisionPage = metricLabel => `<!doctype html><html><body><main id="main-content">
  <div class="customer-intelligence-page">
    <section class="customer-intelligence-hero"><span class="staging-status">WATCH</span>
      <div class="customer-hero-title"><h2>2018 Topps Chrome Shohei Ohtani #150 PSA 9</h2></div>
      <div class="customer-hero-copy"><p>PSA 9</p></div><div class="customer-tracked-state"><small>Saved 2026-10-01</small></div></section>
    <section data-ff-decision-summary><div class="ff-decision-summary-main"><p>Saved reason.</p><p class="ff-decision-next">Next step.</p></div></section>
    <div class="customer-intelligence-metrics"><article><span>${metricLabel}</span><strong>7</strong></article><article><span>Confidence</span><strong>82</strong></article><article><span>Risk</span><strong>35</strong></article></div>
  </div></main></body></html>`;

async function render(browser, url, body, scripts) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.fulfill({ status: 200, contentType: "text/html", body }));
  await page.goto(url);
  for (const content of scripts) await page.addScriptTag({ content });
  await page.waitForTimeout(400);
  return { page, errors };
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
try {
  for (const [variant, gateLabel] of [["current", "Matched exact sales"], ["legacy", "Trusted completed sales"]]) {
    const { page, errors } = await render(browser, "http://flipforge.test/app/beta/#/decision-intelligence",
      decisionIntelligencePage(gateLabel), [cardScript, stackScript]);
    const state = await page.evaluate(() => {
      const panel = document.querySelector("[data-ff-decision-card-evidence]");
      const signature = panel ? JSON.parse(panel.dataset.ffDecisionCardSignature || "[]") : [];
      const sales = document.querySelector('[data-ff-cdi-signal="sales"]');
      return {
        cardAccepted: signature[4] ?? null,
        stackLabel: sales?.querySelector(".ff-cdi-signal-copy span")?.textContent || null,
        stackValue: sales?.querySelector(".ff-cdi-signal-copy strong")?.textContent || null,
        stackText: document.querySelector("[data-ff-cdi-stack]")?.textContent || ""
      };
    });
    check(`Decision Intelligence (${variant} heading "${gateLabel}"): Decision Card reads the accepted count`,
      state.cardAccepted === "7 accepted", JSON.stringify(state.cardAccepted));
    check(`Decision Intelligence (${variant} heading): signal stack reads the accepted count`,
      state.stackValue === "7 accepted", JSON.stringify(state.stackValue));
    check(`Decision Intelligence (${variant} heading): signal stack shows the current customer label`,
      state.stackLabel === "Matched sales" && !/Trusted|Trustworthy/.test(state.stackText), JSON.stringify(state.stackLabel));
    check(`Decision Intelligence (${variant} heading): no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  for (const [variant, metricLabel] of [["current", "Matched sales"], ["original", "Accepted exact sales"], ["legacy", "Trusted sales"]]) {
    const { page, errors } = await render(browser, "http://flipforge.test/app/beta/#/opportunities/EBAY-QA-1",
      savedDecisionPage(metricLabel), [cardScript]);
    const accepted = await page.evaluate(() => {
      const panel = document.querySelector("[data-ff-decision-card-evidence]");
      return panel ? JSON.parse(panel.dataset.ffDecisionCardSignature || "[]")[4] ?? null : null;
    });
    check(`Saved decision (${variant} metric "${metricLabel}"): Decision Card reads the accepted count`, accepted === "7", JSON.stringify(accepted));
    check(`Saved decision (${variant} metric): no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // An unrelated heading must still not be read as accepted sales (the lookup did not become a loose match).
  const { page } = await render(browser, "http://flipforge.test/app/beta/#/decision-intelligence",
    decisionIntelligencePage("Sales seen"), [cardScript]);
  const unrelated = await page.evaluate(() => JSON.parse(document.querySelector("[data-ff-decision-card-evidence]")?.dataset.ffDecisionCardSignature || "[]")[4] ?? null);
  check("an unrelated heading is not read as accepted sales", unrelated === "Unavailable", JSON.stringify(unrelated));
  await page.close();
} finally {
  await browser.close();
}

console.log(`Legacy evidence-label compatibility: ${passed}/${passed + failed} passed.`);
if (failed) process.exit(1);
