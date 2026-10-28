// Operator window lock (founder decision 2026-10-28).
//
// A FlipForge sign-in is a browser cookie, so every window and tab of the same browser shares it. For the operator
// and owner pages that is not enough: opening a new window or tab, or reopening the browser, must not carry
// operator access with it. Each window therefore has to be unlocked with the operator's password, and every
// operator API call must present that window's unlock token in the X-FlipForge-Operator-Window header.
//
//  - Unlocking re-checks the password with Netlify Identity on the server. The password is never stored or logged;
//    the throwaway Identity session created by that check is signed out immediately.
//  - The browser keeps the token in sessionStorage (one window or tab only; gone when it closes). The server keeps
//    only a SHA-256 hash of it, bound to the operator's account.
//  - A window locks again after 30 minutes without operator activity, and 8 hours after it was unlocked at most.
//  - Five wrong passwords in 15 minutes pause unlocking for that account for 15 minutes.
import crypto from "node:crypto";
import { betaRuntimeStore } from "./beta-runtime-store.mjs";

export const OPERATOR_WINDOW_HEADER = "x-flipforge-operator-window";
export const OPERATOR_WINDOW_STORE_NAME = "flipforge-operator-windows";
export const WINDOW_IDLE_MS = 30 * 60 * 1000;
export const WINDOW_MAX_MS = 8 * 60 * 60 * 1000;
export const UNLOCK_ATTEMPT_LIMIT = 5;
export const UNLOCK_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const sha256 = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const accountKey = user => sha256(String(user?.id || user?.sub || "").trim());
const userId = user => String(user?.id || user?.sub || "").trim();

// Default password check: the same Netlify Identity sign-in the page uses, run on the server. Returns true only for
// a correct password. The session Identity creates for this check is signed out straight away.
export async function verifyPasswordWithIdentity({ origin, email, password, fetchFn = fetch }) {
  const tokenUrl = new URL("/.netlify/identity/token", origin);
  let response;
  try {
    response = await fetchFn(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "password", username: email, password }).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("IDENTITY_UNAVAILABLE");
  }
  if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) return false;
  if (!response.ok) throw new Error("IDENTITY_UNAVAILABLE");
  let accessToken = "";
  try { accessToken = String((await response.json())?.access_token || ""); } catch { accessToken = ""; }
  if (!accessToken) return false;
  try {
    await fetchFn(new URL("/.netlify/identity/logout", origin), {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error", signal: AbortSignal.timeout(5000),
    });
  } catch { /* best effort: the throwaway session also expires on its own */ }
  return true;
}

export function createOperatorWindowGate({ store, now = () => new Date(), verifyPassword = verifyPasswordWithIdentity } = {}) {
  const storeFor = request => store || betaRuntimeStore(OPERATOR_WINDOW_STORE_NAME, request);

  async function check(request, user) {
    const token = String(request.headers.get(OPERATOR_WINDOW_HEADER) || "").trim();
    if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: "OPERATOR_WINDOW_LOCKED" };
    const windows = storeFor(request);
    const key = `window/${sha256(token)}`;
    let record = null;
    try { record = await windows.get(key, { type: "json" }); } catch { return { ok: false, reason: "OPERATOR_WINDOW_UNAVAILABLE" }; }
    const at = now().getTime();
    const created = Date.parse(record?.createdAt || "");
    const lastSeen = Date.parse(record?.lastSeenAt || "");
    if (!record || record.userId !== userId(user) || !Number.isFinite(created) || !Number.isFinite(lastSeen)
      || at - created > WINDOW_MAX_MS || at - lastSeen > WINDOW_IDLE_MS || at < created) {
      if (record) { try { await windows.delete(key); } catch { /* expired record; harmless if it stays */ } }
      return { ok: false, reason: "OPERATOR_WINDOW_LOCKED" };
    }
    if (at - lastSeen > TOUCH_INTERVAL_MS) {
      try { await windows.setJSON(key, { ...record, lastSeenAt: new Date(at).toISOString() }); } catch { /* next call retries */ }
    }
    return { ok: true };
  }

  async function unlock(request, user, password) {
    const windows = storeFor(request);
    const attemptsKey = `attempts/${accountKey(user)}`;
    const at = now().getTime();
    let attempts = null;
    try { attempts = await windows.get(attemptsKey, { type: "json" }); } catch { attempts = null; }
    const firstAt = Date.parse(attempts?.firstAt || "");
    const recent = Number.isFinite(firstAt) && at - firstAt < UNLOCK_ATTEMPT_WINDOW_MS ? Number(attempts?.count || 0) : 0;
    if (recent >= UNLOCK_ATTEMPT_LIMIT) return { ok: false, status: 429, reason: "TOO_MANY_ATTEMPTS" };

    const email = String(user?.email || "").trim();
    if (!email || typeof password !== "string" || !password || password.length > 512) return { ok: false, status: 400, reason: "PASSWORD_REQUIRED" };
    let correct = false;
    try {
      correct = await verifyPassword({ origin: new URL(request.url).origin, email, password });
    } catch {
      return { ok: false, status: 503, reason: "IDENTITY_UNAVAILABLE" };
    }
    if (!correct) {
      try {
        await windows.setJSON(attemptsKey, { count: recent + 1, firstAt: recent ? attempts.firstAt : new Date(at).toISOString() });
      } catch { /* the Identity sign-in has its own limits too */ }
      return { ok: false, status: 401, reason: "PASSWORD_INCORRECT" };
    }
    try { await windows.delete(attemptsKey); } catch { /* counter expires on its own */ }
    const token = crypto.randomBytes(32).toString("base64url");
    const stamp = new Date(at).toISOString();
    await windows.setJSON(`window/${sha256(token)}`, { userId: userId(user), createdAt: stamp, lastSeenAt: stamp });
    return { ok: true, token, idleMinutes: WINDOW_IDLE_MS / 60000, maxHours: WINDOW_MAX_MS / 3600000 };
  }

  async function lock(request) {
    const token = String(request.headers.get(OPERATOR_WINDOW_HEADER) || "").trim();
    if (TOKEN_SHAPE.test(token)) {
      try { await storeFor(request).delete(`window/${sha256(token)}`); } catch { /* already gone */ }
    }
    return { ok: true };
  }

  return { check, unlock, lock };
}

// Shared request handling for /api/beta/operator?window=unlock|lock. Returns a Response, or null when the request is
// not a window request. The caller has already confirmed a signed-in operator.
export async function handleOperatorWindowRequest(request, user, gate, reply) {
  const action = new URL(request.url).searchParams.get("window");
  if (!action) return null;
  if (request.method !== "POST") return reply(405, { authorized: true, reason: "METHOD_NOT_ALLOWED" });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply(403, { authorized: false, reason: "ORIGIN_NOT_ALLOWED" });
  if (action === "lock") return reply(200, { authorized: true, locked: true, ...(await gate.lock(request)) });
  if (action === "check") {
    // Used by the Owner Hub, which has no data of its own to load: is this window still unlocked?
    const unlocked = await gate.check(request, user);
    return unlocked.ok ? reply(200, { authorized: true, unlocked: true }) : reply(401, { authorized: false, reason: unlocked.reason });
  }
  if (action !== "unlock") return reply(400, { authorized: true, reason: "UNKNOWN_WINDOW_ACTION" });
  let input = null;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply(413, { authorized: true, reason: "PAYLOAD_TOO_LARGE" });
    input = JSON.parse(raw);
  } catch {
    return reply(400, { authorized: true, reason: "PASSWORD_REQUIRED" });
  }
  const result = await gate.unlock(request, user, input?.password);
  if (!result.ok) return reply(result.status, { authorized: false, reason: result.reason });
  return reply(200, { authorized: true, unlocked: true, token: result.token, idleMinutes: result.idleMinutes, maxHours: result.maxHours });
}
