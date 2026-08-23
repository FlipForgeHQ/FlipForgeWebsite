import {
  APPLICATION_STORE_NAME,
  MAX_APPLICATION_BYTES,
  applicationKey,
  createApplication,
  emailIndexKey,
  validateApplication,
} from "./lib/beta-operations-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

function reply(status, body) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
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

function wantsJson(request) {
  return String(request.headers.get("accept") || "").includes("application/json")
    || String(request.headers.get("content-type") || "").includes("application/json");
}

async function parseBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_APPLICATION_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_APPLICATION_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  if (String(request.headers.get("content-type") || "").includes("application/json")) {
    return JSON.parse(raw);
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function accepted(request) {
  return wantsJson(request)
    ? reply(202, { accepted: true, status: "AWAITING_SELECTION_REVIEW" })
    : redirect("/thank-you.html");
}

function invalid(request, errors) {
  return wantsJson(request)
    ? reply(400, { accepted: false, reason: "APPLICATION_INVALID", fields: errors })
    : redirect("/beta-application.html?status=invalid");
}

export function createBetaApplicationsHandler({ store, now = () => new Date() } = {}) {
  return async function betaApplications(request) {
    if (request.method !== "POST") return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });

    let input;
    try {
      input = await parseBody(request);
    } catch (error) {
      const reason = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY";
      return reply(reason === "PAYLOAD_TOO_LARGE" ? 413 : 400, { accepted: false, reason });
    }

    // Bots receive the same confirmation as real applicants so the honeypot does
    // not become an oracle. No application record is written.
    if (String(input?.bot_field || input?.["bot-field"] || "").trim()) return accepted(request);

    const validation = validateApplication(input);
    if (!validation.ok) return invalid(request, validation.errors);

    const targetStore = store || betaRuntimeStore(APPLICATION_STORE_NAME, request);
    const indexKey = await emailIndexKey(validation.applicant.email);
    const application = createApplication(validation.applicant, now());
    const claim = await targetStore.setJSON(
      indexKey,
      { applicationId: application.id, submittedAt: application.submittedAt },
      { onlyIfNew: true },
    );
    if (claim?.modified === false) return accepted(request);

    try {
      await targetStore.setJSON(applicationKey(application.id), application, {
        metadata: { schemaVersion: 1, status: application.status, submittedAt: application.submittedAt },
        onlyIfNew: true,
      });
    } catch (error) {
      // Release only this request's email claim so a transient application-store
      // failure does not permanently block a legitimate retry.
      const currentClaim = await targetStore.getWithMetadata(indexKey, { type: "json" }).catch(() => null);
      if (claim?.etag && currentClaim?.etag === claim.etag) await targetStore.delete(indexKey).catch(() => {});
      throw error;
    }

    console.log(JSON.stringify({
      type: "flipforge_beta_application_operation",
      operation: "APPLICATION_STORED",
      applicationId: application.id,
      occurredAt: application.submittedAt,
    }));
    return accepted(request);
  };
}

export default createBetaApplicationsHandler();

export const config = {
  path: "/api/beta/applications",
  rateLimit: {
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ["ip", "domain"],
  },
};
