// Integrated customer journey, in a real browser, through the real gateway function, against the FlipForge2 DEV
// journey server (real hosted HTTP server, tenant projections, lifecycle, alerts, Forge Heat and Smart Opportunity
// engine over a temporary database seeded only with operator-entered exact completed sales; CardSight suspended).
//
//   Discover → Evaluate → Save → Track → Re-evaluate (prefilled) → What changed → Alerts (review, seen)
//   → Own → Portfolio → Forge Heat → another account (isolation) → failed backend request → tablet and phone.
//
// Usage: JOURNEY_BASE=http://goflipforge.com:4190 JOURNEY_SHOTS=dir node scripts/journey/customer-journey-e2e.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import zlib from "node:zlib";
import { installMeter, measureRoutes, printRows } from "./render-stability.mjs";

const BASE = (process.env.JOURNEY_BASE || "http://goflipforge.com:4190").replace(/\/$/, "");
// The real customer app for invited testers is /app/beta. JOURNEY_APP_PATH=/app/customer/ runs the owner preview page.
const APP = `${BASE}${process.env.JOURNEY_APP_PATH || "/app/beta/"}`;
console.log(`JOURNEY APP ${APP}`);
const SHOTS = process.env.JOURNEY_SHOTS || "";
const email = "journey-tenant-a@journey.flipforge.test";
const CARDS = {
  strong: { identity: "2019 Topps Chrome Pete Alonso #204 PSA 10", listing: "journey-alonso-ui-001", price: "300.00" },
  second: { identity: "2018 Topps Chrome Juan Soto #155 PSA 10", listing: "journey-soto-ui-001", price: "300.00" },
  thin: { identity: "2021 Bowman Chrome Jasson Dominguez #BCP-90 PSA 10", listing: "journey-dominguez-ui-001", price: "200.00" }
};
const passes = [];
const failures = [];
const notes = [];
const check = (name, ok, detail = "") => {
  (ok ? passes : failures).push(detail ? `${name} [${String(detail).slice(0, 300)}]` : name);
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${!ok && detail ? ` [${String(detail).slice(0, 300)}]` : ""}`);
};
const RAW = /\b(?:REVIEW_DUE|DECISION_CHANGED|MAX_BUY_CROSSED|DECISION_RECHECK_DUE|VERIFICATION_PENDING|LEGACY_DECISION|EXACT_IDENTITY_NOT_CONFIRMED|MAX_BUY_UNAVAILABLE|ASK_ABOVE_MAX_BUY)\b/;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });

async function session(tenant, viewport = { width: 1440, height: 1000 }, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra });
  await context.addCookies([{ name: "ff_journey_tenant", value: tenant, url: BASE }]);
  await context.addInitScript(({ email }) => {
    try {
      localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete");
      localStorage.setItem("flipforge.guidedMode.enabled", "false");
      let hash = 2166136261;
      for (const ch of email.toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      const key = (hash >>> 0).toString(36);
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.welcome`, "seen");
      localStorage.setItem(`flipforge.guidedMode.v3.${key}.enabled`, "off");
    } catch (_) {}
  }, { email: tenant === "a" ? email : "journey-tenant-b@journey.flipforge.test" });
  const who = tenant === "a" ? email : "journey-tenant-b@journey.flipforge.test";
  await context.route(/\/assets\/js\/flipforge-identity\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${who}"}),getSnapshot:()=>({authenticated:true,email:"${who}",fullName:"Journey Tester",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${who}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"journey"});` }));
  await context.route(/\/assets\/js\/flipforge-production-signin\.js/, r => r.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await installMeter(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
  return { context, page, errors };
}

async function go(page, hash, settle = 2500) {
  await page.goto(`${APP}#/${hash}`, { waitUntil: "load" });
  await page.waitForTimeout(settle);
}
const text = page => page.evaluate(() => document.querySelector("#main-content")?.innerText || "");
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };
async function step(name, fn) {
  try { await fn(); } catch (error) { check(`${name} (step did not complete)`, false, String(error?.message || error).split("\n")[0]); }
}

async function evaluateCard(page, card, price = card.price) {
  const form = page.locator("#main-content [data-staging-evaluation-form]");
  await form.waitFor({ state: "visible", timeout: 15000 });
  if (card) {
    await form.locator('[name="externalListingId"]').fill(card.listing);
    await form.locator('[name="marketplace"]').selectOption("EBAY");
    await form.locator('[name="cardIdentity"]').fill(card.identity);
    await form.locator('[name="listingUrl"]').fill(`https://www.ebay.com/itm/${Math.abs([...card.listing].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`);
  }
  await form.locator('[name="itemPrice"]').fill(price);
  await form.locator('[name="acknowledgeBoundary"]').check();
  await form.locator('button[type="submit"]').click();
  const result = page.locator("#main-content .staging-evaluation-result");
  await result.waitFor({ state: "visible", timeout: 30000 });
  const decision = (await result.locator(".panel-header .staging-status").first().innerText()).trim().toUpperCase();
  const href = await result.locator('a[href^="#/opportunities/"]').last().getAttribute("href");
  return { decision, id: decodeURIComponent(String(href || "").replace("#/opportunities/", "")) };
}

const saved = {};
try {
  const { context, page, errors } = await session("a");

  // ---------------- Discover ----------------
  await step("Discover", async () => {
    await go(page, "discover", 3000);
    const t = await text(page);
    check("D1 Discover opens for a signed-in customer", /Discover/i.test(t) && !/Lifecycle unavailable/.test(t), t.slice(0, 200));
    await shot(page, "01-discover");
  });

  // ---------------- Evaluate and save ----------------
  await step("Evaluate", async () => {
    await go(page, "evaluate", 2500);
    for (const key of ["strong", "second", "thin"]) {
      if (key !== "strong") await go(page, "evaluate", 2500);
      saved[key] = await evaluateCard(page, CARDS[key]);
      notes.push(`${key}: ${saved[key].decision} (${saved[key].id})`);
      if (key === "strong") await shot(page, "02-evaluate-result");
    }
    console.log("DECISIONS", JSON.stringify(saved));
    check("E1 three cards evaluated and saved to the account", Object.values(saved).every(s => s.id && /^(BUY|WATCH|VERIFY|PASS)$/.test(s.decision)), JSON.stringify(saved));
    check("E2 deep exact evidence at a low ask is BUY", saved.strong.decision === "BUY", saved.strong.decision);
    check("E3 one exact sale is never BUY", saved.thin.decision !== "BUY", saved.thin.decision);
  });

  // ---------------- Saved decision and receipt ----------------
  await step("Saved decision", async () => {
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const t = await text(page);
    check("S1 the saved decision opens with its verdict and the ask when evaluated", /BUY/.test(t) && /Ask when evaluated/i.test(t) && /\$300\.00/.test(t), t.slice(0, 300));
    check("S2 the saved decision offers Track and Re-evaluate this listing", await page.locator('#main-content a[href^="#/tracking/"]').count() > 0
      && await page.locator("#main-content [data-card-reevaluate]").count() === 1);
    await shot(page, "03-saved-decision");
    await go(page, "opportunities", 3000);
    const list = await text(page);
    check("S3 the saved list shows all three cards", Object.values(CARDS).every(c => list.includes(c.identity.split(" #")[0].slice(0, 20))), list.slice(0, 300));
  });

  // ---------------- Track with a reminder ----------------
  await step("Track", async () => {
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 3500);
    const form = page.locator("#main-content [data-lifecycle-form]");
    await form.waitFor({ state: "visible", timeout: 15000 });
    await form.locator('[name="trackingStatus"]').selectOption("WATCHING");
    const past = new Date(Date.now() - 2 * 3600_000);
    const pad = n => String(n).padStart(2, "0");
    await form.locator('[name="reviewAt"]').fill(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`);
    await form.locator('[name="alertEnabled"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    check("T1 tracking with a review reminder is saved", /saved to your account/i.test(await text(page)), (await text(page)).slice(0, 200));
  });

  // ---------------- Re-evaluate from the saved decision ----------------
  let maxBuyText = "";
  await step("Re-evaluate", async () => {
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const maxBuyCell = await page.locator("#main-content [data-max-buy-at-decision]").first().innerText().catch(() => "");
    maxBuyText = (maxBuyCell.match(/\$([0-9,]+\.\d{2})/) || [])[1] || "";
    check("S4 the saved decision shows its Max Buy", Boolean(maxBuyText), (await text(page)).slice(0, 300));
    // Identity is the exact-card check the decision recorded (FlipForge2#970 governedDecision.exactIdentityBasis), not the
    // provider catalog link: a new BUY recorded it as confirmed, so it reads "Confirmed when saved" with no disclosure.
    const identityLine = value => (value.match(/Identity status: ([^\n·]+)/) || [])[1]?.trim() || "";
    const strongText = await text(page);
    check("S5 the saved BUY shows the identity check it recorded (Confirmed when saved), not the catalog link", identityLine(strongText) === "Confirmed when saved"
      && await page.locator("#main-content [data-ff-identity-basis]").count() === 0, identityLine(strongText) || strongText.slice(0, 200));
    await go(page, `opportunities/${encodeURIComponent(saved.thin.id)}`, 3500);
    const thinText = await text(page);
    check("S6 the VERIFY decision shows its recorded identity check and no BUY identity disclosure", ["Confirmed when saved", "Not confirmed when saved", "Not recorded (earlier rules)"].includes(identityLine(thinText))
      && await page.locator("#main-content [data-ff-identity-basis]").count() === 0, identityLine(thinText) || thinText.slice(0, 200));
    // A VERIFY decision sets no buying limit: the saved-decision page shows no Max Buy, whatever the receipt recorded.
    check("S6a the VERIFY decision shows no Max Buy", await page.locator("#main-content [data-max-buy-at-decision]").count() === 0
      && !/Max Buy \$[0-9]/.test(thinText), thinText.slice(0, 300));
    await go(page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    await page.locator("#main-content [data-card-reevaluate]").click();
    await page.waitForSelector("#main-content .ff-reevaluation-banner[data-reevaluation-state=\"ready\"]", { timeout: 15000 });
    const form = page.locator("#main-content [data-staging-evaluation-form]");
    const prefilled = { listing: await form.locator('[name="externalListingId"]').inputValue(), card: await form.locator('[name="cardIdentity"]').inputValue(),
      price: await form.locator('[name="itemPrice"]').inputValue(), ack: await form.locator('[name="acknowledgeBoundary"]').isChecked() };
    check("R1 Re-evaluate opens the form prefilled with what was entered last time", prefilled.listing === CARDS.strong.listing
      && prefilled.card === CARDS.strong.identity && prefilled.price === "300.00" && prefilled.ack === false, JSON.stringify(prefilled));
    await shot(page, "04-reevaluate-prefilled");
    const maxBuy = Number(maxBuyText.replace(/,/g, "")) || 450;
    const newPrice = (maxBuy + 25).toFixed(2);
    notes.push(`saved Max Buy ${maxBuyText || "(not read)"}; re-evaluated at ${newPrice}`);
    const again = await evaluateCard(page, null, newPrice);
    check("R2 the re-evaluation lands on the same saved decision", again.id === saved.strong.id, `${again.id} vs ${saved.strong.id}`);
    check("R3 above its saved Max Buy the card is no longer BUY", again.decision !== "BUY", again.decision);
    saved.strongAgain = again;
  });

  // ---------------- What changed ----------------
  await step("What changed", async () => {
    // Wait for the card's history (not a fixed pause), and record how long it took to appear after re-evaluation.
    const started = Date.now();
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 0);
    const appeared = await page.waitForFunction(() => /Saved decision 2/.test(document.querySelector("#main-content .customer-decision-timeline-panel")?.innerText || ""),
      null, { timeout: 15000 }).then(() => true, () => false);
    const elapsed = Date.now() - started;
    notes.push(`Decision Timeline with the re-evaluation appeared in ${elapsed} ms`);
    const timeline = await page.evaluate(() => document.querySelector("#main-content .customer-decision-timeline-panel")?.innerText || "");
    if (!appeared) notes.push(`Tracking page after 15 s: ${(await text(page)).slice(0, 400)}`);
    check("W0 the card's Decision Timeline appears within 15 seconds of re-evaluating", appeared, `${elapsed} ms`);
    check("W1 history shows the original decision first, unchanged, and the re-evaluation", /T0 · Original saved decision/.test(timeline)
      && /Saved decision 2/.test(timeline) && /\$300\.00/.test(timeline), timeline.slice(0, 400));
    check("W2 what changed is in plain words, no ISO timestamps", /What changed/.test(timeline) && /ask/i.test(timeline) && !ISO.test(timeline));
    await shot(page, "05-what-changed");
  });

  // ---------------- Alerts ----------------
  await step("Alerts", async () => {
    await go(page, "alerts", 4000);
    const t = await text(page);
    check("A1 the Max Buy crossing reads as a sentence with the saved figures", /Ask moved above your Max Buy/.test(t) && /saved Max Buy \$/.test(t), t.slice(0, 400));
    check("A2 the due reminder and the decision change are listed", /Your scheduled review is due/.test(t) && /Decision changed from BUY to /.test(t), t.slice(0, 400));
    check("A3 no raw codes and no ISO timestamps", !RAW.test(t) && !ISO.test(t), (t.match(RAW) || t.match(ISO) || [""])[0]);
    check("A4 the delivery boundary is visible", /Email \/ push delivery is not connected/.test(t));
    await shot(page, "06-alerts");
    const crossing = page.locator('#main-content .ff-alert-card[data-alert-kind="MAX_BUY_CROSSED"] [data-alert-review]');
    await crossing.click();
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    const reviewedText = await page.evaluate(() => document.querySelector("#main-content .ff-alerts-reviewed")?.innerText || "");
    check("A5 Mark as reviewed moves the alert to Reviewed, saved on the server", /Ask moved above your Max Buy/.test(reviewedText), reviewedText.slice(0, 200));
    await page.locator("#main-content [data-alerts-seen]").click();
    await page.waitForTimeout(2000);
    check("A6 Mark all as seen clears New and keeps items open", await page.locator('#main-content .ff-alert-card[data-new="true"]').count() === 0
      && /New since you last marked alerts as seen/.test(await text(page)));
    await go(page, "alerts", 3500);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    check("A7 review and seen state persist after reload", /Reviewed \(1\)/.test(await text(page)) && await page.locator('#main-content .ff-alert-card[data-new="true"]').count() === 0);
    await shot(page, "07-alerts-reviewed");
    await page.locator('#main-content .ff-alert-card[data-alert-kind="DECISION_CHANGED"] a[href^="#/tracking/"]').first().click();
    await page.waitForTimeout(3000);
    check("A8 an alert links to the card's history", /Decision Timeline/.test(await text(page)));
  });

  // ---------------- Own → Portfolio ----------------
  await step("Portfolio", async () => {
    await go(page, `tracking/${encodeURIComponent(saved.strong.id)}`, 3500);
    const form = page.locator("#main-content [data-lifecycle-form]");
    await form.waitFor({ state: "visible", timeout: 15000 });
    const paid = (Number(maxBuyText.replace(/,/g, "")) > 0 ? Number(maxBuyText.replace(/,/g, "")) + 25 : 475).toFixed(2);
    await form.locator('[name="trackingStatus"]').selectOption("OWNED");
    // The outcome follows the tracking status in the customer app (the select is hidden); set it only if shown.
    if (await form.locator('[name="outcomeStatus"]').isVisible()) await form.locator('[name="outcomeStatus"]').selectOption("ACQUIRED");
    await form.locator('[name="acquisitionCost"]').fill(paid);
    const d = new Date(Date.now() - 86_400_000);
    await form.locator('[name="acquiredAt"]').fill(d.toISOString().slice(0, 10));
    // The review reminder stays on: owning a card does not silence its alerts.
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    check("P1 marking the card owned with what was paid is saved", /saved to your account/i.test(await text(page)), (await text(page)).slice(0, 200));
    await go(page, "portfolio", 5000);
    const t = await text(page);
    check("P2 Portfolio shows the owned card and what was paid", t.includes("Pete Alonso") && t.includes(`$${Number(paid).toLocaleString("en-US", { minimumFractionDigits: 2 })}`), t.slice(0, 400));
    check("P3 Portfolio shows the saved verdict and Max Buy at decision, and that the price paid was over it",
      /Max Buy \$[0-9,]+\.\d{2} at decision/.test(t) && /over it/i.test(t), t.slice(0, 600));
    const attention = await page.evaluate(id => [...document.querySelectorAll(`[data-portfolio-attention-card="${id}"]`)].map(li => li.innerText.replace(/\s+/g, " ")), saved.strong.id);
    check("P4 owned cards that need a look list its open alerts (reminder due, decision changed), each linking to the decision and Alerts",
      attention.length >= 2 && attention.some(t => /Your scheduled review is due/.test(t)) && attention.some(t => /Decision changed from BUY to/.test(t))
        && await page.locator(`[data-portfolio-attention-card="${saved.strong.id}"] a[href="#/alerts"]`).count() === attention.length
        && await page.locator(`[data-portfolio-attention-card="${saved.strong.id}"] a[href="#/opportunities/${encodeURIComponent(saved.strong.id)}"]`).count() === attention.length,
      attention.join(" | "));
    check("P4a the alert already marked reviewed is not repeated on Portfolio", !attention.some(t => /Ask moved above your Max Buy/.test(t)), attention.join(" | "));
    check("P5 no raw codes on Portfolio", !RAW.test(t));
    await shot(page, "08-portfolio");
  });

  // ---------------- Forge Heat ----------------
  await step("Forge Heat", async () => {
    await go(page, "forge-heat", 5000);
    await page.evaluate(() => document.querySelectorAll("#main-content details").forEach(d => { d.open = true; }));
    const t = await text(page);
    const rankedIds = await page.evaluate(() => [...document.querySelectorAll("#main-content .ff-heat-table a[href^='#/opportunities/']")].map(a => decodeURIComponent(a.getAttribute("href").replace("#/opportunities/", ""))));
    check("H1 Forge Heat states it ranks by room under the saved Max Buy", /Room under Max Buy/.test(t));
    check("H2 the card now above its Max Buy is not ranked", !rankedIds.includes(saved.strong.id), rankedIds.join(","));
    check("H3 the one-sale card is never ranked", !rankedIds.includes(saved.thin.id));
    if (saved.second.decision === "BUY") {
      check("H4 the second BUY is ranked with its Max Buy and room under it", rankedIds.includes(saved.second.id) && /Under Max Buy/i.test(t), rankedIds.join(","));
    } else {
      notes.push(`second card was ${saved.second.decision}; H4 not applicable`);
    }
    check("H5 reasons and lists are in plain words", !RAW.test(t), (t.match(RAW) || [""])[0]);
    check("H6 Forge Heat says it ranks saved evaluations, not live prices", /saved evaluation/i.test(t));
    await shot(page, "09-forge-heat");
  });
  check("X1 no page errors in the whole journey", errors.length === 0, errors.join(" | "));

  // ---------------- Render stability (idle redraws) and API capture ----------------
  await step("Render stability", async () => {
    const captured = [];
    const onResponse = async response => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/v1/")) return;
      try {
        captured.push({ method: response.request().method(), path: url.pathname + url.search, status: response.status(),
          contentType: response.headers()["content-type"] || "", body: await response.text() });
      } catch (_) {}
    };
    page.on("response", onResponse);
    const routes = ["dashboard", "discover", "evaluate", "opportunities", `opportunities/${encodeURIComponent(saved.strong.id)}`, "tracking",
      `tracking/${encodeURIComponent(saved.strong.id)}`, "alerts", "portfolio", "forge-heat", "account"];
    const rows = await measureRoutes(page, APP, routes);
    printRows(process.env.JOURNEY_STABILITY_LABEL || "journey", rows);
    // A settled screen must stop rewriting itself: no DOM changes and no API requests while nobody touches it.
    for (const row of rows) {
      check(`RS ${row.route}: settles with no idle redraws or requests`, !row.error && row.idle.records <= 5 && row.idle.fetches === 0,
        row.error || `${row.idle.records} mutations, ${row.idle.fetches} requests in 6s idle`);
    }
    page.off("response", onResponse);
    const packed = zlib.gzipSync(Buffer.from(JSON.stringify({ tenant: email, saved, captured }))).toString("base64");
    console.log(`API-CAPTURE-BEGIN ${packed.length}`);
    for (let i = 0; i < packed.length; i += 4000) console.log(`API-CAPTURE ${packed.slice(i, i + 4000)}`);
    console.log("API-CAPTURE-END");
    if (SHOTS) fs.writeFileSync(`${SHOTS}/render-stability.json`, JSON.stringify(rows, null, 2));
  });

  // ---------------- Failed backend request ----------------
  await step("Failure", async () => {
    await page.route("**/api/v1/alerts", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTHORITY_UNAVAILABLE", message: "The authoritative service is unavailable." } }) }));
    await go(page, "alerts", 3000);
    const t = await text(page);
    check("F1 a failed Alerts request shows a plain error, not stale or invented alerts", /unavailable/i.test(t) && !/Ask moved above your Max Buy/.test(t), t.slice(0, 200));
    await page.unroute("**/api/v1/alerts");
    await shot(page, "10-alerts-failure");
  });
  await context.close();

  // ---------------- Another account ----------------
  await step("Isolation", async () => {
    const b = await session("b");
    await go(b.page, "alerts", 3500);
    const alertsB = await text(b.page);
    check("I1 another account sees none of the first account's alerts", !/Pete Alonso|Ask moved above/.test(alertsB) && /Nothing needs your review/.test(alertsB), alertsB.slice(0, 200));
    await go(b.page, `opportunities/${encodeURIComponent(saved.strong.id)}`, 3500);
    const cardB = await text(b.page);
    check("I2 another account cannot open the first account's saved decision", !/Pete Alonso/.test(cardB), cardB.slice(0, 200));
    await go(b.page, "portfolio", 3500);
    check("I3 another account's Portfolio is empty", !/Pete Alonso/.test(await text(b.page)));
    await go(b.page, `evaluate/${encodeURIComponent(saved.strong.id)}`, 3500);
    const formB = await b.page.locator('#main-content [name="cardIdentity"]').inputValue().catch(() => "");
    check("I4 another account gets no prefill for the first account's listing", formB === "", formB);
    await shot(b.page, "11-other-account-alerts");
    await b.context.close();
  });

  // ---------------- Tablet and phone ----------------
  for (const [label, viewport] of [["tablet", { width: 820, height: 1180 }], ["phone", { width: 390, height: 844 }]]) {
    await step(`Viewport ${label}`, async () => {
      const s = await session("a", viewport, label === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
      for (const hash of ["alerts", "portfolio", "forge-heat", `opportunities/${encodeURIComponent(saved.strong.id)}`, `tracking/${encodeURIComponent(saved.strong.id)}`]) {
        await go(s.page, hash, 3500);
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const t = await text(s.page);
        check(`V ${label} ${hash.split("/")[0]}: renders with no horizontal page overflow`, overflow <= 2 && t.length > 50, String(overflow));
        await shot(s.page, `12-${label}-${hash.split("/")[0]}`);
      }
      check(`V ${label}: no page errors`, s.errors.length === 0, s.errors.join(" | "));
      await s.context.close();
    });
  }
} finally {
  await browser.close();
}

console.log("NOTES", JSON.stringify(notes));
console.log("Integrated customer journey (browser, real gateway, real DEV backend)");
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
