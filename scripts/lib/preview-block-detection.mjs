// Tells a deploy preview that Netlify's firewall blocks from one that is reachable.
//
// With a Firewall Traffic Rule on unpublished deploys, every request to a deploy preview is answered by Netlify
// before it reaches the site: the same block page (documented as a Netlify-branded 404 page; a 403 is also accepted)
// for every path. A preview counts as BLOCKED only when every sentinel path answers with the same 403 or 404 status
// and byte-identical body, and none of the answers looks like FlipForge content. Anything else that answered is
// REACHABLE (a real site serves different content per path: HTML, deploy-meta JSON, API JSON). Network errors,
// timeouts or other status mixes are UNREACHABLE. A partially reachable preview is never reported as blocked.
import crypto from "node:crypto";

export const SENTINEL_PATHS = Object.freeze([
  "/",
  "/deploy-meta.json",
  "/api/v1/health",
  "/robots.txt",
  "/api/beta/operator",
]);

const BLOCK_STATUSES = new Set([403, 404]);
const FLIPFORGE_MARKERS = /flipforge|"commitRef"|"contractVersion"|"correlationId"|card decision intelligence/i;
const MAX_BODY_CHARS = 200_000;

export function looksLikeFlipForge(response) {
  if (FLIPFORGE_MARKERS.test(String(response?.body || ""))) return true;
  const headers = response?.headers || {};
  return Object.keys(headers).some(name => /^x-flipforge-|^x-correlation-id$/i.test(name));
}

// Block pages can embed per-request values (request IDs, timestamps) and the requested path. Remove date-times, long
// tokens that contain a digit, the sentinel paths and slashes before comparing, so the same block page still
// compares equal across paths.
export function normalizeBlockBody(body) {
  let text = String(body || "");
  for (const sentinel of SENTINEL_PATHS) if (sentinel.length > 1) text = text.split(sentinel).join("");
  return text
    .replace(/\?ci=\d+/g, "")
    .replace(/\//g, "")
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, "")
    .replace(/\b(?=[0-9A-Za-z_-]*\d)[0-9A-Za-z_-]{16,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bodyHash(body) {
  return crypto.createHash("sha256").update(normalizeBlockBody(body), "utf8").digest("hex");
}

// responses: [{ path, status, body, headers, error }]
export function classifyPreviewProbe(responses) {
  const list = Array.isArray(responses) ? responses : [];
  if (list.length < SENTINEL_PATHS.length) return { state: "unreachable", reason: "incomplete probe" };
  if (list.some(item => item.error || !Number.isInteger(item.status) || item.status === 0)) {
    return { state: "unreachable", reason: "network error or timeout" };
  }
  if (list.some(item => item.status < 400)) return { state: "reachable", reason: "a sentinel path was served" };
  if (list.some(looksLikeFlipForge)) return { state: "reachable", reason: "FlipForge content was served" };
  const statuses = new Set(list.map(item => item.status));
  const hashes = new Set(list.map(item => bodyHash(item.body)));
  if (statuses.size === 1 && BLOCK_STATUSES.has(list[0].status) && hashes.size === 1) {
    return { state: "blocked", reason: `identical non-FlipForge ${list[0].status} page on ${list.length} paths`, status: list[0].status };
  }
  return { state: "unreachable", reason: `inconsistent answers (statuses ${[...statuses].join(",")})` };
}

// cacheBust appends ?ci=<n> so a CDN-cached answer from before the latest deploy is not reused.
export async function probePreview(origin, { fetchImpl = globalThis.fetch, timeoutMs = 15_000, cacheBust = false } = {}) {
  const responses = [];
  const query = cacheBust ? `?ci=${Date.now()}` : "";
  for (const path of SENTINEL_PATHS) {
    try {
      const response = await fetchImpl(`${origin}${path}${query}`, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        headers: { "User-Agent": "flipforge-preview-block-check", Accept: "*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text().catch(() => "");
      responses.push({
        path,
        status: response.status,
        body: text.slice(0, MAX_BODY_CHARS),
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error) {
      responses.push({ path, status: 0, error: error?.name || "Error" });
    }
  }
  return { responses, ...classifyPreviewProbe(responses) };
}
