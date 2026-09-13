import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error?.message || error)));

const fail = message => { throw new Error(message); };

try {
  await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    pathname: window.location.pathname,
    chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
    bannerExists: Boolean(document.querySelector(".prototype-banner")),
    htmlFullCustomer: document.documentElement.classList.contains("ff-full-customer-app"),
    bodyFullCustomer: document.body.classList.contains("ff-full-customer-app"),
    title: document.title,
    nav: [...document.querySelectorAll(".primary-nav a")]
      .filter(link => !link.hidden && link.getAttribute("aria-hidden") !== "true")
      .map(link => String(link.textContent || "").replace(/\s+/g, " ").trim())
  }));

  if (state.pathname !== "/app/customer/") fail(`Expected customer pathname, got ${state.pathname}`);
  if (state.chip !== "CUSTOMER APP") fail(`Expected CUSTOMER APP, got ${state.chip || "<empty>"}`);
  if (state.bannerExists) fail("Customer route rendered a beta banner element");
  if (!state.htmlFullCustomer || !state.bodyFullCustomer) fail("Customer route is missing full-customer root state");
  if (!/Customer App/i.test(state.title)) fail(`Customer document title is wrong: ${state.title}`);
  if (!state.nav.some(value => /Decision Intelligence/i.test(value))) fail("Decision Intelligence is not visible");
  if (!state.nav.some(value => /Outcome Intelligence/i.test(value))) fail("Outcome Intelligence is not visible");

  // Reproduce the bug: older feature modules may emit an auth link whose encoded
  // return points at /app. The capture-phase production redirect must ignore that
  // stale return and rebuild it from the current /app/customer/ browser location.
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.id = "ff-customer-auth-regression";
    link.href = "/production-auth.html?return=%2Fapp%2F%23%2Fdashboard";
    link.textContent = "Sign in securely";
    document.body.appendChild(link);
  });

  await Promise.all([
    page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 }),
    page.click("#ff-customer-auth-regression")
  ]);

  const authReturn = await page.evaluate(() => new URLSearchParams(window.location.search).get("return"));
  if (authReturn !== "/app/customer/#/dashboard") {
    fail(`Customer sign-in fell back to beta: ${authReturn || "<missing>"}`);
  }

  const seriousErrors = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
  if (seriousErrors.length) fail(`Browser syntax errors: ${seriousErrors.join(" | ")}`);

  console.log("Full customer browser audit passed");
  console.log(JSON.stringify({ state, authReturn }, null, 2));
} finally {
  await browser.close();
}
