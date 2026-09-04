import { getUser } from "@netlify/identity";
import {
  APPLICATION_STORE_NAME,
  applicationKey,
  isActiveTester,
  normalizeEmail,
} from "./lib/beta-operations-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

export const BETA_TERMS_VERSION = "2026-08-15";

function reply(status, body) {
  return Response.json(body, {
    status,
    headers: {
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

function appMetadata(user) {
  return user?.appMetadata || user?.app_metadata || {};
}

export function createBetaTermsAcceptanceHandler({ store, getUserFn = getUser, now = () => new Date() } = {}) {
  return async function betaTermsAcceptance(request) {
    const user = await getUserFn();
    if (!user) return reply(401, { accepted: false, reason: "AUTHENTICATION_REQUIRED" });
    if (!isActiveTester(user)) return reply(403, { accepted: false, reason: "ACTIVE_TESTER_REQUIRED" });
    if (request.method !== "POST") return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });

    let input;
    try {
      input = await request.json();
    } catch {
      return reply(400, { accepted: false, reason: "INVALID_BODY" });
    }
    if (input?.accepted !== true || String(input?.termsVersion || "") !== BETA_TERMS_VERSION) {
      return reply(400, { accepted: false, reason: "TERMS_ACCEPTANCE_REQUIRED" });
    }

    const metadata = appMetadata(user);
    const membership = metadata.flipforge || {};
    const applicationId = String(membership.betaApplicationId || "").trim();
    if (!applicationId) return reply(409, { accepted: false, reason: "BETA_APPLICATION_BINDING_MISSING" });

    const targetStore = store || betaRuntimeStore(APPLICATION_STORE_NAME, request);
    const key = applicationKey(applicationId);
    const entry = await targetStore.getWithMetadata(key, { type: "json" });
    const application = entry?.data;
    if (!application || !entry?.etag) return reply(404, { accepted: false, reason: "APPLICATION_NOT_FOUND" });

    const userId = String(user.id || user.sub || "").trim();
    const email = normalizeEmail(user.email);
    if (!userId || String(application.identityUserId || "") !== userId || normalizeEmail(application.applicant?.email) !== email) {
      return reply(403, { accepted: false, reason: "APPLICATION_IDENTITY_MISMATCH" });
    }

    if (application.termsAcceptance?.version === BETA_TERMS_VERSION && application.termsAcceptance?.acceptedAt) {
      return reply(200, {
        accepted: true,
        termsVersion: BETA_TERMS_VERSION,
        acceptedAt: application.termsAcceptance.acceptedAt,
        alreadyRecorded: true,
      });
    }

    const acceptedAt = now().toISOString();
    const updated = {
      ...application,
      version: Number(application.version || 0) + 1,
      updatedAt: acceptedAt,
      applicant: {
        ...(application.applicant || {}),
        betaTermsAccepted: true,
      },
      termsAcceptance: {
        version: BETA_TERMS_VERSION,
        acceptedAt,
        identityUserId: userId,
        method: "INVITATION_ACTIVATION",
      },
      history: [
        ...(Array.isArray(application.history) ? application.history : []),
        { type: "BETA_TERMS_ACCEPTED", at: acceptedAt, actor: "tester" },
      ],
    };

    const result = await targetStore.setJSON(key, updated, {
      metadata: {
        schemaVersion: Number(updated.schemaVersion || 1),
        status: updated.status,
        updatedAt,
        termsVersion: BETA_TERMS_VERSION,
      },
      onlyIfMatch: entry.etag,
    });
    if (result?.modified === false) return reply(409, { accepted: false, reason: "VERSION_CONFLICT" });

    console.log(JSON.stringify({
      type: "flipforge_beta_terms_operation",
      operation: "BETA_TERMS_ACCEPTED",
      applicationId,
      termsVersion: BETA_TERMS_VERSION,
      occurredAt: acceptedAt,
    }));

    return reply(200, { accepted: true, termsVersion: BETA_TERMS_VERSION, acceptedAt });
  };
}

export default createBetaTermsAcceptanceHandler();

export const config = {
  path: "/api/beta/terms-acceptance",
};
