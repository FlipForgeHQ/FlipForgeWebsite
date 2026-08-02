import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runStagingLiveProof, validateStagingProofOrigin } from "./lib/saas-staging-live-proof.mjs";

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });
const tenantIsolation = {
  enforced: true,
  defaultAccess: "DENY",
  tenantAuditKey: "audit-key-001",
  idempotencyScope: "TENANT",
  opportunityOwnership: "GRANTED_ON_COMPLETION"
};

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "validation",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-01T15:00:00Z",
      correlationId
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "flipforge-live-proof-"));
const payloadPath = path.join(temp, "evaluation.json");
fs.writeFileSync(payloadPath, JSON.stringify({
  externalListingId: "staging-proof-001",
  marketplace: "EBAY",
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
  listingUrl: "https://example.invalid/staging-proof-001",
  seller: "staging-proof-seller",
  itemPriceCents: 52525,
  shippingCents: 850,
  buyerPremiumCents: 0,
  taxCents: 4202,
  listingFormat: "FIXED_PRICE"
}, null, 2));

let uuidCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;
let evaluationCalls = 0;
let lifecycleVersion = 0;
let lifecycleHistory = [];
const observed = [];

const fetchImpl = async (url, options = {}) => {
  const parsed = new URL(url);
  const route = parsed.pathname;
  const headers = options.headers || {};
  const corr = headers["X-Correlation-Id"];
  const authorization = headers.Authorization || "";
  const cookie = headers.Cookie || "";

  if (route === "/.netlify/identity/token") {
    const credentials = new URLSearchParams(String(options.body || ""));
    const username = credentials.get("username");
    const session = username === "user-a@example.invalid"
      ? "tenant-a"
      : username === "user-b@example.invalid"
        ? "tenant-b"
        : "unknown";
    observed.push({ kind: "identity", route, method: options.method || "GET", hasAuth: Boolean(authorization), hasCookie: Boolean(cookie) });
    if (session === "unknown" || credentials.get("password") !== `${session}-password`) {
      return response({ msg: "invalid login" }, 401);
    }
    return response({
      access_token: `${session}-access`,
      refresh_token: `${session}-refresh`,
      token_type: "bearer",
      expires_in: 3600
    });
  }

  observed.push({ kind: "api", route, method: options.method || "GET", hasAuth: Boolean(authorization), hasCookie: Boolean(cookie), hasTenantHeader: "X-FlipForge-Tenant-Id" in headers, hasUserHeader: "X-FlipForge-User-Id" in headers });

  if (route === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId: corr }, data: {
    status: "configured",
    bridgeEnabled: true,
    upstreamConfigured: true,
    authenticationRequired: true,
    tenantMembershipRequired: true,
    clientIdentityHeadersAccepted: false,
    productionPreviewBypassAllowed: false,
    authenticationTransport: "secure-same-origin-cookie",
    membershipSource: "netlify-identity-signed-roles"
  } });

  if (!cookie) return response({ error: { code: "AUTHENTICATION_REQUIRED", correlationId: corr } }, 401);
  const tenantB = cookie.includes("nf_jwt=tenant-b-access");

  if (route === "/api/v1/dashboard") return response(envelope(corr, { kind: "dashboard", tenantIsolation }));
  if (route === "/api/v1/opportunities") return response(envelope(corr, { kind: "opportunities", items: [], tenantIsolation }));

  if (route === "/api/v1/evaluations" && options.method === "POST") {
    evaluationCalls++;
    return response(envelope(corr, {
      kind: "evaluation",
      requestId: headers["Idempotency-Key"],
      opportunityId: "EBAY-staging-proof-001",
      idempotentReplay: evaluationCalls > 1,
      persistedToSqlite: true,
      tenantOwned: true,
      requestCanVerifyEvidence: false,
      requestCanVerifyIdentity: false,
      evidenceAcceptedByRequest: false,
      psaRecalculated: false,
      transactionAuthorized: false,
      providerCredentialsExposed: false,
      tenantIsolation
    }));
  }

  if (route === "/api/v1/opportunities/EBAY-staging-proof-001") {
    if (tenantB) return response({ error: { code: "RESOURCE_NOT_FOUND", correlationId: corr } }, 404);
    return response(envelope(corr, { kind: "opportunity-detail", tenantIsolation }));
  }
  if (route === "/api/v1/evidence/EBAY-staging-proof-001") return response(envelope(corr, { kind: "evidence", tenantIsolation }));
  if (route === "/api/v1/psa-advisor/EBAY-staging-proof-001") return response(envelope(corr, { kind: "psa-advisor", tenantIsolation }));
  if (route === "/api/v1/lifecycle/EBAY-staging-proof-001") {
    if (tenantB) return response({ error: { code: "RESOURCE_NOT_FOUND", correlationId: corr } }, 404);
    if (options.method === "PUT") {
      const body = JSON.parse(String(options.body || "{}"));
      if (body.expectedVersion !== lifecycleVersion) {
        return response({ error: { code: "LIFECYCLE_VERSION_CONFLICT", correlationId: corr } }, 409);
      }
      lifecycleVersion++;
      lifecycleHistory = [{
        eventId: 1,
        eventType: "CREATED",
        trackingStatus: body.trackingStatus,
        reviewAt: body.reviewAt,
        outcomeStatus: body.outcomeStatus,
        alertEnabled: body.alertEnabled,
        recordVersion: lifecycleVersion,
        recordedAt: "2026-08-01T15:00:00Z"
      }];
      return response(envelope(corr, {
        kind: "lifecycle-detail",
        opportunityId: "EBAY-staging-proof-001",
        sourceOfTruth: "SQLite",
        transactionAuthority: false,
        lifecycle: { opportunityId: "EBAY-staging-proof-001", ...body, version: lifecycleVersion },
        history: lifecycleHistory,
        tenantIsolation
      }));
    }
    return response(envelope(corr, {
      kind: "lifecycle-detail",
      opportunityId: "EBAY-staging-proof-001",
      sourceOfTruth: "SQLite",
      transactionAuthority: false,
      lifecycle: { opportunityId: "EBAY-staging-proof-001", trackingStatus: lifecycleVersion ? "REVIEW" : "WATCHING", reviewAt: lifecycleVersion ? "2026-08-08T15:00:00.000Z" : null, outcomeStatus: "NONE", alertEnabled: lifecycleVersion > 0, version: lifecycleVersion },
      history: lifecycleHistory,
      tenantIsolation
    }));
  }
  if (route === "/api/v1/alerts") return response(envelope(corr, {
    kind: "alerts",
    configured: true,
    notificationDeliveryConfigured: false,
    transactionAuthority: false,
    items: [{ opportunityId: "EBAY-staging-proof-001", enabled: true, reviewAt: "2026-08-08T15:00:00.000Z" }],
    tenantIsolation
  }));
  throw new Error(`Unexpected test route ${route}`);
};

const env = {
  FLIPFORGE_STAGING_ORIGIN: "https://deploy-preview-99--goflipforge.netlify.app",
  FLIPFORGE_STAGING_USER_A_EMAIL: "user-a@example.invalid",
  FLIPFORGE_STAGING_USER_A_PASSWORD: "tenant-a-password",
  FLIPFORGE_STAGING_USER_B_EMAIL: "user-b@example.invalid",
  FLIPFORGE_STAGING_USER_B_PASSWORD: "tenant-b-password",
  FLIPFORGE_STAGING_LIVE_PROOF_ACK: "RUN_STAGING_WRITE_PROOF",
  FLIPFORGE_STAGING_EVALUATION_PAYLOAD_FILE: payloadPath
};

try {
  const proof = await runStagingLiveProof({ env, fetchImpl, uuid, clock: () => new Date("2026-08-01T15:00:00Z") });
  check("001 proof passes simulated end-to-end path", proof.result === "PASS");
  check("002 proof records no secrets", proof.secretsRecorded === false);
  check("003 proof preserves Smart Opportunity authority", proof.authority === "Smart Opportunity");
  check("004 proof preserves PSA authority", proof.gradingAuthority === "Existing PSA intelligence");
  check("005 proof denies transaction authority", proof.transactionAuthority === false);
  check("006 proof verifies SQLite persistence", proof.summary.sqlitePersistenceProved === true);
  check("007 proof verifies tenant isolation", proof.summary.tenantIsolationProved === true);
  check("008 proof verifies idempotency", proof.summary.idempotencyProved === true);
  check("009 proof does not claim production activation", proof.summary.productionActivated === false);
  check("009a proof verifies lifecycle persistence", proof.summary.lifecyclePersistenceProved === true);
  check("009b proof verifies append-only lifecycle history", proof.summary.lifecycleHistoryProved === true);
  check("009c proof verifies optimistic conflict denial", proof.summary.optimisticConflictProved === true);
  check("009d proof verifies in-app alert projection", proof.summary.inAppAlertProjectionProved === true);
  check("009e proof proves the Decision Dossier source set", proof.summary.decisionDossierSourceSetProved === true);
  check("010 same evaluation is sent twice", evaluationCalls === 2);
  check("011 client never sends tenant header", observed.every(call => call.hasTenantHeader !== true));
  check("012 client never sends user header", observed.every(call => call.hasUserHeader !== true));
  const identityCalls = observed.filter(call => call.kind === "identity");
  const apiCalls = observed.filter(call => call.kind === "api");
  check("013 controlled users establish two isolated Identity sessions", identityCalls.length === 2);
  check("014 Identity sign-in receives no prior auth material", identityCalls.every(call => call.method === "POST" && !call.hasAuth && !call.hasCookie));
  check("015 health is requested without auth", apiCalls[0].route === "/api/v1/health" && !apiCalls[0].hasAuth && !apiCalls[0].hasCookie);
  check("016 unauthenticated boundary has no cookie", apiCalls[1].route === "/api/v1/dashboard" && !apiCalls[1].hasCookie);
  check("017 authenticated customer routes use cookie sessions", apiCalls.slice(2).every(call => call.hasCookie));
  check("018 customer identity is never sent as Bearer authorization", apiCalls.every(call => !call.hasAuth));
  check("018a lifecycle proof performs two controlled writes", apiCalls.filter(call => call.route === "/api/v1/lifecycle/EBAY-staging-proof-001" && call.method === "PUT").length === 2);
  check("018b lifecycle proof includes cross-tenant detail denial", apiCalls.some(call => call.route === "/api/v1/lifecycle/EBAY-staging-proof-001" && call.hasCookie && call.method === "GET"));
} catch (error) {
  console.error(error);
  check("001 proof passes simulated end-to-end path", false);
}

let productionRejected = false;
try {
  validateStagingProofOrigin("https://goflipforge.com");
} catch {
  productionRejected = true;
}
check("019 production hostname is rejected", productionRejected);

let insecureRejected = false;
try {
  validateStagingProofOrigin("http://deploy-preview-99--goflipforge.netlify.app");
} catch {
  insecureRejected = true;
}
check("020 non-local HTTP origin is rejected", insecureRejected);

let unapprovedHostRejected = false;
try {
  validateStagingProofOrigin("https://preview.example.com");
} catch {
  unapprovedHostRejected = true;
}
check("021 unapproved HTTPS host is rejected before credentials", unapprovedHostRejected);

let missingAckRejected = false;
try {
  await runStagingLiveProof({ env: { ...env, FLIPFORGE_STAGING_LIVE_PROOF_ACK: "NO" }, fetchImpl, uuid });
} catch {
  missingAckRejected = true;
}
check("022 missing exact write acknowledgment is rejected", missingAckRejected);

const unsafePath = path.join(temp, "unsafe.json");
fs.writeFileSync(unsafePath, JSON.stringify({
  externalListingId: "unsafe",
  marketplace: "EBAY",
  cardIdentity: "unsafe",
  listingUrl: "https://example.invalid/unsafe",
  listingFormat: "FIXED_PRICE",
  itemPriceCents: 1,
  shippingCents: 0,
  buyerPremiumCents: 0,
  taxCents: 0,
  recommendation: "BUY"
}));
let overrideRejected = false;
try {
  await runStagingLiveProof({ env: { ...env, FLIPFORGE_STAGING_EVALUATION_PAYLOAD_FILE: unsafePath }, fetchImpl, uuid });
} catch {
  overrideRejected = true;
}
check("023 authority override payload is rejected", overrideRejected);

let credentialFailureRedacted = false;
try {
  await runStagingLiveProof({
    env: { ...env, FLIPFORGE_STAGING_USER_A_PASSWORD: "wrong-secret-password" },
    fetchImpl,
    uuid
  });
} catch (error) {
  const message = String(error && error.message ? error.message : error);
  credentialFailureRedacted = !message.includes("wrong-secret-password") && !message.includes("user-a@example.invalid");
}
check("024 Identity failure does not echo credentials", credentialFailureRedacted);

let partialOptionalCredentialsRejected = false;
try {
  await runStagingLiveProof({
    env: { ...env, FLIPFORGE_STAGING_UNPROVISIONED_EMAIL: "unprovisioned@example.invalid" },
    fetchImpl,
    uuid
  });
} catch (error) {
  partialOptionalCredentialsRejected = String(error && error.message ? error.message : error).includes("must be supplied together");
}
check("025 partial optional Identity credentials fail closed", partialOptionalCredentialsRejected);

fs.rmSync(temp, { recursive: true, force: true });
const failures = results.filter(result => !result.passed);
console.log("SaaSStagingLiveProofValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
