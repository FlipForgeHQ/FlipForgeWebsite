const EXPECTED_COMMIT = "a9f2f8f909edca5713ad4cf276f379daf75a0247";
const SERVICE_TOKEN = "runtime-identity-validation-token-000000000000000000";

process.env.FLIPFORGE_API_BASE_URL = "https://backend.example.invalid";
process.env.FLIPFORGE_API_SERVICE_TOKEN = SERVICE_TOKEN;

let mode = "valid";
let captured = null;
globalThis.fetch = async (url, options = {}) => {
  captured = { url: String(url), options };
  const correlationId = options?.headers?.["X-Correlation-Id"] || "";
  const commit = mode === "valid" ? EXPECTED_COMMIT : EXPECTED_COMMIT.slice(0, 12);
  const verified = mode === "valid";
  return new Response(JSON.stringify({
    meta: {
      contractVersion: "1.0",
      engineVersion: "validation-engine",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      runtimeBuildIdentityVersion: "v1.0",
      runtimeBuildCommit: commit,
      runtimeBuildCommitVerified: verified,
      generatedAt: new Date().toISOString(),
      correlationId,
      evidenceFreshness: "SERVICE_STATUS_ONLY",
      limitations: ["Validation only."]
    },
    data: {
      service: "flipforge-authoritative-saas-api",
      status: "ready",
      runtimeMode: "PRIVATE_HOSTED",
      transactionAuthority: false
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

const { default: gateway } = await import("../netlify/modern-functions/flipforge-api.mjs");

function require(condition, message) {
  if (!condition) throw new Error(message);
}

async function callRuntimeIdentity() {
  const response = await gateway(new Request("https://goflipforge.com/api/v1/runtime-identity"));
  const payload = await response.json();
  return { response, payload };
}

mode = "valid";
let result = await callRuntimeIdentity();
require(result.response.status === 200, "Verified runtime identity must return 200.");
require(result.payload?.data?.status === "verified", "Verified runtime identity status is required.");
require(result.payload?.data?.runtimeBuildCommit === EXPECTED_COMMIT, "Exact backend commit must be preserved.");
require(result.payload?.data?.runtimeBuildCommitVerified === true, "Verified flag must be true for exact commit.");
require(result.payload?.data?.authority === "Smart Opportunity", "Smart Opportunity authority must be preserved.");
require(result.payload?.data?.gradingAuthority === "Existing PSA intelligence", "PSA authority must be preserved.");
require(result.payload?.data?.transactionAuthority === false, "Transaction authority must remain false.");
require(result.payload?.data?.backendUrlExposed === false, "Backend URL exposure marker must remain false.");
require(result.payload?.data?.serviceTokenExposed === false, "Service-token exposure marker must remain false.");
require(!JSON.stringify(result.payload).includes("backend.example.invalid"), "Backend URL must not appear in public payload.");
require(!JSON.stringify(result.payload).includes(SERVICE_TOKEN), "Service token must not appear in public payload.");
require(captured?.url === "https://backend.example.invalid/api/v1/health", "Gateway must query only backend health route.");
require(captured?.options?.headers?.Authorization === `Bearer ${SERVICE_TOKEN}`, "Backend health call must authenticate server-side.");

mode = "invalid";
result = await callRuntimeIdentity();
require(result.response.status === 503, "Abbreviated backend commit must fail closed.");
require(result.payload?.data?.status === "unavailable", "Invalid runtime identity must report unavailable.");
require(result.payload?.data?.runtimeBuildCommit === null, "Invalid backend commit must not leak through.");
require(result.payload?.data?.runtimeBuildCommitVerified === false, "Invalid backend commit cannot be verified.");
require(result.payload?.data?.transactionAuthority === false, "Fail-closed response must preserve no transaction authority.");

const methodResponse = await gateway(new Request("https://goflipforge.com/api/v1/runtime-identity", { method: "POST" }));
require(methodResponse.status === 405, "Runtime identity route must be GET-only.");

console.log("Backend runtime identity gateway validation: PASS");
