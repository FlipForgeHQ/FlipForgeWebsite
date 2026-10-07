import { getUser, login, logout, requestPasswordRecovery } from "@netlify/identity";
import { friendlyAuthError } from "./flipforge-auth-error-copy.mjs";

const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
const hostAllowed = PRODUCTION_HOST.test(String(window.location.hostname || ""));
const reauthRequested = new URLSearchParams(window.location.search).get("reauth") === "1";
const PRIVATE_BETA_START = "/app/beta/#/beta-start";
const OWNER_HUB = "/owner";
const OPERATOR_ROLE = "flipforge-operator";
const TERMS_PENDING_ROLE = "flipforge-terms-pending";
// Must equal BETA_TERMS_VERSION in netlify/modern-functions/beta-terms-acceptance.mjs.
const BETA_TERMS_VERSION = "2026-08-15";
const TERMS_ENDPOINT = "/api/beta/terms-acceptance";
// Specific Controlled Pro Beta seat states returned by the gateway (error.reason, allowlisted server-side).
const SEAT_MESSAGES = {
  NOT_ADMITTED: "Not admitted: your invitation is active, but your Private Beta seat has not been reserved yet. Contact support@goflipforge.com and we will finish setting it up.",
  BETA_FULL: "Beta full: the FlipForge Private Beta has no open seats right now. Contact support@goflipforge.com.",
  ADMISSION_UNAVAILABLE: "FlipForge could not confirm your Private Beta seat right now. Try again in a moment."
};

const form = document.querySelector("[data-production-auth-form]");
const emailInput = document.querySelector("[data-production-auth-email]");
const passwordInput = document.querySelector("[data-production-auth-password]");
const signInButton = document.querySelector("[data-production-auth-submit]");
const signOutButton = document.querySelector("[data-production-auth-signout]");
const recoveryButton = document.querySelector("[data-production-auth-recovery]");
const returnLink = document.querySelector("[data-production-auth-return]");
const ownerLink = document.querySelector("[data-production-auth-owner]");
const status = document.querySelector("[data-production-auth-status]");
const result = document.querySelector("[data-production-auth-result]");
const termsPanel = document.querySelector("[data-production-auth-terms]");
const termsCheckbox = document.querySelector("[data-production-auth-terms-accept]");
const termsButton = document.querySelector("[data-production-auth-terms-submit]");

let currentUser = null;

function safeReturnPath() {
  // Private Beta is the only public authentication destination before customer launch.
  return PRIVATE_BETA_START;
}

// Display-only hint. Mirrors the Owner Hub identity snapshot (flipforge-identity-client.mjs);
// the Owner Hub and every operator API re-verify the role server-side, so this grants nothing.
function isOperatorAccount(user) {
  if (!user) return false;
  const metadata = user.appMetadata || user.app_metadata || {};
  const roles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ].map(value => String(value || "").trim());
  return roles.includes(OPERATOR_ROLE) || String(user.role || "") === "admin";
}

function rolesOf(user) {
  if (!user) return [];
  const metadata = user.appMetadata || user.app_metadata || {};
  return [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ].map(value => String(value || "").trim());
}

function hideTerms() {
  if (!termsPanel) return;
  termsPanel.hidden = true;
  if (termsCheckbox) termsCheckbox.checked = false;
  if (termsButton) termsButton.disabled = true;
}

function showTerms() {
  if (!termsPanel) return;
  termsPanel.hidden = false;
  if (termsButton) termsButton.disabled = !termsCheckbox?.checked;
}

function updateOwnerLink() {
  if (!ownerLink) return;
  ownerLink.href = OWNER_HUB;
  ownerLink.hidden = !isOperatorAccount(currentUser);
}

function setStatus(message, tone = "neutral") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setSignedIn(user) {
  currentUser = user || null;
  signOutButton.hidden = !currentUser;
  returnLink.hidden = true;
  returnLink.href = safeReturnPath();
  updateOwnerLink();
  hideTerms();
  if (currentUser) setStatus(`Signed in as ${currentUser.email || "FlipForge user"}. Verifying Private Beta access…`, "neutral");
  else setStatus("Sign in with your invited Private Beta account.", "neutral");
}

async function withTimeout(promise, milliseconds = 8000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Identity request timed out.")), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function initialize() {
  if (!hostAllowed) {
    form.hidden = true;
    signOutButton.hidden = true;
    recoveryButton.hidden = true;
    setStatus("Production account access is available only on goflipforge.com.", "error");
    return;
  }
  try {
    const user = await withTimeout(getUser());
    setSignedIn(user);
    if (user && !reauthRequested) await verifyAccess();
    if (reauthRequested) {
      if (user) {
        setStatus("The app rejected this cached session. Sign out, then sign in again to restore access.", "error");
        result.textContent = "Server authentication returned HTTP 401. Browser identity alone is not treated as valid access.";
        result.dataset.tone = "error";
      } else {
        setStatus("Your previous app session expired. Sign in again to continue.", "neutral");
      }
      emailInput?.focus();
    }
  } catch (error) {
    setStatus(friendlyAuthError(error, "Identity initialization failed."), "error");
  }
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!hostAllowed || signInButton.disabled) return;
  const email = String(emailInput.value || "").trim();
  const password = String(passwordInput.value || "");
  if (!email || !password) return;
  signInButton.disabled = true;
  setStatus("Signing in…", "neutral");
  result.textContent = "";
  try {
    const user = await withTimeout(login(email, password));
    passwordInput.value = "";
    setSignedIn(user);
    await verifyAccess();
  } catch (error) {
    setStatus(friendlyAuthError(error, "Sign in failed."), "error");
  } finally {
    signInButton.disabled = false;
  }
});

recoveryButton?.addEventListener("click", async () => {
  if (!hostAllowed || recoveryButton.disabled) return;
  const email = String(emailInput.value || "").trim();
  if (!email) {
    setStatus("Enter the invited account email first.", "error");
    emailInput.focus();
    return;
  }
  recoveryButton.disabled = true;
  setStatus("Requesting password recovery…", "neutral");
  result.textContent = "";
  try {
    await withTimeout(requestPasswordRecovery(email));
  } catch (_) {
    // Keep response generic so account existence is never disclosed.
  } finally {
    setStatus("If that invited account exists, a password-recovery email has been sent.", "ok");
    recoveryButton.disabled = false;
  }
});

signOutButton?.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    await withTimeout(logout());
    setSignedIn(null);
    result.textContent = "";
    if (reauthRequested) setStatus("Signed out. Sign in again to restore app access.", "neutral");
  } catch (error) {
    setStatus(friendlyAuthError(error, "Sign out failed."), "error");
  } finally {
    signOutButton.disabled = false;
  }
});

termsCheckbox?.addEventListener("change", () => {
  if (termsButton) termsButton.disabled = !termsCheckbox.checked;
});

termsButton?.addEventListener("click", async () => {
  if (!hostAllowed || !currentUser || termsButton.disabled || !termsCheckbox?.checked) return;
  termsButton.disabled = true;
  result.textContent = "Saving your acceptance of the Private Beta Terms…";
  result.dataset.tone = "neutral";
  try {
    const response = await fetch(TERMS_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true, termsVersion: BETA_TERMS_VERSION })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.activated === false) {
      throw new Error(payload.reason || "TERMS_RECORD_FAILED");
    }
    hideTerms();
    if (await verifyAccess()) {
      setStatus("Private Beta Terms accepted. Opening your workspace…", "ok");
      window.location.assign(PRIVATE_BETA_START);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "TERMS_RECORD_FAILED";
    result.textContent = `FlipForge could not save your Terms acceptance (${code}). Try again, or contact support@goflipforge.com.`;
    result.dataset.tone = "error";
    showTerms();
  }
});

async function verifyAccess() {
  if (!currentUser) return false;
  result.textContent = "Verifying active Private Beta membership…";
  result.dataset.tone = "neutral";
  try {
    const correlationId = window.crypto?.randomUUID?.() || `production-${Date.now()}`;
    const response = await fetch("/api/v1/entitlements", {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });

    if (response.ok) {
      result.textContent = "Private Beta access verified.";
      result.dataset.tone = "ok";
      setStatus(`Welcome back, ${currentUser.email || "FlipForge tester"}.`, "ok");
      returnLink.href = PRIVATE_BETA_START;
      returnLink.hidden = false;
      return true;
    }

    if (response.status === 401) {
      result.textContent = "Your beta sign-in session needs to be refreshed. Sign out, then sign in again.";
    } else if (response.status === 403 && isOperatorAccount(currentUser)) {
      result.textContent = "This is an operator account, not a Private Beta tester account. Open the Owner Hub for operator tools and the customer preview.";
    } else if (response.status === 403 && rolesOf(currentUser).includes(TERMS_PENDING_ROLE)) {
      // Activated invitation whose Beta Terms acceptance was never recorded (for example the
      // activation tab closed before it was saved). Offer the acceptance here instead of a dead end.
      result.textContent = "Your invitation is activated, but the Private Beta Terms have not been accepted yet.";
      result.dataset.tone = "neutral";
      returnLink.hidden = true;
      showTerms();
      return false;
    } else if (response.status === 403) {
      const payload = await response.json().catch(() => null);
      const seatReason = String(payload?.error?.reason || "");
      result.textContent = SEAT_MESSAGES[seatReason]
        || "This account is signed in, but active Private Beta access is not enabled.";
    } else {
      result.textContent = "FlipForge could not verify Private Beta access. Try again or contact support.";
    }
    result.dataset.tone = "error";
    returnLink.hidden = true;
    return false;
  } catch (_) {
    result.textContent = "FlipForge could not verify Private Beta access. Try again or contact support.";
    result.dataset.tone = "error";
    returnLink.hidden = true;
    return false;
  }
}

initialize();
