import fs from "node:fs";
import assert from "node:assert/strict";
import { createBetaApplicationsHandler } from "../netlify/modern-functions/beta-applications.mjs";
import { createBetaOperatorHandler } from "../netlify/modern-functions/beta-operator.mjs";
import { createConversionEventHandler } from "../netlify/modern-functions/conversion-event.mjs";

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

const read = path => fs.readFileSync(path, "utf8");
const applicationHtml = read("beta-application.html");
const operatorHtml = read("operator-beta.html");
const operatorCss = read("assets/css/beta-operator-v1.css");
const operatorClient = read("assets/js/beta-operator.js");
const identityClient = read("scripts/lib/flipforge-identity-client.mjs");
const intakeSource = read("netlify/modern-functions/beta-applications.mjs");
const operatorSource = read("netlify/modern-functions/beta-operator.mjs");
const eventSource = read("netlify/modern-functions/conversion-event.mjs");
const retentionSource = read("netlify/modern-functions/beta-retention.mjs");
const runtimeStoreSource = read("netlify/modern-functions/lib/beta-runtime-store.mjs");
const coreSource = read("netlify/modern-functions/lib/beta-operations-core.mjs");
const privacy = read("privacy.html");
const docs = read("docs/PRIVATE_BETA_OPERATOR_WORKFLOW.md");
const netlify = read("netlify.toml");
const packageJson = JSON.parse(read("package.json"));

const checks = [
  ["operator validator registered", packageJson.scripts?.["validate:beta-operator"] === "node scripts/validate-beta-operator-workflow.mjs"],
  ["Netlify Blobs dependency pinned", packageJson.dependencies?.["@netlify/blobs"] === "10.7.9"],
  ["application posts to server endpoint", applicationHtml.includes('action="/api/beta/applications"')],
  ["application no longer depends on Netlify Forms interception", !applicationHtml.includes('data-netlify="true"')],
  ["terms acceptance reaches server", applicationHtml.includes('name="beta_terms_accepted"')],
  ["intake enforces body limit", intakeSource.includes("MAX_APPLICATION_BYTES") && intakeSource.includes("PAYLOAD_TOO_LARGE")],
  ["intake enforces same origin", intakeSource.includes("sameOrigin(request)")],
  ["intake is platform rate limited", intakeSource.includes("rateLimit") && intakeSource.includes('aggregateBy: ["ip", "domain"]')],
  ["intake validates consent and terms", coreSource.includes("CONTACT_CONSENT_REQUIRED") && coreSource.includes("TERMS_ACCEPTANCE_REQUIRED")],
  ["email index is hashed", coreSource.includes('digest("SHA-256"') && !coreSource.includes("`email/${email}")],
  ["application deduplication is atomic", intakeSource.includes("onlyIfNew: true") && intakeSource.includes("claim?.modified === false")],
  ["operator page is noindex", operatorHtml.includes('name="robots" content="noindex,nofollow,noarchive"')],
  ["operator page uses locked logo", operatorHtml.includes("flipforge-logo-horizontal.svg") && operatorHtml.includes("Before you buy. Know Why.")],
  ["operator page loads signed identity client", operatorHtml.includes('/assets/js/flipforge-identity.js')],
  ["operator page has desktop and mobile layouts", operatorCss.includes("@media(max-width:1120px)") && operatorCss.includes("@media(max-width:700px)")],
  ["operator client keeps sensitive state in memory", !/localStorage|sessionStorage|indexedDB/i.test(operatorClient)],
  ["operator client confirms invitation", operatorClient.includes("Send a private-beta Identity invitation")],
  ["operator controls re-enable after loading", operatorClient.includes("state.busy=false;render()")],
  ["under-review state omits redundant reopen action", operatorClient.includes('["WAITLISTED","DECLINED","APPROVED"].includes(item.status)') && !operatorClient.includes('["UNDER_REVIEW","WAITLISTED","DECLINED","APPROVED"].includes(item.status)')],
  ["identity snapshot exposes boolean only", identityClient.includes("operatorActive") && !identityClient.includes("operatorRoles:")],
  ["server independently checks operator", operatorSource.includes("isOperator(user)") && operatorSource.includes("OPERATOR_ROLE_REQUIRED")],
  ["operator mutations enforce same origin", operatorSource.includes("sameOrigin(request)")],
  ["operator mutations enforce versions", operatorSource.includes("VERSION_CONFLICT")],
  ["operator mutations use atomic blob versions", operatorSource.includes("onlyIfMatch: etag") && operatorSource.includes("conditionalApplicationWrite")],
  ["invitation requires approval and cohort", operatorSource.includes("APPLICATION_NOT_APPROVED") && operatorSource.includes("COHORT_REQUIRED")],
  ["invitation reserves state before the Identity side effect", operatorSource.includes("INVITATION_STARTED") && operatorSource.includes("INVITATION_IN_PROGRESS") && operatorSource.indexOf("reserveInvitation(current") < operatorSource.indexOf("inviteApplicant(reserved")],
  ["invitation rejects unconfirmed self-registration conflicts", operatorSource.includes("IDENTITY_ACCOUNT_CONFLICT") && operatorSource.includes("!activatedIdentity(identityUser) && !invitedIdentity(identityUser)")],
  ["invitation uses server operator token", operatorSource.includes("getIdentityConfig") && operatorSource.includes("Bearer ${identity.token}")],
  ["invitation assigns one tenant role", operatorSource.includes("filter(role => !role.startsWith(TENANT_ROLE_PREFIX))") && coreSource.includes('ACTIVE_ROLE = "flipforge-active"')],
  ["activation sync is Identity-backed", operatorSource.includes("syncActivations") && operatorSource.includes("confirmedAt")],
  ["review state machine is explicit", ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED", "APPROVED", "INVITE_SENT", "ACTIVATED", "DECLINED"].every(value => coreSource.includes(value))],
  ["conversion events persist without added dimensions", eventSource.includes("CONVERSION_STORE_NAME") && eventSource.includes("setJSON")],
  ["90-day event retention is enforced", operatorSource.includes("90 * 24 * 60 * 60 * 1000") && retentionSource.includes("89 * 24 * 60 * 60 * 1000") && retentionSource.includes('schedule: "0 3 * * *"')],
  ["application and event scans are paginated", coreSource.includes("paginate: true") && coreSource.match(/for await/g)?.length >= 2],
  ["deploy previews use isolated stores", runtimeStoreSource.includes("getDeployStore") && runtimeStoreSource.includes('CONTEXT || ""') && runtimeStoreSource.includes('=== "production"')],
  ["privacy discloses role-gated review", privacy.includes("server-verified FlipForge operator role")],
  ["privacy discloses event retention", privacy.includes("no more than 90 days")],
  ["operator page receives no-store security headers", netlify.includes('for = "/operator-beta.html"') && netlify.includes('Cache-Control = "no-store"')],
  ["operator contract documents setup", docs.includes("flipforge-operator") && docs.includes("sign out and back in")],
  ["operator contract preserves authority", docs.includes("grants no billing, bid, purchase, sale, grading, evidence-acceptance, or transaction authority")],
];

let failed = 0;
for (const [name, condition] of checks) {
  if (!condition) { failed += 1; console.error(`FAIL - ${name}`); }
}

const applicationStore = new MemoryStore();
const eventStore = new MemoryStore();
const fixedNow = new Date("2026-08-23T03:00:00.000Z");
const validApplication = {
  name: "Test Applicant",
  email: "tester@example.com",
  collector_type: "Collector",
  experience: "4–10 years",
  monthly_card_volume: "6–20",
  hosted_web_beta_access: "Yes — several times per week",
  primary_use_case: "Validate exact-card evidence before deciding whether to buy.",
  tester_fit: "I can document expected and actual behavior with clear reproduction steps.",
  testing_focus: "Exact-card identity",
  grading_interest: "yes",
  outcome_review_interest: "yes",
  beta_updates_consent: "yes",
  beta_terms_accepted: "yes",
};
const appRequest = (body, overrides = {}) => new Request("https://goflipforge.com/api/beta/applications", {
  method: overrides.method || "POST",
  headers: {
    origin: overrides.origin || "https://goflipforge.com",
    accept: overrides.accept || "application/json",
    "content-type": overrides.contentType || "application/json",
  },
  body: overrides.method === "GET" ? undefined : (overrides.raw || JSON.stringify(body)),
});
const intake = createBetaApplicationsHandler({ store: applicationStore, now: () => fixedNow });
assert.equal((await intake(appRequest({}, { method: "GET" }))).status, 405);
assert.equal((await intake(appRequest(validApplication, { origin: "https://example.invalid" }))).status, 403);
assert.equal((await intake(appRequest({ ...validApplication, beta_updates_consent: "no" }))).status, 400);
assert.equal((await intake(appRequest({ ...validApplication, bot_field: "filled" }))).status, 202);
assert.equal((await applicationStore.list({ prefix: "application/" })).blobs.length, 0);
assert.equal((await intake(appRequest(validApplication))).status, 202);
assert.equal((await intake(appRequest(validApplication))).status, 202);
const applicationKeys = (await applicationStore.list({ prefix: "application/" })).blobs.map(item => item.key);
assert.equal(applicationKeys.length, 1);
let application = await applicationStore.get(applicationKeys[0]);
assert.equal(application.status, "SUBMITTED");
assert.equal(application.applicant.email, "tester@example.com");
assert.ok(!JSON.stringify(application).includes("password"));

const conversion = createConversionEventHandler({ store: eventStore, now: () => fixedNow });
const originalLog = console.log;
const operationLogs = [];
console.log = value => operationLogs.push(String(value));
assert.equal((await conversion(new Request("https://goflipforge.com/api/conversion-event", {
  method: "POST",
  headers: { origin: "https://goflipforge.com", "content-type": "application/json" },
  body: JSON.stringify({ event: "beta_form_started", page: "beta-application", placement: "form", email: "never-log@example.com" }),
}))).status, 202);

const identityUsers = [];
const identityUpdates = [];
const identityAdmin = {
  async listUsers() { return identityUsers.map(value => structuredClone(value)); },
  async updateUser(id, attributes) {
    const user = identityUsers.find(value => value.id === id);
    assert.ok(user);
    identityUpdates.push(structuredClone(attributes));
    user.appMetadata = structuredClone(attributes.app_metadata);
    user.userMetadata = structuredClone(attributes.user_metadata);
    user.roles = structuredClone(attributes.app_metadata.roles);
    return structuredClone(user);
  },
};
const inviteIdentity = async (email, fullName) => {
  const user = { id: "identity-user-1", email, invitedAt: fixedNow.toISOString(), roles: [], userMetadata: { full_name: fullName }, appMetadata: { provider: "email", roles: [] } };
  identityUsers.push(user);
  return structuredClone(user);
};
const operatorUser = { id: "operator-1", email: "owner@example.com", roles: ["flipforge-operator"] };
const operatorRequest = body => new Request("https://goflipforge.com/api/beta/operator", {
  method: body ? "POST" : "GET",
  headers: { origin: "https://goflipforge.com", ...(body ? { "content-type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const anonymous = createBetaOperatorHandler({ applicationStore, eventStore, getUserFn: async () => null, identityAdmin, inviteIdentity, now: () => fixedNow });
assert.equal((await anonymous(operatorRequest())).status, 401);
const customer = createBetaOperatorHandler({ applicationStore, eventStore, getUserFn: async () => ({ id: "customer", roles: ["flipforge-active"] }), identityAdmin, inviteIdentity, now: () => fixedNow });
assert.equal((await customer(operatorRequest())).status, 403);
const operator = createBetaOperatorHandler({ applicationStore, eventStore, getUserFn: async () => operatorUser, identityAdmin, inviteIdentity, now: () => fixedNow });
let response = await operator(operatorRequest());
assert.equal(response.status, 200);
let dashboard = await response.json();
assert.equal(dashboard.applicationSummary.total, 1);
assert.equal(dashboard.funnel.counts.betaFormStarted, 1);

response = await operator(operatorRequest({ action: "transition", applicationId: application.id, expectedVersion: application.version, targetStatus: "UNDER_REVIEW", note: "Strong exact-identity testing fit." }));
assert.equal(response.status, 200);
application = (await response.json()).application;
assert.equal(application.status, "UNDER_REVIEW");
response = await operator(operatorRequest({ action: "transition", applicationId: application.id, expectedVersion: application.version, targetStatus: "APPROVED", cohort: "beta-2026-08-a", note: "Approved for first cohort." }));
application = (await response.json()).application;
assert.equal(application.status, "APPROVED");
assert.equal((await operator(operatorRequest({ action: "invite", applicationId: application.id, expectedVersion: application.version - 1 }))).status, 409);
identityUsers.push({ id: "unconfirmed-self-registration", email: application.applicant.email, roles: [], appMetadata: { provider: "email", roles: [] } });
response = await operator(operatorRequest({ action: "invite", applicationId: application.id, expectedVersion: application.version }));
assert.equal(response.status, 409);
application = await applicationStore.get(applicationKeys[0]);
assert.equal(application.status, "APPROVED");
assert.equal(application.invitationAttempt, null);
identityUsers.length = 0;
response = await operator(operatorRequest({ action: "invite", applicationId: application.id, expectedVersion: application.version }));
assert.equal(response.status, 200);
application = (await response.json()).application;
assert.equal(application.status, "INVITE_SENT");
assert.equal(identityUpdates.length, 1);
assert.ok(identityUpdates[0].app_metadata.roles.includes("flipforge-active"));
assert.equal(identityUpdates[0].app_metadata.roles.filter(role => role.startsWith("flipforge-tenant--")).length, 1);
identityUsers[0].confirmedAt = "2026-08-23T03:05:00.000Z";
response = await operator(operatorRequest());
dashboard = await response.json();
assert.equal(dashboard.applications[0].status, "ACTIVATED");
console.log = originalLog;
assert.ok(operationLogs.every(line => !line.includes("tester@example.com") && !line.includes("Test Applicant") && !line.includes("never-log@example.com")));

if (failed) process.exit(1);
console.log(`Beta operator workflow validation passed: ${checks.length + 28} checks.`);
