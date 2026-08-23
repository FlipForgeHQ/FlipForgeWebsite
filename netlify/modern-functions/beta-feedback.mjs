import { getUser } from "@netlify/identity";
import {
  FEEDBACK_STORE_NAME,
  MAX_FEEDBACK_BYTES,
  createFeedback,
  feedbackKey,
  isActiveTester,
  validateFeedback,
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
  if (declared > MAX_FEEDBACK_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_FEEDBACK_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(raw || "{}");
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
    if (!validation.ok) return reply(400, { accepted: false, reason: "FEEDBACK_INVALID", fields: validation.errors });

    const record = createFeedback(validation.feedback, now());
    const targetStore = store || betaRuntimeStore(FEEDBACK_STORE_NAME, request);
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
      occurredAt: record.submittedAt,
    }));
    return reply(202, { accepted: true, status: "AWAITING_OPERATOR_REVIEW" });
  };
}

export default createBetaFeedbackHandler();

export const config = {
  path: "/api/beta/feedback",
  rateLimit: {
    windowLimit: 20,
    windowSize: 3600,
    aggregateBy: ["ip", "domain"],
  },
};
