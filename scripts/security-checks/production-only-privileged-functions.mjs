// Privileged functions must answer only on the production custom domain.
//
// Deploy previews share the production Netlify Identity instance and receive an Identity admin token, so any
// function that uses that token, changes roles or account metadata, or exports applicant/subscriber data must be
// wrapped in productionOnly(). This validator runs the real default exports with preview, branch and production
// requests, and statically checks that every privileged function module is wrapped.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  LOCAL_OVERRIDE_ENV,
  LOCAL_OVERRIDE_VALUE,
  privilegedFunctionAllowed,
} from "../../netlify/modern-functions/lib/production-deploy-guard.mjs";

const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const functionDir = "netlify/modern-functions";

const PRIVILEGED = [
  ["beta-operator.mjs", "/api/beta/operator"],
  ["beta-founder-select.mjs", "/api/beta/founder-select"],
  ["updates-subscribers.mjs", "/api/updates/subscribers"],
  ["beta-terms-acceptance.mjs", "/api/beta/terms-acceptance"],
];

// Static: any function that can use the Identity admin token, write Identity users, or export the email list must
// be wrapped.
const privilegedPattern = /\badmin\b[^;]*from "@netlify\/identity"|identityAdmin|\.updateUser\(|\.deleteUser\(|identity\.token|"Content-Type": "text\/csv/;
for (const name of fs.readdirSync(functionDir).filter(file => /\.(?:mjs|js)$/.test(file)).sort()) {
  const source = fs.readFileSync(path.join(functionDir, name), "utf8");
  if (!privilegedPattern.test(source)) continue;
  check(/export default productionOnly\(/.test(source), `${name} is privileged and its default export is wrapped in productionOnly()`);
}
for (const [name] of PRIVILEGED) {
  const source = fs.readFileSync(path.join(functionDir, name), "utf8");
  check(/export default productionOnly\(/.test(source), `${name} default export is production-only`);
}
const toml = fs.readFileSync("netlify.toml", "utf8");
check(!toml.includes(LOCAL_OVERRIDE_ENV), "netlify.toml never sets the local validator override");

// Unit: the guard decision.
const req = host => new Request(`https://${host}/api/beta/operator`);
const ctx = value => ({ deploy: { context: value } });
const cases = [
  ["preview host, deploy-preview context", req("deploy-preview-12--goflipforge.netlify.app"), ctx("deploy-preview"), {}, false],
  ["branch deploy host, branch-deploy context", req("main--goflipforge.netlify.app"), ctx("branch-deploy"), {}, false],
  ["deploy permalink host, production context", req("0123456789abcdef01234567--goflipforge.netlify.app"), ctx("production"), {}, false],
  ["production host, non-production context", req("goflipforge.com"), ctx("deploy-preview"), {}, false],
  ["production host, production context", req("goflipforge.com"), ctx("production"), {}, true],
  ["www production host, production context", req("www.goflipforge.com"), ctx("production"), {}, true],
  ["production host, no runtime context", req("goflipforge.com"), undefined, {}, true],
  ["look-alike host", req("goflipforge.com.evil.example"), ctx("production"), {}, false],
  ["override ignored inside a Netlify deploy", req("deploy-preview-12--goflipforge.netlify.app"), ctx("deploy-preview"), { [LOCAL_OVERRIDE_ENV]: LOCAL_OVERRIDE_VALUE }, false],
  ["override with the wrong value", req("localhost"), undefined, { [LOCAL_OVERRIDE_ENV]: "true" }, false],
  ["local validator override", req("localhost"), undefined, { [LOCAL_OVERRIDE_ENV]: LOCAL_OVERRIDE_VALUE }, true],
];
const savedNetlify = globalThis.Netlify;
for (const [label, request, context, env, expected] of cases) {
  delete globalThis.Netlify;
  check(privilegedFunctionAllowed(request, context, env) === expected, `guard: ${label} -> ${expected ? "allowed" : "404"}`);
}
globalThis.Netlify = { context: { deploy: { context: "deploy-preview" } } };
check(privilegedFunctionAllowed(req("goflipforge.com"), undefined, {}) === false, "guard: global Netlify deploy context is honoured");
if (savedNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = savedNetlify;

// Behaviour: the real default exports. Non-production requests stop at 404 before any authentication or storage;
// a production request reaches the function's own authentication (401 without a session).
delete process.env[LOCAL_OVERRIDE_ENV];
for (const [name, route] of PRIVILEGED) {
  const { default: fn } = await import(pathToFileURL(path.resolve(functionDir, name)).href);
  for (const [host, context, expected] of [
    ["deploy-preview-12--goflipforge.netlify.app", ctx("deploy-preview"), 404],
    ["main--goflipforge.netlify.app", ctx("branch-deploy"), 404],
    ["goflipforge.com", ctx("production"), 401],
  ]) {
    const method = name === "updates-subscribers.mjs" ? "GET" : "POST";
    const request = new Request(`https://${host}${route}`, {
      method,
      headers: { origin: `https://${host}`, "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    let status;
    try {
      status = (await fn(request, context)).status;
    } catch (error) {
      status = `threw ${error.message}`;
    }
    check(status === expected, `${name} on ${host} -> ${expected} (got ${status})`);
  }
}

console.log("ProductionOnlyPrivilegedFunctionsValidation");
for (const pass of passes) console.log(`PASS | ${pass}`);
for (const failure of failures) console.error(`FAIL | ${failure}`);
console.log(`PASSED: ${passes.length}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length) process.exitCode = 1;
