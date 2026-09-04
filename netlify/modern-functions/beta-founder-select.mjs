import { getUser } from "@netlify/identity";
import {
  APPLICATION_STORE_NAME,
  MAX_OPERATOR_BYTES,
  applicationKey,
  createApplication,
  emailIndexKey,
  isOperator,
  normalizeCohort,
  normalizeEmail,
} from "./lib/beta-operations-core.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function clean(value, maxLength) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function createFounderSelectedHandler({ store, getUserFn = getUser, now = () => new Date() } = {}) {
  return async function founderSelected(request) {
    const user = await getUserFn();
    if (!user) return reply(401, { authorized: false, reason: "AUTHENTICATION_REQUIRED" });
    if (!isOperator(user)) return reply(403, { authorized: false, reason: "OPERATOR_ROLE_REQUIRED" });
    if (request.method !== "POST") return reply(405, { authorized: true, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { authorized: false, reason: "ORIGIN_NOT_ALLOWED" });

    let input;
    try {
      input = await parseBody(request);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE";
      return reply(tooLarge ? 413 : 400, { authorized: true, reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY" });
    }

    const fullName = clean(input?.fullName, 120);
    const email = normalizeEmail(input?.email);
    const cohort = normalizeCohort(input?.cohort);
    const note = clean(input?.note, 500);
    if (fullName.length < 2) return reply(400, { authorized: true, reason: "NAME_REQUIRED" });
    if (!EMAIL.test(email) || email.length > 254) return reply(400, { authorized: true, reason: "EMAIL_INVALID" });
    if (!cohort) return reply(400, { authorized: true, reason: "COHORT_REQUIRED" });

    const targetStore = store || betaRuntimeStore(APPLICATION_STORE_NAME, request);
    const indexKey = await emailIndexKey(email);
    const existing = await targetStore.get(indexKey, { type: "json" }).catch(() => null);
    if (existing?.applicationId) {
      return reply(409, { authorized: true, reason: "TESTER_ALREADY_EXISTS", applicationId: existing.applicationId });
    }

    const at = now();
    const applicant = {
      fullName,
      email,
      collectorType: "Founder-selected tester",
      experience: "Not collected",
      monthlyCardVolume: "Not collected",
      hostedWebBetaAccess: "Founder-selected invitation",
      primaryUseCase: "Founder-selected private-beta product evaluation.",
      testerFit: "Personally selected for controlled private-beta testing.",
      testingFocus: "Broad product testing",
      gradingInterest: false,
      outcomeReviewInterest: true,
      betaUpdatesConsent: false,
      betaTermsAccepted: false,
    };

    const base = createApplication(applicant, at);
    const application = {
      ...base,
      status: "APPROVED",
      cohort,
      selectionSource: "FOUNDER_SELECTED",
      reviewNote: note || "Founder-selected tester. Beta Terms acceptance is required during invitation activation.",
      termsAcceptance: null,
      history: [
        ...base.history,
        { type: "FOUNDER_SELECTED", at: base.submittedAt, actor: "operator" },
        { type: "STATUS_APPROVED", at: base.submittedAt, actor: "operator" },
      ],
    };

    const claim = await targetStore.setJSON(
      indexKey,
      { applicationId: application.id, submittedAt: application.submittedAt, source: "FOUNDER_SELECTED" },
      { onlyIfNew: true },
    );
    if (claim?.modified === false) {
      return reply(409, { authorized: true, reason: "TESTER_ALREADY_EXISTS" });
    }

    try {
      await targetStore.setJSON(applicationKey(application.id), application, {
        metadata: {
          schemaVersion: 1,
          status: application.status,
          submittedAt: application.submittedAt,
          selectionSource: "FOUNDER_SELECTED",
        },
        onlyIfNew: true,
      });
    } catch (error) {
      const currentClaim = await targetStore.getWithMetadata(indexKey, { type: "json" }).catch(() => null);
      if (claim?.etag && currentClaim?.etag === claim.etag) await targetStore.delete(indexKey).catch(() => {});
      throw error;
    }

    console.log(JSON.stringify({
      type: "flipforge_beta_operator_operation",
      operation: "FOUNDER_SELECTED_TESTER_CREATED",
      applicationId: application.id,
      cohort,
      occurredAt: application.submittedAt,
    }));

    return reply(201, {
      authorized: true,
      application,
      nextAction: "SEND_IDENTITY_INVITATION",
      termsRequired: true,
    });
  };
}

export default createFounderSelectedHandler();

export const config = {
  path: "/api/beta/founder-select",
};
