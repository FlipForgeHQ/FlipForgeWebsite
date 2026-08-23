import { admin, getIdentityConfig, getUser } from "@netlify/identity";
import {
  ACTIVE_ROLE,
  APPLICATION_STORE_NAME,
  CONVERSION_STORE_NAME,
  FEEDBACK_STORE_NAME,
  MAX_OPERATOR_BYTES,
  TENANT_ROLE_PREFIX,
  applicationKey,
  feedbackKey,
  feedbackSummary,
  funnelSummary,
  isOperator,
  listRecordEntries,
  listRecords,
  normalizeCohort,
  operatorRoles,
  statusSummary,
  tenantIdFor,
  transitionApplication,
  transitionFeedback,
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

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function parseBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_OPERATOR_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_OPERATOR_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(raw || "{}");
}

async function listIdentityUsers(identityAdmin) {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await identityAdmin.listUsers({ page, perPage: 100 });
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users;
}

function identityEmail(user) {
  return String(user?.email || "").trim().toLowerCase();
}

function activatedIdentity(user) {
  return Boolean(user?.confirmedAt || user?.confirmed_at || user?.lastSignInAt || user?.last_sign_in_at);
}

function invitedIdentity(user) {
  return Boolean(user?.invitedAt || user?.invited_at);
}

function applicationMetadata(application) {
  return {
    schemaVersion: Number(application.schemaVersion || 1),
    status: application.status,
    updatedAt: application.updatedAt,
  };
}

async function conditionalApplicationWrite(store, key, application, etag) {
  if (!etag) throw new Error("VERSION_CONFLICT");
  const result = await store.setJSON(key, application, {
    metadata: applicationMetadata(application),
    onlyIfMatch: etag,
  });
  if (result?.modified === false) throw new Error("VERSION_CONFLICT");
  return result?.etag;
}

async function conditionalFeedbackWrite(store, key, feedback, etag) {
  if (!etag) throw new Error("VERSION_CONFLICT");
  const result = await store.setJSON(key, feedback, {
    metadata: {
      schemaVersion: Number(feedback.schemaVersion || 1),
      status: feedback.status,
      category: feedback.feedback?.category,
      checkpoint: feedback.feedback?.checkpoint,
      updatedAt: feedback.updatedAt,
    },
    onlyIfMatch: etag,
  });
  if (result?.modified === false) throw new Error("VERSION_CONFLICT");
}

function reserveInvitation(application, now) {
  if (application.status !== "APPROVED") throw new Error("APPLICATION_NOT_APPROVED");
  if (!normalizeCohort(application.cohort)) throw new Error("COHORT_REQUIRED");
  const existing = application.invitationAttempt;
  if (existing?.id) {
    const age = now.getTime() - Date.parse(existing.startedAt || "");
    if (!Number.isFinite(age) || age < 120_000) throw new Error("INVITATION_IN_PROGRESS");
    return application;
  }
  const at = now.toISOString();
  return {
    ...application,
    version: Number(application.version || 0) + 1,
    invitationAttempt: { id: crypto.randomUUID(), startedAt: at },
    updatedAt: at,
    history: [...(application.history || []), { type: "INVITATION_STARTED", at, actor: "operator" }],
  };
}

async function clearInvitationReservation(store, key, application, etag, now) {
  if (!application.invitationAttempt?.id || !etag) return;
  const at = now.toISOString();
  const released = {
    ...application,
    version: Number(application.version || 0) + 1,
    invitationAttempt: null,
    updatedAt: at,
    history: [...(application.history || []), { type: "INVITATION_FAILED", at, actor: "system" }],
  };
  await conditionalApplicationWrite(store, key, released, etag).catch(() => {});
}

async function rawIdentityInvite(email, fullName) {
  const identity = getIdentityConfig();
  if (!identity?.url || !identity?.token) throw new Error("IDENTITY_OPERATOR_TOKEN_UNAVAILABLE");
  const response = await fetch(`${identity.url.replace(/\/$/, "")}/invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      data: { full_name: fullName },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 422 ? "IDENTITY_USER_EXISTS" : "IDENTITY_INVITE_FAILED");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function withActivation(application, user, now) {
  if (application.status !== "INVITE_SENT" || !activatedIdentity(user)) return application;
  const at = now.toISOString();
  return {
    ...application,
    version: Number(application.version || 0) + 1,
    status: "ACTIVATED",
    activatedAt: user.confirmedAt || user.confirmed_at || user.lastSignInAt || user.last_sign_in_at || at,
    updatedAt: at,
    history: [...(application.history || []), { type: "IDENTITY_ACTIVATED", at, actor: "identity" }],
  };
}

async function syncActivations(applicationStore, applications, identityAdmin, now) {
  const pending = applications.filter(item => item.status === "INVITE_SENT" && item.identityUserId);
  if (!pending.length) return applications;
  const users = await listIdentityUsers(identityAdmin);
  const byId = new Map(users.map(user => [String(user.id || ""), user]));
  const updated = [];
  for (const application of applications) {
    const next = withActivation(application, byId.get(String(application.identityUserId || "")), now);
    if (next !== application) await applicationStore.setJSON(applicationKey(next.id), next);
    updated.push(next);
  }
  return updated;
}

async function dashboard(applicationStore, eventStore, feedbackStore, identityAdmin, now, shouldSync = true) {
  let applications = await listRecords(applicationStore, "application/");
  if (shouldSync) applications = await syncActivations(applicationStore, applications, identityAdmin, now);
  applications.sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
  const feedback = await listRecords(feedbackStore, "feedback/");
  feedback.sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
  const eventEntries = await listRecordEntries(eventStore, "event/");
  const retentionStart = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const retainedEvents = [];
  for (const entry of eventEntries) {
    const occurredAt = Date.parse(entry.value?.occurredAt || "");
    if (Number.isFinite(occurredAt) && occurredAt < retentionStart) await eventStore.delete(entry.key);
    else retainedEvents.push(entry.value);
  }
  return {
    operation: "beta-operator-dashboard",
    applications,
    applicationSummary: statusSummary(applications),
    feedback,
    feedbackSummary: feedbackSummary(feedback),
    funnel: funnelSummary(retainedEvents, applications, now),
    invitationAuthority: "NETLIFY_IDENTITY_SERVER_OPERATOR",
  };
}

async function inviteApplicant(application, identityAdmin, inviteIdentity, now) {
  if (application.status !== "APPROVED") throw new Error("APPLICATION_NOT_APPROVED");
  const cohort = normalizeCohort(application.cohort);
  if (!cohort) throw new Error("COHORT_REQUIRED");

  const allUsers = await listIdentityUsers(identityAdmin);
  let identityUser = allUsers.find(user => identityEmail(user) === application.applicant.email) || null;
  if (!identityUser) {
    try {
      identityUser = await inviteIdentity(application.applicant.email, application.applicant.fullName);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "IDENTITY_USER_EXISTS") throw error;
      const refreshedUsers = await listIdentityUsers(identityAdmin);
      identityUser = refreshedUsers.find(user => identityEmail(user) === application.applicant.email) || null;
      if (!identityUser) throw new Error("IDENTITY_INVITE_RECONCILIATION_FAILED");
    }
  }

  // A pre-existing, unconfirmed self-registration is not proof that FlipForge
  // invited the applicant. Fail closed instead of granting beta roles to it.
  if (!activatedIdentity(identityUser) && !invitedIdentity(identityUser)) {
    throw new Error("IDENTITY_ACCOUNT_CONFLICT");
  }

  const identityUserId = String(identityUser.id || "");
  if (!identityUserId) throw new Error("IDENTITY_USER_ID_MISSING");
  const tenantId = tenantIdFor(application);
  const currentMetadata = identityUser.appMetadata || identityUser.app_metadata || {};
  const roles = operatorRoles(identityUser).filter(role => !role.startsWith(TENANT_ROLE_PREFIX));
  roles.push(ACTIVE_ROLE, `${TENANT_ROLE_PREFIX}${tenantId}`);

  const updatedIdentity = await identityAdmin.updateUser(identityUserId, {
    app_metadata: {
      ...currentMetadata,
      provider: currentMetadata.provider || "email",
      roles: [...new Set(roles)],
      flipforge: {
        tenantId,
        access: "active",
        betaApplicationId: application.id,
        cohort,
      },
    },
    user_metadata: {
      ...(identityUser.userMetadata || identityUser.user_metadata || {}),
      full_name: application.applicant.fullName,
    },
  });

  const at = now.toISOString();
  const active = activatedIdentity(updatedIdentity || identityUser);
  const next = {
    ...application,
    version: Number(application.version || 0) + 1,
    status: active ? "ACTIVATED" : "INVITE_SENT",
    invitationAttempt: null,
    tenantId,
    identityUserId,
    invitedAt: identityUser.invitedAt || identityUser.invited_at || at,
    activatedAt: active
      ? updatedIdentity?.confirmedAt || updatedIdentity?.confirmed_at || updatedIdentity?.lastSignInAt || updatedIdentity?.last_sign_in_at || at
      : null,
    updatedAt: at,
    history: [
      ...(application.history || []),
      { type: "IDENTITY_INVITE_SENT", at, actor: "operator" },
      ...(active ? [{ type: "IDENTITY_ACTIVATED", at, actor: "identity" }] : []),
    ],
  };
  return next;
}

function publicError(error) {
  const code = error instanceof Error ? error.message : "OPERATOR_OPERATION_FAILED";
  const clientErrors = new Set([
    "INVALID_APPLICATION_ID",
    "APPLICATION_NOT_FOUND",
    "INVALID_FEEDBACK_ID",
    "FEEDBACK_NOT_FOUND",
    "APPLICATION_NOT_APPROVED",
    "COHORT_REQUIRED",
    "IDENTITY_ACCOUNT_CONFLICT",
    "INVITATION_IN_PROGRESS",
    "INVALID_STATUS_TRANSITION",
    "INVALID_FEEDBACK_TRANSITION",
    "VERSION_CONFLICT",
  ]);
  return clientErrors.has(code) ? { status: ["APPLICATION_NOT_FOUND", "FEEDBACK_NOT_FOUND"].includes(code) ? 404 : 409, code } : { status: 502, code: "OPERATOR_OPERATION_FAILED" };
}

export function createBetaOperatorHandler({
  applicationStore,
  eventStore,
  feedbackStore,
  getUserFn = getUser,
  identityAdmin = admin,
  inviteIdentity = rawIdentityInvite,
  now = () => new Date(),
} = {}) {
  return async function betaOperator(request) {
    const user = await getUserFn();
    if (!user) return reply(401, { authorized: false, reason: "AUTHENTICATION_REQUIRED" });
    if (!isOperator(user)) return reply(403, { authorized: false, reason: "OPERATOR_ROLE_REQUIRED" });

    const applications = applicationStore || betaRuntimeStore(APPLICATION_STORE_NAME, request);
    const events = eventStore || betaRuntimeStore(CONVERSION_STORE_NAME, request);
    const feedbackRecords = feedbackStore || betaRuntimeStore(FEEDBACK_STORE_NAME, request);
    if (request.method === "GET") {
      try {
        return reply(200, await dashboard(applications, events, feedbackRecords, identityAdmin, now(), true));
      } catch {
        return reply(502, { authorized: true, reason: "OPERATOR_DASHBOARD_UNAVAILABLE" });
      }
    }
    if (request.method !== "POST") return reply(405, { authorized: true, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { authorized: false, reason: "ORIGIN_NOT_ALLOWED" });

    let input;
    try {
      input = await parseBody(request);
    } catch (error) {
      const status = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      return reply(status, { authorized: true, reason: status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY" });
    }

    try {
      const action = String(input?.action || "");
      if (action === "sync") return reply(200, await dashboard(applications, events, feedbackRecords, identityAdmin, now(), true));
      if (action === "feedback-transition") {
        const key = feedbackKey(input?.feedbackId);
        const currentEntry = await feedbackRecords.getWithMetadata(key, { type: "json" });
        const current = currentEntry?.data;
        if (!current) throw new Error("FEEDBACK_NOT_FOUND");
        if (Number(input?.expectedVersion) !== Number(current.version)) throw new Error("VERSION_CONFLICT");
        const updatedFeedback = transitionFeedback(current, {
          targetStatus: String(input?.targetStatus || ""),
          note: input?.note,
          now: now(),
        });
        await conditionalFeedbackWrite(feedbackRecords, key, updatedFeedback, currentEntry.etag);
        console.log(JSON.stringify({
          type: "flipforge_beta_operator_operation",
          operation: "FEEDBACK_TRANSITIONED",
          feedbackId: updatedFeedback.id,
          status: updatedFeedback.status,
          occurredAt: updatedFeedback.updatedAt,
        }));
        return reply(200, { authorized: true, feedback: updatedFeedback });
      }
      const key = applicationKey(input?.applicationId);
      const currentEntry = await applications.getWithMetadata(key, { type: "json" });
      const current = currentEntry?.data;
      if (!current) throw new Error("APPLICATION_NOT_FOUND");
      if (Number(input?.expectedVersion) !== Number(current.version)) throw new Error("VERSION_CONFLICT");

      let updated;
      if (action === "transition") {
        if (current.invitationAttempt?.id) throw new Error("INVITATION_IN_PROGRESS");
        updated = transitionApplication(current, {
          targetStatus: String(input?.targetStatus || ""),
          cohort: input?.cohort,
          note: input?.note,
          now: now(),
        });
        await conditionalApplicationWrite(applications, key, updated, currentEntry.etag);
      } else if (action === "invite") {
        const invitationNow = now();
        const reserved = reserveInvitation(current, invitationNow);
        let reservationEtag = currentEntry.etag;
        if (reserved !== current) {
          reservationEtag = await conditionalApplicationWrite(applications, key, reserved, currentEntry.etag);
        }
        try {
          updated = await inviteApplicant(reserved, identityAdmin, inviteIdentity, invitationNow);
          await conditionalApplicationWrite(applications, key, updated, reservationEtag);
        } catch (error) {
          await clearInvitationReservation(applications, key, reserved, reservationEtag, now());
          throw error;
        }
      } else {
        return reply(400, { authorized: true, reason: "ACTION_NOT_ALLOWED" });
      }

      console.log(JSON.stringify({
        type: "flipforge_beta_operator_operation",
        operation: action === "invite" ? "INVITATION_PROCESSED" : "APPLICATION_TRANSITIONED",
        applicationId: updated.id,
        status: updated.status,
        occurredAt: updated.updatedAt,
      }));
      return reply(200, { authorized: true, application: updated });
    } catch (error) {
      const mapped = publicError(error);
      return reply(mapped.status, { authorized: true, reason: mapped.code });
    }
  };
}

export default createBetaOperatorHandler();

export const config = {
  path: "/api/beta/operator",
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
