import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  inspectStagingEnvironment,
  redactedReadinessReport,
  validateSignedMembership
} from "./lib/saas-staging-readiness.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);

const paths = {
  gateway: path.join(repositoryRoot, "netlify/functions/flipforge-api.js"),
  checker: path.join(repositoryRoot, "scripts/check-saas-staging-readiness.mjs"),
  library: path.join(repositoryRoot, "scripts/lib/saas-staging-readiness.mjs"),
  membershipExample: path.join(repositoryRoot, "docs/examples/saas-tenant-membership.example.json"),
  environmentExample: path.join(repositoryRoot, "docs/examples/saas-staging-environment.example.txt"),
  netlify: path.join(repositoryRoot, "netlify.toml"),
  stagingRead: path.join(repositoryRoot, "saas-prototype/staging-browser.js"),
  stagingEvaluation: path.join(repositoryRoot, "saas-prototype/staging-evaluation.js")
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([key, value]) => [key, fs.readFileSync(value, "utf8")])
);
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}

function event(method, pathName, options = {}) {
  return {
    httpMethod: method,
    path: pathName,
    headers: {
      host: "deploy-preview-activation--goflipforge.netlify.app",
      ...(options.headers || {})
    },
    multiValueHeaders: options.multiValueHeaders || {},
    queryStringParameters: options.queryStringParameters || {},
    rawQuery: options.rawQuery || "",
    body: options.body || ""
  };
}

function userContext(tenantId = "tenant_alpha_001", access = "active") {
  return {
    clientContext: {
      user: {
        sub: "staging-user-001",
        email: "staging-owner@example.invalid",
        app_metadata: {
          flipforge: { access, tenantId }
        }
      }
    }
  };
}

function json(response) {
  return JSON.parse(response.body || "{}");
}

function errorCode(response) {
  return json(response).error?.code;
}

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "staging-activation-readiness-fixture",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-07-30T22:45:00Z",
      correlationId,
      evidenceFreshness: "VALIDATION",
      limitations: ["Readiness fixture only."]
    },
    data
  };
}

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
const originalConsole = { info: console.info, warn: console.warn, error: console.error };

function clearEnvironment() {
  for (const name of environmentNames) delete process.env[name];
}

check("001 readiness library exists", sources.library.includes("validateSignedMembership"));
check("002 readiness checker exists", sources.checker.includes("redactedReadinessReport"));
check("003 tenant IDs use the gateway-compatible safe pattern", sources.library.includes("{2,127}"));
check("004 membership access must be active", sources.library.includes('access !== "active"'));
check("005 membership validator rejects unsupported membership fields", sources.library.includes("TENANT_MEMBERSHIP_FIELDS_INVALID"));
check("006 environment report redacts raw service token values", !sources.checker.includes("console.log(process.env.FLIPFORGE_API_SERVICE_TOKEN"));
check("007 environment checker supports a completeness gate", sources.checker.includes("--require-complete"));
check("008 environment checker supports JSON output", sources.checker.includes("--json"));
check("009 membership example uses signed app metadata", sources.membershipExample.includes('"app_metadata"') && sources.membershipExample.includes('"flipforge"'));
check("010 membership example contains no real user identity", !/@gmail\.com|@yahoo\.com|@outlook\.com/i.test(sources.membershipExample));
check("011 environment example keeps bridge disabled", sources.environmentExample.includes("FLIPFORGE_API_BRIDGE_ENABLED=false"));
check("012 environment example uses a placeholder service token", sources.environmentExample.includes("<set-in-secret-manager-only>"));
check("013 environment example warns against committing real values", /do not commit real values/i.test(sources.environmentExample));
check("014 Netlify remains a static website", /FlipForge remains a static website/i.test(sources.netlify));
check("015 Netlify config contains no bridge activation", !/FLIPFORGE_API_BRIDGE_ENABLED\s*=\s*["']?true/i.test(sources.netlify));
check("016 Netlify config contains no upstream service token", !/FLIPFORGE_API_SERVICE_TOKEN/i.test(sources.netlify));
check("017 gateway remains disabled by default", sources.gateway.includes("function bridgeEnabled()"));
check("018 gateway requires signed app metadata", sources.gateway.includes("resolveSignedMembership"));
check("019 production preview bypass remains forbidden", sources.gateway.includes('context !== "production"'));
check("020 browser staging reads remain isolated", sources.stagingRead.includes("ALLOWED_HOST"));
check("021 browser staging evaluation remains isolated", sources.stagingEvaluation.includes("ALLOWED_HOST"));
check("022 browser cannot inject the tenant header", !sources.stagingEvaluation.includes('"X-FlipForge-Tenant-Id"'));
check("023 browser requires transaction authority false", sources.stagingEvaluation.includes("data.transactionAuthorized === false"));

const validMembership = validateSignedMembership(JSON.parse(sources.membershipExample));
check("024 documented membership example validates", validMembership.ok);
check("025 documented membership canonicalizes access", validMembership.access === "active");
check("026 documented membership canonicalizes tenant", validMembership.tenantId === "tenant_example_001");
check("027 nested function context membership validates", validateSignedMembership(userContext()).ok);
check("028 nested user membership validates", validateSignedMembership({ user: userContext().clientContext.user }).ok);
check("029 direct app metadata validates", validateSignedMembership(userContext().clientContext.user.app_metadata).ok);
check("030 missing app metadata fails", validateSignedMembership(null).code === "APP_METADATA_REQUIRED");
check("031 missing FlipForge membership fails", validateSignedMembership({ app_metadata: {} }).code === "TENANT_MEMBERSHIP_REQUIRED");
check("032 inactive membership fails", validateSignedMembership({ app_metadata: { flipforge: { access: "suspended", tenantId: "tenant_alpha_001" } } }).code === "TENANT_MEMBERSHIP_INACTIVE");
check("033 unsafe tenant membership fails", validateSignedMembership({ app_metadata: { flipforge: { access: "active", tenantId: "unsafe tenant" } } }).code === "TENANT_MEMBERSHIP_INVALID");
check("034 short tenant membership fails", validateSignedMembership({ app_metadata: { flipforge: { access: "active", tenantId: "ab" } } }).code === "TENANT_MEMBERSHIP_INVALID");
check("035 unsupported membership fields fail", validateSignedMembership({ app_metadata: { flipforge: { access: "active", tenantId: "tenant_alpha_001", role: "owner" } } }).code === "TENANT_MEMBERSHIP_FIELDS_INVALID");

const emptyEnvironment = inspectStagingEnvironment({});
check("036 empty environment is non-activating", !emptyEnvironment.readyToActivateStaging && !emptyEnvironment.stagingActive);
check("037 empty environment leaves production disabled", emptyEnvironment.productionDisabled);
check("038 empty environment reports missing context without exposing secrets", emptyEnvironment.warnings.some(item => item.code === "CONTEXT_MISSING"));

const readyEnvironmentValues = {
  CONTEXT: "deploy-preview",
  FLIPFORGE_API_BRIDGE_ENABLED: "false",
  FLIPFORGE_API_BASE_URL: "https://private-staging-api.example.invalid",
  FLIPFORGE_API_SERVICE_TOKEN: "readiness-secret-token-value",
  FLIPFORGE_API_ALLOWED_ORIGINS: "https://deploy-preview-123--goflipforge.netlify.app",
  FLIPFORGE_API_TIMEOUT_MS: "5000",
  FLIPFORGE_API_MAX_RESPONSE_BYTES: "1000000",
  FLIPFORGE_API_MAX_REQUEST_BYTES: "65536",
  FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW: "false"
};
const readyEnvironment = inspectStagingEnvironment(readyEnvironmentValues);
check("039 complete staging environment is safe", readyEnvironment.safe);
check("040 complete disabled staging environment is ready to activate", readyEnvironment.readyToActivateStaging);
check("041 complete disabled staging environment is not active", !readyEnvironment.stagingActive);
check("042 readiness summary confirms service token presence only", readyEnvironment.summary.serviceTokenConfigured === true);
check("043 readiness summary confirms one allowed origin", readyEnvironment.summary.allowedOriginCount === 1);
check("044 readiness report contains no raw service token", !JSON.stringify(redactedReadinessReport(readyEnvironmentValues)).includes("readiness-secret-token-value"));

const activeEnvironment = inspectStagingEnvironment({ ...readyEnvironmentValues, FLIPFORGE_API_BRIDGE_ENABLED: "true" });
check("045 complete enabled staging environment is active", activeEnvironment.stagingActive);
check("046 active staging environment is no longer pending activation", !activeEnvironment.readyToActivateStaging);

const productionBridge = inspectStagingEnvironment({ ...readyEnvironmentValues, CONTEXT: "production", FLIPFORGE_API_BRIDGE_ENABLED: "true" });
check("047 production bridge activation is rejected", productionBridge.errors.some(item => item.code === "PRODUCTION_BRIDGE_ENABLED"));
check("048 production bridge activation is not marked disabled", !productionBridge.productionDisabled);
const productionPreview = inspectStagingEnvironment({ CONTEXT: "production", FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW: "true", FLIPFORGE_API_PREVIEW_TENANT_ID: "preview_sandbox_001" });
check("049 production preview bypass is rejected", productionPreview.errors.some(item => item.code === "PRODUCTION_PREVIEW_BYPASS"));
check("050 preview bypass without tenant is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW: "true" }).errors.some(item => item.code === "PREVIEW_TENANT_INVALID"));
check("051 invalid boolean is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_BRIDGE_ENABLED: "yes" }).errors.some(item => item.code === "FLIPFORGE_API_BRIDGE_ENABLED_INVALID"));
check("052 base URL without token is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_BASE_URL: "https://api.example.invalid" }).errors.some(item => item.code === "UPSTREAM_PAIR_INCOMPLETE"));
check("053 token without base URL is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_SERVICE_TOKEN: "secret" }).errors.some(item => item.code === "UPSTREAM_PAIR_INCOMPLETE"));
check("054 non-HTTPS base URL is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_BASE_URL: "http://api.example.invalid", FLIPFORGE_API_SERVICE_TOKEN: "secret" }).errors.some(item => item.code === "FLIPFORGE_API_BASE_URL_INVALID"));
check("055 wildcard allowed origin is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_ALLOWED_ORIGINS: "https://*.example.invalid" }).errors.some(item => item.code === "ALLOWED_ORIGIN_WILDCARD"));
check("056 malformed allowed origin is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_ALLOWED_ORIGINS: "not-an-origin" }).errors.some(item => item.code === "ALLOWED_ORIGIN_INVALID"));
check("057 excessive timeout is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_TIMEOUT_MS: "10001" }).errors.some(item => item.code === "FLIPFORGE_API_TIMEOUT_MS_OUT_OF_RANGE"));
check("058 excessive request size is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_MAX_REQUEST_BYTES: "65537" }).errors.some(item => item.code === "FLIPFORGE_API_MAX_REQUEST_BYTES_OUT_OF_RANGE"));
check("059 excessive response size is rejected", inspectStagingEnvironment({ CONTEXT: "deploy-preview", FLIPFORGE_API_MAX_RESPONSE_BYTES: "1000001" }).errors.some(item => item.code === "FLIPFORGE_API_MAX_RESPONSE_BYTES_OUT_OF_RANGE"));

try {
  clearEnvironment();
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  delete require.cache[require.resolve(paths.gateway)];
  const { handler } = require(paths.gateway);

  const disabledHealth = await handler(event("GET", "/api/v1/health", { headers: { "x-correlation-id": "readiness-health-disabled" } }), {});
  check("060 disabled health remains public", disabledHealth.statusCode === 200);
  check("061 disabled health reports disabled status", json(disabledHealth).data?.status === "disabled");
  check("062 disabled health reports production preview bypass false", json(disabledHealth).data?.productionPreviewBypassAllowed === false);

  const unauthenticated = await handler(event("GET", "/api/v1/dashboard"), {});
  check("063 unauthenticated staged dashboard fails 401", unauthenticated.statusCode === 401 && errorCode(unauthenticated) === "AUTHENTICATION_REQUIRED");
  const unprovisioned = await handler(event("GET", "/api/v1/dashboard"), { clientContext: { user: { app_metadata: {} } } });
  check("064 authenticated unprovisioned user fails 403", unprovisioned.statusCode === 403 && errorCode(unprovisioned) === "TENANT_MEMBERSHIP_REQUIRED");
  const inactive = await handler(event("GET", "/api/v1/dashboard"), userContext("tenant_alpha_001", "inactive"));
  check("065 inactive staged membership fails 403", inactive.statusCode === 403 && errorCode(inactive) === "TENANT_MEMBERSHIP_INACTIVE");
  const disabledMember = await handler(event("GET", "/api/v1/dashboard"), userContext());
  check("066 active membership still respects disabled bridge", disabledMember.statusCode === 503 && errorCode(disabledMember) === "BRIDGE_DISABLED");

  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-staging-api.example.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = "server-only-readiness-token";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const correlationId = options.headers["X-Correlation-Id"];
    const parsed = new URL(String(url));
    let data;
    if (options.method === "POST" && parsed.pathname === "/api/v1/evaluations") {
      data = {
        kind: "evaluation",
        opportunityId: "EBAY-listing-001",
        tenantOwned: true,
        persistedToSqlite: true,
        transactionAuthorized: false,
        decision: { recommendation: "VERIFY" }
      };
    } else if (parsed.pathname === "/api/v1/opportunities/EBAY-listing-001") {
      data = { opportunity: { id: "EBAY-listing-001", recommendation: "VERIFY" } };
    } else {
      data = { kind: "dashboard", metrics: { trackedOpportunities: 1 } };
    }
    return new Response(JSON.stringify(envelope(correlationId, data)), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const configuredHealth = await handler(event("GET", "/api/v1/health", { headers: { "x-correlation-id": "readiness-health-configured" } }), {});
  check("067 configured staging health reports configured", json(configuredHealth).data?.status === "configured");
  check("068 configured staging health exposes no service token", !configuredHealth.body.includes("server-only-readiness-token"));

  const dashboard = await handler(
    event("GET", "/api/v1/dashboard", { headers: { "x-correlation-id": "readiness-dashboard" } }),
    userContext()
  );
  check("069 signed membership reaches staged dashboard", dashboard.statusCode === 200);
  check("070 dashboard preserves authoritative contract", json(dashboard).meta?.authority === "Smart Opportunity");

  const evaluationBody = JSON.stringify({
    externalListingId: "listing-001",
    marketplace: "EBAY",
    cardIdentity: "Validation Card PSA 10",
    listingUrl: "https://example.invalid/listing-001",
    itemPriceCents: 10000
  });
  const evaluation = await handler(
    event("POST", "/api/v1/evaluations", {
      headers: {
        "x-correlation-id": "readiness-evaluation",
        "idempotency-key": "readiness-evaluation-0001"
      },
      body: evaluationBody
    }),
    userContext()
  );
  check("071 staged evaluation succeeds", evaluation.statusCode === 200);
  check("072 staged evaluation remains decision support", json(evaluation).data?.transactionAuthorized === false);
  check("073 staged evaluation reports SQLite persistence", json(evaluation).data?.persistedToSqlite === true);
  check("074 staged evaluation returns saved opportunity identifier", json(evaluation).data?.opportunityId === "EBAY-listing-001");

  const saved = await handler(
    event("GET", "/api/v1/opportunities/EBAY-listing-001", { headers: { "x-correlation-id": "readiness-saved" } }),
    userContext()
  );
  check("075 saved staged opportunity succeeds", saved.statusCode === 200);
  check("076 saved staged opportunity matches evaluation result", json(saved).data?.opportunity?.id === "EBAY-listing-001");
  check("077 full staged smoke sequence reached three upstream data calls", calls.length === 3);
  check("078 every staged call receives the signed tenant", calls.every(call => call.options.headers["X-FlipForge-Tenant-Id"] === "tenant_alpha_001"));
  check("079 every staged call receives the server-only token", calls.every(call => call.options.headers.Authorization === "Bearer server-only-readiness-token"));
  check("080 no staged call receives a raw user header", calls.every(call => call.options.headers["X-FlipForge-User-Id"] === undefined));
  check("081 only evaluation receives idempotency key", calls.filter(call => call.options.headers["Idempotency-Key"]).length === 1);
  check("082 evaluation receives exact idempotency key", calls.find(call => call.options.method === "POST")?.options.headers["Idempotency-Key"] === "readiness-evaluation-0001");
  check("083 evaluation body is forwarded unchanged", calls.find(call => call.options.method === "POST")?.options.body === evaluationBody);
  check("084 browser responses expose no service token", !dashboard.body.includes("server-only-readiness-token") && !evaluation.body.includes("server-only-readiness-token") && !saved.body.includes("server-only-readiness-token"));
  check("085 browser responses expose no tenant header value", !dashboard.body.includes("tenant_alpha_001") && !evaluation.body.includes("tenant_alpha_001") && !saved.body.includes("tenant_alpha_001"));

  const callsBeforeRollback = calls.length;
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "false";
  const rolledBack = await handler(event("GET", "/api/v1/dashboard"), userContext());
  check("086 rollback disables staged data access", rolledBack.statusCode === 503 && errorCode(rolledBack) === "BRIDGE_DISABLED");
  check("087 rollback prevents any upstream request", calls.length === callsBeforeRollback);
  const rollbackHealth = await handler(event("GET", "/api/v1/health"), {});
  check("088 rollback health reports disabled", json(rollbackHealth).data?.status === "disabled");

  process.env.CONTEXT = "production";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";
  const productionBypass = await handler(event("GET", "/api/v1/dashboard"), {});
  check("089 production ignores preview bypass", productionBypass.statusCode === 401 && errorCode(productionBypass) === "AUTHENTICATION_REQUIRED");
  const productionHealth = await handler(event("GET", "/api/v1/health"), {});
  check("090 production health proves preview bypass forbidden", json(productionHealth).data?.productionPreviewBypassAllowed === false);
  check("091 production health remains disabled", json(productionHealth).data?.status === "disabled");
  const productionMember = await handler(event("GET", "/api/v1/dashboard"), userContext());
  check("092 production signed member still respects disabled bridge", productionMember.statusCode === 503 && errorCode(productionMember) === "BRIDGE_DISABLED");
  check("093 production-disabled proof makes no upstream request", calls.length === callsBeforeRollback);
} finally {
  globalThis.fetch = originalFetch;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  clearEnvironment();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value !== undefined) process.env[name] = value;
  }
}

const passed = results.filter(result => result.passed).length;
const failed = results.length - passed;
console.log("SaaSStagingActivationReadinessValidation");
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failed) {
  for (const result of results.filter(item => !item.passed)) console.log(`- ${result.name}`);
  process.exitCode = 1;
}
