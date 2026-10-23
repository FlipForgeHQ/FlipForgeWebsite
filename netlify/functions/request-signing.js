// Optional HMAC signing of gateway-to-backend requests (defence in depth on top of the bearer service token).
//
// Off unless FLIPFORGE_API_SIGNING_SECRET is set, so behaviour is unchanged until the founder rolls it out
// (backend accept -> gateway signing -> backend require -> rotate the service token). When set, the secret must be
// at least 32 characters; a weaker value fails closed instead of silently sending unsigned requests.
//
// Contract (must match the backend verifier byte for byte):
//   X-FlipForge-Timestamp: <unix seconds>
//   X-FlipForge-Nonce:     <16-64 chars [A-Za-z0-9_-]>, random and single-use
//   X-FlipForge-Signature: v1=<lowercase hex HMAC-SHA256(secret, canonical)>
//   canonical = "FFSIG1\n" + METHOD + "\n" + raw path + "\n" + raw query (or "") + "\n" + timestamp + "\n" + nonce
//             + "\n" + X-FlipForge-Tenant-Id (or "") + "\n" + Idempotency-Key (or "") + "\n"
//             + lowercase hex SHA-256 of the exact body bytes
// The raw path and query are taken from the exact URL the gateway sends, and the body bytes are the exact bytes sent.
const crypto = require("crypto");

const SIGNING_SECRET_ENV = "FLIPFORGE_API_SIGNING_SECRET";
const MIN_SECRET_LENGTH = 32;
const PREFIX = "FFSIG1";
const TIMESTAMP_HEADER = "X-FlipForge-Timestamp";
const NONCE_HEADER = "X-FlipForge-Nonce";
const SIGNATURE_HEADER = "X-FlipForge-Signature";
const SIGNATURE_HEADERS = Object.freeze([TIMESTAMP_HEADER, NONCE_HEADER, SIGNATURE_HEADER]);

function signingConfig(env = process.env) {
  const raw = env ? env[SIGNING_SECRET_ENV] : undefined;
  const secret = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!secret) return { enabled: false, ok: true, secret: "" };
  if (secret.length < MIN_SECRET_LENGTH) return { enabled: true, ok: false, secret: "" };
  return { enabled: true, ok: true, secret };
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function bodyBytes(body) {
  if (body === undefined || body === null) return Buffer.alloc(0);
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
}

function canonical({ method, rawPath, rawQuery, timestamp, nonce, tenantId, idempotencyKey, body }) {
  return [
    PREFIX,
    clean(method).toUpperCase(),
    clean(rawPath),
    rawQuery === undefined || rawQuery === null ? "" : String(rawQuery),
    clean(timestamp),
    clean(nonce),
    clean(tenantId),
    clean(idempotencyKey),
    crypto.createHash("sha256").update(bodyBytes(body)).digest("hex")
  ].join("\n");
}

function signature(secret, canonicalString) {
  return `v1=${crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(canonicalString, "utf8").digest("hex")}`;
}

function newNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

// Returns the three signing headers for a request the gateway is about to send to `url`.
function signingHeaders({ secret, method, url, tenantId, idempotencyKey, body, now = Date.now(), nonce = newNonce() }) {
  const target = new URL(url);
  const timestamp = String(Math.floor(now / 1000));
  const canonicalString = canonical({
    method,
    rawPath: target.pathname,
    rawQuery: target.search.startsWith("?") ? target.search.slice(1) : "",
    timestamp,
    nonce,
    tenantId,
    idempotencyKey,
    body
  });
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: signature(secret, canonicalString)
  };
}

module.exports = {
  SIGNING_SECRET_ENV,
  MIN_SECRET_LENGTH,
  SIGNATURE_HEADERS,
  bodyBytes,
  canonical,
  signature,
  signingConfig,
  signingHeaders
};
