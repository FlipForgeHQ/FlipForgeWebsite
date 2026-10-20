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

function back(source, status) {
  const target = UPDATES_SOURCES[source] || UPDATES_SOURCES.home;
  const [path, hash] = target.split("#");
  return redirect(`${path}?updates=${status}#${hash}`);
}

export function createUpdatesSignupHandler({ store, now = () => new Date() } = {}) {
  return async function updatesSignup(request) {
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
    // Bots get the same answer as people, so the trap is not an oracle. Nothing is stored.
    if (String(input?.bot_field || "").trim()) return json ? reply(202, { accepted: true }) : back(input?.source, "ok");

    const validation = validateSignup(input);
    if (!validation.ok) {
      return json ? reply(400, { accepted: false, reason: "SIGNUP_INVALID", fields: validation.errors }) : back(validation.source, "invalid");
    }

    const targetStore = store || betaRuntimeStore(UPDATES_STORE_NAME, request);
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
  rateLimit: {
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ["ip", "domain"],
  },
};
