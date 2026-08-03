import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const gateway = read("netlify/functions/flipforge-api.js");
const entitlements = read("saas-prototype/customer-entitlements.js");
const css = read("saas-prototype/customer-entitlements.css");

const CHECKOUT_PATH = "/api/v1/billing/paddle/checkout";
const WEBHOOK_PATH = "/api/v1/billing/paddle/webhook";
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 gateway allowlists exact Paddle checkout POST", gateway.includes('pattern: /^\\/api\\/v1\\/billing\\/paddle\\/checkout$/')],
  ["002 gateway still does not allowlist Paddle webhook", !gateway.includes('billing\\/paddle\\/webhook')],
  ["003 gateway requires checkout idempotency", gateway.includes("checkoutIdempotencyRequired: true") && gateway.includes("CHECKOUT_IDEMPOTENCY_KEY_REQUIRED")],
  ["004 gateway injects tenant only server-side", gateway.includes("[TENANT_HEADER]: tenant.tenantId") && gateway.includes("CLIENT_IDENTITY_HEADER_FORBIDDEN")],
  ["005 gateway preserves stable checkout errors", gateway.includes("CHECKOUT_OUTCOME_UNKNOWN") && gateway.includes("SUBSCRIPTION_ALREADY_ACTIVE") && gateway.includes("CHECKOUT_PROVIDER_REJECTED")],
  ["006 customer UI uses exact checkout route", entitlements.includes(`const CHECKOUT_PATH = "${CHECKOUT_PATH}"`)],
  ["007 customer UI accepts only Collector and Pro", entitlements.includes('new Set(["COLLECTOR", "PRO"])')],
  ["008 customer UI sends only FlipForge plan code", entitlements.includes("JSON.stringify({ planCode: plan })")],
  ["009 customer UI sends checkout idempotency key", entitlements.includes('"Idempotency-Key": checkoutIdempotencyKey()')],
  ["010 customer UI validates safe handoff authority", entitlements.includes('data.kind === "paddle-checkout"') && entitlements.includes('data.webhookRequiredForPaidActivation === true')],
  ["011 customer UI rejects browser-side paid activation", entitlements.includes("data.paidAccessActivated === false") && entitlements.includes("data.transactionAuthority === false")],
  ["012 customer UI opens only validated HTTPS handoff", entitlements.includes("validatedCheckoutUrl") && entitlements.includes("window.location.assign(url)")],
  ["013 customer UI contains no server Paddle environment secrets", !/FLIPFORGE_PADDLE_(?:API_KEY|WEBHOOK_SECRET|COLLECTOR_MONTHLY_PRICE_ID|PRO_MONTHLY_PRICE_ID)/.test(entitlements)],
  ["014 customer UI contains no Paddle price-id request field", !/price_id|priceId/.test(entitlements)],
  ["015 customer UI contains no raw billing-reference field", !entitlements.includes("flipforge_billing_ref")],
  ["016 checkout action styling exists", css.includes(".customer-checkout-action")]
].forEach(([name, condition]) => check(name, condition));

const previousEnv = { ...process.env };
const previousFetch = globalThis.fetch;
const previousWarn = console.warn;
const previousInfo = console.info;
const previousError = console.error;
let calls = [];
let upstreamMode = "success";

function signedContext(access = "active") {
  return {
    clientContext: {
      user: {
        email: "checkout-tester@example.com",
        app_metadata: {
          flipforge: {
            access,
            tenantId: "tenant-checkout-alpha"
          }
        }
      }
    }
  };
}

function checkoutEvent(overrides = {}) {
  return {
    httpMethod: "POST",
    path: `/.netlify/functions/flipforge-api${CHECKOUT_PATH}`,
    headers: {
      host: "deploy-preview-checkout--goflipforge.netlify.app",
      origin: "https://deploy-preview-checkout--goflipforge.netlify.app",
      "content-type": "application/json",
      "x-correlation-id": "checkout-gateway-test",
      "idempotency-key": "checkout-request-0001",
      ...(overrides.headers || {})
    },
    multiValueHeaders: overrides.multiValueHeaders || {},
    queryStringParameters: {},
    body: overrides.body ?? JSON.stringify({ planCode: "COLLECTOR" }),
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["headers", "multiValueHeaders", "body"].includes(key)))
  };
}

function upstreamEnvelope(correlationId, plan = "COLLECTOR") {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "v-test+v15.10",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-03T16:45:00Z",
      correlationId
    },
    data: {
      kind: "paddle-checkout",
      checkoutVersion: "v15.10",
      provider: "PADDLE",
      planCode: plan,
      checkoutUrl: "https://pay.flipforge.example/checkout?_ptxn=txn_abcdefghijklmnopqrstuvwxyz",
      idempotentReplay: false,
      customerPriceIdIncluded: false,
      opaqueBillingReferenceIncluded: false,
      paidAccessActivated: false,
      webhookRequiredForPaidActivation: true,
      paymentCredentialsHandledByFlipForge: false,
      transactionAuthority: false
    }
  };
}

function upstreamError(status, code, rawMessage, retryAfter = null) {
  return new Response(JSON.stringify({
    error: {
      code,
      message: rawMessage,
      details: { providerSecret: "must-not-cross-gateway" }
    }
  }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(retryAfter ? { "retry-after": retryAfter } : {})
    }
  });
}

try {
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-backend.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = "server-only-checkout-token-never-for-browser";
  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const correlationId = options?.headers?.["X-Correlation-Id"] || "";
    const plan = (() => {
      try { return JSON.parse(String(options.body || "{}")).planCode || "COLLECTOR"; } catch (_) { return "COLLECTOR"; }
    })();
    if (upstreamMode === "success") {
      return new Response(JSON.stringify(upstreamEnvelope(correlationId, plan)), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (upstreamMode === "in-progress") {
      return upstreamError(409, "CHECKOUT_IN_PROGRESS", "raw provider wording must be stripped", "1");
    }
    if (upstreamMode === "unavailable") {
      return upstreamError(503, "CHECKOUT_UNAVAILABLE", "backend configuration details must be stripped");
    }
    if (upstreamMode === "provider-rejected") {
      return upstreamError(502, "CHECKOUT_PROVIDER_REJECTED", "raw Paddle rejection must be stripped");
    }
    throw new Error("Unexpected upstream mode");
  };

  const require = createRequire(import.meta.url);
  const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const success = await handler(checkoutEvent(), signedContext());
  const successBody = JSON.parse(success.body);
  check("017 signed active tenant can request checkout", success.statusCode === 200 && successBody?.data?.kind === "paddle-checkout");
  check("018 checkout reaches exactly one upstream call", calls.length === 1);
  check("019 gateway forwards exact checkout path", calls[0]?.url === `https://private-backend.invalid${CHECKOUT_PATH}`);
  check("020 gateway forwards POST and original plan-only body", calls[0]?.options?.method === "POST" && calls[0]?.options?.body === JSON.stringify({ planCode: "COLLECTOR" }));
  check("021 gateway injects server service token", calls[0]?.options?.headers?.Authorization === `Bearer ${process.env.FLIPFORGE_API_SERVICE_TOKEN}`);
  check("022 gateway injects signed tenant context", calls[0]?.options?.headers?.["X-FlipForge-Tenant-Id"] === "tenant-checkout-alpha");
  check("023 gateway forwards customer checkout idempotency key", calls[0]?.options?.headers?.["Idempotency-Key"] === "checkout-request-0001");
  check("024 browser response exposes no service token", !success.body.includes(process.env.FLIPFORGE_API_SERVICE_TOKEN));
  check("025 browser response exposes no tenant id", !success.body.includes("tenant-checkout-alpha"));
  check("026 successful handoff preserves no-transaction authority", successBody?.data?.paidAccessActivated === false && successBody?.data?.transactionAuthority === false);

  const beforeMissing = calls.length;
  const missingKey = await handler(checkoutEvent({ headers: { "idempotency-key": "" } }), signedContext());
  const missingBody = JSON.parse(missingKey.body);
  check("027 missing checkout idempotency is rejected before upstream", missingKey.statusCode === 400 && missingBody?.error?.code === "CHECKOUT_IDEMPOTENCY_KEY_REQUIRED" && calls.length === beforeMissing);

  const beforeInvalid = calls.length;
  const invalidKey = await handler(checkoutEvent({ headers: { "idempotency-key": "bad key" } }), signedContext());
  const invalidBody = JSON.parse(invalidKey.body);
  check("028 invalid checkout idempotency is rejected before upstream", invalidKey.statusCode === 400 && invalidBody?.error?.code === "INVALID_CHECKOUT_IDEMPOTENCY_KEY" && calls.length === beforeInvalid);

  const beforeIdentity = calls.length;
  const injectedTenant = await handler(checkoutEvent({ headers: { "x-flipforge-tenant-id": "attacker-tenant" } }), signedContext());
  const injectedTenantBody = JSON.parse(injectedTenant.body);
  check("029 browser tenant-header injection is rejected before upstream", injectedTenant.statusCode === 400 && injectedTenantBody?.error?.code === "CLIENT_IDENTITY_HEADER_FORBIDDEN" && calls.length === beforeIdentity);

  const beforeInactive = calls.length;
  const inactive = await handler(checkoutEvent(), signedContext("inactive"));
  const inactiveBody = JSON.parse(inactive.body);
  check("030 inactive membership cannot request checkout", inactive.statusCode === 403 && inactiveBody?.error?.code === "TENANT_MEMBERSHIP_INACTIVE" && calls.length === beforeInactive);

  const webhookEvent = checkoutEvent({ path: `/.netlify/functions/flipforge-api${WEBHOOK_PATH}` });
  const beforeWebhook = calls.length;
  const webhook = await handler(webhookEvent, signedContext());
  const webhookBody = JSON.parse(webhook.body);
  check("031 provider webhook remains outside customer gateway", webhook.statusCode === 404 && webhookBody?.error?.code === "ROUTE_NOT_ALLOWED" && calls.length === beforeWebhook);

  const health = await handler({
    httpMethod: "GET",
    path: "/.netlify/functions/flipforge-api/api/v1/health",
    headers: { "x-correlation-id": "checkout-health-test" },
    multiValueHeaders: {},
    queryStringParameters: {}
  }, {});
  const healthBody = JSON.parse(health.body);
  check("032 gateway health reports checkout idempotency boundary", healthBody?.data?.checkoutIdempotencyRequired === true);
  check("033 gateway health distinguishes checkout from webhook", healthBody?.data?.paddleCheckoutGatewayRouteAllowed === true && healthBody?.data?.paddleWebhookGatewayRouteAllowed === false);

  upstreamMode = "in-progress";
  const inProgress = await handler(checkoutEvent({ headers: { "idempotency-key": "checkout-request-0002" } }), signedContext());
  const inProgressBody = JSON.parse(inProgress.body);
  check("034 checkout in-progress stable code preserved", inProgress.statusCode === 409 && inProgressBody?.error?.code === "CHECKOUT_IN_PROGRESS");
  check("035 checkout in-progress raw provider details stripped", !inProgress.body.includes("raw provider wording") && !inProgress.body.includes("must-not-cross-gateway"));
  check("036 checkout Retry-After safely preserved", inProgress.headers?.["Retry-After"] === "1");

  upstreamMode = "unavailable";
  const unavailable = await handler(checkoutEvent({ headers: { "idempotency-key": "checkout-request-0003" } }), signedContext());
  const unavailableBody = JSON.parse(unavailable.body);
  check("037 checkout unavailable is normalized but code preserved", unavailable.statusCode === 502 && unavailableBody?.error?.code === "CHECKOUT_UNAVAILABLE");
  check("038 checkout unavailable hides backend configuration details", !unavailable.body.includes("backend configuration details") && !unavailable.body.includes("must-not-cross-gateway"));

  upstreamMode = "provider-rejected";
  const rejected = await handler(checkoutEvent({ headers: { "idempotency-key": "checkout-request-0004" } }), signedContext());
  const rejectedBody = JSON.parse(rejected.body);
  check("039 provider rejection remains safe customer error", rejected.statusCode === 502 && rejectedBody?.error?.code === "CHECKOUT_PROVIDER_REJECTED");
  check("040 provider rejection raw Paddle wording stripped", !rejected.body.includes("raw Paddle rejection") && !rejected.body.includes("must-not-cross-gateway"));

  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "false";
  const beforeDisabled = calls.length;
  const disabled = await handler(checkoutEvent({ headers: { "idempotency-key": "checkout-request-0005" } }), signedContext());
  const disabledBody = JSON.parse(disabled.body);
  check("041 bridge-disabled checkout fails before upstream", disabled.statusCode === 503 && disabledBody?.error?.code === "BRIDGE_DISABLED" && calls.length === beforeDisabled);
} finally {
  globalThis.fetch = previousFetch;
  console.warn = previousWarn;
  console.info = previousInfo;
  console.error = previousError;
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
}

const failures = results.filter(result => !result.passed);
console.log("SaaSPaddleCustomerCheckoutValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
