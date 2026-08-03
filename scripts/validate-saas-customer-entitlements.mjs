import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const adapter = read("saas-prototype/customer-entitlements.js");
const router = read("saas-prototype/staging-route-hook.js");
const index = read("saas-prototype/index.html");
const gatewaySource = read("netlify/functions/flipforge-api.js");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 customer entitlement adapter is loaded", index.includes('src="customer-entitlements.js"'));
check("002 customer entitlement stylesheet is loaded", index.includes('href="customer-entitlements.css"'));
check("003 account route delegates to entitlement adapter", router.includes('route === "account"') && router.includes("entitlementsAdapter.render(main)"));
check("004 adapter is preview-only", adapter.includes("deploy-preview-") && adapter.includes("localhost") && adapter.includes("127\\.0\\.0\\.1"));
check("005 adapter allowlists health and entitlements only", adapter.includes('path !== "/api/v1/health" && path !== "/api/v1/entitlements"'));
check("006 adapter uses GET only", adapter.includes('method: "GET"') && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(adapter));
check("007 adapter uses same-origin authenticated browser session", adapter.includes('credentials: "same-origin"'));
check("008 adapter disables cache", adapter.includes('cache: "no-store"'));
check("009 adapter validates Smart Opportunity authority", adapter.includes('meta.authority === "Smart Opportunity"'));
check("010 adapter validates existing PSA authority", adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("011 adapter requires read-only entitlements", adapter.includes('payload.data.readOnly === true'));
check("012 adapter requires zero transaction authority", adapter.includes('payload.data.transactionAuthority === false'));
check("013 account copy states billing is not connected", index.includes("Billing is not connected") && adapter.includes("Billing is not connected"));
check("014 adapter exposes no payment-control label", !/Pay now|Checkout now|Enter card|Card number|CVV|Upgrade now|Subscribe now/i.test(adapter));
check("015 adapter does not construct tenant or user headers", !/X-FlipForge-Tenant-Id|X-FlipForge-User-Id/.test(adapter));
check("016 gateway already allowlists entitlements read", /method:\s*"GET"[\s\S]{0,100}entitlements/.test(gatewaySource));

const previousEnv = { ...process.env };
const previousFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
let upstreamCalls = [];
const serviceToken = "entitlement-service-token-that-stays-server-side";
const rawTenant = "tenant-plan-validation-a";
const correlationId = "customer-entitlements-validation";

try {
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-backend.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = serviceToken;
  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  globalThis.fetch = async (url, options = {}) => {
    upstreamCalls.push({ url: String(url), options });
    const requestCorrelation = options?.headers?.["X-Correlation-Id"];
    const payload = {
      meta: {
        contractVersion: "1.0",
        engineVersion: "SmartOpportunity+entitlement-v15.05",
        authority: "Smart Opportunity",
        gradingAuthority: "Existing PSA intelligence",
        correlationId: requestCorrelation,
        generatedAt: "2026-08-03T01:30:00Z"
      },
      limitations: ["Private beta is not a paid subscription."],
      data: {
        kind: "entitlements",
        readOnly: true,
        configured: true,
        billingProviderConnected: false,
        checkoutAvailable: false,
        customerPlanChangeAllowed: false,
        current: {
          code: "PRIVATE_BETA",
          name: "Private Beta",
          paidPlanActive: false,
          billingVerified: false,
          accessAllowed: true,
          accessState: "PRIVATE_BETA_ACTIVE",
          entitlementSource: "INVITATION_DEFAULT"
        },
        usage: {
          completedEvaluations: 3,
          monthlyEvaluationLimit: null,
          remainingEvaluations: null,
          evaluationAllowedNow: true,
          idempotentReplayConsumesAdditionalUsage: false,
          failedEvaluationConsumesUsage: false
        },
        plannedCommercialPlans: [
          { code: "SCOUT", name: "Scout", monthlyEvaluationLimit: 5 },
          { code: "COLLECTOR", name: "Collector", monthlyEvaluationLimit: 75 },
          { code: "PRO", name: "Pro", monthlyEvaluationLimit: 300 }
        ],
        transactionAuthority: false
      }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const event = {
    httpMethod: "GET",
    path: "/.netlify/functions/flipforge-api/api/v1/entitlements",
    headers: {
      host: "deploy-preview-41--goflipforge.netlify.app",
      origin: "https://deploy-preview-41--goflipforge.netlify.app",
      "x-correlation-id": correlationId
    },
    multiValueHeaders: {},
    queryStringParameters: {}
  };
  const context = {
    clientContext: {
      user: {
        email: "private-plan-tester@example.com",
        app_metadata: {
          flipforge: {
            access: "active",
            tenantId: rawTenant
          }
        }
      }
    }
  };

  const response = await handler(event, context);
  const body = JSON.parse(response.body);
  check("017 signed active tenant can read entitlements through existing gateway", response.statusCode === 200);
  check("018 gateway makes exactly one upstream entitlement call", upstreamCalls.length === 1 && upstreamCalls[0].url.endsWith("/api/v1/entitlements"));
  check("019 gateway sets tenant header server-side", upstreamCalls[0]?.options?.headers?.["X-FlipForge-Tenant-Id"] === rawTenant);
  check("020 gateway sets service token server-side", upstreamCalls[0]?.options?.headers?.Authorization === `Bearer ${serviceToken}`);
  check("021 browser response preserves private-beta truth", body?.data?.current?.code === "PRIVATE_BETA" && body?.data?.current?.paidPlanActive === false);
  check("022 browser response preserves billing disconnected", body?.data?.billingProviderConnected === false && body?.data?.checkoutAvailable === false);
  check("023 browser response preserves server-owned usage", body?.data?.usage?.completedEvaluations === 3);
  check("024 browser response preserves planned 5/75/300 limits", body?.data?.plannedCommercialPlans?.map(plan => plan.monthlyEvaluationLimit).join(",") === "5,75,300");
  check("025 browser response exposes no service token", !response.body.includes(serviceToken));
  check("026 browser response exposes no raw tenant id", !response.body.includes(rawTenant));
  check("027 browser response exposes no payment fields", !/cardNumber|cvv|paymentToken|clientSecret/i.test(response.body));
  check("028 browser response remains no-store", String(response.headers?.["Cache-Control"] || "").includes("no-store"));
  check("029 browser response has no transaction authority", body?.data?.transactionAuthority === false);

  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "false";
  upstreamCalls = [];
  const disabled = await handler({ ...event, headers: { ...event.headers, "x-correlation-id": "entitlements-disabled" } }, context);
  const disabledBody = JSON.parse(disabled.body);
  check("030 disabled bridge returns stable safe state", disabled.statusCode === 503 && disabledBody?.error?.code === "BRIDGE_DISABLED");
  check("031 disabled bridge makes zero upstream calls", upstreamCalls.length === 0);
} finally {
  globalThis.fetch = previousFetch;
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
}

const failures = results.filter(result => !result.passed);
console.log("SaaSCustomerEntitlementsValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
