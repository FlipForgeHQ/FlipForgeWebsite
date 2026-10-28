/* FlipForge operator window lock (founder decision 2026-10-28).
 *
 * A FlipForge sign-in is shared by every window and tab of the browser. On the operator and owner pages that is not
 * enough: each window or tab must be unlocked with the operator's password before any operator data is shown or
 * changed. The server enforces this (netlify/modern-functions/lib/operator-window.mjs); this script
 *  - keeps this window's unlock token in sessionStorage (this tab only; gone when the tab or browser closes),
 *  - adds the token to every operator request,
 *  - asks for the password when a window is locked, then quietly retries the request that was refused.
 * The password is sent once to the server for checking and is never stored. */
(() => {
  "use strict";
  if (window.FlipForgeOperatorWindow) return;

  const TOKEN_KEY = "ff.operatorWindow.v1";
  const HEADER = "X-FlipForge-Operator-Window";
  const WINDOW_ENDPOINT = "/api/beta/operator";
  const PROTECTED = new Set(["/api/beta/operator", "/api/beta/founder-select", "/api/updates/subscribers"]);
  const nativeFetch = window.fetch.bind(window);
  const ownerHub = /^\/owner(?:\.html|\/)?$/i.test(location.pathname);

  const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; } };
  const writeToken = value => { try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* private mode: stays locked */ } };
  const snapshot = () => window.FlipForgeIdentity?.getSnapshot?.() || { ready: false, authenticated: false, operatorActive: false, email: "" };

  // ---------- Requests ----------
  function protectedUrl(input) {
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
      return url.origin === location.origin && PROTECTED.has(url.pathname) && !url.searchParams.has("window") ? url : null;
    } catch (_) { return null; }
  }
  function withToken(input, init) {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const token = readToken();
    if (token) headers.set(HEADER, token); else headers.delete(HEADER);
    return [input, { ...(init || {}), headers }];
  }
  async function isLocked(response) {
    if (response.status !== 401) return false;
    try { return /^OPERATOR_WINDOW_/.test(String((await response.clone().json())?.reason || "")); } catch (_) { return false; }
  }

  let hold = null;       // set while the sign-in form is also unlocking this window
  let prompting = null;  // one shared password prompt for every refused request

  window.fetch = async function operatorWindowFetch(input, init) {
    if (!protectedUrl(input)) return nativeFetch(input, init);
    if (hold) await hold.promise;
    // A Request body can be read only once; keep a copy so a refused request can be sent again after unlocking.
    const retryable = input instanceof Request ? input.clone() : input;
    const response = await nativeFetch(...withToken(input, init));
    if (!(await isLocked(response))) return response;
    writeToken("");
    const unlocked = await askForPassword();
    // Refused requests changed nothing on the server, so sending one again is safe.
    return unlocked ? nativeFetch(...withToken(retryable, init)) : response;
  };

  async function windowRequest(action, body) {
    const response = await nativeFetch(`${WINDOW_ENDPOINT}?window=${action}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json", ...(readToken() ? { [HEADER]: readToken() } : {}) },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  }

  async function unlock(password) {
    const result = await windowRequest("unlock", { password: String(password || "") });
    if (!result.ok || !result.payload?.token) {
      const error = new Error(result.payload?.reason || "UNLOCK_FAILED");
      error.status = result.status;
      throw error;
    }
    writeToken(result.payload.token);
    closeDialog(true);
    return true;
  }

  async function lock() {
    if (readToken()) { try { await windowRequest("lock"); } catch (_) { /* the token is dropped here regardless */ } }
    writeToken("");
  }

  // ---------- Password prompt ----------
  let dialog = null;
  let settle = null;
  const messages = {
    PASSWORD_INCORRECT: "That password is not right. Try again.",
    PASSWORD_REQUIRED: "Enter your password.",
    TOO_MANY_ATTEMPTS: "Too many wrong passwords. Unlocking is paused for 15 minutes.",
    IDENTITY_UNAVAILABLE: "The sign-in service could not be reached. Try again in a moment.",
    OPERATOR_ROLE_REQUIRED: "This account is not a FlipForge operator.",
    AUTHENTICATION_REQUIRED: "You are signed out. Sign in again.",
  };

  function buildDialog() {
    const node = document.createElement("div");
    node.className = "ff-window-lock";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-labelledby", "ff-window-lock-title");
    node.innerHTML = `
      <form class="ff-window-lock-card" data-window-lock-form novalidate>
        <span class="ff-window-lock-kicker">Operator security</span>
        <h2 id="ff-window-lock-title">Confirm it's you</h2>
        <p>Each new window or tab needs your password before operator data is shown. This window stays unlocked until it is closed, after 30 minutes without activity, or after 8 hours.</p>
        <p class="ff-window-lock-account">Signed in as <strong data-window-lock-email></strong></p>
        <input type="email" name="username" autocomplete="username" data-window-lock-username hidden>
        <label>Password<input type="password" name="password" autocomplete="current-password" required data-window-lock-password></label>
        <p class="ff-window-lock-error" data-window-lock-error role="alert" hidden></p>
        <div class="ff-window-lock-actions">
          <button type="submit" data-window-lock-submit>Unlock this window</button>
          <button type="button" class="secondary" data-window-lock-sign-out>Sign out</button>
        </div>
      </form>`;
    node.querySelector("[data-window-lock-form]").addEventListener("submit", async event => {
      event.preventDefault();
      const field = node.querySelector("[data-window-lock-password]");
      const submit = node.querySelector("[data-window-lock-submit]");
      const error = node.querySelector("[data-window-lock-error]");
      if (!field.value) { error.textContent = messages.PASSWORD_REQUIRED; error.hidden = false; field.focus(); return; }
      submit.disabled = true; submit.textContent = "Checking…"; error.hidden = true;
      try {
        await unlock(field.value);
      } catch (failure) {
        error.textContent = messages[failure.message] || "This window could not be unlocked. Try again.";
        error.hidden = false;
        field.value = "";
        field.focus();
      } finally {
        submit.disabled = false; submit.textContent = "Unlock this window";
      }
    });
    node.querySelector("[data-window-lock-sign-out]").addEventListener("click", async () => {
      try { await window.FlipForgeIdentity?.signOut?.(); } catch (_) { /* fall through to the reload */ }
      closeDialog(false);
      location.reload();
    });
    return node;
  }

  function askForPassword() {
    if (prompting) return prompting;
    const identity = snapshot();
    if (!identity.authenticated || !identity.operatorActive) return Promise.resolve(false);
    dialog = dialog || buildDialog();
    dialog.querySelector("[data-window-lock-email]").textContent = identity.email || "FlipForge operator";
    dialog.querySelector("[data-window-lock-username]").value = identity.email || "";
    dialog.querySelector("[data-window-lock-error]").hidden = true;
    if (!dialog.isConnected) document.body.appendChild(dialog);
    document.documentElement.classList.add("ff-window-locked");
    setTimeout(() => dialog?.querySelector("[data-window-lock-password]")?.focus(), 0);
    prompting = new Promise(resolve => { settle = resolve; });
    return prompting;
  }

  function closeDialog(unlocked) {
    document.documentElement.classList.remove("ff-window-locked");
    if (dialog) { dialog.querySelector("[data-window-lock-password]").value = ""; dialog.remove(); }
    const done = settle;
    settle = null; prompting = null;
    done?.(unlocked);
  }

  // ---------- Pages with nothing to load (Owner Hub) and sign-in changes ----------
  async function review() {
    const identity = snapshot();
    if (!identity.authenticated) { if (identity.ready) writeToken(""); return; }
    if (!identity.operatorActive || hold) return;
    // No token: this window was never unlocked. The Owner Hub asks the server; other pages are checked by their own requests.
    if (!readToken()) { askForPassword(); return; }
    if (!ownerHub) return;
    const result = await windowRequest("check").catch(() => ({ ok: false, payload: {} }));
    if (!result.ok && /^OPERATOR_WINDOW_/.test(String(result.payload?.reason || ""))) { writeToken(""); askForPassword(); }
  }
  window.addEventListener("flipforge:identity-change", () => { review(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => review(), { once: true });
  else review();

  window.FlipForgeOperatorWindow = Object.freeze({
    unlock,
    lock,
    isUnlocked: () => Boolean(readToken()),
    // Used by the sign-in form: operator requests wait until the password just typed has unlocked this window too.
    hold: () => {
      if (hold) return hold.release;
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      hold = { promise, release: () => { if (hold?.promise === promise) hold = null; release(); review(); } };
      return hold.release;
    },
  });
})();
