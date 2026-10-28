// Operator-only export of the "stay in touch" list (CSV), and removal for unsubscribe requests.
import { getUser } from "@netlify/identity";
import { createOperatorWindowGate } from "./lib/operator-window.mjs";
import { isOperator, normalizeEmail } from "./lib/beta-operations-core.mjs";
import { UPDATES_STORE_NAME, csvCell, updatesKey } from "./lib/updates-core.mjs";
import { productionOnly } from "./lib/production-deploy-guard.mjs";
import { betaRuntimeStore } from "./lib/beta-runtime-store.mjs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

function reply(status, body) {
  return Response.json(body, { status, headers: HEADERS });
}

async function allSubscribers(store) {
  const records = [];
  for await (const page of store.list({ prefix: "email/", paginate: true })) {
    for (const blob of page.blobs || []) {
      const record = await store.get(blob.key, { type: "json" });
      if (record?.email) records.push(record);
    }
  }
  return records.sort((a, b) => String(a.subscribedAt).localeCompare(String(b.subscribedAt)));
}

export function createUpdatesSubscribersHandler({ store, getUserFn = getUser, operatorWindow = createOperatorWindowGate(), now = () => new Date() } = {}) {
  return async function updatesSubscribers(request) {
    const user = await getUserFn();
    if (!user) return reply(401, { authorized: false, reason: "AUTHENTICATION_REQUIRED" });
    if (!isOperator(user)) return reply(403, { authorized: false, reason: "OPERATOR_ROLE_REQUIRED" });
    // This browser window must have been unlocked with the operator's password (lib/operator-window.mjs).
    const unlocked = await operatorWindow.check(request, user);
    if (!unlocked.ok) return reply(401, { authorized: false, reason: unlocked.reason });

    const targetStore = store || betaRuntimeStore(UPDATES_STORE_NAME, request);

    if (request.method === "GET") {
      const records = await allSubscribers(targetStore);
      const lines = [["email", "subscribed_at", "source", "consent_version"].join(",")]
        .concat(records.map(r => [r.email, r.subscribedAt, r.source, r.consentVersion].map(csvCell).join(",")));
      const day = now().toISOString().slice(0, 10);
      return new Response(lines.join("\r\n") + "\r\n", {
        status: 200,
        headers: {
          ...HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="flipforge-email-list-${day}.csv"`,
        },
      });
    }

    if (request.method === "DELETE") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) return reply(403, { removed: false, reason: "ORIGIN_NOT_ALLOWED" });
      const email = normalizeEmail(new URL(request.url).searchParams.get("email"));
      if (!email) return reply(400, { removed: false, reason: "EMAIL_REQUIRED" });
      await targetStore.delete(await updatesKey(email));
      console.log(JSON.stringify({ type: "flipforge_updates_operation", operation: "SUBSCRIBER_REMOVED" }));
      return reply(200, { removed: true });
    }

    return reply(405, { reason: "METHOD_NOT_ALLOWED" });
  };
}

export default productionOnly(createUpdatesSubscribersHandler());

export const config = {
  path: "/api/updates/subscribers",
};
