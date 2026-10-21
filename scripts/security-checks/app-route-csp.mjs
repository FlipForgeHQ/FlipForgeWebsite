// Authenticated app shells and sign-in pages must carry an enforcing Content-Security-Policy.
//
// Runs after the HTML build steps. It checks that netlify.toml gives every app and sign-in route a policy with the
// required directives, that every inline <script> in the built HTML those routes serve is allowed by hash (so a
// changed bootstrap cannot silently break the app or force 'unsafe-inline'), that no inline event-handler attribute
// or javascript: URL is reintroduced in app markup, and that the function-rendered Bulk Evaluate page sends its own
// policy.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

function headerRules(toml) {
  const rules = [];
  for (const chunk of toml.split(/^\[\[headers\]\]\s*$/m).slice(1)) {
    const path = chunk.match(/^\s*for\s*=\s*"([^"]+)"/m)?.[1];
    const csp = chunk.match(/^\s*Content-Security-Policy\s*=\s*"([^"]+)"/m)?.[1] || "";
    if (path) rules.push({ path, csp });
  }
  return rules;
}

function directives(csp) {
  const map = new Map();
  for (const part of csp.split(";").map(value => value.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    map.set(name.toLowerCase(), values);
  }
  return map;
}

function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1] || ""))
    .map(match => `'sha256-${crypto.createHash("sha256").update(match[2], "utf8").digest("base64")}'`);
}

const toml = fs.readFileSync("netlify.toml", "utf8");
const rules = headerRules(toml);
const ROUTES = [
  { path: "/app/beta", html: ["saas-prototype/index.html"] },
  { path: "/app/beta/*", html: ["saas-prototype/index.html"] },
  { path: "/saas-prototype/*", html: ["saas-prototype/index.html", "saas-prototype/customer.html"] },
  { path: "/owner/customer", html: ["saas-prototype/customer.html"] },
  { path: "/owner/customer/", html: ["saas-prototype/customer.html"] },
  { path: "/owner/customer/*", html: ["saas-prototype/customer.html"] },
  { path: "/production-auth.html", html: ["production-auth.html"] },
  { path: "/staging-auth.html", html: ["staging-auth.html"] },
];

for (const route of ROUTES) {
  const rule = rules.find(item => item.path === route.path && item.csp);
  check(Boolean(rule), `${route.path} has a Content-Security-Policy header rule`);
  if (!rule) continue;
  const policy = directives(rule.csp);
  const script = policy.get("script-src") || [];
  check(policy.get("default-src")?.join(" ") === "'self'", `${route.path}: default-src 'self'`);
  check(policy.get("object-src")?.join(" ") === "'none'", `${route.path}: object-src 'none'`);
  check(policy.get("base-uri")?.join(" ") === "'self'", `${route.path}: base-uri 'self'`);
  check(policy.get("frame-ancestors")?.join(" ") === "'none'", `${route.path}: frame-ancestors 'none'`);
  check(policy.get("form-action")?.join(" ") === "'self'", `${route.path}: form-action 'self'`);
  check(policy.get("connect-src")?.join(" ") === "'self'", `${route.path}: connect-src 'self'`);
  check(script[0] === "'self'" && script.slice(1).every(value => /^'sha256-[A-Za-z0-9+/=]+'$/.test(value)),
    `${route.path}: script-src allows only this origin and hashed inline scripts (no unsafe-inline, unsafe-eval or hosts)`);
  for (const file of route.html) {
    const html = fs.readFileSync(file, "utf8");
    for (const hash of inlineScriptHashes(html)) {
      check(script.includes(hash), `${route.path}: inline script in ${file} is allowed by ${hash}`);
    }
    check(!/\son[a-z]+\s*=\s*["']/i.test(html), `${route.path}: ${file} has no inline event-handler attributes`);
  }
}

// App and sign-in scripts build markup at runtime; inline handlers and javascript: URLs would be blocked (or would
// need 'unsafe-inline'), so none may be added.
const runtimeSources = [
  ...fs.readdirSync("saas-prototype").filter(name => name.endsWith(".js")).map(name => `saas-prototype/${name}`),
  "scripts/lib/flipforge-identity-client.mjs",
  "scripts/lib/flipforge-production-auth-probe.mjs",
  "scripts/lib/flipforge-production-signin.mjs",
  "scripts/lib/flipforge-staging-auth-probe.mjs",
  "assets/js/beta-invite-terms-gate.js",
];
for (const file of runtimeSources) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  check(!/<[a-z][^<>]*\son(?:click|load|error|submit|change|input|focus|blur|mouse\w+|key\w+)\s*=\s*\\?["']/i.test(source),
    `${file} adds no inline event-handler attributes`);
  check(!/href\s*=\s*\\?["']\s*javascript:/i.test(source), `${file} adds no javascript: links`);
}

// Function-rendered Bulk Evaluate page.
const { handler: bulkEvaluate } = require("../../netlify/modern-functions/bulk-evaluate.js");
const page = await bulkEvaluate({ httpMethod: "GET" });
const pagePolicy = directives(String(page.headers?.["Content-Security-Policy"] || ""));
const pageScript = pagePolicy.get("script-src") || [];
check(pagePolicy.get("frame-ancestors")?.join(" ") === "'none'" && page.headers?.["X-Frame-Options"] === "DENY",
  "Bulk Evaluate page cannot be framed");
check(pagePolicy.get("object-src")?.join(" ") === "'none'" && pagePolicy.get("connect-src")?.join(" ") === "'self'",
  "Bulk Evaluate page policy blocks plugins and foreign API calls");
check(inlineScriptHashes(page.body).length > 0 && inlineScriptHashes(page.body).every(hash => pageScript.includes(hash))
  && !pageScript.includes("'unsafe-inline'"), "Bulk Evaluate inline script is allowed by hash only");

console.log("AppRouteCspValidation");
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
