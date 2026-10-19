"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkBackendGeneration } = require("../netlify/functions/flipforge-containment-release-gate");
const { handler } = require("../netlify/functions/flipforge-api");

const approved = "a".repeat(40);
const older = "b".repeat(40);
const event = { httpMethod: "GET", path: "/api/v1/dashboard", headers: { "x-correlation-id": "containment-test" } };
const context = { clientContext: { user: { app_metadata: { flipforge: {
  access: "active", tenantId: "test-tenant-001"
} } } } };

function envelope(commit, verified = true) {
  return { meta: {
    contractVersion: "1.0", engineVersion: "test-engine", authority: "Smart Opportunity",
    gradingAuthority: "Existing PSA intelligence", generatedAt: "2026-10-19T00:00:00Z",
    correlationId: "containment-test", runtimeBuildCommit: commit, runtimeBuildCommitVerified: verified
  }, data: { sensitiveHistoricalEvidence: "SENTINEL_NEVER_RELEASE_TO_OLD_BUILD" } };
}

async function request(commit, approvedCsv, verified = true) {
  const prior = {};
  const env = {
    FLIPFORGE_API_BRIDGE_ENABLED: "true", FLIPFORGE_API_BASE_URL: "https://unit.test",
    FLIPFORGE_API_SERVICE_TOKEN: "test-service-token", FLIPFORGE_APPROVED_BACKEND_COMMITS: approvedCsv
  };
  Object.keys(env).forEach(k => { prior[k] = process.env[k]; process.env[k] = env[k]; });
  const oldFetch = global.fetch;
  global.fetch = async () => ({
    ok: true, status: 200, headers: { get: () => null },
    arrayBuffer: async () => Buffer.from(JSON.stringify(envelope(commit, verified)))
  });
  try { return await handler(event, context); }
  finally {
    global.fetch = oldFetch;
    Object.keys(env).forEach(k => prior[k] === undefined ? delete process.env[k] : process.env[k] = prior[k]);
  }
}

test("approved full verified SHA passes", async () => {
  const response = await request(approved, approved);
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).data.sensitiveHistoricalEvidence, "SENTINEL_NEVER_RELEASE_TO_OLD_BUILD");
});
test("rollback to old SHA is rejected without exposing the upstream body", async () => {
  const response = await request(older, approved);
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).error.code, "BACKEND_CONTAINMENT_NOT_APPROVED");
  assert.doesNotMatch(response.body, /SENTINEL_NEVER_RELEASE/);
});
test("missing configured allowlist fails closed", async () => {
  assert.equal((await request(approved, "")).statusCode, 503);
});
test("unverified commit fails closed", async () => {
  assert.equal((await request(approved, approved, false)).statusCode, 503);
});
test("abbreviated build identity fails closed", async () => {
  assert.equal((await request(approved.slice(0, 12), approved)).statusCode, 503);
});
test("wildcard and branch labels never permit a generation", () => {
  assert.equal(checkBackendGeneration(envelope(approved), "*,main,unknown").ok, false);
});
test("multiple explicitly approved full SHAs support a controlled rollout", async () => {
  assert.equal((await request(approved, older + "," + approved)).statusCode, 200);
});
