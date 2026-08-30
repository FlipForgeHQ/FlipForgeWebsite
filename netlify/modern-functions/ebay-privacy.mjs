import crypto from "node:crypto";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function makeChallengeResponse(challengeCode, verificationToken, endpoint) {
  return crypto
    .createHash("sha256")
    .update(challengeCode, "utf8")
    .update(verificationToken, "utf8")
    .update(endpoint, "utf8")
    .digest("hex");
}

function hashIdentifier(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

export default async function ebayPrivacy(request) {
  const method = String(request.method || "GET").toUpperCase();
  const verificationToken = process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT_URL;

  if (method === "GET") {
    const url = new URL(request.url);
    const challengeCode = url.searchParams.get("challenge_code");

    if (!challengeCode) {
      return jsonResponse(400, {
        error: "Missing challenge_code query parameter."
      });
    }

    if (!verificationToken) {
      return jsonResponse(500, {
        error: "Server missing EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN."
      });
    }

    if (!endpoint) {
      return jsonResponse(500, {
        error: "Server missing EBAY_ACCOUNT_DELETION_ENDPOINT_URL."
      });
    }

    return jsonResponse(200, {
      challengeResponse: makeChallengeResponse(challengeCode, verificationToken, endpoint)
    });
  }

  if (method === "POST") {
    let payload = {};
    try {
      const rawBody = await request.text();
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      payload = { rawBodyParseError: true };
    }

    const metadata = payload && payload.metadata ? payload.metadata : {};
    const notification = payload && payload.notification ? payload.notification : {};
    const data = notification && notification.data ? notification.data : {};

    console.info(
      JSON.stringify({
        event: "EBAY_MARKETPLACE_ACCOUNT_DELETION_RECEIVED",
        topic: metadata.topic || null,
        schemaVersion: metadata.schemaVersion || null,
        notificationId: notification.notificationId || null,
        eventDate: notification.eventDate || null,
        publishDate: notification.publishDate || null,
        publishAttemptCount: notification.publishAttemptCount || null,
        usernameHash: hashIdentifier(data.username),
        userIdHash: hashIdentifier(data.userId),
        eiasTokenHash: hashIdentifier(data.eiasToken),
        signatureHeaderPresent: Boolean(request.headers.get("x-ebay-signature"))
      })
    );

    return jsonResponse(202, {
      status: "accepted"
    });
  }

  if (method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  return jsonResponse(405, {
    error: "Method not allowed."
  });
}

export const config = {
  path: "/api/ebay/privacy"
};
