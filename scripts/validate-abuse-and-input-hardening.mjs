// Abuse and input hardening checks:
// 1. Beta feedback is throttled per signed-in tester, without using a platform rate-limit rule, and the throttle
//    counters stay outside the feedback/ records the Owner Hub lists.
// 2. The API gateway accepts a client correlation id only when it is a short token of safe characters; anything
//    else is replaced, so arbitrary client text is not echoed or forwarded to backend logs.
import { createRequire } from "node:module";
import {
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RATE_WINDOW_MS,
  createBetaFeedbackHandler,
} from "../netlify/modern-functions/beta-feedback.mjs";

const require = createRequire(import.meta.url);
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

class MemoryStore {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? structuredClone(this.values.get(key)) : null; }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.values.has(key)) return { modified: false };
    this.values.set(key, structuredClone(value));
    return { modified: true, etag: String(this.values.size) };
  }
  keys(prefix) { return [...this.values.keys()].filter(key => key.startsWith(prefix)); }
}

const tester = id => ({ id, email: `${id}@example.com`, app_metadata: { roles: ["flipforge-active", `flipforge-tenant--beta-${id}`] } });
const store = new MemoryStore();
let clock = Date.parse("2026-10-20T12:00:00Z");
let currentUser = tester("tester-a");
const handler = createBetaFeedbackHandler({ store, getUserFn: async () => currentUser, now: () => new Date(clock) });
const submit = () => handler(new Request("https://goflipforge.com/api/beta/feedback", {
  method: "POST",
  headers: { origin: "https://goflipforge.com", "content-type": "application/json" },
  body: JSON.stringify({ category: "workflow", summary: "The decision reason was clear to me.", route: "discover", checkpoint: "GENERAL" }),
}));

const statuses = [];
for (let i = 0; i < FEEDBACK_RATE_LIMIT; i += 1) statuses.push((await submit()).status);
check(statuses.every(status => status === 202), `first ${FEEDBACK_RATE_LIMIT} submissions accepted (${statuses.join(",")})`);
const limited = await submit();
const limitedBody = await limited.json();
check(limited.status === 429 && limitedBody.reason === "RATE_LIMITED", `submission ${FEEDBACK_RATE_LIMIT + 1} in the window is throttled (got ${limited.status})`);
check(store.keys("feedback/").length === FEEDBACK_RATE_LIMIT, "a throttled submission stores no feedback record");
currentUser = tester("tester-b");
check((await submit()).status === 202, "another tester is not affected by the first tester's limit");
currentUser = tester("tester-a");
clock += FEEDBACK_RATE_WINDOW_MS;
check((await submit()).status === 202, "the limit resets after the window");
check(store.keys("rate/").length === 2 && store.keys("rate/").every(key => /^rate\/[0-9a-f]{64}\.json$/.test(key)),
  "throttle counters are hashed and stored under rate/, outside feedback/");
check(![...store.values.keys()].some(key => key.includes("tester-a")), "throttle keys do not contain the Identity user id");
currentUser = { app_metadata: tester("x").app_metadata };
check((await submit()).status === 429, "a session without a user id or email cannot bypass the throttle");

// Gateway correlation id.
const { handler: gateway } = require("../netlify/functions/flipforge-api.js");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function healthCorrelation(value) {
  const result = await gateway({
    httpMethod: "GET",
    path: "/api/v1/health",
    headers: { host: "goflipforge.com", ...(value === undefined ? {} : { "x-correlation-id": value }) },
    multiValueHeaders: {},
    queryStringParameters: {},
  }, {});
  return { header: result.headers["X-Correlation-Id"], meta: JSON.parse(result.body).meta.correlationId };
}
for (const valid of ["bridge-test-correlation", "seat-check", "2f1c3f0e-4b8e-4c55-9d2b-0f6a2b8f1a11", "bulk-corr-abc:123"]) {
  const result = await healthCorrelation(valid);
  check(result.header === valid && result.meta === valid, `safe client correlation id is kept: ${valid}`);
}
for (const [label, unsafe] of [
  ["markup", "<script>alert(1)</script>"],
  ["quotes and spaces", "a\" b ' c"],
  ["oversized", "x".repeat(129)],
  ["log line injection", "ok\tFAKE_EVENT=1"],
  ["empty", ""],
]) {
  const result = await healthCorrelation(unsafe);
  check(UUID.test(result.header) && result.meta === result.header, `unsafe client correlation id (${label}) is replaced`);
}

console.log("AbuseAndInputHardeningValidation");
for (const pass of passes) console.log(`PASS | ${pass}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
