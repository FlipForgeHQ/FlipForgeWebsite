// FlipForge public access actions (desktop nav, mobile menu, footer).
//
// Trust model:
// - The static page is ALWAYS the signed-out experience: "Request Beta Access" plus "Already invited? Sign in".
// - The Netlify Identity session cookie is only a hint that it is worth asking the server. It never decides anything.
// - The decision comes from one same-origin request to the gateway (/api/v1/entitlements), which verifies the
//   session server-side and resolves membership from Netlify-signed app metadata. Browser storage is never read.
// - 200 (verified active membership)                          -> "Open Dashboard"
// - 403 with a membership/admission code (signed in, not active) -> "Check Access Status" (status page, not the app)
// - anything else (401, other 403, 5xx, network, timeout)     -> stays signed-out
// - At most one request per page view, kept in memory only. No email address is ever sent or looked up.
// - A verified state also shows "Sign out", which hands off to the sign-in page's existing Identity logout.
(() => {
  "use strict";

  const ENTITLEMENTS_PATH = "/api/v1/entitlements";
  const DASHBOARD_URL = "/app/beta/#/dashboard";
  const STATUS_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
  const REQUEST_TIMEOUT_MS = 6000;
  const PENDING_CODES = new Set(["TENANT_MEMBERSHIP_REQUIRED", "TENANT_MEMBERSHIP_INACTIVE", "ENTITLEMENT_ACCESS_DENIED"]);
  const COPY = {
    member: { label: "Open Dashboard", aria: "Open your FlipForge dashboard", href: DASHBOARD_URL, footer: "Open Dashboard" },
    pending: { label: "Check Access Status", aria: "Check your FlipForge Private Beta access status", href: STATUS_URL, footer: "Check Access Status" }
  };

  // Invitation, recovery and confirmation links are owned by the activation flow on the homepage.
  const TOKEN_HASH = /(?:^|[#&])(?:invite_token|recovery_token|confirmation_token|email_change_token|access_token)=/;

  let verification = null;

  function sessionHint() {
    try {
      return /(?:^|;\s*)nf_(?:jwt|refresh)=/.test(document.cookie || "");
    } catch (_) {
      return false;
    }
  }

  async function verifyServerSession() {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : 0;
    try {
      const correlationId = window.crypto?.randomUUID?.() || `public-access-${Date.now()}`;
      const response = await fetch(ENTITLEMENTS_PATH, {
        method: "GET",
        headers: { Accept: "application/json", "X-Correlation-Id": correlationId },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller ? controller.signal : undefined
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 200) {
        return payload && typeof payload === "object" && payload.data && typeof payload.data === "object" ? "member" : "signed-out";
      }
      if (response.status === 403) {
        return PENDING_CODES.has(String(payload?.error?.code || "")) ? "pending" : "signed-out";
      }
      return "signed-out";
    } catch (_) {
      return "signed-out";
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function verifiedState() {
    if (!verification) verification = verifyServerSession();
    return verification;
  }

  // Signing out happens on the sign-in page, which owns the Identity client and its logout. This page only records a
  // one-time intent in this tab so that page can tell a real click from a link planted on another site.
  const SIGN_OUT_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start&signout=1";
  function requestSignOut(event) {
    event.preventDefault();
    try {
      window.sessionStorage.setItem("flipforge.signOutIntent", window.crypto?.randomUUID?.() || String(Date.now()));
    } catch (_) {
      // Without the intent the sign-in page shows its own Sign out button instead.
    }
    window.location.assign(SIGN_OUT_URL);
  }

  function applyGroup(group, state) {
    const copy = COPY[state];
    if (!copy) return;
    const primary = group.querySelector("[data-ff-access-primary]");
    const signIn = group.querySelector("[data-ff-access-sign-in]");
    if (primary) {
      primary.textContent = copy.label;
      primary.setAttribute("href", copy.href);
      primary.setAttribute("aria-label", copy.aria);
      primary.removeAttribute("aria-current");
    }
    if (signIn) signIn.hidden = true;
    if (!group.querySelector("[data-ff-access-sign-out]")) {
      const signOut = document.createElement("button");
      signOut.type = "button";
      signOut.className = "ff-access-signout";
      signOut.setAttribute("data-ff-access-sign-out", "");
      signOut.setAttribute("aria-label", "Sign out of FlipForge");
      signOut.textContent = "Sign out";
      signOut.addEventListener("click", requestSignOut);
      if (group.getAttribute("data-ff-access") === "mobile") group.appendChild(signOut);
      else group.insertBefore(signOut, primary || null);
    }
    group.setAttribute("data-ff-access-state", state);
  }

  function applyFooter(link, state) {
    const copy = COPY[state];
    if (!copy) return;
    link.textContent = copy.footer;
    link.setAttribute("href", copy.href);
    link.setAttribute("aria-label", copy.aria);
  }

  async function upgrade() {
    const groups = [...document.querySelectorAll("[data-ff-access]")];
    const footers = [...document.querySelectorAll("[data-ff-access-footer]")];
    if (!groups.length && !footers.length) return;
    if (TOKEN_HASH.test(String(window.location.hash || ""))) return;
    if (!sessionHint()) return;

    const state = await verifiedState();
    if (state !== "member" && state !== "pending") return;
    // Re-query: other shell scripts may have re-rendered the navigation while the request was in flight.
    document.querySelectorAll("[data-ff-access]").forEach(group => applyGroup(group, state));
    document.querySelectorAll("[data-ff-access-footer]").forEach(link => applyFooter(link, state));
    document.documentElement.setAttribute("data-ff-access-verified", state);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", upgrade, { once: true });
  else upgrade();
})();
