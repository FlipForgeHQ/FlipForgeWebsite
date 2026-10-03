// Behavioural checks for the API gateway's access-token renewal.
// Runs the real gateway module against a stubbed Netlify Identity endpoint.
import assert from "node:assert/strict";

const IDENTITY = "https://site.example/.netlify/identity";
const now = () => Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = exp => `${b64({ alg: "HS256" })}.${b64({ sub: "user-1", exp })}.sig`;
const USER = { id: "user-1", email: "qa@example.com", app_metadata: { roles: ["flipforge-active", "flipforge-tenant--qa1"] } };

let calls = [];
let identity = { tokenStatus: 200, userStatus: 200, rotations: 0, validRefresh: new Set(["r0"]) };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (href.startsWith(IDENTITY)) {
    calls.push(href.slice(IDENTITY.length));
    if (href.endsWith("/token")) {
      const params = new URLSearchParams(String(init.body || ""));
      const presented = params.get("refresh_token");
      await new Promise(resolve => setTimeout(resolve, 5));
      if (identity.tokenStatus !== 200 || !identity.validRefresh.has(presented)) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      identity.validRefresh.delete(presented); // GoTrue rotates refresh tokens
      identity.rotations += 1;
      const next = `r${identity.rotations}`;
      identity.validRefresh.add(next);
      return new Response(JSON.stringify({ access_token: jwt(now() + 3600), refresh_token: next }), { status: 200 });
    }
    if (href.endsWith("/user")) {
      const auth = new Headers(init.headers).get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      const exp = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString() || "{}").exp;
      if (identity.userStatus !== 200 || !exp || exp <= now()) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify(USER), { status: 200 });
    }
  }
  return new Response(JSON.stringify({ error: { code: "TEST_BACKEND" } }), { status: 503 });
};

globalThis.netlifyIdentityContext = { url: IDENTITY };
process.env.FLIPFORGE_SAAS_API_BASE_URL = process.env.FLIPFORGE_SAAS_API_BASE_URL || "";

const { default: gateway } = await import("../netlify/modern-functions/flipforge-api.mjs");

function cookieJar(initial) {
  const values = new Map(Object.entries(initial));
  const sets = [];
  const deletes = [];
  return {
    values, sets, deletes,
    get: name => values.get(name),
    set: cookie => { sets.push(cookie.name); values.set(cookie.name, cookie.value); },
    delete: name => { deletes.push(name); values.delete(name); }
  };
}

async function call(cookies) {
  globalThis.Netlify = { context: { cookies, url: "https://site.example" } };
  const request = new Request("https://site.example/api/v1/entitlements", {
    headers: { cookie: [...cookies.values].map(([k, v]) => `${k}=${v}`).join("; ") }
  });
  const started = performance.now();
  const response = await gateway(request, { cookies });
  const body = await response.text();
  return { status: response.status, body, ms: performance.now() - started };
}

const results = [];
async function check(name, fn) {
  calls = [];
  identity = { tokenStatus: 200, userStatus: 200, rotations: 0, validRefresh: new Set(["r0"]) };
  try { await fn(); results.push(`PASS | ${name}`); }
  catch (error) { results.push(`FAIL | ${name} | ${error.message}`); }
}

const authRequired = body => body.includes("AUTHENTICATION_REQUIRED");

await check("valid access token: no renewal call, normal verification", async () => {
  const jar = cookieJar({ nf_jwt: jwt(now() + 1800), nf_refresh: "r0" });
  const result = await call(jar);
  assert.equal(calls.includes("/token"), false);
  assert.deepEqual(jar.sets, []);
  assert.equal(authRequired(result.body), false, result.body);
});

await check("expired access token + valid refresh: renewed, verified, cookies rotated", async () => {
  const jar = cookieJar({ nf_jwt: jwt(now() - 30), nf_refresh: "r0" });
  const result = await call(jar);
  assert.deepEqual(calls, ["/token", "/user"]);
  assert.deepEqual(jar.sets, ["nf_jwt", "nf_refresh"]);
  assert.equal(jar.values.get("nf_refresh"), "r1");
  assert.equal(authRequired(result.body), false, result.body);
});

await check("missing access cookie + valid refresh: renewed", async () => {
  const jar = cookieJar({ nf_refresh: "r0" });
  const result = await call(jar);
  assert.equal(calls[0], "/token");
  assert.equal(authRequired(result.body), false, result.body);
});

await check("expired access + revoked/invalid refresh: fail closed, cookies untouched", async () => {
  const jar = cookieJar({ nf_jwt: jwt(now() - 30), nf_refresh: "revoked" });
  const result = await call(jar);
  assert.equal(result.status, 401, result.body);
  assert.ok(authRequired(result.body));
  assert.deepEqual(jar.sets, []);
  assert.deepEqual(jar.deletes, []);
});

await check("renewed token rejected by Identity /user: fail closed", async () => {
  identity.userStatus = 401;
  const jar = cookieJar({ nf_jwt: jwt(now() - 30), nf_refresh: "r0" });
  const result = await call(jar);
  assert.equal(result.status, 401, result.body);
  assert.deepEqual(jar.sets, []);
});

await check("no refresh cookie: unchanged anonymous behaviour", async () => {
  const jar = cookieJar({});
  const result = await call(jar);
  assert.equal(calls.includes("/token"), false);
  assert.equal(result.status, 401, result.body);
});

await check("forged access token cannot be renewed into access", async () => {
  const jar = cookieJar({ nf_jwt: "not.a.jwt", nf_refresh: "attacker-guess" });
  const result = await call(jar);
  assert.equal(result.status, 401, result.body);
});

await check("5 concurrent expired requests: exactly one rotation; losers fail closed without erasing the winner's cookies", async () => {
  const jars = Array.from({ length: 5 }, () => cookieJar({ nf_jwt: jwt(now() - 30), nf_refresh: "r0" }));
  const outcomes = await Promise.all(jars.map(jar => call(jar)));
  const winners = outcomes.filter(o => !authRequired(o.body)).length;
  assert.equal(identity.rotations, 1);
  assert.equal(winners, 1);
  for (const jar of jars) assert.deepEqual(jar.deletes, []);
});

await check("repeated calls after renewal reuse the new token (no further renewal)", async () => {
  const jar = cookieJar({ nf_jwt: jwt(now() - 30), nf_refresh: "r0" });
  await call(jar);
  calls = [];
  for (let i = 0; i < 5; i += 1) {
    const result = await call(jar);
    assert.equal(authRequired(result.body), false, result.body);
  }
  assert.equal(calls.includes("/token"), false);
  assert.equal(identity.rotations, 1);
});

globalThis.fetch = realFetch;
for (const line of results) console.log(line);
const failed = results.filter(line => line.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} gateway session-renewal checks passed.`);
if (failed) process.exit(1);
