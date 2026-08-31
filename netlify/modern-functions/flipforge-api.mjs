import crypto from "node:crypto";
import { getUser } from "@netlify/identity";
import legacyGateway from "../functions/flipforge-api.js";

const legacyHandler = legacyGateway && legacyGateway.handler;
const TENANT_ROLE_PREFIX = "flipforge-tenant--";
const ACTIVE_ROLE = "flipforge-active";
const SAFE_TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const MARKET_VIEW_PATH = "/api/v1/market-view";
const MARKET_VIEW_UPSTREAM_PATH = "/api/v1/opportunities/__market-view-v1";
const RUNTIME_IDENTITY_PATH = "/api/v1/runtime-identity";
const RUNTIME_IDENTITY_TIMEOUT_MS = 5000;

if (typeof legacyHandler !== "function") {
  throw new Error("FlipForge authoritative gateway core is unavailable.");
}

function headerObject(request) {
  const headers = {};
  for (const [name, value] of request.headers.entries()) headers[name] = value;
  return headers;
}

function queryObject(url) {
  const parameters = {};
  for (const [name, value] of url.searchParams.entries()) parameters[name] = value;
  return parameters;
}

async function legacyEvent(request) {
  const url = new URL(request.url);
  const method = String(request.method || "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? "" : await request.text();
  return {
    httpMethod: method,
    path: url.pathname,
    headers: headerObject(request),
    multiValueHeaders: {},
    queryStringParameters: queryObject(url),
    rawQuery: url.search.startsWith("?") ? url.search.slice(1) : url.search,
    body
  };
}

function gatewayRequest(request) {
  const url = new URL(request.url);
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" || url.pathname !== MARKET_VIEW_PATH) return request;

  // Netlify can resolve the wildcard /api/v1/* function before the dedicated
  // Market View function. Rewrite the canonical customer path here as well so
  // the retained fail-closed gateway sees only the already-approved protected
  // opportunity-detail resource. Browser tenant identity remains unavailable.
  url.pathname = MARKET_VIEW_UPSTREAM_PATH;
  url.search = "";
  return new Request(url, request);
}

function signedRoles(user, sourceMetadata) {
  const direct = Array.isArray(user?.roles) ? user.roles : [];
  const metadataRoles = Array.isArray(sourceMetadata?.roles) ? sourceMetadata.roles : [];
  return [...new Set([...direct, ...metadataRoles].map(value => String(value || "").trim()).filter(Boolean))];
}

function membershipFromRoles(roles) {
  if (!roles.includes(ACTIVE_ROLE)) return null;
  const tenantRoles = roles.filter(role => role.startsWith(TENANT_ROLE_PREFIX));
  if (tenantRoles.length !== 1) return null;
  const tenantId = tenantRoles[0].slice(TENANT_ROLE_PREFIX.length);
  if (!SAFE_TENANT_ID.test(tenantId)) return null;
  return { tenantId, access: "active" };
}

function legacyUser(user) {
  if (!user) return null;
  const sourceMetadata = user.appMetadata || user.app_metadata || {};
  const roles = signedRoles(user, sourceMetadata);
  const existingMembership = sourceMetadata && typeof sourceMetadata === "object"
    ? sourceMetadata.flipforge
    : null;
  const roleMembership = membershipFromRoles(roles);
  const appMetadata = {
    ...(sourceMetadata && typeof sourceMetadata === "object" ? sourceMetadata : {}),
    ...(roles.length ? { roles } : {}),
    ...(!existingMembership && roleMembership ? { flipforge: roleMembership } : {})
  };
  return {
    id: user.id,
    sub: user.id,
    email: user.email || null,
    app_metadata: appMetadata
  };
}

function legacyContext(user) {
  return user
    ? { clientContext: { user: legacyUser(user) } }
    : { clientContext: {} };
}

function normalizeHealth(result, event) {
  if (event.httpMethod !== "GET" || event.path !== "/api/v1/health" || result?.statusCode !== 200) return result;
  try {
    const payload = JSON.parse(result.body || "{}");
    if (payload?.data) {
      payload.data.membershipSource = "netlify-identity-signed-roles";
      payload.data.authenticationTransport = "secure-same-origin-cookie";
      payload.data.membershipRolePattern = "flipforge-active + flipforge-tenant--<tenantId>";
      result.body = JSON.stringify(payload);
    }
  } catch (_) {
    // The retained gateway core already owns the health contract. If parsing
    // ever fails, return its original response rather than inventing state.
  }
  return result;
}

function modernResponse(result) {
  const status = Number.isInteger(result?.statusCode) ? result.statusCode : 500;
  const headers = new Headers();
  for (const [name, value] of Object.entries(result?.headers || {})) {
    if (value !== undefined && value !== null) headers.set(name, String(value));
  }
  return new Response(result?.body || "", { status, headers });
}

function runtimeIdentityHeaders(correlationId) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Correlation-Id": correlationId
  };
}

function runtimeIdentityResponse(status, correlationId, data) {
  return new Response(JSON.stringify({
    meta: {
      contractVersion: "1.0",
      generatedAt: new Date().toISOString(),
      correlationId
    },
    data
  }), {
    status,
    headers: runtimeIdentityHeaders(correlationId)
  });
}

function validRuntimeIdentityEnvelope(payload, correlationId) {
  const meta = payload?.meta;
  const data = payload?.data;
  const commit = String(meta?.runtimeBuildCommit || "").trim();
  return Boolean(
    meta &&
    data &&
    meta.contractVersion === "1.0" &&
    meta.authority === "Smart Opportunity" &&
    meta.gradingAuthority === "Existing PSA intelligence" &&
    meta.correlationId === correlationId &&
    meta.runtimeBuildCommitVerified === true &&
    FULL_GIT_SHA.test(commit) &&
    data.runtimeMode === "PRIVATE_HOSTED" &&
    data.status === "ready" &&
    data.transactionAuthority === false
  );
}

async function runtimeIdentity(request) {
  const correlationId = crypto.randomUUID();
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET") {
    return runtimeIdentityResponse(405, correlationId, {
      service: "flipforge-runtime-identity-gateway",
      status: "method-not-allowed",
      runtimeBuildCommit: null,
      runtimeBuildCommitVerified: false,
      transactionAuthority: false
    });
  }

  const baseUrl = String(process.env.FLIPFORGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const serviceToken = String(process.env.FLIPFORGE_API_SERVICE_TOKEN || "").trim();
  if (!baseUrl || !serviceToken) {
    return runtimeIdentityResponse(503, correlationId, {
      service: "flipforge-runtime-identity-gateway",
      status: "upstream-not-configured",
      runtimeBuildCommit: null,
      runtimeBuildCommitVerified: false,
      authorityVerified: false,
      backendUrlExposed: false,
      serviceTokenExposed: false,
      transactionAuthority: false
    });
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${serviceToken}`,
        "X-Correlation-Id": correlationId
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(RUNTIME_IDENTITY_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error("UPSTREAM_HEALTH_REJECTED");

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 200_000) throw new Error("UPSTREAM_HEALTH_TOO_LARGE");
    const payload = JSON.parse(text);
    if (!validRuntimeIdentityEnvelope(payload, correlationId)) throw new Error("UPSTREAM_IDENTITY_INVALID");

    return runtimeIdentityResponse(200, correlationId, {
      service: "flipforge-runtime-identity-gateway",
      status: "verified",
      runtimeBuildCommit: payload.meta.runtimeBuildCommit,
      runtimeBuildCommitVerified: true,
      authority: "Smart Opportunity",
      gradingAuthority: "Existing PSA intelligence",
      authorityVerified: true,
      runtimeMode: "PRIVATE_HOSTED",
      backendUrlExposed: false,
      serviceTokenExposed: false,
      transactionAuthority: false
    });
  } catch (_) {
    return runtimeIdentityResponse(503, correlationId, {
      service: "flipforge-runtime-identity-gateway",
      status: "unavailable",
      runtimeBuildCommit: null,
      runtimeBuildCommitVerified: false,
      authorityVerified: false,
      backendUrlExposed: false,
      serviceTokenExposed: false,
      transactionAuthority: false
    });
  }
}

export default async function flipForgeApi(request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === RUNTIME_IDENTITY_PATH) return runtimeIdentity(request);

  const effectiveRequest = gatewayRequest(request);
  const event = await legacyEvent(effectiveRequest);
  const publicHealth = event.httpMethod === "GET" && event.path === "/api/v1/health";

  // Current Netlify Identity stores the signed session in secure nf_jwt /
  // nf_refresh cookies. getUser() verifies that session inside the modern
  // Netlify runtime. Tenant membership is derived only from owner-managed,
  // Netlify-signed roles; the browser cannot choose a tenant or mark itself active.
  const user = publicHealth ? null : await getUser();
  const result = await legacyHandler(event, legacyContext(user));
  return modernResponse(normalizeHealth(result, event));
}

export const config = {
  path: "/api/v1/*"
};
