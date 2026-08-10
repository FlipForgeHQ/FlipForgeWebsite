import { getUser, login, logout, requestPasswordRecovery } from "@netlify/identity";

const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
const hostAllowed = PRODUCTION_HOST.test(String(window.location.hostname || ""));

const form = document.querySelector("[data-production-auth-form]");
const emailInput = document.querySelector("[data-production-auth-email]");
const passwordInput = document.querySelector("[data-production-auth-password]");
const signInButton = document.querySelector("[data-production-auth-submit]");
const signOutButton = document.querySelector("[data-production-auth-signout]");
const recoveryButton = document.querySelector("[data-production-auth-recovery]");
const testButton = document.querySelector("[data-production-auth-test]");
const returnLink = document.querySelector("[data-production-auth-return]");
const status = document.querySelector("[data-production-auth-status]");
const result = document.querySelector("[data-production-auth-result]");

let currentUser = null;

function safeReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("return");
  if (!requested || requested.startsWith("//")) return "/app/#/account";
  try {
    const resolved = new URL(requested, window.location.origin);
    const pathAllowed = resolved.pathname === "/app/" || resolved.pathname === "/saas-prototype/";
    if (resolved.origin !== window.location.origin || !pathAllowed) return "/app/#/account";
    return `${resolved.pathname}${resolved.search}${resolved.hash || "#/account"}`;
  } catch (_) {
    return "/app/#/account";
  }
}

function setStatus(message, tone = "neutral") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setSignedIn(user) {
  currentUser = user || null;
  testButton.disabled = !currentUser;
  signOutButton.hidden = !currentUser;
  returnLink.hidden = !currentUser;
  returnLink.href = safeReturnPath();
  if (currentUser) setStatus(`Signed in as ${currentUser.email || "FlipForge user"}.`, "ok");
  else setStatus("Not signed in.", "neutral");
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
    testButton.hidden = true;
    signOutButton.hidden = true;
    recoveryButton.hidden = true;
    setStatus("Production account access is available only on goflipforge.com.", "error");
    return;
  }
  try {
    setSignedIn(await withTimeout(getUser()));
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
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sign out failed.", "error");
  } finally {
    signOutButton.disabled = false;
  }
});

testButton?.addEventListener("click", async () => {
  if (!currentUser || testButton.disabled) return;
  testButton.disabled = true;
  result.textContent = "Testing authenticated entitlement boundary…";
  try {
    const correlationId = window.crypto?.randomUUID?.() || `production-${Date.now()}`;
    const response = await fetch("/api/v1/entitlements", {
      method: "GET",
      headers: { Accept: "application/json", "X-Correlation-Id": correlationId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }
    const code = payload?.error?.code || (response.ok ? "OK" : "UNKNOWN");
    result.textContent = `HTTP ${response.status} · ${code}`;
    result.dataset.tone = response.ok ? "ok" : "error";
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : "Boundary test failed.";
    result.dataset.tone = "error";
  } finally {
    testButton.disabled = !currentUser;
  }
});

initialize();
