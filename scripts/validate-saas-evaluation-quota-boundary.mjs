import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const gatewaySource = read("netlify/functions/flipforge-api.js");
const evaluationAdapter = read("saas-prototype/staging-evaluation.js");
const entitlementAdapter = read("saas-prototype/customer-entitlements.js");
const docs = read("docs/SAAS_EVALUATION_QUOTA_BOUNDARY.md");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 gateway preserves evaluation limit code", gatewaySource.includes('status === 429 && upstreamCode === "EVALUATION_LIMIT_REACHED"'));
check("002 gateway preserves entitlement access code", gatewaySource.includes('status === 403 && upstreamCode === "ENTITLEMENT_ACCESS_DENIED"'));
check("003 gateway validates Retry-After as numeric", gatewaySource.includes('safeRetryAfter') && gatewaySource.includes('"Retry-After"'));
check("004 customer evaluate recognizes evaluation limit", evaluationAdapter.includes('error.code === "EVALUATION_LIMIT_REACHED"') && evaluationAdapter.includes("error.status === 429"));
check("005 customer evaluate points to Plan and Usage", evaluationAdapter.includes("Open Plan & Usage to review current usage"));
check("006 entitlement 403 is not treated as membership failure", evaluationAdapter.includes('error.code === "ENTITLEMENT_ACCESS_DENIED"') && evaluationAdapter.includes("!membershipError"));
check("007 Plan and Usage renders reservations", entitlementAdapter.includes("inProgressReservations") && entitlementAdapter.includes("In progress reserved"));
check("008 Plan and Usage renders admission usage", entitlementAdapter.includes("admissionUsage") && entitlementAdapter.includes("Admission usage"));
check("009 Plan and Usage states failed reservation release", entitlementAdapter.includes("Failed evaluations release their reservation"));
check("010 browser has no quota override", !/quotaOverride|allowEvaluation\s*=\s*true|forceEvaluation/i.test(evaluationAdapter + entitlementAdapter));
check("011 browser has no payment controls", !/Checkout now|Subscribe now|Upgrade now|cardNumber|cvv|paymentToken|clientSecret/i.test(evaluationAdapter + entitlementAdapter));
check("012 docs retain server authority", docs.includes("server-owned") && docs.includes("browser cannot override"));
check("013 docs retain Private Beta boundary", docs.includes("Private Beta remains unbounded"));
check("014 docs retain no billing activation", docs.includes("does not connect billing"));

const previousEnv = { ...process.env };
const previousFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
const rawTenant = "quota-browser-tenant-a";
const serviceToken = "quota-boundary-service-token-1234567890-abcdef";
const origin = "https://deploy-preview-42--goflipforge.netlify.app";
const context = {
  clientContext: {
    user: {
      email: "quota-tester@example.com",
      app_metadata: {
        flipforge: { access: "active", tenantId: rawTenant }
      }
    }
  }
};
const evaluationEvent = correlationId => ({
  httpMethod: "POST",
  path: "/.netlify/functions/flipforge-api/api/v1/evaluations",
  headers: {
    host: "deploy-preview-42--goflipforge.netlify.app",
    origin,
    "content-type": "application/json",
    "x-correlation-id": correlationId,
    "idempotency-key": `quota-${correlationId}`
  },
  multiValueHeaders: {},
  queryStringParameters: {},
  body: JSON.stringify({
    externalListingId: "quota-validation-listing",
    marketplace: "EBAY",
    cardIdentity: "Validation fixture",
    listingUrl: "https://example.invalid/listing",
    itemPriceCents: 10000
  })
});

try {
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-backend.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = serviceToken;
  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  const upstreamCalls = [];
  let mode = "limit";
  globalThis.fetch = async (url, options = {}) => {
    upstreamCalls.push({ url: String(url), options });
    const requestCorrelation = options?.headers?.["X-Correlation-Id"];
    if (mode === "limit") {
      return new Response(JSON.stringify({
        error: {
          code: "EVALUATION_LIMIT_REACHED",
          message: "backend detail that must not be copied verbatim",
          correlationId: requestCorrelation
        }
      }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "86400" }
      });
    }
    return new Response(JSON.stringify({
      error: {
        code: "ENTITLEMENT_ACCESS_DENIED",
        message: "backend entitlement detail that must stay private",
        correlationId: requestCorrelation
      }
    }), {
      status: 403,
      headers: { "content-type": "application/json" }
    });
  };

  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const limited = await handler(evaluationEvent("quota-limit-01"), context);
  const limitedBody = JSON.parse(limited.body);
  check("015 quota response remains HTTP 429", limited.statusCode === 429);
  check("016 quota response preserves stable code", limitedBody?.error?.code === "EVALUATION_LIMIT_REACHED");
  check("017 quota response uses gateway-safe message", limitedBody?.error?.message === "Your monthly evaluation limit has been reached.");
  check("018 quota response preserves safe Retry-After", limited.headers?.["Retry-After"] === "86400");
  check("019 quota response remains no-store", String(limited.headers?.["Cache-Control"] || "").includes("no-store"));
  check("020 gateway makes one upstream quota call", upstreamCalls.length === 1);
  check("021 gateway attaches tenant only upstream", upstreamCalls[0]?.options?.headers?.["X-FlipForge-Tenant-Id"] === rawTenant);
  check("022 gateway attaches service token only upstream", upstreamCalls[0]?.options?.headers?.Authorization === `Bearer ${serviceToken}`);
  check("023 quota browser response hides tenant", !limited.body.includes(rawTenant));
  check("024 quota browser response hides service token", !limited.body.includes(serviceToken));
  check("025 quota browser response strips backend message", !limited.body.includes("backend detail"));

  mode = "access";
  const denied = await handler(evaluationEvent("quota-access-01"), context);
  const deniedBody = JSON.parse(denied.body);
  check("026 entitlement denial remains HTTP 403", denied.statusCode === 403);
  check("027 entitlement denial preserves stable code", deniedBody?.error?.code === "ENTITLEMENT_ACCESS_DENIED");
  check("028 entitlement denial uses gateway-safe message", deniedBody?.error?.message === "Your current FlipForge access does not permit a new evaluation.");
  check("029 entitlement denial strips backend message", !denied.body.includes("backend entitlement detail"));
  check("030 entitlement browser response hides tenant", !denied.body.includes(rawTenant));
  check("031 entitlement browser response hides service token", !denied.body.includes(serviceToken));

  const inactiveContext = {
    clientContext: {
      user: {
        email: "inactive@example.com",
        app_metadata: { flipforge: { access: "inactive", tenantId: rawTenant } }
      }
    }
  };
  const beforeMembership = upstreamCalls.length;
  const membership = await handler(evaluationEvent("quota-membership-01"), inactiveContext);
  const membershipBody = JSON.parse(membership.body);
  check("032 membership 403 keeps membership-specific code", membership.statusCode === 403 && membershipBody?.error?.code === "TENANT_MEMBERSHIP_INACTIVE");
  check("033 membership denial makes no upstream call", upstreamCalls.length === beforeMembership);
} finally {
  globalThis.fetch = previousFetch;
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
}

const failures = results.filter(result => !result.passed);
console.log("SaaSEvaluationQuotaBoundaryValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
