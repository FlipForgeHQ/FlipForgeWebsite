import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const gateway = read("netlify/functions/flipforge-api.js");
const index = read("saas-prototype/index.html");
const routeHook = read("saas-prototype/staging-route-hook.js");
const privateBeta = read("saas-prototype/private-beta.js");
const docs = read("docs/SAAS_PRIVATE_BETA_OPERATIONS_BOUNDARY.md");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

[
  ["001 customer gateway source does not allowlist operator status", !gateway.includes('/api/v1/operator/status')],
  ["002 customer app has no operator navigation", !index.includes("operator/status") && !index.includes("#/operator") && !index.includes("Operator Status")],
  ["003 customer route hook has no operator route", !routeHook.includes("operator/status") && !routeHook.includes('route === "operator"')],
  ["004 private beta guide has no operator controls", !privateBeta.includes("operator/status") && !privateBeta.includes("Operator Status")],
  ["005 docs require operator route to stay backend-only", docs.includes("must never be added to the customer gateway allowlist")],
  ["006 docs preserve service-token-only backend boundary", docs.includes("service-token-only") && docs.includes("private backend")],
  ["007 docs prohibit customer navigation", docs.includes("No customer navigation")],
  ["008 docs retain production inactive boundary", docs.includes("does not activate staging or production")]
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
    throw new Error("The customer gateway must not call upstream for the private operator route.");
  };

  const require = createRequire(import.meta.url);
  const gatewayPath = path.join(root, "netlify/functions/flipforge-api.js");
  delete require.cache[require.resolve(gatewayPath)];
  const { handler } = require(gatewayPath);

  const event = {
    httpMethod: "GET",
    path: "/.netlify/functions/flipforge-api/api/v1/operator/status",
    headers: {
      host: "deploy-preview-40--goflipforge.netlify.app",
      origin: "https://deploy-preview-40--goflipforge.netlify.app",
      "x-correlation-id": "operator-boundary-test"
    },
    multiValueHeaders: {},
    queryStringParameters: {}
  };
  const context = {
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

  const response = await handler(event, context);
  const body = JSON.parse(response.body);
  check("009 signed customer still receives route-not-allowed", response.statusCode === 404);
  check("010 operator route rejection has stable gateway code", body?.error?.code === "ROUTE_NOT_ALLOWED");
  check("011 operator route rejection preserves correlation", body?.error?.correlationId === "operator-boundary-test");
  check("012 operator route never reaches private upstream", fetchCalls === 0);
  check("013 rejection returns no backend service token", !response.body.includes(process.env.FLIPFORGE_API_SERVICE_TOKEN));
  check("014 rejection returns no tenant id", !response.body.includes("tenant-private-beta"));
  check("015 rejection disables caching", String(response.headers?.["Cache-Control"] || "").includes("no-store"));
  check("016 rejection exposes no transaction control", !/Place bid|Buy now|Checkout|Pay now|Create listing|Accept offer/.test(response.body));
} finally {
  globalThis.fetch = previousFetch;
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
}

const failures = results.filter(result => !result.passed);
console.log("SaaSPrivateBetaOperationsBoundaryValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
