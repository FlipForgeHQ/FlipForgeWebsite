// Plain-language copy for Netlify Identity errors.
//
// Identity (GoTrue) reports a wrong password or unknown email as `invalid_grant`, sometimes with a raw
// description such as "No user found with that email, or password invalid." Customers should never see
// protocol codes, JSON or HTTP status text. The mapping never reveals whether an account exists.
//
// Every caller names the flow the error came from. Identity answers "User not found" (HTTP 404) when the token
// in an emailed link (an invitation, a password reset, an email confirmation) was already used or has expired:
// the token no longer matches a pending user. That is about the link, so the "expired or already used" copy is
// given only in those link flows. In sign-in (the default) the same words are treated as a credentials failure
// and never as an invitation problem, and expiry means the sign-in session, not a link.

export const AUTH_FLOWS = Object.freeze({
  SIGN_IN: "sign-in",
  INVITATION: "invitation",
  PASSWORD_RESET: "password-reset",
  EMAIL_LINK: "email-link"
});
const LINK_FLOWS = new Set([AUTH_FLOWS.INVITATION, AUTH_FLOWS.PASSWORD_RESET, AUTH_FLOWS.EMAIL_LINK]);

export const CREDENTIALS_MISMATCH = "That email and password don't match. Check both, or use \"Forgot password?\" to reset it.";
export const LINK_EXPIRED_OR_USED =
  "This link has expired or was already used. If you already set your password, sign in to Private Beta. Otherwise ask the FlipForge team for a new invitation.";
export const SESSION_EXPIRED = "Your sign-in session has ended. Sign in again to continue.";

const MISMATCH = /invalid_grant|no user found|invalid password|password invalid|invalid (?:login|credentials)|email or password/i;
const NOT_CONFIRMED = /email not confirmed|not confirmed|confirm(?:ation)? required/i;
// Words Identity uses about an emailed link's token (or, in sign-in, about the session token).
const TOKEN_PROBLEM = /(?:token|link).*(?:expired|invalid|not found)|invalid token|expired|\buser not found\b/i;
const USER_NOT_FOUND = /\buser not found\b/i;
const RATE_LIMIT = /too many|rate limit|429/i;
const NETWORK = /timed out|network|failed to fetch|load failed|offline|5\d\d\b/i;

const RAW = /invalid_grant|unauthorized_client|error_description|[{}]|\(\d{3}\)|^[a-z]+(?:_[a-z]+)+$/i;

export function friendlyAuthError(error, fallback = "Sign in failed. Please try again.", flow = AUTH_FLOWS.SIGN_IN) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const status = Number(error?.status) || 0;
  const text = `${raw} ${status || ""}`;
  const linkFlow = LINK_FLOWS.has(flow);
  if (MISMATCH.test(text)) return CREDENTIALS_MISMATCH;
  if (NOT_CONFIRMED.test(text)) return "This account isn't activated yet. Open the invitation email from FlipForge and finish activation first.";
  if (TOKEN_PROBLEM.test(text)) {
    if (linkFlow) return LINK_EXPIRED_OR_USED;
    // Sign-in: "User not found" is a credentials failure (never reveals whether the account exists);
    // any other token or expiry wording is about the sign-in session.
    return USER_NOT_FOUND.test(text) ? CREDENTIALS_MISMATCH : SESSION_EXPIRED;
  }
  if (RATE_LIMIT.test(text)) return "Too many sign-in attempts. Wait a minute, then try again.";
  if (NETWORK.test(text)) return "FlipForge sign-in couldn't be reached. Check your connection and try again.";
  if (status === 400 || status === 401) return CREDENTIALS_MISMATCH;
  if (!raw.trim() || RAW.test(raw)) return fallback;
  return raw;
}
