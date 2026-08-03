import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const gateway = read("netlify/functions/flipforge-api.js");
const index = read("saas-prototype/index.html");
const routeHook = read("saas-prototype/staging-route-hook.js");
const docs = read("docs/SAAS_PADDLE_WEBHOOK_GATEWAY_BOUNDARY.md");

const PADDLE_WEBHOOK = "/api/v1/billing/paddle/webhook";
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer gateway source does not allowlist Paddle webhook", !gateway.includes("billing\\/paddle\\/webhook") && !gateway.includes('pattern: /^\\/api\\/v1\\/billing')],
  ["002 customer app has no Paddle webhook navigation", !index.includes(PADDLE_WEBHOOK) && !index.includes("#/billing/paddle") && !index.includes("Paddle Webhook")],
  ["003 customer route hook has no Paddle webhook route", !routeHook.includes(PADDLE_WEBHOOK) && !routeHook.includes("billing/paddle")],
  ["004 docs require webhook to remain outside customer gateway", docs.includes("never be added to the customer gateway allowlist")],
  ["005 docs preserve provider authentication boundary", docs.includes("Paddle-Signature") && docs.includes("provider-to-backend traffic")],
  ["006 docs prohibit browser tenant identity for webhook", docs.includes("browser tenant identity") && docs.includes("cannot establish billing identity")],
  ["007 docs retain checkout-disabled boundary", docs.includes("does not create or expose checkout")],
  ["008 docs retain production inactive boundary", docs.includes("does not activate staging or production billing")]
].forEach(([name, condition]) => check(name, condition));

const previousEnv = { ...process.env };
const previousFetch = globalThis.fetch;
let fetchCalls = 0;

try {
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = "true";
  process.env.FLIPFORGE_API_BASE_URL = "https://private-backend.invalid";
  process.env.FLIPFORGE_API_SERVICE_TOKEN = "server-only-token-that-never-reaches-browser";
  process.env.CONTEXT = "deploy-preview";
  process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW = "false";

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("The customer gateway must not call upstream for the Paddle webhook route.");
  };

  const require = createRequire(import.meta.url);
  const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const event = {
    httpMethod: "POST",
    path: `/.netlify/functions/flipforge-api${PADDLE_WEBHOOK}`,
    headers: {
      host: "deploy-preview-paddle--goflipforge.netlify.app",
      origin: "https://deploy-preview-paddle--goflipforge.netlify.app",
      "content-type": "application/json",
      "paddle-signature": "ts=1785765600;h1=synthetic-signature-that-gateway-must-not-forward",
      "x-correlation-id": "paddle-gateway-boundary-test"
    },
    multiValueHeaders: {},
    queryStringParameters: {},
    body: JSON.stringify({ event_type: "subscription.updated" })
  };
  const signedContext = {
    clientContext: {
      user: {
        email: "private-tester@example.com",
        app_metadata: {
          flipforge: {
            access: "active",
            tenantId: "tenant-private-beta"
          }
        }
      }
    }
  };

  const signedResponse = await handler(event, signedContext);
  const signedBody = JSON.parse(signedResponse.body);
  check("009 signed customer receives route-not-allowed", signedResponse.statusCode === 404);
  check("010 Paddle webhook rejection has stable gateway code", signedBody?.error?.code === "ROUTE_NOT_ALLOWED");
  check("011 Paddle webhook rejection preserves correlation", signedBody?.error?.correlationId === "paddle-gateway-boundary-test");
  check("012 Paddle webhook route never reaches private upstream", fetchCalls === 0);
  check("013 rejection returns no backend service token", !signedResponse.body.includes(process.env.FLIPFORGE_API_SERVICE_TOKEN));
  check("014 rejection returns no signed tenant id", !signedResponse.body.includes("tenant-private-beta"));
  check("015 rejection does not echo Paddle signature", !signedResponse.body.includes("synthetic-signature"));
  check("016 rejection disables caching", String(signedResponse.headers?.["Cache-Control"] || "").includes("no-store"));
  check("017 provider route is rejected before customer membership can grant access", signedBody?.error?.code !== "TENANT_MEMBERSHIP_REQUIRED");

  const anonymousResponse = await handler(event, {});
  const anonymousBody = JSON.parse(anonymousResponse.body);
  check("018 anonymous provider-looking request is still route-not-allowed", anonymousResponse.statusCode === 404 && anonymousBody?.error?.code === "ROUTE_NOT_ALLOWED");
  check("019 anonymous provider-looking request never reaches upstream", fetchCalls === 0);

  const siblingEvent = {
    ...event,
    path: `/.netlify/functions/flipforge-api${PADDLE_WEBHOOK}-extra`,
    headers: { ...event.headers, "x-correlation-id": "paddle-gateway-sibling-test" }
  };
  const siblingResponse = await handler(siblingEvent, signedContext);
  const siblingBody = JSON.parse(siblingResponse.body);
  check("020 sibling billing route is also denied", siblingResponse.statusCode === 404 && siblingBody?.error?.code === "ROUTE_NOT_ALLOWED");
  check("021 sibling billing route never reaches upstream", fetchCalls === 0);
  check("022 gateway response exposes no payment or transaction control", !/Checkout|Pay now|Create payment|Refund|Place bid|Buy now|Create listing/.test(signedResponse.body));
} finally {
  globalThis.fetch = previousFetch;
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
}

const failures = results.filter(result => !result.passed);
console.log("SaaSPaddleWebhookGatewayBoundaryValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
