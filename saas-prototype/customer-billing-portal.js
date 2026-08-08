(() => {
  "use strict";

  const CONTRACT_VERSION = "1.0";
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ENTITLEMENTS_PATH = "/api/v1/entitlements";
  const MAX_RESPONSE_CHARACTERS = 1_000_000;
  const MAX_PORTAL_TOKEN_CHARACTERS = 4096;
  const SANDBOX_PORTAL_HOST = "sandbox-customer-portal.paddle.com";
  const LIVE_PORTAL_HOST = "customer-portal.paddle.com";
  const APPROVED_PORTAL_HOSTS = new Set([SANDBOX_PORTAL_HOST, LIVE_PORTAL_HOST]);
  const LEGACY_AUTHENTICATION = "PADDLE_MAGIC_LINK";
  const SESSION_AUTHENTICATION = "PADDLE_AUTHENTICATED_SESSION";

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
      if (parsed.username || parsed.password || parsed.hash) return null;
      if (!APPROVED_PORTAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;
      if (parsed.port && parsed.port !== "443") return null;

      // The previously shipped magic-link handoff has no authenticated query token.
      if (!parsed.search) return parsed.href;

      // Authenticated Paddle sessions are short-lived tokenized /cpl_... URLs.
      if (!/^\/cpl_[a-z0-9]{26}$/.test(parsed.pathname)) return null;
      if (parsed.searchParams.getAll("action").length !== 1
          || parsed.searchParams.get("action") !== "overview") return null;
      if (parsed.searchParams.getAll("token").length !== 1) return null;
      const token = String(parsed.searchParams.get("token") || "");
      if (!token || token.length > MAX_PORTAL_TOKEN_CHARACTERS || /\s/.test(token)) return null;
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
    if (!url) return null;
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const expectedEnvironment = host === SANDBOX_PORTAL_HOST ? "SANDBOX" : host === LIVE_PORTAL_HOST ? "LIVE" : null;
    const authenticatedSession = portal.authentication === SESSION_AUTHENTICATION;
    const legacyMagicLink = portal.authentication === LEGACY_AUTHENTICATION;
    if (!expectedEnvironment
        || portal.environment !== expectedEnvironment
        || data.customerBillingManagementAllowed !== true
        || data.providerHostedSubscriptionManagementAvailable !== true
        || data.customerPlanChangeAllowed !== false
        || portal.available !== true
        || portal.provider !== "PADDLE"
        || (!authenticatedSession && !legacyMagicLink)
        || portal.providerHosted !== true
        || portal.portalLinksCachedByFlipForge !== false
        || portal.paymentCredentialsHandledByFlipForge !== false
        || portal.billingChangesAppliedByFlipForge !== false
        || portal.transactionAuthority !== false) {
      return null;
    }

    if (authenticatedSession) {
      if (!parsed.search
          || portal.temporaryAuthenticatedUrl !== true
          || portal.portalSessionTokenIncluded !== true
          || portal.portalSessionTokenIncludedAsSeparateField !== false
          || portal.providerCustomerIdIncluded !== false
          || portal.providerApiKeyIncluded !== false
          || portal.verifiedWebhookRequiredForEntitlementChanges !== true) {
        return null;
      }
    } else if (parsed.search
        || portal.temporaryAuthenticatedUrl === true
        || portal.portalSessionTokenIncluded !== false) {
      return null;
    }

    return { url, environment: expectedEnvironment, authenticatedSession };
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
    panel.innerHTML = `<header class="panel-header"><div><h2>Billing management</h2><p>Manage billing through Paddle's provider-hosted customer portal.</p></div><span class="staging-status staging-status-${handoff.environment === "SANDBOX" ? "warn" : "ok"}">${escapeHtml(handoff.environment === "SANDBOX" ? "Sandbox portal" : "Paddle portal")}</span></header><div class="panel-body"><div class="customer-entitlement-safety"><strong>Payment details stay outside FlipForge.</strong><p>${escapeHtml(environmentCopy)} Paddle handles portal authentication, billing history, payment-method updates, and subscription-management actions. FlipForge changes paid access only after a verified Paddle subscription webhook.</p><a class="button button-primary" href="#" data-paddle-portal-link>Manage billing with Paddle</a></div></div>`;

    const link = panel.querySelector("[data-paddle-portal-link]");
    link?.addEventListener("click", async event => {
      event.preventDefault();
      if (link.dataset.portalOpening === "true") return;
      link.dataset.portalOpening = "true";
      link.setAttribute("aria-busy", "true");
      const originalText = link.textContent;
      link.textContent = "Opening Paddle…";
      try {
        // Always request a fresh handoff immediately before navigation. The tokenized
        // authenticated URL is never written into the DOM or local browser storage.
        const fresh = await fetchPortalHandoff();
        if (!fresh) throw new Error("PORTAL_HANDOFF_UNAVAILABLE");
        window.location.assign(fresh.url);
      } catch (_) {
        link.textContent = "Try billing management again";
        link.removeAttribute("aria-busy");
        delete link.dataset.portalOpening;
        window.setTimeout(() => {
          if (link.isConnected && link.dataset.portalOpening !== "true") link.textContent = originalText;
        }, 2500);
      }
    });

    const summary = root.querySelector(".customer-entitlement-summary");
    if (summary) summary.insertAdjacentElement("afterend", panel);
    else root.appendChild(panel);
  }

  async function enhance() {
    if (!eligible() || inFlight) return;
    const root = document.querySelector(".customer-entitlements-page");
    if (!root || root.dataset.paddlePortalEnhancing === "true" || root.dataset.paddlePortalEnhanced === "true") return;
    const currentSequence = ++sequence;
    root.dataset.paddlePortalEnhancing = "true";
    inFlight = true;
    try {
      const handoff = await fetchPortalHandoff();
      if (currentSequence !== sequence || !eligible() || !root.isConnected) return;
      renderPortal(root, handoff);
      root.dataset.paddlePortalEnhanced = "true";
    } catch (_) {
      if (currentSequence === sequence && root.isConnected) {
        root.querySelector("[data-paddle-customer-portal]")?.remove();
        root.dataset.paddlePortalEnhanced = "true";
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
    if (eligible() && document.querySelector(".customer-entitlements-page:not([data-paddle-portal-enhanced='true']):not([data-paddle-portal-enhancing='true'])")) {
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
