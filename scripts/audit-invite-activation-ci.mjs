// Invitation activation regression audit.
//
// Netlify Identity invitation emails link to `https://goflipforge.com/#invite_token=<token>`.
// The homepage ships a strict Content-Security-Policy (style-src 'self'). From August to
// October 2026 the activation panel injected an inline <style>, which that policy blocks,
// so invited testers saw only the homepage, clicked "Request Beta Access" and were funneled
// into a new application. This audit fails if that can happen again.
//
// Local mode (default): requests to https://goflipforge.com are served from the built
// repository with the homepage CSP read from netlify.toml, so production host rules apply.
// Identity and Beta Terms endpoints are mocked with a non-production test token; nothing
// leaves the browser.
//
// Remote mode (INVITE_AUDIT_BASE_URL=https://deploy-preview-N--goflipforge.netlify.app):
// the real deploy with real Netlify headers is checked for visibility only. The test token
// is never submitted.
import { chromium } from "playwright";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const remoteBase = String(process.env.INVITE_AUDIT_BASE_URL || "").replace(/\/$/, "");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const SITE = "https://goflipforge.com";
const TEST_TOKEN = "ci-invite-test-token-not-a-real-invitation";
const failures = [];
const passes = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const viewports = [
  ["desktop", { width: 1366, height: 860 }],
  ["laptop", { width: 1280, height: 720 }],
  ["mobile", { width: 390, height: 844 }],
  ["small-mobile", { width: 360, height: 640 }]
];

const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
const homepageCsp = toml.match(/for = "\/"[\s\S]*?Content-Security-Policy = "([^"]+)"/)?.[1];
if (!homepageCsp && !remoteBase) throw new Error("Homepage Content-Security-Policy not found in netlify.toml");
check("000 homepage CSP still restricts styles to same-origin", remoteBase || /style-src 'self'(;|$)/.test(homepageCsp), homepageCsp ? homepageCsp.match(/style-src[^;]*/)[0] : "remote");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4", ".vtt": "text/vtt" };

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const testJwt = [
  b64url({ alg: "HS256", typ: "JWT" }),
  b64url({ sub: "ci-invited-tester", email: "invited-tester@flipforge.test", exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { roles: [] }, user_metadata: { full_name: "CI Invited Tester" } }),
  "ci-signature"
].join(".");
const TERMS_DELAY_MS = 2000;
const TENANT_ROLE = "flipforge-tenant--ci-tenant";
const PENDING_ROLE = "flipforge-terms-pending";
const ACTIVE_ROLE = "flipforge-active";

// A fresh simulated account per browser context. It behaves like production: invited
// accounts start terms-pending; the Terms endpoint is slow and only then promotes the
// account; entitlements and /user always answer from the account's current state.
function newAccount() {
  return { roles: [TENANT_ROLE, PENDING_ROLE], termsStartedAt: 0, termsFinishedAt: 0, termsAborted: false };
}
function userRecord(account) {
  return { id: "ci-invited-tester", aud: "", role: "", email: "invited-tester@flipforge.test", confirmed_at: new Date().toISOString(), invited_at: new Date().toISOString(), app_metadata: { provider: "email", roles: [...account.roles] }, user_metadata: { full_name: "CI Invited Tester" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
function meta(correlationId) {
  return { contractVersion: "1.0", engineVersion: "ci-invite", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId, generatedAt: new Date().toISOString() };
}

function localFile(pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/app/beta" || rel === "/app/beta/") rel = "/saas-prototype/index.html";
  else if (rel.startsWith("/app/beta/")) rel = `/saas-prototype/${rel.slice("/app/beta/".length)}`;
  let file = path.join(root, rel);
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  return existsSync(file) ? file : null;
}

async function routeProduction(context, log, account = newAccount()) {
  await context.route(/^https:\/\/(www\.)?goflipforge\.com\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    log.push(`${request.method()} ${url.pathname}`);
    const correlationId = request.headers()["x-correlation-id"] || "ci";
    if (url.pathname.startsWith("/.netlify/identity/")) {
      const endpoint = url.pathname.slice("/.netlify/identity".length);
      if (endpoint === "/verify" && request.method() === "POST") {
        const body = request.postDataJSON?.() || {};
        if (body.token !== TEST_TOKEN) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: 404, msg: "User not found" }) });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "set-cookie": `nf_jwt=${testJwt}; Path=/; Secure; SameSite=Lax` },
          body: JSON.stringify({ access_token: testJwt, token_type: "bearer", expires_in: 3600, refresh_token: "ci-refresh-token" })
        });
      }
      if (endpoint === "/user") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(userRecord(account)) });
      if (endpoint === "/settings") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ external: {}, disable_signup: true, autoconfirm: false }) });
      if (endpoint === "/logout") return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    if (url.pathname === "/api/beta/terms-acceptance") {
      account.termsStartedAt = Date.now();
      await new Promise(resolve => setTimeout(resolve, TERMS_DELAY_MS));
      try {
        account.roles = [TENANT_ROLE, ACTIVE_ROLE];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true, activated: true, termsVersion: "2026-08-15" }) });
        account.termsFinishedAt = Date.now();
      } catch (_) {
        // The page navigated away and cancelled the request before the server answered.
        account.termsAborted = true;
      }
      return;
    }
    if (url.pathname === "/api/v1/health") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meta: { contractVersion: "1.0", correlationId }, data: { status: "configured", bridgeEnabled: true } }) });
    if (url.pathname === "/api/v1/entitlements") {
      const active = account.roles.includes(ACTIVE_ROLE);
      if (active && account.seat && account.seat !== "ADMITTED") {
        // Active website membership, but no Controlled Pro Beta seat on the backend (gateway passes the reason).
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "ENTITLEMENT_ACCESS_DENIED", reason: account.seat, message: "seat", correlationId } }) });
      }
      return active
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meta: meta(correlationId), data: { kind: "entitlements", membershipActive: true, plan: { code: "PRIVATE_BETA" } } }) })
        : route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "TENANT_MEMBERSHIP_INACTIVE", message: "The FlipForge tenant membership is not active.", correlationId } }) });
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/functions/")) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_IN_CI_FIXTURE", correlationId } }) });
    const file = localFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: "" });
    const headers = { "content-type": types[path.extname(file)] || "application/octet-stream" };
    if (url.pathname === "/" || url.pathname === "/index.html") headers["content-security-policy"] = homepageCsp;
    return route.fulfill({ status: 200, headers, body: readFileSync(file) });
  });
}

async function waitForWorkspaceAccess(page, timeout = 20000) {
  try {
    await page.waitForFunction(() => location.pathname.startsWith("/app/beta/") && location.hash === "#/beta-start" && window.__FlipForgePrivateBetaAccessVerified === true, null, { timeout });
    return true;
  } catch (_) {
    return false;
  }
}

async function inspect(page) {
  return page.evaluate(() => {
    const panelRoot = document.getElementById("flipforge-identity-root");
    const dialog = panelRoot?.querySelector('[aria-labelledby="ff-id-invite-title"]');
    const password = panelRoot?.querySelector('input[name="password"]');
    const confirm = panelRoot?.querySelector('input[name="confirmPassword"]');
    const terms = panelRoot?.querySelector("[data-beta-terms-accept]");
    const submit = panelRoot?.querySelector('[data-ff-identity-invite] button[type="submit"]');
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const inViewport = r => Boolean(r) && r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const topmost = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
      return Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el));
    };
    return {
      scrollY: Math.round(scrollY),
      hash: location.hash,
      rootPosition: panelRoot ? getComputedStyle(panelRoot).position : null,
      rootHidden: panelRoot ? panelRoot.hidden : null,
      dialogBox: box(dialog),
      passwordInViewport: inViewport(box(password)),
      passwordTopmost: topmost(password),
      confirmInViewport: inViewport(box(confirm)),
      termsPresent: Boolean(terms),
      submitBox: box(submit),
      submitInViewport: inViewport(box(submit)),
      title: dialog?.querySelector("#ff-id-invite-title")?.textContent || "",
      funnelClickable: [...document.querySelectorAll('a[href*="beta-application"]')].some(link => {
        const r = link.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(hit) && (hit === link || link.contains(hit));
      }),
      violations: (window.__cspViolations || []).slice(0, 10)
    };
  });
}

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const base = remoteBase || SITE;

for (const [label, viewport] of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const log = [];
  const account = newAccount();
  if (!remoteBase) await routeProduction(context, log, account);
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      window.__cspViolations.push({ text: `${event.violatedDirective} ${event.blockedURI || "inline"} from ${event.sourceFile || "document"}:${event.lineNumber || 0}`, directive: event.violatedDirective, blockedURI: event.blockedURI || "", sourceFile: event.sourceFile || "", line: event.lineNumber || 0 });
    });
  });
  const page = await context.newPage();
  const navigations = [];
  let firstWorkspaceNavAt = 0;
  page.on("framenavigated", frame => {
    if (frame !== page.mainFrame()) return;
    navigations.push(frame.url());
    if (!firstWorkspaceNavAt && /\/app\/beta\//.test(frame.url())) firstWorkspaceNavAt = Date.now();
  });

  await page.goto(`${base}/#invite_token=${TEST_TOKEN}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("#flipforge-identity-root [data-ff-identity-invite]", { state: "visible", timeout: 10000 });
  } catch (_) {}
  await page.waitForTimeout(400);
  const info = await inspect(page);
  // Netlify injects its deploy-preview collaboration toolbar (/.netlify/scripts/cdp and its
  // markup) into preview HTML only; production never serves it. Exclude violations that can
  // be traced to that injection, and nothing else.
  let previewHtmlLines = [];
  if (remoteBase) previewHtmlLines = (await (await page.request.get(`${base}/`)).text()).split("\n");
  const netlifyToolbar = v => remoteBase && (/\/\.netlify\/scripts\//.test(v.sourceFile) || /(^|\.)netlify\.com(\/|$)/.test(String(v.blockedURI).replace(/^https?:\/\//, ""))
    || (v.directive.startsWith("style-src") && /netlify/i.test(previewHtmlLines[v.line - 1] || "")));
  const ownViolations = info.violations.filter(v => !netlifyToolbar(v)).map(v => v.text);
  const toolbarViolations = info.violations.filter(netlifyToolbar).map(v => v.text);
  if (toolbarViolations.length) console.log(`NOTE ${label}: ignored ${toolbarViolations.length} Netlify deploy-preview toolbar CSP report(s): ${toolbarViolations.join(" | ")}`);
  if (process.env.INVITE_AUDIT_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.INVITE_AUDIT_SCREENSHOTS, `invite-${remoteBase ? "remote" : "local"}-${label}.png`) }).catch(() => {});
  const tag = `${label} ${viewport.width}x${viewport.height}`;

  check(`010 ${tag}: activation dialog shown`, info.title === "Activate your FlipForge beta account", info.title || "missing");
  check(`011 ${tag}: dialog is a fixed overlay, not page content`, info.rootPosition === "fixed", String(info.rootPosition));
  check(`012 ${tag}: visible without scrolling`, info.scrollY === 0 && info.rootHidden === false, `scrollY=${info.scrollY} hidden=${info.rootHidden}`);
  check(`013 ${tag}: password field visible above the fold and not covered`, info.passwordInViewport && info.passwordTopmost, JSON.stringify(info.dialogBox));
  check(`014 ${tag}: confirm-password field visible above the fold`, info.confirmInViewport);
  check(`015 ${tag}: Beta Terms consent is part of activation`, info.termsPresent);
  check(`016 ${tag}: Activate button reachable inside the dialog`, info.submitInViewport || (info.submitBox && info.dialogBox && info.submitBox.top < info.dialogBox.bottom + 1000), JSON.stringify(info.submitBox));
  check(`016b ${tag}: "Request Beta Access" cannot be clicked while activating`, !info.funnelClickable);
  check(`017 ${tag}: no Content-Security-Policy violations`, ownViolations.length === 0, ownViolations.join(" | "));
  check(`018 ${tag}: invitation token removed from the address bar`, !/invite_token/.test(info.hash), info.hash);

  if (!remoteBase) {
    // Scroll the dialog into its own view if a short screen needs it, then activate.
    await page.locator('#flipforge-identity-root input[name="password"]').fill("ci-test-password-0123456789");
    await page.locator('#flipforge-identity-root input[name="confirmPassword"]').fill("ci-test-password-0123456789");
    await page.locator("#flipforge-identity-root [data-beta-terms-accept]").check();
    await page.locator('#flipforge-identity-root [data-ff-identity-invite] button[type="submit"]').click();
    const workspaceOpened = await waitForWorkspaceAccess(page);
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    const termsPosted = log.some(line => line === "POST /api/beta/terms-acceptance");
    check(`020 ${tag}: activation opens the Private Beta workspace and the access gate admits the tester`, workspaceOpened && /\/app\/beta\/#\/beta-start$/.test(finalUrl), `${finalUrl} | ${navigations.join(" -> ")}`);
    check(`021 ${tag}: Beta Terms acceptance sent during activation`, termsPosted);
    check(`021b ${tag}: Terms request completed before leaving the activation page (${TERMS_DELAY_MS}ms server)`, account.termsFinishedAt > 0 && !account.termsAborted && (!firstWorkspaceNavAt || account.termsFinishedAt <= firstWorkspaceNavAt), `finished=${account.termsFinishedAt} aborted=${account.termsAborted} firstWorkspaceNav=${firstWorkspaceNavAt}`);
    check(`021c ${tag}: account promoted to active`, account.roles.includes(ACTIVE_ROLE), account.roles.join(","));
    check(`022 ${tag}: never routed into the beta application funnel or back to sign-in`, !navigations.some(url => /beta-application|production-auth/i.test(url)), navigations.join(" -> "));
  }
  await context.close();
}

// Expired or invalid invitation: the tester must be pointed to sign-in, never to a new application.
if (!remoteBase) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routeProduction(context, []);
  const page = await context.newPage();
  await page.goto(`${SITE}/#invite_token=ci-expired-invitation-token`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#flipforge-identity-root [data-ff-identity-invite]", { state: "visible", timeout: 10000 }).catch(() => {});
  await page.locator('#flipforge-identity-root input[name="password"]').fill("ci-test-password-0123456789");
  await page.locator('#flipforge-identity-root input[name="confirmPassword"]').fill("ci-test-password-0123456789");
  await page.locator("#flipforge-identity-root [data-beta-terms-accept]").check();
  await page.locator('#flipforge-identity-root [data-ff-identity-invite] button[type="submit"]').click();
  await page.waitForSelector("#flipforge-identity-root [data-ff-identity-invite-signin]", { timeout: 10000 }).catch(() => {});
  const next = await page.evaluate(() => {
    const link = document.querySelector("#flipforge-identity-root [data-ff-identity-invite-signin]");
    const panelLinks = [...document.querySelectorAll("#flipforge-identity-root a")].map(a => a.getAttribute("href") || "");
    return { href: link?.getAttribute("href") || "", panelLinks, error: document.querySelector("#flipforge-identity-root .ff-id-error")?.textContent || "" };
  });
  check("030 expired invitation shows an error", Boolean(next.error), next.error);
  check("031 expired invitation offers Private Beta sign in", next.href.startsWith("/production-auth.html"), next.href);
  check("032 expired invitation never links to the beta application", !next.panelLinks.some(href => /beta-application/i.test(href)), next.panelLinks.join(", "));
  await context.close();
}

// Recovery: an activated account whose Terms acceptance was never recorded signs in later.
// The sign-in page must offer the acceptance instead of a dead end, then open the workspace.
if (!remoteBase) {
  for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const log = [];
    const account = newAccount();
    await routeProduction(context, log, account);
    await context.addCookies([{ name: "nf_jwt", value: testJwt, domain: "goflipforge.com", path: "/", secure: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const navigations = [];
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await page.goto(`${SITE}/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-production-auth-terms]:not([hidden])", { timeout: 10000 }).catch(() => {});
    const before = await page.evaluate(() => {
      const panel = document.querySelector("[data-production-auth-terms]");
      const button = document.querySelector("[data-production-auth-terms-submit]");
      const box = panel?.getBoundingClientRect();
      return { shown: Boolean(panel && !panel.hidden), disabled: Boolean(button?.disabled), termsLink: document.querySelector("[data-production-auth-terms] a")?.getAttribute("href") || "", inView: Boolean(box && box.top < innerHeight), result: document.querySelector("[data-production-auth-result]")?.textContent || "" };
    });
    check(`040 ${label}: terms-pending account sees the Terms acceptance on the sign-in page`, before.shown, before.result);
    check(`041 ${label}: accept button stays disabled until the Terms box is ticked`, before.disabled);
    check(`042 ${label}: Terms link points to the Private Beta Terms`, before.termsLink === "/beta-terms.html", before.termsLink);
    if (before.shown) {
      await page.locator("[data-production-auth-terms-accept]").check();
      await page.locator("[data-production-auth-terms-submit]").click();
    }
    const opened = await waitForWorkspaceAccess(page);
    check(`043 ${label}: accepting opens the workspace and the access gate admits the tester`, opened, `${page.url()} | ${navigations.join(" -> ")}`);
    check(`044 ${label}: account promoted to active by the server`, account.roles.includes(ACTIVE_ROLE), account.roles.join(","));
    check(`045 ${label}: never routed to the beta application`, !navigations.some(url => /beta-application/i.test(url)), navigations.join(" -> "));
    await context.close();
  }
}

// Seat states: an activated tester whose backend seat is missing (or whose beta is full) sees a
// specific state on the sign-in page, never the generic "not enabled" message or the application funnel.
if (!remoteBase) {
  for (const [seat, expected] of [["NOT_ADMITTED", /^Not admitted:/], ["BETA_FULL", /^Beta full:/]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const log = [];
    const account = { ...newAccount(), roles: [TENANT_ROLE, ACTIVE_ROLE], seat };
    await routeProduction(context, log, account);
    await context.addCookies([{ name: "nf_jwt", value: testJwt, domain: "goflipforge.com", path: "/", secure: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const navigations = [];
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await page.goto(`${SITE}/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /Not admitted|Beta full|not enabled/.test(document.querySelector("[data-production-auth-result]")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
    const state = await page.evaluate(() => ({
      result: document.querySelector("[data-production-auth-result]")?.textContent || "",
      terms: !document.querySelector("[data-production-auth-terms]")?.hidden,
      enter: !document.querySelector("[data-production-auth-return]")?.hidden,
    }));
    check(`050 ${seat}: sign-in shows the specific seat state`, expected.test(state.result) && !/not enabled/.test(state.result), state.result);
    check(`051 ${seat}: no Terms panel and no workspace entry are offered`, !state.terms && !state.enter, JSON.stringify(state));
    check(`052 ${seat}: never routed to the beta application`, !navigations.some(url => /beta-application/i.test(url)), navigations.join(" -> "));
    await context.close();
  }
}

await browser.close();

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) {
  console.log(`FAIL ${line}`);
  // Surface each failure as a check annotation so it is readable without the raw log.
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Invite activation audit::${line.replace(/[\r\n]+/g, " ").slice(0, 900)}`);
}
console.log(`\nInvite activation audit (${remoteBase ? `remote ${remoteBase}` : "local production simulation"}): ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
