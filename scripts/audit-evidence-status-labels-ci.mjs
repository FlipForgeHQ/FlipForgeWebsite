// Renders the real evidence-authority-split-v1.js against #866-shaped /api/v1/evidence responses in a headless
// browser and checks that only rows whose server status is EXCLUDED are called "Excluded", that counts match the
// server, that the saved decision is shown separately, and that a count disagreement fails closed.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const script = await fs.readFile(path.resolve("saas-prototype/evidence-authority-split-v1.js"), "utf8");
let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed += 1; console.log(`PASS | ${label}`); }
  else { failed += 1; console.log(`FAIL | ${label}`); }
}

function row(id, status, extra = {}) {
  const admitted = status === "ADMITTED";
  return {
    id, recordedAt: "2026-10-01T00:00:00Z", type: "SOLD_COMP", sourceName: "CARDSIGHT_EBAY",
    sourceUrl: `https://www.ebay.com/itm/${100000000000 + id}`, amount: 1200 + id, soldAt: "2026-09-20T10:00:00Z",
    gradeCondition: "PSA 10", confidence: 90, accepted: status !== "NOT_USED_REJECTED", historicallyAccepted: true,
    identityMatch: true, completedSale: true, authorityEligible: admitted, currentAuthorityRevalidated: true,
    currentAdmissionStatus: status, currentAdmissionReasons: admitted ? [] : (extra.reasons || []),
    rejectionReason: admitted ? null : (extra.reason || ""), ...extra.overrides
  };
}

function response(linked, overrides = {}) {
  const counts = { admitted: 0, excluded: 0, held: 0, notUsed: 0 };
  for (const item of linked) {
    const key = { ADMITTED: "admitted", EXCLUDED: "excluded", HELD: "held", NOT_USED: "notUsed" }[item.currentAdmissionStatus];
    if (key) counts[key] += 1;
  }
  return {
    kind: "evidence", readOnly: true, opportunityId: "EBAY-v1|117425668889|0",
    cardIdentity: "2018 Topps Chrome #150 Shohei Ohtani PSA 10",
    acceptedExactCompletedSales: linked.filter(i => i.authorityEligible === true).length,
    visibleButAuthorityIneligible: linked.filter(i => i.authorityEligible !== true).length,
    currentAdmission: { ...counts, linkedRows: linked.length, policy: "governed-sold-evidence-admission-v1" },
    decisionTime: { available: true, evaluatedAt: "2026-10-09T15:12:00Z", recommendation: "BUY", askPrice: 1215,
      supportedValue: 1675, salesCountAtDecision: 227, immutable: true },
    linkedEvidence: linked, manualCandidates: [], timeline: [], ...overrides
  };
}

const page0 = `<!doctype html><html><body><main id="main-content"><div class="page customer-management-page" data-ff-evidence-experience="v2">
  <section class="panel"><header class="panel-header"><div><h2>What FlipForge trusted</h2><p>placeholder</p></div></header><div class="panel-body"></div></section>
</div></main></body></html>`;

async function render(browser, data) {
  const page = await browser.newPage();
  await page.route("**/*", route => route.fulfill({ status: 200, contentType: "text/html", body: page0 }));
  await page.goto("http://flipforge.test/app/customer/#/evidence/" + encodeURIComponent(data.opportunityId));
  await page.evaluate(payload => {
    window.fetch = async (url, init) => ({
      ok: true,
      json: async () => ({ meta: { contractVersion: "1.0", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence",
        correlationId: init.headers["X-Correlation-Id"] }, data: payload })
    });
  }, data);
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => document.querySelector(".customer-management-page")?.dataset.ffEvidenceAuthoritySplit, null, { timeout: 5000 });
  return page;
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
try {
  // 1. 150 counted sales plus every non-counted status.
  const linked = [];
  for (let i = 1; i <= 150; i += 1) linked.push(row(i, "ADMITTED"));
  linked.push(row(201, "EXCLUDED", { reasons: ["WRONG_PARALLEL_OR_VARIATION"], reason: "Checked against its sale record and excluded by current evidence rules: WRONG_PARALLEL_OR_VARIATION." }));
  linked.push(row(202, "HELD", { reasons: ["SALE_TITLE_UNAVAILABLE"], reason: "Not counted and not rejected: held for review (SALE_TITLE_UNAVAILABLE)." }));
  linked.push(row(203, "HELD", { reasons: ["SALE_DATE_MISSING"], reason: "Not counted and not rejected: held for review (SALE_DATE_MISSING)." }));
  linked.push(row(204, "NOT_USED", { reasons: ["SAME_SALE_AS_ANOTHER_LINKED_ROW"], reason: "Not used for the current price (SAME_SALE_AS_ANOTHER_LINKED_ROW)." }));
  let page = await render(browser, response(linked));
  const state = await page.evaluate(() => ({
    split: document.querySelector(".customer-management-page").dataset.ffEvidenceAuthoritySplit,
    trustedRows: document.querySelectorAll("[data-ff-trusted-evidence-table] tbody tr").length,
    excludedRows: document.querySelectorAll('[data-ff-status-table="EXCLUDED"] tbody tr').length,
    heldRows: document.querySelectorAll('[data-ff-status-table="HELD"] tbody tr').length,
    notUsedRows: document.querySelectorAll('[data-ff-status-table="NOT_USED"] tbody tr').length,
    heldText: document.querySelector('[data-ff-status-table="HELD"]')?.innerText || "",
    notUsedText: document.querySelector('[data-ff-status-table="NOT_USED"]')?.innerText || "",
    excludedText: document.querySelector('[data-ff-status-table="EXCLUDED"]')?.innerText || "",
    trustedCopy: document.querySelector("[data-ff-trusted-only] .panel-header p")?.textContent || "",
    sectionCopy: document.querySelector("[data-ff-excluded-evidence-section] .panel-header p")?.textContent || "",
    decision: document.querySelector("[data-ff-decision-time-section]")?.innerText || ""
  }));
  check("split renders for 154 linked rows", state.split === "true");
  check("all 150 counted sales are listed as counted (more than 100)", state.trustedRows === 150);
  check("exactly one row is under Excluded", state.excludedRows === 1);
  check("the excluded row shows its real reason", state.excludedText.includes("WRONG_PARALLEL_OR_VARIATION"));
  check("two rows are Held for review", state.heldRows === 2);
  check("held rows are never called excluded", !/excluded/i.test(state.heldText));
  check("held rows say not rejected", state.heldText.includes("not rejected"));
  check("one row is Not used", state.notUsedRows === 1 && !/excluded/i.test(state.notUsedText));
  check("summary separates excluded, held and not used", state.sectionCopy.includes("1 excluded") && state.sectionCopy.includes("2 held for review") && state.sectionCopy.includes("1 not used"));
  check("counted sales are labelled provider-reported, not verified", state.trustedCopy.includes("not been independently confirmed") && !/verified/i.test(state.trustedCopy));
  check("saved decision panel shows the decision as saved", state.decision.includes("The saved decision") && state.decision.includes("BUY") && state.decision.includes("$1,675") && state.decision.includes("$1,215") && state.decision.includes("227") && state.decision.includes("2026-10-09"));
  await page.close();

  // 2. An older server without per-row status: nothing is called excluded.
  const legacy = [row(1, "ADMITTED"), row(2, "EXCLUDED", { reason: "" })].map(item => {
    const copy = { ...item };
    delete copy.currentAdmissionStatus;
    delete copy.currentAdmissionReasons;
    return copy;
  });
  const legacyData = response(legacy);
  delete legacyData.currentAdmission;
  page = await render(browser, legacyData);
  const legacyState = await page.evaluate(() => ({
    excluded: document.querySelectorAll('[data-ff-status-table="EXCLUDED"] tbody tr').length,
    notReported: document.querySelectorAll('[data-ff-status-table="NOT_REPORTED"] tbody tr').length
  }));
  check("rows without a reported status are shown as Not counted, never Excluded", legacyState.excluded === 0 && legacyState.notReported === 1);
  await page.close();

  // 3. Server counts that disagree with the rows fail closed.
  const bad = response(linked);
  bad.currentAdmission.excluded = 7;
  page = await render(browser, bad);
  const badState = await page.evaluate(() => {
    const root = document.querySelector(".customer-management-page");
    const visible = el => el && !el.closest("[hidden]");
    return {
      split: root.dataset.ffEvidenceAuthoritySplit,
      notice: visible(root.querySelector("[data-ff-evidence-invalid-notice]")),
      evidenceVisible: [...root.querySelectorAll("section.panel")].filter(s => !s.matches("[data-ff-evidence-invalid-notice]") && visible(s)).length
    };
  });
  check("status-count disagreement fails closed", badState.split === "invalid");
  check("a count disagreement hides every evidence panel and shows a notice", badState.notice === true && badState.evidenceVisible === 0);
  await page.close();
} finally {
  await browser.close();
}
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failed) process.exit(1);
