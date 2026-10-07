// Plain-language copy for Netlify Identity sign-in errors.
//
// Identity (GoTrue) reports a wrong password or unknown email as `invalid_grant`, sometimes with a raw
// description such as "No user found with that email, or password invalid." Customers should never see
// protocol codes, JSON or HTTP status text. The mapping never reveals whether an account exists.

const RULES = [
  [/invalid_grant|no user found|invalid password|password invalid|invalid (?:login|credentials)|email or password/i,
    "That email and password don't match. Check both, or use \"Forgot password?\" to reset it."],
  [/email not confirmed|not confirmed|confirm(?:ation)? required/i,
    "This account isn't activated yet. Open the invitation email from FlipForge and finish activation first."],
  [/(?:token|link).*(?:expired|invalid|not found)|invalid token|expired/i,
    "This link has expired or was already used. Ask the FlipForge team for a new invitation."],
  [/too many|rate limit|429/i,
    "Too many sign-in attempts. Wait a minute, then try again."],
  [/timed out|network|failed to fetch|load failed|offline|5\d\d\b/i,
    "FlipForge sign-in couldn't be reached. Check your connection and try again."]
];

const RAW = /invalid_grant|unauthorized_client|error_description|[{}]|\(\d{3}\)|^[a-z]+(?:_[a-z]+)+$/i;

export function friendlyAuthError(error, fallback = "Sign in failed. Please try again.") {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const status = Number(error?.status) || 0;
  const text = `${raw} ${status || ""}`;
  for (const [pattern, copy] of RULES) {
    if (pattern.test(text)) return copy;
  }
  if (status === 400 || status === 401) return RULES[0][1];
  if (!raw.trim() || RAW.test(raw)) return fallback;
  return raw;
}
