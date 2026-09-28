import { chromium } from "playwright";

const HOST = "http://goflipforge.com:4173";
const BETA = `${HOST}/app/beta/#/dashboard`;
const BETA_RETURN = "/app/beta/#/beta-start";
const fail = message => { throw new Error(message); };

async function installIdentity(page, { authenticated, membershipActive }) {
  await page.route("**/assets/js/flipforge-identity.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: `
      const snapshot = Object.freeze({
        authenticated: ${authenticated},
        email: ${authenticated ? '"audit@example.com"' : '""'},
        fullName: ${authenticated ? '"Beta Audit"' : '""'},
        membershipActive: ${membershipActive},
        membershipConfigured: ${membershipActive},
        operatorActive: false
      });
      window.FlipForgeIdentity = Object.freeze({
        getUser: () => ${authenticated ? '({ email: "audit@example.com" })' : 'null'},
        getSnapshot: () => snapshot,
        refresh: async () => snapshot
      });
      window.dispatchEvent(new CustomEvent("flipforge:identity-change", { detail: snapshot }));
    `
  }));
}

async function installGateway(page, status = 200) {
  await page.route("**/api/v1/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/v1/health") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          meta: { contractVersion: "1.0", correlationId: "private-beta-access-audit" },
          data: {
            status: "configured",
            bridgeEnabled: true,
            upstreamConfigured: true,
            authenticationRequired: true,
            tenantMembershipRequired: true
          }
        })
      });
    }

    if (status !== 200) {
      return route.fulfill({
        status,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: {
            code: status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
            message: status === 401 ? "Authentication required." : "Private Beta access denied.",
            correlationId: "private-beta-access-audit"
          }
        })
      });
    }

    const data = pathname === "/api/v1/entitlements"
      ? {
          kind: "entitlements",
          readOnly: true,
          transactionAuthority: false,
          current: { code: "PRIVATE_BETA", name: "Private Beta", accessState: "ACTIVE" },
          usage: { completedEvaluations: 0 },
          checkoutAvailable: false
        }
      : pathname === "/api/v1/dashboard"
      ? { metrics: { trackedOpportunities: 0, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 0 } }
      : { kind: "audit", items: [] };

    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        meta: {
          contractVersion: "1.0",
          authority: "Smart Opportunity",
          gradingAuthority: "Existing PSA intelligence",
          correlationId: "private-beta-access-audit"
        },
        data
      })
    });
  });
}

async function auditAnonymous(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installIdentity(page, { authenticated: false, membershipActive: false });
  await installGateway(page, 401);

  try {
    await page.goto(BETA, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 });
    const destination = new URL(page.url());
    if (destination.searchParams.get("return") !== BETA_RETURN) {
      fail(`anonymous customer URL did not fail closed to beta-start: ${destination.searchParams.get("return") || "<missing>"}`);
    }
    if (destination.searchParams.has("reauth")) fail("anonymous beta redirect incorrectly requested reauthentication");
    console.log("PASS | anonymous production app URL redirects to Private Beta Sign In");
  } finally {
    await context.close();
  }
}

async function auditActiveBeta(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installIdentity(page, { authenticated: true, membershipActive: true });
  await installGateway(page, 200);

  try {
    await page.goto(BETA, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__FlipForgePrivateBetaAccessVerified === true, null, { timeout: 10000 });
    await page.waitForSelector(".prototype-chip", { timeout: 10000 });
    const state = await page.evaluate(() => ({
      path: location.pathname,
      hash: location.hash,
      chip: document.querySelector(".prototype-chip")?.textContent?.trim() || "",
      mode: document.body?.getAttribute("data-ff-access-mode") || "",
      hiddenPending: document.documentElement.classList.contains("ff-private-beta-access-pending"),
      title: document.title
    }));
    if (state.path !== "/app/beta/") fail(`active beta left protected beta surface: ${state.path}`);
    if (state.chip !== "PRIVATE BETA") fail(`production shell is not labeled PRIVATE BETA: ${state.chip || "<empty>"}`);
    if (state.mode !== "private-beta") fail(`production beta access mode missing: ${state.mode || "<empty>"}`);
    if (state.hiddenPending) fail("verified beta tester remained hidden behind access-pending state");
    if (!/Private Beta/i.test(state.title)) fail(`production title does not identify Private Beta: ${state.title}`);
    console.log("PASS | active invited beta tester enters protected production workspace");
  } finally {
    await context.close();
  }
}

async function auditStaleSession(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await installIdentity(page, { authenticated: true, membershipActive: true });
  await installGateway(page, 401);

  try {
    await page.goto(BETA, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForURL(url => url.pathname === "/production-auth.html", { timeout: 10000 });
    const destination = new URL(page.url());
    if (destination.searchParams.get("return") !== BETA_RETURN) {
      fail(`stale session did not return through beta-start: ${destination.searchParams.get("return") || "<missing>"}`);
    }
    if (destination.searchParams.get("reauth") !== "1") fail("stale session did not request reauthentication");
    console.log("PASS | stale cached beta identity fails closed and requires reauthentication");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"]
});

try {
  await auditAnonymous(browser);
  await auditActiveBeta(browser);
  await auditStaleSession(browser);
  console.log("Customer Private Beta production access audit passed");
} finally {
  await browser.close();
}
