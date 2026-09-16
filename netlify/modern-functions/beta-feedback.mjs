import { getUser } from "@netlify/identity";
import {
  FEEDBACK_STORE_NAME,
  MAX_FEEDBACK_BYTES,
  createFeedback,
  feedbackKey,
  isActiveTester,
  validateFeedback,
} from "./lib/beta-operations-core.mjs";
import { validateCdiLearning } from "./lib/beta-cdi-learning.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

const ISSUE_SEVERITIES = new Set(["S1_BLOCKING", "S2_MAJOR", "S3_MINOR", "S4_COSMETIC"]);

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
  if (declared > MAX_FEEDBACK_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_FEEDBACK_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(raw || "{}");
}

function normalizedSeverity(input) {
  const value = String(input?.severity || "").trim().toUpperCase();
  return ISSUE_SEVERITIES.has(value) ? value : "";
}

async function pseudonymousTesterKey(user) {
  const metadata = user?.appMetadata || user?.app_metadata || {};
  const stable = String(user?.id || user?.sub || metadata?.flipforge?.betaApplicationId || "").trim();
  if (!stable) return null;
  const bytes = new TextEncoder().encode(`flipforge-wave1-tester-v1:${stable}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

export function createBetaFeedbackHandler({ store, getUserFn = getUser, now = () => new Date() } = {}) {
  return async function betaFeedback(request) {
    if (request.method !== "POST") return reply(405, { accepted: false, reason: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return reply(403, { accepted: false, reason: "ORIGIN_NOT_ALLOWED" });

    const user = await getUserFn();
    if (!user) return reply(401, { accepted: false, reason: "AUTHENTICATION_REQUIRED" });
    if (!isActiveTester(user)) return reply(403, { accepted: false, reason: "ACTIVE_TESTER_REQUIRED" });

    let input;
    try {
      input = await parseBody(request);
    } catch (error) {
      const reason = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY";
      return reply(reason === "PAYLOAD_TOO_LARGE" ? 413 : 400, { accepted: false, reason });
    }

    const validation = validateFeedback(input, user);
    const learningValidation = validateCdiLearning(input);
    const severity = normalizedSeverity(input);
    const attemptedSeverity = String(input?.severity || "").trim().length > 0;
    const severityErrors = attemptedSeverity && !severity ? ["BETA_ISSUE_SEVERITY_INVALID"] : [];
    if (!validation.ok || !learningValidation.ok || severityErrors.length) {
      return reply(400, {
        accepted: false,
        reason: "FEEDBACK_INVALID",
        fields: [...validation.errors, ...learningValidation.errors, ...severityErrors],
      });
    }

    const feedback = {
      ...validation.feedback,
      ...(learningValidation.signals ? { learning: learningValidation.signals } : {}),
      ...(severity ? { betaIssue: { severity } } : {}),
    };
    const record = {
      ...createFeedback(feedback, now()),
      testerKey: await pseudonymousTesterKey(user),
    };
    const targetStore = store || betaRuntimeStore(FEEDBACK_STORE_NAME, request);
    await targetStore.setJSON(feedbackKey(record.id), record, {
      metadata: {
        schemaVersion: record.schemaVersion,
        status: record.status,
        category: record.feedback.category,
        checkpoint: record.feedback.checkpoint,
        severity: record.feedback.betaIssue?.severity || null,
        submittedAt: record.submittedAt,
      },
      onlyIfNew: true,
    });

    console.log(JSON.stringify({
      type: "flipforge_beta_feedback_operation",
      operation: "FEEDBACK_STORED",
      feedbackId: record.id,
      category: record.feedback.category,
      checkpoint: record.feedback.checkpoint,
      issueSeverity: record.feedback.betaIssue?.severity || null,
      cdiLearning: Boolean(record.feedback.learning),
      pseudonymousTesterBound: Boolean(record.testerKey),
      occurredAt: record.submittedAt,
    }));
    return reply(202, { accepted: true, status: "AWAITING_OPERATOR_REVIEW" });
  };
}

export default createBetaFeedbackHandler();

// Netlify's current project tier permits two code-based rate-limit rules.
// This endpoint remains same-origin, authenticated, active-tester gated, payload-bounded,
// schema-validated, and write-once. The two platform rules are reserved for public intake.
export const config = {
  path: "/api/beta/feedback",
};
