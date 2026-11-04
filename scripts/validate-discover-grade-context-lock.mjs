import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
// The grade filter lock is part of the Discover owner (customer-discovery.js gradeLockedResolution) since Nov 3 2026;
// it is applied to every identity resolve the owner makes ("Use exact match" and "Select & verify").
const discovery = fs.readFileSync(path.join(root, "saas-prototype/customer-discovery.js"), "utf8");
const source = discovery.slice(discovery.indexOf("function gradeLockedResolution("), discovery.indexOf("async function verifyReviewMatch("));
const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };
const window = { location: { hostname: "goflipforge.com", pathname: "/app/", hash: "#/discover" } };
vm.runInNewContext(discovery, { window, Date, Intl, BigInt }, { filename: "customer-discovery.js" });
const lock = window.FlipForgeCustomerDiscovery.gradeLockedResolution;
const boundary = { providerIdentifierExposed: false, rawProviderPayloadExposed: false, providerPayloadPersisted: false, soldEvidenceAccepted: false, smartOpportunityRecalculated: false, transactionAuthority: false };

const lockedPayload = { data: lock({ readyForEvaluation: true, cardIdentity: "2018 Topps Chrome Shohei Ohtani #150", grader: "PSA", grade: "9", ...boundary }, "2018 Topps Chrome Shohei Ohtani PSA 9") };
check("declared PSA 9 is restored to canonical resolved identity", lockedPayload.data.cardIdentity === "2018 Topps Chrome Shohei Ohtani #150 PSA 9");
check("matching server grade remains evaluation-ready", lockedPayload.data.readyForEvaluation === true);

const mismatchPayload = { data: lock({ readyForEvaluation: true, cardIdentity: "2018 Topps Chrome Shohei Ohtani #150 SGC 10", grader: "SGC", grade: "10", ...boundary }, "2018 Topps Chrome Shohei Ohtani PSA 9") };
check("conflicting resolved grade fails closed", mismatchPayload.data.readyForEvaluation === false);
check("conflicting resolved grade explains why search stopped", /stopped before marketplace search/i.test(mismatchPayload.data.message || ""));

const ungradedPayload = { data: lock({ readyForEvaluation: true, cardIdentity: "2018 Topps Chrome Shohei Ohtani #150", grader: "", grade: "", ...boundary }, "2018 Topps Chrome Shohei Ohtani") };
check("ungraded identity searches are not given an invented grade", ungradedPayload.data.cardIdentity === "2018 Topps Chrome Shohei Ohtani #150");
check("the lock is applied to both identity resolves", discovery.includes("gradeLockedResolution(await cardIntelligenceRequest(CARD_INTELLIGENCE_RESOLVE_PATH, { selectionToken: token }), ownedQuery)") && discovery.includes("gradeLockedResolution(await cardIntelligenceRequest(CARD_INTELLIGENCE_RESOLVE_PATH, { query: originalQuery, candidateName, candidateDetail }), originalQuery)"));

check("grade lock adds no browser persistence", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(source));
check("grade lock changes no recommendation authority", !/\b(?:BUY|WATCH|PASS)\b/.test(source));

console.log("Discover grade-context lock validation");
console.log(`PASSED: ${8 - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
if (failures.length) process.exitCode = 1;
