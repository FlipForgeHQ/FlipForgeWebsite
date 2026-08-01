import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_VERSION = "1.0";
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{8,100}$/;
const WRITE_ACK = "RUN_STAGING_WRITE_PROOF";
const MAX_RESPONSE_BYTES = 1_000_000;

function required(env, name) {
  const value = String(env[name] || "").trim();
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

async function call(fetchImpl, origin, route, { token = null, method = "GET", body = null, idempotencyKey = null, expect = [200], uuid = crypto.randomUUID } = {}) {
  const corr = correlationId(uuid);
  const headers = {
    Accept: "application/json",
    "X-Correlation-Id": corr
  };
  if (token) headers.Authorization = `Bearer ${token}`;
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
  const tokenA = required(env, "FLIPFORGE_STAGING_USER_A_JWT");
  const tokenB = required(env, "FLIPFORGE_STAGING_USER_B_JWT");
  const unprovisioned = String(env.FLIPFORGE_STAGING_UNPROVISIONED_JWT || "").trim();
  if (required(env, "FLIPFORGE_STAGING_LIVE_PROOF_ACK") !== WRITE_ACK) {
    throw new Error(`FLIPFORGE_STAGING_LIVE_PROOF_ACK must equal ${WRITE_ACK}.`);
  }
  const payload = readEvaluationPayload(required(env, "FLIPFORGE_STAGING_EVALUATION_PAYLOAD_FILE"));
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
  record(proof, "gateway-health", "PASS", { correlationId: health.correlationId, status: health.response.status });

  const unauth = await call(fetchImpl, origin, "/api/v1/dashboard", { expect: [401], uuid });
  if (!unauth.payload.error || unauth.payload.error.code !== "AUTHENTICATION_REQUIRED") throw new Error("Unauthenticated boundary did not return AUTHENTICATION_REQUIRED.");
  record(proof, "unauthenticated-deny", "PASS", { correlationId: unauth.correlationId, status: unauth.response.status });

  if (unprovisioned) {
    const unprov = await call(fetchImpl, origin, "/api/v1/dashboard", { token: unprovisioned, expect: [403], uuid });
    if (!unprov.payload.error || !String(unprov.payload.error.code || "").startsWith("TENANT_MEMBERSHIP_")) {
      throw new Error("Unprovisioned identity did not fail with tenant-membership denial.");
    }
    record(proof, "unprovisioned-deny", "PASS", { correlationId: unprov.correlationId, status: unprov.response.status });
  }

  const dashboard = await call(fetchImpl, origin, "/api/v1/dashboard", { token: tokenA, uuid });
  const dashboardData = assertEnvelope(dashboard.payload, dashboard.correlationId);
  assertTenantIsolation(dashboardData);
  record(proof, "tenant-a-dashboard", "PASS", { correlationId: dashboard.correlationId, status: dashboard.response.status });

  const opportunities = await call(fetchImpl, origin, "/api/v1/opportunities", { token: tokenA, uuid });
  const opportunitiesData = assertEnvelope(opportunities.payload, opportunities.correlationId);
  assertTenantIsolation(opportunitiesData);
  record(proof, "tenant-a-opportunities", "PASS", { correlationId: opportunities.correlationId, status: opportunities.response.status });

  const evaluation = await call(fetchImpl, origin, "/api/v1/evaluations", {
    token: tokenA,
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
    token: tokenA,
    method: "POST",
    body: payload,
    idempotencyKey,
    expect: [200, 201],
    uuid
  });
  const replayData = assertEnvelope(replay.payload, replay.correlationId);
  if (replayData.opportunityId !== opportunityId || replayData.idempotentReplay !== true) throw new Error("Evaluation idempotent replay proof failed.");
  record(proof, "tenant-a-idempotent-replay", "PASS", { correlationId: replay.correlationId, status: replay.response.status, opportunityId });

  const detail = await call(fetchImpl, origin, `/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, { token: tokenA, uuid });
  const detailData = assertEnvelope(detail.payload, detail.correlationId);
  assertTenantIsolation(detailData);
  record(proof, "tenant-a-saved-detail", "PASS", { correlationId: detail.correlationId, status: detail.response.status, opportunityId });

  const evidence = await call(fetchImpl, origin, `/api/v1/evidence/${encodeURIComponent(opportunityId)}`, { token: tokenA, uuid });
  const evidenceData = assertEnvelope(evidence.payload, evidence.correlationId);
  assertTenantIsolation(evidenceData);
  record(proof, "tenant-a-evidence", "PASS", { correlationId: evidence.correlationId, status: evidence.response.status, opportunityId });

  const psa = await call(fetchImpl, origin, `/api/v1/psa-advisor/${encodeURIComponent(opportunityId)}`, { token: tokenA, uuid });
  const psaData = assertEnvelope(psa.payload, psa.correlationId);
  assertTenantIsolation(psaData);
  record(proof, "tenant-a-psa", "PASS", { correlationId: psa.correlationId, status: psa.response.status, opportunityId });

  const crossTenant = await call(fetchImpl, origin, `/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, { token: tokenB, expect: [404], uuid });
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
    productionActivated: false
  };
  return proof;
}

export const STAGING_LIVE_PROOF_WRITE_ACK = WRITE_ACK;
export const validateStagingProofOrigin = safeOrigin;
