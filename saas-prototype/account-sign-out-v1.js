// One visible, consistent "Sign out" for the customer app shells (/app/beta and the customer shell).
//
// - Every [data-ff-sign-out] control (top bar, phone drawer, Account page) runs the same flow.
// - It uses the existing identity path only: window.FlipForgeIdentity.signOut() (Netlify Identity logout, which
//   ends the session and clears the secure session cookies). No new auth path.
// - After a successful sign-out it clears the per-account UI data this app keeps in browser storage, removes the
//   rendered workspace, tells other open tabs, and replaces the page with the sign-in page, so Back cannot return
//   to a rendered workspace (pages restored from the back/forward cache re-check the session before showing).
(() => {
  "use strict";

  const SIGNED_OUT_URL = "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start&signed_out=1";
  const BROADCAST_KEY = "flipforge.session.signedOutAt";
  // Per-account UI data lives under "flipforge." keys. Two keys are deliberately kept: an invited tester's pending
  // Beta Terms acceptance (finished after signing in again) and the device-level dashboard renderer preference.
  const KEEP_KEYS = ["flipforge.betaTerms.pending.v1", "flipforge.dashboard.renderer", BROADCAST_KEY];
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const loadedAt = Date.now();
  let busy = false;

  function clearAccountState() {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const keys = [];
        for (let index = 0; index < store.length; index += 1) keys.push(store.key(index));
        keys.filter(key => key && key.startsWith("flipforge.") && !KEEP_KEYS.includes(key)).forEach(key => store.removeItem(key));
      } catch (_) {
        // Storage can be unavailable (private mode); nothing was stored there either.
      }
    }
  }

  function removeWorkspace() {
    document.documentElement.classList.add("ff-private-beta-access-pending");
    const main = document.querySelector("#main-content");
    if (main) main.replaceChildren();
    window.__FlipForgePrivateBetaAccessVerified = false;
  }

  function signInUrl() {
    const hash = String(window.location.hash || "");
    return /^#\/[a-z][a-z0-9-]{0,40}(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]{0,127}){0,3}$/.test(hash)
      ? `/production-auth.html?return=${encodeURIComponent(`/app/beta/${hash}`)}`
      : "/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start";
  }

  function setControls(label, disabled) {
    document.querySelectorAll("[data-ff-sign-out]").forEach(control => {
      control.disabled = disabled;
      const text = control.querySelector(".ff-control-label, .ff-sign-out-label");
      if (text) text.textContent = label;
      else control.textContent = label;
    });
  }

  async function signOut() {
    if (busy) return;
    busy = true;
    setControls("Signing out…", true);
    try {
      const identity = window.FlipForgeIdentity;
      if (identity && typeof identity.signOut === "function") await identity.signOut();
    } catch (error) {
      busy = false;
      setControls("Sign out failed — retry", false);
      window.setTimeout(() => { if (!busy) setControls("Sign out", false); }, 3000);
      return;
    }
    clearAccountState();
    try { window.localStorage.setItem(BROADCAST_KEY, String(Date.now())); } catch (_) { /* other tabs re-check on their next request */ }
    removeWorkspace();
    window.location.replace(SIGNED_OUT_URL);
  }

  document.addEventListener("click", event => {
    const control = event.target instanceof Element ? event.target.closest("[data-ff-sign-out]") : null;
    if (!control) return;
    event.preventDefault();
    signOut();
  });

  // Another tab signed out: this tab drops the workspace at once and goes to sign-in (keeping its deep link).
  window.addEventListener("storage", event => {
    if (event.key !== BROADCAST_KEY || !event.newValue) return;
    removeWorkspace();
    window.location.replace(signInUrl());
  });

  // Back/forward cache: a restored page re-checks before anything is visible again.
  window.addEventListener("pageshow", async event => {
    if (!event.persisted) return;
    let signedOutAt = 0;
    try { signedOutAt = Number(window.localStorage.getItem(BROADCAST_KEY) || 0); } catch (_) { signedOutAt = 0; }
    if (signedOutAt > loadedAt) {
      removeWorkspace();
      window.location.replace(signInUrl());
      return;
    }
    if (!PRODUCTION_HOST.test(String(window.location.hostname || ""))) return;
    document.documentElement.classList.add("ff-private-beta-access-pending");
    try {
      const session = await window.FlipForgeIdentity?.refresh?.();
      const response = session?.authenticated
        ? await fetch("/api/v1/entitlements", { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", redirect: "error" })
        : null;
      if (response && response.ok) {
        document.documentElement.classList.remove("ff-private-beta-access-pending");
        return;
      }
    } catch (_) {
      // Fall through: fail closed.
    }
    removeWorkspace();
    window.location.replace(signInUrl());
  });

  window.FlipForgeSignOut = Object.freeze({ signOut, clearAccountState });
})();
