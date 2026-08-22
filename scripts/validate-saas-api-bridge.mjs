import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

const files = {
  gateway: read("netlify/functions/flipforge-api.js"),
  modernGateway: read("netlify/modern-functions/flipforge-api.mjs"),
  netlify: read("netlify.toml"),
  redirects: read("_redirects"),
  contract: read("contracts/flipforge-saas-api-v1.schema.json"),
  docs: read("docs/SAAS_API_BRIDGE.md"),
  prototypeIndex: read("saas-prototype/index.html"),
  prototypeApp: read("saas-prototype/app.js"),
  prototypeData: read("saas-prototype/mock-data.js")
};

const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}

function jsonBody(response) {
  return JSON.parse(response.body || "{}");
}

check("001 API v1 is owned by the single modern server-side function", files.modernGateway.includes('path: "/api/v1/*"') && files.modernGateway.includes('import { getUser } from "@netlify/identity"') && !files.redirects.includes("/api/v1/* /.netlify/functions/flipforge-api 200") && files.netlify.includes('directory = "netlify/modern-functions"'));
check("002 gateway is disabled unless explicitly enabled", files.gateway.includes('FLIPFORGE_API_BRIDGE_ENABLED || ""') && files.gateway.includes('=== "true"'));
check("003 upstream base URL comes from server environment", files.gateway.includes("process.env.FLIPFORGE_API_BASE_URL"));
check("004 service token comes from server environment", files.gateway.includes("process.env.FLIPFORGE_API_SERVICE_TOKEN"));
check("005 service token is used only in an upstream Authorization header", /Authorization:\s*`Bearer \$\{process\.env\.FLIPFORGE_API_SERVICE_TOKEN\}`/.test(files.gateway));
check("006 health route reports booleans instead of secret values", files.gateway.includes("upstreamConfigured: upstreamConfigured()") && !files.gateway.includes("serviceToken:"));
check("007 data routes require a signed server-resolved Identity user", files.modernGateway.includes("await getUser()") && files.gateway.includes("context.clientContext.user") && files.gateway.includes("AUTHENTICATION_REQUIRED"));
check("008 unauthenticated preview bypass is blocked in production", files.gateway.includes('context !== "production"') && files.gateway.includes("FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW"));
check("009 route access is controlled by an explicit allowlist", files.gateway.includes("const ROUTES = [") && files.gateway.includes("routeAllowed(method, path)"));
check("010 gateway exposes no provider administration or Paddle webhook route", !/provider-admin|credential-entry|accept-evidence|auto-buy/i.test(files.gateway) && !files.gateway.includes("billing\\/paddle\\/webhook"));
check("011 request bodies have a fixed size limit", files.gateway.includes("DEFAULT_MAX_REQUEST_BYTES") && files.gateway.includes("REQUEST_TOO_LARGE"));
check("012 upstream responses have a fixed size limit", files.gateway.includes("DEFAULT_MAX_RESPONSE_BYTES") && files.gateway.includes("UPSTREAM_RESPONSE_TOO_LARGE"));
check("013 upstream requests use an AbortController timeout", files.gateway.includes("new AbortController()") && files.gateway.includes("controller.abort()"));
check("013b timeout errors use a stable semantic code before DOMException numeric codes", files.gateway.includes('const code = timedOut ? "UPSTREAM_TIMEOUT"'));
check("013c stale lower timeout settings are raised to the production minimum", files.gateway.includes("Math.max(\n    DEFAULT_TIMEOUT_MS,"));
check("014 upstream redirects are refused", files.gateway.includes('redirect: "error"'));
check("015 successful upstream JSON is contract validated", files.gateway.includes("validUpstreamEnvelope") && files.gateway.includes("UPSTREAM_CONTRACT_INVALID"));
check("016 Smart Opportunity authority is required", files.gateway.includes('meta.authority === "Smart Opportunity"'));
check("017 existing PSA authority is required", files.gateway.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("018 correlation IDs are generated or preserved", files.gateway.includes("crypto.randomUUID()") && files.gateway.includes('header(event, "x-correlation-id")'));
check("019 correlation ID is forwarded to the upstream", files.gateway.includes('"X-Correlation-Id": correlationId'));
check("020 API responses disable caching", files.gateway.includes('"Cache-Control": "no-store, max-age=0"'));
check("021 security headers include nosniff and no-referrer", files.gateway.includes('"X-Content-Type-Options": "nosniff"') && files.gateway.includes('"Referrer-Policy": "no-referrer"'));
check("022 cross-origin requests are explicitly checked", files.gateway.includes("originAllowed(event, origin)") && files.gateway.includes("ORIGIN_NOT_ALLOWED"));
check("023 gateway logs route metadata but not request bodies", files.gateway.includes("FLIPFORGE_API_REQUEST_COMPLETED") && !/console\.(?:info|warn|error)\([^)]*body/s.test(files.gateway));
check("024 gateway never returns the service token", !/FLIPFORGE_API_SERVICE_TOKEN[^\n]{0,120}(?:body|jsonResponse|errorEnvelope)/.test(files.gateway));
check("025 v1 JSON schema parses", (() => { try { JSON.parse(files.contract); return true; } catch (_) { return false; } })());

const contract = JSON.parse(files.contract);
const requiredMeta = contract.properties?.meta?.required || [];
check("026 schema requires contract version", requiredMeta.includes("contractVersion"));
check("027 schema requires engine version", requiredMeta.includes("engineVersion"));
check("028 schema requires authority provenance", requiredMeta.includes("authority") && requiredMeta.includes("gradingAuthority"));
check("029 schema requires generated timestamp and correlation ID", requiredMeta.includes("generatedAt") && requiredMeta.includes("correlationId"));
check("030 schema fixes Smart Opportunity as recommendation authority", contract.properties?.meta?.properties?.authority?.const === "Smart Opportunity");
check("031 schema fixes existing PSA intelligence as grading authority", contract.properties?.meta?.properties?.gradingAuthority?.const === "Existing PSA intelligence");
check("032 documentation states the gateway is not the recommendation engine", files.docs.includes("The gateway is not the recommendation engine"));
check("033 documentation forbids direct desktop SQLite access", files.docs.includes("must not open a desktop SQLite file directly"));
check("034 documentation requires separate production approval", files.docs.includes("separate owner approval before any production activation"));
check("035 live prototype remains explicitly mock-backed", files.prototypeData.includes("Local mock responses shaped like future read-only API contracts"));
check("036 browser application still contains no direct fetch call", !/\bfetch\s*\(/.test(`${files.prototypeIndex}\n${files.prototypeApp}\n${files.prototypeData}`));
check("037 no service token identifier exists in browser files", !/FLIPFORGE_API_SERVICE_TOKEN/.test(`${files.prototypeIndex}\n${files.prototypeApp}\n${files.prototypeData}`));

const environmentNames = [
  "FLIPFORGE_API_BRIDGE_ENABLED",
  "FLIPFORGE_API_BASE_URL",
  "FLIPFORGE_API_SERVICE_TOKEN",
  "FLIPFORGE_API_ALLOWED_ORIGINS",
  "FLIPFORGE_API_TIMEOUT_MS",
  "FLIPFORGE_API_MAX_RESPONSE_BYTES",
  "FLIPFORGE_API_MAX_REQUEST_BYTES",
  "FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW",
  "FLIPFORGE_API_PREVIEW_TENANT_ID",
  "CONTEXT"
];

const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function clearBridgeEnvironment() {
  for (const name of environmentNames) delete process.env[name];
}

function event(method, pathName, overrides = {}) {
  return {
    httpMethod: method,
    path: pathName,
    headers: {
      host: "deploy-preview-16--goflipforge.netlify.app",
      ...(overrides.headers || {})
    },
    queryStringParameters: overrides.queryStringParameters || {},
    body: overrides.body || ""
  };
}

try {
  clearBridgeEnvironment();
  // The retained core is tested directly with deterministic function-context
  // fixtures. The modern adapter is separately validated for getUser(), cookie
  // transport, custom routing, and legacy-contract mapping.
  const gatewayPath = path.join(repositoryRoot, "netlify/functions/flipforge-api.js");
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const health = await handler(event("GET", "/api/v1/health"), {});
  const healthBody = jsonBody(health);
  check("038 public health route succeeds while disabled", health.statusCode === 200 && healthBody.data?.status === "disabled");
  check("039 health route reveals no URL or token", !/https?:\/\/|token|secret/i.test(health.body));

  const unauthenticated = await handler(event("GET", "/api/v1/dashboard"), {});
  check("040 unauthenticated data route fails closed", unauthenticated.statusCode === 401 && jsonBody(unauthenticated).error?.code === "AUTHENTICATION_REQUIRED");

  const unknown = await handler(event("GET", "/api/v1/provider-admin"), {});
  check("041 unknown route is rejected before authentication", unknown.statusCode === 404 && jsonBody(unknown).error?.code === "ROUTE_NOT_ALLOWED");

  const foreignOrigin = await handler(
    event("GET", "/api/v1/health", { headers: { origin: "https://example.invalid" } }),
    {}
  );
  check("042 foreign origin is rejected", foreignOrigin.statusCode === 403 && jsonBody(foreignOrigin).error?.code === "ORIGIN_NOT_ALLOWED");

  const options = await handler(
    event("OPTIONS", "/api/v1/dashboard", {
      headers: { origin: "https://deploy-preview-16--goflipforge.netlify.app" }
    }),
    {}
  );
  check("043 same-origin preflight succeeds", options.statusCode === 204 && options.headers["Access-Control-Allow-Methods"].includes("GET"));

  process.env.CONTEXT = "production";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
  const productionBypass = await handler(event("GET", "/api/v1/dashboard"), {});
  check("044 production ignores unauthenticated preview bypass", productionBypass.statusCode === 401);

  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_PREVIEW_TENANT_ID = "preview_sandbox_001";
  const previewDisabled = await handler(event("GET", "/api/v1/dashboard"), {});
  check("045 preview bypass still respects bridge-disabled state", previewDisabled.statusCode === 503 && jsonBody(previewDisabled).error?.code === "BRIDGE_DISABLED");

  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  const missingUpstream = await handler(event("GET", "/api/v1/dashboard"), {});
  check("046 enabled bridge fails when upstream is not configured", missingUpstream.statusCode === 503 && jsonBody(missingUpstream).error?.code === "UPSTREAM_NOT_CONFIGURED");

  process.env.FLIPFORGE_API_BASE_URL = "https://authoritative.example.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = "server-only-test-token";
  process.env.FLIPFORGE_API_MAX_REQUEST_BYTES = "16";
  const oversized = await handler(event("POST", "/api/v1/evaluations", {
    headers: { "idempotency-key": "bridge-request-0001" },
    body: JSON.stringify({ value: "12345678901234567890" })
  }), {});
  check("047 oversized evaluation request is rejected before upstream access", oversized.statusCode === 413 && jsonBody(oversized).error?.code === "REQUEST_TOO_LARGE");

  process.env.FLIPFORGE_API_MAX_REQUEST_BYTES = "65536";
  let forwardedAuthorization = null;
  globalThis.fetch = async (_url, options) => {
    forwardedAuthorization = options.headers.Authorization;
    return new Response(
      JSON.stringify({
        meta: {
          contractVersion: "1.0",
          engineVersion: "test-engine",
          authority: "Smart Opportunity",
          gradingAuthority: "Existing PSA intelligence",
          generatedAt: "2026-07-29T19:00:00Z",
          correlationId: options.headers["X-Correlation-Id"],
          evidenceFreshness: "current",
          limitations: ["test fixture"]
        },
        data: { metrics: [] }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const successful = await handler(
    event("GET", "/api/v1/dashboard", { headers: { "x-correlation-id": "bridge-test-correlation" } }),
    {}
  );
  check("048 valid authoritative response passes through", successful.statusCode === 200 && jsonBody(successful).meta?.engineVersion === "test-engine");
  check("049 service token is forwarded only server-to-server", forwardedAuthorization === "Bearer server-only-test-token");
  check("050 service token is absent from the browser response", !successful.body.includes("server-only-test-token"));

  globalThis.fetch = async (_url, options) => new Response(
    JSON.stringify({
      meta: {
        contractVersion: "1.0",
        engineVersion: "test-engine",
        authority: "Second Recommendation Engine",
        gradingAuthority: "Existing PSA intelligence",
        generatedAt: "2026-07-29T19:00:00Z",
        correlationId: options.headers["X-Correlation-Id"]
      },
      data: {}
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

  const invalidAuthority = await handler(event("GET", "/api/v1/dashboard"), {});
  check("051 response from a second recommendation authority is rejected", invalidAuthority.statusCode === 502 && jsonBody(invalidAuthority).error?.code === "UPSTREAM_CONTRACT_INVALID");

  process.env.FLIPFORGE_API_TIMEOUT_MS = "1";
  globalThis.fetch = async () => {
    throw Object.assign(new Error("The operation was aborted."), { name: "AbortError", code: 20 });
  };

  const timedOut = await handler(event("GET", "/api/v1/dashboard"), {});
  check("052 upstream timeout returns a stable semantic error code", timedOut.statusCode === 503 && jsonBody(timedOut).error?.code === "UPSTREAM_TIMEOUT");
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const failures = results.filter(result => !result.passed);

console.log("SaaSApiBridgeValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);

for (const failure of failures) {
  console.error(`FAIL | ${failure.name}`);
}

if (failures.length > 0) process.exitCode = 1;
