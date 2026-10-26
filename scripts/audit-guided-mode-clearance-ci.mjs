// Guided Mode must never cover the customer's primary controls.
//
// 2026-10-15: at 1280x900 the open Guided Mode panel (fixed, bottom-right) covered the Evaluate page's submit button
// ("Evaluate and save"): a mouse click landed on the guide's route navigation, so a desktop customer could not submit
// with the guide open. The same overlap existed from 761px to 1479px wide, and on phones once the guide is opened.
//
// For each viewport, with the guide open (and on phones also minimized to its launcher), the audit brings each primary
// control into view the way a customer does (centred, and with the page scrolled all the way down, where a docked
// guide overlaps the last control most) and checks that the point a real click lands on is the control itself, then
// performs that real click. Controlled
// responses only: every evaluation is answered locally; no provider, no paid evaluation, no production data.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (dir, name) => JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures", dir, `${name}.json`), "utf8"));
const OPP = "opp-ohtani-psa10";
const withCorrelation = (body, correlationId) => ({ ...body, meta: { ...body.meta, correlationId } });

const baseUrl = process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app/beta";
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
      // Guided Mode at its defaults (on); no remembered minimize from an earlier run.
      for (const key of Object.keys(localStorage)) if (key.startsWith("flipforge.guidedMode")) localStorage.removeItem(key);
    } catch (_) {}
  });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "guide-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "guide-audit@flipforge.test", fullName: "Guide Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  const evaluationCalls = [];
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "guide-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, { meta: { contractVersion: "1.0", correlationId }, data: { status: "configured" } });
    if (url.pathname === "/api/v1/evaluations") {
      evaluationCalls.push(request.method());
      // Answered locally; the click reaching the server is what is being checked.
      return json(429, { error: { code: "EVALUATION_LIMIT_REACHED", message: "Your evaluation allowance has been reached. No new evaluation was created.", correlationId } });
    }
    if (url.pathname === "/api/v1/discover") return json(503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "QA: discovery not mocked.", correlationId } });
    // Saved-card pages (2026-10-26): an owned card with Sell Watch costs, so Tracking shows the Sales and Sell Watch
    // panels in the right-hand column the guide used to cover.
    if (url.pathname === "/api/v1/opportunities") return json(200, withCorrelation(fixture("customer-reported-sales", "opportunities"), correlationId));
    if (url.pathname === "/api/v1/lifecycle") return json(200, withCorrelation(fixture("customer-reported-sales", "lifecycle-list"), correlationId));
    if (url.pathname === `/api/v1/lifecycle/${OPP}`) return json(200, withCorrelation(fixture("customer-reported-sales", "lifecycle-detail"), correlationId));
    if (url.pathname === `/api/v1/reported-sales/${OPP}`) return json(200, withCorrelation(fixture("customer-reported-sales", "sales-empty"), correlationId));
    if (url.pathname === `/api/v1/sell-watch/${OPP}`) return json(200, withCorrelation(fixture("customer-sell-watch", "card-with-costs"), correlationId));
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  return { context, page: await context.newPage(), evaluationCalls };
}

// Where a real click on the element's centre lands at a natural scroll position:
//   "center"  - the control scrolled to the middle of the screen (as far as the page allows);
//   "pageEnd" - the page scrolled all the way down, the furthest a customer can scroll (the worst case for the last
//               control on the page under a docked guide). Skipped when the control is not on screen there.
async function landing(page, selector, position) {
  await page.evaluate(([sel, pos]) => {
    const node = document.querySelector(sel);
    if (pos === "pageEnd") window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" });
    else node?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }, [selector, position]);
  await page.waitForTimeout(250);
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) return { found: false };
    const r = node.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const inViewport = r.width > 0 && r.height > 0 && y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth;
    const hit = inViewport ? document.elementFromPoint(x, y) : null;
    const guide = hit?.closest?.("#ff-guided-mode-root, .ff-guide-panel, .ff-guide-launcher");
    return { found: true, inViewport, onControl: Boolean(hit && (hit === node || node.contains(hit))), coveredByGuide: Boolean(guide),
      hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : null, x: Math.round(x), y: Math.round(y) };
  }, selector);
}

async function guideState(page) {
  return page.evaluate(() => ({
    panel: Boolean(document.querySelector(".ff-guide-panel")),
    launcher: Boolean(document.querySelector(".ff-guide-launcher"))
  }));
}

async function openGuideIfMinimized(page) {
  const state = await guideState(page);
  if (state.panel) return true;
  const launcher = page.locator(".ff-guide-launcher");
  if (await launcher.count()) {
    await launcher.first().click();
    await page.waitForTimeout(400);
  }
  return (await guideState(page)).panel;
}

async function fillEvaluate(page) {
  const form = "#main-content [data-staging-evaluation-form]";
  await page.waitForSelector(form, { timeout: 15000 });
  await page.evaluate(selector => {
    const f = document.querySelector(selector);
    const set = (name, value) => {
      const el = f.querySelector(`[name="${name}"]`);
      if (el.type === "checkbox") el.checked = value; else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set("externalListingId", "900000000001");
    set("cardIdentity", "2018 Topps Chrome Shohei Ohtani #150 PSA 9");
    set("listingUrl", "https://www.ebay.com/itm/900000000001");
    set("itemPrice", "759.95");
    set("acknowledgeBoundary", true);
  }, form);
}

const SUBMIT = '#main-content [data-staging-evaluation-form] .staging-form-actions button[type="submit"]';
const VIEWPORTS = [
  { width: 1600, height: 900 }, { width: 1440, height: 900 }, { width: 1280, height: 900 }, { width: 1280, height: 720 },
  { width: 1180, height: 820 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 375, height: 667 }
];

for (const viewport of VIEWPORTS) {
  const phone = viewport.width < 761;
  // Phones: check both the default (minimized launcher) and the guide opened by the customer.
  for (const opened of phone ? [false, true] : [true]) {
    const label = `${viewport.width}x${viewport.height}${phone ? (opened ? " guide opened" : " guide minimized") : " guide open"}`;
    const { context, page, evaluationCalls } = await newPage(viewport);
    try {
      await page.goto(`${baseUrl}/#/evaluate`, { waitUntil: "load" });
      await fillEvaluate(page);
      await page.waitForTimeout(800);
      if (opened) {
        const open = await openGuideIfMinimized(page);
        check(`${label}: the guide is open for this check`, open);
      } else {
        const state = await guideState(page);
        check(`${label}: the guide starts minimized to its launcher`, state.launcher && !state.panel, JSON.stringify(state));
      }
      // Scrolled so the button sits at the bottom of the screen (where the guide overlaps most), and centred.
      for (const position of ["pageEnd", "center"]) {
        const spot = await landing(page, SUBMIT, position);
        check(`${label}: Evaluate submit reachable (${position})`, spot.found && spot.inViewport && spot.onControl && !spot.coveredByGuide, JSON.stringify(spot));
      }
      // A real mouse click on the button at the end of the page submits the form (answered locally with a 429).
      const spot = await landing(page, SUBMIT, "pageEnd");
      if (spot.inViewport) await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(1200);
      check(`${label}: a real click on Evaluate submits the evaluation`, evaluationCalls.length === 1, `calls=${evaluationCalls.length}`);
      // The alert's own Plan & Usage link must be clickable too.
      const link = await landing(page, '#main-content [data-evaluation-allowance-reached] a[href="#/account"]', "center");
      check(`${label}: the alert's Plan & Usage link is reachable`, link.found && link.onControl && !link.coveredByGuide, JSON.stringify(link));

      // Discover: the search button at the bottom of the card form.
      await page.evaluate(() => { location.hash = "#/discover"; });
      await page.waitForSelector("#main-content [data-customer-discovery-form]", { timeout: 15000 });
      await page.waitForTimeout(600);
      if (opened) await openGuideIfMinimized(page);
      const search = await landing(page, '#main-content [data-customer-discovery-form] button[type="submit"]', "center");
      check(`${label}: Discover search button reachable`, search.found && search.onControl && !search.coveredByGuide, JSON.stringify(search));
      // Regression: at persistent-sidebar tablet widths, the guide sheet
      // must remain entirely within the workspace instead of covering navigation.
      if (opened && viewport.width >= 901 && viewport.width <= 1179) {
        const navClear = await page.evaluate(() => {
          const nav = document.querySelector(".sidebar");
          const guide = document.querySelector(".ff-guide-panel");
          if (!nav || !guide) return { found: false };
          const sidebarRight = nav.getBoundingClientRect().right;
          const guideLeft = guide.getBoundingClientRect().left;
          return { found: true, clear: guideLeft >= sidebarRight + 6, sidebarRight, guideLeft };
        });
        check(`${label}: guide never covers persistent sidebar`,
          navClear.found && navClear.clear, JSON.stringify(navClear));
      }

      // Regression: a tablet navigation drawer opened by the customer must
      // take precedence over the coach, as phone navigation already does.
      if (opened && viewport.width >= 761 && viewport.width <= 900) {
        const drawerState = await page.evaluate(() => {
          const shell = document.querySelector(".app-shell");
          document.body.classList.add("ff-mobile-nav-open");
          if (shell) shell.dataset.navOpen = "true";
          const panel = document.querySelector(".ff-guide-panel");
          const hidden = Boolean(panel && getComputedStyle(panel).display === "none");
          if (shell) shell.dataset.navOpen = "false";
          document.body.classList.remove("ff-mobile-nav-open");
          return { panel: Boolean(panel), hidden };
        });
        check(`${label}: open navigation drawer hides overlapping guide`,
          drawerState.panel && drawerState.hidden, JSON.stringify(drawerState));
      }

      // The full customer shell loads its own later !important padding rules.
      // Simulate that exact cascade and verify the guide clearance still wins.
      if (opened) {
        const precedence = await page.evaluate(() => {
          const style = document.createElement("style");
          style.textContent = "body.ff-full-customer-app #main-content{padding:20px 20px 40px!important}";
          document.head.append(style);
          document.body.classList.add("ff-full-customer-app");
          const main = document.querySelector("#main-content");
          const computed = main ? getComputedStyle(main) : null;
          const bottom = computed ? parseFloat(computed.paddingBottom) : 0;
          const right = computed ? parseFloat(computed.paddingRight) : 0;
          document.body.classList.remove("ff-full-customer-app");
          style.remove();
          return { bottom, right };
        });
        const expectedBottom = viewport.width < 761 ? viewport.height * .30 + 28
          : viewport.width <= 1179 ? viewport.height * .34 + 36 : 0;
        const expectedRight = viewport.width >= 1480 ? 382
          : viewport.width >= 1180 ? Math.min(310, viewport.width - 28) + 42 : 0;
        check(`${label}: full-shell !important padding retains guide clearance`,
          (expectedBottom === 0 || precedence.bottom >= expectedBottom - 2)
          && (expectedRight === 0 || precedence.right >= expectedRight - 2),
          JSON.stringify({ ...precedence, expectedBottom, expectedRight }));
      }

      // The guide itself still works: it can be minimized and reopened.
      if (opened) {
        const minimize = page.locator(".ff-guide-panel [data-guide-minimize]");
        if (await minimize.count()) await minimize.first().click();
        await page.waitForTimeout(300);
        const afterMin = await guideState(page);
        check(`${label}: the guide can still be minimized`, !afterMin.panel && afterMin.launcher, JSON.stringify(afterMin));
      }
    } catch (error) {
      check(`${label}: completed without error`, false, String(error?.message || error).split("\n")[0].slice(0, 220));
    } finally {
      await context.close();
    }
  }
}

// Every other page (2026-10-26): with the guide open on a laptop or desktop screen, the page's content must stay
// clear of the guide, and the Sell Watch price box on a tracked card must take a real click.
const PAGES = [
  ["Dashboard", "#/dashboard"], ["Saved decisions", "#/opportunities"], ["Tracking with Sell Watch", `#/tracking/${OPP}`],
  ["Portfolio", "#/portfolio"], ["Forge Heat", "#/forge-heat"], ["Market view", "#/market-view"]
];
for (const viewport of [{ width: 1600, height: 900 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1180, height: 820 }]) {
  const label = `${viewport.width}x${viewport.height} guide open`;
  const { context, page } = await newPage(viewport);
  try {
    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    for (const [name, hash] of PAGES) {
      await page.evaluate(h => { location.hash = h; }, hash);
      await page.waitForTimeout(1600);
      // Opened explicitly, as a customer would from the launcher (the guide may start hidden on some pages).
      await page.evaluate(() => window.FlipForgeGuidedMode?.open?.());
      await openGuideIfMinimized(page);
      await page.waitForTimeout(400);
      const box = await page.evaluate(() => {
        const guide = document.querySelector(".ff-guide-panel");
        const main = document.querySelector("#main-content");
        if (!guide || !main) return { guide: Boolean(guide), main: Boolean(main) };
        const g = guide.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        const contentRight = m.right - parseFloat(getComputedStyle(main).paddingRight);
        // The page's own blocks: the page container's children and grandchildren that are on screen.
        let widest = 0;
        let widestName = "";
        const page = main.firstElementChild;
        for (const node of page ? [page, ...page.children, ...[...page.children].flatMap(child => [...child.children])] : []) {
          const r = node.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > innerHeight) continue;
          if (r.right > widest) { widest = r.right; widestName = `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`; }
        }
        return { guide: true, main: true, guideLeft: Math.round(g.left), contentRight: Math.round(contentRight), widest: Math.round(widest),
          widestName, overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      check(`${label}: ${name} content stays clear of the open guide`, box.guide && box.main && box.contentRight <= box.guideLeft - 4
        && box.widest <= box.guideLeft - 4, JSON.stringify(box));
      check(`${label}: ${name} has no sideways scroll`, box.guide && !box.overflowX, JSON.stringify(box));
      if (hash.startsWith("#/tracking/")) {
        await page.waitForSelector("[data-sell-watch-panel]:not([hidden]) [data-sell-watch-price-form]", { timeout: 15000 });
        const price = await landing(page, '[data-sell-watch-panel] [data-sell-watch-price-form] [name="price"]', "center");
        check(`${label}: Sell Watch price box takes a real click with the guide open`, price.found && price.inViewport && price.onControl
          && !price.coveredByGuide, JSON.stringify(price));
        const panel = await page.evaluate(() => {
          const r = document.querySelector("[data-sell-watch-panel]")?.getBoundingClientRect();
          return { right: Math.round(r?.right || 0), guideLeft: Math.round(document.querySelector(".ff-guide-panel")?.getBoundingClientRect().left || 0) };
        });
        check(`${label}: the Sell Watch panel sits entirely beside the guide`, panel.right > 0 && panel.right <= panel.guideLeft - 4, JSON.stringify(panel));
      }
    }
    // Minimized: the reserved column is released and pages use their full width again.
    const minimize = page.locator(".ff-guide-panel [data-guide-minimize]");
    if (await minimize.count()) await minimize.first().click();
    await page.waitForTimeout(400);
    const released = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#main-content")).paddingRight));
    check(`${label}: minimizing the guide releases its column`, released < 120, `paddingRight=${released}`);
  } catch (error) {
    check(`${label}: other pages completed without error`, false, String(error?.message || error).split("\n")[0].slice(0, 220));
  } finally {
    await context.close();
  }
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\nGuided Mode clearance audit: ${passes.length}/${passes.length + failures.length} checks passed.`);
process.exit(failures.length ? 1 : 0);
