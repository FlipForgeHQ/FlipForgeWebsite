import { getUser } from "@netlify/identity";
import legacyGateway from "../functions/flipforge-api.js";

const legacyHandler = legacyGateway && legacyGateway.handler;

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

function legacyUser(user) {
  if (!user) return null;
  const sourceMetadata = user.appMetadata || user.app_metadata || {};
  const appMetadata = {
    ...(sourceMetadata && typeof sourceMetadata === "object" ? sourceMetadata : {}),
    ...(!sourceMetadata?.roles && Array.isArray(user.roles) ? { roles: user.roles } : {})
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
      payload.data.membershipSource = "netlify-identity-cookie-app-metadata";
      payload.data.authenticationTransport = "secure-same-origin-cookie";
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
  const event = await legacyEvent(request);
  const publicHealth = event.httpMethod === "GET" && event.path === "/api/v1/health";

  // Current Netlify Identity stores the signed session in secure nf_jwt /
  // nf_refresh cookies. getUser() verifies that session inside the modern
  // Netlify runtime. The browser never selects a tenant and never sends the
  // trusted FlipForge tenant/user headers.
  const user = publicHealth ? null : await getUser();
  const result = await legacyHandler(event, legacyContext(user));
  return modernResponse(normalizeHealth(result, event));
}

export const config = {
  path: "/api/v1/*"
};
