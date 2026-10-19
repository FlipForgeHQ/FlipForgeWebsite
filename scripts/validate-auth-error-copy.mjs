// Customers never see Identity protocol codes (invalid_grant, JSON, HTTP status), and the
// "link expired or already used" explanation appears only for emailed-link flows (invitation,
// password reset, email confirmation), never for an ordinary sign-in failure.
import fs from "node:fs";
import { AUTH_FLOWS, friendlyAuthError as f } from "./lib/flipforge-auth-error-copy.mjs";

const E = (message, status) => Object.assign(new Error(message), status ? { status } : {});
const mismatch = /don't match/;
const linkCopy = /expired or was already used/;
const { SIGN_IN, INVITATION, PASSWORD_RESET, EMAIL_LINK } = AUTH_FLOWS;
// Messages Identity returns when an emailed link's token was already used or has expired.
const usedOrExpiredLink = [E("User not found", 404), E("Invalid token"), E("Token expired"), E("Token has expired or is invalid", 403)];
// Messages Identity returns for ordinary sign-in failures (wrong password, unknown account).
const signInFailures = [
  E("invalid_grant: No user found with that email, or password invalid.", 400),
  E("No user found with that email, or password invalid."),
  E("Login failed (400)", 400),
  E("User not found", 404)
];

const checks = [
  ["001 invalid_grant with description → plain mismatch copy", mismatch.test(f(E("invalid_grant: No user found with that email, or password invalid.", 400)))],
  ["002 bare 'No user found' → plain mismatch copy", mismatch.test(f(E("No user found with that email, or password invalid.")))],
  ["003 'Login failed (400)' → plain mismatch copy", mismatch.test(f(E("Login failed (400)", 400)))],
  ["004 copy never reveals whether the account exists", !/no user|not found|doesn't exist/i.test(f(E("No user found with that email")))],
  ["005 unconfirmed email → activation copy", /activat/i.test(f(E("Email not confirmed", 401)))],
  ["006 expired/invalid invitation token → new-invitation copy", /new invitation/i.test(f(E("Invalid token"), "The invitation could not be accepted.", INVITATION))],
  ["007 network/timeout → connection copy", /connection/i.test(f(E("Failed to fetch"))) && /connection/i.test(f(E("Identity request to /token timed out after 8000ms")))],
  ["008 rate limit → wait copy", /wait/i.test(f(E("Rate limit exceeded", 429)))],
  ["009 our own plain messages pass through unchanged", f(E("Private Beta access is not enabled for this account.")) === "Private Beta access is not enabled for this account."],
  ["010 raw protocol strings never pass through", ![f(E("unauthorized_client")), f(E('{"error":"x"}')), f(E(""))].some(t => /_|[{}]/.test(t))],
  ["011b invalid/expired callback token (recovery or confirmation link) → expired-link copy",
    linkCopy.test(f(E("Invalid token"), "Identity initialization failed.", EMAIL_LINK)) && linkCopy.test(f(E("Token expired"), "Identity initialization failed.", EMAIL_LINK))],
  ["011 password-rule errors (422) are not mislabelled as a wrong password", !mismatch.test(f(E("Password should be at least 8 characters", 422), "x", INVITATION))],

  // Invitation and password-reset links: the explanation applies.
  ["013 previously used invitation link ('User not found', 404) → already-used copy with the sign-in route, never the raw text",
    (t => linkCopy.test(t) && /sign in to Private Beta/.test(t) && !/user not found/i.test(t))(f(E("User not found", 404), "The invitation could not be accepted.", INVITATION))],
  ["014 expired invitation link → expired-or-used copy (every Identity wording)",
    usedOrExpiredLink.every(e => linkCopy.test(f(e, "The invitation could not be accepted.", INVITATION)))],
  ["015 used or expired password-reset link → expired-or-used copy (setting the new password, and opening the link)",
    usedOrExpiredLink.every(e => linkCopy.test(f(e, "The password could not be updated.", PASSWORD_RESET)) && linkCopy.test(f(e, "Identity initialization failed.", EMAIL_LINK)))],

  // Ordinary sign-in: never classified as an expired invitation.
  ["016 incorrect sign-in credentials → mismatch copy, never the link explanation",
    [E("invalid_grant: No user found with that email, or password invalid.", 400), E("Login failed (400)", 400), E("invalid_grant", 401)]
      .every(e => { const t = f(e, "Sign in failed.", SIGN_IN); return mismatch.test(t) && !linkCopy.test(t) && !/invitation/i.test(t); })],
  ["017 unknown sign-in account (invalid_grant or a bare 'User not found') → mismatch copy; never the link explanation; never reveals whether the account exists",
    signInFailures.every(e => { const t = f(e, "Sign in failed.", SIGN_IN); return mismatch.test(t) && !linkCopy.test(t) && !/not found|no user|doesn't exist/i.test(t); })],
  ["018 sign-in session token or expiry wording → session copy, never the invitation explanation",
    [E("Invalid token"), E("Token expired"), E("refresh token expired", 401)].every(e => {
      const t = f(e, "Identity initialization failed.", SIGN_IN);
      return !linkCopy.test(t) && !/invitation/i.test(t);
    })],
  ["019 the default flow is sign-in (a caller that names no flow never gets the link explanation)",
    [...usedOrExpiredLink, ...signInFailures].every(e => !linkCopy.test(f(e)))],
  ["020 identical errors differ only by flow: 'User not found' is an expired link when activating, a credentials failure when signing in",
    linkCopy.test(f(E("User not found", 404), "x", INVITATION)) && mismatch.test(f(E("User not found", 404), "x", SIGN_IN))]
];

// Every call site routes through friendlyAuthError and names its flow.
const expectedFlows = {
  "scripts/lib/flipforge-production-signin.mjs": ["AUTH_FLOWS.SIGN_IN", "AUTH_FLOWS.SIGN_IN"],
  "scripts/lib/flipforge-identity-client.mjs": ["AUTH_FLOWS.INVITATION", "AUTH_FLOWS.PASSWORD_RESET", "AUTH_FLOWS.SIGN_IN", "hadCallback ? AUTH_FLOWS.EMAIL_LINK : AUTH_FLOWS.SIGN_IN"],
  "scripts/lib/flipforge-production-auth-probe.mjs": ["AUTH_FLOWS.SIGN_IN", "AUTH_FLOWS.SIGN_IN", "AUTH_FLOWS.SIGN_IN"]
};
for (const [file, flows] of Object.entries(expectedFlows)) {
  const src = fs.readFileSync(file, "utf8");
  checks.push([`012 ${file} routes ${flows.length} auth error path(s) through friendlyAuthError`, (src.match(/friendlyAuthError\(error,/g) || []).length === flows.length && !/state\.error = error instanceof Error \? error\.message : "(?:Sign in failed|Identity initialization failed)\."/.test(src)]);
  const declared = [...src.matchAll(/friendlyAuthError\(error, "[^"]*", ([^)]+)\)/g)].map(m => m[1].trim());
  checks.push([`021 ${file} names the flow at every call site (${flows.join(" | ")})`, JSON.stringify(declared) === JSON.stringify(flows), declared.join(" | ")]);
}
const initialize = fs.readFileSync("scripts/lib/flipforge-identity-client.mjs", "utf8").match(/async function initialize\(\) \{[\s\S]*?\n\}/)?.[0] || "";
checks.push(["022 the identity panel uses the emailed-link flow at start-up only when the page was opened from an emailed link",
  /const hadCallback = callbackPresent\(\);/.test(initialize) && /hadCallback \? AUTH_FLOWS\.EMAIL_LINK : AUTH_FLOWS\.SIGN_IN/.test(initialize)]);

let failed = 0;
for (const [name, ok, detail] of checks) { console.log(`${ok ? "PASS" : "FAIL"} | ${name}${!ok && detail ? ` [${detail}]` : ""}`); if (!ok) failed++; }
console.log(`\nAuth error copy validation: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
