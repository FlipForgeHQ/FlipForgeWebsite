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

// The plan's two platform rate-limit rules are reserved for public intake, so feedback throttles itself per
// signed-in tester: at most FEEDBACK_RATE_LIMIT submissions per FEEDBACK_RATE_WINDOW_MS. The counter is keyed by a
// SHA-256 of the Identity user id (or email) under rate/, outside the feedback/ prefix the Owner Hub lists.
export const FEEDBACK_RATE_LIMIT = 10;
export const FEEDBACK_RATE_WINDOW_MS = 600_000;

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function overFeedbackLimit(store, user, now) {
  const userId = String(user?.id || user?.sub || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const subject = userId ? `id:${userId}` : email ? `email:${email}` : "";
  if (!subject) return true;
  const key = `rate/${await sha256(`beta-feedback:${subject}`)}.json`;
  const current = await store.get(key, { type: "json" }).catch(() => null);
  const start = Number(current?.windowStart || 0);
  const fresh = !start || now.getTime() - start >= FEEDBACK_RATE_WINDOW_MS || now.getTime() < start;
  const count = fresh ? 1 : Number(current?.count || 0) + 1;
  await store.setJSON(key, { windowStart: fresh ? now.getTime() : start, count }).catch(() => {});
  return count > FEEDBACK_RATE_LIMIT;
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
    if (!validation.ok || !learningValidation.ok) {
      return reply(400, {
        accepted: false,
        reason: "FEEDBACK_INVALID",
        fields: [...validation.errors, ...learningValidation.errors],
      });
    }

    const targetStore = store || betaRuntimeStore(FEEDBACK_STORE_NAME, request);
    if (await overFeedbackLimit(targetStore, user, now())) {
      return reply(429, { accepted: false, reason: "RATE_LIMITED" });
    }

    const feedback = learningValidation.signals
      ? { ...validation.feedback, learning: learningValidation.signals }
      : validation.feedback;
    const record = createFeedback(feedback, now());
    await targetStore.setJSON(feedbackKey(record.id), record, {
      metadata: {
        schemaVersion: record.schemaVersion,
        status: record.status,
        category: record.feedback.category,
        checkpoint: record.feedback.checkpoint,
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
      cdiLearning: Boolean(record.feedback.learning),
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