import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "saas-prototype/customer-opportunities.js"), "utf8");
const index = fs.readFileSync(path.join(root, "saas-prototype/index.html"), "utf8");
const evaluationCss = fs.readFileSync(path.join(root, "saas-prototype/staging-evaluation.css"), "utf8");

const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 production Card Intelligence validates optional value intelligence", source.includes("function validValueIntelligence(value)"));
check("002 recommendation authority must remain false", source.includes("value.recommendationAuthority === false"));
check("003 price adjustment authority must remain false", source.includes("value.priceAdjustmentApplied === false"));
check("004 analog value basis is explicit", source.includes('value.basis !== "ANALOG_REFERENCE_RANGE"'));
check("005 saved context is labeled context only", source.includes("Context only"));
check("006 analog range is explicitly not supported value", source.includes("Not a supported value"));
check("007 exact evidence remains required", source.includes("Exact trusted evidence is still required"));
check("008 Smart Opportunity recommendation remains unchanged", source.includes("does not change the Smart Opportunity recommendation"));
check("009 browser does not derive analog endpoints", !/reference(?:Low|Midpoint|High)Cents\s*=/.test(source));
check("010 list view remains based on saved supported value only", source.includes("supportedValueText(item)") && !source.includes("valueIntelligencePanel(item) ?"));
check("011 production detail rejects invalid value authority", source.includes("VALUE_INTELLIGENCE_CONTRACT_INVALID"));
check("012 shared contextual panel stylesheet is loaded", index.includes('href="staging-evaluation.css"') && evaluationCss.includes(".staging-value-intelligence"));

function makeMain() {
  return {
    innerHTML: "",
    querySelectorAll() { return []; }
  };
}

function envelope(correlationId, data) {
  return {
    meta: {
      contractVersion: "1.0",
      engineVersion: "test+v14.06+v16.10",
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      generatedAt: "2026-08-17T18:00:00Z",
      correlationId,
      evidenceFreshness: "MIXED_DISPLAY_ONLY",
      limitations: []
    },
    data
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const analogValue = {
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

function createRuntime(valueIntelligence = analogValue) {
  const calls = [];
  let counter = 0;
  const window = {
    location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/opportunities/opp-analog" },
    crypto: { randomUUID: () => `card-context-${++counter}` }
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const correlationId = options.headers["X-Correlation-Id"];
    if (url === "/api/v1/health") return response({
      meta: { contractVersion: "1.0", correlationId },
      data: { status: "configured", bridgeEnabled: true, upstreamConfigured: true, authenticationRequired: true, tenantMembershipRequired: true }
    });
    if (url === "/api/v1/dashboard") return response(envelope(correlationId, {
      kind: "dashboard",
      metrics: { trackedOpportunities: 1, evidenceReady: 0, populationContextAvailable: 0, needsVerification: 1 },
      opportunities: []
    }));
    if (url === "/api/v1/opportunities") return response(envelope(correlationId, {
      kind: "opportunities",
      items: [{
        id: "opp-analog",
        title: "Saved Analog Card",
        cardIdentity: "2024 Example Product Test Player #1 Parallel PSA 10",
        recommendation: "VERIFY",
        ask: 500,
        supportedValue: 0,
        confidence: 25,
        evidence: { acceptedSales: 0 },
        mappingState: "CONFIRMED"
      }]
    }));
    if (url === "/api/v1/opportunities/opp-analog") return response(envelope(correlationId, {
      kind: "opportunity-detail",
      readOnly: true,
      valueIntelligenceReadOnly: true,
      valueIntelligenceConsumesEvaluationQuota: false,
      opportunity: {
        id: "opp-analog",
        title: "Saved Analog Card",
        cardIdentity: "2024 Example Product Test Player #1 Parallel PSA 10",
        platform: "EBAY",
        recommendation: "VERIFY",
        workflowStatus: "NEEDS_VALUE_EVIDENCE",
        ask: 500,
        supportedValue: 0,
        confidence: 25,
        liquidity: 35,
        risk: 90,
        rank: 14,
        evidenceCount: 0,
        observedAt: "2026-08-17T18:00:00Z",
        mappingState: "CONFIRMED",
        contextStatus: "PARTIAL_CONTEXT",
        statusMessage: "Exact sold evidence is still required.",
        evidence: { acceptedSales: 0, averagePrice: 0, latestSaleDate: null },
        authorityBoundary: "Smart Opportunity remains authoritative.",
        valueIntelligence
      }
    }));
    if (url === "/api/v1/evidence/opp-analog") return response(envelope(correlationId, {
      kind: "evidence",
      opportunityId: "opp-analog",
      acceptedExactCompletedSales: 0,
      visibleButAuthorityIneligible: 0,
      linkedEvidence: []
    }));
    if (url === "/api/v1/psa-advisor/opp-analog") return response(envelope(correlationId, {
      kind: "psa-advisor",
      opportunityId: "opp-analog",
      guidanceStatus: "INSUFFICIENT_SAVED_CONTEXT",
      savedPsaSnapshot: null,
      populationContext: { psa10Population: 0, psa9Population: 0 },
      recalculated: false
    }));
    throw new Error(`Unexpected URL ${url}`);
  };

  const context = vm.createContext({
    window,
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
    RegExp,
    Promise,
    Set,
    console,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent
  });
  vm.runInContext(source, context, { filename: "customer-opportunities.js" });
  return { window, calls };
}

const runtime = createRuntime();
const main = makeMain();
check("013 production app route is eligible", runtime.window.FlipForgeCustomerOpportunities.isEligible() === true);
check("014 production detail render starts", runtime.window.FlipForgeCustomerOpportunities.render(main, "opp-analog") === true);
await new Promise(resolve => setTimeout(resolve, 60));

check("015 saved detail performs existing six read requests only", runtime.calls.length === 6 && runtime.calls.every(call => call.options.method === "GET"));
check("016 saved VERIFY recommendation remains visible", main.innerHTML.includes(">VERIFY<"));
check("017 exact supported value remains unavailable", main.innerHTML.includes("Supported value") && main.innerHTML.includes("Unavailable"));
check("018 observed analog range survives saved navigation", main.innerHTML.includes("Observed analog reference range") && main.innerHTML.includes("$420 – $610"));
check("019 server midpoint and analog count render", main.innerHTML.includes("$500") && main.innerHTML.includes("Analog completed sales") && main.innerHTML.includes(">3<"));
check("020 authority warning remains visible", main.innerHTML.includes("Context only") && main.innerHTML.includes("Not a supported value"));
check("021 no invented exact evidence appears", main.innerHTML.includes("No accepted exact completed sales") && !main.innerHTML.includes("value-positive"));

const unsafeRuntime = createRuntime({ ...analogValue, recommendationAuthority: true });
const unsafeMain = makeMain();
unsafeRuntime.window.FlipForgeCustomerOpportunities.render(unsafeMain, "opp-analog");
await new Promise(resolve => setTimeout(resolve, 60));
check("022 unsafe contextual authority fails closed", unsafeMain.innerHTML.includes("VALUE_INTELLIGENCE_CONTRACT_INVALID"));
check("023 rejected contextual range is not rendered", !unsafeMain.innerHTML.includes("$420 – $610"));
check("024 no extra request is made to recover or recalculate unsafe context", unsafeRuntime.calls.length === 6);

const failures = results.filter(result => !result.passed);
console.log("SaaSCardIntelligenceValueContextValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
