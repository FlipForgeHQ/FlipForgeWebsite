const crypto = require("crypto");

const DEFAULT_ENDPOINT =
  process.env.EBAY_ACCOUNT_DELETION_ENDPOINT_URL ||
  "https://goflipforge.com/api/ebay/privacy";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
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

exports.handler = async function handler(event) {
  const verificationToken = process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT_URL || DEFAULT_ENDPOINT;

  if (event.httpMethod === "GET") {
    const challengeCode =
      event.queryStringParameters && event.queryStringParameters.challenge_code;

    if (!challengeCode) {
      return response(400, {
        error: "Missing challenge_code query parameter."
      });
    }

    if (!verificationToken) {
      return response(500, {
        error: "Server missing EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN."
      });
    }

    return response(200, {
      challengeResponse: makeChallengeResponse(challengeCode, verificationToken, endpoint)
    });
  }

  if (event.httpMethod === "POST") {
    let payload = {};
    try {
      payload = event.body ? JSON.parse(event.body) : {};
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
        signatureHeaderPresent: Boolean(
          event.headers &&
            (event.headers["x-ebay-signature"] || event.headers["X-EBAY-SIGNATURE"])
        )
      })
    );

    return response(202, {
      status: "accepted"
    });
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {},
      body: ""
    };
  }

  return response(405, {
    error: "Method not allowed."
  });
};
