// Shared rules for the "stay in touch" email list.
// Stored privately in Netlify Blobs, one record per email (keyed by a SHA-256 of the
// normalized address), with the consent wording and time it was given. No email
// service is connected: the founder exports the list from the Owner Hub.
import { emailIndexKey, normalizeEmail } from "./beta-operations-core.mjs";

export const UPDATES_STORE_NAME = "flipforge-email-updates";
export const MAX_UPDATES_BYTES = 2_048;
export const UPDATES_CONSENT_VERSION = "2026-10-20";
export const UPDATES_CONSENT_TEXT =
  "Email me a short monthly note on spotting misleading card prices, plus FlipForge beta updates. Unsubscribe anytime.";

// Where a signup came from, and where a no-JavaScript form post returns to.
export const UPDATES_SOURCES = Object.freeze({
  home: "/#stay-in-touch",
  "evidence-lab": "/learn.html#stay-in-touch",
  article: "/price-is-not-proof.html#stay-in-touch",
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function updatesKey(email) {
  return emailIndexKey(email);
}

export function validateSignup(input) {
  const email = normalizeEmail(input?.email);
  const consentRaw = input?.consent;
  const consent = consentRaw === true || ["true", "on", "yes", "1"].includes(String(consentRaw || "").toLowerCase());
  const source = Object.hasOwn(UPDATES_SOURCES, String(input?.source || "")) ? String(input.source) : "home";
  const errors = [];
  if (!email || email.length > 254 || !EMAIL.test(email)) errors.push("email");
  if (!consent) errors.push("consent");
  return errors.length ? { ok: false, errors, source } : { ok: true, email, source };
}

export function subscriberRecord({ email, source }, now) {
  return {
    schemaVersion: 1,
    email,
    source,
    consentVersion: UPDATES_CONSENT_VERSION,
    consentText: UPDATES_CONSENT_TEXT,
    subscribedAt: now.toISOString(),
  };
}

export function csvCell(value) {
  const text = String(value ?? "");
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
