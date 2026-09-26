import fs from "node:fs";

const source = fs.readFileSync(new URL("../saas-prototype/customer-psa-advisor.js", import.meta.url), "utf8");

const checks = [
  ["A12A panel is present", source.includes("A12A · Grading Economics")],
  ["RAW governed lane is rendered", source.includes("RAW supported value") && source.includes("raw.supportedValueCents")],
  ["PSA 9 governed lane is rendered", source.includes("PSA 9 supported value") && source.includes("psa9.supportedValueCents")],
  ["PSA 10 governed lane is rendered", source.includes("PSA 10 supported value") && source.includes("psa10.supportedValueCents")],
  ["net scenario economics are server supplied", source.includes("analysis.psa9?.incrementalNetVsRawCents") && source.includes("analysis.psa10?.incrementalNetVsRawCents")],
  ["grade probabilities are rejected", source.includes("gradeProbabilitiesConsumed !== false")],
  ["grade prediction authority is rejected", source.includes("gradePredictionPerformed !== false")],
  ["recommendation authority is rejected", source.includes("recommendationAuthorityChanged !== false")],
  ["transaction authority is rejected", source.includes("transactionAuthority !== false")],
  ["browser does not create recommendation", source.includes("does not calculate grade probabilities in the browser")],
  ["scenario copy distinguishes values from odds", source.includes("These are separate grade scenarios, not grade odds")]
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS: ${label}`);
  else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

if (failed) {
  console.error(`A12A customer validation failed: ${failed} check(s).`);
  process.exit(1);
}
console.log(`A12A customer validation passed: ${checks.length} checks.`);
