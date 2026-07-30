import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const files = {
  index: read("saas-prototype/index.html"),
  adapter: read("saas-prototype/staging-evaluation.js"),
  readAdapter: read("saas-prototype/staging-browser.js"),
  hook: read("saas-prototype/staging-route-hook.js"),
  css: read("saas-prototype/staging-evaluation.css"),
  gateway: read("netlify/functions/flipforge-api.js")
};

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 evaluation stylesheet is loaded", files.index.includes('href="staging-evaluation.css"'));
check("002 evaluation adapter is loaded", files.index.includes('src="staging-evaluation.js"'));
check("003 evaluation adapter loads before route hook", files.index.indexOf('src="staging-evaluation.js"') < files.index.indexOf('src="staging-route-hook.js"'));
check("004 evaluation navigation is hidden by default", /data-route="staging-evaluate"[^>]*hidden/.test(files.index));
check("005 evaluation navigation uses staging-only class", /data-route="staging-evaluate"[^>]*staging-only-nav/.test(files.index));
check("006 evaluation route is separate from mock evaluate route", files.index.includes('href="#/evaluate" data-route="evaluate"') && files.index.includes('href="#/staging-evaluate"'));
check("007 adapter restricts execution to deploy previews and localhost", files.adapter.includes("deploy-preview-") && files.adapter.includes("localhost") && files.adapter.includes("127\\.0\\.0\\.1"));
check("008 production hostname is not allowlisted", !files.adapter.includes("www.goflipforge.com") && !files.adapter.includes("goflipforge.com|"));
check("009 adapter posts only to fixed same-origin evaluation path", files.adapter.includes('const EVALUATION_PATH = "/api/v1/evaluations"') && files.adapter.includes("fetch(EVALUATION_PATH"));
check("010 adapter exposes no dynamic write path", !/fetch\(\s*(?:path|url|endpoint)/.test(files.adapter));
check("011 adapter uses POST only for submission", files.adapter.includes('method: "POST"'));
check("012 credentials remain same-origin", files.adapter.includes('credentials: "same-origin"'));
check("013 browser caching is disabled", files.adapter.includes('cache: "no-store"'));
check("014 redirects are refused", files.adapter.includes('redirect: "error"'));
check("015 request body is JSON", files.adapter.includes("body: JSON.stringify(payload)"));
check("016 content type is JSON UTF-8", files.adapter.includes('"Content-Type": "application/json; charset=utf-8"'));
check("017 correlation ID is sent", files.adapter.includes('"X-Correlation-Id": requestCorrelationId'));
check("018 idempotency key is sent", files.adapter.includes('"Idempotency-Key": idempotencyKey'));
check("019 idempotency key is generated internally", files.adapter.includes("function newIdempotencyKey()") && files.adapter.includes("eval-${suffix}"));
check("020 unchanged payload retains key", files.adapter.includes("state.payloadFingerprint !== fingerprint"));
check("021 idempotency state is memory only", !/localStorage|sessionStorage|document\.cookie/.test(files.adapter));
check("022 optional identity JWT remains memory only", files.adapter.includes("window.netlifyIdentity") && files.adapter.includes("user.jwt()"));
check("023 browser never sends trusted tenant header", !/X-FlipForge-Tenant-Id/i.test(files.adapter));
check("024 browser never sends raw user header", !/X-FlipForge-User-Id/i.test(files.adapter));
check("025 browser never references service token", !/FLIPFORGE_API_SERVICE_TOKEN/.test(files.adapter));
check("026 adapter validates contract v1", files.adapter.includes("meta.contractVersion === CONTRACT_VERSION"));
check("027 adapter requires Smart Opportunity authority", files.adapter.includes('meta.authority === "Smart Opportunity"'));
check("028 adapter requires existing PSA authority", files.adapter.includes('meta.gradingAuthority === "Existing PSA intelligence"'));
check("029 adapter requires exact correlation match", files.adapter.includes("meta.correlationId === expectedCorrelationId"));
check("030 adapter requires evaluation kind", files.adapter.includes('data.kind === "evaluation"'));
check("031 adapter requires matching request ID", files.adapter.includes("data.requestId === expectedRequestId"));
check("032 adapter requires SQLite persistence", files.adapter.includes("data.persistedToSqlite === true"));
check("033 adapter requires tenant ownership", files.adapter.includes("data.tenantOwned === true"));
check("034 adapter requires tenant idempotency scope", files.adapter.includes('isolation.idempotencyScope === "TENANT"'));
check("035 adapter requires ownership grant on completion", files.adapter.includes('isolation.opportunityOwnership === "GRANTED_ON_COMPLETION"'));
check("036 adapter requires default deny", files.adapter.includes('isolation.defaultAccess === "DENY"'));
check("037 adapter requires no evidence verification", files.adapter.includes("data.requestCanVerifyEvidence === false"));
check("038 adapter requires no identity verification", files.adapter.includes("data.requestCanVerifyIdentity === false"));
check("039 adapter requires no evidence acceptance", files.adapter.includes("data.evidenceAcceptedByRequest === false"));
check("040 adapter requires no PSA recalculation", files.adapter.includes("data.psaRecalculated === false"));
check("041 adapter requires no transaction authority", files.adapter.includes("data.transactionAuthorized === false"));
check("042 adapter requires no credential exposure", files.adapter.includes("data.providerCredentialsExposed === false"));
check("043 adapter permits only existing recommendation states", files.adapter.includes('new Set(["BUY", "WATCH", "VERIFY", "PASS"])'));
check("044 form requires authority acknowledgment", files.adapter.includes("EVALUATION_BOUNDARY_ACKNOWLEDGMENT_REQUIRED") && files.adapter.includes('name="acknowledgeBoundary"'));
check("045 form states identity remains unverified", files.adapter.includes("Identity remains NEEDS_VERIFICATION"));
check("046 form states no purchase authority", files.adapter.includes("authorize a bid or purchase"));
check("047 supported marketplace list matches backend boundary", ["EBAY", "COMC", "MYSLABS", "GOLDIN", "HERITAGE", "FANATICS_COLLECT", "DEALER", "CARD_SHOW", "FACEBOOK_GROUP", "OTHER"].every(value => files.adapter.includes(`"${value}"`)));
check("048 money parser requires at most two decimals", files.adapter.includes('/^\\d+(?:\\.\\d{1,2})?$/'));
check("049 money parser uses integer cents", files.adapter.includes("BigInt(whole) * 100n"));
check("050 money parser enforces backend maximum", files.adapter.includes("10_000_000_000n"));
check("051 listing URL requires HTTP or HTTPS", files.adapter.includes('url.protocol === "http:"') && files.adapter.includes('url.protocol === "https:"'));
check("052 external listing ID is safety checked", files.adapter.includes("SAFE_EXTERNAL_ID.test(externalListingId)"));
check("053 resulting opportunity ID is safety checked", files.adapter.includes("SAFE_OPPORTUNITY_ID.test(opportunityId)"));
check("054 response size is bounded", files.adapter.includes("MAX_RESPONSE_CHARACTERS") && files.adapter.includes("STAGING_RESPONSE_TOO_LARGE"));
check("055 invalid JSON fails closed", files.adapter.includes("STAGING_INVALID_JSON"));
check("056 route hook retains existing staging read route", files.hook.includes('if (route === "staging")') && files.hook.includes("adapter.render(main, id)"));
check("057 route hook adds isolated evaluation route", files.hook.includes('route !== "staging-evaluate"') && files.hook.includes("evaluationAdapter.render(main)"));
check("058 route hook uses distinct evaluation banner", files.hook.includes("STAGING EVALUATION") && files.hook.includes("No transaction authority"));
check("059 read adapter remains GET only", files.readAdapter.includes('method: "GET"') && !/method:\s*"POST"/.test(files.readAdapter));
check("060 gateway allowlists evaluation POST", files.gateway.includes('method: "POST"') && files.gateway.includes('pattern: /^\\/api\\/v1\\/evaluations$/'));
check("061 gateway requires evaluation idempotency", files.gateway.includes("evaluationIdempotency") && files.gateway.includes("IDEMPOTENCY_KEY_REQUIRED"));
check("062 gateway remains tenant-header injector", files.gateway.includes("[TENANT_HEADER]: tenant.tenantId"));
check("063 evaluation CSS is responsive", files.css.includes("@media (max-width: 720px)"));
check("064 evaluation CSS has focus treatment", files.css.includes(".staging-field input:focus"));
check("065 evaluation CSS respects reduced motion", files.css.includes("prefers-reduced-motion"));

function makeForm(values) {
  return {
    values: { ...values },
    handler: null,
    addEventListener(type, handler) {
      if (type === "submit") this.handler = handler;
    },
    submit() {
      if (!this.handler) throw new Error("Submit handler was not bound.");
      this.handler({ preventDefault() {} });
    }
  };
}

function makeMain(form) {
  return {
    innerHTML: "",
    focus() {},
    querySelector(selector) {
      if (selector === "[data-staging-evaluation-form]") return form;
      return null;
    }
  };
}

class TestFormData {
  constructor(form) {
    this.values = form.values;
  }
  get(name) {
    return Object.prototype.hasOwnProperty.call(this.values, name) ? this.values[name] : null;
  }
}

function validValues(overrides = {}) {
  return {
    externalListingId: "123456789012",
    marketplace: "EBAY",
    cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 PSA 10",
    listingUrl: "https://example.invalid/listing/123456789012",
    seller: "preview-seller",
    itemPrice: "525.25",
    shipping: "8.50",
    buyerPremium: "0",
    tax: "42.02",
    listingFormat: "FIXED_PRICE",
    endsAt: "",
    acknowledgeBoundary: "yes",
    ...overrides
  };
}

function evaluationEnvelope(correlationId, requestId, overrides = {}) {
  const data = {
    kind: "evaluation",
    requestId,
    opportunityId: "EBAY-123456789012",
    idempotentReplay: false,
    persistedToSqlite: true,
    tenantOwned: true,
    normalizedRequest: {
      externalListingId: "123456789012",
      marketplace: "EBAY",
      itemPriceCents: 52525,
      shippingCents: 850,
      taxCents: 4202,
      allInAskCents: 57577
    },
    decision: {
      recommendation: "BUY",
      workflowStatus: "BUY_READY_CANDIDATE",
      supportedValueCents: 60200,
      exactTrustedCompCount: 4,
      supportRating: "SUPPORTED",
      confidence: 86,
      risk: 32,
      reason: "Saved governed evidence supports the decision.",
      missingRequirement: null,
      nextAction: "Review the saved evidence before acting.",
      duplicateOpportunity: false
    },
    requestCanVerifyEvidence: false,
    requestCanVerifyIdentity: false,
    evidenceAcceptedByRequest: false,
    psaRecalculated: false,
    transactionAuthorized: false,
    providerCredentialsExposed: false,
    tenantIsolation: {
      enforced: true,
      tenantAuditKey: "tenant-audit-test",
      idempotencyScope: "TENANT",
      opportunityOwnership: "GRANTED_ON_COMPLETION",
      defaultAccess: "DENY"
    },
    ...overrides
  };
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test-engine",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-07-30T22:00:00Z",
      correlationId
    },
    data
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createRuntime({ hostname = "deploy-preview-22--goflipforge.netlify.app", values = validValues(), fetchImpl, identity = true }) {
  const nav = { hidden: true };
  const form = makeForm(values);
  const main = makeMain(form);
  let uuidCounter = 0;
  const window = {
    location: { hostname, hash: "#/staging-evaluate" },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` },
    netlifyIdentity: identity ? {
      currentUser: () => ({ jwt: async () => "signed-preview-token" })
    } : null
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-route='staging-evaluate']") return nav;
      return null;
    }
  };
  const context = vm.createContext({
    window,
    document,
    fetch: fetchImpl,
    Response,
    URL,
    Intl,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    BigInt,
    RegExp,
    Promise,
    Set,
    FormData: TestFormData,
    console,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent
  });
  vm.runInContext(files.adapter, context, { filename: "staging-evaluation.js" });
  return { window, nav, form, main };
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 35));
}

const calls = [];
let responseCount = 0;
const runtime = createRuntime({
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    responseCount++;
    const correlationId = options.headers["X-Correlation-Id"];
    const requestId = options.headers["Idempotency-Key"];
    return jsonResponse(evaluationEnvelope(correlationId, requestId, {
      idempotentReplay: responseCount > 1
    }));
  }
});

check("066 deploy-preview navigation becomes visible", runtime.nav.hidden === false);
check("067 adapter reports deploy preview eligible", runtime.window.FlipForgeStagingEvaluationAdapter.isEligible() === true);
runtime.window.FlipForgeStagingEvaluationAdapter.render(runtime.main);
check("068 initial render shows explicit staging form", runtime.main.innerHTML.includes("Submit a staging evaluation") && runtime.main.innerHTML.includes("Write boundary"));
check("069 initial render performs no write", calls.length === 0);
runtime.form.submit();
await settle();
check("070 valid submission performs exactly one request", calls.length === 1);
check("071 valid submission uses fixed evaluation path", calls[0].url === "/api/v1/evaluations");
check("072 valid submission uses POST and same-origin controls", calls[0].options.method === "POST" && calls[0].options.credentials === "same-origin" && calls[0].options.cache === "no-store" && calls[0].options.redirect === "error");
check("073 signed token is forwarded only as Authorization", calls[0].options.headers.Authorization === "Bearer signed-preview-token");
check("074 runtime sends no tenant or user header", !("X-FlipForge-Tenant-Id" in calls[0].options.headers) && !("X-FlipForge-User-Id" in calls[0].options.headers));
check("075 runtime idempotency key is safe", SAFE_TEST(calls[0].options.headers["Idempotency-Key"]));
const firstKey = calls[0].options.headers["Idempotency-Key"];
const firstBody = JSON.parse(calls[0].options.body);
check("076 dollars convert exactly to integer cents", firstBody.itemPriceCents === 52525 && firstBody.shippingCents === 850 && firstBody.buyerPremiumCents === 0 && firstBody.taxCents === 4202);
check("077 payload preserves governed manual intake fields", firstBody.externalListingId === "123456789012" && firstBody.marketplace === "EBAY" && firstBody.cardIdentity.includes("Ohtani") && firstBody.listingUrl.startsWith("https://"));
check("078 payload contains no authority override fields", !("recommendation" in firstBody) && !("confidence" in firstBody) && !("verified" in firstBody) && !("transactionAuthorized" in firstBody));
check("079 authoritative result renders", runtime.main.innerHTML.includes("Authoritative staging result") && runtime.main.innerHTML.includes("Saved governed evidence supports the decision."));
check("080 result states SQLite and tenant boundary", runtime.main.innerHTML.includes("persisted to SQLite") && runtime.main.innerHTML.includes("granted tenant ownership"));
check("081 result exposes saved record link", runtime.main.innerHTML.includes("#/staging/EBAY-123456789012"));

runtime.form.submit();
await settle();
check("082 unchanged retry performs second request", calls.length === 2);
check("083 unchanged retry reuses idempotency key", calls[1].options.headers["Idempotency-Key"] === firstKey);
check("084 idempotent replay is displayed", runtime.main.innerHTML.includes("Idempotent replay") && runtime.main.innerHTML.includes(">Yes<"));

runtime.form.values.itemPrice = "526.00";
runtime.form.submit();
await settle();
check("085 changed payload performs third request", calls.length === 3);
check("086 changed payload generates new idempotency key", calls[2].options.headers["Idempotency-Key"] !== firstKey);
check("087 changed payload converts new cents", JSON.parse(calls[2].options.body).itemPriceCents === 52600);

const noAckCalls = [];
const noAck = createRuntime({ values: validValues({ acknowledgeBoundary: null }), fetchImpl: async (...args) => { noAckCalls.push(args); return jsonResponse({}); } });
noAck.window.FlipForgeStagingEvaluationAdapter.render(noAck.main);
noAck.form.submit();
await settle();
check("088 missing acknowledgment is rejected before fetch", noAckCalls.length === 0 && noAck.main.innerHTML.includes("EVALUATION_BOUNDARY_ACKNOWLEDGMENT_REQUIRED"));

const badMoneyCalls = [];
const badMoney = createRuntime({ values: validValues({ itemPrice: "12.345" }), fetchImpl: async (...args) => { badMoneyCalls.push(args); return jsonResponse({}); } });
badMoney.window.FlipForgeStagingEvaluationAdapter.render(badMoney.main);
badMoney.form.submit();
await settle();
check("089 invalid money is rejected before fetch", badMoneyCalls.length === 0 && badMoney.main.innerHTML.includes("EVALUATION_MONEY_INVALID"));

const badUrlCalls = [];
const badUrl = createRuntime({ values: validValues({ listingUrl: "file:///secret.db" }), fetchImpl: async (...args) => { badUrlCalls.push(args); return jsonResponse({}); } });
badUrl.window.FlipForgeStagingEvaluationAdapter.render(badUrl.main);
badUrl.form.submit();
await settle();
check("090 non-HTTP URL is rejected before fetch", badUrlCalls.length === 0 && badUrl.main.innerHTML.includes("EVALUATION_URL_INVALID"));

const unsafeIdCalls = [];
const unsafeId = createRuntime({ values: validValues({ externalListingId: "bad id / path" }), fetchImpl: async (...args) => { unsafeIdCalls.push(args); return jsonResponse({}); } });
unsafeId.window.FlipForgeStagingEvaluationAdapter.render(unsafeId.main);
unsafeId.form.submit();
await settle();
check("091 unsafe listing ID is rejected before fetch", unsafeIdCalls.length === 0 && unsafeId.main.innerHTML.includes("EVALUATION_LISTING_ID_INVALID"));

const unauthorizedCalls = [];
const unauthorized = createRuntime({
  identity: false,
  fetchImpl: async (url, options) => {
    unauthorizedCalls.push({ url, options });
    return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", correlationId: options.headers["X-Correlation-Id"] } }, 401);
  }
});
unauthorized.window.FlipForgeStagingEvaluationAdapter.render(unauthorized.main);
unauthorized.form.submit();
await settle();
check("092 unauthenticated submission fails closed", unauthorizedCalls.length === 1 && unauthorized.main.innerHTML.includes("AUTHENTICATION_REQUIRED"));
check("093 unauthenticated screen contains no invented decision", !unauthorized.main.innerHTML.includes("Authoritative staging result") && !unauthorized.main.innerHTML.includes("Saved governed evidence supports"));

const invalidContract = createRuntime({
  fetchImpl: async (_url, options) => jsonResponse(evaluationEnvelope(
    options.headers["X-Correlation-Id"],
    options.headers["Idempotency-Key"],
    { transactionAuthorized: true }
  ))
});
invalidContract.window.FlipForgeStagingEvaluationAdapter.render(invalidContract.main);
invalidContract.form.submit();
await settle();
check("094 transaction-authorizing response is rejected", invalidContract.main.innerHTML.includes("STAGING_EVALUATION_CONTRACT_INVALID") && !invalidContract.main.innerHTML.includes("Authoritative staging result"));

const foreignCalls = [];
const foreign = createRuntime({ hostname: "goflipforge.com", fetchImpl: async (...args) => { foreignCalls.push(args); return jsonResponse({}); } });
foreign.window.FlipForgeStagingEvaluationAdapter.render(foreign.main);
check("095 production host navigation stays hidden", foreign.nav.hidden === true);
check("096 production host shows unavailable boundary", foreign.main.innerHTML.includes("restricted to deploy previews") && foreign.main.innerHTML.includes("cannot submit evaluations"));
check("097 production host performs no request", foreignCalls.length === 0);

function SAFE_TEST(value) {
  return /^[A-Za-z0-9._-]{8,100}$/.test(String(value || ""));
}

const failures = results.filter(result => !result.passed);
console.log("SaaSStagingEvaluationSubmitValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
