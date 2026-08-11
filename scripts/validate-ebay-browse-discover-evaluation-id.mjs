import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const adapter = fs.readFileSync(path.join(root, "saas-prototype/customer-discovery.js"), "utf8");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

const match = adapter.match(/const SAFE_EXTERNAL_ID = \/(.+)\/;/);
check("SAFE_EXTERNAL_ID is present", Boolean(match));

if (match) {
  const safeExternalId = new RegExp(match[1]);
  check("official eBay Browse REST item ID is accepted", safeExternalId.test("v1|257660255939|0"));
  check("eBay Browse variation item ID is accepted", safeExternalId.test("v1|123456789012|987654321"));
  check("legacy safe listing ID remains accepted", safeExternalId.test("EBAY:listing_123.abc-def"));
  check("200-character bounded ID is accepted", safeExternalId.test(`A${"b".repeat(199)}`));
  check("201-character ID is rejected", !safeExternalId.test(`A${"b".repeat(200)}`));
  check("leading pipe is rejected", !safeExternalId.test("|v1|257660255939|0"));
  check("whitespace is rejected", !safeExternalId.test("v1|257660255939|0 bad"));
  check("URL/path characters are rejected", !safeExternalId.test("v1|257660255939|0/extra"));
}

check(
  "Discover evaluation still validates the external listing ID before POST",
  adapter.includes("SAFE_EXTERNAL_ID.test(externalListingId)")
    && adapter.includes('EVALUATION_PATH = "/api/v1/evaluations"')
);

const failures = results.filter(result => !result.passed);
console.log("eBay Browse Discover evaluation ID regression validation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
