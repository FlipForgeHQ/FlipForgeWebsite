// "Stay in touch" email list: behaviour of the signup and operator export functions, plus the
// page wiring and disclosures. Runs in the Netlify build.
import fs from "node:fs";
import { createUpdatesSignupHandler, config as signupConfig } from "../netlify/modern-functions/updates-signup.mjs";
import { createUpdatesSubscribersHandler, config as exportConfig } from "../netlify/modern-functions/updates-subscribers.mjs";
import { UPDATES_CONSENT_TEXT, csvCell } from "../netlify/modern-functions/lib/updates-core.mjs";

class MemoryStore {
  constructor() { this.records = new Map(); }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) return { modified: false };
    this.records.set(key, structuredClone(value));
    return { modified: true, etag: "e" };
  }
  async get(key) { return this.records.has(key) ? structuredClone(this.records.get(key)) : null; }
  list({ prefix = "" } = {}) {
    const blobs = [...this.records.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key }));
    return { async *[Symbol.asyncIterator]() { yield { blobs, directories: [] }; } };
  }
  async delete(key) { this.records.delete(key); }
}

const results = [];
const check = (name, ok) => results.push([name, Boolean(ok)]);
const ORIGIN = "https://goflipforge.com";
const post = (body, { json = true, origin = ORIGIN, raw } = {}) => new Request(`${ORIGIN}/api/updates`, {
  method: "POST",
  headers: { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded", Accept: json ? "application/json" : "text/html", Origin: origin },
  body: raw ?? (json ? JSON.stringify(body) : new URLSearchParams(body).toString()),
});

const store = new MemoryStore();
let clock = new Date("2026-10-20T15:00:00Z");
const signup = createUpdatesSignupHandler({ store, now: () => clock });

let r = await signup(post({ email: "Collector@Example.com ", consent: true, source: "evidence-lab" }));
const keys = [...store.records.keys()];
const rec = store.records.get(keys[0]);
check("valid signup is accepted (202)", r.status === 202);
check("one record stored under a hashed key (no raw email in the key)", keys.length === 1 && /^email\/[0-9a-f]{64}\.json$/.test(keys[0]) && !keys[0].includes("example"));
check("email normalized; source, consent wording, version and time kept", rec.email === "collector@example.com" && rec.source === "evidence-lab"
  && rec.consentText === UPDATES_CONSENT_TEXT && rec.consentVersion === "2026-10-20" && rec.subscribedAt === "2026-10-20T15:00:00.000Z");

clock = new Date("2026-10-21T15:00:00Z");
r = await signup(post({ email: "collector@example.com", consent: true, source: "home" }));
check("repeat signup gets the same answer and does not overwrite the original consent", r.status === 202 && store.records.size === 1
  && store.records.get(keys[0]).subscribedAt === "2026-10-20T15:00:00.000Z");

r = await signup(post({ email: "new@example.com", consent: false }));
check("no consent is rejected and nothing stored", r.status === 400 && (await r.json()).fields.includes("consent") && store.records.size === 1);
r = await signup(post({ email: "not-an-email", consent: true }));
check("invalid email is rejected", r.status === 400 && (await r.json()).fields.includes("email"));
r = await signup(post({ email: "bot@example.com", consent: true, bot_field: "x" }));
check("honeypot gets a normal answer and stores nothing", r.status === 202 && store.records.size === 1);
r = await signup(post({ email: "x@example.com", consent: true }, { origin: "https://evil.example" }));
check("cross-origin post is refused", r.status === 403 && store.records.size === 1);
r = await signup(new Request(`${ORIGIN}/api/updates`));
check("GET is not allowed", r.status === 405);
r = await signup(post({}, { raw: JSON.stringify({ email: "a".repeat(3000) + "@x.com", consent: true }) }));
check("oversized body is refused", r.status === 413);
r = await signup(post({ email: "form@example.com", consent: "on", source: "article" }, { json: false }));
check("no-JavaScript form post stores and returns to the article", r.status === 303 && r.headers.get("location") === "/price-is-not-proof.html?updates=ok#stay-in-touch" && store.records.size === 2);
r = await signup(post({ email: "bad", source: "home" }, { json: false }));
check("invalid no-JavaScript post returns to the homepage with a message", r.status === 303 && r.headers.get("location") === "/?updates=invalid#stay-in-touch");
check("signup endpoint is rate limited", signupConfig.path === "/api/updates" && signupConfig.rateLimit?.windowLimit === 5);

await store.setJSON("email/" + "f".repeat(64) + ".json", { email: "=cmd()@example.com", subscribedAt: "2026-10-22T00:00:00.000Z", source: "home", consentVersion: "2026-10-20" });
const operator = { id: "op", appMetadata: { roles: ["flipforge-operator"] } };
const tester = { id: "t", appMetadata: { roles: ["flipforge-active"] } };
const exportAs = user => createUpdatesSubscribersHandler({ store, getUserFn: async () => user, now: () => new Date("2026-10-23T00:00:00Z") });
r = await exportAs(null)(new Request(`${ORIGIN}/api/updates/subscribers`));
check("export requires sign-in", r.status === 401);
r = await exportAs(tester)(new Request(`${ORIGIN}/api/updates/subscribers`));
check("export requires the operator role", r.status === 403);
r = await exportAs(operator)(new Request(`${ORIGIN}/api/updates/subscribers`));
const csv = await r.text();
check("operator gets a CSV download", r.status === 200 && /text\/csv/.test(r.headers.get("content-type")) && /attachment; filename="flipforge-email-list-2026-10-23.csv"/.test(r.headers.get("content-disposition")));
check("CSV lists every subscriber oldest first", csv.split("\r\n")[0] === "email,subscribed_at,source,consent_version" && csv.indexOf("collector@example.com") < csv.indexOf("form@example.com"));
check("CSV neutralizes spreadsheet formulas", csv.includes(`"'=cmd()@example.com"`) && csvCell("+1") === `"'+1"`);
r = await exportAs(operator)(new Request(`${ORIGIN}/api/updates/subscribers?email=Collector%40example.com`, { method: "DELETE", headers: { Origin: "https://evil.example" } }));
check("cross-origin removal is refused", r.status === 403 && store.records.size === 3);
r = await exportAs(operator)(new Request(`${ORIGIN}/api/updates/subscribers?email=Collector%40example.com`, { method: "DELETE", headers: { Origin: ORIGIN } }));
check("operator can remove an address (unsubscribe)", r.status === 200 && store.records.size === 2 && ![...store.records.values()].some(v => v.email === "collector@example.com"));
r = await exportAs(tester)(new Request(`${ORIGIN}/api/updates/subscribers?email=form%40example.com`, { method: "DELETE", headers: { Origin: ORIGIN } }));
check("non-operators cannot remove addresses", r.status === 403 && store.records.size === 2);
check("export path", exportConfig.path === "/api/updates/subscribers");

const read = p => fs.readFileSync(p, "utf8");
for (const [page, source] of [["index.html", "home"], ["learn.html", "evidence-lab"], ["price-is-not-proof.html", "article"]]) {
  const html = read(page);
  check(`${page}: form posts to /api/updates with source ${source}`, html.includes('data-ff-updates action="/api/updates" method="post"') && html.includes(`name="source" value="${source}"`));
  check(`${page}: consent is a required, unticked checkbox with the disclosed wording`, html.includes('<input type="checkbox" name="consent" required>') && html.includes(UPDATES_CONSENT_TEXT.replace("Unsubscribe anytime.", "")));
  check(`${page}: links the Privacy Policy and loads the script and styles`, html.includes('href="privacy.html#email-updates"') && html.includes("assets/js/updates-signup.js") && html.includes("assets/css/updates-signup-v1.css"));
  check(`${page}: has the bot trap`, html.includes('name="bot_field" tabindex="-1"'));
}
const privacy = read("privacy.html");
check("Privacy Policy discloses email updates and how to unsubscribe", privacy.includes('id="email-updates"') && /unsubscribe at any time/i.test(privacy) && /not sold/i.test(privacy));
check("Owner Hub offers the export and removal", read("owner.html").includes('href="/api/updates/subscribers" download') && read("owner.html").includes("data-ff-owner-unsubscribe"));

const failed = results.filter(([, ok]) => !ok);
for (const [name, ok] of results) if (!ok) console.error(`FAIL: ${name}`);
console.log(`UpdatesSignupValidation: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
