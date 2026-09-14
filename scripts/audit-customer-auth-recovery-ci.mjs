import { chromium } from "playwright";

const customerRoutes = [
  "dashboard",
  "discover",
  "evaluate",
  "decision-intelligence",
  "opportunities",
  "tracking",
  "portfolio",
  "alerts",
  "forge-heat",
  "market-view",
  "account",
  "compare",
  "psa-advisor",
  "evidence",
  "sell",
  "export"
];

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

const fail = message => { throw new Error(message); };

function healthFixture(correlationId) {
  return {
    meta: { contractVersion: "1.0", correlationId },
    data: {
      status: "configured",
      bridgeEnabled: true,
      upstreamConfigured: true,
      authenticationRequired: true,
      tenantMembershipRequired: true
    }
  };
}

async function installAnonymousGateway(page) {
  await page.route("**/api/v1/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    const correlationId = route.request().headers()["x-correlation-id"] || "auth-recovery-audit";
    if (pathname === "/api/v1/health") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(healthFixture(correlationId))
      });
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required.",
          correlationId
        }
      })
    });
  });
}

async function auditAnonymousState(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error?.message || error)));
  await installAnonymousGateway(page);

  try {
    await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(500);

    for (const route of customerRoutes) {
      await page.evaluate(nextRoute => { window.location.hash = `#/${nextRoute}`; }, route);
      await page.waitForFunction(expected => window.location.hash === `#/${expected}`, route, { timeout: 10000 });
      await page.waitForTimeout(450);

      const state = await page.evaluate(() => {
        const link = document.querySelector("[data-ff-customer-sign-in]");
        const box = link?.getBoundingClientRect?.();
        const style = link ? getComputedStyle(link) : null;
        return {
          hash: window.location.hash,
          href: link?.getAttribute("href") || "",
          text: String(link?.textContent || "").trim(),
          hidden: Boolean(link?.hidden),
          ariaHidden: link?.getAttribute("aria-hidden") || "",
          display: style?.display || "",
          visibility: style?.visibility || "",
          box: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          mainText: String(document.querySelector("#main-content")?.innerText || "").replace(/\s+/g, " ").trim()
        };
      });

      if (!state.href) fail(`${viewport.name} ${route}: anonymous customer has no sign-in destination`);
      if (state.hidden || state.ariaHidden === "true" || state.display === "none" || state.visibility === "hidden") {
        fail(`${viewport.name} ${route}: anonymous sign-in control is hidden`);
      }
      if (!/Sign in to FlipForge/i.test(state.text)) fail(`${viewport.name} ${route}: sign-in label is unclear: ${state.text || "<empty>"}`);
      if (!state.box || state.box.width < 40 || state.box.height < 40) fail(`${viewport.name} ${route}: sign-in control is not a usable target`);
      if (state.box.left < -1 || state.box.top < -1 || state.box.right > state.viewport.width + 1 || state.box.bottom > state.viewport.height + 1) {
        fail(`${viewport.name} ${route}: sign-in control is outside the viewport`);
      }

      const destination = new URL(state.href, "http://goflipforge.com:4173");
      const expectedReturn = `/app/customer/#/${route}`;
      if (destination.pathname !== "/production-auth.html") fail(`${viewport.name} ${route}: wrong auth destination ${destination.pathname}`);
      if (destination.searchParams.get("return") !== expectedReturn) {
        fail(`${viewport.name} ${route}: auth return mismatch: ${destination.searchParams.get("return") || "<missing>"}`);
      }

      // Every protected route must render either content or a clear failure state;
      // a blank main region is a customer dead end even if the shell survives.
      if (state.mainText.length < 8) fail(`${viewport.name} ${route}: protected route rendered a blank customer workspace`);
    }

    await page.evaluate(() => { window.location.hash = "#/decision-intelligence"; });
    await page.waitForTimeout(350);
    await Promise.all([
      page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 }),
      page.click("[data-ff-customer-sign-in]")
    ]);
    const authReturn = await page.evaluate(() => new URLSearchParams(window.location.search).get("return"));
    if (authReturn !== "/app/customer/#/decision-intelligence") {
      fail(`${viewport.name}: clicking persistent sign-in did not preserve route: ${authReturn || "<missing>"}`);
    }

    const seriousErrors = pageErrors.filter(message => /SyntaxError|Unexpected token|Unexpected identifier/i.test(message));
    if (seriousErrors.length) fail(`${viewport.name}: browser syntax errors: ${seriousErrors.join(" | ")}`);
  } finally {
    await context.close();
  }
}

async function auditAuthenticatedState(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: `
      window.FlipForgeIdentity = Object.freeze({
        getUser: () => ({ email: "audit@example.com" }),
        getSnapshot: () => Object.freeze({ authenticated: true, membershipActive: true, membershipConfigured: true }),
        refresh: async () => Object.freeze({ authenticated: true, membershipActive: true, membershipConfigured: true })
      });
      window.dispatchEvent(new CustomEvent("flipforge:identity-change", { detail: { authenticated: true, membershipActive: true } }));
    `
  }));
  await installAnonymousGateway(page);

  try {
    await page.goto("http://goflipforge.com:4173/app/customer/#/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(650);
    const state = await page.evaluate(() => {
      const link = document.querySelector("[data-ff-customer-sign-in]");
      return {
        exists: Boolean(link),
        hidden: Boolean(link?.hidden),
        ariaHidden: link?.getAttribute("aria-hidden") || ""
      };
    });
    if (!state.exists) fail("authenticated state lost the governed shell auth control entirely");
    if (!state.hidden || state.ariaHidden !== "true") fail("authenticated customer still sees the anonymous sign-in control");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

try {
  for (const viewport of viewports) await auditAnonymousState(browser, viewport);
  await auditAuthenticatedState(browser);
  console.log("Customer auth recovery audit passed");
  console.log(JSON.stringify({ routes: customerRoutes.length, viewports: viewports.map(item => item.name), states: ["anonymous-401", "authenticated"] }, null, 2));
} finally {
  await browser.close();
}
