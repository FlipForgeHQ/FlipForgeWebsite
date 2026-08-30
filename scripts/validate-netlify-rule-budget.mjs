import fs from "node:fs";

const redirects = fs.readFileSync("_redirects", "utf8");
const ebayPrivacy = fs.readFileSync("netlify/modern-functions/ebay-privacy.js", "utf8");

const activeRules = redirects
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

const expectedRules = [
  "/app /saas-prototype/index.html 200",
  "/app/* /saas-prototype/:splat 200"
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(activeRules.length === 2, `expected exactly 2 active Netlify redirect rules, found ${activeRules.length}`);
check(activeRules[0] === expectedRules[0], "canonical /app rewrite is missing or out of order");
check(activeRules[1] === expectedRules[1], "wildcard /app/* rewrite is missing or out of order");
check(!activeRules.some(rule => rule.includes("/api/ebay/privacy")), "eBay privacy must not consume a redirect rule");
check(!activeRules.some(rule => rule.startsWith("/app/ ")), "redundant /app/ rewrite must remain removed");
check(ebayPrivacy.includes('path: "/api/ebay/privacy"'), "eBay privacy function must own /api/ebay/privacy through native function routing");
check(ebayPrivacy.includes("export default async function ebayPrivacy"), "eBay privacy must use the modern Netlify function request/response contract");

console.log("NetlifyRuleBudgetValidation");
console.log(`ACTIVE_REDIRECT_RULES: ${activeRules.length}`);
for (const rule of activeRules) console.log(`RULE: ${rule}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);

if (failures.length) process.exitCode = 1;
