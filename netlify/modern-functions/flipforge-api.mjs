import { getUser } from "@netlify/identity";
import legacyGateway from "../functions/flipforge-api.js";

const legacyHandler = legacyGateway && legacyGateway.handler;
const TENANT_ROLE_PREFIX = "flipforge-tenant--";
const ACTIVE_ROLE = "flipforge-active";
const SAFE_TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MARKET_VIEW_PATH = "/api/v1/market-view";
const MARKET_VIEW_UPSTREAM_PATH = "/api/v1/opportunities/__market-view-v1";

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

export default async function flipForgeApi(request) {
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
