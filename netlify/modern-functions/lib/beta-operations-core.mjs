export const APPLICATION_STORE_NAME = "flipforge-beta-applications";
export const CONVERSION_STORE_NAME = "flipforge-conversion-events";
export const FEEDBACK_STORE_NAME = "flipforge-beta-feedback";
export const OPERATOR_ROLE = "flipforge-operator";
export const ACTIVE_ROLE = "flipforge-active";
export const TENANT_ROLE_PREFIX = "flipforge-tenant--";
export const MAX_APPLICATION_BYTES = 16_384;
export const MAX_FEEDBACK_BYTES = 8_192;
export const MAX_OPERATOR_BYTES = 8_192;

export const APPLICATION_STATUSES = Object.freeze([
  "SUBMITTED",
  "UNDER_REVIEW",
  "WAITLISTED",
  "APPROVED",
  "INVITE_SENT",
  "ACTIVATED",
  "DECLINED",
]);

export const FEEDBACK_STATUSES = Object.freeze(["NEW", "UNDER_REVIEW", "RESOLVED"]);

const STATUS_TRANSITIONS = Object.freeze({
  SUBMITTED: new Set(["UNDER_REVIEW", "WAITLISTED", "DECLINED"]),
  UNDER_REVIEW: new Set(["APPROVED", "WAITLISTED", "DECLINED"]),
  WAITLISTED: new Set(["UNDER_REVIEW", "APPROVED", "DECLINED"]),
  APPROVED: new Set(["UNDER_REVIEW", "WAITLISTED", "DECLINED"]),
  INVITE_SENT: new Set([]),
  ACTIVATED: new Set([]),
  DECLINED: new Set(["UNDER_REVIEW"]),
});

const FEEDBACK_TRANSITIONS = Object.freeze({
  NEW: new Set(["UNDER_REVIEW", "RESOLVED"]),
  UNDER_REVIEW: new Set(["RESOLVED"]),
  RESOLVED: new Set(["UNDER_REVIEW"]),
});

const ALLOWED = Object.freeze({
  collectorType: new Set(["Collector", "Flipper / reseller", "Grading-focused collector", "Dealer / shop", "New to the hobby"]),
  experience: new Set(["Less than 1 year", "1–3 years", "4–10 years", "10+ years"]),
  monthlyCardVolume: new Set(["1–5", "6–20", "21–50", "51–100", "100+"]),
  hostedWebBetaAccess: new Set(["Yes — several times per week", "Yes — about once per week", "Occasionally", "No"]),
  testingFocus: new Set(["Discover and search", "Exact-card identity", "Evidence and comparable-sale review", "Supported value / decision guidance", "PSA / grading scenarios", "Tracking and outcome review", "Forge Heat beta intelligence", "Broad product testing"]),
  feedbackCategory: new Set(["workflow", "decision-explanation", "evidence", "psa-guidance", "accessibility", "bug", "outcome-review"]),
  feedbackRating: new Set(["", "1", "2", "3", "4", "5"]),
  feedbackCheckpoint: new Set(["GENERAL", "DAY_7", "DAY_14", "DAY_30"]),
  feedbackOutcome: new Set(["", "REASONING_HELD", "REASONING_CHANGED", "MORE_EVIDENCE_NEEDED"]),
  feedbackRoute: new Set(["account", "alerts", "beta-start", "compare", "dashboard", "discover", "evaluate", "evidence", "export", "forge-heat", "market-view", "opportunities", "portfolio", "psa-advisor", "sell", "staging", "staging-evaluate", "tracking"]),
});

const SAFE_APPLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FEEDBACK_ID = SAFE_APPLICATION_ID;
const SAFE_COHORT = /^[a-z0-9][a-z0-9-]{2,47}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanSingleLine(value, maxLength) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanLongText(value, maxLength) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function selected(input, key, allowed) {
  const value = cleanSingleLine(input?.[key], 120);
  return allowed.has(value) ? value : "";
}

function yes(value) {
  return String(value ?? "").toLowerCase() === "yes";
}

export function normalizeEmail(value) {
  return cleanSingleLine(value, 254).toLowerCase();
}

export function validateApplication(input) {
  const applicant = {
    fullName: cleanSingleLine(input?.name, 120),
    email: normalizeEmail(input?.email),
    collectorType: selected(input, "collector_type", ALLOWED.collectorType),
    experience: selected(input, "experience", ALLOWED.experience),
    monthlyCardVolume: selected(input, "monthly_card_volume", ALLOWED.monthlyCardVolume),
    hostedWebBetaAccess: selected(input, "hosted_web_beta_access", ALLOWED.hostedWebBetaAccess),
    primaryUseCase: cleanLongText(input?.primary_use_case, 1_500),
    testerFit: cleanLongText(input?.tester_fit, 1_500),
    testingFocus: selected(input, "testing_focus", ALLOWED.testingFocus),
    gradingInterest: yes(input?.grading_interest),
    outcomeReviewInterest: yes(input?.outcome_review_interest),
    betaUpdatesConsent: yes(input?.beta_updates_consent),
    betaTermsAccepted: yes(input?.beta_terms_accepted),
  };

  const errors = [];
  if (applicant.fullName.length < 2) errors.push("NAME_REQUIRED");
  if (!EMAIL.test(applicant.email) || applicant.email.length > 254) errors.push("EMAIL_INVALID");
  if (!applicant.collectorType) errors.push("COLLECTOR_TYPE_INVALID");
  if (!applicant.experience) errors.push("EXPERIENCE_INVALID");
  if (!applicant.monthlyCardVolume) errors.push("MONTHLY_VOLUME_INVALID");
  if (!applicant.hostedWebBetaAccess) errors.push("WEB_ACCESS_INVALID");
  if (applicant.primaryUseCase.length < 10) errors.push("USE_CASE_REQUIRED");
  if (applicant.testerFit.length < 10) errors.push("TESTER_FIT_REQUIRED");
  if (!applicant.testingFocus) errors.push("TESTING_FOCUS_INVALID");
  if (!applicant.betaUpdatesConsent) errors.push("CONTACT_CONSENT_REQUIRED");
  if (!applicant.betaTermsAccepted) errors.push("TERMS_ACCEPTANCE_REQUIRED");
  return { ok: errors.length === 0, applicant, errors };
}

export function applicationKey(id) {
  if (!SAFE_APPLICATION_ID.test(String(id || ""))) throw new Error("INVALID_APPLICATION_ID");
  return `application/${id}.json`;
}

export function feedbackKey(id) {
  if (!SAFE_FEEDBACK_ID.test(String(id || ""))) throw new Error("INVALID_FEEDBACK_ID");
  return `feedback/${id}.json`;
}

export async function emailIndexKey(email) {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return `email/${hex}.json`;
}

export function createApplication(applicant, now = new Date()) {
  const id = crypto.randomUUID();
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    id,
    version: 1,
    status: "SUBMITTED",
    submittedAt: at,
    updatedAt: at,
    applicant,
    cohort: null,
    reviewNote: "",
    tenantId: null,
    identityUserId: null,
    invitationAttempt: null,
    invitedAt: null,
    activatedAt: null,
    history: [{ type: "APPLICATION_SUBMITTED", at, actor: "applicant" }],
  };
}

export function isActiveTester(user) {
  const roles = operatorRoles(user);
  const tenantRoles = roles.filter(role => role.startsWith(TENANT_ROLE_PREFIX));
  return roles.includes(ACTIVE_ROLE) && new Set(tenantRoles).size === 1;
}

export function validateFeedback(input, user) {
  const email = normalizeEmail(user?.email);
  const category = selected(input, "category", ALLOWED.feedbackCategory);
  const checkpoint = selected(input, "checkpoint", ALLOWED.feedbackCheckpoint);
  const outcome = selected(input, "outcome", ALLOWED.feedbackOutcome);
  const ratingValue = selected(input, "rating", ALLOWED.feedbackRating);
  const contactAllowed = yes(input?.contactAllowed);
  const feedback = {
    category,
    rating: ratingValue ? Number(ratingValue) : null,
    summary: cleanLongText(input?.summary, 2_000),
    expected: cleanLongText(input?.expected, 1_200),
    route: selected(input, "route", ALLOWED.feedbackRoute),
    checkpoint,
    outcome,
    contactAllowed,
    contactEmail: contactAllowed && EMAIL.test(email) ? email : null,
  };
  const errors = [];
  if (!feedback.category) errors.push("FEEDBACK_CATEGORY_INVALID");
  if (feedback.summary.length < 10) errors.push("FEEDBACK_SUMMARY_REQUIRED");
  if (!feedback.route) errors.push("FEEDBACK_ROUTE_INVALID");
  if (!feedback.checkpoint) errors.push("FEEDBACK_CHECKPOINT_INVALID");
  if (feedback.category === "outcome-review" && feedback.checkpoint === "GENERAL") errors.push("OUTCOME_CHECKPOINT_REQUIRED");
  if (feedback.category === "outcome-review" && !feedback.outcome) errors.push("OUTCOME_STATE_REQUIRED");
  if (!feedback.contactAllowed) feedback.contactEmail = null;
  return { ok: errors.length === 0, feedback, errors };
}

export function createFeedback(feedback, now = new Date()) {
  const id = crypto.randomUUID();
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    id,
    version: 1,
    status: "NEW",
    submittedAt: at,
    updatedAt: at,
    feedback,
    reviewNote: "",
    history: [{ type: "FEEDBACK_SUBMITTED", at, actor: "tester" }],
  };
}

export function transitionFeedback(record, { targetStatus, note, now = new Date() }) {
  if (!FEEDBACK_STATUSES.includes(targetStatus) || !FEEDBACK_TRANSITIONS[record.status]?.has(targetStatus)) {
    throw new Error("INVALID_FEEDBACK_TRANSITION");
  }
  const at = now.toISOString();
  return {
    ...record,
    version: Number(record.version || 0) + 1,
    status: targetStatus,
    reviewNote: normalizeReviewNote(note),
    updatedAt: at,
    history: [...(record.history || []), { type: `FEEDBACK_${targetStatus}`, at, actor: "operator" }],
  };
}

export function validTransition(from, to) {
  return Boolean(STATUS_TRANSITIONS[from]?.has(to));
}

export function normalizeCohort(value) {
  const cohort = cleanSingleLine(value, 48).toLowerCase();
  return SAFE_COHORT.test(cohort) ? cohort : "";
}

export function normalizeReviewNote(value) {
  return cleanLongText(value, 1_000);
}

export function transitionApplication(application, { targetStatus, cohort, note, now = new Date() }) {
  if (!APPLICATION_STATUSES.includes(targetStatus) || !validTransition(application.status, targetStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }
  const normalizedCohort = normalizeCohort(cohort || application.cohort || "");
  if (targetStatus === "APPROVED" && !normalizedCohort) throw new Error("COHORT_REQUIRED");
  const at = now.toISOString();
  return {
    ...application,
    version: Number(application.version || 0) + 1,
    status: targetStatus,
    cohort: normalizedCohort || application.cohort || null,
    reviewNote: normalizeReviewNote(note),
    updatedAt: at,
    history: [
      ...(Array.isArray(application.history) ? application.history : []),
      { type: `STATUS_${targetStatus}`, at, actor: "operator" },
    ],
  };
}

export function operatorRoles(user) {
  const metadata = user?.appMetadata || user?.app_metadata || {};
  return [...new Set([
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(metadata?.roles) ? metadata.roles : []),
  ].map(value => String(value || "").trim()).filter(Boolean))];
}

export function isOperator(user) {
  return Boolean(user) && (operatorRoles(user).includes(OPERATOR_ROLE) || String(user.role || "") === "admin");
}

export function tenantIdFor(application) {
  return `beta-${String(application.id).toLowerCase()}`;
}

export async function listRecords(store, prefix) {
  const blobs = [];
  for await (const page of store.list({ prefix, paginate: true })) {
    if (Array.isArray(page?.blobs)) blobs.push(...page.blobs);
  }
  const records = await Promise.all(blobs.map(blob => store.get(blob.key, { type: "json" })));
  return records.filter(record => record && typeof record === "object");
}

export async function listRecordEntries(store, prefix) {
  const blobs = [];
  for await (const page of store.list({ prefix, paginate: true })) {
    if (Array.isArray(page?.blobs)) blobs.push(...page.blobs);
  }
  const entries = await Promise.all(blobs.map(async blob => ({
    key: blob.key,
    value: await store.get(blob.key, { type: "json" }),
  })));
  return entries.filter(entry => entry.value && typeof entry.value === "object");
}

export function funnelSummary(events, applications, now = new Date()) {
  const start = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const counts = Object.create(null);
  for (const event of events) {
    const at = Date.parse(event?.occurredAt || "");
    if (!Number.isFinite(at) || at < start) continue;
    const name = String(event?.event || "");
    counts[name] = (counts[name] || 0) + 1;
  }
  const submitted = applications.filter(item => Date.parse(item?.submittedAt || "") >= start).length;
  return {
    windowDays: 30,
    counts: {
      sampleDossierViewed: counts.sample_dossier_viewed || 0,
      betaCtaClicked: counts.beta_cta_clicked || 0,
      betaFormStarted: counts.beta_form_started || 0,
      applicationsSubmitted: submitted,
      onboardingGuideViewed: counts.onboarding_guide_viewed || 0,
      workspaceClicked: counts.onboarding_workspace_clicked || 0,
    },
    countingBoundary: "DIRECTIONAL_INTERACTIONS_NOT_UNIQUE_VISITORS",
  };
}

export function statusSummary(applications) {
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map(status => [status, 0]));
  for (const item of applications) {
    if (Object.hasOwn(byStatus, item.status)) byStatus[item.status] += 1;
  }
  return { total: applications.length, byStatus };
}

export function feedbackSummary(records) {
  const byStatus = Object.fromEntries(FEEDBACK_STATUSES.map(status => [status, 0]));
  const byCheckpoint = Object.fromEntries(["GENERAL", "DAY_7", "DAY_14", "DAY_30"].map(value => [value, 0]));
  const byOutcome = Object.fromEntries(["REASONING_HELD", "REASONING_CHANGED", "MORE_EVIDENCE_NEEDED"].map(value => [value, 0]));
  for (const record of records) {
    if (Object.hasOwn(byStatus, record.status)) byStatus[record.status] += 1;
    if (Object.hasOwn(byCheckpoint, record.feedback?.checkpoint)) byCheckpoint[record.feedback.checkpoint] += 1;
    if (Object.hasOwn(byOutcome, record.feedback?.outcome)) byOutcome[record.feedback.outcome] += 1;
  }
  return {
    total: records.length,
    outcomeCheckpoints: byCheckpoint.DAY_7 + byCheckpoint.DAY_14 + byCheckpoint.DAY_30,
    byStatus,
    byCheckpoint,
    byOutcome,
    countingBoundary: "TESTER_REPORTED_CHECKPOINTS_NOT_ACCURACY",
  };
}
