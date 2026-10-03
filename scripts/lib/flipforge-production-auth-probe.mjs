import { getUser, login, logout, requestPasswordRecovery } from "@netlify/identity";

const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
const hostAllowed = PRODUCTION_HOST.test(String(window.location.hostname || ""));
const reauthRequested = new URLSearchParams(window.location.search).get("reauth") === "1";
const PRIVATE_BETA_START = "/app/beta/#/beta-start";
const OWNER_HUB = "/owner";
const OPERATOR_ROLE = "flipforge-operator";

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
    setStatus(error instanceof Error ? error.message : "Identity initialization failed.", "error");
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
    setStatus(error instanceof Error ? error.message : "Sign in failed.", "error");
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
    setStatus(error instanceof Error ? error.message : "Sign out failed.", "error");
  } finally {
    signOutButton.disabled = false;
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
    } else if (response.status === 403) {
      result.textContent = "This account is signed in, but active Private Beta access is not enabled.";
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
