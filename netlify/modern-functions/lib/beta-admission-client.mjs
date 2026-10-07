// Server-only client for the FlipForge2 private operator admission route.
//
// Used exclusively by the operator-role-gated Owner Hub function (/api/beta/operator) to reserve a
// Controlled Pro Beta seat before an invitation email is sent and to release it when an invitation is
// cancelled. It reuses the existing private service settings (FLIPFORGE_API_BASE_URL and
// FLIPFORGE_API_SERVICE_TOKEN), never sends the customer tenant header, and fails closed: any missing
// configuration, network error or unexpected response becomes BETA_ADMISSION_UNAVAILABLE and the caller
// must not send the invitation.
//
// A reserved seat grants no access by itself. The tester's Identity still carries only the
// terms-pending role until activation and Beta Terms acceptance.

export const ADMISSION_ROUTE = "/api/v1/operator/controlled-pro-beta/admissions";
export const OPERATOR_HEADER = "X-FlipForge-Operator-Id";
const SAFE_OPERATOR = /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,99}$/;
const SAFE_TENANT = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const DEFAULT_TIMEOUT_MS = 8000;

export class BetaAdmissionError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "BetaAdmissionError";
    this.details = details;
  }
}

export function admissionOperatorId(user) {
  const id = String(user?.id || user?.sub || "").trim().toLowerCase();
  const candidate = id ? `owner-hub:${id}` : "owner-hub";
  return SAFE_OPERATOR.test(candidate) ? candidate : "owner-hub";
}

export function createAdmissionClient({
  fetchFn = globalThis.fetch,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  correlationId = () => globalThis.crypto?.randomUUID?.() || `owner-hub-${Date.now()}`,
} = {}) {
  async function call(action, tenantId, operatorId) {
    const baseUrl = String(env.FLIPFORGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
    const token = String(env.FLIPFORGE_API_SERVICE_TOKEN || "").trim();
    if (!baseUrl || !token) throw new BetaAdmissionError("BETA_ADMISSION_UNAVAILABLE", { cause: "NOT_CONFIGURED" });
    if (!SAFE_TENANT.test(String(tenantId || ""))) throw new BetaAdmissionError("BETA_ADMISSION_UNAVAILABLE", { cause: "TENANT_INVALID" });
    const operator = SAFE_OPERATOR.test(String(operatorId || "")) ? operatorId : "owner-hub";

    let response;
    try {
      response = await fetchFn(`${baseUrl}${ADMISSION_ROUTE}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
          [OPERATOR_HEADER]: operator,
          "X-Correlation-Id": correlationId(),
        },
        body: JSON.stringify({ action, tenantId }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new BetaAdmissionError("BETA_ADMISSION_UNAVAILABLE", { cause: "NETWORK" });
    }

    const payload = await response.json().catch(() => null);
    const code = payload?.error?.code || "";
    if (response.status === 409 && code === "CONTROLLED_PRO_BETA_CAPACITY_REACHED") {
      throw new BetaAdmissionError("BETA_FULL", {
        admittedCount: Number.isInteger(payload?.error?.admittedCount) ? payload.error.admittedCount : null,
        maxTenants: Number.isInteger(payload?.error?.maxTenants) ? payload.error.maxTenants : null,
      });
    }
    if (!response.ok || !payload || payload.accessGranted !== false) {
      throw new BetaAdmissionError("BETA_ADMISSION_UNAVAILABLE", { cause: code || `HTTP_${response.status}` });
    }
    return {
      gateEnabled: payload.gateEnabled === true,
      admissionRequired: payload.admissionRequired !== false,
      created: payload.created === true,
      changed: payload.changed === true,
      found: payload.found !== false,
      admittedCount: Number.isInteger(payload.admittedCount) ? payload.admittedCount : null,
      maxTenants: Number.isInteger(payload.maxTenants) ? payload.maxTenants : null,
      status: payload.admission?.status || null,
      tenantAuditKey: payload.admission?.tenantAuditKey || null,
    };
  }

  return {
    admit: (tenantId, operatorId) => call("admit", tenantId, operatorId),
    revoke: (tenantId, operatorId) => call("revoke", tenantId, operatorId),
    status: (tenantId, operatorId) => call("status", tenantId, operatorId),
  };
}
