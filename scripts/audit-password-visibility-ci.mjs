// Show/hide password button: Private Beta sign-in page and the invitation activation form, desktop and phone.
//
// Requests to https://goflipforge.com are served from the built repository (run `npm run build:identity` and
// `node scripts/inject-beta-invite-terms-gate.mjs` first). The homepage gets its real Content-Security-Policy from
// netlify.toml (style-src 'self'), so the button's stylesheet must load as a same-origin file. Identity is mocked
// with test values; nothing leaves the browser.
import { chromium } from "playwright";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { CREDENTIALS_MISMATCH } from "./lib/flipforge-auth-error-copy.mjs";

const root = process.cwd();
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const SITE = "https://goflipforge.com";
const TEST_VALUE = "ci-test-value-7Q";
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
const homepageCsp = toml.match(/for = "\/"[\s\S]*?Content-Security-Policy = "([^"]+)"/)?.[1];
if (!homepageCsp) throw new Error("Homepage Content-Security-Policy not found in netlify.toml");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

function localFile(pathname) {
  let file = path.join(root, decodeURIComponent(pathname));
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  return existsSync(file) ? file : null;
}

async function routeSite(context) {
  await context.route(/^https:\/\/(www\.)?goflipforge\.com\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/.netlify/identity/")) {
      const endpoint = url.pathname.slice("/.netlify/identity".length);
      if (endpoint === "/token") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant", error_description: "No user found with that email, or password invalid." }) });
      if (endpoint === "/settings") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ external: {}, disable_signup: true, autoconfirm: false }) });
      if (endpoint === "/user") return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/functions/")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const file = localFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: "" });
    const headers = { "content-type": types[path.extname(file)] || "application/octet-stream" };
    if (url.pathname === "/" || url.pathname === "/index.html") headers["content-security-policy"] = homepageCsp;
    return route.fulfill({ status: 200, headers, body: readFileSync(file) });
  });
}

const state = (page, selector) => page.evaluate(sel => {
  const input = document.querySelector(sel);
  const button = input?.parentElement?.querySelector("button.ff-password-toggle");
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  return input && button ? {
    type: input.type, value: input.value, id: input.id, ariaLabel: input.getAttribute("aria-label"),
    buttonLabel: button.getAttribute("aria-label"), pressed: button.getAttribute("aria-pressed"), controls: button.getAttribute("aria-controls"),
    buttonType: button.type, hidden: button.hidden, position: getComputedStyle(button).position, focused: document.activeElement === input,
    input: box(input), button: box(button), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  } : { missing: true, inputPresent: Boolean(input) };
}, selector);

const browser = await chromium.launch({ executablePath, args: ["--host-resolver-rules=MAP goflipforge.com 127.0.0.1"] });
try {
  for (const [label, viewport] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844 }]]) {
    // Sign-in page.
    {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
      await routeSite(context);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text()); });
      await page.goto(`${SITE}/production-auth.html`, { waitUntil: "load" });
      const sel = "[data-production-auth-password]";
      await page.waitForSelector(`${sel}[data-ff-password-toggle-ready]`, { timeout: 8000 }).catch(() => {});
      await page.waitForFunction(() => !document.querySelector("button.ff-password-toggle")?.hidden, null, { timeout: 6000 }).catch(() => {});
      let s = await state(page, sel);
      check(`${label} sign-in: one show/hide button beside the password field`, !s.missing && (await page.locator("button.ff-password-toggle").count()) === 1, JSON.stringify(s).slice(0, 120));
      check(`${label} sign-in: starts hidden, labelled "Show password", not pressed`, s.type === "password" && s.buttonLabel === "Show password" && s.pressed === "false");
      check(`${label} sign-in: button is type=button and controls the field`, s.buttonType === "button" && s.controls === s.id && Boolean(s.id));
      check(`${label} sign-in: field is still announced as "Password"`, s.ariaLabel === "Password", String(s.ariaLabel));
      check(`${label} sign-in: button sits inside the field, at least 44x44`, s.position === "absolute" && s.button.right <= s.input.right + 1 && s.button.left >= s.input.left && s.button.width >= 44 && s.button.height >= 44, JSON.stringify({ i: s.input, b: s.button }));
      await page.fill("[data-production-auth-email]", "nobody@flipforge.test");
      await page.click(sel);
      await page.keyboard.type(TEST_VALUE);
      await page.click("button.ff-password-toggle");
      s = await state(page, sel);
      check(`${label} sign-in: click shows the password and keeps the typed text and focus`, s.type === "text" && s.value === TEST_VALUE && s.focused && s.pressed === "true" && s.buttonLabel === "Hide password");
      await page.click("button.ff-password-toggle");
      s = await state(page, sel);
      check(`${label} sign-in: second click hides it again`, s.type === "password" && s.pressed === "false" && s.buttonLabel === "Show password");
      await page.focus(sel);
      await page.keyboard.press("Tab");
      const toggleFocused = await page.evaluate(() => document.activeElement?.classList.contains("ff-password-toggle"));
      await page.keyboard.press("Space");
      s = await state(page, sel);
      check(`${label} sign-in: keyboard Tab reaches the button and Space toggles it`, toggleFocused && s.type === "text");
      await page.focus(sel);
      await page.keyboard.press("Enter");
      s = await state(page, sel);
      check(`${label} sign-in: submitting while visible hides the password again`, s.type === "password" && s.pressed === "false");
      await page.waitForFunction(() => /don't match/.test(document.querySelector("[data-production-auth-status]")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
      const status = await page.textContent("[data-production-auth-status]");
      check(`${label} sign-in: sign-in still submits (mismatch message shown)`, status?.includes(CREDENTIALS_MISMATCH), status || "");
      check(`${label} sign-in: no horizontal page overflow`, s.overflow <= 1, `${s.overflow}px`);
      check(`${label} sign-in: no page or CSP errors`, errors.length === 0, errors.join(" | "));
      await context.close();
    }
    // Invitation activation (homepage, strict CSP): two independent fields.
    {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
      await routeSite(context);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text()); });
      await page.goto(`${SITE}/#invite_token=ci-invite-test-token-not-a-real-invitation`, { waitUntil: "load" });
      const pw = '#flipforge-identity-root input[name="password"]';
      const confirm = '#flipforge-identity-root input[name="confirmPassword"]';
      await page.waitForSelector(`${pw}[data-ff-password-toggle-ready]`, { timeout: 10000 }).catch(() => {});
      await page.waitForFunction(() => [...document.querySelectorAll("#flipforge-identity-root button.ff-password-toggle")].every(b => !b.hidden), null, { timeout: 6000 }).catch(() => {});
      const count = await page.locator("#flipforge-identity-root button.ff-password-toggle").count();
      check(`${label} invitation: both new-password fields have a show/hide button`, count === 2, String(count));
      let a = await state(page, pw);
      check(`${label} invitation: stylesheet applies under the homepage CSP (button positioned inside the field)`, a.position === "absolute" && a.button.right <= a.input.right + 1, a.position);
      check(`${label} invitation: fields keep their names ("New password", "Confirm password")`, a.ariaLabel === "New password" && (await state(page, confirm)).ariaLabel === "Confirm password");
      await page.fill(pw, TEST_VALUE);
      await page.locator("#flipforge-identity-root button.ff-password-toggle").first().click();
      a = await state(page, pw);
      const b = await state(page, confirm);
      check(`${label} invitation: each button toggles only its own field`, a.type === "text" && a.value === TEST_VALUE && b.type === "password");
      check(`${label} invitation: no horizontal page overflow`, a.overflow <= 1, `${a.overflow}px`);
      check(`${label} invitation: no page or CSP errors`, errors.length === 0, errors.join(" | "));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Password show/hide audit: ${passes.length} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);
