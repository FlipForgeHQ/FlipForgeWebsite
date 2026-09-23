import fs from "node:fs";
import path from "node:path";

const redirects = fs.readFileSync("_redirects", "utf8");
const netlifyConfig = fs.readFileSync("netlify.toml", "utf8");
const ebayPrivacy = fs.readFileSync("netlify/modern-functions/ebay-privacy.js", "utf8");
const functionDir = "netlify/modern-functions";

const activeRules = redirects
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

const expectedRules = [
  "/app /app/customer/ 301",
  "/app/customer /saas-prototype/customer.html 200",
  "/app/customer/ /saas-prototype/customer.html 200",
  "/app/customer/* /saas-prototype/:splat 200",
  "/app/* /app/customer/:splat 301"
];

const functionFiles = fs.readdirSync(functionDir)
  .filter(name => /\.(?:js|mjs)$/.test(name))
  .sort();
const rateLimitedFunctions = functionFiles.filter(name => {
  const source = fs.readFileSync(path.join(functionDir, name), "utf8");
  return /\brateLimit\s*:/.test(source);
});
const expectedRateLimitedFunctions = ["beta-applications.mjs", "conversion-event.mjs"];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(activeRules.length === expectedRules.length,
  `expected exactly ${expectedRules.length} active Netlify redirect rules, found ${activeRules.length}`);
expectedRules.forEach((rule, index) => {
  check(activeRules[index] === rule, `redirect rule ${index + 1} is missing or out of order: ${rule}`);
});
check(!activeRules.some(rule => rule.includes("/api/ebay/privacy")), "eBay privacy must not consume a redirect rule");
check(!activeRules.some(rule => rule.startsWith("/app/ ")), "redundant exact /app/ rule must remain unnecessary");
check(!activeRules.some(rule => rule.includes("/saas-prototype/index.html")), "public app entry must never resolve to the legacy beta shell");
check(!activeRules.some(rule => rule.startsWith("/app/customer//")), "customer app route must not contain duplicate slash rules");
check(netlifyConfig.includes('package = "@netlify/plugin-lighthouse"'),
  "Lighthouse plugin must be configured in netlify.toml so file-based settings override the UI default");
check(netlifyConfig.includes('fail_deploy_on_score_thresholds = "true"'),
  "Lighthouse must run before publish against the built static output to avoid live-deploy probe races");
check(!activeRules.some(rule => /\/app\/customer\/?\s+\/app\/customer\/?\s+30[1278]/.test(rule)),
  "customer app must not use a canonical redirect that can loop with host path normalization");
check(activeRules.indexOf("/app/customer/* /saas-prototype/:splat 200") < activeRules.indexOf("/app/* /app/customer/:splat 301"),
  "customer app wildcard must precede the generic app canonical redirect");
check(ebayPrivacy.includes('path: "/api/ebay/privacy"'), "eBay privacy function must own /api/ebay/privacy through native function routing");
check(ebayPrivacy.includes("export default async function ebayPrivacy"), "eBay privacy must use the modern Netlify function request/response contract");

check(rateLimitedFunctions.length <= 2,
  `Netlify account tier permits at most 2 code-based rate-limit rules, found ${rateLimitedFunctions.length}: ${rateLimitedFunctions.join(", ")}`);
check(JSON.stringify(rateLimitedFunctions) === JSON.stringify(expectedRateLimitedFunctions),
  `platform rate-limit rules must be reserved for public intake endpoints: expected ${expectedRateLimitedFunctions.join(", ")}, found ${rateLimitedFunctions.join(", ")}`);

console.log("NetlifyRuleBudgetValidation");
console.log(`ACTIVE_REDIRECT_RULES: ${activeRules.length}`);
for (const rule of activeRules) console.log(`RULE: ${rule}`);
console.log(`CODE_RATE_LIMIT_RULES: ${rateLimitedFunctions.length}`);
for (const name of rateLimitedFunctions) console.log(`RATE_LIMIT: ${name}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);

if (failures.length) process.exitCode = 1;
