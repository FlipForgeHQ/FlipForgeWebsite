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
  "REMOVED",
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

// Card evidence requests (from "Request evidence for this card" in Discover) carry a minimal,
// tester-reviewed card reference so the request is actionable. Only these identity fields are
// accepted. Listing links, seller data, prices, sale records, provider records and account
// identifiers are refused, never silently dropped, so a client cannot widen what is stored.
export const CARD_EVIDENCE_REQUEST_TYPE = "CARD_EVIDENCE";
export const CARD_REFERENCE_FIELDS = Object.freeze(["identity", "year", "player", "set", "cardNumber", "parallel", "grader", "grade"]);
const CARD_REFERENCE_META_FIELDS = Object.freeze(["source", "edited"]);
const CARD_REFERENCE_SOURCES = new Set(["DISCOVER_EXACT_SEARCH"]);
const CARD_REFERENCE_LIMITS = Object.freeze({ identity: 200, year: 7, player: 80, set: 120, cardNumber: 24, parallel: 80, grader: 8, grade: 9 });
export const CARD_REFERENCE_GRADERS = Object.freeze(["PSA", "BGS", "SGC", "CGC", "CSG", "TAG", "BCCG", "RAW"]);
export const CARD_REFERENCE_GRADES = Object.freeze(["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "AUTHENTIC"]);
const CARD_YEAR = /^(?:18|19|20)\d{2}(?:-\d{2})?$/;
const CARD_NUMBER = /^[A-Za-z0-9][A-Za-z0-9.\-/]{0,23}$/;
// URLs, domains, email addresses, long digit runs (item, order, phone or account numbers),
// markup, and money amounts are not card identity and are refused.
const CARD_REFERENCE_UNSAFE = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|us|uk|ca|de|ly|app|shop|store|me|gg)\b/i,
  /@/,
  /\d{9,}/,
  /[<>{}\\`]/,
  /[$€£¥]/,
];

function cardReferenceUnsafe(value) {
  return CARD_REFERENCE_UNSAFE.some(pattern => pattern.test(value));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateCardReference(input, category) {
  const errors = [];
  const requestTypeRaw = cleanSingleLine(input?.requestType, 40);
  const hasReference = input?.cardReference !== undefined && input?.cardReference !== null;
  if (!requestTypeRaw && !hasReference) return { ok: true, requestType: "", cardReference: null, errors };
  if (requestTypeRaw !== CARD_EVIDENCE_REQUEST_TYPE) return { ok: false, requestType: "", cardReference: null, errors: ["REQUEST_TYPE_INVALID"] };
  if (category !== "evidence") errors.push("CARD_EVIDENCE_CATEGORY_INVALID");
  const raw = input?.cardReference;
  if (!plainObject(raw)) return { ok: false, requestType: "", cardReference: null, errors: [...errors, "CARD_REFERENCE_REQUIRED"] };

  const allowed = new Set([...CARD_REFERENCE_FIELDS, ...CARD_REFERENCE_META_FIELDS]);
  if (Object.keys(raw).some(key => !allowed.has(key))) errors.push("CARD_REFERENCE_FIELD_NOT_ALLOWED");

  const reference = {};
  let malformed = false;
  let unsafe = false;
  for (const field of CARD_REFERENCE_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null) { reference[field] = ""; continue; }
    if (typeof value !== "string") { malformed = true; reference[field] = ""; continue; }
    // Over-long values are refused rather than truncated, so a cut-off value is never stored.
    const full = cleanSingleLine(value, 4_096);
    if (full.length > CARD_REFERENCE_LIMITS[field]) malformed = true;
    const cleaned = full.slice(0, CARD_REFERENCE_LIMITS[field]);
    if (cleaned.length && cardReferenceUnsafe(cleaned)) unsafe = true;
    reference[field] = cleaned;
  }
  if (malformed) errors.push("CARD_REFERENCE_VALUE_INVALID");
  if (unsafe) errors.push("CARD_REFERENCE_UNSAFE_CONTENT");

  reference.grader = reference.grader.toUpperCase();
  reference.grade = reference.grade.toUpperCase();
  if (reference.identity.length < 6 || !/[A-Za-z]/.test(reference.identity)) errors.push("CARD_REFERENCE_IDENTITY_REQUIRED");
  if (reference.year && !CARD_YEAR.test(reference.year)) errors.push("CARD_REFERENCE_YEAR_INVALID");
  if (reference.cardNumber && !CARD_NUMBER.test(reference.cardNumber.replace(/^#/, ""))) errors.push("CARD_REFERENCE_CARD_NUMBER_INVALID");
  reference.cardNumber = reference.cardNumber.replace(/^#/, "");
  if (reference.grader && !CARD_REFERENCE_GRADERS.includes(reference.grader)) errors.push("CARD_REFERENCE_GRADER_INVALID");
  if (reference.grade && !CARD_REFERENCE_GRADES.includes(reference.grade)) errors.push("CARD_REFERENCE_GRADE_INVALID");
  if (reference.grade && (!reference.grader || reference.grader === "RAW")) errors.push("CARD_REFERENCE_GRADE_WITHOUT_GRADER");

  const source = cleanSingleLine(raw.source, 40);
  if (!CARD_REFERENCE_SOURCES.has(source)) errors.push("CARD_REFERENCE_SOURCE_INVALID");
  if (raw.edited !== undefined && typeof raw.edited !== "boolean") errors.push("CARD_REFERENCE_VALUE_INVALID");
  reference.source = CARD_REFERENCE_SOURCES.has(source) ? source : "";
  reference.edited = raw.edited === true;

  const unique = [...new Set(errors)];
  return unique.length
    ? { ok: false, requestType: "", cardReference: null, errors: unique }
    : { ok: true, requestType: CARD_EVIDENCE_REQUEST_TYPE, cardReference: reference, errors: [] };
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
  const card = validateCardReference(input, feedback.category);
  errors.push(...card.errors);
  if (card.ok && card.cardReference) {
    feedback.requestType = card.requestType;
    feedback.cardReference = card.cardReference;
  }
  return { ok: errors.length === 0, feedback, errors };
}

// Feedback record schema: v1 = category, rating, summary, expected, route, checkpoint, outcome,
// contact fields (and optional CDI learning signals). v2 adds the optional requestType and
// cardReference of a card evidence request. Records without a card reference stay v1.
export const FEEDBACK_SCHEMA_VERSION_CARD_REFERENCE = 2;

export function createFeedback(feedback, now = new Date()) {
  const id = crypto.randomUUID();
  const at = now.toISOString();
  return {
    schemaVersion: feedback?.cardReference ? FEEDBACK_SCHEMA_VERSION_CARD_REFERENCE : 1,
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
  const byPlacement = Object.create(null);
  for (const event of events) {
    const at = Date.parse(event?.occurredAt || "");
    if (!Number.isFinite(at) || at < start) continue;
    const name = String(event?.event || "");
    counts[name] = (counts[name] || 0) + 1;
    const key = name + ":" + String(event?.placement || "");
    byPlacement[key] = (byPlacement[key] || 0) + 1;
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
    // Homepage persuasion: does a visitor reach, try and finish the Decision Challenge, look inside the app, and ask
    // for access? Directional interaction counts from the allowlisted homepage events, not unique visitors.
    homepage: {
      challengeReached: byPlacement["section_viewed:challenge"] || 0,
      challengeTried: counts.challenge_answered || 0,
      challengeFinished: counts.challenge_completed || 0,
      insideAppReached: byPlacement["section_viewed:inside-app"] || 0,
      appScreensOpened: counts.app_screen_viewed || 0,
      heroShortcutsUsed: counts.hero_jump_clicked || 0,
      audienceSelected: counts.audience_selected || 0,
      betaCtaClicked: counts.beta_cta_clicked || 0,
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
  const cardEvidenceRequests = records.filter(record => record.feedback?.requestType === CARD_EVIDENCE_REQUEST_TYPE).length;
  return {
    total: records.length,
    cardEvidenceRequests,
    outcomeCheckpoints: byCheckpoint.DAY_7 + byCheckpoint.DAY_14 + byCheckpoint.DAY_30,
    byStatus,
    byCheckpoint,
    byOutcome,
    countingBoundary: "TESTER_REPORTED_CHECKPOINTS_NOT_ACCURACY",
  };
}
