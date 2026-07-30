const SAFE_TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const STAGING_CONTEXTS = new Set(["deploy-preview", "branch-deploy", "dev"]);
const MEMBERSHIP_FIELDS = new Set(["access", "tenantId"]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return clean(value).toLowerCase();
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBoolean(name, value, findings) {
  const raw = lower(value);
  if (!raw) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  findings.push({ level: "error", code: `${name}_INVALID`, message: `${name} must be true or false.` });
  return false;
}

function optionalInteger(name, value, minimum, maximum, findings) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) {
    findings.push({ level: "error", code: `${name}_INVALID`, message: `${name} must be an integer.` });
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    findings.push({ level: "error", code: `${name}_OUT_OF_RANGE`, message: `${name} must be between ${minimum} and ${maximum}.` });
    return null;
  }
  return parsed;
}

function httpsUrl(name, value, findings) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
      throw new Error("unsafe URL");
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch (_) {
    findings.push({ level: "error", code: `${name}_INVALID`, message: `${name} must be an HTTPS URL without credentials or a fragment.` });
    return null;
  }
}

function membershipMetadata(document) {
  if (!plainObject(document)) return null;
  if (plainObject(document.clientContext?.user?.app_metadata)) return document.clientContext.user.app_metadata;
  if (plainObject(document.user?.app_metadata)) return document.user.app_metadata;
  if (plainObject(document.app_metadata)) return document.app_metadata;
  return document;
}

export function validateSignedMembership(document) {
  const metadata = membershipMetadata(document);
  if (!plainObject(metadata)) {
    return { ok: false, code: "APP_METADATA_REQUIRED", message: "A signed app_metadata object is required." };
  }

  const membership = metadata.flipforge;
  if (!plainObject(membership)) {
    return { ok: false, code: "TENANT_MEMBERSHIP_REQUIRED", message: "app_metadata.flipforge is required." };
  }

  const unknownFields = Object.keys(membership).filter(key => !MEMBERSHIP_FIELDS.has(key));
  if (unknownFields.length) {
    return {
      ok: false,
      code: "TENANT_MEMBERSHIP_FIELDS_INVALID",
      message: `Unsupported membership fields: ${unknownFields.sort().join(", ")}.`
    };
  }

  const access = lower(membership.access);
  if (access !== "active") {
    return { ok: false, code: "TENANT_MEMBERSHIP_INACTIVE", message: "Membership access must be active." };
  }

  const tenantId = clean(membership.tenantId);
  if (!SAFE_TENANT_ID.test(tenantId)) {
    return {
      ok: false,
      code: "TENANT_MEMBERSHIP_INVALID",
      message: "tenantId must contain 3-128 safe letters, numbers, dots, underscores, colons, or hyphens."
    };
  }

  return {
    ok: true,
    code: "TENANT_MEMBERSHIP_VALID",
    tenantId,
    access: "active",
    canonical: { app_metadata: { flipforge: { access: "active", tenantId } } }
  };
}

export function inspectStagingEnvironment(environment = {}) {
  const findings = [];
  const context = lower(environment.CONTEXT);
  const stagingContext = STAGING_CONTEXTS.has(context);
  const productionContext = context === "production";
  if (!context) {
    findings.push({ level: "warning", code: "CONTEXT_MISSING", message: "CONTEXT is not set." });
  } else if (!stagingContext && !productionContext) {
    findings.push({ level: "error", code: "CONTEXT_INVALID", message: "CONTEXT must be deploy-preview, branch-deploy, dev, or production." });
  }

  const bridgeEnabled = parseBoolean("FLIPFORGE_API_BRIDGE_ENABLED", environment.FLIPFORGE_API_BRIDGE_ENABLED, findings);
  const previewBypass = parseBoolean(
    "FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW",
    environment.FLIPFORGE_API_ALLOW_UNAUTHENTICATED_PREVIEW,
    findings
  );
  const baseUrl = httpsUrl("FLIPFORGE_API_BASE_URL", environment.FLIPFORGE_API_BASE_URL, findings);
  const tokenPresent = Boolean(clean(environment.FLIPFORGE_API_SERVICE_TOKEN));
  const previewTenantId = clean(environment.FLIPFORGE_API_PREVIEW_TENANT_ID);

  if (productionContext && bridgeEnabled) {
    findings.push({ level: "error", code: "PRODUCTION_BRIDGE_ENABLED", message: "Production bridge activation is not permitted by this readiness pack." });
  }
  if (productionContext && previewBypass) {
    findings.push({ level: "error", code: "PRODUCTION_PREVIEW_BYPASS", message: "Production cannot allow unauthenticated preview access." });
  }
  if (previewBypass && !stagingContext) {
    findings.push({ level: "error", code: "PREVIEW_BYPASS_CONTEXT_INVALID", message: "Preview bypass is limited to non-production staging contexts." });
  }
  if (previewBypass && !SAFE_TENANT_ID.test(previewTenantId)) {
    findings.push({ level: "error", code: "PREVIEW_TENANT_INVALID", message: "A safe preview tenant is required when preview bypass is enabled." });
  }
  if (!previewBypass && previewTenantId) {
    findings.push({ level: "warning", code: "PREVIEW_TENANT_UNUSED", message: "A preview tenant is set while preview bypass is disabled." });
  }
  if (Boolean(baseUrl) !== tokenPresent) {
    findings.push({ level: "error", code: "UPSTREAM_PAIR_INCOMPLETE", message: "The upstream base URL and service token must be configured together." });
  }

  const allowedOrigins = clean(environment.FLIPFORGE_API_ALLOWED_ORIGINS)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    if (origin.includes("*")) {
      findings.push({ level: "error", code: "ALLOWED_ORIGIN_WILDCARD", message: "Allowed origins cannot contain wildcards." });
      continue;
    }
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) {
        throw new Error("unsafe origin");
      }
    } catch (_) {
      findings.push({ level: "error", code: "ALLOWED_ORIGIN_INVALID", message: "Every allowed origin must be an exact HTTPS origin." });
    }
  }

  const timeoutMs = optionalInteger("FLIPFORGE_API_TIMEOUT_MS", environment.FLIPFORGE_API_TIMEOUT_MS, 1, 10_000, findings);
  const maxResponseBytes = optionalInteger(
    "FLIPFORGE_API_MAX_RESPONSE_BYTES",
    environment.FLIPFORGE_API_MAX_RESPONSE_BYTES,
    1,
    1_000_000,
    findings
  );
  const maxRequestBytes = optionalInteger(
    "FLIPFORGE_API_MAX_REQUEST_BYTES",
    environment.FLIPFORGE_API_MAX_REQUEST_BYTES,
    1,
    65_536,
    findings
  );

  const errors = findings.filter(item => item.level === "error");
  const warnings = findings.filter(item => item.level === "warning");
  const upstreamConfigured = Boolean(baseUrl && tokenPresent);

  return {
    safe: errors.length === 0,
    readyToActivateStaging: errors.length === 0 && stagingContext && upstreamConfigured && !bridgeEnabled,
    stagingActive: errors.length === 0 && stagingContext && upstreamConfigured && bridgeEnabled,
    productionDisabled: !productionContext || !bridgeEnabled,
    summary: {
      context: context || "unset",
      stagingContext,
      productionContext,
      bridgeEnabled,
      upstreamBaseUrlConfigured: Boolean(baseUrl),
      serviceTokenConfigured: tokenPresent,
      allowedOriginCount: allowedOrigins.length,
      previewBypass,
      previewTenantConfigured: Boolean(previewTenantId),
      timeoutMs,
      maxResponseBytes,
      maxRequestBytes
    },
    findings,
    errors,
    warnings
  };
}

export function redactedReadinessReport(environment = {}) {
  const report = inspectStagingEnvironment(environment);
  return {
    safe: report.safe,
    readyToActivateStaging: report.readyToActivateStaging,
    stagingActive: report.stagingActive,
    productionDisabled: report.productionDisabled,
    summary: report.summary,
    findings: report.findings
  };
}

export { SAFE_TENANT_ID, STAGING_CONTEXTS };
