// Card evidence request ("Request evidence for this card") — intake, storage, isolation and
// operator-review contract. Runs entirely in memory; it never calls Netlify, Identity or the backend.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createBetaFeedbackHandler } from "../netlify/modern-functions/beta-feedback.mjs";
import { createBetaOperatorHandler } from "../netlify/modern-functions/beta-operator.mjs";
import { privilegedFunctionAllowed } from "../netlify/modern-functions/lib/production-deploy-guard.mjs";
import { feedbackSummary, validateCardReference } from "../netlify/modern-functions/lib/beta-operations-core.mjs";

class MemoryStore {
  constructor() { this.records = new Map(); this.etags = new Map(); this.sequence = 0; }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) return { modified: false };
    if (options.onlyIfMatch && this.etags.get(key) !== options.onlyIfMatch) return { modified: false };
    const etag = `etag-${++this.sequence}`;
    this.records.set(key, structuredClone(value));
    this.etags.set(key, etag);
    return { modified: true, etag };
  }
  async get(key) { return this.records.has(key) ? structuredClone(this.records.get(key)) : null; }
  async getWithMetadata(key) { return this.records.has(key) ? { data: structuredClone(this.records.get(key)), etag: this.etags.get(key), metadata: {} } : null; }
  list({ prefix = "", paginate = false } = {}) {
    const result = { blobs: [...this.records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), directories: [] };
    if (!paginate) return Promise.resolve(result);
    return { async *[Symbol.asyncIterator]() { yield result; } };
  }
  async delete(key) { this.records.delete(key); this.etags.delete(key); }
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (error) {
    results.push([false, `${name}: ${error.message}`]);
  }
}

const fixedNow = new Date("2026-10-22T16:00:00.000Z");
const testerA = { email: "tester-a@example.com", roles: ["flipforge-active", "flipforge-tenant--tenant-a"] };
const testerB = { email: "tester-b@example.com", roles: ["flipforge-active", "flipforge-tenant--tenant-b"] };
const operatorUser = { id: "operator-1", email: "owner@example.com", roles: ["flipforge-operator"] };

const card = {
  identity: "2023 Topps Chrome Elly De La Cruz #1 PSA 10",
  year: "2023",
  player: "",
  set: "",
  cardNumber: "1",
  parallel: "",
  grader: "PSA",
  grade: "10",
  source: "DISCOVER_EXACT_SEARCH",
  edited: false,
};
const base = {
  category: "evidence",
  summary: "Please add sold-price evidence for the card below so FlipForge can show a value for it.",
  expected: "A value for the card, backed by sold-price evidence.",
  route: "beta-start",
  checkpoint: "GENERAL",
};
const request = (body, overrides = {}) => new Request("https://goflipforge.com/api/beta/feedback", {
  method: overrides.method || "POST",
  headers: { origin: "https://goflipforge.com", "content-type": "application/json" },
  body: overrides.method === "GET" ? undefined : (overrides.raw ?? JSON.stringify(body)),
});

const store = new MemoryStore();
const logs = [];
const originalLog = console.log;
console.log = value => logs.push(String(value));
const intakeA = createBetaFeedbackHandler({ store, getUserFn: async () => testerA, now: () => fixedNow });
const intakeB = createBetaFeedbackHandler({ store, getUserFn: async () => testerB, now: () => fixedNow });
const storedCount = async () => (await store.list({ prefix: "feedback/" })).blobs.length;

async function rejected(body, code, handler = intakeA) {
  const before = await storedCount();
  const response = await handler(request(body));
  const payload = await response.json();
  assert.equal(response.status, 400, `expected 400, got ${response.status}`);
  const codes = Array.isArray(code) ? code : [code];
  assert.ok(codes.some(value => payload.fields.includes(value)), `expected ${codes.join(" or ")}, got ${payload.fields.join(",")}`);
  assert.equal(await storedCount(), before, "a rejected request must store nothing");
}

try {
  // Accepted request and storage contract
  let storedA;
  await check("valid card evidence request is accepted and stored as schema v2", async () => {
    const response = await intakeA(request({ ...base, requestType: "CARD_EVIDENCE", cardReference: card }));
    assert.equal(response.status, 202);
    const keys = (await store.list({ prefix: "feedback/" })).blobs.map(item => item.key);
    assert.equal(keys.length, 1);
    storedA = await store.get(keys[0]);
    assert.equal(storedA.schemaVersion, 2);
    assert.equal(storedA.feedback.requestType, "CARD_EVIDENCE");
    assert.deepEqual(storedA.feedback.cardReference, { ...card });
  });
  await check("stored record holds no tenant role, tenant id or email without consent", async () => {
    const text = JSON.stringify(storedA);
    assert.ok(!text.includes("tenant-a") && !text.includes("flipforge-tenant"), "tenant reference stored");
    assert.ok(!text.includes("tester-a@example.com"), "email stored without consent");
    assert.equal(storedA.feedback.contactEmail, null);
  });
  await check("operation log records only that a card reference exists, never the card", async () => {
    const line = logs.find(value => value.includes("FEEDBACK_STORED"));
    assert.ok(line && JSON.parse(line).cardEvidenceRequest === true);
    assert.ok(logs.every(value => !value.includes("Elly") && !value.includes("Topps")), "card identity logged");
  });
  await check("feedback without a card reference stays schema v1 and unchanged", async () => {
    const response = await intakeA(request({ ...base, category: "workflow", summary: "The Discover page was clear and quick to use." }));
    assert.equal(response.status, 202);
    const records = await Promise.all((await store.list({ prefix: "feedback/" })).blobs.map(item => store.get(item.key)));
    const plain = records.find(record => record.feedback.category === "workflow");
    assert.equal(plain.schemaVersion, 1);
    assert.ok(!("cardReference" in plain.feedback) && !("requestType" in plain.feedback));
  });
  await check("fields are normalized: '#' stripped, grader and grade upper-cased, whitespace collapsed", async () => {
    const result = validateCardReference({ requestType: "CARD_EVIDENCE", cardReference: { ...card, identity: "  2023   Topps Chrome  #1 ", cardNumber: "#US50", grader: "psa", grade: "authentic" } }, "evidence");
    assert.ok(result.ok, result.errors.join(","));
    assert.equal(result.cardReference.identity, "2023 Topps Chrome #1");
    assert.equal(result.cardReference.cardNumber, "US50");
    assert.equal(result.cardReference.grader, "PSA");
    assert.equal(result.cardReference.grade, "AUTHENTIC");
  });

  // Missing fields
  await check("missing optional fields are accepted and stored as empty", async () => {
    const response = await intakeA(request({ ...base, requestType: "CARD_EVIDENCE", cardReference: { identity: "1986 Fleer Michael Jordan", source: "DISCOVER_EXACT_SEARCH" } }));
    assert.equal(response.status, 202);
    const records = await Promise.all((await store.list({ prefix: "feedback/" })).blobs.map(item => store.get(item.key)));
    const minimal = records.find(record => record.feedback.cardReference?.identity === "1986 Fleer Michael Jordan");
    assert.equal(minimal.feedback.cardReference.cardNumber, "");
    assert.equal(minimal.feedback.cardReference.edited, false);
  });
  await check("missing card identity is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { year: "2023", source: "DISCOVER_EXACT_SEARCH" } }, "CARD_REFERENCE_IDENTITY_REQUIRED"));
  await check("too-short card identity is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, identity: "#1" } }, "CARD_REFERENCE_IDENTITY_REQUIRED"));
  await check("request type without a card reference is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE" }, "CARD_REFERENCE_REQUIRED"));
  await check("card reference without the request type is refused", () => rejected({ ...base, cardReference: card }, "REQUEST_TYPE_INVALID"));
  await check("missing source is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, source: undefined } }, "CARD_REFERENCE_SOURCE_INVALID"));

  // Data that must never be submitted
  for (const field of ["listingUrl", "seller", "sellerName", "priceCents", "itemPriceCents", "saleId", "soldPriceCents", "externalListingId", "tenantId", "providerRecordId", "selectionToken", "token"]) {
    await check(`extra field "${field}" is refused, not dropped`, () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, [field]: "x" } }, "CARD_REFERENCE_FIELD_NOT_ALLOWED"));
  }
  await check("__proto__ key in JSON is refused", async () => {
    const before = await storedCount();
    const raw = `{"category":"evidence","summary":"${base.summary}","route":"beta-start","checkpoint":"GENERAL","requestType":"CARD_EVIDENCE","cardReference":{"identity":"2023 Topps Chrome #1","source":"DISCOVER_EXACT_SEARCH","__proto__":{"polluted":true}}}`;
    const response = await intakeA(request(null, { raw }));
    assert.equal(response.status, 400);
    assert.equal(({}).polluted, undefined);
    assert.equal(await storedCount(), before);
  });
  const unsafe = [
    ["identity", "https://www.ebay.com/itm/123 Topps"],
    ["identity", "2023 Topps Chrome ebay.com/itm/1"],
    ["player", "seller@example.com"],
    ["set", "Topps 123456789012"],
    ["parallel", "Refractor $250"],
    ["player", "<script>alert(1)</script>"],
    ["set", "www.cardsite"],
  ];
  for (const [field, value] of unsafe) {
    await check(`unsafe ${field} value ${JSON.stringify(value)} is refused`, () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, [field]: value } }, "CARD_REFERENCE_UNSAFE_CONTENT"));
  }

  // Malformed input
  await check("non-string field value is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, year: 2023 } }, "CARD_REFERENCE_VALUE_INVALID"));
  await check("object field value is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, player: { name: "x" } } }, "CARD_REFERENCE_VALUE_INVALID"));
  await check("non-boolean edited flag is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, edited: "yes" } }, "CARD_REFERENCE_VALUE_INVALID"));
  await check("array card reference is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: [card] }, "CARD_REFERENCE_REQUIRED"));
  await check("string card reference is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: "2023 Topps Chrome #1" }, "CARD_REFERENCE_REQUIRED"));
  await check("oversized field value is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, player: "A".repeat(400) } }, "CARD_REFERENCE_VALUE_INVALID"));
  await check("unknown request type is refused", () => rejected({ ...base, requestType: "LISTING_REPORT", cardReference: card }, "REQUEST_TYPE_INVALID"));
  await check("non-evidence category is refused", () => rejected({ ...base, category: "bug", requestType: "CARD_EVIDENCE", cardReference: card }, "CARD_EVIDENCE_CATEGORY_INVALID"));
  for (const year of ["23", "2023-2024", "1700", "20233", "year"]) {
    await check(`year ${JSON.stringify(year)} is refused`, () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, year } }, ["CARD_REFERENCE_YEAR_INVALID", "CARD_REFERENCE_VALUE_INVALID"]));
  }
  await check("season year 2025-26 is accepted", async () => assert.ok(validateCardReference({ requestType: "CARD_EVIDENCE", cardReference: { ...card, year: "2025-26" } }, "evidence").ok));
  for (const cardNumber of ["1 2", "-5", "#", "A".repeat(30)]) {
    await check(`card number ${JSON.stringify(cardNumber.slice(0, 12))} is refused`, async () => {
      const result = validateCardReference({ requestType: "CARD_EVIDENCE", cardReference: { ...card, cardNumber } }, "evidence");
      assert.ok(!result.ok);
    });
  }
  await check("unknown grader is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, grader: "XYZ" } }, "CARD_REFERENCE_GRADER_INVALID"));
  await check("grade 11 is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, grade: "11" } }, "CARD_REFERENCE_GRADE_INVALID"));
  await check("grade without a grader is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, grader: "" } }, "CARD_REFERENCE_GRADE_WITHOUT_GRADER"));
  await check("raw card with a grade is refused", () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, grader: "RAW" } }, "CARD_REFERENCE_GRADE_WITHOUT_GRADER"));
  await check("invalid JSON body is refused", async () => {
    const response = await intakeA(request(null, { raw: "{not json" }));
    assert.equal(response.status, 400);
  });
  await check("payload over the size limit is refused", async () => {
    const response = await intakeA(request({ ...base, requestType: "CARD_EVIDENCE", cardReference: card, expected: "x".repeat(9000) }));
    assert.equal(response.status, 413);
  });

  // Access and tenant isolation
  await check("signed-out caller cannot submit", async () => {
    const anonymous = createBetaFeedbackHandler({ store, getUserFn: async () => null, now: () => fixedNow });
    assert.equal((await anonymous(request({ ...base, requestType: "CARD_EVIDENCE", cardReference: card }))).status, 401);
  });
  await check("cross-origin submission is refused", async () => {
    const response = await intakeA(new Request("https://goflipforge.com/api/beta/feedback", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ ...base, requestType: "CARD_EVIDENCE", cardReference: card }) }));
    assert.equal(response.status, 403);
  });
  await check("tester feedback endpoint has no read path (GET refused)", async () => {
    assert.equal((await intakeB(request(null, { method: "GET" }))).status, 405);
  });
  await check("a tester cannot attach another tenant's identity to a request", async () => rejected({ ...base, requestType: "CARD_EVIDENCE", cardReference: { ...card, tenantId: "tenant-a" } }, "CARD_REFERENCE_FIELD_NOT_ALLOWED", intakeB));

  const operatorDeps = {
    applicationStore: new MemoryStore(),
    eventStore: new MemoryStore(),
    feedbackStore: store,
    identityAdmin: { async listUsers() { return []; }, async updateUser() { throw new Error("not expected"); } },
    inviteIdentity: async () => { throw new Error("not expected"); },
    admissionClient: { async admit() { throw new Error("not expected"); }, async revoke() { throw new Error("not expected"); } },
    now: () => fixedNow,
  };
  const operatorRequest = () => new Request("https://goflipforge.com/api/beta/operator", { method: "GET", headers: { origin: "https://goflipforge.com" } });
  await check("another tenant's active tester cannot read stored requests (operator API 403)", async () => {
    const handler = createBetaOperatorHandler({ ...operatorDeps, getUserFn: async () => testerB });
    const response = await handler(operatorRequest());
    assert.equal(response.status, 403);
    assert.ok(!JSON.stringify(await response.json()).includes("Elly"));
  });
  await check("signed-out caller cannot read stored requests (operator API 401)", async () => {
    const handler = createBetaOperatorHandler({ ...operatorDeps, getUserFn: async () => null });
    assert.equal((await handler(operatorRequest())).status, 401);
  });
  await check("operator API is production-domain only (previews and other hosts refused)", async () => {
    const env = {};
    assert.equal(privilegedFunctionAllowed(new Request("https://goflipforge.com/api/beta/operator"), { deploy: { context: "production" } }, env), true);
    assert.equal(privilegedFunctionAllowed(new Request("https://deploy-preview-548--goflipforge.netlify.app/api/beta/operator"), { deploy: { context: "deploy-preview" } }, env), false);
    assert.equal(privilegedFunctionAllowed(new Request("https://goflipforge.netlify.app/api/beta/operator"), { deploy: { context: "production" } }, env), false);
    assert.equal(privilegedFunctionAllowed(new Request("https://goflipforge.com/api/beta/operator"), { deploy: { context: "branch-deploy" } }, env), false);
  });
  await check("operator sees the card reference and a request count", async () => {
    const handler = createBetaOperatorHandler({ ...operatorDeps, getUserFn: async () => operatorUser });
    const response = await handler(operatorRequest());
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    const request = dashboard.feedback.find(item => item.feedback?.cardReference?.identity === card.identity);
    assert.ok(request, "card request missing from operator view");
    assert.equal(dashboard.feedbackSummary.cardEvidenceRequests, 2);
    assert.equal(feedbackSummary([]).cardEvidenceRequests, 0);
  });

  // Client and operator display contracts
  const discover = fs.readFileSync("saas-prototype/customer-discovery.js", "utf8");
  const beta = fs.readFileSync("saas-prototype/private-beta.js", "utf8");
  const operatorClient = fs.readFileSync("assets/js/beta-operator.js", "utf8");
  await check("Discover builds the card reference without listing, seller, price or sale data", async () => {
    const fn = discover.slice(discover.indexOf("function cardReferenceFor(item)"), discover.indexOf("function requestEvidence(index)"));
    assert.ok(fn.length > 100, "cardReferenceFor not found");
    assert.ok(!/listingUrl|seller|Cents|evaluationRequest|externalListingId|selectionToken|evidence\./.test(fn), "card reference reads non-identity data");
    assert.ok(fn.includes('String(item.matchQuality || "") !== "EXACT_MATCH"'), "card reference not limited to exact matches");
  });
  await check("Discover wording separates no qualified sales from below-threshold sales", async () => {
    assert.ok(discover.includes("No qualified sales yet"));
    assert.ok(discover.includes("not enough yet") && discover.includes("below the minimum it needs"));
    assert.ok(discover.includes('data-sold-evidence-state="none"') && discover.includes('data-sold-evidence-state="below-threshold"'));
  });
  await check("tester reviews, corrects and can remove every card field before sending", async () => {
    assert.ok(beta.includes("Check these details before you send") && beta.includes("data-card-reference-remove"));
    assert.ok(beta.includes("cardReferenceProblem(cardReference)"));
  });
  await check("operator view escapes every card field and labels the request as not evidence", async () => {
    const fn = operatorClient.slice(operatorClient.indexOf("function cardReferenceDetail(f)"), operatorClient.indexOf("function renderFeedbackDetail()"));
    assert.ok(fn.includes("esc(c.identity)") && fn.includes("value(c.player)") && fn.includes("esc(c.cardNumber)"));
    assert.ok(fn.includes("It is a request for evidence, not evidence"));
    assert.ok(!/\$\{c\.[a-zA-Z]+\}/.test(fn), "unescaped card field interpolation");
  });
} finally {
  console.log = originalLog;
}

let failed = 0;
for (const [ok, name] of results) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}`);
}
console.log(`validate-beta-card-evidence-request: ${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
