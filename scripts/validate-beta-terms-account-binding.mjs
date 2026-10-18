// Beta Terms consent is bound to one account, recorded once, and never inferred from a browser
// snapshot (2026-10-16 activation-safety fix). Runs the real function handler against in-memory
// stores, and the shared browser/server session helper against synthetic cookies. No network.
import { createBetaTermsAcceptanceHandler } from "../netlify/modern-functions/beta-terms-acceptance.mjs";
import { applicationKey } from "../netlify/modern-functions/lib/beta-operations-core.mjs";
import { jwtClaims, serverSessionStatus, syncServerSessionCookie } from "./lib/flipforge-server-session.mjs";

const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

class MemoryStore {
  constructor() { this.records = new Map(); this.etags = new Map(); this.sequence = 0; this.writes = 0; }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfMatch && this.etags.get(key) !== options.onlyIfMatch) return { modified: false };
    const etag = `etag-${++this.sequence}`;
    this.records.set(key, structuredClone(value));
    this.etags.set(key, etag);
    this.writes += 1;
    return { modified: true, etag };
  }
  async getWithMetadata(key) { return this.records.has(key) ? { data: structuredClone(this.records.get(key)), etag: this.etags.get(key), metadata: {} } : null; }
}

const VERSION = "2026-08-15";
const applicationId = "6f1c2a52-1d3e-4c7a-9b1e-2f6d5a4c3b21";
const tenantId = `beta-${applicationId}`;
const activated = {
  id: "identity-activated-tester",
  email: "activated@example.com",
  appMetadata: { roles: [`flipforge-tenant--${tenantId}`, "flipforge-terms-pending"], flipforge: { betaApplicationId: applicationId, tenantId, access: "terms_pending" } },
  userMetadata: {}
};
const otherAccount = {
  id: "identity-other-active-tester",
  email: "other@example.com",
  appMetadata: { roles: ["flipforge-tenant--beta-other", "flipforge-active"], flipforge: { betaApplicationId: "0d3c2b1a-9e8f-4a7b-8c6d-5e4f3a2b1c0d", tenantId: "beta-other", access: "active" } },
  userMetadata: {}
};

async function setup() {
  const store = new MemoryStore();
  await store.setJSON(applicationKey(applicationId), {
    id: applicationId, version: 1, schemaVersion: 1, status: "APPROVED", selectionSource: "FOUNDER_SELECTED", tenantId,
    identityUserId: activated.id, cohort: "wave-1", applicant: { email: activated.email, betaTermsAccepted: false }, history: []
  });
  store.writes = 0;
  const promotions = [];
  const identityAdmin = { updateUser: async (id, update) => { promotions.push({ id, roles: update.app_metadata.roles }); } };
  return { store, promotions, identityAdmin };
}

function post(handler, body) {
  return handler(new Request("https://goflipforge.com/api/beta/terms-acceptance", {
    method: "POST", headers: { origin: "https://goflipforge.com", "content-type": "application/json" }, body: JSON.stringify(body)
  }));
}

const originalLog = console.log;
console.log = () => {};
try {
  // Missing binding: nothing recorded.
  {
    const { store, promotions, identityAdmin } = await setup();
    const handler = createBetaTermsAcceptanceHandler({ store, identityAdmin, getUserFn: async () => activated });
    const response = await post(handler, { accepted: true, termsVersion: VERSION });
    const body = await response.json();
    check("B01 a request without the consenting account id records nothing", response.status === 400 && body.reason === "TERMS_ACCOUNT_BINDING_REQUIRED" && store.writes === 0 && promotions.length === 0, `${response.status} ${body.reason}`);
  }
  // Session belongs to another account than the consent: refused before any write.
  {
    const { store, promotions, identityAdmin } = await setup();
    const handler = createBetaTermsAcceptanceHandler({ store, identityAdmin, getUserFn: async () => otherAccount });
    const response = await post(handler, { accepted: true, termsVersion: VERSION, identityUserId: activated.id });
    const body = await response.json();
    check("B02 consent given by one account is refused for another account's session", response.status === 409 && body.reason === "TERMS_ACCOUNT_MISMATCH" && store.writes === 0 && promotions.length === 0, `${response.status} ${body.reason}`);
  }
  // The activated account's session claiming to consent for someone else: refused.
  {
    const { store, promotions, identityAdmin } = await setup();
    const handler = createBetaTermsAcceptanceHandler({ store, identityAdmin, getUserFn: async () => activated });
    const response = await post(handler, { accepted: true, termsVersion: VERSION, identityUserId: otherAccount.id });
    check("B03 a session cannot record consent on behalf of a different account id", response.status === 409 && store.writes === 0 && promotions.length === 0, String(response.status));
  }
  // No server session: 401, nothing recorded.
  {
    const { store, promotions, identityAdmin } = await setup();
    const handler = createBetaTermsAcceptanceHandler({ store, identityAdmin, getUserFn: async () => null });
    const response = await post(handler, { accepted: true, termsVersion: VERSION, identityUserId: activated.id });
    check("B04 missing or expired server session returns 401 and records nothing", response.status === 401 && store.writes === 0 && promotions.length === 0, String(response.status));
  }
  // Correct account: recorded exactly once, repeat is idempotent.
  {
    const { store, promotions, identityAdmin } = await setup();
    let current = activated;
    const handler = createBetaTermsAcceptanceHandler({ store, identityAdmin, getUserFn: async () => current });
    const first = await post(handler, { accepted: true, termsVersion: VERSION, identityUserId: activated.id });
    const firstBody = await first.json();
    current = { ...activated, appMetadata: { ...activated.appMetadata, roles: [`flipforge-tenant--${tenantId}`, "flipforge-active"] } };
    const second = await post(handler, { accepted: true, termsVersion: VERSION, identityUserId: activated.id });
    const secondBody = await second.json();
    const saved = (await store.getWithMetadata(applicationKey(applicationId))).data;
    const acceptances = saved.history.filter(entry => entry.type === "BETA_TERMS_ACCEPTED").length;
    check("B05 the activated account records its acceptance", first.status === 200 && firstBody.activated === true && saved.termsAcceptance?.identityUserId === activated.id, `${first.status}`);
    check("B06 acceptance is recorded exactly once (repeat is idempotent)", second.status === 200 && secondBody.alreadyRecorded === true && acceptances === 1, `history=${acceptances}`);
    check("B07 promotion is applied to the consenting account only", promotions.length === 1 && promotions[0].id === activated.id && promotions[0].roles.includes("flipforge-active"), JSON.stringify(promotions));
  }
} finally {
  console.log = originalLog;
}

// Browser/server session agreement helper.
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub, offset) => `${b64({ alg: "HS256" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + offset })}.sig`;
const cookie = token => `other=1; nf_jwt=${encodeURIComponent(token)}; nf_refresh=r`;
check("S01 claims decode", jwtClaims(jwt("u1", 100))?.sub === "u1");
check("S02 valid cookie for the signed-in account is ok", serverSessionStatus("u1", { cookieString: cookie(jwt("u1", 3600)) }) === "ok");
check("S03 expired cookie is reported, not trusted", serverSessionStatus("u1", { cookieString: cookie(jwt("u1", -10)) }) === "expired");
check("S04 cookie of another account is reported as other-account", serverSessionStatus("u1", { cookieString: cookie(jwt("u2", 3600)) }) === "other-account");
check("S05 missing cookie is reported", serverSessionStatus("u1", { cookieString: "a=b" }) === "missing");
{
  const writes = [];
  const storage = { getItem: () => JSON.stringify({ id: "u1", token: { access_token: jwt("u1", 3600), refresh_token: "fresh-refresh" } }) };
  const ok = syncServerSessionCookie("u1", { storage, cookieString: cookie(jwt("u1", -10)), writeCookie: value => writes.push(value) });
  check("S06 stale cookie is realigned from the library's valid session for the same account", ok && writes.length === 2 && writes[0].startsWith("nf_jwt=") && /path=\/; secure; samesite=lax$/.test(writes[0]), writes.map(value => value.split("=")[0]).join(","));
}
{
  const writes = [];
  const storage = { getItem: () => JSON.stringify({ id: "u2", token: { access_token: jwt("u2", 3600), refresh_token: "x" } }) };
  const ok = syncServerSessionCookie("u1", { storage, cookieString: cookie(jwt("u9", 3600)), writeCookie: value => writes.push(value) });
  check("S07 never adopts a stored session that belongs to a different account", !ok && writes.length === 0);
}
{
  const writes = [];
  const storage = { getItem: () => JSON.stringify({ id: "u1", token: { access_token: jwt("u1", -5), refresh_token: "x" } }) };
  const ok = syncServerSessionCookie("u1", { storage, cookieString: "", writeCookie: value => writes.push(value) });
  check("S08 never writes an expired session into the server cookie", !ok && writes.length === 0);
}
{
  const writes = [];
  const ok = syncServerSessionCookie("u1", { storage: { getItem: () => { throw new Error("blocked"); } }, cookieString: "", writeCookie: value => writes.push(value) });
  check("S09 blocked storage fails closed", !ok && writes.length === 0);
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\nBeta Terms account binding validation: ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
