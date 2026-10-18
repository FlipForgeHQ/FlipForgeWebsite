// Browser/server session agreement for Netlify Identity.
//
// FlipForge's Netlify Functions authenticate a request from the nf_jwt cookie only. The
// browser keeps its own copy of the session (the @netlify/identity library persists it in
// localStorage under "gotrue.user"). The two can disagree: when the library restores a
// session from an expired cookie (hydrateSession), it renews the stored token but does not
// rewrite nf_jwt, so for up to an hour the page looks signed in while every function call
// is rejected with 401 — or, if the cookie belongs to an earlier account, a function sees a
// different person than the page shows.
//
// serverSessionStatus() never trusts the browser snapshot alone: it inspects the cookie the
// server will actually receive. syncServerSessionCookie() repairs the one known library gap
// by copying the library's own, still-valid persisted session into the same cookies the
// library writes itself (identical attributes: path=/, secure, samesite=lax). It never
// mints, extends or alters a token, and it never adopts a session for a different account.

export const NF_JWT_COOKIE = "nf_jwt";
export const NF_REFRESH_COOKIE = "nf_refresh";
export const SESSION_MARGIN_SECONDS = 60;
const LIBRARY_SESSION_KEY = "gotrue.user";

function nowSeconds(now) {
  return Math.floor((typeof now === "function" ? now() : Date.now()) / 1000);
}

export function jwtClaims(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch (_) {
    return null;
  }
}

export function readCookie(name, cookieString = typeof document === "undefined" ? "" : document.cookie) {
  const match = new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(String(cookieString || ""));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

function usableFor(token, userId, now) {
  const claims = jwtClaims(token);
  if (!claims || !userId || String(claims.sub || "") !== String(userId)) return false;
  return Number.isFinite(claims.exp) && claims.exp - nowSeconds(now) > SESSION_MARGIN_SECONDS;
}

// What the server will see for this account: "ok", "missing", "expired" or "other-account".
export function serverSessionStatus(userId, { cookieString, now } = {}) {
  const token = readCookie(NF_JWT_COOKIE, cookieString);
  if (!token) return "missing";
  const claims = jwtClaims(token);
  if (!claims) return "missing";
  if (String(claims.sub || "") !== String(userId || "")) return "other-account";
  if (!(Number.isFinite(claims.exp) && claims.exp - nowSeconds(now) > SESSION_MARGIN_SECONDS)) return "expired";
  return "ok";
}

function librarySession(storage) {
  try {
    const raw = storage?.getItem?.(LIBRARY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

// Returns true when the server cookie is usable for userId afterwards.
export function syncServerSessionCookie(userId, {
  storage = typeof localStorage === "undefined" ? null : localStorage,
  writeCookie = value => { document.cookie = value; },
  cookieString,
  now
} = {}) {
  if (!userId) return false;
  if (serverSessionStatus(userId, { cookieString, now }) === "ok") return true;
  const stored = librarySession(storage);
  const access = stored?.token?.access_token;
  if (String(stored?.id || "") !== String(userId) || !usableFor(access, userId, now)) return false;
  writeCookie(`${NF_JWT_COOKIE}=${encodeURIComponent(access)}; path=/; secure; samesite=lax`);
  const refresh = stored?.token?.refresh_token;
  if (typeof refresh === "string" && refresh) {
    writeCookie(`${NF_REFRESH_COOKIE}=${encodeURIComponent(refresh)}; path=/; secure; samesite=lax`);
  }
  return cookieString === undefined ? serverSessionStatus(userId, { now }) === "ok" : true;
}
