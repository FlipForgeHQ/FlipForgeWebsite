// Private Beta seat admission: Owner Hub invite -> backend seat -> activation lifecycle.
// No network. A stateful in-memory backend stands in for the FlipForge2 operator admission route and
// enforces a seat cap; the real admission client, Owner Hub handler and customer gateway are exercised.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createBetaOperatorHandler } from "../netlify/modern-functions/beta-operator.mjs";
import { ADMISSION_ROUTE, BetaAdmissionError, createAdmissionClient } from "../netlify/modern-functions/lib/beta-admission-client.mjs";
import { applicationKey } from "../netlify/modern-functions/lib/beta-operations-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

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

// ---------- Stateful mock of POST /api/v1/operator/controlled-pro-beta/admissions ----------
const SERVICE_TOKEN = "service-token-for-validation-only-0123456789";
const backend = { cap: 2, seats: new Map(), calls: [], down: false, timeline: [] };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const admitted = () => [...backend.seats.values()].filter(value => value.status === "ADMITTED").length;
async function backendFetch(url, options) {
  const body = JSON.parse(options.body);
  backend.calls.push({ url, options, body });
  backend.timeline.push(`seat:${body.action}:${body.tenantId}`);
  if (backend.down) throw new TypeError("fetch failed");
  if (options.headers.Authorization !== `Bearer ${SERVICE_TOKEN}`) return json(401, { error: { code: "UNAUTHORIZED" } });
  if (options.headers["X-FlipForge-Tenant-Id"]) return json(403, { error: { code: "OPERATOR_ROUTE_REJECTS_CUSTOMER_CONTEXT" } });
  const envelope = extra => ({ gateEnabled: true, maxTenants: backend.cap, admittedCount: admitted(), accessGranted: false,
    admission: backend.seats.has(body.tenantId) ? { status: backend.seats.get(body.tenantId).status, tenantAuditKey: "auditkey0001" } : null, ...extra });
  const seat = backend.seats.get(body.tenantId);
  if (body.action === "admit") {
    if (seat?.status === "ADMITTED") return json(200, envelope({ admissionRequired: true, created: false }));
    if (admitted() >= backend.cap) {
      return json(409, { error: { code: "CONTROLLED_PRO_BETA_CAPACITY_REACHED", betaFull: true, admittedCount: admitted(), maxTenants: backend.cap, accessGranted: false } });
    }
    backend.seats.set(body.tenantId, { status: "ADMITTED" });
    return json(200, envelope({ admissionRequired: true, created: true }));
  }
  if (body.action === "revoke") {
    if (!seat) return json(200, envelope({ found: false, changed: false }));
    const changed = seat.status === "ADMITTED";
    seat.status = "REVOKED";
    return json(200, envelope({ found: true, changed }));
  }
  return json(200, envelope({}));
}

// ---------- A. Admission client ----------
{
  let called = false;
  const unconfigured = createAdmissionClient({ env: {}, fetchFn: async () => { called = true; return json(200, {}); } });
  let code = "";
  try { await unconfigured.admit("beta-tenant-a", "owner-hub:op"); } catch (error) { code = error.message; }
  check("A01 missing backend settings fail closed without any request", code === "BETA_ADMISSION_UNAVAILABLE" && !called);

  const client = createAdmissionClient({ env: { FLIPFORGE_API_BASE_URL: "https://backend.invalid/", FLIPFORGE_API_SERVICE_TOKEN: SERVICE_TOKEN }, fetchFn: backendFetch });
  backend.calls.length = 0;
  const first = await client.admit("beta-client-a", "owner-hub:op-1");
  const sent = backend.calls[0];
  check("A02 calls only the private operator admission route with POST", sent.url === `https://backend.invalid${ADMISSION_ROUTE}` && sent.options.method === "POST" && sent.options.redirect === "error");
  check("A03 sends service token and operator id, never a customer tenant header",
    sent.options.headers.Authorization === `Bearer ${SERVICE_TOKEN}` && sent.options.headers["X-FlipForge-Operator-Id"] === "owner-hub:op-1"
      && !Object.keys(sent.options.headers).some(key => key.toLowerCase() === "x-flipforge-tenant-id"));
  check("A04 admit returns created seat and never claims access", first.created && first.status === "ADMITTED" && first.gateEnabled);
  const again = await client.admit("beta-client-a", "owner-hub:op-1");
  check("A05 repeat admit is idempotent", !again.created && admitted() === 1);
  await client.admit("beta-client-b", "owner-hub:op-1");
  let full = null;
  try { await client.admit("beta-client-c", "owner-hub:op-1"); } catch (error) { full = error; }
  check("A06 capacity maps to BETA_FULL with seat counts", full instanceof BetaAdmissionError && full.message === "BETA_FULL" && full.details.admittedCount === 2 && full.details.maxTenants === 2);
  backend.down = true;
  let down = "";
  try { await client.admit("beta-client-c", "owner-hub:op-1"); } catch (error) { down = error.message; }
  backend.down = false;
  check("A07 network failure fails closed", down === "BETA_ADMISSION_UNAVAILABLE");
  const lying = createAdmissionClient({ env: { FLIPFORGE_API_BASE_URL: "https://backend.invalid", FLIPFORGE_API_SERVICE_TOKEN: SERVICE_TOKEN },
    fetchFn: async () => json(200, { accessGranted: true, created: true }) });
  let lyingCode = "";
  try { await lying.admit("beta-client-d", "owner-hub:op-1"); } catch (error) { lyingCode = error.message; }
  check("A08 a response claiming access is rejected", lyingCode === "BETA_ADMISSION_UNAVAILABLE");
  const wrongToken = createAdmissionClient({ env: { FLIPFORGE_API_BASE_URL: "https://backend.invalid", FLIPFORGE_API_SERVICE_TOKEN: "wrong-token-value-wrong-token-value" }, fetchFn: backendFetch });
  let wrongCode = "";
  try { await wrongToken.admit("beta-client-e", "owner-hub:op-1"); } catch (error) { wrongCode = error.message; }
  check("A09 unauthorized backend response fails closed", wrongCode === "BETA_ADMISSION_UNAVAILABLE");
  backend.seats.clear();
}

// ---------- B. Owner Hub lifecycle ----------
const store = new MemoryStore();
const now = () => new Date("2026-10-06T23:00:00.000Z");
const identityUsers = [];
const identityAdmin = {
  async listUsers() { return identityUsers.map(value => structuredClone(value)); },
  async updateUser(id, attributes) {
    const user = identityUsers.find(value => value.id === id);
    user.appMetadata = structuredClone(attributes.app_metadata);
    user.userMetadata = structuredClone(attributes.user_metadata);
    user.roles = structuredClone(attributes.app_metadata.roles);
    backend.timeline.push(`identity:update:${id}`);
    return structuredClone(user);
  },
  async deleteUser(id) {
    backend.timeline.push(`identity:delete:${id}`);
    identityUsers.splice(identityUsers.findIndex(value => value.id === id), 1);
  },
};
const emailsSent = [];
const failingInvites = new Set();
const concurrentEditAfterEmail = new Map();
const inviteIdentity = async (email, fullName) => {
  backend.timeline.push(`email:${email}`);
  if (failingInvites.has(email)) throw new Error("IDENTITY_INVITE_FAILED");
  if (concurrentEditAfterEmail.has(email)) {
    // Another operator session edits the record after the email is sent, so the final write conflicts.
    const key = concurrentEditAfterEmail.get(email);
    const current = await store.get(key);
    await store.setJSON(key, { ...current, version: Number(current.version) + 1 });
  }
  emailsSent.push(email);
  const user = { id: `identity-${identityUsers.length + 1}-${email.split("@")[0]}`, email, invitedAt: now().toISOString(), roles: [], userMetadata: { full_name: fullName }, appMetadata: { provider: "email", roles: [] } };
  identityUsers.push(user);
  return structuredClone(user);
};
const operatorUser = { id: "4b7c3f0e-operator", email: "owner@example.com", roles: ["flipforge-operator"] };
const admissionClient = createAdmissionClient({ env: { FLIPFORGE_API_BASE_URL: "https://backend.invalid", FLIPFORGE_API_SERVICE_TOKEN: SERVICE_TOKEN }, fetchFn: backendFetch });
const operator = createBetaOperatorHandler({ applicationStore: store, eventStore: new MemoryStore(), feedbackStore: new MemoryStore(),
  getUserFn: async () => operatorUser, identityAdmin, inviteIdentity, admissionClient, now });
const post = body => operator(new Request("https://goflipforge.com/api/beta/operator", {
  method: "POST", headers: { origin: "https://goflipforge.com", "content-type": "application/json" }, body: JSON.stringify(body) }));

async function founderSelected(name) {
  const id = crypto.randomUUID();
  const application = {
    id, version: 1, schemaVersion: 1, status: "APPROVED", cohort: "wave-1-sep-2026", selectionSource: "FOUNDER_SELECTED",
    submittedAt: now().toISOString(), updatedAt: now().toISOString(), termsAcceptance: null,
    applicant: { fullName: `Tester ${name}`, email: `${name}@example.com`, betaTermsAccepted: false },
    history: [{ type: "FOUNDER_SELECTED", at: now().toISOString(), actor: "operator" }],
  };
  await store.setJSON(applicationKey(id), application);
  return application;
}
const load = async application => store.get(applicationKey(application.id));
const tenantOf = application => `beta-${application.id}`;
const logs = [];
const originalLog = console.log;
console.log = value => logs.push(String(value));

backend.cap = 2;
backend.timeline.length = 0;
const alpha = await founderSelected("alpha");
let response = await post({ action: "invite", applicationId: alpha.id, expectedVersion: alpha.version });
let alphaRecord = (await response.json()).application;
const alphaUser = identityUsers.find(user => user.email === "alpha@example.com");
check("B01 invite reserves the backend seat before the invitation email is sent",
  response.status === 200 && backend.timeline.indexOf(`seat:admit:${tenantOf(alpha)}`) >= 0
    && backend.timeline.indexOf(`seat:admit:${tenantOf(alpha)}`) < backend.timeline.indexOf("email:alpha@example.com"));
check("B02 invited application records the reserved seat", alphaRecord.status === "INVITE_SENT" && alphaRecord.betaAdmission?.status === "ADMITTED"
  && alphaRecord.history.some(entry => entry.type === "BETA_SEAT_RESERVED") && backend.seats.get(tenantOf(alpha))?.status === "ADMITTED");
check("B03 admission alone grants no active access: Identity is terms-pending, never flipforge-active",
  alphaUser.roles.includes("flipforge-terms-pending") && !alphaUser.roles.includes("flipforge-active") && alphaUser.appMetadata.flipforge.access === "terms_pending");

response = await post({ action: "resend-invite", applicationId: alpha.id, expectedVersion: alphaRecord.version });
alphaRecord = (await response.json()).application;
check("B04 reset & resend re-confirms the same seat without taking another", response.status === 200 && admitted() === 1
  && alphaRecord.history.some(entry => entry.type === "BETA_SEAT_CONFIRMED"));

const bravo = await founderSelected("bravo");
response = await post({ action: "invite", applicationId: bravo.id, expectedVersion: bravo.version });
check("B05 second invite uses the second of two seats", response.status === 200 && admitted() === 2);

const charlie = await founderSelected("charlie");
const emailsBeforeFull = emailsSent.length;
response = await post({ action: "invite", applicationId: charlie.id, expectedVersion: charlie.version });
const fullPayload = await response.json();
const charlieAfterFull = await load(charlie);
check("B06 full beta blocks the invitation with a specific Beta full reason and seat counts",
  response.status === 409 && fullPayload.reason === "BETA_FULL" && fullPayload.seatsUsed === 2 && fullPayload.seatLimit === 2);
check("B07 Beta full sends no email, reserves nothing and leaves the tester approved",
  emailsSent.length === emailsBeforeFull && !backend.seats.has(tenantOf(charlie)) && charlieAfterFull.status === "APPROVED"
    && charlieAfterFull.invitationAttempt === null && !identityUsers.some(user => user.email === "charlie@example.com"));

backend.down = true;
response = await post({ action: "invite", applicationId: charlie.id, expectedVersion: charlieAfterFull.version });
const downPayload = await response.json();
backend.down = false;
check("B08 unreachable seat service fails closed: 503, no email, still approved",
  response.status === 503 && downPayload.reason === "BETA_ADMISSION_UNAVAILABLE" && emailsSent.length === emailsBeforeFull
    && (await load(charlie)).status === "APPROVED");

// Cancel (remove) while the seat service is down: nothing changes.
alphaRecord = await load(alpha);
backend.down = true;
response = await post({ action: "remove", applicationId: alpha.id, expectedVersion: alphaRecord.version });
backend.down = false;
const alphaAfterFailedRemove = await load(alpha);
const alphaUserAfterFailedRemove = identityUsers.find(user => user.email === "alpha@example.com");
check("B09 cancellation fails closed when the seat cannot be released: no Identity change, seat kept",
  response.status === 503 && alphaAfterFailedRemove.status === "INVITE_SENT" && alphaAfterFailedRemove.removalAttempt === null
    && alphaUserAfterFailedRemove.roles.includes("flipforge-terms-pending") && backend.seats.get(tenantOf(alpha)).status === "ADMITTED");

backend.timeline.length = 0;
response = await post({ action: "remove", applicationId: alpha.id, expectedVersion: alphaAfterFailedRemove.version });
const alphaRemoved = (await response.json()).application;
check("B10 cancelling an invitation releases the seat before removing Identity membership",
  response.status === 200 && alphaRemoved.status === "REMOVED" && backend.seats.get(tenantOf(alpha)).status === "REVOKED"
    && backend.timeline.indexOf(`seat:revoke:${tenantOf(alpha)}`) < backend.timeline.findIndex(entry => entry.startsWith("identity:update:"))
    && alphaRemoved.betaAdmission?.status === "REVOKED" && alphaRemoved.history.some(entry => entry.type === "BETA_SEAT_RELEASED"));
check("B11 released seat frees capacity for the next invitation", admitted() === 1);

const charlieReady = await load(charlie);
response = await post({ action: "invite", applicationId: charlie.id, expectedVersion: charlieReady.version });
check("B12 the previously blocked tester can now be invited", response.status === 200 && backend.seats.get(tenantOf(charlie))?.status === "ADMITTED");

// Invitation email fails after the seat was created: only that new seat is released.
const delta = await founderSelected("delta");
backend.cap = 4;
failingInvites.add("delta@example.com");
response = await post({ action: "invite", applicationId: delta.id, expectedVersion: delta.version });
failingInvites.delete("delta@example.com");
check("B13 failed invitation releases only the seat it created and leaves the tester approved",
  response.status === 502 && backend.seats.get(tenantOf(delta))?.status === "REVOKED" && (await load(delta)).status === "APPROVED"
    && backend.seats.get(tenantOf(charlie)).status === "ADMITTED");

// Email already sent, then the record write conflicts: the seat must be kept for the invited tester.
const foxtrot = await founderSelected("foxtrot");
concurrentEditAfterEmail.set("foxtrot@example.com", applicationKey(foxtrot.id));
response = await post({ action: "invite", applicationId: foxtrot.id, expectedVersion: foxtrot.version });
concurrentEditAfterEmail.delete("foxtrot@example.com");
check("B13b a seat whose invitation email was already sent is never released by a later failure",
  response.status === 409 && emailsSent.includes("foxtrot@example.com") && backend.seats.get(tenantOf(foxtrot))?.status === "ADMITTED");

// Never-invited tester removal does not touch the seat service.
const echo = await founderSelected("echo");
backend.calls.length = 0;
response = await post({ action: "remove", applicationId: echo.id, expectedVersion: echo.version });
check("B14 removing a never-invited tester makes no seat call", response.status === 200 && backend.calls.length === 0);

// Permanent test-user delete releases the seat first.
const bravoRecord = await load(bravo);
backend.timeline.length = 0;
response = await post({ action: "delete-test-user", applicationId: bravo.id, expectedVersion: bravoRecord.version, confirmEmail: "bravo@example.com" });
check("B15 permanent test-user delete releases the seat before deleting Identity",
  response.status === 200 && backend.seats.get(tenantOf(bravo)).status === "REVOKED"
    && backend.timeline.indexOf(`seat:revoke:${tenantOf(bravo)}`) < backend.timeline.findIndex(entry => entry.startsWith("identity:delete:")));

const customer = createBetaOperatorHandler({ applicationStore: store, eventStore: new MemoryStore(), feedbackStore: new MemoryStore(),
  getUserFn: async () => ({ id: "customer", roles: ["flipforge-active", "flipforge-tenant--beta-x"] }), identityAdmin, inviteIdentity, admissionClient, now });
backend.calls.length = 0;
const customerResponse = await customer(new Request("https://goflipforge.com/api/beta/operator", {
  method: "POST", headers: { origin: "https://goflipforge.com", "content-type": "application/json" },
  body: JSON.stringify({ action: "invite", applicationId: delta.id, expectedVersion: 1 }) }));
check("B16 a customer account cannot reach seat admission through the Owner Hub", customerResponse.status === 403 && backend.calls.length === 0);
check("B17 operator id is the Netlify user id, never an email", backend.calls.every(call => !String(call.options.headers["X-FlipForge-Operator-Id"]).includes("@")));
console.log = originalLog;
check("B18 operation logs contain no tester emails", logs.every(line => !/@example\.com/.test(line)));

// ---------- C. Customer gateway passes only allowlisted seat reasons ----------
{
  const require = createRequire(import.meta.url);
  const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-backend.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = SERVICE_TOKEN;
  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";
  let upstreamReason = "NOT_ADMITTED";
  const upstreamUrls = [];
  globalThis.fetch = async url => {
    upstreamUrls.push(String(url));
    return json(403, { error: { code: "ENTITLEMENT_ACCESS_DENIED", message: "x", reason: upstreamReason } });
  };
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);
  const call = async route => {
    const result = await handler({
      httpMethod: "GET", path: `/.netlify/functions/flipforge-api${route}`,
      headers: { host: "deploy-preview-1--goflipforge.netlify.app", origin: "https://deploy-preview-1--goflipforge.netlify.app", "x-correlation-id": "seat-check" },
      multiValueHeaders: {}, queryStringParameters: {},
    }, { clientContext: { user: { email: "t@example.com", app_metadata: { flipforge: { access: "active", tenantId: "beta-gateway-check" } } } } });
    return { status: result.statusCode, body: JSON.parse(result.body) };
  };
  const notAdmitted = await call("/api/v1/entitlements");
  upstreamReason = "BETA_FULL";
  const betaFull = await call("/api/v1/entitlements");
  upstreamReason = "INTERNAL_STATE_SHOULD_NOT_LEAK";
  const unknown = await call("/api/v1/entitlements");
  const operatorRoute = await call(ADMISSION_ROUTE);
  globalThis.fetch = previousFetch;
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
  Object.assign(process.env, previousEnv);
  check("C01 Not admitted reaches the signed-in tester", notAdmitted.status === 403 && notAdmitted.body.error.reason === "NOT_ADMITTED" && /not been admitted/.test(notAdmitted.body.error.message));
  check("C02 Beta full reaches the signed-in tester", betaFull.body.error.reason === "BETA_FULL" && /full/.test(betaFull.body.error.message));
  check("C03 unknown backend states are not passed through", !unknown.body.error.reason && /does not permit a new evaluation/.test(unknown.body.error.message));
  check("C04 the customer gateway refuses the operator admission route", operatorRoute.status === 404 && !upstreamUrls.some(url => url.includes("/operator/")));
}

// ---------- D. Source boundaries ----------
const gatewaySource = read("netlify/functions/flipforge-api.js");
const probe = read("scripts/lib/flipforge-production-auth-probe.mjs");
const ownerHub = read("assets/js/beta-operator.js");
const founderUi = read("assets/js/beta-founder-select.js");
const operatorFn = read("netlify/modern-functions/beta-operator.mjs");
check("D01 customer gateway allowlist has no operator route", !/operator/.test(gatewaySource.slice(gatewaySource.indexOf("const ROUTES"), gatewaySource.indexOf("];", gatewaySource.indexOf("const ROUTES")))));
check("D02 sign-in page shows specific Not admitted and Beta full states", probe.includes("NOT_ADMITTED: \"Not admitted:") && probe.includes("BETA_FULL: \"Beta full:"));
check("D03 Owner Hub shows a specific Beta full message", ownerHub.includes("BETA_FULL:`Beta full") && founderUi.includes('reason==="BETA_FULL"'));
check("D04 seat is reserved before the invitation and released before removal in source order",
  operatorFn.indexOf("admissionClient.admit(") < operatorFn.indexOf("await inviteApplicant(reserved")
    && operatorFn.indexOf("releaseBetaSeat(reserved") < operatorFn.indexOf("await revokeBetaMembership(reserved"));
check("D05 Terms acceptance still owns promotion to flipforge-active", read("netlify/modern-functions/beta-terms-acceptance.mjs").includes("roles.push(ACTIVE_ROLE)")
  && !read("netlify/modern-functions/lib/beta-admission-client.mjs").includes("flipforge-active"));

let failed = 0;
for (const item of results) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.passed) failed += 1;
}
if (failed) {
  console.error(`Beta seat admission validation failed: ${failed}/${results.length}`);
  process.exit(1);
}
console.log(`Beta seat admission validation passed: ${results.length}/${results.length}`);
