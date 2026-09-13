import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error?.message || error)));

const fail = message => {
  throw new Error(message);
};

try {
  await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    pathname: window.location.pathname,
    chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
    bannerExists: Boolean(document.querySelector(".prototype-banner")),
    htmlClass: document.documentElement.classList.contains("ff-full-customer-app"),
    bodyClass: document.body.classList.contains("ff-full-customer-app"),
    title: document.title,
    nav: [...document.querySelectorAll(".primary-nav a")]
      .filter(link => !link.hidden && link.getAttribute("aria-hidden") !== "true")
      .map(link => link.textContent.replace(/\s+/g, " ").trim())
  }));

  if (state.pathname !== "/app/customer/") fail(`Expected /app/customer/ pathname, got ${state.pathname}`);
  if (state.chip !== "CUSTOMER APP") fail(`Expected CUSTOMER APP chip, got ${state.chip || "<empty>"}`);
  if (state.bannerExists) fail("Full customer entry still rendered the beta banner element");
  if (!state.htmlClass || !state.bodyClass) fail("Full customer route is missing full-customer root classes");
  if (!/Customer App/i.test(state.title)) fail(`Customer document title is wrong: ${state.title}`);
  if (!state.nav.some(value => /Decision Intelligence/i.test(value))) fail("Decision Intelligence is not visible in customer navigation");
  if (!state.nav.some(value => /Outcome Intelligence/i.test(value))) fail("Outcome Intelligence is not visible in customer navigation");

  await page.evaluate(() => {
    const link = document.createElement("a");
    link.id = "ff-auth-regression-link";
    link.href = "/production-auth.html?return=%2Fapp%2F%23%2Fdashboard";
    link.textContent = "Sign in securely";
    document.body.appendChild(link);
  });

  await Promise.all([
    page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 }),
    page.click("#ff-auth-regression-link")
  ]);

  const authReturn = await page.evaluate(() => new URLSearchParams(window.location.search).get("return"));
  if (authReturn !== "/app/customer/#/dashboard") {
    fail(`Customer sign-in fell back to beta route: ${authReturn}`);
  }

  const seriousErrors = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
  if (seriousErrors.length) fail(`Browser script errors: ${seriousErrors.join(" | ")}`);

  console.log("Full customer browser audit passed");
  console.log(JSON.stringify({ state, authReturn }, null, 2));
} finally {
  await browser.close();
}
