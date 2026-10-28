// Optional gateway request signing: contract, wiring and fail-closed behaviour.
//
// 1. The signer matches an independent re-implementation of the canonical string and fixed test vectors produced
//    with the backend verifier class (FlipForge2 SaaSRequestSignature, FFSIG1 / v1).
// 2. The API gateway, the runtime-identity probe and the beta seat-admission client sign the exact URL and body
//    bytes they send when FLIPFORGE_API_SIGNING_SECRET is set; a weak secret fails closed; an unset secret leaves
//    requests unchanged (no signing headers, string body).
// 3. Client-supplied X-FlipForge-Timestamp / Nonce / Signature headers are never forwarded.
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const signing = require("../../netlify/functions/request-signing.js");
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

const SECRET = "flipforge-gateway-signing-test-secret-0123456789";
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

// Independent re-implementation (deliberately not using the module under test).
function referenceSignature(secret, { method, path, query, timestamp, nonce, tenant, idempotency, bodyBytes }) {
  const text = ["FFSIG1", method.toUpperCase(), path, query ?? "", timestamp, nonce, tenant ?? "", idempotency ?? "",
    crypto.createHash("sha256").update(bodyBytes).digest("hex")].join("\n");
  return `v1=${crypto.createHmac("sha256", secret).update(Buffer.from(text, "utf8")).digest("hex")}`;
}

// Vectors generated with the backend verifier (SaaSRequestSignature.canonical + sign) using SECRET.
const JAVA_VECTORS = [
  { method: "POST", path: "/api/v1/evaluations", query: null, timestamp: "1792500000", nonce: "nonce-vector-000000000001", tenant: "tenant-a", idempotency: "idem-0001", body: "{\"a\":1}",
    expected: "v1=5415298727451feea211ee10dd21587ee0dbd0709a917c735746da28e3103ab3" },
  { method: "GET", path: "/api/v1/opportunities/abc:1", query: "limit=10&sort=rank", timestamp: "1792500001", nonce: "nonce_vector-000000000002", tenant: "beta-3f0c", idempotency: null, body: "",
    expected: "v1=7530519552fdd3d361a05a89db8087d6a01b872e332efce0865485be68fe9656" },
  { method: "PUT", path: "/api/v1/lifecycle/opp.42", query: null, timestamp: "1792500002", nonce: "Nonce-Vector-ABCDEFGHIJKLmnop", tenant: "beta-tenant-z", idempotency: null, body: "{\"note\":\"Ohtani “PSA 10” éè 🃏\"}",
    expected: "v1=c89fd16c28af898b35adebc42bd129b42af5cf3cb7b87083877b1866b0a291f6" },
  { method: "GET", path: "/api/v1/health", query: null, timestamp: "1792500003", nonce: "nonce-vector-000000000004", tenant: null, idempotency: null, body: "",
    expected: "v1=104bdb019d6bcd9a47249dbbd2baf7f1e2ec1febf7075749383ea635b643d340" },
];
for (const vector of JAVA_VECTORS) {
  const moduleSignature = signing.signature(SECRET, signing.canonical({
    method: vector.method, rawPath: vector.path, rawQuery: vector.query, timestamp: vector.timestamp, nonce: vector.nonce,
    tenantId: vector.tenant, idempotencyKey: vector.idempotency, body: vector.body,
  }));
  const reference = referenceSignature(SECRET, { ...vector, bodyBytes: Buffer.from(vector.body, "utf8") });
  check(moduleSignature === vector.expected, `module signature matches backend vector ${vector.method} ${vector.path}`);
  check(reference === vector.expected, `reference implementation matches backend vector ${vector.method} ${vector.path}`);
  const headers = signing.signingHeaders({ secret: SECRET, method: vector.method, url: `https://backend.invalid${vector.path}${vector.query ? `?${vector.query}` : ""}`,
    tenantId: vector.tenant, idempotencyKey: vector.idempotency, body: vector.body, now: Number(vector.timestamp) * 1000, nonce: vector.nonce });
  check(headers["X-FlipForge-Signature"] === vector.expected && headers["X-FlipForge-Timestamp"] === vector.timestamp && headers["X-FlipForge-Nonce"] === vector.nonce,
    `signingHeaders derives path, query and body from the request: ${vector.method} ${vector.path}`);
}
check(signing.signingConfig({}).enabled === false && signing.signingConfig({ FLIPFORGE_API_SIGNING_SECRET: "  " }).enabled === false,
  "signing is off when the secret is unset or blank");
check(signing.signingConfig({ FLIPFORGE_API_SIGNING_SECRET: "short-secret" }).ok === false, "a secret shorter than 32 characters fails closed");
const nonces = new Set(Array.from({ length: 50 }, () => signing.signingHeaders({ secret: SECRET, method: "GET", url: "https://b.invalid/x" })["X-FlipForge-Nonce"]));
check(nonces.size === 50 && [...nonces].every(value => NONCE.test(value)), "generated nonces are unique and match the backend nonce format");

// Gateway behaviour with a capturing fetch.
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const bodyBytes = init.body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(init.body) || init.body instanceof Uint8Array ? Buffer.from(init.body) : Buffer.from(String(init.body), "utf8");
  calls.push({ url: String(url), method: init.method || "GET", headers, body: init.body, bodyBytes });
  const href = String(url);
  if (href.endsWith("/api/v1/health")) {
    return new Response(JSON.stringify({ meta: { contractVersion: "1.0", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence", correlationId: headers["x-correlation-id"], runtimeBuildCommitVerified: true, runtimeBuildCommit: "0".repeat(40) }, data: { runtimeMode: "PRIVATE_HOSTED", status: "ready", transactionAuthority: false } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (href.includes("/controlled-pro-beta/admissions")) {
    return new Response(JSON.stringify({ accessGranted: false, admissionRequired: true, created: true, admittedCount: 1, maxTenants: 10 }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: { code: "TEST_BACKEND" } }), { status: 503, headers: { "content-type": "application/json" } });
};

process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
process.env.FLIPFORGE_API_BASE_URL = "https://backend.invalid";
process.env.FLIPFORGE_API_SERVICE_TOKEN = "service-token-for-validation-only-0000";
const { handler: gateway } = require("../../netlify/functions/flipforge-api.js");
const user = { app_metadata: { flipforge: { access: "active", tenantId: "beta-signing-check" } } };
const clientSigning = { "x-flipforge-timestamp": "1", "x-flipforge-nonce": "attacker-nonce-0000000001", "x-flipforge-signature": `v1=${"a".repeat(64)}` };
const event = (method, path, { query = "", body = "", headers = {} } = {}) => ({
  httpMethod: method, path, rawQuery: query, queryStringParameters: Object.fromEntries(new URLSearchParams(query)),
  headers: { host: "goflipforge.com", "x-correlation-id": "signing-check", ...headers }, multiValueHeaders: {}, body,
});

function verifyCall(call, label) {
  const target = new URL(call.url);
  const expected = referenceSignature(SECRET, {
    method: call.method, path: target.pathname, query: target.search.slice(1), timestamp: call.headers["x-flipforge-timestamp"],
    nonce: call.headers["x-flipforge-nonce"], tenant: call.headers["x-flipforge-tenant-id"], idempotency: call.headers["idempotency-key"], bodyBytes: call.bodyBytes,
  });
  const skew = Math.abs(Number(call.headers["x-flipforge-timestamp"]) - Date.now() / 1000);
  check(call.headers["x-flipforge-signature"] === expected, `${label}: signature verifies against the exact URL, tenant, idempotency key and body sent`);
  check(NONCE.test(call.headers["x-flipforge-nonce"] || "") && call.headers["x-flipforge-nonce"] !== clientSigning["x-flipforge-nonce"], `${label}: gateway nonce, not the client's`);
  check(/^\d{1,12}$/.test(call.headers["x-flipforge-timestamp"] || "") && skew < 5, `${label}: current unix-seconds timestamp`);
}

// Signing off (default): unchanged requests, client signing headers dropped.
delete process.env.FLIPFORGE_API_SIGNING_SECRET;
calls.length = 0;
await gateway(event("POST", "/api/v1/discover", { body: "{\"q\":\"x\"}", headers: clientSigning }), { clientContext: { user } });
check(calls.length === 1 && !Object.keys(calls[0].headers).some(name => /^x-flipforge-(timestamp|nonce|signature)$/.test(name)),
  "signing off: no signing headers, and client-supplied signing headers are not forwarded");
check(typeof calls[0]?.body === "string", "signing off: body is sent exactly as before");

// Signing on.
process.env.FLIPFORGE_API_SIGNING_SECRET = SECRET;
calls.length = 0;
await gateway(event("POST", "/api/v1/evaluations", { body: "{\"note\":\"é “PSA”\"}", headers: { ...clientSigning, "idempotency-key": "idem-signing-0001" } }), { clientContext: { user } });
await gateway(event("GET", "/api/v1/opportunities/abc:1", { query: "limit=10&sort=rank&q=a%20b", headers: clientSigning }), { clientContext: { user } });
await gateway(event("PUT", "/api/v1/lifecycle/opp.42", { body: "{\"status\":\"WATCHING\"}" }), { clientContext: { user } });
check(calls.length === 3, `gateway sent the three signed requests (${calls.length})`);
calls.forEach((call, index) => verifyCall(call, `gateway ${call.method} ${new URL(call.url).pathname}`));
check(calls[0]?.headers["x-flipforge-tenant-id"] === "beta-signing-check" && calls[0]?.headers["idempotency-key"] === "idem-signing-0001",
  "gateway signature covers the signed tenant and the idempotency key");
check(new Set(calls.map(call => call.headers["x-flipforge-nonce"])).size === calls.length, "each gateway request uses a new nonce");

// Weak secret fails closed before any upstream call.
process.env.FLIPFORGE_API_SIGNING_SECRET = "too-short";
calls.length = 0;
const weak = await gateway(event("GET", "/api/v1/portfolio"), { clientContext: { user } });
check(weak.statusCode === 503 && calls.length === 0, "a weak signing secret fails closed with no upstream call");

// Runtime-identity probe and seat-admission client.
process.env.FLIPFORGE_API_SIGNING_SECRET = SECRET;
calls.length = 0;
const { default: modernGateway } = await import("../../netlify/modern-functions/flipforge-api.mjs");
const identity = await modernGateway(new Request("https://goflipforge.com/api/v1/runtime-identity"), {});
check(identity.status === 200 && calls.length === 1, `runtime-identity probe succeeds with signing on (${identity.status})`);
if (calls[0]) verifyCall(calls[0], "runtime-identity GET /api/v1/health");
const { createAdmissionClient } = await import("../../netlify/modern-functions/lib/beta-admission-client.mjs");
calls.length = 0;
await createAdmissionClient().admit("beta-signing-check", "owner-hub:validator");
check(calls.length === 1, "seat-admission client sent one request");
if (calls[0]) {
  verifyCall(calls[0], "seat admission POST");
  check(!calls[0].headers["x-flipforge-tenant-id"], "seat admission still sends no tenant header (empty tenant is signed)");
}
process.env.FLIPFORGE_API_SIGNING_SECRET = "too-short";
let admissionClosed = false;
try { await createAdmissionClient().admit("beta-signing-check", "owner-hub:validator"); } catch (error) { admissionClosed = error?.message === "BETA_ADMISSION_UNAVAILABLE"; }
check(admissionClosed, "seat admission fails closed with a weak signing secret");

globalThis.fetch = realFetch;
delete process.env.FLIPFORGE_API_SIGNING_SECRET;

console.log("GatewayRequestSigningValidation");
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
