import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const adapterSource = fs.readFileSync(path.join(root, "saas-prototype/staging-evaluation.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "saas-prototype/staging-evaluation.css"), "utf8");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 adapter reads server valueIntelligence only", adapterSource.includes("data.valueIntelligence"));
check("002 analog basis is explicit", adapterSource.includes('value.basis !== "ANALOG_REFERENCE_RANGE"'));
check("003 analog range is labeled context only", adapterSource.includes("Context only"));
check("004 analog range is explicitly not supported value", adapterSource.includes("Not a supported value"));
check("005 exact evidence remains required", adapterSource.includes("Exact trusted evidence is still required"));
check("006 Smart Opportunity remains recommendation authority", adapterSource.includes("does not change the Smart Opportunity recommendation"));
check("007 response fails closed on recommendation authority", adapterSource.includes("valueIntelligence.recommendationAuthority === false"));
check("008 response fails closed on price adjustment authority", adapterSource.includes("valueIntelligence.priceAdjustmentApplied === false"));
check("009 browser does not calculate an analog estimate", !/referenceMidpointCents\s*=|referenceLowCents\s*=|referenceHighCents\s*=/.test(adapterSource));
check("010 browser preserves server supported value field", adapterSource.includes('moneyFromCents(decision.supportedValueCents)'));
check("011 value context has dedicated responsive styling", cssSource.includes(".staging-value-intelligence") && cssSource.includes(".staging-value-intelligence-grid") && cssSource.includes("@media (max-width: 720px)"));

function makeForm() {
  return {
    handler: null,
    values: {
      externalListingId: "analog-123",
      marketplace: "EBAY",
      cardIdentity: "2024 Example Product #1 Parallel PSA 10",
      listingUrl: "https://example.invalid/itm/analog-123",
      seller: "validation-seller",
      itemPrice: "500.00",
      shipping: "0",
      buyerPremium: "0",
      tax: "0",
      listingFormat: "FIXED_PRICE",
      endsAt: "",
      acknowledgeBoundary: "yes"
    },
    addEventListener(type, handler) {
      if (type === "submit") this.handler = handler;
    },
    submit() {
      if (!this.handler) throw new Error("Submit handler was not bound.");
      this.handler({ preventDefault() {} });
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

function envelope(correlationId, requestId, valueIntelligence) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test+v14.06+v16.09",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-17T17:00:00Z",
      correlationId
    },
    data: {
      kind: "evaluation",
      requestId,
      opportunityId: "EBAY-analog-123",
      idempotentReplay: false,
      persistedToSqlite: true,
      tenantOwned: true,
      quotaEnforced: true,
      normalizedRequest: {
        externalListingId: "analog-123",
        marketplace: "EBAY",
        allInAskCents: 50000
      },
      decision: {
        recommendation: "VERIFY",
        workflowStatus: "NEEDS_VALUE_EVIDENCE",
        supportedValueCents: 0,
        exactTrustedCompCount: 0,
        confidence: 25,
        risk: 90,
        reason: "Exact trusted sold evidence is still missing.",
        missingRequirement: "Trusted exact sold evidence is required.",
        nextAction: "Verify identity and gather exact completed-sale evidence."
      },
      valueIntelligence,
      requestCanVerifyEvidence: false,
      requestCanVerifyIdentity: false,
      evidenceAcceptedByRequest: false,
      psaRecalculated: false,
      transactionAuthorized: false,
      providerCredentialsExposed: false,
      tenantIsolation: {
        enforced: true,
        idempotencyScope: "TENANT",
        opportunityOwnership: "GRANTED_ON_COMPLETION",
        defaultAccess: "DENY"
      }
    }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createRuntime(fetchImpl) {
  const form = makeForm();
  const main = {
    innerHTML: "",
    querySelector(selector) {
      return selector === "[data-staging-evaluation-form]" ? form : null;
    }
  };
  const nav = { hidden: true };
  let uuidCounter = 0;
  const window = {
    location: {
      hostname: "deploy-preview-42--goflipforge.netlify.app",
      pathname: "/saas-prototype/",
      hash: "#/staging-evaluate"
    },
    crypto: {
      randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`
    }
  };
  const document = {
    querySelector(selector) {
      return selector === "[data-route='staging-evaluate']" ? nav : null;
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
  vm.runInContext(adapterSource, context, { filename: "staging-evaluation.js" });
  return { window, form, main };
}

const analogContext = {
  basis: "ANALOG_REFERENCE_RANGE",
  directSupportedValueCents: 0,
  referenceLowCents: 42000,
  referenceMidpointCents: 50000,
  referenceHighCents: 61000,
  analogCompletedSaleCount: 3,
  confidenceBand: "LOW",
  recommendationAuthority: false,
  exactEvidenceRequired: true,
  priceAdjustmentApplied: false,
  explanation: "Observed governed same-card analog completed-sale context only.",
  version: "v14.06"
};

const runtime = createRuntime(async (_url, options) => jsonResponse(envelope(
  options.headers["X-Correlation-Id"],
  options.headers["Idempotency-Key"],
  analogContext
)));
runtime.window.FlipForgeStagingEvaluationAdapter.render(runtime.main);
runtime.form.submit();
await new Promise(resolve => setTimeout(resolve, 35));

check("012 analog response keeps VERIFY visible", runtime.main.innerHTML.includes(">VERIFY<"));
check("013 supported value remains zero", runtime.main.innerHTML.includes("Supported value") && runtime.main.innerHTML.includes("$0.00"));
check("014 observed server range is visible", runtime.main.innerHTML.includes("$420.00 – $610.00"));
check("015 server midpoint is visible", runtime.main.innerHTML.includes("$500.00"));
check("016 server analog count is visible", runtime.main.innerHTML.includes("Analog completed sales") && runtime.main.innerHTML.includes(">3<"));
check("017 context-only warning is visible", runtime.main.innerHTML.includes("Context only") && runtime.main.innerHTML.includes("Not a supported value"));

const unsafeRuntime = createRuntime(async (_url, options) => jsonResponse(envelope(
  options.headers["X-Correlation-Id"],
  options.headers["Idempotency-Key"],
  { ...analogContext, recommendationAuthority: true }
)));
unsafeRuntime.window.FlipForgeStagingEvaluationAdapter.render(unsafeRuntime.main);
unsafeRuntime.form.submit();
await new Promise(resolve => setTimeout(resolve, 35));

check("018 authority-claiming value payload is rejected", unsafeRuntime.main.innerHTML.includes("STAGING_EVALUATION_CONTRACT_INVALID"));
check("019 rejected payload renders no analog range", !unsafeRuntime.main.innerHTML.includes("$420.00 – $610.00"));

const failures = results.filter(result => !result.passed);
console.log("SaaSValueIntelligenceEvaluateUiValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
