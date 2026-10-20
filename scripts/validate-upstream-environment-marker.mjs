// The gateway's X-FlipForge-Upstream-Env marker: derived from configuration only, never the backend URL or token,
// present on every gateway response (including unauthenticated ones and the public health check), and a label that
// contradicts the deploy context fails closed before any upstream call.
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

const BASE = "https://backend-secret-host.invalid";
const TOKEN = "service-token-value-that-must-never-appear-0000";
const upstreamCalls = [];
globalThis.fetch = async url => {
  upstreamCalls.push(String(url));
  return new Response(JSON.stringify({ error: { code: "TEST_BACKEND" } }), { status: 503, headers: { "content-type": "application/json" } });
};
globalThis.netlifyIdentityContext = { url: "https://identity.invalid/.netlify/identity" };

const { default: gateway, upstreamEnvironment } = await import("../netlify/modern-functions/flipforge-api.mjs");

function setEnv({ bridge = "true", base = BASE, token = TOKEN, label } = {}) {
  process.env.FLIPFORGE_API_BRIDGE_ENABLED = bridge;
  process.env.FLIPFORGE_API_BASE_URL = base;
  process.env.FLIPFORGE_API_SERVICE_TOKEN = token;
  if (label === undefined) delete process.env.FLIPFORGE_API_UPSTREAM_ENVIRONMENT;
  else process.env.FLIPFORGE_API_UPSTREAM_ENVIRONMENT = label;
}

// Derivation.
const derive = env => upstreamEnvironment({ FLIPFORGE_API_BRIDGE_ENABLED: "true", FLIPFORGE_API_BASE_URL: BASE, FLIPFORGE_API_SERVICE_TOKEN: TOKEN, ...env });
check(derive({ FLIPFORGE_API_BRIDGE_ENABLED: "false" }) === "none", "bridge disabled -> none");
check(derive({ FLIPFORGE_API_BASE_URL: "" }) === "none", "no backend URL -> none");
check(derive({ FLIPFORGE_API_SERVICE_TOKEN: "" }) === "none", "no service token -> none");
check(derive({}) === "unlabeled", "configured but unlabelled -> unlabeled");
check(derive({ FLIPFORGE_API_UPSTREAM_ENVIRONMENT: "Staging" }) === "staging", "staging label");
check(derive({ FLIPFORGE_API_UPSTREAM_ENVIRONMENT: "production" }) === "production", "production label");
check(derive({ FLIPFORGE_API_UPSTREAM_ENVIRONMENT: BASE }) === "unlabeled", "any other label value -> unlabeled (never echoed)");

const ctx = value => ({ deploy: { context: value } });
async function call(path, context, host = "deploy-preview-7--goflipforge.netlify.app") {
  upstreamCalls.length = 0;
  const response = await gateway(new Request(`https://${host}${path}`), context);
  const text = await response.text();
  return { status: response.status, marker: response.headers.get("x-flipforge-upstream-env"), text, headers: [...response.headers.entries()].join(" "), upstream: upstreamCalls.length };
}

// Marker on public health and on unauthenticated data routes.
setEnv({ label: "staging" });
let r = await call("/api/v1/health", ctx("deploy-preview"));
check(r.status === 200 && r.marker === "staging" && JSON.parse(r.text).data.upstreamEnvironment === "staging", "preview health exposes marker 'staging' in header and body");
r = await call("/api/v1/entitlements", ctx("deploy-preview"));
check(r.status === 401 && r.marker === "staging" && r.upstream === 0, "unauthenticated entitlements -> 401 with marker, no upstream call");
setEnv({ bridge: "false", label: "staging" });
r = await call("/api/v1/health", ctx("deploy-preview"));
check(r.marker === "none", "bridge disabled -> health marker 'none'");

// Fail closed on a contradicting label.
setEnv({ label: "production" });
r = await call("/api/v1/entitlements", ctx("deploy-preview"));
check(r.status === 503 && r.marker === "production" && r.text.includes("UPSTREAM_ENVIRONMENT_MISMATCH") && r.upstream === 0,
  "preview labelled production -> 503 mismatch, no upstream call");
r = await call("/api/v1/runtime-identity", ctx("branch-deploy"));
check(r.status === 503 && r.upstream === 0, "branch deploy labelled production -> runtime-identity probe refused");
r = await call("/api/v1/health", ctx("deploy-preview"));
check(r.status === 200 && r.marker === "production", "preview health still reports the contradicting label so outside checks can see it");
r = await call("/api/v1/entitlements", ctx("production"), "goflipforge.com");
check(r.status === 401 && r.marker === "production", "production labelled production -> normal behaviour (401 unauthenticated)");
setEnv({ label: "staging" });
r = await call("/api/v1/entitlements", ctx("production"), "goflipforge.com");
check(r.status === 503 && r.upstream === 0, "production labelled staging -> fail closed");
setEnv({});
r = await call("/api/v1/entitlements", ctx("production"), "goflipforge.com");
check(r.status === 401 && r.marker === "unlabeled", "production without a label keeps today's behaviour (marker 'unlabeled')");
r = await call("/api/v1/entitlements", undefined, "goflipforge.com");
check(r.status === 401, "no runtime deploy context -> no mismatch enforcement");

// Never discloses configuration values.
for (const label of ["staging", "production", undefined]) {
  setEnv({ label });
  for (const path of ["/api/v1/health", "/api/v1/entitlements", "/api/v1/runtime-identity"]) {
    r = await call(path, ctx("deploy-preview"));
    check(!`${r.text} ${r.headers}`.includes("backend-secret-host") && !`${r.text} ${r.headers}`.includes(TOKEN), `${path} (label ${label ?? "unset"}) never exposes the backend URL or token`);
  }
}

console.log("UpstreamEnvironmentMarkerValidation");
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
