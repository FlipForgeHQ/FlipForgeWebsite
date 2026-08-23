import { CONVERSION_STORE_NAME } from "./lib/beta-operations-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

const MAX_BODY_BYTES = 2048;

const EVENT_NAMES = new Set([
  "sample_dossier_viewed",
  "beta_cta_clicked",
  "beta_form_started",
  "beta_application_received",
  "app_preview_clicked",
  "onboarding_guide_clicked",
  "onboarding_guide_viewed",
  "onboarding_workspace_clicked",
]);

const PAGE_NAMES = new Set([
  "home",
  "sample-dossier",
  "beta-application",
  "application-received",
  "beta-onboarding",
  "product",
  "pricing",
  "learn",
  "faq",
  "about",
  "legal",
  "unknown",
]);

const PLACEMENTS = new Set([
  "hero",
  "sample-spotlight",
  "sample-page",
  "navigation",
  "footer",
  "form",
  "post-submit",
  "onboarding",
  "page",
  "unknown",
]);

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
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

export function createConversionEventHandler({ store, now = () => new Date() } = {}) {
  return async function conversionEvent(request) {
  if (request.method !== "POST") {
    return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
  }
  if (!sameOrigin(request)) {
    return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return reply(413, { accepted: false, reason: "PAYLOAD_TOO_LARGE" });
  }

  let input;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return reply(413, { accepted: false, reason: "PAYLOAD_TOO_LARGE" });
    }
    input = JSON.parse(raw);
  } catch {
    return reply(400, { accepted: false, reason: "INVALID_JSON" });
  }

  const event = typeof input?.event === "string" ? input.event : "";
  const page = typeof input?.page === "string" ? input.page : "unknown";
  const placement = typeof input?.placement === "string" ? input.placement : "unknown";
  if (!EVENT_NAMES.has(event) || !PAGE_NAMES.has(page) || !PLACEMENTS.has(placement)) {
    return reply(400, { accepted: false, reason: "EVENT_NOT_ALLOWED" });
  }

  const record = {
    type: "flipforge_conversion_event",
    schemaVersion: 1,
    event,
    page,
    placement,
    occurredAt: now().toISOString(),
  };

  // Deliberately log only allowlisted funnel dimensions. Do not add IP address,
  // user agent, referrer, query string, email, account, card, or listing data.
  console.log(JSON.stringify(record));
  try {
    const targetStore = store || betaRuntimeStore(CONVERSION_STORE_NAME, request);
    const date = record.occurredAt.slice(0, 10);
    await targetStore.setJSON(`event/${date}/${record.occurredAt}-${crypto.randomUUID()}.json`, record, {
      metadata: { event: record.event, occurredAt: record.occurredAt },
    });
  } catch {
    // Measurement must never block the visitor's journey. Netlify function logs
    // remain the fallback record and deliberately contain the same allowlist only.
    console.error(JSON.stringify({ type: "flipforge_conversion_storage", status: "UNAVAILABLE" }));
  }
  return reply(202, { accepted: true });
  };
}

export default createConversionEventHandler();

export const config = {
  path: "/api/conversion-event",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
