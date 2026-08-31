import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app";
const email = "prebeta-lifecycle-audit@flipforge.test";
const reportDir = path.resolve("qa-artifacts/prebeta-saved-decision-lifecycle");
const reportPath = path.join(reportDir, "saved-decision-lifecycle-audit.json");
const failures = [];
const scenarios = [];
const calls = { api: [], opportunityDetail: [], lifecyclePut: [], evidence: [], psa: [] };
let slowNextLifecyclePut = false;

const opportunityIds = ["qa-opportunity-1", "qa-opportunity-2"];
const opportunities = {
  "qa-opportunity-1": {
    id: "qa-opportunity-1",
    title: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
    cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 9",
    recommendation: "WATCH",
    ask: 875,
    supportedValue: 820,
    confidence: 82,
    liquidity: 76,
    risk: 24,
    rank: 79,
    observedAt: "2026-08-31T16:00:00Z",
    platform: "EBAY",
    mappingState: "CONFIRMED",
    evidence: { acceptedSales: 3 }
  },
  "qa-opportunity-2": {
    id: "qa-opportunity-2",
    title: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10",
    cardIdentity: "2018 Topps Update Ronald Acuna Jr. #US250 PSA 10",
    recommendation: "VERIFY",
    ask: 310,
    supportedValue: 295,
    confidence: 71,
    liquidity: 68,
    risk: 36,
    rank: 70,
    observedAt: "2026-08-31T16:01:00Z",
    platform: "EBAY",
    mappingState: "CONFIRMED",
    evidence: { acceptedSales: 2 }
  }
};

const lifecycle = new Map([
  ["qa-opportunity-1", {
    snapshot: {
      opportunityId: "qa-opportunity-1",
      trackingStatus: "WATCHING",
      outcomeStatus: "NONE",
      reviewAt: null,
      alertEnabled: false,
      acquisitionCostCents: null,
      acquiredAt: null,
      dispositionProceedsCents: null,
      disposedAt: null,
      version: 1
    },
    history: [{
      recordedAt: "2026-08-31T16:00:00Z",
      eventType: "CREATED",
      trackingStatus: "WATCHING",
      outcomeStatus: "NONE",
      recordVersion: 1
    }]
  }],
  ["qa-opportunity-2", {
    snapshot: {
      opportunityId: "qa-opportunity-2",
      trackingStatus: "REVIEW",
      outcomeStatus: "NONE",
      reviewAt: "2026-09-02T15:00:00.000Z",
      alertEnabled: true,
      acquisitionCostCents: null,
      acquiredAt: null,
      dispositionProceedsCents: null,
      disposedAt: null,
      version: 4
    },
    history: [{
      recordedAt: "2026-08-31T16:01:00Z",
      eventType: "UPDATED",
      trackingStatus: "REVIEW",
      outcomeStatus: "NONE",
      recordVersion: 4
    }]
  }]
]);

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "prebeta-lifecycle-audit",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      correlationId,
      generatedAt: "2026-08-31T16:00:00Z",
      evidenceFreshness: "QA_FIXTURE",
      limitations: ["Synthetic destructive saved-decision lifecycle audit fixture only."]
    },
    data
  };
}

function opportunityListData() {
  return {
    kind: "opportunities",
    items: opportunityIds.map(id => ({ ...opportunities[id] })),
    count: opportunityIds.length,
    sourceOfTruth: "SQLite",
    transactionAuthority: false
  };
}

function opportunityDetailData(id) {
  return {
    kind: "opportunity-detail",
    opportunity: { ...opportunities[id] },
    sourceOfTruth: "SQLite",
    transactionAuthority: false
  };
}

function lifecycleListData() {
  return {
    kind: "lifecycle",
    sourceOfTruth: "SQLite",
    items: opportunityIds.map(id => ({ ...lifecycle.get(id).snapshot })),
    transactionAuthority: false
  };
}

function lifecycleDetailData(id) {
  const record = lifecycle.get(id);
  return {
    kind: "lifecycle-detail",
    opportunityId: id,
    sourceOfTruth: "SQLite",
    lifecycle: { ...record.snapshot },
    history: record.history.map(event => ({ ...event })),
    transactionAuthority: false
  };
}

function evidenceData(id) {
  return {
    kind: "evidence",
    opportunityId: id,
    acceptedExactCompletedSales: id === "qa-opportunity-1" ? 3 : 2,
    visibleButAuthorityIneligible: 1,
    acceptedSales: [],
    excludedSales: [],
    transactionAuthority: false
  };
}

function psaData(id) {
  return {
    kind: "psa-advisor",
    opportunityId: id,
    guidanceStatus: "AVAILABLE",
    recalculated: false,
    transactionAuthority: false,
    sourceOfTruth: "Existing PSA intelligence"
  };
}

function forgeHeatData() {
  return {
    kind: "forge-heat",
    heatVersion: "FORGE_HEAT_V1",
    proFeature: true,
    locked: true,
    upgradeMessage: "Synthetic lifecycle audit keeps Forge Heat locked.",
    access: { currentPlan: "BETA" },
    authority: {
      recommendationAuthority: "Smart Opportunity",
      forgeHeatRecommendationAuthority: false,
      clientComputed: false,
      transactionAuthority: false
    },
    scope: { code: "SAVED_EVALUATED_UNIVERSE", marketWide: false },
    top5: [],
    hiddenGems: [],
    highestEdge: [],
    unscoredPreview: []
  };
}

function requestBody(request) {
  try { return request.postDataJSON(); } catch (_) { return {}; }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function poll(predicate, message, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function runScenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    scenarios.push({ name, status: "PASS", durationMs: Date.now() - started });
    console.log(`PASS | ${name}`);
  } catch (error) {
    const message = error?.message || String(error);
    scenarios.push({ name, status: "FAIL", durationMs: Date.now() - started, message });
    failures.push(`${name}: ${message}`);
    console.log(`FAIL | ${name} | ${message}`);
  }
}

function validLifecycleTransition(body) {
  const status = String(body.trackingStatus || "");
  const outcome = String(body.outcomeStatus || "");
  if (status === "OWNED") {
    return Number.isInteger(body.acquisitionCostCents) && body.acquisitionCostCents >= 0 && Boolean(body.acquiredAt) && outcome === "ACQUIRED";
  }
  if (status === "SOLD") {
    return Number.isInteger(body.acquisitionCostCents) && body.acquisitionCostCents >= 0 && Boolean(body.acquiredAt)
      && Number.isInteger(body.dispositionProceedsCents) && body.dispositionProceedsCents >= 0 && Boolean(body.disposedAt) && outcome === "SOLD";
  }
  if (body.alertEnabled === true && !body.reviewAt) return false;
  return true;
}

function applyLifecycleWrite(id, body) {
  const record = lifecycle.get(id);
  const current = record.snapshot;
  if (Number(body.expectedVersion) !== Number(current.version)) {
    return { ok: false, status: 409, code: "LIFECYCLE_VERSION_CONFLICT", message: "The saved tracking record changed before this update." };
  }
  if (!validLifecycleTransition(body)) {
    return { ok: false, status: 400, code: "LIFECYCLE_TRANSITION_INVALID", message: "The lifecycle transition is missing required customer facts." };
  }
  const nextVersion = current.version + 1;
  record.snapshot = {
    opportunityId: id,
    trackingStatus: body.trackingStatus,
    outcomeStatus: body.outcomeStatus,
    reviewAt: body.reviewAt ?? null,
    alertEnabled: body.alertEnabled === true,
    acquisitionCostCents: body.acquisitionCostCents ?? null,
    acquiredAt: body.acquiredAt ?? null,
    dispositionProceedsCents: body.dispositionProceedsCents ?? null,
    disposedAt: body.disposedAt ?? null,
    version: nextVersion
  };
  record.history.unshift({
    recordedAt: `2026-08-31T16:${String(nextVersion).padStart(2, "0")}:00Z`,
    eventType: "UPDATED",
    trackingStatus: record.snapshot.trackingStatus,
    outcomeStatus: record.snapshot.outcomeStatus,
    recordVersion: nextVersion
  });
  return { ok: true, data: lifecycleDetailData(id) };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10_000);

function accountHash(value) {
  let hash = 2166136261;
  const text = String(value || "anonymous").trim().toLowerCase();
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function gotoRoute(route) {
  await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
}

async function waitTracking(id) {
  await poll(() => /#\/tracking(?:\/|$)/.test(page.url()), "Tracking route did not become active");
  await page.locator("#main-content .customer-lifecycle-page [data-lifecycle-form]").waitFor({ state: "visible", timeout: 7000 });
  if (id) {
    await poll(async () => {
      const href = await page.locator("#main-content .page-actions a[href^='#/opportunities/']").first().getAttribute("href").catch(() => "");
      return href === `#/opportunities/${id}`;
    }, `Tracking did not bind to ${id}`);
  }
}

function expectedOutcome(status) {
  switch (String(status || "").toUpperCase()) {
    case "OWNED": return "ACQUIRED";
    case "SOLD": return "SOLD";
    case "PASSED": return "PASSED";
    case "WATCHING":
    case "REVIEW": return "NONE";
    default: return null;
  }
}

async function setTrackingFields({ status, outcome, cost = "", acquired = "", proceeds = "", disposed = "", reviewAt = "", alert = false }) {
  const form = page.locator("#main-content [data-lifecycle-form]");
  const statusSelect = form.locator('select[name="trackingStatus"]');
  const outcomeSelect = form.locator('select[name="outcomeStatus"]');
  await statusSelect.selectOption(status);

  const derivedOutcome = expectedOutcome(status);
  if (derivedOutcome) {
    await poll(async () => await outcomeSelect.inputValue() === derivedOutcome,
      `Tracking status ${status} did not synchronize hidden outcome ${derivedOutcome}`);
  }
  // outcome is intentionally not selected directly. It is a derived, hidden
  // implementation field in the customer Tracking UX; the audit verifies the
  // synchronization above instead of bypassing the customer-visible control.
  void outcome;

  if (status === "OWNED" || status === "SOLD") {
    await form.locator('input[name="acquisitionCost"]').fill(cost);
    await form.locator('input[name="acquiredAt"]').fill(acquired);
  }
  if (status === "SOLD") {
    await form.locator('input[name="dispositionProceeds"]').fill(proceeds);
    await form.locator('input[name="disposedAt"]').fill(disposed);
  }
  await form.locator('input[name="reviewAt"]').fill(reviewAt);
  const checkbox = form.locator('input[name="alertEnabled"]');
  if (alert) await checkbox.check(); else await checkbox.uncheck();
}

async function submitTracking() {
  await page.locator("#main-content [data-lifecycle-form] button[type='submit']").click();
}

async function reloadTracking(id) {
  await gotoRoute(`tracking/${id}`);
  await waitTracking(id);
}

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
      getSnapshot: () => ({ authenticated: true, email: "${email}", fullName: "Pre-beta Lifecycle Audit", membershipActive: true, membershipConfigured: true })
    });`
  }));
  await page.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "(() => {})();" }));

  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const headers = request.headers();
    const correlationId = headers["x-correlation-id"] || "prebeta-lifecycle-audit";
    const body = requestBody(request);
    calls.api.push({ method, path: url.pathname, body, headers });

    if (url.pathname === "/api/v1/health" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, { status: "configured" })) });
      return;
    }
    if (url.pathname === "/api/v1/opportunities" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, opportunityListData())) });
      return;
    }
    const opportunityMatch = url.pathname.match(/^\/api\/v1\/opportunities\/([^/]+)$/);
    if (opportunityMatch && method === "GET") {
      const id = decodeURIComponent(opportunityMatch[1]);
      calls.opportunityDetail.push(id);
      if (!opportunities[id]) {
        await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic opportunity." } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, opportunityDetailData(id))) });
      return;
    }
    if (url.pathname === "/api/v1/lifecycle" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, lifecycleListData())) });
      return;
    }
    const lifecycleMatch = url.pathname.match(/^\/api\/v1\/lifecycle\/([^/]+)$/);
    if (lifecycleMatch) {
      const id = decodeURIComponent(lifecycleMatch[1]);
      if (!lifecycle.has(id)) {
        await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "RESOURCE_NOT_FOUND", message: "Unknown synthetic lifecycle record." } }) });
        return;
      }
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, lifecycleDetailData(id))) });
        return;
      }
      if (method === "PUT") {
        calls.lifecyclePut.push({ id, body });
        if (slowNextLifecyclePut) {
          slowNextLifecyclePut = false;
          await new Promise(resolve => setTimeout(resolve, 450));
        }
        const result = applyLifecycleWrite(id, body);
        if (!result.ok) {
          await route.fulfill({ status: result.status, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: result.code, message: result.message, correlationId } }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, result.data)) });
        return;
      }
    }
    const evidenceMatch = url.pathname.match(/^\/api\/v1\/evidence\/([^/]+)$/);
    if (evidenceMatch && method === "GET") {
      const id = decodeURIComponent(evidenceMatch[1]);
      calls.evidence.push(id);
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, evidenceData(id))) });
      return;
    }
    const psaMatch = url.pathname.match(/^\/api\/v1\/psa-advisor\/([^/]+)$/);
    if (psaMatch && method === "GET") {
      const id = decodeURIComponent(psaMatch[1]);
      calls.psa.push(id);
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, psaData(id))) });
      return;
    }
    if (url.pathname === "/api/v1/forge-heat" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(envelope(correlationId, forgeHeatData())) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json; charset=utf-8", body: JSON.stringify({ error: { code: "QA_NOT_MOCKED", message: `${method} ${url.pathname}` } }) });
  });

  await runScenario("saved decision opens exact Card Intelligence record without cross-record substitution", async () => {
    const before = calls.opportunityDetail.length;
    await gotoRoute("opportunities/qa-opportunity-1");
    await poll(() => calls.opportunityDetail.length > before, "Saved Card Intelligence did not request the selected opportunity");
    await poll(async () => /Shohei Ohtani/i.test(await page.locator("#main-content").innerText()), "Selected Ohtani saved decision did not render");
    const recent = calls.opportunityDetail.slice(before);
    expect(recent.includes("qa-opportunity-1"), "Selected opportunity detail was not requested");
    expect(!recent.includes("qa-opportunity-2"), "A different saved decision was substituted into the selected detail route");
  });

  await runScenario("Card Intelligence to Tracking preserves the exact opportunity id", async () => {
    const track = page.locator("#main-content a[href='#/tracking/qa-opportunity-1']").first();
    await track.waitFor({ state: "visible", timeout: 7000 });
    await track.click();
    await waitTracking("qa-opportunity-1");
    expect(/#\/tracking\/qa-opportunity-1$/.test(page.url()), "Tracking route lost the selected opportunity id");
  });

  await runScenario("tracking selector switches records without leaking prior lifecycle state", async () => {
    const selector = page.locator("#main-content [data-lifecycle-select]");
    await selector.selectOption("qa-opportunity-2");
    await waitTracking("qa-opportunity-2");
    expect(await page.locator("#main-content [data-lifecycle-form] select[name='trackingStatus']").inputValue() === "REVIEW", "Second record inherited the first record tracking status");
    expect(Number(await page.locator("#main-content [data-lifecycle-form] input[name='expectedVersion']").inputValue()) === 4, "Second record inherited the first record version");
    await page.locator("#main-content [data-lifecycle-select]").selectOption("qa-opportunity-1");
    await waitTracking("qa-opportunity-1");
  });

  await runScenario("incomplete OWNED transition fails closed and does not change server state", async () => {
    const beforePuts = calls.lifecyclePut.length;
    const beforeVersion = lifecycle.get("qa-opportunity-1").snapshot.version;
    await setTrackingFields({ status: "OWNED", outcome: "ACQUIRED" });
    await submitTracking();
    await poll(() => calls.lifecyclePut.length > beforePuts, "Incomplete OWNED save did not reach the governed lifecycle boundary");
    await page.locator("#main-content .staging-error").waitFor({ state: "visible", timeout: 7000 });
    expect(lifecycle.get("qa-opportunity-1").snapshot.version === beforeVersion, "Rejected OWNED transition mutated the server record");
    expect(lifecycle.get("qa-opportunity-1").snapshot.trackingStatus === "WATCHING", "Rejected OWNED transition changed tracking status");
    await reloadTracking("qa-opportunity-1");
  });

  await runScenario("valid OWNED save uses current version and appends exactly one history event", async () => {
    const record = lifecycle.get("qa-opportunity-1");
    const beforeHistory = record.history.length;
    const beforePuts = calls.lifecyclePut.length;
    await setTrackingFields({ status: "OWNED", outcome: "ACQUIRED", cost: "800.00", acquired: "2026-08-31" });
    await submitTracking();
    await poll(() => calls.lifecyclePut.length > beforePuts, "Valid OWNED write did not run");
    await poll(() => lifecycle.get("qa-opportunity-1").snapshot.version === 2, "OWNED transition did not advance to version 2");
    const body = calls.lifecyclePut.at(-1)?.body || {};
    expect(body.expectedVersion === 1, `OWNED write expected version ${body.expectedVersion}, not 1`);
    expect(record.history.length === beforeHistory + 1, "OWNED transition did not append exactly one lifecycle event");
    await waitTracking("qa-opportunity-1");
  });

  await runScenario("double submit while lifecycle save is in flight creates one write", async () => {
    const beforePuts = calls.lifecyclePut.length;
    slowNextLifecyclePut = true;
    await setTrackingFields({ status: "OWNED", outcome: "ACQUIRED", cost: "800.00", acquired: "2026-08-31", reviewAt: "2026-09-03T15:00" });
    await page.evaluate(() => {
      const target = document.querySelector("#main-content [data-lifecycle-form]");
      target?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      target?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await poll(() => calls.lifecyclePut.length > beforePuts, "Lifecycle save did not start");
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(calls.lifecyclePut.length === beforePuts + 1, `Double submit created ${calls.lifecyclePut.length - beforePuts} lifecycle writes`);
    expect(lifecycle.get("qa-opportunity-1").snapshot.version === 3, "Single in-flight save did not advance one version");
    await waitTracking("qa-opportunity-1");
  });

  await runScenario("stale lifecycle version conflict cannot overwrite newer server state", async () => {
    const record = lifecycle.get("qa-opportunity-1");
    const staleExpectedVersion = Number(await page.locator("#main-content [data-lifecycle-form] input[name='expectedVersion']").inputValue());
    expect(staleExpectedVersion === 3, `Expected browser version 3 before conflict, saw ${staleExpectedVersion}`);
    record.snapshot = { ...record.snapshot, trackingStatus: "REVIEW", version: 4 };
    record.history.unshift({ recordedAt: "2026-08-31T16:04:30Z", eventType: "EXTERNAL_UPDATE", trackingStatus: "REVIEW", outcomeStatus: record.snapshot.outcomeStatus, recordVersion: 4 });
    const beforeHistory = record.history.length;
    await setTrackingFields({ status: "PASSED", outcome: "PASSED" });
    const beforePuts = calls.lifecyclePut.length;
    await submitTracking();
    await poll(() => calls.lifecyclePut.length > beforePuts, "Stale lifecycle write did not reach version gate");
    await page.locator("#main-content .staging-error").waitFor({ state: "visible", timeout: 7000 });
    expect(record.snapshot.version === 4 && record.snapshot.trackingStatus === "REVIEW", "Stale write overwrote the newer server lifecycle state");
    expect(record.history.length === beforeHistory, "Stale write appended history despite version conflict");
    await reloadTracking("qa-opportunity-1");
    expect(Number(await page.locator("#main-content [data-lifecycle-form] input[name='expectedVersion']").inputValue()) === 4, "Reload did not recover the authoritative version after conflict");
  });

  await runScenario("navigation away during slow save cannot repaint stale Tracking over Card Intelligence", async () => {
    const beforePuts = calls.lifecyclePut.length;
    slowNextLifecyclePut = true;
    await setTrackingFields({ status: "REVIEW", outcome: "ACQUIRED", cost: "800.00", acquired: "2026-08-31", reviewAt: "2026-09-04T15:00" });
    await submitTracking();
    await poll(() => calls.lifecyclePut.length > beforePuts, "Slow lifecycle write did not start");
    await page.evaluate(() => { window.location.hash = "#/opportunities/qa-opportunity-1"; });
    await poll(() => /#\/opportunities\/qa-opportunity-1$/.test(page.url()), "Navigation to Card Intelligence did not occur during save");
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(/#\/opportunities\/qa-opportunity-1$/.test(page.url()), "Slow save changed the browser route after navigation");
    expect(await page.locator("#main-content .customer-lifecycle-page").count() === 0, "Completed stale Tracking save repainted the Tracking workspace over Card Intelligence");
  });

  await runScenario("revisiting Tracking reloads the latest persisted lifecycle state", async () => {
    await reloadTracking("qa-opportunity-1");
    const record = lifecycle.get("qa-opportunity-1");
    const browserVersion = Number(await page.locator("#main-content [data-lifecycle-form] input[name='expectedVersion']").inputValue());
    expect(browserVersion === record.snapshot.version, `Revisited Tracking showed version ${browserVersion}, server is ${record.snapshot.version}`);
    expect(await page.locator("#main-content [data-lifecycle-form] select[name='trackingStatus']").inputValue() === record.snapshot.trackingStatus, "Revisited Tracking did not show the latest persisted status");
  });

  let firstDigest = "";
  await runScenario("Decision Dossier reads the latest lifecycle snapshot and prepares a complete digest", async () => {
    const lifecycleVersion = lifecycle.get("qa-opportunity-1").snapshot.version;
    await gotoRoute("export/qa-opportunity-1");
    await page.locator("#main-content [data-customer-export-prepare]").waitFor({ state: "visible", timeout: 7000 });
    expect(await page.locator("#main-content [data-customer-export-prepare]").isEnabled(), "Export sources did not become complete");
    await page.locator("#main-content [data-customer-export-prepare]").click();
    await poll(() => page.locator("#main-content .customer-export-digest code").count().then(count => count === 1), "Decision Dossier digest was not prepared");
    firstDigest = await page.locator("#main-content .customer-export-digest code").innerText();
    expect(/^[a-f0-9]{64}$/i.test(firstDigest), "Prepared dossier did not expose a SHA-256 digest");
    const lifecycleRequests = calls.api.filter(call => call.method === "GET" && call.path === "/api/v1/lifecycle/qa-opportunity-1");
    expect(lifecycleRequests.length > 0, "Export did not re-read lifecycle detail");
    expect(lifecycle.get("qa-opportunity-1").snapshot.version === lifecycleVersion, "Preparing export mutated lifecycle state");
  });

  await runScenario("prepared export is discarded and rebuilt after lifecycle changes", async () => {
    await reloadTracking("qa-opportunity-1");
    const beforeVersion = lifecycle.get("qa-opportunity-1").snapshot.version;
    await setTrackingFields({ status: "PASSED", outcome: "PASSED" });
    const beforePuts = calls.lifecyclePut.length;
    await submitTracking();
    await poll(() => calls.lifecyclePut.length > beforePuts, "Lifecycle change before export rebuild did not save");
    await poll(() => lifecycle.get("qa-opportunity-1").snapshot.version === beforeVersion + 1, "Lifecycle version did not advance before export rebuild");
    await gotoRoute("export/qa-opportunity-1");
    await page.locator("#main-content [data-customer-export-prepare]").waitFor({ state: "visible", timeout: 7000 });
    expect(await page.locator("#main-content .customer-export-digest code").count() === 0, "Old prepared digest survived after returning to a changed lifecycle record");
    await page.locator("#main-content [data-customer-export-prepare]").click();
    await poll(() => page.locator("#main-content .customer-export-digest code").count().then(count => count === 1), "Rebuilt dossier digest did not appear");
    const secondDigest = await page.locator("#main-content .customer-export-digest code").innerText();
    expect(secondDigest !== firstDigest, "Dossier digest did not change after lifecycle state changed");
  });

  await runScenario("export record switch cannot mix source identities", async () => {
    const detailBefore = calls.opportunityDetail.length;
    const evidenceBefore = calls.evidence.length;
    const psaBefore = calls.psa.length;
    await page.locator("#main-content [data-customer-export-select]").selectOption("qa-opportunity-2");
    await poll(() => /#\/export\/qa-opportunity-2$/.test(page.url()), "Export route did not switch to the second saved decision");
    await page.locator("#main-content [data-customer-export-prepare]").waitFor({ state: "visible", timeout: 7000 });
    const detailRecent = calls.opportunityDetail.slice(detailBefore);
    const evidenceRecent = calls.evidence.slice(evidenceBefore);
    const psaRecent = calls.psa.slice(psaBefore);
    expect(detailRecent.includes("qa-opportunity-2"), "Second export did not request its own saved opportunity detail");
    expect(evidenceRecent.includes("qa-opportunity-2"), "Second export did not request its own evidence source");
    expect(psaRecent.includes("qa-opportunity-2"), "Second export did not request its own PSA source");
    const text = await page.locator("#main-content").innerText();
    expect(/Ronald Acuna/i.test(text), "Second export did not render the selected record title");
  });

  await runScenario("browser lifecycle and export traffic never supplies tenant identity or authority", async () => {
    const forbiddenHeaders = calls.api.filter(call => call.headers["x-flipforge-tenant-id"] || call.headers["x-flipforge-user-id"]);
    expect(forbiddenHeaders.length === 0, "Browser supplied forbidden tenant/user identity headers");
    const writes = calls.api.filter(call => !["GET", "HEAD", "OPTIONS"].includes(call.method));
    expect(writes.every(call => call.method === "PUT" && /^\/api\/v1\/lifecycle\//.test(call.path)), "Customer lifecycle audit observed an unexpected mutation endpoint");
    const authorityWrites = calls.lifecyclePut.filter(call => Object.keys(call.body || {}).some(key => /recommendation|transactionAuthority|tenantId|userId|evidenceAccepted|grade/i.test(key)));
    expect(authorityWrites.length === 0, "Lifecycle write attempted to supply recommendation, evidence, grade, tenant, or transaction authority");
  });
} finally {
  await fs.mkdir(reportDir, { recursive: true });
  const report = {
    audit: "FlipForge Pre-Beta Destructive Saved-Decision Lifecycle Audit",
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: failures.length === 0,
    scenarioCount: scenarios.length,
    passedCount: scenarios.filter(scenario => scenario.status === "PASS").length,
    failedCount: scenarios.filter(scenario => scenario.status === "FAIL").length,
    scenarios,
    requestSummary: {
      apiCalls: calls.api.length,
      opportunityDetailCalls: calls.opportunityDetail.length,
      lifecycleWrites: calls.lifecyclePut.length,
      evidenceCalls: calls.evidence.length,
      psaCalls: calls.psa.length
    },
    finalLifecycle: Object.fromEntries([...lifecycle.entries()].map(([id, value]) => [id, { snapshot: value.snapshot, historyCount: value.history.length }])),
    failures
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await context.close();
  await browser.close();
}

console.log("FlipForge Pre-Beta Destructive Saved-Decision Lifecycle Audit");
console.log(`Scenarios: ${scenarios.length}`);
console.log(`Passed: ${scenarios.filter(scenario => scenario.status === "PASS").length}`);
console.log(`Failed: ${failures.length}`);
console.log(`Report: ${reportPath}`);
failures.forEach(failure => console.log(`FAIL | ${failure}`));
if (!failures.length) console.log("PASS | exact saved-record routing, tracking transitions, optimistic versioning, navigation safety, revisit freshness, export rebuild, record isolation, and authority boundaries are intact");
if (failures.length) process.exit(1);
