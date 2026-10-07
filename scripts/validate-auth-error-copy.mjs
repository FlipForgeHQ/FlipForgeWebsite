// Customers never see Identity protocol codes (invalid_grant, JSON, HTTP status) at sign-in.
import fs from "node:fs";
import { friendlyAuthError as f } from "./lib/flipforge-auth-error-copy.mjs";

const E = (message, status) => Object.assign(new Error(message), status ? { status } : {});
const mismatch = /don't match/;
const checks = [
  ["001 invalid_grant with description → plain mismatch copy", mismatch.test(f(E("invalid_grant: No user found with that email, or password invalid.", 400)))],
  ["002 bare 'No user found' → plain mismatch copy", mismatch.test(f(E("No user found with that email, or password invalid.")))],
  ["003 'Login failed (400)' → plain mismatch copy", mismatch.test(f(E("Login failed (400)", 400)))],
  ["004 copy never reveals whether the account exists", !/no user|not found|doesn't exist/i.test(f(E("No user found with that email")))],
  ["005 unconfirmed email → activation copy", /activat/i.test(f(E("Email not confirmed", 401)))],
  ["006 expired/invalid token → new-invitation copy", /new invitation/i.test(f(E("Invalid token")))],
  ["007 network/timeout → connection copy", /connection/i.test(f(E("Failed to fetch"))) && /connection/i.test(f(E("Identity request to /token timed out after 8000ms")))],
  ["008 rate limit → wait copy", /wait/i.test(f(E("Rate limit exceeded", 429)))],
  ["009 our own plain messages pass through unchanged", f(E("Private Beta access is not enabled for this account.")) === "Private Beta access is not enabled for this account."],
  ["010 raw protocol strings never pass through", ![f(E("unauthorized_client")), f(E('{"error":"x"}')), f(E(""))].some(t => /_|[{}]/.test(t))],
  ["011b invalid/expired callback token (recovery or confirmation link) → expired-link copy", /expired or was already used/.test(f(E("Invalid token"), "Identity initialization failed.")) && /expired or was already used/.test(f(E("Token expired"), "Identity initialization failed."))],
  ["011 password-rule errors (422) are not mislabelled as a wrong password", !mismatch.test(f(E("Password should be at least 8 characters", 422)))]
];
for (const [file, count] of [["scripts/lib/flipforge-production-signin.mjs", 2], ["scripts/lib/flipforge-identity-client.mjs", 4], ["scripts/lib/flipforge-production-auth-probe.mjs", 3]]) {
  const src = fs.readFileSync(file, "utf8");
  checks.push([`012 ${file} routes ${count} auth error path(s) through friendlyAuthError`, (src.match(/friendlyAuthError\(error,/g) || []).length === count && !/state\.error = error instanceof Error \? error\.message : "(?:Sign in failed|Identity initialization failed)\."/.test(src)]);
}
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} | ${name}`); if (!ok) failed++; }
console.log(`\nAuth error copy validation: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
