import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = fs.readFileSync(path.join(root, "saas-prototype/identity-assist-verification-v1.js"), "utf8");
const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };

function envelope(data) {
  return { meta: { contractVersion: "1.0", authority: "Smart Opportunity", gradingAuthority: "Existing PSA intelligence" }, data };
}

function runtime(resolveData) {
  const calls = [];
  const nativeFetch = async (input, init = {}) => {
    const url = new URL(String(input), "https://goflipforge.com");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ path: url.pathname, body });
    if (url.pathname === "/api/v1/card-intelligence/search") {
      return new Response(JSON.stringify(envelope({ results: [] })), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/api/v1/card-intelligence/resolve") {
      return new Response(JSON.stringify(envelope(resolveData)), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected URL ${url.pathname}`);
  };

  const window = {
    location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/discover", origin: "https://goflipforge.com" },
    fetch: nativeFetch,
    crypto: { randomUUID: () => "grade-lock-test" },
    requestAnimationFrame: fn => { if (typeof fn === "function") fn(); },
    addEventListener() {}
  };
  const document = { querySelector: () => null, addEventListener() {} };
  class MutationObserver { observe() {} }
  const context = vm.createContext({ window, document, MutationObserver, Headers, Response, URL, JSON, String, Math, Date, RegExp, Error, console });
  vm.runInContext(source, context, { filename: "identity-assist-verification-v1.js" });
  return { window, calls };
}

const missingCanonicalGrade = runtime({
  readyForEvaluation: true,
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150",
  grader: "PSA",
  grade: "9",
  providerIdentifierExposed: false,
  rawProviderPayloadExposed: false,
  providerPayloadPersisted: false,
  soldEvidenceAccepted: false,
  smartOpportunityRecalculated: false,
  transactionAuthority: false
});
await missingCanonicalGrade.window.fetch("/api/v1/card-intelligence/search", {
  method: "POST",
  body: JSON.stringify({ query: "2018 Topps Chrome Shohei Ohtani PSA 9" })
});
const lockedResponse = await missingCanonicalGrade.window.fetch("/api/v1/card-intelligence/resolve", {
  method: "POST",
  body: JSON.stringify({ selectionToken: "a".repeat(64) })
});
const lockedPayload = await lockedResponse.json();
check("declared PSA 9 is restored to canonical resolved identity", lockedPayload.data.cardIdentity === "2018 Topps Chrome Shohei Ohtani #150 PSA 9");
check("matching server grade remains evaluation-ready", lockedPayload.data.readyForEvaluation === true);

const mismatch = runtime({
  readyForEvaluation: true,
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 SGC 10",
  grader: "SGC",
  grade: "10",
  providerIdentifierExposed: false,
  rawProviderPayloadExposed: false,
  providerPayloadPersisted: false,
  soldEvidenceAccepted: false,
  smartOpportunityRecalculated: false,
  transactionAuthority: false
});
await mismatch.window.fetch("/api/v1/card-intelligence/search", {
  method: "POST",
  body: JSON.stringify({ query: "2018 Topps Chrome Shohei Ohtani PSA 9" })
});
const mismatchResponse = await mismatch.window.fetch("/api/v1/card-intelligence/resolve", {
  method: "POST",
  body: JSON.stringify({ selectionToken: "b".repeat(64) })
});
const mismatchPayload = await mismatchResponse.json();
check("conflicting resolved grade fails closed", mismatchPayload.data.readyForEvaluation === false);
check("conflicting resolved grade explains why search stopped", /stopped before marketplace search/i.test(mismatchPayload.data.message || ""));

const ungraded = runtime({
  readyForEvaluation: true,
  cardIdentity: "2018 Topps Chrome Shohei Ohtani #150",
  grader: "",
  grade: "",
  providerIdentifierExposed: false,
  rawProviderPayloadExposed: false,
  providerPayloadPersisted: false,
  soldEvidenceAccepted: false,
  smartOpportunityRecalculated: false,
  transactionAuthority: false
});
await ungraded.window.fetch("/api/v1/card-intelligence/search", {
  method: "POST",
  body: JSON.stringify({ query: "2018 Topps Chrome Shohei Ohtani" })
});
const ungradedResponse = await ungraded.window.fetch("/api/v1/card-intelligence/resolve", {
  method: "POST",
  body: JSON.stringify({ selectionToken: "c".repeat(64) })
});
const ungradedPayload = await ungradedResponse.json();
check("ungraded identity searches are not given an invented grade", ungradedPayload.data.cardIdentity === "2018 Topps Chrome Shohei Ohtani #150");

check("grade lock adds no browser persistence", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(source));
check("grade lock changes no recommendation authority", !/\b(?:BUY|WATCH|PASS)\b/.test(source));

console.log("Discover grade-context lock validation");
console.log(`PASSED: ${7 - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
