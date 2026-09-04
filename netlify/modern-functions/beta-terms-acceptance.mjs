import { admin, getUser } from "@netlify/identity";
import {
  ACTIVE_ROLE,
  APPLICATION_STORE_NAME,
  TENANT_ROLE_PREFIX,
  applicationKey,
  normalizeEmail,
  operatorRoles,
} from "./lib/beta-operations-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

export const BETA_TERMS_VERSION = "2026-08-15";
const TERMS_PENDING_ROLE = "flipforge-terms-pending";

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

function userMetadata(user) {
  return user?.userMetadata || user?.user_metadata || {};
}

function userIdOf(user) {
  return String(user?.id || user?.sub || "").trim();
}

async function conditionalApplicationWrite(store, key, application, etag, metadata = {}) {
  if (!etag) throw new Error("VERSION_CONFLICT");
  const result = await store.setJSON(key, application, {
    metadata: {
      schemaVersion: Number(application.schemaVersion || 1),
      status: application.status,
      updatedAt: application.updatedAt,
      ...metadata,
    },
    onlyIfMatch: etag,
  });
  if (result?.modified === false) throw new Error("VERSION_CONFLICT");
  return result?.etag;
}

function membershipState(user) {
  const roles = operatorRoles(user);
  const tenantRoles = roles.filter(role => role.startsWith(TENANT_ROLE_PREFIX));
  return {
    roles,
    tenantRoles,
    pending: roles.includes(TERMS_PENDING_ROLE),
    active: roles.includes(ACTIVE_ROLE),
  };
}

async function promoteFounderSelected(identityAdmin, user, application) {
  const state = membershipState(user);
  if (state.tenantRoles.length !== 1) throw new Error("TENANT_MEMBERSHIP_INVALID");
  const expectedTenantRole = `${TENANT_ROLE_PREFIX}${application.tenantId}`;
  if (!application.tenantId || state.tenantRoles[0] !== expectedTenantRole) {
    throw new Error("TENANT_MEMBERSHIP_MISMATCH");
  }
  if (!state.pending && !state.active) throw new Error("TERMS_PENDING_ROLE_REQUIRED");
  if (state.active && !state.pending) return;

  const currentMetadata = appMetadata(user);
  const roles = state.roles.filter(role => role !== TERMS_PENDING_ROLE && role !== ACTIVE_ROLE);
  roles.push(ACTIVE_ROLE);

  await identityAdmin.updateUser(userIdOf(user), {
    app_metadata: {
      ...currentMetadata,
      roles: [...new Set(roles)],
      flipforge: {
        ...(currentMetadata.flipforge || {}),
        tenantId: application.tenantId,
        access: "active",
        betaApplicationId: application.id,
        cohort: application.cohort,
      },
    },
    user_metadata: userMetadata(user),
  });
}

export function createBetaTermsAcceptanceHandler({
  store,
  getUserFn = getUser,
  identityAdmin = admin,
  now = () => new Date(),
} = {}) {
  return async function betaTermsAcceptance(request) {
    const user = await getUserFn();
    if (!user) return reply(401, { accepted: false, reason: "AUTHENTICATION_REQUIRED" });
    if (request.method !== "POST") return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });

    const membership = membershipState(user);
    if (membership.tenantRoles.length !== 1 || (!membership.pending && !membership.active)) {
      return reply(403, { accepted: false, reason: "BETA_MEMBERSHIP_REQUIRED" });
    }

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
    const signedMembership = metadata.flipforge || {};
    const applicationId = String(signedMembership.betaApplicationId || "").trim();
    if (!applicationId) return reply(409, { accepted: false, reason: "BETA_APPLICATION_BINDING_MISSING" });

    const targetStore = store || betaRuntimeStore(APPLICATION_STORE_NAME, request);
    const key = applicationKey(applicationId);
    const entry = await targetStore.getWithMetadata(key, { type: "json" });
    let application = entry?.data;
    let etag = entry?.etag;
    if (!application || !etag) return reply(404, { accepted: false, reason: "APPLICATION_NOT_FOUND" });

    const identityUserId = userIdOf(user);
    const email = normalizeEmail(user.email);
    if (!identityUserId
        || String(application.identityUserId || "") !== identityUserId
        || normalizeEmail(application.applicant?.email) !== email) {
      return reply(403, { accepted: false, reason: "APPLICATION_IDENTITY_MISMATCH" });
    }
    if (application.tenantId && membership.tenantRoles[0] !== `${TENANT_ROLE_PREFIX}${application.tenantId}`) {
      return reply(403, { accepted: false, reason: "TENANT_MEMBERSHIP_MISMATCH" });
    }

    const alreadyRecorded = application.termsAcceptance?.version === BETA_TERMS_VERSION
      && Boolean(application.termsAcceptance?.acceptedAt);
    let acceptedAt = application.termsAcceptance?.acceptedAt || null;

    if (!alreadyRecorded) {
      acceptedAt = now().toISOString();
      application = {
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
          identityUserId,
          method: "INVITATION_ACTIVATION",
        },
        history: [
          ...(Array.isArray(application.history) ? application.history : []),
          { type: "BETA_TERMS_ACCEPTED", at: acceptedAt, actor: "tester" },
        ],
      };
      try {
        etag = await conditionalApplicationWrite(targetStore, key, application, etag, {
          termsVersion: BETA_TERMS_VERSION,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "VERSION_CONFLICT") {
          return reply(409, { accepted: false, reason: "VERSION_CONFLICT" });
        }
        return reply(502, { accepted: false, reason: "TERMS_RECEIPT_WRITE_FAILED" });
      }
    }

    if (application.selectionSource === "FOUNDER_SELECTED") {
      try {
        await promoteFounderSelected(identityAdmin, user, application);
      } catch (error) {
        const code = error instanceof Error ? error.message : "IDENTITY_PROMOTION_FAILED";
        const clientCodes = new Set([
          "TENANT_MEMBERSHIP_INVALID",
          "TENANT_MEMBERSHIP_MISMATCH",
          "TERMS_PENDING_ROLE_REQUIRED",
        ]);
        return reply(clientCodes.has(code) ? 409 : 502, {
          accepted: true,
          activated: false,
          termsVersion: BETA_TERMS_VERSION,
          acceptedAt,
          reason: clientCodes.has(code) ? code : "IDENTITY_PROMOTION_FAILED",
        });
      }
    }

    if (application.status !== "ACTIVATED") {
      const activatedAt = now().toISOString();
      const activated = {
        ...application,
        version: Number(application.version || 0) + 1,
        status: "ACTIVATED",
        activatedAt,
        updatedAt: activatedAt,
        history: [
          ...(Array.isArray(application.history) ? application.history : []),
          { type: "IDENTITY_ACTIVATED", at: activatedAt, actor: "identity" },
        ],
      };
      try {
        await conditionalApplicationWrite(targetStore, key, activated, etag, {
          termsVersion: BETA_TERMS_VERSION,
        });
        application = activated;
      } catch {
        // Identity promotion and the Terms receipt are already authoritative.
        // A later operator sync safely reconciles the display status if a concurrent
        // operator write won this final status-only race.
      }
    }

    console.log(JSON.stringify({
      type: "flipforge_beta_terms_operation",
      operation: "BETA_TERMS_ACCEPTED",
      applicationId,
      termsVersion: BETA_TERMS_VERSION,
      occurredAt: acceptedAt,
    }));

    return reply(200, {
      accepted: true,
      activated: true,
      termsVersion: BETA_TERMS_VERSION,
      acceptedAt,
      alreadyRecorded,
    });
  };
}

export default createBetaTermsAcceptanceHandler();

export const config = {
  path: "/api/beta/terms-acceptance",
};
