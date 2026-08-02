import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_VERSION = "1.0";
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{8,100}$/;
const APPROVED_STAGING_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
const WRITE_ACK = "RUN_STAGING_WRITE_PROOF";
const MAX_RESPONSE_BYTES = 1_000_000;

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredSecret(env, name) {
  const value = String(env[name] || "");
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function safeOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("FLIPFORGE_STAGING_ORIGIN must be a valid URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (["goflipforge.com", "www.goflipforge.com"].includes(hostname)) {
    throw new Error("Production FlipForge hosts are forbidden for staging live proof.");
  }
  if (!APPROVED_STAGING_HOST.test(hostname)) {
    throw new Error("Staging live proof is restricted to approved FlipForge deploy-preview hosts or localhost.");
  }
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (!local && url.protocol !== "https:") {
    throw new Error("Staging live proof requires HTTPS outside localhost.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("FLIPFORGE_STAGING_ORIGIN must not contain credentials, query, or fragment data.");
  }
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return url.origin + normalizedPath;
}

function readEvaluationPayload(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("Evaluation payload path must reference a regular file.");
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Evaluation payload must be a JSON object.");
  }
  const forbidden = [
    "recommendation", "confidence", "risk", "supportedValueCents", "verified",
    "transactionAuthorized", "tenantId", "userId", "evidenceAcceptedByRequest",
    "psaRecalculated", "authority", "gradingAuthority"
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`Evaluation payload contains forbidden authority field: ${key}`);
    }
  }
  for (const key of ["externalListingId", "marketplace", "cardIdentity", "listingUrl", "listingFormat"]) {
    if (typeof payload[key] !== "string" || !payload[key].trim()) {
      throw new Error(`Evaluation payload requires non-empty ${key}.`);
    }
  }
  if (!SAFE_ID.test(payload.externalListingId)) throw new Error("externalListingId is unsafe.");
  const listingUrl = new URL(payload.listingUrl);
  if (!["http:", "https:"].includes(listingUrl.protocol)) throw new Error("listingUrl must use HTTP or HTTPS.");
  for (const key of ["itemPriceCents", "shippingCents", "buyerPremiumCents", "taxCents"]) {
    if (!Number.isSafeInteger(payload[key]) || payload[key] < 0) {
      throw new Error(`Evaluation payload requires non-negative integer ${key}.`);
    }
  }
  return payload;
}

function correlationId(uuid = crypto.randomUUID) {
  return `staging-proof-${uuid()}`;
}

async function readJsonLimited(response) {
  const declared = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Response exceeded maximum size.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Response exceeded maximum size.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Endpoint returned invalid JSON.");
  }
}

async function identitySession(fetchImpl, origin, label, email, password) {
  let response;
  try {
    response = await fetchImpl(`${origin}/.netlify/identity/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: email,
        password
      }).toString(),
      redirect: "error",
      cache: "no-store"
    });
  } catch {
    throw new Error(`Netlify Identity sign-in was unavailable for ${label}.`);
  }

  let payload;
  try {
    payload = await readJsonLimited(response);
  } catch {
    throw new Error(`Netlify Identity returned an invalid sign-in response for ${label}.`);
  }
  if (!response.ok) {
    throw new Error(`Netlify Identity sign-in failed for ${label} (HTTP ${response.status}).`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error(`Netlify Identity did not establish a complete cookie session for ${label}.`);
  }

  return `nf_jwt=${encodeURIComponent(accessToken)}; nf_refresh=${encodeURIComponent(refreshToken)}`;
}

function assertEnvelope(payload, expectedCorrelationId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Missing JSON envelope.");
  if (!payload.meta || typeof payload.meta !== "object") throw new Error("Missing response meta.");
  if (payload.meta.contractVersion !== CONTRACT_VERSION) throw new Error("Unexpected contract version.");
  if (payload.meta.authority !== "Smart Opportunity") throw new Error("Smart Opportunity authority proof is missing.");
  if (payload.meta.gradingAuthority !== "Existing PSA intelligence") throw new Error("PSA grading authority proof is missing.");
  if (payload.meta.correlationId !== expectedCorrelationId) throw new Error("Correlation ID mismatch.");
  if (!Object.prototype.hasOwnProperty.call(payload, "data")) throw new Error("Response data is missing.");
  return payload.data;
}

function assertTenantIsolation(data) {
  const isolation = data && data.tenantIsolation;
  if (!isolation || isolation.enforced !== true || isolation.defaultAccess !== "DENY") {
    throw new Error("Tenant isolation/default-deny proof is missing.");
  }
  if (typeof isolation.tenantAuditKey !== "string" || isolation.tenantAuditKey.length < 6 || isolation.tenantAuditKey.length > 32) {
    throw new Error("Tenant audit key is missing or unsafe.");
  }
}

async function call(fetchImpl, origin, route, { session = null, method = "GET", body = null, idempotencyKey = null, expect = [200], uuid = crypto.randomUUID } = {}) {
  const corr = correlationId(uuid);
  const headers = {
    Accept: "application/json",
    "X-Correlation-Id": corr
  };
  if (session) headers.Cookie = session;
  if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetchImpl(`${origin}${route}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "error",
    cache: "no-store"
  });
  const payload = await readJsonLimited(response);
  if (!expect.includes(response.status)) {
    const code = payload && payload.error && payload.error.code ? payload.error.code : "UNKNOWN";
    throw new Error(`${method} ${route} returned ${response.status} (${code}).`);
  }
  return { response, payload, correlationId: corr };
}

function record(proof, name, result, extra = {}) {
  proof.checks.push({ name, result, ...extra });
}

export async function runStagingLiveProof({ env = process.env, fetchImpl = fetch, uuid = crypto.randomUUID, clock = () => new Date() } = {}) {
  const origin = safeOrigin(required(env, "FLIPFORGE_STAGING_ORIGIN"));
  if (required(env, "FLIPFORGE_STAGING_LIVE_PROOF_ACK") !== WRITE_ACK) {
    throw new Error(`FLIPFORGE_STAGING_LIVE_PROOF_ACK must equal ${WRITE_ACK}.`);
  }
  const payload = readEvaluationPayload(required(env, "FLIPFORGE_STAGING_EVALUATION_PAYLOAD_FILE"));
  const userAEmail = required(env, "FLIPFORGE_STAGING_USER_A_EMAIL");
  const userAPassword = requiredSecret(env, "FLIPFORGE_STAGING_USER_A_PASSWORD");
  const userBEmail = required(env, "FLIPFORGE_STAGING_USER_B_EMAIL");
  const userBPassword = requiredSecret(env, "FLIPFORGE_STAGING_USER_B_PASSWORD");
  const unprovisionedEmail = String(env.FLIPFORGE_STAGING_UNPROVISIONED_EMAIL || "").trim();
  const unprovisionedPassword = String(env.FLIPFORGE_STAGING_UNPROVISIONED_PASSWORD || "");
  if (Boolean(unprovisionedEmail) !== Boolean(unprovisionedPassword)) {
    throw new Error("Optional unprovisioned Identity email and password must be supplied together.");
  }

  const idempotencyKey = `proof-${uuid()}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100);
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error("Generated idempotency key is unsafe.");

  const proof = {
    schemaVersion: "1.0",
    kind: "flipforge-staging-live-proof",
    startedAt: clock().toISOString(),
    origin,
    productionHostUsed: false,
    secretsRecorded: false,
    authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence",
    transactionAuthority: false,
    checks: []
  };

  const health = await call(fetchImpl, origin, "/api/v1/health", { expect: [200], uuid });
  const healthData = health.payload && health.payload.data;
  if (!healthData || healthData.status !== "configured" || healthData.bridgeEnabled !== true || healthData.upstreamConfigured !== true) {
    throw new Error("Gateway health does not report configured staging.");
  }
  if (healthData.authenticationRequired !== true || healthData.tenantMembershipRequired !== true || healthData.clientIdentityHeadersAccepted !== false || healthData.productionPreviewBypassAllowed !== false) {
    throw new Error("Gateway health weakened authentication or identity boundaries.");
  }
  if (healthData.authenticationTransport !== "secure-same-origin-cookie" || healthData.membershipSource !== "netlify-identity-signed-roles") {
    throw new Error("Gateway health does not report the approved cookie-authenticated signed-role boundary.");
  }
  record(proof, "gateway-health", "PASS", { correlationId: health.correlationId, status: health.response.status });

  const unauth = await call(fetchImpl, origin, "/api/v1/dashboard", { expect: [401], uuid });
  if (!unauth.payload.error || unauth.payload.error.code !== "AUTHENTICATION_REQUIRED") throw new Error("Unauthenticated boundary did not return AUTHENTICATION_REQUIRED.");
  record(proof, "unauthenticated-deny", "PASS", { correlationId: unauth.correlationId, status: unauth.response.status });

  const sessionA = await identitySession(fetchImpl, origin, "User A", userAEmail, userAPassword);
  const sessionB = await identitySession(fetchImpl, origin, "User B", userBEmail, userBPassword);
  const unprovisionedSession = unprovisionedEmail
    ? await identitySession(fetchImpl, origin, "the unprovisioned user", unprovisionedEmail, unprovisionedPassword)
    : null;

  if (unprovisionedSession) {
    const unprov = await call(fetchImpl, origin, "/api/v1/dashboard", { session: unprovisionedSession, expect: [403], uuid });
    if (!unprov.payload.error || !String(unprov.payload.error.code || "").startsWith("TENANT_MEMBERSHIP_")) {
      throw new Error("Unprovisioned identity did not fail with tenant-membership denial.");
    }
    record(proof, "unprovisioned-deny", "PASS", { correlationId: unprov.correlationId, status: unprov.response.status });
  }

  const dashboard = await call(fetchImpl, origin, "/api/v1/dashboard", { session: sessionA, uuid });
  const dashboardData = assertEnvelope(dashboard.payload, dashboard.correlationId);
  assertTenantIsolation(dashboardData);
  record(proof, "tenant-a-dashboard", "PASS", { correlationId: dashboard.correlationId, status: dashboard.response.status });

  const opportunities = await call(fetchImpl, origin, "/api/v1/opportunities", { session: sessionA, uuid });
  const opportunitiesData = assertEnvelope(opportunities.payload, opportunities.correlationId);
  assertTenantIsolation(opportunitiesData);
  record(proof, "tenant-a-opportunities", "PASS", { correlationId: opportunities.correlationId, status: opportunities.response.status });

  const evaluation = await call(fetchImpl, origin, "/api/v1/evaluations", {
    session: sessionA,
    method: "POST",
    body: payload,
    idempotencyKey,
    expect: [200, 201],
    uuid
  });
  const evaluationData = assertEnvelope(evaluation.payload, evaluation.correlationId);
  if (evaluationData.kind !== "evaluation" || evaluationData.persistedToSqlite !== true || evaluationData.tenantOwned !== true) throw new Error("Evaluation persistence/ownership proof is missing.");
  if (evaluationData.transactionAuthorized !== false || evaluationData.evidenceAcceptedByRequest !== false || evaluationData.psaRecalculated !== false) throw new Error("Evaluation response crossed an authority boundary.");
  assertTenantIsolation(evaluationData);
  if (evaluationData.tenantIsolation.idempotencyScope !== "TENANT" || evaluationData.tenantIsolation.opportunityOwnership !== "GRANTED_ON_COMPLETION") throw new Error("Tenant idempotency/ownership proof is missing.");
  if (!SAFE_ID.test(String(evaluationData.opportunityId || ""))) throw new Error("Evaluation returned an unsafe opportunity ID.");
  const opportunityId = String(evaluationData.opportunityId);
  record(proof, "tenant-a-evaluation", "PASS", { correlationId: evaluation.correlationId, status: evaluation.response.status, opportunityId });

  const replay = await call(fetchImpl, origin, "/api/v1/evaluations", {
    session: sessionA,
    method: "POST",
    body: payload,
    idempotencyKey,
    expect: [200, 201],
    uuid
  });
  const replayData = assertEnvelope(replay.payload, replay.correlationId);
  if (replayData.opportunityId !== opportunityId || replayData.idempotentReplay !== true) throw new Error("Evaluation idempotent replay proof failed.");
  record(proof, "tenant-a-idempotent-replay", "PASS", { correlationId: replay.correlationId, status: replay.response.status, opportunityId });

  const detail = await call(fetchImpl, origin, `/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, { session: sessionA, uuid });
  const detailData = assertEnvelope(detail.payload, detail.correlationId);
  assertTenantIsolation(detailData);
  record(proof, "tenant-a-saved-detail", "PASS", { correlationId: detail.correlationId, status: detail.response.status, opportunityId });

  const evidence = await call(fetchImpl, origin, `/api/v1/evidence/${encodeURIComponent(opportunityId)}`, { session: sessionA, uuid });
  const evidenceData = assertEnvelope(evidence.payload, evidence.correlationId);
  assertTenantIsolation(evidenceData);
  record(proof, "tenant-a-evidence", "PASS", { correlationId: evidence.correlationId, status: evidence.response.status, opportunityId });

  const psa = await call(fetchImpl, origin, `/api/v1/psa-advisor/${encodeURIComponent(opportunityId)}`, { session: sessionA, uuid });
  const psaData = assertEnvelope(psa.payload, psa.correlationId);
  assertTenantIsolation(psaData);
  record(proof, "tenant-a-psa", "PASS", { correlationId: psa.correlationId, status: psa.response.status, opportunityId });

  const lifecycleStart = await call(fetchImpl, origin, `/api/v1/lifecycle/${encodeURIComponent(opportunityId)}`, { session: sessionA, uuid });
  const lifecycleStartData = assertEnvelope(lifecycleStart.payload, lifecycleStart.correlationId);
  assertTenantIsolation(lifecycleStartData);
  const initialLifecycle = lifecycleStartData && lifecycleStartData.lifecycle;
  if (lifecycleStartData.kind !== "lifecycle-detail" || lifecycleStartData.opportunityId !== opportunityId
      || lifecycleStartData.sourceOfTruth !== "SQLite" || lifecycleStartData.transactionAuthority !== false
      || !initialLifecycle || !Number.isInteger(initialLifecycle.version) || !Array.isArray(lifecycleStartData.history)) {
    throw new Error("Initial customer lifecycle proof is incomplete.");
  }
  record(proof, "tenant-a-lifecycle-initial", "PASS", { correlationId: lifecycleStart.correlationId, status: lifecycleStart.response.status, opportunityId, recordVersion: initialLifecycle.version });

  const reviewAt = new Date(clock().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const lifecycleBody = {
    trackingStatus: "REVIEW",
    reviewAt,
    outcomeStatus: "NONE",
    acquisitionCostCents: null,
    acquiredAt: null,
    dispositionProceedsCents: null,
    disposedAt: null,
    alertEnabled: true,
    expectedVersion: initialLifecycle.version
  };
  const lifecycleUpdate = await call(fetchImpl, origin, `/api/v1/lifecycle/${encodeURIComponent(opportunityId)}`, {
    session: sessionA,
    method: "PUT",
    body: lifecycleBody,
    expect: [200],
    uuid
  });
  const lifecycleUpdateData = assertEnvelope(lifecycleUpdate.payload, lifecycleUpdate.correlationId);
  assertTenantIsolation(lifecycleUpdateData);
  const updatedLifecycle = lifecycleUpdateData && lifecycleUpdateData.lifecycle;
  if (lifecycleUpdateData.kind !== "lifecycle-detail" || lifecycleUpdateData.opportunityId !== opportunityId
      || !updatedLifecycle || updatedLifecycle.version !== initialLifecycle.version + 1
      || updatedLifecycle.trackingStatus !== "REVIEW" || updatedLifecycle.outcomeStatus !== "NONE"
      || updatedLifecycle.reviewAt !== reviewAt || updatedLifecycle.alertEnabled !== true
      || !Array.isArray(lifecycleUpdateData.history) || lifecycleUpdateData.history.length < 1) {
    throw new Error("Customer lifecycle persistence/history proof failed.");
  }
  record(proof, "tenant-a-lifecycle-update", "PASS", { correlationId: lifecycleUpdate.correlationId, status: lifecycleUpdate.response.status, opportunityId, recordVersion: updatedLifecycle.version });

  const staleLifecycle = await call(fetchImpl, origin, `/api/v1/lifecycle/${encodeURIComponent(opportunityId)}`, {
    session: sessionA,
    method: "PUT",
    body: lifecycleBody,
    expect: [409],
    uuid
  });
  if (!staleLifecycle.payload.error || staleLifecycle.payload.error.code !== "LIFECYCLE_VERSION_CONFLICT") {
    throw new Error("Stale lifecycle write did not fail with LIFECYCLE_VERSION_CONFLICT.");
  }
  record(proof, "tenant-a-lifecycle-stale-write-deny", "PASS", { correlationId: staleLifecycle.correlationId, status: staleLifecycle.response.status, opportunityId });

  const alerts = await call(fetchImpl, origin, "/api/v1/alerts", { session: sessionA, uuid });
  const alertsData = assertEnvelope(alerts.payload, alerts.correlationId);
  assertTenantIsolation(alertsData);
  const alertItems = Array.isArray(alertsData.items) ? alertsData.items : [];
  if (alertsData.kind !== "alerts" || alertsData.configured !== true
      || alertsData.notificationDeliveryConfigured !== false || alertsData.transactionAuthority !== false
      || !alertItems.some(item => item.opportunityId === opportunityId && item.enabled === true && item.reviewAt === reviewAt)) {
    throw new Error("In-app lifecycle alert projection proof failed.");
  }
  record(proof, "tenant-a-lifecycle-alert", "PASS", { correlationId: alerts.correlationId, status: alerts.response.status, opportunityId });

  const crossTenantLifecycle = await call(fetchImpl, origin, `/api/v1/lifecycle/${encodeURIComponent(opportunityId)}`, { session: sessionB, expect: [404], uuid });
  if (!crossTenantLifecycle.payload.error || crossTenantLifecycle.payload.error.code !== "RESOURCE_NOT_FOUND") {
    throw new Error("Cross-tenant lifecycle probe did not fail with non-disclosing RESOURCE_NOT_FOUND.");
  }
  record(proof, "tenant-b-cross-tenant-lifecycle-deny", "PASS", { correlationId: crossTenantLifecycle.correlationId, status: crossTenantLifecycle.response.status, opportunityId });

  const crossTenant = await call(fetchImpl, origin, `/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, { session: sessionB, expect: [404], uuid });
  if (!crossTenant.payload.error || crossTenant.payload.error.code !== "RESOURCE_NOT_FOUND") throw new Error("Cross-tenant probe did not fail with non-disclosing RESOURCE_NOT_FOUND.");
  record(proof, "tenant-b-cross-tenant-deny", "PASS", { correlationId: crossTenant.correlationId, status: crossTenant.response.status, opportunityId });

  proof.completedAt = clock().toISOString();
  proof.result = "PASS";
  proof.summary = {
    checksPassed: proof.checks.length,
    checksFailed: 0,
    opportunityId,
    bridgeConfigured: true,
    sqlitePersistenceProved: true,
    tenantIsolationProved: true,
    idempotencyProved: true,
    lifecyclePersistenceProved: true,
    lifecycleHistoryProved: true,
    optimisticConflictProved: true,
    inAppAlertProjectionProved: true,
    decisionDossierSourceSetProved: true,
    productionActivated: false
  };
  return proof;
}

export const STAGING_LIVE_PROOF_WRITE_ACK = WRITE_ACK;
export const validateStagingProofOrigin = safeOrigin;
