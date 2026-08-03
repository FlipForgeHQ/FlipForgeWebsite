(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ENTITLEMENTS_PATH = "/api/v1/entitlements";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const APPROVED_PORTAL_HOSTS = new Set([
    "sandbox-customer-portal.paddle.com",
    "customer-portal.paddle.com"
  ]);

  let inFlight = false;
  let sequence = 0;

  function eligible() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""))
      && String(window.location.hash || "").startsWith("#/account");
  }

  function correlationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `billing-portal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function validatedPortalUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      if (parsed.protocol !== "https:") return null;
      if (parsed.username || parsed.password || parsed.hash || parsed.search) return null;
      if (!APPROVED_PORTAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;
      if (parsed.port && parsed.port !== "443") return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  function validEnvelope(payload, expectedCorrelationId) {
    const meta = payload?.meta;
    const data = payload?.data;
    return Boolean(meta && data)
      && meta.contractVersion === CONTRACT_VERSION
      && meta.authority === "Smart Opportunity"
      && meta.gradingAuthority === "Existing PSA intelligence"
      && meta.correlationId === expectedCorrelationId
      && data.kind === "entitlements"
      && data.readOnly === true
      && data.transactionAuthority === false;
  }

  function portalHandoff(payload) {
    const data = payload?.data || {};
    const portal = data.customerPortal || {};
    const url = validatedPortalUrl(portal.url);
    if (data.customerBillingManagementAllowed !== true
        || data.providerHostedSubscriptionManagementAvailable !== true
        || data.customerPlanChangeAllowed !== false
        || portal.available !== true
        || portal.provider !== "PADDLE"
        || portal.authentication !== "PADDLE_MAGIC_LINK"
        || portal.providerHosted !== true
        || portal.portalSessionTokenIncluded !== false
        || portal.portalLinksCachedByFlipForge !== false
        || portal.paymentCredentialsHandledByFlipForge !== false
        || portal.billingChangesAppliedByFlipForge !== false
        || portal.transactionAuthority !== false
        || !url) {
      return null;
    }
    return {
      url,
      environment: portal.environment === "SANDBOX" ? "SANDBOX" : portal.environment === "LIVE" ? "LIVE" : "UNKNOWN"
    };
  }

  async function fetchPortalHandoff() {
    const requestCorrelationId = correlationId();
    const response = await fetch(ENTITLEMENTS_PATH, {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": requestCorrelationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("PORTAL_RESPONSE_TOO_LARGE");
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error("PORTAL_INVALID_JSON");
    }
    if (!response.ok || !validEnvelope(payload, requestCorrelationId)) throw new Error("PORTAL_CONTRACT_INVALID");
    return portalHandoff(payload);
  }

  function renderPortal(root, handoff) {
    root.querySelector("[data-paddle-customer-portal]")?.remove();
    if (!handoff) return;

    const environmentCopy = handoff.environment === "SANDBOX"
      ? "This preview opens Paddle's sandbox customer portal."
      : "This opens Paddle's hosted customer portal.";
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("data-paddle-customer-portal", "true");
    panel.innerHTML = `<header class="panel-header"><div><h2>Billing management</h2><p>Manage billing through Paddle's provider-hosted customer portal.</p></div><span class="staging-status staging-status-${handoff.environment === "SANDBOX" ? "warn" : "ok"}">${escapeHtml(handoff.environment === "SANDBOX" ? "Sandbox portal" : "Paddle portal")}</span></header><div class="panel-body"><div class="customer-entitlement-safety"><strong>Payment details stay outside FlipForge.</strong><p>${escapeHtml(environmentCopy)} Paddle handles portal authentication, billing history, payment-method updates, and subscription-management actions. FlipForge changes paid access only after a verified Paddle subscription webhook.</p><a class="button button-primary" href="${escapeHtml(handoff.url)}" data-paddle-portal-link>Manage billing with Paddle</a></div></div>`;

    const summary = root.querySelector(".customer-entitlement-summary");
    if (summary) summary.insertAdjacentElement("afterend", panel);
    else root.appendChild(panel);
  }

  async function enhance() {
    if (!eligible() || inFlight) return;
    const root = document.querySelector(".customer-entitlements-page");
    if (!root || root.dataset.paddlePortalEnhancing === "true") return;
    const currentSequence = ++sequence;
    root.dataset.paddlePortalEnhancing = "true";
    inFlight = true;
    try {
      const handoff = await fetchPortalHandoff();
      if (currentSequence !== sequence || !eligible() || !root.isConnected) return;
      renderPortal(root, handoff);
    } catch (_) {
      if (currentSequence === sequence && root.isConnected) {
        root.querySelector("[data-paddle-customer-portal]")?.remove();
      }
    } finally {
      delete root.dataset.paddlePortalEnhancing;
      inFlight = false;
    }
  }

  function schedule() {
    window.setTimeout(enhance, 0);
  }

  window.addEventListener("hashchange", () => {
    sequence++;
    schedule();
  });
  const observer = new MutationObserver(() => {
    if (eligible() && document.querySelector(".customer-entitlements-page:not([data-paddle-portal-enhancing='true'])")) {
      schedule();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedule();

  window.FlipForgeCustomerBillingPortal = {
    validatedPortalUrl,
    portalHandoff
  };
})();
