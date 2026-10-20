import {
  MAX_UPDATES_BYTES,
  UPDATES_SOURCES,
  UPDATES_STORE_NAME,
  subscriberRecord,
  updatesKey,
  validateSignup,
} from "./lib/updates-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

function reply(status, body) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function wantsJson(request) {
  return String(request.headers.get("accept") || "").includes("application/json")
    || String(request.headers.get("content-type") || "").includes("application/json");
}

async function parseBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_UPDATES_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_UPDATES_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  if (String(request.headers.get("content-type") || "").includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

// The Netlify plan allows two platform rate-limit rules, both reserved for other public intake endpoints,
// so this endpoint throttles itself: at most RATE_LIMIT submissions per connection per RATE_WINDOW_MS.
// The connection address is never stored. It is hashed with a random salt that changes every day; each
// day's salt and its counters are deleted after RATE_RETENTION_DAYS, so old hashes cannot be reversed.
export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 180_000;
export const RATE_RETENTION_DAYS = 2;

function clientAddress(request, context) {
  return String(context?.ip || request.headers.get("x-nf-client-connection-ip") || "").trim();
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function daySalt(store, day) {
  const key = `rate-salt/${day}.json`;
  const existing = await store.get(key, { type: "json" }).catch(() => null);
  if (existing?.salt) return existing.salt;
  await store.setJSON(key, { salt: hex(crypto.getRandomValues(new Uint8Array(32))) }, { onlyIfNew: true }).catch(() => {});
  const settled = await store.get(key, { type: "json" }).catch(() => null);
  return settled?.salt || "";
}

async function forgetOldDays(store, today) {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - (RATE_RETENTION_DAYS - 1) * 86_400_000;
  try {
    for await (const page of store.list({ prefix: "rate-salt/", paginate: true })) {
      for (const blob of page.blobs || []) {
        const day = blob.key.slice("rate-salt/".length, -".json".length);
        if (new Date(`${day}T00:00:00Z`).getTime() >= cutoff) continue;
        for await (const old of store.list({ prefix: `rate/${day}/`, paginate: true })) {
          for (const counter of old.blobs || []) await store.delete(counter.key).catch(() => {});
        }
        await store.delete(blob.key).catch(() => {});
      }
    }
  } catch { /* housekeeping only */ }
}

async function overLimit(store, address, now) {
  if (!address) return false;
  const day = now.toISOString().slice(0, 10);
  const salt = await daySalt(store, day);
  if (!salt) return false;
  const key = `rate/${day}/${await sha256(`${salt}:${address}`)}.json`;
  const current = await store.get(key, { type: "json" }).catch(() => null);
  const start = Number(current?.windowStart || 0);
  const fresh = !start || now.getTime() - start >= RATE_WINDOW_MS;
  const count = fresh ? 1 : Number(current?.count || 0) + 1;
  await store.setJSON(key, { windowStart: fresh ? now.getTime() : start, count }).catch(() => {});
  if (fresh) await forgetOldDays(store, day);
  return count > RATE_LIMIT;
}

function back(source, status) {
  const target = UPDATES_SOURCES[source] || UPDATES_SOURCES.home;
  const [path, hash] = target.split("#");
  return redirect(`${path}?updates=${status}#${hash}`);
}

export function createUpdatesSignupHandler({ store, now = () => new Date() } = {}) {
  return async function updatesSignup(request, context) {
    if (request.method !== "POST") return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });

    let input;
    try {
      input = await parseBody(request);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE";
      return reply(tooLarge ? 413 : 400, { accepted: false, reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY" });
    }

    const json = wantsJson(request);
    const targetStore = store || betaRuntimeStore(UPDATES_STORE_NAME, request);
    if (await overLimit(targetStore, clientAddress(request, context), now())) {
      return json ? reply(429, { accepted: false, reason: "RATE_LIMITED" }) : back(input?.source, "busy");
    }
    // Bots get the same answer as people, so the trap is not an oracle. Nothing is stored.
    if (String(input?.bot_field || "").trim()) return json ? reply(202, { accepted: true }) : back(input?.source, "ok");

    const validation = validateSignup(input);
    if (!validation.ok) {
      return json ? reply(400, { accepted: false, reason: "SIGNUP_INVALID", fields: validation.errors }) : back(validation.source, "invalid");
    }

    const key = await updatesKey(validation.email);
    // An address already on the list gets the same answer: the response never reveals who subscribed.
    await targetStore.setJSON(key, subscriberRecord(validation, now()), { onlyIfNew: true });
    console.log(JSON.stringify({ type: "flipforge_updates_operation", operation: "SIGNUP_RECEIVED", source: validation.source }));
    return json ? reply(202, { accepted: true }) : back(validation.source, "ok");
  };
}

export default createUpdatesSignupHandler();

export const config = {
  path: "/api/updates",
};
