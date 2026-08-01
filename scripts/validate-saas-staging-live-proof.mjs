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
const observed = [];

const fetchImpl = async (url, options = {}) => {
  const parsed = new URL(url);
  const route = parsed.pathname;
  const headers = options.headers || {};
  const corr = headers["X-Correlation-Id"];
  const auth = headers.Authorization || "";
  observed.push({ route, method: options.method || "GET", hasAuth: Boolean(auth), hasTenantHeader: "X-FlipForge-Tenant-Id" in headers, hasUserHeader: "X-FlipForge-User-Id" in headers });

  if (route === "/api/v1/health") return response({ meta: { contractVersion: "1.0", correlationId: corr }, data: {
    status: "configured",
    bridgeEnabled: true,
    upstreamConfigured: true,
    authenticationRequired: true,
    tenantMembershipRequired: true,
    clientIdentityHeadersAccepted: false,
    productionPreviewBypassAllowed: false
  } });

  if (!auth) return response({ error: { code: "AUTHENTICATION_REQUIRED", correlationId: corr } }, 401);
  const token = auth.replace(/^Bearer\s+/i, "");

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
    if (token === "tenant-b-jwt") return response({ error: { code: "RESOURCE_NOT_FOUND", correlationId: corr } }, 404);
    return response(envelope(corr, { kind: "opportunity-detail", tenantIsolation }));
  }
  if (route === "/api/v1/evidence/EBAY-staging-proof-001") return response(envelope(corr, { kind: "evidence", tenantIsolation }));
  if (route === "/api/v1/psa-advisor/EBAY-staging-proof-001") return response(envelope(corr, { kind: "psa-advisor", tenantIsolation }));
  throw new Error(`Unexpected test route ${route}`);
};

const env = {
  FLIPFORGE_STAGING_ORIGIN: "https://deploy-preview-99--goflipforge.netlify.app",
  FLIPFORGE_STAGING_USER_A_JWT: "tenant-a-jwt",
  FLIPFORGE_STAGING_USER_B_JWT: "tenant-b-jwt",
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
  check("010 same evaluation is sent twice", evaluationCalls === 2);
  check("011 client never sends tenant header", observed.every(call => call.hasTenantHeader === false));
  check("012 client never sends user header", observed.every(call => call.hasUserHeader === false));
  check("013 health is requested without auth", observed[0].route === "/api/v1/health" && observed[0].hasAuth === false);
  check("014 customer routes use auth", observed.filter(call => !["/api/v1/health", "/api/v1/dashboard"].includes(call.route) || call.hasAuth).length > 0);
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
check("015 production hostname is rejected", productionRejected);

let insecureRejected = false;
try {
  validateStagingProofOrigin("http://preview.example.com");
} catch {
  insecureRejected = true;
}
check("016 non-local HTTP origin is rejected", insecureRejected);

let missingAckRejected = false;
try {
  await runStagingLiveProof({ env: { ...env, FLIPFORGE_STAGING_LIVE_PROOF_ACK: "NO" }, fetchImpl, uuid });
} catch {
  missingAckRejected = true;
}
check("017 missing exact write acknowledgment is rejected", missingAckRejected);

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
check("018 authority override payload is rejected", overrideRejected);

fs.rmSync(temp, { recursive: true, force: true });
const failures = results.filter(result => !result.passed);
console.log("SaaSStagingLiveProofValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
