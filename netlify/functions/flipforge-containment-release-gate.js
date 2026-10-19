"use strict";

/**
 * Independent release gate: a rollback to a pre-containment backend must never
 * return historical CardSight sale data or unsupported derived values.
 *
 * Set FLIPFORGE_APPROVED_BACKEND_COMMITS to exact, fully-reviewed 40-hex Render
 * git commits. Missing configuration, unknown identity or unapproved build:
 * fail closed. No wildcard, prefix, branch name or "main" bypass is possible.
 * Operators must explicitly enroll each new compliant deploy before traffic.
 */
const FULL_SHA = /^[a-f0-9]{40}$/i;

function approvedBuilds(csv) {
  return new Set(String(csv || "").split(",").map(s => s.trim().toLowerCase())
    .filter(s => FULL_SHA.test(s)));
}

function checkBackendGeneration(payload, allowlist) {
  const approved = approvedBuilds(allowlist);
  if (approved.size === 0) return { ok: false, reason: "APPROVED_BACKEND_BUILDS_NOT_CONFIGURED" };
  const meta = payload && payload.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { ok: false, reason: "BACKEND_IDENTITY_MISSING" };
  }
  const sha = typeof meta.runtimeBuildCommit === "string"
    ? meta.runtimeBuildCommit.trim().toLowerCase() : "";
  if (meta.runtimeBuildCommitVerified !== true || !FULL_SHA.test(sha)) {
    return { ok: false, reason: "BACKEND_IDENTITY_UNVERIFIED" };
  }
  if (!approved.has(sha)) return { ok: false, reason: "BACKEND_GENERATION_UNAPPROVED" };
  return { ok: true, reason: "APPROVED_BACKEND_GENERATION" };
}

module.exports = { checkBackendGeneration, approvedBuilds };
