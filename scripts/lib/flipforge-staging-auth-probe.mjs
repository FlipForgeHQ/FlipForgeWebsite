import { getUser, login, logout } from "@netlify/identity";

const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
const hostAllowed = PREVIEW_HOST.test(String(window.location.hostname || ""));

const form = document.querySelector("[data-staging-auth-form]");
const emailInput = document.querySelector("[data-staging-auth-email]");
const passwordInput = document.querySelector("[data-staging-auth-password]");
const signInButton = document.querySelector("[data-staging-auth-submit]");
const signOutButton = document.querySelector("[data-staging-auth-signout]");
const testButton = document.querySelector("[data-staging-auth-test]");
const status = document.querySelector("[data-staging-auth-status]");
const result = document.querySelector("[data-staging-auth-result]");

let currentUser = null;

function setStatus(message, tone = "neutral") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setSignedIn(user) {
  currentUser = user || null;
  testButton.disabled = !currentUser;
  signOutButton.hidden = !currentUser;
  if (currentUser) {
    setStatus(`Signed in as ${currentUser.email || "staging user"}.`, "ok");
  } else {
    setStatus("Not signed in.", "neutral");
  }
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
    setStatus("This staging authentication probe is available only on approved deploy previews.", "error");
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
  result.textContent = "Testing authenticated dashboard boundary…";
  try {
    const correlationId = window.crypto?.randomUUID?.() || `staging-${Date.now()}`;
    const response = await fetch("/api/v1/dashboard", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Correlation-Id": correlationId
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }
    const code = payload?.error?.code || (response.ok ? "OK" : "UNKNOWN");
    result.textContent = `HTTP ${response.status} · ${code}`;
    result.dataset.tone = response.status === 503 && code === "BRIDGE_DISABLED" ? "ok" : "neutral";
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : "Boundary test failed.";
    result.dataset.tone = "error";
  } finally {
    testButton.disabled = !currentUser;
  }
});

initialize();
