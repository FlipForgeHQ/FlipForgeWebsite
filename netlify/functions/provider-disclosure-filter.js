"use strict";

/**
 * Gateway-side provider disclosure filter (rollback read isolation).
 *
 * Mirrors the backend SaaSCustomerDisclosureGuard (customer-disclosure-v1) and the gateway specification in
 * FlipForge2 docs/compliance/CARDSIGHT_ROLLBACK_READ_ISOLATION.md section 3. It runs on every backend JSON body
 * before the browser sees it, whichever backend build served it, so a backend rollback to a pre-containment build
 * cannot hand a customer an individual provider sale's price, date, link, title or row id, or the provider's name.
 *
 * Rules:
 *   1. Provider-sourced objects lose every sale-level field and gain saleDetailsWithheld: true.
 *   2. Sale-link lineage lists are removed everywhere; their sale dates are removed beside them.
 *   3. /api/v1/evidence/* drops provider-sourced linkedEvidence[] and manualCandidates[] rows entirely.
 *   4. The provider name is rewritten in every key and string value.
 *   5. Strict mode (any build whose health does not report a verified storage guard): single-sale aggregates,
 *      sale date ranges and marketplace lists on legacy-derived values are withheld too.
 *   6. Fail closed: a body that is not a JSON object is replaced by the caller's generic error.
 *
 * It never adds a number, never changes a number it does not withhold, and never stores anything.
 */

const VERSION = "gateway-provider-disclosure-v1";
const NEUTRAL_SOURCE_LABEL = "Reported completed sale (data provider)";

const SOURCE_KEYS = [
  "sourceName", "sourceMarketplace", "source", "sourceStore", "provider", "providerSource", "providerName",
  "providerId", "providerDisplayName", "marketplace", "sourceType", "source_name", "source_marketplace",
  "source_store", "provider_source"
];

const SALE_LEVEL_KEYS = new Set([
  "amount", "price", "salePrice", "soldPrice", "priceCents", "salePriceCents", "soldPriceCents", "amountCents",
  "sale_price", "price_cents", "sold_price_cents",
  "soldAt", "saleDate", "soldDate", "date", "sold_at", "sale_date", "sold_date", "saleTimestamp",
  "sourceUrl", "url", "link", "listingUrl", "saleUrl", "transactionUrl", "itemUrl", "source_url", "listing_url",
  "saleTitle", "title", "sale_title",
  "id", "saleId", "itemId", "transactionId", "transactionReference", "evidenceId", "sourceEvidenceId",
  "listingId", "externalListingId", "sale_id", "item_id", "transaction_id", "evidence_id",
  "source_evidence_id", "sourceIdentity", "source_identity", "notes"
]);

const LINEAGE_LINK_KEYS = new Set(["supportingSourceUrls", "windowSourceUrls", "sourceUrls"]);
const LINEAGE_SALE_KEYS = new Set(["earliestSaleDate", "latestSaleDate", "windowSales", "supportingSales", "sales"]);

const STRICT_WITHHELD_ROUTES = [/^\/api\/v1\/portfolio$/];

const PROVIDER = /card[\s_-]*sight/i;
const PROVIDER_GLOBAL = /card[\s_-]*sight/gi;
const PROVIDER_COMPACT = /cardsight/;
const ENUM_LIKE = /^[A-Z0-9_.:-]+$/;
const EMBEDDED_TOKEN = /\bCARD[_-]?SIGHT((?:_[A-Z0-9]+)+)\b/g;

const ENUM_LABELS = Object.freeze({
  CARDSIGHT: "DATA_PROVIDER",
  CARDSIGHT_EBAY: NEUTRAL_SOURCE_LABEL,
  CARDSIGHT_COMPLETED_SALE: NEUTRAL_SOURCE_LABEL,
  CARDSIGHT_SOLD: NEUTRAL_SOURCE_LABEL,
  CARDSIGHT_LIVE_REFERENCE: "Live reported completed sale (data provider, not stored)",
  CARDSIGHT_STORED_HISTORY_NOT_RETAINED: "PROVIDER_STORED_HISTORY_NOT_RETAINED",
  CARDSIGHT_MEMORY_ONLY_V1: "PROVIDER_MEMORY_ONLY_V1",
  CARDSIGHT_SUSPENDED_V1: "PROVIDER_SUSPENDED_V1",
  CARDSIGHT_VALIDATION_LEGACY_STORED_HISTORY: "VALIDATION_ONLY"
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerText(text) {
  if (typeof text !== "string") return false;
  const compact = text.toLowerCase().replace(/[\s_-]+/g, "");
  return PROVIDER_COMPACT.test(compact);
}

function providerMetadata(text) {
  return typeof text === "string" &&
    (text.includes("CardSightSaaSAutoEvidence") || /provider-qualified card[\s_-]*sight completed-sale/i.test(text));
}

function providerSourced(object) {
  for (const key of SOURCE_KEYS) {
    if (providerText(object[key])) return true;
  }
  return providerMetadata(object.notes);
}

function providerLineage(object) {
  return Object.prototype.hasOwnProperty.call(object, "supportingSourceUrls") ||
    Object.prototype.hasOwnProperty.call(object, "windowSourceUrls") ||
    Object.prototype.hasOwnProperty.call(object, "sourceLineageSha256");
}

function neutralKey(key) {
  if (!PROVIDER.test(key)) return key;
  const upperSnake = key === key.toUpperCase();
  return key.replace(PROVIDER_GLOBAL, (match, offset) =>
    upperSnake ? "PROVIDER" : offset === 0 ? "provider" : "Provider");
}

function neutralText(text) {
  if (typeof text !== "string" || !PROVIDER.test(text)) return text;
  const trimmed = text.trim();
  const mapped = ENUM_LABELS[trimmed.toUpperCase()];
  if (mapped) return mapped;
  if (ENUM_LIKE.test(trimmed)) {
    if (/^CARD[_-]?SIGHT_/i.test(trimmed)) {
      // CARDSIGHT_<X> source labels name a sale source; other tokens become PROVIDER_<X>.
      return /^CARD[_-]?SIGHT_(EBAY|SALE|SOLD|COMPLETED)/i.test(trimmed)
        ? NEUTRAL_SOURCE_LABEL
        : trimmed.replace(PROVIDER_GLOBAL, "PROVIDER");
    }
    return trimmed.replace(PROVIDER_GLOBAL, "PROVIDER");
  }
  let prose = text.replace(EMBEDDED_TOKEN, (token, suffix) => {
    const label = ENUM_LABELS[token];
    return label && ENUM_LIKE.test(label) ? label : `PROVIDER${suffix}`;
  });
  prose = prose.replace(PROVIDER_GLOBAL, "data provider");
  prose = prose.replace(/data provider's/g, "the data provider's").replace(/the the data provider/g, "the data provider");
  if (prose.startsWith("data provider")) prose = `Data provider${prose.slice("data provider".length)}`;
  return prose;
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isObject(value)) {
    const withheld = providerSourced(value);
    const lineage = providerLineage(value);
    let removed = false;
    const out = {};
    for (const key of Object.keys(value)) {
      if (withheld && SALE_LEVEL_KEYS.has(key)) {
        removed = true;
        continue;
      }
      if (LINEAGE_LINK_KEYS.has(key) || (lineage && LINEAGE_SALE_KEYS.has(key))) {
        removed = true;
        continue;
      }
      out[neutralKey(key)] = sanitizeValue(value[key]);
    }
    if (removed) out.saleDetailsWithheld = true;
    return out;
  }
  return neutralText(value);
}

/** Rule 3: evidence pages lose provider rows entirely, before field-level withholding runs. */
function dropEvidenceRows(data) {
  if (!isObject(data)) return;
  const droppedIds = new Set();
  for (const key of ["linkedEvidence", "manualCandidates"]) {
    if (!Array.isArray(data[key])) continue;
    const kept = [];
    for (const row of data[key]) {
      if (isObject(row) && providerSourced(row)) {
        if (row.id !== undefined && row.id !== null) droppedIds.add(String(row.id));
        continue;
      }
      kept.push(row);
    }
    if (kept.length !== data[key].length) data.providerRowsWithheld = true;
    data[key] = kept;
  }
  for (const key of Object.keys(data)) {
    if (/^live[\s_-]*card[\s_-]*sight/i.test(key)) {
      delete data[key];
      data.providerRowsWithheld = true;
    }
  }
  if (Array.isArray(data.timeline) && droppedIds.size) {
    for (const entry of data.timeline) {
      if (isObject(entry) && entry.referenceId !== undefined && entry.referenceId !== null &&
          droppedIds.has(String(entry.referenceId))) {
        entry.referenceId = null;
      }
    }
  }
}

function countOf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Rule 5 (old-build strict mode). Walks every object: an object that looks like an opportunity evidence summary,
 * a portfolio reference value, an outcome checkpoint, a value-intelligence block or a discover evidence block has its
 * single-sale aggregates and sale-date/marketplace details withheld.
 */
function strictWithhold(value) {
  if (Array.isArray(value)) {
    value.forEach(strictWithhold);
    return;
  }
  if (!isObject(value)) return;

  let withheld = false;
  const nullify = (key) => {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== null) {
      value[key] = null;
      withheld = true;
    }
  };

  // Opportunity evidence summary (dashboard, opportunities, compare, opportunity detail).
  if (Object.prototype.hasOwnProperty.call(value, "acceptedSales") ||
      Object.prototype.hasOwnProperty.call(value, "priceIndependentlyVerified")) {
    ["averagePrice", "earliestSaleDate", "latestSaleDate", "marketplaces"].forEach(nullify);
  }
  // Portfolio reference value.
  if (Object.prototype.hasOwnProperty.call(value, "referenceValue") && isObject(value.referenceValue)) {
    const reference = value.referenceValue;
    for (const key of ["valueCents", "earliestSaleDate", "latestSaleDate", "marketplaces"]) {
      if (Object.prototype.hasOwnProperty.call(reference, key) && reference[key] !== null) {
        reference[key] = null;
        reference.saleDetailsWithheld = true;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "referencePerformance") && isObject(value.referencePerformance)) {
    if (value.referencePerformance.referenceValueCents !== undefined && value.referencePerformance.referenceValueCents !== null) {
      value.referencePerformance.referenceValueCents = null;
      value.referencePerformance.saleDetailsWithheld = true;
    }
  }
  // Outcome checkpoint built on one window sale.
  // (The change percent against the decision-time value would let the one sale's price be recomputed.)
  if (countOf(value.windowSaleCount) === 1 ||
      (isObject(value.provenance) && countOf(value.provenance.windowSaleCount) === 1)) {
    ["observedSupportedValueCents", "supportedValueChangePercent", "supportedValueChangeCents"].forEach(nullify);
  }
  // Value intelligence built on one analog sale.
  if (countOf(value.analogCompletedSaleCount) === 1) {
    ["referenceLowCents", "referenceMidpointCents", "referenceHighCents"].forEach(nullify);
  }
  // Discover evidence built on one trusted sale.
  if (countOf(value.trustedExactCompletedSaleCount) === 1) nullify("trustedEvidenceValueCents");
  // Any remaining sale-date pair from stored history.
  if (Object.prototype.hasOwnProperty.call(value, "acceptedExactCompletedSales")) {
    ["earliestSaleDate", "latestSaleDate"].forEach(nullify);
  }

  if (withheld) value.saleDetailsWithheld = true;
  for (const key of Object.keys(value)) strictWithhold(value[key]);
}

/**
 * Filters one backend JSON body. Returns { ok: true, payload } with a sanitized deep copy; { ok: false } when the body
 * is not a JSON object (the caller returns its generic error); or { ok: false, withheld: true } when a pre-containment
 * build answered a route that strict mode withholds entirely (the caller returns a temporary-unavailable error).
 */
function filterBackendPayload(payload, options = {}) {
  if (!isObject(payload)) return { ok: false };
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(payload));
  } catch (_) {
    return { ok: false };
  }
  const path = String(options.path || "");
  // Portfolio reference values and their totals are averages of stored provider sales on a pre-containment build;
  // nulling them field by field would leave coverage totals that still reveal them, so the page is withheld.
  if (options.strict && STRICT_WITHHELD_ROUTES.some(pattern => pattern.test(path))) {
    return { ok: false, withheld: true };
  }
  if (/^\/api\/v1\/evidence\//.test(path)) dropEvidenceRows(copy.data);
  if (options.strict) strictWithhold(copy.data);
  const sanitized = sanitizeValue(copy);
  if (isObject(sanitized.meta)) {
    sanitized.meta.gatewayDisclosureFilter = VERSION;
    sanitized.meta.gatewayDisclosureMode = options.strict ? "STRICT_PRE_CONTAINMENT" : "STANDARD";
  }
  return { ok: true, payload: sanitized };
}

/** Every remaining disclosure violation, as JSON paths. Empty means clean. Used by the validators. */
function violations(payload) {
  const out = [];
  (function collect(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, `${path}[${index}]`));
      return;
    }
    if (isObject(value)) {
      const providerRow = providerSourced(value);
      const lineage = providerLineage(value);
      for (const key of Object.keys(value)) {
        const child = value[key];
        const childPath = `${path}.${key}`;
        if (PROVIDER.test(key)) out.push(`${childPath} (provider name in key)`);
        const present = child !== null && child !== undefined && child !== "" &&
          !(Array.isArray(child) && child.length === 0);
        if (present && (LINEAGE_LINK_KEYS.has(key) || (lineage && LINEAGE_SALE_KEYS.has(key)))) {
          out.push(`${childPath} (sale-level field on a provider sale lineage)`);
        }
        if (present && providerRow && SALE_LEVEL_KEYS.has(key)) {
          out.push(`${childPath} (sale-level field on a provider-sourced row)`);
        }
        collect(child, childPath);
      }
      return;
    }
    if (typeof value === "string" && PROVIDER.test(value)) out.push(`${path} (provider name in value)`);
  })(payload, "$");
  return out;
}

/**
 * A response comes from a containment-aware build only when its own envelope says the serving process verified the
 * database storage guard. Pre-containment builds never send the field, so they are always filtered strictly.
 */
function containmentAwareMeta(meta) {
  return isObject(meta) && meta.evidenceStorageGuard === "VERIFIED" &&
    typeof meta.providerEvidenceMode === "string" && meta.providerEvidenceMode.length > 0;
}

module.exports = {
  VERSION,
  filterBackendPayload,
  violations,
  containmentAwareMeta,
  neutralText,
  neutralKey
};
