import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

// Both browser paths that POST /api/v1/evaluations must accept the eBay Browse item IDs the server accepts:
// Discover (first evaluation) and the Evaluate form (manual entry and re-evaluation prefilled from a saved decision).
const adapters = [
  ["Discover", "saas-prototype/customer-discovery.js", 200],
  ["Evaluate form", "saas-prototype/staging-evaluation.js", 180]
];

for (const [label, file, maxLength] of adapters) {
  const adapter = fs.readFileSync(path.join(root, file), "utf8");
  const match = adapter.match(/const SAFE_EXTERNAL_ID = \/(.+)\/;/);
  check(`${label}: SAFE_EXTERNAL_ID is present`, Boolean(match));
  if (match) {
    const safeExternalId = new RegExp(match[1]);
    check(`${label}: official eBay Browse REST item ID is accepted`, safeExternalId.test("v1|257660255939|0"));
    check(`${label}: eBay Browse variation item ID is accepted`, safeExternalId.test("v1|123456789012|987654321"));
    check(`${label}: legacy safe listing ID remains accepted`, safeExternalId.test("EBAY:listing_123.abc-def"));
    check(`${label}: ${maxLength}-character bounded ID is accepted`, safeExternalId.test(`A${"b".repeat(maxLength - 1)}`));
    check(`${label}: ${maxLength + 1}-character ID is rejected`, !safeExternalId.test(`A${"b".repeat(maxLength)}`));
    check(`${label}: leading pipe is rejected`, !safeExternalId.test("|v1|257660255939|0"));
    check(`${label}: whitespace is rejected`, !safeExternalId.test("v1|257660255939|0 bad"));
    check(`${label}: URL/path characters are rejected`, !safeExternalId.test("v1|257660255939|0/extra"));
  }
  check(
    `${label}: still validates the external listing ID before POST`,
    adapter.includes("SAFE_EXTERNAL_ID.test(externalListingId)")
      && adapter.includes('EVALUATION_PATH = "/api/v1/evaluations"')
  );
}

// Staging QA (Nov 4, 2026): re-evaluating a decision saved from Discover failed in the browser, because the form
// pre-derived MARKETPLACE-id and refused the pipe. The server owns the saved ID (MARKETPLACE-ext-<sha256> for such IDs).
const form = fs.readFileSync(path.join(root, "saas-prototype/staging-evaluation.js"), "utf8");
check(
  "Evaluate form does not pre-derive the saved opportunity ID from the listing ID",
  !/const opportunityId = `\$\{marketplace\}-\$\{externalListingId\}`/.test(form)
);

const failures = results.filter(result => !result.passed);
console.log("eBay Browse evaluation ID regression validation (Discover and Evaluate form)");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
