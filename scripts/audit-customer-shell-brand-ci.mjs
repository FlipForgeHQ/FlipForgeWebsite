// Rendered audit for Customer Shell Brand Alignment v1 (presentation only).
// Checks the persistent customer shell around the V2 default dashboard and the flagged V3
// dashboard: official identity, black-first surfaces, flat Evaluate CTA, Guide me clearance,
// Geist, 14px floor, no horizontal overflow, navigation intact, V2 default / V3 flag.
// Requires the local SaaS server (node saas-prototype/serve.mjs) on FLIPFORGE_LAYOUT_AUDIT_URL.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { g1Items, envelope, opportunitiesData, dashboardData, detailData } from "./validate-decision-dashboard-v3.mjs";

const baseUrl = (process.env.FLIPFORGE_LAYOUT_AUDIT_URL || "http://127.0.0.1:4173/app").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const screenshotDir = process.env.FLIPFORGE_SHELL_SCREENSHOT_DIR || "artifacts/customer-shell";
fs.mkdirSync(screenshotDir, { recursive: true });

const passes = [];
const failures = [];
const check = (name, condition, detail = "") => (condition ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const GOLD = "rgb(212, 175, 55)";
const WHITE = "rgb(255, 255, 255)";
const ROOT = "rgb(7, 8, 10)";
const SURFACE = "rgb(11, 13, 16)";
// Approved shell values (Brand Sheet v2.1 + V3 dark system) that carry a slight cool cast by design.
const APPROVED = new Set(["rgb(136, 143, 152)", "rgb(42, 46, 51)", "rgb(11, 13, 16)", "rgb(18, 20, 24)", "rgb(7, 8, 10)"]);

const browser = await chromium.launch({ headless: true, executablePath });

async function open(viewport, v3) {
  const items = g1Items();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => { try { localStorage.setItem("flipforge.privateBeta.onboarding.v1", "complete"); } catch (_) {} });
  await context.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200, contentType: "text/javascript; charset=utf-8",
    body: `window.FlipForgeIdentity = Object.freeze({ getUser: () => ({ email: "shell-audit@flipforge.test" }),
      getSnapshot: () => ({ authenticated: true, email: "shell-audit@flipforge.test", fullName: "Shell Audit", membershipActive: true, membershipConfigured: true }) });`
  }));
  await context.route("**/assets/js/flipforge-production-signin.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "(() => {})();" }));
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const correlationId = request.headers()["x-correlation-id"] || "shell-audit";
    const json = (status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/health") return json(200, envelope(correlationId, { status: "configured", bridgeEnabled: true }));
    if (url.pathname === "/api/v1/dashboard") return json(200, envelope(correlationId, dashboardData(items)));
    if (url.pathname === "/api/v1/opportunities") return json(200, envelope(correlationId, opportunitiesData(items)));
    if (url.pathname.startsWith("/api/v1/opportunities/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/v1/opportunities/".length));
      const source = items.find(entry => entry.id === id);
      return source ? json(200, envelope(correlationId, detailData(source))) : json(404, { error: { code: "NOT_FOUND", correlationId } });
    }
    return json(404, { error: { code: "QA_NOT_MOCKED", message: url.pathname, correlationId } });
  });
  const page = await context.newPage();
  await page.goto(v3 ? `${baseUrl}/?dashboard=v3#/dashboard` : `${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(v3 ? '[data-decision-dashboard-v3][data-ffv3-state="ready"]' : "[data-commercial-dashboard-v2] .ff-kpi-card", { timeout: 15000 });
  await page.waitForSelector(".ff-guide-launcher", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { context, page };
}

async function shellState(page) {
  return page.evaluate(({ approved }) => {
    const style = selector => { const node = document.querySelector(selector); return node ? getComputedStyle(node) : null; };
    const parse = value => (String(value).match(/[\d.]+/g) || []).map(Number);
    const tinted = value => { const [r, g, b, a = 1] = parse(value); return a > 0.05 && b - r >= 8 && b >= g && !approved.includes(`rgb(${r}, ${g}, ${b})`); };
    const shellNodes = [...document.querySelectorAll(".prototype-banner, .prototype-banner *, .sidebar, .sidebar *, .topbar, .topbar *, .workspace, .app-shell, .ff-guide-launcher")]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const tints = [];
    const gradients = [];
    for (const node of shellNodes) {
      const s = getComputedStyle(node);
      for (const prop of ["backgroundColor", "color", "borderTopColor", "borderBottomColor"]) if (tinted(s[prop])) tints.push(`${node.className || node.tagName}:${prop}=${s[prop]}`);
      if (/gradient/.test(s.backgroundImage)) gradients.push(String(node.className || node.tagName));
    }
    const small = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.data.trim()) continue;
      const element = text.parentElement;
      if (!element || element.closest(".sr-only, script, style, svg, .skip-link")) continue;
      const rects = [...element.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      if (!rects.length) continue;
      const s = getComputedStyle(element);
      if (s.visibility === "hidden" || Number(s.opacity) === 0 || s.color === "rgba(0, 0, 0, 0)") continue;
      if (parseFloat(s.fontSize) < 13.5) small.push(`${element.className || element.tagName}:${s.fontSize}:${text.data.trim().slice(0, 20)}`);
    }
    const brandName = document.querySelector(".brand-name");
    const forge = document.querySelector(".brand-name .brand-forge");
    const cta = style(".topbar .ff-global-new-card");
    const ctaNode = document.querySelector(".topbar .ff-global-new-card");
    return {
      body: style("body")?.backgroundColor, font: style("body")?.fontFamily,
      workspace: style(".workspace")?.backgroundColor, sidebar: style(".sidebar")?.backgroundColor, topbar: style(".topbar")?.backgroundColor,
      brandText: brandName?.textContent.trim(), brandColor: brandName ? getComputedStyle(brandName).color : null, forgeColor: forge ? getComputedStyle(forge).color : null,
      subtitle: document.querySelector(".brand-subtitle")?.textContent.trim(), subtitleColor: style(".brand-subtitle")?.color,
      mark: style(".brand-mark")?.backgroundImage || "",
      ctaVisible: Boolean(ctaNode && ctaNode.getClientRects().length), ctaBg: cta?.backgroundColor, ctaImage: cta?.backgroundImage, ctaShadow: cta?.boxShadow, ctaHref: ctaNode?.getAttribute("href"),
      tints, gradients, small,
      overflow: document.scrollingElement.scrollWidth - window.innerWidth
    };
  }, { approved: [...APPROVED] });
}

async function launcherClearance(page) {
  return page.evaluate(() => {
    const launcher = document.querySelector(".ff-guide-launcher");
    if (!launcher || !launcher.getClientRects().length) return { present: false, hits: [] };
    const l = launcher.getBoundingClientRect();
    const overlaps = node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !(r.right <= l.left || r.left >= l.right || r.bottom <= l.top || r.top >= l.bottom);
    };
    // When the launcher sits inside the opaque sticky topbar, page content scrolling beneath the
    // topbar is hidden by it, so only the topbar's own controls can collide with the launcher.
    const topbar = document.querySelector(".topbar");
    const t = topbar ? topbar.getBoundingClientRect() : null;
    const insideTopbar = Boolean(t && l.top >= t.top && l.bottom <= t.bottom && l.left >= t.left && l.right <= t.right && getComputedStyle(topbar).position === "sticky");
    const selector = insideTopbar ? ".topbar a, .topbar button, .topbar input, .topbar form" : "#main-content *, .sidebar a, .sidebar button, .topbar a, .topbar button, .topbar input, .topbar form";
    const candidates = [...document.querySelectorAll(selector)]
      .filter(node => node !== launcher && !launcher.contains(node) && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden")
      .filter(node => node.matches("a, button, input, form, h1, h2, h3, p, li, dd, dt, strong, span, small, em, b") || node.children.length === 0);
    const hits = candidates.filter(overlaps).map(node => `${node.tagName}.${String(node.className).split(" ")[0]}:${(node.textContent || "").trim().slice(0, 18)}`);
    return { present: true, rect: `${Math.round(l.left)},${Math.round(l.top)} ${Math.round(l.width)}x${Math.round(l.height)}`, hits };
  });
}

async function navigationIntact(page, mobile) {
  if (!mobile) {
    return page.evaluate(() => ["Home", "Evaluate a Card", "Saved Decisions", "Tracking"].every(label =>
      [...document.querySelectorAll(".sidebar a")].some(link => link.textContent.trim().startsWith(label) && link.getClientRects().length)));
  }
  const menu = page.locator(".menu-button");
  if (!(await menu.isVisible())) return false;
  await menu.click();
  await page.waitForTimeout(400);
  const ok = await page.evaluate(() => [...document.querySelectorAll(".sidebar a")].some(link => /Home/.test(link.textContent) && link.getBoundingClientRect().left >= 0 && link.getClientRects().length));
  await page.keyboard.press("Escape");
  const close = page.locator("[data-nav-close]");
  if (await close.first().isVisible().catch(() => false)) await close.first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  return ok;
}

const scenarios = [
  { label: "V2 desktop 1440x900", viewport: { width: 1440, height: 900 }, v3: false, mobile: false, file: "shell-v2-desktop-1440x900.png" },
  { label: "V2 mobile 390x844", viewport: { width: 390, height: 844 }, v3: false, mobile: true, file: "shell-v2-mobile-390x844.png" },
  { label: "V3 desktop 1440x900", viewport: { width: 1440, height: 900 }, v3: true, mobile: false, file: "shell-v3-desktop-1440x900.png" },
  { label: "V3 laptop 1200x800", viewport: { width: 1200, height: 800 }, v3: true, mobile: false, file: "shell-v3-laptop-1200x800.png" },
  { label: "V3 mobile 390x844", viewport: { width: 390, height: 844 }, v3: true, mobile: true, file: "shell-v3-mobile-390x844.png" }
];

for (const scenario of scenarios) {
  const { label, viewport, v3, mobile } = scenario;
  const { context, page } = await open(viewport, v3);
  const state = await shellState(page);
  check(`${label}: renderer`, v3
    ? (await page.locator("[data-decision-dashboard-v3]").count()) === 1 && (await page.locator("[data-commercial-dashboard-v2]").count()) === 0
    : (await page.locator("[data-commercial-dashboard-v2]").count()) === 1 && (await page.locator("[data-decision-dashboard-v3]").count()) === 0);
  check(`${label}: wordmark FLIP white / FORGE gold`, state.brandText === "FLIPFORGE" && state.brandColor === WHITE && state.forgeColor === GOLD, `${state.brandColor} / ${state.forgeColor}`);
  check(`${label}: descriptor CARD DECISION INTELLIGENCE in gold`, state.subtitle === "CARD DECISION INTELLIGENCE" && state.subtitleColor === GOLD, state.subtitleColor);
  check(`${label}: approved master icon`, /FlipForge_Icon_Transparent_DarkBG\.svg/.test(state.mark), state.mark.slice(0, 80));
  check(`${label}: black-first shell surfaces`, state.body === ROOT && state.workspace === ROOT && state.sidebar === SURFACE && state.topbar === ROOT, `${state.body} ${state.workspace} ${state.sidebar} ${state.topbar}`);
  check(`${label}: no blue tint in shell`, state.tints.length === 0, state.tints.slice(0, 4).join("; "));
  check(`${label}: no shell gradients`, state.gradients.length === 0, state.gradients.slice(0, 4).join("; "));
  if (state.ctaVisible) {
    check(`${label}: shell Evaluate CTA flat gold, unchanged destination`, state.ctaBg === GOLD && state.ctaImage === "none" && state.ctaShadow === "none" && state.ctaHref === "#/discover", `${state.ctaBg} ${state.ctaImage} ${state.ctaShadow} ${state.ctaHref}`);
  }
  check(`${label}: Geist Sans`, /Geist/.test(state.font || ""), state.font);
  check(`${label}: no customer text below 14px`, state.small.length === 0, state.small.slice(0, 4).join("; "));
  check(`${label}: no horizontal overflow`, state.overflow <= 0, `${state.overflow}px`);
  const clearance = await launcherClearance(page);
  // V3 suppresses the launcher on its dashboard by design (Visual Lock V1 §5.4, #488); V2 keeps it.
  if (v3) check(`${label}: Guide me suppressed on the V3 dashboard`, !clearance.present, clearance.rect || "absent");
  else check(`${label}: Guide me present and covers nothing`, clearance.present && clearance.hits.length === 0, `${clearance.rect || "absent"} ${clearance.hits.slice(0, 4).join("; ")}`);
  await page.screenshot({ path: path.join(screenshotDir, scenario.file) });
  check(`${label}: navigation intact`, await navigationIntact(page, mobile));
  {
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await page.waitForTimeout(200);
    const scrolled = await launcherClearance(page);
    check(`${label}: Guide me covers nothing after scrolling`, v3 ? !scrolled.present : scrolled.present && scrolled.hits.length === 0, scrolled.hits.slice(0, 4).join("; "));
  }
  await context.close();
}

await browser.close();
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Customer shell brand audit: ${passes.length}/${passes.length + failures.length} passed. Screenshots: ${screenshotDir}`);
if (failures.length) process.exit(1);
