import { chromium } from "playwright";

const baseUrl = (process.env.FLIPFORGE_PHASE3_MUTATION_AUDIT_URL || "http://127.0.0.1:4173/saas-prototype/index.html").replace(/#.*$/, "");
const email = "phase3-mutation-audit@flipforge.test";
const failures = [];

function accountHash(value) {
  let hash = 2166136261;
  const text = String(value || "anonymous").trim().toLowerCase();
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "phase3-mutation-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-09-22T00:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic observer-stability fixture only."]
    },
    data
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const page = await context.newPage();

try {
  const key = accountHash(email);
  await page.addInitScript(({ key }) => {
    localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    localStorage.setItem(`flipforge.guidedMode.v3.${key}.steps`, "discover,evaluate,understand,track");
  }, { key });

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({
      getUser: () => ({ email: "${email}" }),
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Phase 3 Audit", membershipActive: true, membershipConfigured: true })
    });`
  }));

  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: "(() => {})();"
  }));

  await page.route("**/api/conversion-event", route => route.fulfill({
    status: 202,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true })
  }));

  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "phase3-mutation-audit";
    if (url.pathname === "/api/v1/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(envelope(correlationId, {
          status: "configured",
          bridgeEnabled: true,
          upstreamConfigured: true,
          authenticationRequired: true,
          tenantMembershipRequired: true
        }))
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: url.pathname } })
    });
  });

  await page.goto(`${baseUrl}#/discover`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("#main-content [data-customer-discovery-form]").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("[data-ff-p3-evaluate-shell]").waitFor({ state: "visible", timeout: 8_000 });

  // Let route initialization, the 120ms/700ms defensive refreshes, and other
  // app boot work settle before measuring observer stability.
  await page.waitForTimeout(1_500);

  const baseline = await page.evaluate(() => {
    const api = window.FlipForgePhase3Activation;
    if (!api?.diagnostics) return null;
    const main = document.querySelector("#main-content");
    window.__ffP3MutationAudit = { callbacks: 0, ownedAdds: 0, ownedRemoves: 0, records: [] };
    const observer = new MutationObserver(records => {
      const state = window.__ffP3MutationAudit;
      state.callbacks += 1;
      for (const record of records) {
        const added = [...record.addedNodes].filter(node => node instanceof Element && (node.matches?.("[data-flipforge-phase3-owned]") || node.querySelector?.("[data-flipforge-phase3-owned]"))).length;
        const removed = [...record.removedNodes].filter(node => node instanceof Element && (node.matches?.("[data-flipforge-phase3-owned]") || node.querySelector?.("[data-flipforge-phase3-owned]"))).length;
        state.ownedAdds += added;
        state.ownedRemoves += removed;
        state.records.push({ added, removed, target: record.target instanceof Element ? record.target.tagName : "node" });
      }
    });
    observer.observe(main, { childList: true, subtree: true });
    window.__ffP3ExternalObserver = observer;
    return {
      diagnostics: api.diagnostics(),
      shellCount: document.querySelectorAll("[data-ff-p3-evaluate-shell]").length,
      ownedCount: document.querySelectorAll("[data-flipforge-phase3-owned]").length
    };
  });

  if (!baseline) failures.push("Phase 3 diagnostics API was unavailable");
  if (baseline?.shellCount !== 1) failures.push(`initial Phase 3 evaluate shell count was ${baseline?.shellCount}, expected 1`);

  // One deliberate outside mutation should cause exactly one relevant Phase 3
  // observer cycle. Its own enhancement writes must not feed back into itself.
  await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.hidden = true;
    probe.dataset.ffPhase3MutationAuditExternal = "1";
    document.querySelector("#main-content")?.appendChild(probe);
  });

  const ticks = [];
  for (let second = 1; second <= 10; second += 1) {
    await page.waitForTimeout(1_000);
    const snapshot = await page.evaluate(() => ({
      second: 0,
      diagnostics: window.FlipForgePhase3Activation?.diagnostics?.() || null,
      external: { ...(window.__ffP3MutationAudit || {}) },
      shellCount: document.querySelectorAll("[data-ff-p3-evaluate-shell]").length,
      ownedCount: document.querySelectorAll("[data-flipforge-phase3-owned]").length
    }));
    snapshot.second = second;
    ticks.push(snapshot);
    console.log(`T+${second}s | observer=${snapshot.diagnostics?.observerCallbacks ?? "NA"} relevant=${snapshot.diagnostics?.relevantObserverCallbacks ?? "NA"} apply=${snapshot.diagnostics?.applyRuns ?? "NA"} ownedAdds=${snapshot.external?.ownedAdds ?? "NA"} ownedRemoves=${snapshot.external?.ownedRemoves ?? "NA"} shell=${snapshot.shellCount}`);
  }

  const first = ticks[0];
  const last = ticks.at(-1);
  if (!first?.diagnostics || !last?.diagnostics) {
    failures.push("Phase 3 observer diagnostics disappeared during the 10-second audit");
  } else if (baseline?.diagnostics) {
    const observerDelta = first.diagnostics.observerCallbacks - baseline.diagnostics.observerCallbacks;
    const relevantDelta = first.diagnostics.relevantObserverCallbacks - baseline.diagnostics.relevantObserverCallbacks;
    const applyDelta = first.diagnostics.applyRuns - baseline.diagnostics.applyRuns;
    if (observerDelta !== 1) failures.push(`deliberate external mutation produced ${observerDelta} observer callbacks by T+1s, expected 1`);
    if (relevantDelta !== 1) failures.push(`deliberate external mutation produced ${relevantDelta} relevant callbacks by T+1s, expected 1`);
    if (applyDelta !== 1) failures.push(`deliberate external mutation produced ${applyDelta} Phase 3 apply runs by T+1s, expected 1`);

    if (last.diagnostics.observerCallbacks !== first.diagnostics.observerCallbacks) {
      failures.push(`observer callbacks continued after T+1s: ${first.diagnostics.observerCallbacks} -> ${last.diagnostics.observerCallbacks}`);
    }
    if (last.diagnostics.relevantObserverCallbacks !== first.diagnostics.relevantObserverCallbacks) {
      failures.push(`relevant observer callbacks continued after T+1s: ${first.diagnostics.relevantObserverCallbacks} -> ${last.diagnostics.relevantObserverCallbacks}`);
    }
    if (last.diagnostics.applyRuns !== first.diagnostics.applyRuns) {
      failures.push(`Phase 3 apply runs continued after T+1s: ${first.diagnostics.applyRuns} -> ${last.diagnostics.applyRuns}`);
    }
  }

  if (last?.external?.ownedAdds !== 0) failures.push(`Phase 3 inserted ${last.external.ownedAdds} owned node(s) after the stable baseline`);
  if (last?.external?.ownedRemoves !== 0) failures.push(`Phase 3 removed ${last.external.ownedRemoves} owned node(s) after the stable baseline`);
  if (last?.shellCount !== 1) failures.push(`final evaluate shell count was ${last?.shellCount}, expected exactly 1`);
  if (baseline && last?.ownedCount !== baseline.ownedCount) failures.push(`Phase 3 owned node count drifted from ${baseline.ownedCount} to ${last?.ownedCount}`);

  await page.evaluate(() => window.__ffP3ExternalObserver?.disconnect?.());
} finally {
  await context.close();
  await browser.close();
}

console.log("FlipForge Phase 3 mutation stability audit");
console.log(`Audit window: 10 seconds after one deliberate external DOM mutation`);
console.log(`Failures: ${failures.length}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | one external mutation produced one observer/apply cycle, with zero repeat Phase 3 insertion or self-triggered churn for the remaining audit window");
if (failures.length) process.exit(1);
