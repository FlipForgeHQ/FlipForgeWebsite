// DEV-only local stand-in for Netlify in the integrated customer journey. Static pages are proxied to
// saas-prototype/serve.mjs; /api/v1/* runs the REAL gateway function (netlify/functions/flipforge-api.js) with its
// allowlist, identity rules and disclosure filter, forwarding to the FlipForge2 DEV journey server.
//
// The signed Netlify Identity user is simulated from a test cookie (ff_journey_tenant=a|b). Nothing else is faked:
// the browser cannot set tenant headers (the gateway refuses them) and every response passes the real filter.
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gateway = require("../../netlify/functions/flipforge-api.js");

const PORT = Number(process.env.JOURNEY_GATEWAY_PORT || 4190);
const STATIC_ORIGIN = process.env.JOURNEY_STATIC_ORIGIN || "http://127.0.0.1:4173";
const TENANTS = Object.freeze({ a: "journey-tenant-a", b: "journey-tenant-b" });
const log = [];

function tenantFor(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)ff_journey_tenant=([ab])(?:;|$)/);
  return match ? TENANTS[match[1]] : null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function api(request, response, url) {
  const body = await readBody(request);
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  const tenantId = tenantFor(headers.cookie);
  const event = {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: url.toString(),
    headers,
    multiValueHeaders: {},
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: body || null,
    isBase64Encoded: false
  };
  const context = tenantId
    ? { clientContext: { user: { sub: `journey-user-${tenantId}`, email: `${tenantId}@journey.flipforge.test`,
        app_metadata: { flipforge: { access: "active", tenantId } } } } }
    : {};
  const result = await gateway.handler(event, context);
  log.push(`${request.method} ${url.pathname} ${tenantId || "anonymous"} -> ${result.statusCode}`);
  response.writeHead(result.statusCode || 500, result.headers || {});
  response.end(result.body || "");
}

async function passThrough(request, response, url) {
  const upstream = await fetch(`${STATIC_ORIGIN}${url.pathname}${url.search}`, { method: request.method, redirect: "manual" });
  const headers = {};
  upstream.headers.forEach((value, key) => { if (!["content-encoding", "transfer-encoding", "connection"].includes(key)) headers[key] = value; });
  response.writeHead(upstream.status, headers);
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${PORT}`}`);
  try {
    if (url.pathname === "/__journey/log") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(log.join("\n"));
      return;
    }
    if (url.pathname.startsWith("/api/v1/")) await api(request, response, url);
    else await passThrough(request, response, url);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "JOURNEY_GATEWAY_ERROR", message: String(error && error.message || error) } }));
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`journey gateway on http://127.0.0.1:${PORT} -> static ${STATIC_ORIGIN}`));
