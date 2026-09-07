import { chromium } from "playwright";

const baseUrl = process.env.FLIPFORGE_EVALUATE_PREVIEW_URL || "http://127.0.0.1:4174/customer-evaluate-ux-preview.html";
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    record("Desktop first view has a clear Evaluate purpose", /One card\. One decision\. Know why\./i.test(await page.locator("h1").innerText()));
    const nav = (await page.locator(".nav a").allInnerTexts()).map(v => v.trim()).filter(Boolean);
    record("Desktop customer navigation is limited to four destinations", JSON.stringify(nav) === JSON.stringify(["Home","Evaluate","Saved Decisions","Tracking"]), nav.join(" | "));
    record("Desktop first screen has no horizontal overflow", await noHorizontalOverflow(page));

    const card = "2018 Topps Chrome Shohei Ohtani PSA 9";
    await page.locator("#card-input").fill(card);
    await page.locator("#price-input").fill("450");
    await page.locator('[data-next="2"]').first().click();
    record("Identity confirmation is a separate step", await page.locator("#screen-2").evaluate(el => el.classList.contains("active")));
    record("Confirmed identity preserves the entered card", (await page.locator("#confirm-card").innerText()).includes("Shohei Ohtani"));
    record("Confirmed listing price is visible", (await page.locator("#confirm-price").innerText()).includes("450"));

    await page.locator('[data-next="3"]').first().click();
    record("Decision becomes the next primary screen", await page.locator("#screen-3").evaluate(el => el.classList.contains("active")));
    record("Decision screen shows exactly two primary reasons", await page.locator("#screen-3 .reason").count() === 2, `count=${await page.locator("#screen-3 .reason").count()}`);
    const drawer = page.locator("#screen-3 details.secondary-drawer");
    record("Deeper evidence is collapsed by default", await drawer.count() === 1 && !(await drawer.evaluate(el => el.open)));
    record("Decision screen has no horizontal overflow", await noHorizontalOverflow(page));

    const next4 = page.locator('[data-next="4"]').first();
    if (await next4.count()) {
      await next4.click();
      record("Flow reaches Save & Track finish", await page.locator("#screen-4").evaluate(el => el.classList.contains("active")));
    } else {
      record("Flow reaches Save & Track finish", false, "No step-4 action found");
    }
  } finally {
    await context.close();
  }
}

async function runMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    record("Mobile first screen has no horizontal overflow", await noHorizontalOverflow(page));
    record("Mobile card entry stays usable", await page.locator("#card-input").isVisible());
    const buttonBox = await page.locator('[data-next="2"]').first().boundingBox();
    record("Mobile primary action meets 44px touch target", Boolean(buttonBox && buttonBox.height >= 44), buttonBox ? `${Math.round(buttonBox.height)}px` : "missing");

    const sidebarVisible = await page.locator(".sidebar").isVisible().catch(() => false);
    const mobileRouteControl = await page.locator('[aria-label*="menu" i], [data-nav-toggle], .mobile-nav, .bottom-nav').count();
    record("Mobile retains a way to reach core customer navigation", !sidebarVisible && mobileRouteControl > 0, `sidebarVisible=${sidebarVisible}; alternateControls=${mobileRouteControl}`);

    await page.locator('[data-next="2"]').first().click();
    record("Mobile confirmation has no horizontal overflow", await noHorizontalOverflow(page));
    await page.locator('[data-next="3"]').first().click();
    record("Mobile decision has no horizontal overflow", await noHorizontalOverflow(page));
  } finally {
    await context.close();
  }
}

async function runFailureStates(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.locator("#card-input").fill("");
    await page.locator('[data-next="2"]').first().click();
    const stayedOnEntry = await page.locator("#screen-1").evaluate(el => el.classList.contains("active"));
    const visibleError = await page.locator('[role="alert"], .error, .field-error, [aria-invalid="true"]').count();
    record("Empty card identity fails closed with customer guidance", stayedOnEntry && visibleError > 0, `stayedOnEntry=${stayedOnEntry}; visibleError=${visibleError}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#price-input").fill("abc");
    await page.locator('[data-next="2"]').first().click();
    const priceStayed = await page.locator("#screen-1").evaluate(el => el.classList.contains("active"));
    const priceError = await page.locator('[role="alert"], .error, .field-error, [aria-invalid="true"]').count();
    record("Malformed price fails closed with customer guidance", priceStayed && priceError > 0, `stayedOnEntry=${priceStayed}; visibleError=${priceError}`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await runDesktop(browser);
  await runMobile(browser);
  await runFailureStates(browser);
} finally {
  await browser.close();
}

const failed = results.filter(item => !item.ok);
console.log(`\nCustomer Evaluate UX stress test: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("Findings requiring attention:");
  failed.forEach(item => console.log(`- ${item.name}${item.detail ? `: ${item.detail}` : ""}`));
  process.exit(1);
}
