(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const PRODUCTION_AUTH_LINK = 'a[href^="/production-auth.html"],a[href*="goflipforge.com/production-auth.html"]';
  const SIGN_IN_ID = "ff-customer-sign-in-entry";
  const STYLE_ID = "ff-customer-sign-in-entry-style";
  let authoritativeAuthenticationDenied = false;
  let fetchObserved = false;

  function eligibleHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function fullCustomerSurface() {
    return eligibleHost() && FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  }

  function currentUser() {
    try {
      return window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getUser === "function"
        ? window.FlipForgeIdentity.getUser()
        : null;
    } catch (_) {
      return null;
    }
  }

  function productionAuthUrl() {
    const pathname = String(window.location.pathname || "/app/");
    const normalizedPath = pathname === "/app/customer" ? "/app/customer/"
      : pathname === "/app" ? "/app/"
      : pathname;
    const returnPath = `${normalizedPath}${window.location.search}${window.location.hash || "#/account"}`;
    const params = new URLSearchParams({ return: returnPath });
    if (authoritativeAuthenticationDenied && currentUser()) params.set("reauth", "1");
    return `/production-auth.html?${params.toString()}`;
  }

  function protectedApiPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || String(input || "");
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin && /^\/api\/v1\//.test(url.pathname) && url.pathname !== "/api/v1/health";
    } catch (_) {
      return false;
    }
  }

  function recordAuthoritativeResponse(input, response) {
    if (!fullCustomerSurface() || !protectedApiPath(input) || !response) return;
    if (response.status === 401) {
      authoritativeAuthenticationDenied = true;
      ensureSignInControl();
      window.dispatchEvent(new CustomEvent("flipforge:auth-required", { detail: { status: 401 } }));
      return;
    }
    if (response.ok && authoritativeAuthenticationDenied) {
      authoritativeAuthenticationDenied = false;
      ensureSignInControl();
    }
  }

  function installAuthoritativeAuthObserver() {
    if (!fullCustomerSurface() || fetchObserved || typeof window.fetch !== "function") return;
    fetchObserved = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      recordAuthoritativeResponse(args[0], response);
      return response;
    };
  }

  function ensureSignInStyles() {
    if (!fullCustomerSurface() || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${SIGN_IN_ID}{position:fixed;right:18px;bottom:18px;z-index:2147482000;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 16px;border:1px solid #d4af37;border-radius:10px;background:#d4af37;color:#030812;font:800 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none;box-shadow:0 14px 42px rgba(0,0,0,.42)}
#${SIGN_IN_ID}:hover,#${SIGN_IN_ID}:focus-visible{background:#e6c85d;border-color:#e6c85d;outline:3px solid rgba(212,175,55,.22);outline-offset:2px}
#${SIGN_IN_ID}[hidden]{display:none!important}
@media(max-width:760px){#${SIGN_IN_ID}{left:12px;right:12px;bottom:12px;width:auto;min-height:48px}}
`;
    document.head.appendChild(style);
  }

  function ensureSignInControl() {
    if (!fullCustomerSurface()) return null;
    ensureSignInStyles();
    let link = document.getElementById(SIGN_IN_ID);
    if (!link) {
      link = document.createElement("a");
      link.id = SIGN_IN_ID;
      link.dataset.ffCustomerSignIn = "";
      link.setAttribute("aria-label", "Sign in to FlipForge and return to this page");
      document.body.appendChild(link);
    }
    const staleAuthenticatedSession = authoritativeAuthenticationDenied && Boolean(currentUser());
    const requiresSignIn = authoritativeAuthenticationDenied || !currentUser();
    link.textContent = staleAuthenticatedSession ? "Restore FlipForge sign in" : "Sign in to FlipForge";
    link.href = productionAuthUrl();
    link.hidden = !requiresSignIn;
    link.setAttribute("aria-hidden", requiresSignIn ? "false" : "true");
    link.dataset.ffAuthoritativeAuthDenied = authoritativeAuthenticationDenied ? "true" : "false";
    return link;
  }

  function initializeSignInControl() {
    if (!fullCustomerSurface()) return;
    installAuthoritativeAuthObserver();
    ensureSignInControl();
    window.addEventListener("hashchange", ensureSignInControl);
    window.addEventListener("popstate", ensureSignInControl);
    window.addEventListener("flipforge:identity-change", ensureSignInControl);
    window.setTimeout(ensureSignInControl, 250);
  }

  document.addEventListener("click", event => {
    if (!eligibleHost() || (currentUser() && !authoritativeAuthenticationDenied)) return;
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    const launcher = target.closest("[data-ff-production-toggle]");
    const authLink = target.closest(PRODUCTION_AUTH_LINK);
    if (!launcher && !authLink) return;

    // Keep every production sign-in handoff on the exact product surface the
    // user was using. A server 401 always outranks stale browser identity.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(productionAuthUrl());
  }, true);

  if (document.readyState === "loading") {
    installAuthoritativeAuthObserver();
    document.addEventListener("DOMContentLoaded", initializeSignInControl, { once: true });
  } else {
    initializeSignInControl();
  }
})();