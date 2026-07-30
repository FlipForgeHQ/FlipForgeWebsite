import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const gatewayPath = path.join(repositoryRoot, "netlify/functions/flipforge-api.js");
const source = fs.readFileSync(gatewayPath, "utf8");
const require = createRequire(import.meta.url);

const environmentNames = [
  "CONTEXT",
  "FLIPFORGE_API_BRIDGE_ENABLED",
  "FLIPFORGE_API_BASE_URL",
  "FLIPFORGE_API_SERVICE_TOKEN",
  "FLIPFORGE_API_ALLOWED_ORIGINS",
  "FLIPFORGE_API_TIMEOUT_MS",
  "FLIPFORGE_API_MAX_RESPONSE_BYTES",
  "FLIPFORGE_API_MAX_REQUEST_BYTES",
  "FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW",
  "FLIPFORGE_API_PREVIEW_TENANT_ID"
];

const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
};
const logs = [];
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}

function clearEnvironment() {
  for (const name of environmentNames) delete process.env[name];
}

function json(response) {
  return JSON.parse(response.body || "{}");
}

function event(method, pathName, options = {}) {
  return {
    httpMethod: method,
    path: pathName,
    headers: {
      host: "deploy-preview-tenant--goflipforge.netlify.app",
      ...(options.headers || {})
    },
    multiValueHeaders: options.multiValueHeaders || {},
    queryStringParameters: options.queryStringParameters || {},
    rawQuery: options.rawQuery || "",
    body: options.body || ""
  };
}

function userContext(tenantId, access = "active", overrides = {}) {
  const flipforge = tenantId === undefined
    ? undefined
    : { tenantId, access, ...(overrides.membership || {}) };
  return {
    clientContext: {
      user: {
        sub: overrides.sub || "verified-user-001",
        email: overrides.email || "owner@example.invalid",
        app_metadata: {
          ...(flipforge === undefined ? {} : { flipforge }),
          ...(overrides.appMetadata || {})
        }
      }
    }
  };
}

function validEnvelope(correlationId, data = { kind: "dashboard" }) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "tenant-gateway-validation",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-07-30T20:30:00Z",
      correlationId,
      evidenceFreshness: "VALIDATION",
      limitations: ["Validation fixture only."]
    },
    data
  };
}

function errorCode(response) {
  return json(response).error?.code;
}

check("001 signed app metadata is the membership source", source.includes("user.app_metadata") && source.includes("metadata.flipforge"));
check("002 active membership is required", source.includes('String(membership.access || "").toLowerCase() !== "active"'));
check("003 tenant identifiers use the backend-compatible safe pattern", source.includes("SAFE_TENANT_ID") && source.includes("{2,127}"));
check("004 browser tenant and user headers are explicitly rejected", source.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN") && source.includes("clientIdentityHeaderPresent"));
check("005 upstream tenant header is server generated", source.includes("[TENANT_HEADER]: tenant.tenantId"));
check("006 raw authenticated user identifier is not forwarded upstream", !source.includes("String(user.sub)") && !source.includes("[USER_HEADER]:"));
check("007 evaluation idempotency is validated and forwarded", source.includes("SAFE_IDEMPOTENCY_KEY") && source.includes("[IDEMPOTENCY_HEADER]: idempotency.value"));
check("008 preview tenant comes from server environment", source.includes("FLIPFORGE_API_PREVIEW_TENANT_ID"));
check("009 production preview bypass remains forbidden", source.includes('context !== "production"'));
check("010 gateway does not persist identity in browser storage", !/localStorage|sessionStorage|indexedDB/i.test(source));
check("011 gateway contains no transaction execution route", !/auto-buy|placeBid|paymentIntent|authorizePurchase/i.test(source));

try {
  clearEnvironment();
  console.info = (...values) => logs.push(values.join(" "));
  console.warn = (...values) => logs.push(values.join(" "));
  console.error = (...values) => logs.push(values.join(" "));
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const health = await handler(event("GET", "/api/v1/health"), {});
  const healthData = json(health).data;
  check("012 health remains public", health.statusCode === 200);
  check("013 health reports tenant membership requirement", healthData.tenantMembershipRequired === true);
  check("014 health reports client identity headers disabled", healthData.clientIdentityHeadersAccepted === false);
  check("015 health reports evaluation idempotency requirement", healthData.evaluationIdempotencyRequired === true);
  check("016 health does not expose a tenant identifier", !health.body.includes("preview_sandbox_001") && !health.body.includes("tenant_alpha_001"));

  const unauthenticated = await handler(event("GET", "/api/v1/dashboard"), {});
  check("017 unauthenticated data access returns 401", unauthenticated.statusCode === 401 && errorCode(unauthenticated) === "AUTHENTICATION_REQUIRED");

  const unprovisioned = await handler(event("GET", "/api/v1/dashboard"), userContext(undefined));
  check("018 authenticated but unprovisioned user returns 403", unprovisioned.statusCode === 403 && errorCode(unprovisioned) === "TENANT_MEMBERSHIP_REQUIRED");

  const inactive = await handler(event("GET", "/api/v1/dashboard"), userContext("tenant_alpha_001", "suspended"));
  check("019 inactive membership returns 403", inactive.statusCode === 403 && errorCode(inactive) === "TENANT_MEMBERSHIP_INACTIVE");

  const invalidMembership = await handler(event("GET", "/api/v1/dashboard"), userContext("unsafe tenant", "active"));
  check("020 unsafe tenant membership returns 403", invalidMembership.statusCode === 403 && errorCode(invalidMembership) === "TENANT_MEMBERSHIP_INVALID");

  const spoofedTenant = await handler(
    event("GET", "/api/v1/dashboard", { headers: { "x-flipforge-tenant-id": "attacker_tenant" } }),
    userContext("tenant_alpha_001")
  );
  check("021 browser tenant header is rejected", spoofedTenant.statusCode === 400 && errorCode(spoofedTenant) === "CLIENT_IDENTITY_HEADER_FORBIDDEN");

  const spoofedUser = await handler(
    event("GET", "/api/v1/dashboard", { headers: { "x-flipforge-user-id": "attacker-user" } }),
    userContext("tenant_alpha_001")
  );
  check("022 browser user header is rejected", spoofedUser.statusCode === 400 && errorCode(spoofedUser) === "CLIENT_IDENTITY_HEADER_FORBIDDEN");

  process.env.CONTEXT = "production";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";
  const productionBypass = await handler(event("GET", "/api/v1/dashboard"), {});
  check("023 production ignores preview bypass", productionBypass.statusCode === 401 && errorCode(productionBypass) === "AUTHENTICATION_REQUIRED");

  process.env.CONTEXT = "deploy-preview";
  delete process.env.FLIPFORGE_API_PREVIEW_TENANT_ID;
  const previewWithoutTenant = await handler(event("GET", "/api/v1/dashboard"), {});
  check("024 preview bypass requires an explicit sandbox tenant", previewWithoutTenant.statusCode === 503 && errorCode(previewWithoutTenant) === "PREVIEW_TENANT_NOT_CONFIGURED");

  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "unsafe preview tenant";
  const invalidPreviewTenant = await handler(event("GET", "/api/v1/dashboard"), {});
  check("025 unsafe preview tenant fails closed", invalidPreviewTenant.statusCode === 503 && errorCode(invalidPreviewTenant) === "PREVIEW_TENANT_NOT_CONFIGURED");

  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";
  const previewBridgeDisabled = await handler(event("GET", "/api/v1/dashboard"), {});
  check("026 valid preview tenant still respects disabled bridge", previewBridgeDisabled.statusCode === 503 && errorCode(previewBridgeDisabled) === "BRIDGE_DISABLED");

  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  const previewMissingUpstream = await handler(event("GET", "/api/v1/dashboard"), {});
  check("027 preview tenant still requires upstream configuration", previewMissingUpstream.statusCode === 503 && errorCode(previewMissingUpstream) === "UPSTREAM_NOT_CONFIGURED");

  process.env.FLIPFORGE_API_BASE_URL = "https://authoritative.example.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = "server-only-membership-token";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(validEnvelope(options.headers["X-Correlation-Id"])),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const authenticated = await handler(
    event("GET", "/api/v1/dashboard", { headers: { "x-correlation-id": "membership-correlation" } }),
    userContext("tenant_alpha_001")
  );
  const authenticatedCall = calls.at(-1);
  check("028 active signed membership reaches upstream", authenticated.statusCode === 200);
  check("029 upstream receives resolved tenant header", authenticatedCall.options.headers["X-FlipForge-Tenant-Id"] === "tenant_alpha_001");
  check("030 upstream receives server service token", authenticatedCall.options.headers.Authorization === "Bearer server-only-membership-token");
  check("031 upstream receives no raw user header", authenticatedCall.options.headers["X-FlipForge-User-Id"] === undefined);
  check("032 browser response contains no tenant identifier", !authenticated.body.includes("tenant_alpha_001"));
  check("033 browser response contains no service token", !authenticated.body.includes("server-only-membership-token"));

  const queryResponse = await handler(
    event("GET", "/api/v1/compare", { rawQuery: "ids=EBAY-listing-1%2CEBAY-listing-2" }),
    userContext("tenant_alpha_001")
  );
  check("034 tenant-aware gateway preserves query string", queryResponse.statusCode === 200 && calls.at(-1).url.endsWith("/api/v1/compare?ids=EBAY-listing-1%2CEBAY-listing-2"));

  const pathResponse = await handler(
    event("GET", "/api/v1/opportunities/EBAY:item.001"),
    userContext("tenant_alpha_001")
  );
  check("035 tenant-aware route permits backend-safe opportunity IDs", pathResponse.statusCode === 200 && calls.at(-1).url.endsWith("/api/v1/opportunities/EBAY:item.001"));

  const callsBeforeMissingIdempotency = calls.length;
  const missingIdempotency = await handler(
    event("POST", "/api/v1/evaluations", { body: "{}" }),
    userContext("tenant_alpha_001")
  );
  check("036 evaluation requires idempotency key", missingIdempotency.statusCode === 400 && errorCode(missingIdempotency) === "IDEMPOTENCY_KEY_REQUIRED");
  check("037 missing idempotency never reaches upstream", calls.length === callsBeforeMissingIdempotency);

  const invalidIdempotency = await handler(
    event("POST", "/api/v1/evaluations", { headers: { "idempotency-key": "bad key" }, body: "{}" }),
    userContext("tenant_alpha_001")
  );
  check("038 unsafe idempotency key is rejected", invalidIdempotency.statusCode === 400 && errorCode(invalidIdempotency) === "INVALID_IDEMPOTENCY_KEY");

  const duplicateIdempotency = await handler(
    event("POST", "/api/v1/evaluations", {
      multiValueHeaders: { "Idempotency-Key": ["tenant-eval-request-0001", "tenant-eval-request-0002"] },
      body: "{}"
    }),
    userContext("tenant_alpha_001")
  );
  check("039 duplicate idempotency headers are rejected", duplicateIdempotency.statusCode === 400 && errorCode(duplicateIdempotency) === "INVALID_IDEMPOTENCY_KEY");

  const evaluationBody = JSON.stringify({ externalListingId: "listing-001" });
  const evaluation = await handler(
    event("POST", "/api/v1/evaluations", {
      headers: { "idempotency-key": "tenant-eval-request-0001" },
      body: evaluationBody
    }),
    userContext("tenant_alpha_001")
  );
  const evaluationCall = calls.at(-1);
  check("040 valid tenant evaluation reaches upstream", evaluation.statusCode === 200);
  check("041 evaluation forwards exact idempotency key", evaluationCall.options.headers["Idempotency-Key"] === "tenant-eval-request-0001");
  check("042 evaluation forwards resolved tenant with idempotency", evaluationCall.options.headers["X-FlipForge-Tenant-Id"] === "tenant_alpha_001");
  check("043 evaluation forwards request body unchanged", evaluationCall.options.body === evaluationBody);

  const secondTenant = await handler(
    event("POST", "/api/v1/evaluations", {
      headers: { "idempotency-key": "tenant-eval-request-0001" },
      body: evaluationBody
    }),
    userContext("tenant_beta_002", "active", { sub: "verified-user-002" })
  );
  check("044 same browser request key can be forwarded for another resolved tenant", secondTenant.statusCode === 200 && calls.at(-1).options.headers["X-FlipForge-Tenant-Id"] === "tenant_beta_002");

  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";
  const noFallbackForMember = await handler(event("GET", "/api/v1/dashboard"), userContext(undefined));
  check("045 authenticated unprovisioned user cannot fall back to preview tenant", noFallbackForMember.statusCode === 403 && errorCode(noFallbackForMember) === "TENANT_MEMBERSHIP_REQUIRED");

  const preflight = await handler(
    event("OPTIONS", "/api/v1/evaluations", { headers: { origin: "https://deploy-preview-tenant--goflipforge.netlify.app" } }),
    {}
  );
  const allowedHeaders = preflight.headers["Access-Control-Allow-Headers"] || "";
  check("046 preflight permits idempotency header", preflight.statusCode === 204 && allowedHeaders.includes("Idempotency-Key"));
  check("047 preflight does not permit browser tenant header", !allowedHeaders.includes("X-FlipForge-Tenant-Id"));

  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";
  globalThis.fetch = async (_url, options) => new Response(
    JSON.stringify({
      ...validEnvelope(options.headers["X-Correlation-Id"]),
      meta: {
        ...validEnvelope(options.headers["X-Correlation-Id"]).meta,
        authority: "Parallel Recommendation Engine"
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const invalidAuthority = await handler(event("GET", "/api/v1/dashboard"), userContext("tenant_alpha_001"));
  check("048 parallel recommendation authority remains rejected", invalidAuthority.statusCode === 502 && errorCode(invalidAuthority) === "UPSTREAM_CONTRACT_INVALID");

  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { code: "IDEMPOTENCY_CONFLICT" } }),
    { status: 409, headers: { "content-type": "application/json" } }
  );
  const upstreamConflict = await handler(
    event("POST", "/api/v1/evaluations", {
      headers: { "idempotency-key": "tenant-eval-request-0003" },
      body: evaluationBody
    }),
    userContext("tenant_alpha_001")
  );
  check("049 upstream client conflict remains a client status", upstreamConflict.statusCode === 409 && errorCode(upstreamConflict) === "UPSTREAM_REJECTED");

  check("050 logs contain no raw tenant identifier", logs.every(line => !line.includes("tenant_alpha_001") && !line.includes("tenant_beta_002") && !line.includes("preview_sandbox_001")));
  check("051 logs contain no raw authenticated subject", logs.every(line => !line.includes("verified-user-001") && !line.includes("verified-user-002")));
} finally {
  globalThis.fetch = originalFetch;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const failures = results.filter(result => !result.passed);
console.log("SaaSGatewayTenantMembershipValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length > 0) process.exitCode = 1;
