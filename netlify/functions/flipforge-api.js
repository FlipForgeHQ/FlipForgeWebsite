const crypto = require("crypto");

const CONTRACT_VERSION = "1.0";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TIMEOUT_MS = 25000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_MAX_REQUEST_BYTES = 65_536;
const CARD_INTELLIGENCE_IMAGE_REQUEST_BYTES = 5_750_000;
const TENANT_HEADER = "X-FlipForge-Tenant-Id";
const USER_HEADER = "X-FlipForge-User-Id";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const SAFE_TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{8,100}$/;
const CHECKOUT_PATH = "/api/v1/billing/paddle/checkout";

const ROUTES = [
  { method: "GET", pattern: /^\/api\/v1\/health$/ },
  { method: "GET", pattern: /^\/api\/v1\/dashboard$/ },
  { method: "GET", pattern: /^\/api\/v1\/opportunities$/ },
  { method: "GET", pattern: /^\/api\/v1\/forge-heat$/ },
  { method: "GET", pattern: /^\/api\/v1\/opportunities\/[A-Za-z0-9._:-]+$/ },
  { method: "GET", pattern: /^\/api\/v1\/compare$/ },
  { method: "GET", pattern: /^\/api\/v1\/psa-advisor\/[A-Za-z0-9._:-]+$/ },
  { method: "GET", pattern: /^\/api\/v1\/evidence\/[A-Za-z0-9._:-]+$/ },
  { method: "GET", pattern: /^\/api\/v1\/portfolio$/ },
  { method: "GET", pattern: /^\/api\/v1\/alerts$/ },
  { method: "GET", pattern: /^\/api\/v1\/lifecycle$/ },
  { method: "GET", pattern: /^\/api\/v1\/lifecycle\/[A-Za-z0-9._:-]+$/ },
  { method: "PUT", pattern: /^\/api\/v1\/lifecycle\/[A-Za-z0-9._:-]+$/ },
  { method: "GET", pattern: /^\/api\/v1\/account$/ },
  { method: "GET", pattern: /^\/api\/v1\/entitlements$/ },
  { method: "POST", pattern: /^\/api\/v1\/discover$/ },
  { method: "POST", pattern: /^\/api\/v1\/evaluations$/ },
  { method: "POST", pattern: /^\/api\/v1\/card-intelligence\/search$/ },
  { method: "POST", pattern: /^\/api\/v1\/card-intelligence\/detect$/ },
  { method: "POST", pattern: /^\/api\/v1\/card-intelligence\/identify$/ },
  { method: "POST", pattern: /^\/api\/v1\/card-intelligence\/resolve$/ },
  { method: "POST", pattern: /^\/api\/v1\/billing\/paddle\/checkout$/ }
];

function matchingKey(object, name) {
  if (!object || typeof object !== "object") return null;
  const target = String(name).toLowerCase();
  return Object.keys(object).find(candidate => candidate.toLowerCase() === target) || null;
}

function headerValues(event, name) {
  const multiHeaders = event && event.multiValueHeaders ? event.multiValueHeaders : {};
  const multiKey = matchingKey(multiHeaders, name);
  if (multiKey) {
    const raw = multiHeaders[multiKey];
    return (Array.isArray(raw) ? raw : [raw])
      .filter(value => value !== undefined && value !== null)
      .map(value => String(value));
  }

  const headers = event && event.headers ? event.headers : {};
  const key = matchingKey(headers, name);
  if (!key) return [];
  const raw = headers[key];
  return (Array.isArray(raw) ? raw : [raw])
    .filter(value => value !== undefined && value !== null)
    .map(value => String(value));
}

function header(event, name) {
  const values = headerValues(event, name);
  return values.length > 0 ? values[0] : null;
}

function integerFromEnv(name, fallback, maximum) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function securityHeaders(event, correlationId) {
  const origin = header(event, "origin");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Correlation-Id": correlationId,
    Vary: "Origin"
  };

  if (origin && originAllowed(event, origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

function jsonResponse(event, statusCode, body, correlationId, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...securityHeaders(event, correlationId),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function errorEnvelope(code, message, correlationId, details = null) {
  return {
    error: {
      code,
      message,
      correlationId,
      ...(details ? { details } : {})
    }
  };
}

function checkoutRejectionMessage(code) {
  const messages = {
    CHECKOUT_IDEMPOTENCY_KEY_REQUIRED: "An Idempotency-Key is required for checkout.",
    INVALID_CHECKOUT_IDEMPOTENCY_KEY: "The checkout Idempotency-Key is invalid.",
    CHECKOUT_IDEMPOTENCY_CONFLICT: "The checkout request key was already used for a different plan.",
    CHECKOUT_IN_PROGRESS: "The checkout request is already being prepared.",
    CHECKOUT_REQUIRES_NEW_REQUEST_ID: "A prior checkout attempt was rejected. Start checkout again to create a new request.",
    CHECKOUT_OUTCOME_UNKNOWN: "The checkout outcome is uncertain. Do not submit another checkout until the current request is reconciled.",
    SUBSCRIPTION_ALREADY_ACTIVE: "An active paid subscription already exists for this account.",
    CHECKOUT_UNAVAILABLE: "Checkout is not enabled for this environment.",
    CHECKOUT_PROVIDER_REJECTED: "The billing provider rejected checkout preparation."
  };
  return Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : null;
}

function upstreamRejectionEnvelope(status, payload, correlationId) {
  const upstreamCode = payload && payload.error && typeof payload.error.code === "string"
    ? payload.error.code
    : "";

  if (status === 404 && upstreamCode === "RESOURCE_NOT_FOUND") {
    return errorEnvelope(
      "RESOURCE_NOT_FOUND",
      "The requested saved resource was not found.",
      correlationId
    );
  }

  if (status === 409 && upstreamCode === "LIFECYCLE_VERSION_CONFLICT") {
    return errorEnvelope(
      "LIFECYCLE_VERSION_CONFLICT",
      "The saved lifecycle record changed. Refresh before submitting another update.",
      correlationId
    );
  }

  if (status === 429 && upstreamCode === "EVALUATION_LIMIT_REACHED") {
    return errorEnvelope(
      "EVALUATION_LIMIT_REACHED",
      "Your monthly evaluation limit has been reached.",
      correlationId
    );
  }

  if (status === 403 && upstreamCode === "ENTITLEMENT_ACCESS_DENIED") {
    return errorEnvelope(
      "ENTITLEMENT_ACCESS_DENIED",
      "Your current FlipForge access does not permit a new evaluation.",
      correlationId
    );
  }

  const checkoutMessage = checkoutRejectionMessage(upstreamCode);
  if (checkoutMessage) {
    return errorEnvelope(upstreamCode, checkoutMessage, correlationId);
  }

  return errorEnvelope(
    "UPSTREAM_REJECTED",
    "The authoritative FlipForge service rejected the request.",
    correlationId
  );
}

function originAllowed(event, origin) {
  try {
    const parsed = new URL(origin);
    const requestHost = header(event, "host");
    if (requestHost && parsed.protocol === "https:" && parsed.host === requestHost) {
      return true;
    }

    const configured = String(process.env.FLIPFORGE_API_ALLOWED_ORIGINS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    return configured.includes(parsed.origin);
  } catch (_) {
    return false;
  }
}

function normalizedApiPath(event) {
  const rawPath = String((event && event.path) || "");
  const marker = "/api/v1/";
  const index = rawPath.indexOf(marker);
  if (index >= 0) return rawPath.slice(index).replace(/\/+$/, "");
  if (rawPath.endsWith("/api/v1")) return "/api/v1";
  return rawPath.replace(/\/+$/, "");
}

function routeAllowed(method, path) {
  return ROUTES.some(route => route.method === method && route.pattern.test(path));
}

function cardIntelligenceImagePath(path) {
  return path === "/api/v1/card-intelligence/detect"
    || path === "/api/v1/card-intelligence/identify";
}

function bridgeEnabled() {
  return String(process.env.FLIPFORGE_API_BRIDGE_ENABLED || "").toLowerCase() === "true";
}

function upstreamConfigured() {
  return Boolean(
    process.env.FLIPFORGE_API_BASE_URL &&
      process.env.FLIPFORGE_API_SERVICE_TOKEN
  );
}

function previewBypassAllowed() {
  const context = String(process.env.CONTEXT || "").toLowerCase();
  const requested = String(process.env.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW || "").toLowerCase() === "true";
  return requested && context && context !== "production";
}

function previewTenant() {
  if (!previewBypassAllowed()) return null;
  const tenantId = String(process.env.FLIPFORGE_API_PREVIEW_TENANT_ID || "").trim();
  return SAFE_TENANT_ID.test(tenantId) ? tenantId : null;
}

function authenticatedUser(context) {
  return context && context.clientContext && context.clientContext.user
    ? context.clientContext.user
    : null;
}

function resolveSignedMembership(user) {
  const metadata = user && user.app_metadata;
  const membership = metadata && metadata.flipforge;
  if (!membership || typeof membership !== "object" || Array.isArray(membership)) {
    return {
      ok: false,
      statusCode: 403,
      code: "TENANT_MEMBERSHIP_REQUIRED",
      message: "An active FlipForge tenant membership is required."
    };
  }

  if (String(membership.access || "").toLowerCase() !== "active") {
    return {
      ok: false,
      statusCode: 403,
      code: "TENANT_MEMBERSHIP_INACTIVE",
      message: "The FlipForge tenant membership is not active."
    };
  }

  const tenantId = typeof membership.tenantId === "string" ? membership.tenantId.trim() : "";
  if (!SAFE_TENANT_ID.test(tenantId)) {
    return {
      ok: false,
      statusCode: 403,
      code: "TENANT_MEMBERSHIP_INVALID",
      message: "The FlipForge tenant membership is invalid."
    };
  }

  return { ok: true, tenantId, source: "SIGNED_APP_METADATA" };
}

function resolveTenant(context) {
  const user = authenticatedUser(context);
  if (user) return resolveSignedMembership(user);

  if (!previewBypassAllowed()) {
    return {
      ok: false,
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required for FlipForge data routes."
    };
  }

  const tenantId = previewTenant();
  if (!tenantId) {
    return {
      ok: false,
      statusCode: 503,
      code: "PREVIEW_TENANT_NOT_CONFIGURED",
      message: "The non-production preview tenant is not configured."
    };
  }

  return { ok: true, tenantId, source: "NON_PRODUCTION_PREVIEW" };
}

function queryString(event) {
  if (event && typeof event.rawQuery === "string" && event.rawQuery) {
    return event.rawQuery;
  }

  const parameters = event && event.queryStringParameters ? event.queryStringParameters : {};
  return new URLSearchParams(
    Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null)
  ).toString();
}

function validUpstreamEnvelope(payload, correlationId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (!payload.meta || typeof payload.meta !== "object") return false;

  const meta = payload.meta;
  return (
    meta.contractVersion === CONTRACT_VERSION &&
    typeof meta.engineVersion === "string" &&
    meta.engineVersion.length > 0 &&
    meta.authority === "Smart Opportunity" &&
    meta.gradingAuthority === "Existing PSA intelligence" &&
    typeof meta.generatedAt === "string" &&
    meta.generatedAt.length > 0 &&
    meta.correlationId === correlationId &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  );
}

async function readLimitedJson(response, maxBytes) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    const error = new Error("Upstream response exceeded the configured size limit.");
    error.code = "UPSTREAM_RESPONSE_TOO_LARGE";
    throw error;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    const error = new Error("Upstream response exceeded the configured size limit.");
    error.code = "UPSTREAM_RESPONSE_TOO_LARGE";
    throw error;
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try {
    return JSON.parse(text);
  } catch (_) {
    const error = new Error("Upstream returned invalid JSON.");
    error.code = "UPSTREAM_INVALID_JSON";
    throw error;
  }
}

function healthPayload(correlationId) {
  return {
    meta: {
      contractVersion: CONTRACT_VERSION,
      correlationId,
      generatedAt: new Date().toISOString()
    },
    data: {
      service: "flipforge-saas-api-gateway",
      status: bridgeEnabled() && upstreamConfigured() ? "configured" : "disabled",
      bridgeEnabled: bridgeEnabled(),
      upstreamConfigured: upstreamConfigured(),
      authenticationRequired: !previewBypassAllowed(),
      tenantMembershipRequired: true,
      membershipSource: "signed-function-context-app-metadata",
      previewTenantConfigured: Boolean(previewTenant()),
      clientIdentityHeadersAccepted: false,
      discoverySearchPersistence: false,
      evaluationIdempotencyRequired: true,
      checkoutIdempotencyRequired: true,
      paddleCheckoutGatewayRouteAllowed: true,
      paddleWebhookGatewayRouteAllowed: false,
      cardIntelligenceRoutesAllowed: true,
      cardIntelligencePhotoRequestLimitBytes: CARD_INTELLIGENCE_IMAGE_REQUEST_BYTES,
      cardIntelligenceProviderCredentialBrowserExposed: false,
      productionPreviewBypassAllowed: false
    }
  };
}

function clientIdentityHeaderPresent(event) {
  return headerValues(event, TENANT_HEADER).length > 0 || headerValues(event, USER_HEADER).length > 0;
}

function requestIdempotency(event, method, path) {
  const isEvaluation = method === "POST" && path === "/api/v1/evaluations";
  const isCheckout = method === "POST" && path === CHECKOUT_PATH;
  if (!isEvaluation && !isCheckout) return { ok: true, value: null };

  const values = headerValues(event, IDEMPOTENCY_HEADER);
  if (values.length === 0 || values.every(value => !value.trim())) {
    return {
      ok: false,
      statusCode: 400,
      code: isCheckout ? "CHECKOUT_IDEMPOTENCY_KEY_REQUIRED" : "IDEMPOTENCY_KEY_REQUIRED",
      message: isCheckout
        ? "An Idempotency-Key is required for checkout requests."
        : "An Idempotency-Key is required for evaluation requests."
    };
  }
  if (values.length !== 1) {
    return {
      ok: false,
      statusCode: 400,
      code: isCheckout ? "INVALID_CHECKOUT_IDEMPOTENCY_KEY" : "INVALID_IDEMPOTENCY_KEY",
      message: isCheckout ? "The checkout Idempotency-Key is invalid." : "The Idempotency-Key is invalid."
    };
  }
  const value = values[0].trim();
  if (!SAFE_IDEMPOTENCY_KEY.test(value)) {
    return {
      ok: false,
      statusCode: 400,
      code: isCheckout ? "INVALID_CHECKOUT_IDEMPOTENCY_KEY" : "INVALID_IDEMPOTENCY_KEY",
      message: isCheckout ? "The checkout Idempotency-Key is invalid." : "The Idempotency-Key is invalid."
    };
  }
  return { ok: true, value };
}

exports.handler = async function handler(event, context) {
  const startedAt = Date.now();
  const correlationId = header(event, "x-correlation-id") || crypto.randomUUID();
  const method = String((event && event.httpMethod) || "GET").toUpperCase();
  const path = normalizedApiPath(event);

  if (method === "OPTIONS") {
    const origin = header(event, "origin");
    if (origin && !originAllowed(event, origin)) {
      return jsonResponse(
        event,
        403,
        errorEnvelope("ORIGIN_NOT_ALLOWED", "The request origin is not allowed.", correlationId),
        correlationId
      );
    }

    return {
      statusCode: 204,
      headers: {
        ...securityHeaders(event, correlationId),
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Correlation-Id, Idempotency-Key",
        "Access-Control-Max-Age": "600"
      },
      body: ""
    };
  }

  const origin = header(event, "origin");
  if (origin && !originAllowed(event, origin)) {
    return jsonResponse(
      event,
      403,
      errorEnvelope("ORIGIN_NOT_ALLOWED", "The request origin is not allowed.", correlationId),
      correlationId
    );
  }

  if (!routeAllowed(method, path)) {
    return jsonResponse(
      event,
      404,
      errorEnvelope("ROUTE_NOT_ALLOWED", "The requested API route is not available.", correlationId),
      correlationId
    );
  }

  if (clientIdentityHeaderPresent(event)) {
    return jsonResponse(
      event,
      400,
      errorEnvelope(
        "CLIENT_IDENTITY_HEADER_FORBIDDEN",
        "Tenant and user identity headers are set only by the trusted server-side gateway.",
        correlationId
      ),
      correlationId
    );
  }

  if (method === "GET" && path === "/api/v1/health") {
    return jsonResponse(event, 200, healthPayload(correlationId), correlationId);
  }

  const tenant = resolveTenant(context);
  if (!tenant.ok) {
    return jsonResponse(
      event,
      tenant.statusCode,
      errorEnvelope(tenant.code, tenant.message, correlationId),
      correlationId,
      tenant.statusCode === 401 ? { "WWW-Authenticate": "Bearer realm=\"FlipForge\"" } : {}
    );
  }

  if (!bridgeEnabled()) {
    return jsonResponse(
      event,
      503,
      errorEnvelope("BRIDGE_DISABLED", "The FlipForge API bridge is not enabled.", correlationId),
      correlationId
    );
  }

  if (!upstreamConfigured()) {
    return jsonResponse(
      event,
      503,
      errorEnvelope("UPSTREAM_NOT_CONFIGURED", "The authoritative FlipForge service is not configured.", correlationId),
      correlationId
    );
  }

  const idempotency = requestIdempotency(event, method, path);
  if (!idempotency.ok) {
    return jsonResponse(
      event,
      idempotency.statusCode,
      errorEnvelope(idempotency.code, idempotency.message, correlationId),
      correlationId
    );
  }

  const maxRequestBytes = cardIntelligenceImagePath(path)
    ? CARD_INTELLIGENCE_IMAGE_REQUEST_BYTES
    : integerFromEnv(
        "FLIPFORGE_API_MAX_REQUEST_BYTES",
        DEFAULT_MAX_REQUEST_BYTES,
        DEFAULT_MAX_REQUEST_BYTES
      );
  const body = event && event.body ? String(event.body) : "";
  if (Buffer.byteLength(body, "utf8") > maxRequestBytes) {
    return jsonResponse(
      event,
      413,
      errorEnvelope("REQUEST_TOO_LARGE", "The request body is too large.", correlationId),
      correlationId
    );
  }

  const baseUrl = String(process.env.FLIPFORGE_API_BASE_URL).replace(/\/+$/, "");
  const query = queryString(event);
  const upstreamUrl = `${baseUrl}${path}${query ? `?${query}` : ""}`;
  const timeoutMs = integerFromEnv("FLIPFORGE_API_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxResponseBytes = integerFromEnv(
    "FLIPFORGE_API_MAX_RESPONSE_BYTES",
    DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.FLIPFORGE_API_SERVICE_TOKEN}`,
      "X-Correlation-Id": correlationId,
      "X-FlipForge-Contract-Version": CONTRACT_VERSION,
      [TENANT_HEADER]: tenant.tenantId,
      ...(idempotency.value ? { [IDEMPOTENCY_HEADER]: idempotency.value } : {})
    };

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: method === "POST" || method === "PUT" ? body : undefined,
      signal: controller.signal,
      redirect: "error"
    });

    const payload = await readLimitedJson(upstreamResponse, maxResponseBytes);

    if (!upstreamResponse.ok) {
      console.warn(
        JSON.stringify({
          event: "FLIPFORGE_API_UPSTREAM_REJECTED",
          correlationId,
          method,
          path,
          upstreamStatus: upstreamResponse.status,
          durationMs: Date.now() - startedAt
        })
      );

      const retryAfter = upstreamResponse.status === 429 || upstreamResponse.status === 409
        ? String(upstreamResponse.headers.get("retry-after") || "").trim()
        : "";
      const safeRetryAfter = /^\d{1,10}$/.test(retryAfter) ? retryAfter : "";

      return jsonResponse(
        event,
        upstreamResponse.status >= 400 && upstreamResponse.status < 500 ? upstreamResponse.status : 502,
        upstreamRejectionEnvelope(upstreamResponse.status, payload, correlationId),
        correlationId,
        safeRetryAfter ? { "Retry-After": safeRetryAfter } : {}
      );
    }

    if (!validUpstreamEnvelope(payload, correlationId)) {
      return jsonResponse(
        event,
        502,
        errorEnvelope("UPSTREAM_CONTRACT_INVALID", "The authoritative response did not satisfy the FlipForge contract.", correlationId),
        correlationId
      );
    }

    console.info(
      JSON.stringify({
        event: "FLIPFORGE_API_REQUEST_COMPLETED",
        correlationId,
        method,
        path,
        upstreamStatus: upstreamResponse.status,
        durationMs: Date.now() - startedAt
      })
    );

    return jsonResponse(event, 200, payload, correlationId);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    const code = timedOut ? "UPSTREAM_TIMEOUT" : error && error.code ? error.code : "UPSTREAM_UNAVAILABLE";
    const message = timedOut
      ? "The authoritative FlipForge service timed out."
      : "The authoritative FlipForge service is unavailable.";

    console.error(
      JSON.stringify({
        event: "FLIPFORGE_API_REQUEST_FAILED",
        correlationId,
        method,
        path,
        code,
        durationMs: Date.now() - startedAt
      })
    );

    return jsonResponse(
      event,
      code === "UPSTREAM_RESPONSE_TOO_LARGE" ? 502 : 503,
      errorEnvelope(code, message, correlationId),
      correlationId
    );
  } finally {
    clearTimeout(timeout);
  }
};
