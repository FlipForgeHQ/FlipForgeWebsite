// Operator window lock and Save changes (founder request 2026-10-28). Runs in the Netlify build.
//  1. Every operator API (beta operations, direct invites, email list) refuses a window that has not been unlocked
//     with the operator's password, even when the browser is signed in as the operator.
//  2. Unlock tokens are per window, bound to the account, expire after 30 idle minutes or 8 hours, and wrong
//     passwords are rate limited. The password itself is never stored.
//  3. The review note and beta start date (and feedback notes) save on their own without changing status.
//  4. The pages load the lock before any operator request, and the tester directory comes first.
import fs from "node:fs";
import { createBetaOperatorHandler } from "../netlify/modern-functions/beta-operator.mjs";
import { createFounderSelectedHandler } from "../netlify/modern-functions/beta-founder-select.mjs";
import { createUpdatesSubscribersHandler } from "../netlify/modern-functions/updates-subscribers.mjs";
import {
  OPERATOR_WINDOW_HEADER,
  UNLOCK_ATTEMPT_LIMIT,
  WINDOW_IDLE_MS,
  WINDOW_MAX_MS,
  createOperatorWindowGate,
  verifyPasswordWithIdentity,
} from "../netlify/modern-functions/lib/operator-window.mjs";

class MemoryStore {
  constructor() { this.records = new Map(); this.etags = new Map(); this.sequence = 0; }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) return { modified: false };
    if (options.onlyIfMatch && this.etags.get(key) !== options.onlyIfMatch) return { modified: false };
    const etag = `etag-${++this.sequence}`;
    this.records.set(key, structuredClone(value));
    this.etags.set(key, etag);
    return { modified: true, etag };
  }
  async get(key) { return this.records.has(key) ? structuredClone(this.records.get(key)) : null; }
  async getWithMetadata(key) { return this.records.has(key) ? { data: structuredClone(this.records.get(key)), etag: this.etags.get(key), metadata: {} } : null; }
  list({ prefix = "", paginate = false } = {}) {
    const result = { blobs: [...this.records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), directories: [] };
    if (!paginate) return Promise.resolve(result);
    return { async *[Symbol.asyncIterator]() { yield result; } };
  }
  async delete(key) { this.records.delete(key); this.etags.delete(key); }
}

let passed = 0;
const failures = [];
const check = (label, ok, detail = "") => { if (ok) passed += 1; else failures.push(`${label}${detail ? ` :: ${detail}` : ""}`); };

const ORIGIN = "https://goflipforge.com";
const PASSWORD = "correct horse battery staple (validation only)";
const operatorUser = { id: "op-1", email: "owner@example.com", app_metadata: { roles: ["flipforge-operator"] } };
const otherOperator = { id: "op-2", email: "second@example.com", app_metadata: { roles: ["flipforge-operator"] } };
let clock = new Date("2026-10-28T12:00:00Z");
const now = () => new Date(clock.getTime());
const verifyCalls = [];
const verifyPassword = async ({ origin, email, password }) => { verifyCalls.push({ origin, email }); return password === PASSWORD; };
const windowStore = new MemoryStore();
const gate = createOperatorWindowGate({ store: windowStore, now, verifyPassword });
const request = (path, { method = "GET", token, body, origin } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: {
    ...(token ? { [OPERATOR_WINDOW_HEADER]: token } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(origin ? { Origin: origin } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});
const unlockRequest = (password, extra = {}) => request("/api/beta/operator?window=unlock", { method: "POST", body: { password }, origin: ORIGIN, ...extra });

// ---------- Gate behaviour ----------
check("G01 a window without a token is locked", !(await gate.check(request("/api/beta/operator"), operatorUser)).ok);
check("G02 a made-up token is locked", !(await gate.check(request("/api/beta/operator", { token: "A".repeat(43) }), operatorUser)).ok);
const wrong = await gate.unlock(unlockRequest("nope"), operatorUser, "nope");
check("G03 a wrong password does not unlock", !wrong.ok && wrong.status === 401 && wrong.reason === "PASSWORD_INCORRECT");
check("G04 the password is checked against the signed-in operator's own email on this site", verifyCalls.at(-1)?.email === operatorUser.email && verifyCalls.at(-1)?.origin === ORIGIN);
const good = await gate.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
check("G05 the right password unlocks with a random 256-bit token", good.ok && /^[A-Za-z0-9_-]{43}$/.test(good.token));
const second = await gate.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
check("G06 each window gets its own token", second.ok && second.token !== good.token);
check("G07 the unlocked window passes", (await gate.check(request("/x", { token: good.token }), operatorUser)).ok);
check("G08 a token cannot be used by a different account, and that window is locked for good", !(await gate.check(request("/x", { token: second.token }), otherOperator)).ok
  && !(await gate.check(request("/x", { token: second.token }), operatorUser)).ok);
check("G09 the server keeps only a hash of the token and never the password",
  [...windowStore.records.keys()].every(key => !key.includes(good.token)) && !JSON.stringify([...windowStore.records.values()]).includes(PASSWORD)
  && !JSON.stringify([...windowStore.records.values()]).includes(good.token));
clock = new Date(clock.getTime() + WINDOW_IDLE_MS - 60_000);
check("G10 still unlocked after 29 minutes of activity gap", (await gate.check(request("/x", { token: good.token }), operatorUser)).ok);
clock = new Date(clock.getTime() + WINDOW_IDLE_MS + 60_000);
check("G11 locked again after more than 30 idle minutes", !(await gate.check(request("/x", { token: good.token }), operatorUser)).ok);
// Activity every 20 minutes still ends at 8 hours.
const long = await gate.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
let stillOpen = true;
for (let minutes = 20; minutes < WINDOW_MAX_MS / 60000; minutes += 20) {
  clock = new Date(clock.getTime() + 20 * 60000);
  stillOpen = stillOpen && (await gate.check(request("/x", { token: long.token }), operatorUser)).ok;
}
check("G12 regular activity keeps a window unlocked up to 8 hours", stillOpen);
clock = new Date(clock.getTime() + 25 * 60000);
check("G13 a window locks at 8 hours even with activity", !(await gate.check(request("/x", { token: long.token }), operatorUser)).ok);
const toLock = await gate.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
await gate.lock(request("/x", { token: toLock.token }));
check("G14 signing out locks the window on the server", !(await gate.check(request("/x", { token: toLock.token }), operatorUser)).ok);
// Rate limit
const limited = createOperatorWindowGate({ store: new MemoryStore(), now, verifyPassword });
let last = null;
for (let i = 0; i < UNLOCK_ATTEMPT_LIMIT; i += 1) last = await limited.unlock(unlockRequest("bad"), operatorUser, "bad");
const blocked = await limited.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
check("G15 five wrong passwords pause unlocking, even for the right password", last.reason === "PASSWORD_INCORRECT" && blocked.status === 429 && blocked.reason === "TOO_MANY_ATTEMPTS");
clock = new Date(clock.getTime() + 16 * 60000);
check("G16 unlocking works again after 15 minutes", (await limited.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD)).ok);
const unavailable = createOperatorWindowGate({ store: new MemoryStore(), now, verifyPassword: async () => { throw new Error("down"); } });
const down = await unavailable.unlock(unlockRequest(PASSWORD), operatorUser, PASSWORD);
check("G17 if the sign-in service is down the window stays locked", !down.ok && down.status === 503);
check("G18 an empty or oversized password is refused without checking", (await gate.unlock(unlockRequest(""), operatorUser, "")).status === 400
  && (await gate.unlock(unlockRequest("x"), operatorUser, "x".repeat(600))).status === 400);

// ---------- Netlify Identity password check ----------
const identityCalls = [];
const fakeIdentity = status => async (url, options) => {
  identityCalls.push({ url: String(url), options });
  if (String(url).endsWith("/logout")) return new Response(null, { status: 204 });
  return status === 200 ? Response.json({ access_token: "throwaway-access-token" }) : Response.json({ error: "invalid_grant" }, { status });
};
check("I01 Identity says the password is right: true, and the throwaway session is signed out",
  await verifyPasswordWithIdentity({ origin: ORIGIN, email: "owner@example.com", password: PASSWORD, fetchFn: fakeIdentity(200) })
  && identityCalls[0].url === `${ORIGIN}/.netlify/identity/token` && identityCalls[0].options.body.includes("grant_type=password")
  && identityCalls[1]?.url === `${ORIGIN}/.netlify/identity/logout` && identityCalls[1].options.headers.Authorization === "Bearer throwaway-access-token");
check("I02 Identity refuses the password: false", (await verifyPasswordWithIdentity({ origin: ORIGIN, email: "a@b.co", password: "x", fetchFn: fakeIdentity(400) })) === false);
let threw = false;
try { await verifyPasswordWithIdentity({ origin: ORIGIN, email: "a@b.co", password: "x", fetchFn: async () => { throw new TypeError("fetch failed"); } }); } catch { threw = true; }
check("I03 Identity unreachable: an error, never a pass", threw);
check("I04 an Identity server error is never treated as a correct password", await verifyPasswordWithIdentity({ origin: ORIGIN, email: "a@b.co", password: "x", fetchFn: fakeIdentity(500) }).then(() => false, () => true));

// ---------- Every operator API enforces it ----------
clock = new Date("2026-10-28T12:00:00Z");
const applicationStore = new MemoryStore();
const feedbackStore = new MemoryStore();
const identityAdmin = { listUsers: async () => [], getUser: async () => null };
const opHandler = (user = operatorUser) => createBetaOperatorHandler({ applicationStore, eventStore: new MemoryStore(), feedbackStore, getUserFn: async () => user,
  identityAdmin, inviteIdentity: async () => { throw new Error("not used"); }, admissionClient: { admit: async () => ({}), revoke: async () => null }, operatorWindow: gate, now });
const lockedGet = await opHandler()(request("/api/beta/operator"));
check("A01 signed-in operator, locked window: the dashboard is refused", lockedGet.status === 401 && (await lockedGet.json()).reason === "OPERATOR_WINDOW_LOCKED");
const lockedPost = await opHandler()(request("/api/beta/operator", { method: "POST", body: { action: "sync" }, origin: ORIGIN }));
check("A02 signed-in operator, locked window: actions are refused", lockedPost.status === 401);
const unlockResponse = await opHandler()(unlockRequest(PASSWORD));
const unlockBody = await unlockResponse.json();
check("A03 the operator page can unlock with the password", unlockResponse.status === 200 && unlockBody.unlocked === true && typeof unlockBody.token === "string"
  && unlockResponse.headers.get("cache-control") === "no-store");
const token = unlockBody.token;
check("A04 the unlocked window loads the dashboard", (await opHandler()(request("/api/beta/operator", { token }))).status === 200);
check("A05 unlock from another website is refused", (await opHandler()(unlockRequest(PASSWORD, { origin: "https://evil.example" }))).status === 403);
check("A06 a tester account cannot unlock", (await createBetaOperatorHandler({ applicationStore, eventStore: new MemoryStore(), feedbackStore,
  getUserFn: async () => ({ id: "t", email: "t@example.com", app_metadata: { roles: ["flipforge-active"] } }), operatorWindow: gate, now })(unlockRequest(PASSWORD))).status === 403);
check("A07 signed out: refused before any password check", (await createBetaOperatorHandler({ applicationStore, eventStore: new MemoryStore(), feedbackStore,
  getUserFn: async () => null, operatorWindow: gate, now })(unlockRequest(PASSWORD))).status === 401);
const wrongUnlock = await opHandler()(unlockRequest("wrong"));
check("A08 a wrong password gets a plain reason and no token", wrongUnlock.status === 401 && !("token" in (await wrongUnlock.json())));
const windowCheck = await opHandler()(request("/api/beta/operator?window=check", { method: "POST", token, origin: ORIGIN }));
const lockedCheck = await opHandler()(request("/api/beta/operator?window=check", { method: "POST", origin: ORIGIN }));
check("A09 the Owner Hub can ask whether its window is unlocked", windowCheck.status === 200 && lockedCheck.status === 401);
const founder = createFounderSelectedHandler({ store: applicationStore, getUserFn: async () => operatorUser, operatorWindow: gate, now });
const founderLocked = await founder(request("/api/beta/founder-select", { method: "POST", body: { fullName: "Test Person", email: "t@example.com", cohort: "start-2026-10-28" }, origin: ORIGIN }));
check("A10 direct invites refuse a locked window before reading anything", founderLocked.status === 401 && (await founderLocked.json()).reason === "OPERATOR_WINDOW_LOCKED");
const listStore = new MemoryStore();
await listStore.setJSON("email/x.json", { email: "subscriber@example.com", subscribedAt: "2026-10-01T00:00:00Z", source: "home", consentVersion: "v1" });
const exportList = createUpdatesSubscribersHandler({ store: listStore, getUserFn: async () => operatorUser, operatorWindow: gate, now });
const exportLocked = await exportList(request("/api/updates/subscribers"));
const exportLockedText = await exportLocked.text();
check("A11 the email list download refuses a locked window and shows no addresses", exportLocked.status === 401 && !exportLockedText.includes("subscriber@example.com"));
const exportOpen = await exportList(request("/api/updates/subscribers", { token }));
check("A12 the unlocked window can download the email list", exportOpen.status === 200 && (await exportOpen.text()).includes("subscriber@example.com"));
check("A13 removing an address also needs an unlocked window", (await exportList(request("/api/updates/subscribers?email=subscriber%40example.com", { method: "DELETE", origin: ORIGIN }))).status === 401
  && listStore.records.size === 1);
const defaults = ["beta-operator.mjs", "beta-founder-select.mjs", "updates-subscribers.mjs"].map(name => fs.readFileSync(`netlify/modern-functions/${name}`, "utf8"));
check("A14 all three operator functions lock by default (no opt-out in production)", defaults.every(source => source.includes("operatorWindow = createOperatorWindowGate()")
  && /operatorWindow\.check\(request, user\)/.test(source)));

// ---------- Save changes ----------
const appId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
await applicationStore.setJSON(`application/${appId}.json`, { id: appId, version: 3, status: "UNDER_REVIEW", cohort: null, reviewNote: "", applicant: { email: "a@example.com" }, history: [] });
const save = await opHandler()(request("/api/beta/operator", { method: "POST", token, origin: ORIGIN,
  body: { action: "save-review", applicationId: appId, expectedVersion: 3, cohort: "start-2026-11-02", note: "Strong fit. Follow up Monday." } }));
const saved = (await save.json()).application;
check("S01 Save changes stores the note and start date without changing status", save.status === 200 && saved.status === "UNDER_REVIEW"
  && saved.reviewNote === "Strong fit. Follow up Monday." && saved.cohort === "start-2026-11-02" && saved.version === 4 && saved.history.at(-1).type === "REVIEW_SAVED");
const keep = await opHandler()(request("/api/beta/operator", { method: "POST", token, origin: ORIGIN,
  body: { action: "save-review", applicationId: appId, expectedVersion: 4, cohort: "", note: "Updated note" } }));
const kept = (await keep.json()).application;
check("S02 leaving the date blank keeps the existing start date", kept.cohort === "start-2026-11-02" && kept.reviewNote === "Updated note");
check("S03 a stale page cannot overwrite a newer save", (await opHandler()(request("/api/beta/operator", { method: "POST", token, origin: ORIGIN,
  body: { action: "save-review", applicationId: appId, expectedVersion: 4, note: "old" } }))).status === 409);
await applicationStore.setJSON(`application/${appId}.json`, { ...kept, status: "REMOVED" });
const removedSave = await opHandler()(request("/api/beta/operator", { method: "POST", token, origin: ORIGIN,
  body: { action: "save-review", applicationId: appId, expectedVersion: 5, note: "x" } }));
check("S04 removed records stay read-only", removedSave.status === 409 && (await removedSave.json()).reason === "APPLICATION_ALREADY_REMOVED");
const feedbackId = "2c9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bee";
await feedbackStore.setJSON(`feedback/${feedbackId}.json`, { id: feedbackId, version: 1, status: "RESOLVED", reviewNote: "", feedback: {}, history: [] });
const feedbackSave = await opHandler()(request("/api/beta/operator", { method: "POST", token, origin: ORIGIN,
  body: { action: "feedback-save-note", feedbackId, expectedVersion: 1, note: "Shipped fix in #585" } }));
const savedFeedback = (await feedbackSave.json()).feedback;
check("S05 feedback notes save without changing status", feedbackSave.status === 200 && savedFeedback.status === "RESOLVED" && savedFeedback.reviewNote === "Shipped fix in #585" && savedFeedback.version === 2);
check("S06 saving needs an unlocked window too", (await opHandler()(request("/api/beta/operator", { method: "POST", origin: ORIGIN,
  body: { action: "feedback-save-note", feedbackId, expectedVersion: 2, note: "x" } }))).status === 401);

// ---------- Pages ----------
const read = path => fs.readFileSync(path, "utf8");
const operatorPage = read("operator-beta.html");
const ownerPage = read("owner.html");
const lockJs = read("assets/js/operator-window-lock.js");
const operatorJs = read("assets/js/beta-operator.js");
const identityClient = read("scripts/lib/flipforge-identity-client.mjs");
const emailListJs = read("assets/js/owner-email-list.js");
const netlify = read("netlify.toml");
const lockScript = /<script src="\/assets\/js\/operator-window-lock\.js\?v=[\w-]+"><\/script>/;
const identityScript = '<script src="/assets/js/flipforge-identity.js"></script>';
for (const [name, page] of [["operator page", operatorPage], ["Owner Hub", ownerPage]]) {
  const lockAt = page.search(lockScript);
  const firstDeferred = page.search(/<script [^>]*defer><\/script>/);
  check(`P01 ${name} loads the lock right after sign-in and before any operator script`, lockAt > page.indexOf(identityScript) && page.indexOf(identityScript) > 0
    && (firstDeferred === -1 || lockAt < firstDeferred) && !/operator-window-lock\.js[^"]*"[^>]*\b(defer|async)\b/.test(page));
  check(`P02 ${name} links the lock styles`, /href="\/assets\/css\/operator-window-lock\.css\?v=[\w-]+"/.test(page));
}
check("P03 the token lives only in this tab's sessionStorage, and the password is never stored by the page",
  lockJs.includes("sessionStorage") && !/localStorage|document\.cookie/.test(lockJs) && !/setItem\([^)]*password/i.test(lockJs));
check("P04 the lock adds the token to exactly the three operator APIs",
  ['"/api/beta/operator"', '"/api/beta/founder-select"', '"/api/updates/subscribers"'].every(path => lockJs.includes(path)) && lockJs.includes('"X-FlipForge-Operator-Window"'));
check("P05 the password prompt uses a password field the browser can fill, with sign out as the only other way out",
  lockJs.includes('autocomplete="current-password"') && lockJs.includes('type="password"') && lockJs.includes("data-window-lock-sign-out"));
check("P06 signing in on an operator page also unlocks that window, and signing out locks it first",
  identityClient.includes("windowLock.unlock(password)") && identityClient.includes("windowLock?.hold?.()")
  && (identityClient.match(/FlipForgeOperatorWindow\?\.lock\?\.\(\)/g) || []).length === 2);
check("P07 the email list downloads with the window token (fetch, not a bare link)", emailListJs.includes("data-ff-owner-export") && emailListJs.includes("URL.createObjectURL")
  && ownerPage.includes('href="/api/updates/subscribers" download data-ff-owner-export'));
check("P08 the lock script is never cached", /for = "\/assets\/js\/operator-window-lock\.js"\s*\n\s*\[headers\.values\]\s*\n\s*Cache-Control = "no-store, max-age=0, must-revalidate"/.test(netlify));
check("P09 server logs never include the password or token", !/console\.(log|error|warn)/.test(read("netlify/modern-functions/lib/operator-window.mjs")));

// Save button and page order
check("P10 Save changes button with a Saved confirmation, separate from the status buttons",
  operatorJs.includes('kind==="review"?"Save changes":"Save note"') && operatorJs.includes('action:"save-review"') && operatorJs.includes('action:"feedback-save-note"')
  && operatorJs.includes("Saved ") && operatorJs.includes("Unsaved changes") && operatorJs.includes("ff-review-status-label"));
const at = marker => operatorPage.indexOf(marker);
check("P11 the tester directory comes first, then feedback, the invite form, and the numbers",
  at('id="applications-heading"') > 0 && at('id="applications-heading"') < at('id="feedback-heading"') && at('id="feedback-heading"') < at("data-founder-select-anchor")
  && at("data-founder-select-anchor") < at('id="numbers-heading"') && at('id="numbers-heading"') < at('data-metric="total"')
  && at('data-metric="total"') < at('id="funnel-heading"') && at('id="funnel-heading"') < at('id="cdi-learning-heading"'));
check("P12 jump links at the top reach every section", ["#applications-heading", "#feedback-heading", "#invite-heading", "#numbers-heading"].every(href => at(`href="${href}"`) > 0 && at(`href="${href}"`) < at('id="applications-heading"'))
  && read("assets/js/beta-founder-select.js").includes('id="invite-heading"') && read("assets/js/beta-founder-select.js").includes("[data-founder-select-anchor]"));

if (failures.length) { for (const failure of failures) console.log(`FAIL ${failure}`); console.log(`Operator window lock validation: ${passed}/${passed + failures.length}`); process.exit(1); }
console.log(`Operator window lock validation passed: ${passed}/${passed}`);
