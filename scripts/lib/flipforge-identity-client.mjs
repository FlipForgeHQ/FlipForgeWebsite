import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange
} from "@netlify/identity";

const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
const CALLBACK_HASH = /(?:^#|[&#])(invite_token|confirmation_token|recovery_token|email_change_token)=/i;
const ROOT_ID = "flipforge-identity-root";
const STYLE_ID = "flipforge-identity-style";

const state = {
  user: null,
  busy: false,
  message: "",
  error: "",
  inviteToken: "",
  panelOpen: false
};

function previewHost() {
  return PREVIEW_HOST.test(String(window.location.hostname || ""));
}

function callbackPresent() {
  return CALLBACK_HASH.test(String(window.location.hash || ""));
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function compatibilityUser() {
  if (!state.user) return null;
  // The pre-modern staging adapters only use jwt() to optionally construct an
  // Authorization header. Current Netlify Identity authenticates same-origin
  // requests with secure nf_jwt/nf_refresh cookies, so never expose a raw JWT
  // to browser code. Returning null keeps the compatibility surface fail-closed.
  return Object.freeze({
    ...state.user,
    jwt: async () => null
  });
}

window.netlifyIdentity = Object.freeze({
  currentUser: () => compatibilityUser()
});

window.FlipForgeIdentity = Object.freeze({
  getUser: () => state.user,
  refresh: async () => {
    state.user = await getUser();
    render();
    return state.user;
  },
  open: () => {
    state.panelOpen = true;
    render();
  }
});

function clearCallbackHash() {
  if (!callbackPresent()) return;
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f2f2f2}
#${ROOT_ID} *{box-sizing:border-box}
.ff-id-button{border:1px solid rgba(212,175,55,.72);border-radius:10px;background:#030812;color:#f2f2f2;padding:10px 14px;font-weight:800;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.28)}
.ff-id-button:hover,.ff-id-button:focus-visible{border-color:#f0ca58;outline:none}
.ff-id-panel{width:min(360px,calc(100vw - 32px));margin-bottom:10px;border:1px solid rgba(139,146,143,.5);border-radius:14px;background:#07111f;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.ff-id-panel h2{margin:0 0 6px;font-size:18px}.ff-id-panel p{margin:0 0 14px;color:#b8c1cb;font-size:13px;line-height:1.5}.ff-id-panel form{display:grid;gap:10px}.ff-id-panel label{display:grid;gap:5px;font-size:12px;font-weight:800}.ff-id-panel input{width:100%;border:1px solid #364252;border-radius:9px;background:#030812;color:#f2f2f2;padding:10px 11px;font:inherit}.ff-id-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}.ff-id-primary{background:#d4af37;color:#030812;border-color:#d4af37}.ff-id-secondary{border-color:#465365}.ff-id-status{margin-top:10px!important;color:#d4af37!important}.ff-id-error{margin-top:10px!important;color:#ff9aa5!important}.ff-id-user{display:grid;gap:8px}.ff-id-user strong{overflow-wrap:anywhere}.ff-id-note{font-size:11px!important;color:#8794a5!important}
@media(max-width:520px){#${ROOT_ID}{right:10px;bottom:10px}.ff-id-panel{width:calc(100vw - 20px)}}
`;
  document.head.appendChild(style);
}

function root() {
  let element = document.getElementById(ROOT_ID);
  if (!element) {
    element = document.createElement("div");
    element.id = ROOT_ID;
    document.body.appendChild(element);
  }
  return element;
}

function renderInvite(element) {
  element.innerHTML = `
    <section class="ff-id-panel" role="dialog" aria-modal="true" aria-labelledby="ff-id-invite-title">
      <h2 id="ff-id-invite-title">Activate your FlipForge staging account</h2>
      <p>Set a password to accept this controlled Netlify Identity invitation. This does not activate the production FlipForge API.</p>
      <form data-ff-identity-invite>
        <label>New password<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>
        <label>Confirm password<input name="confirmPassword" type="password" minlength="10" autocomplete="new-password" required></label>
        <div class="ff-id-actions"><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Activating…" : "Activate account"}</button></div>
      </form>
      ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <p class="ff-id-note">The invitation token stays in memory only and is removed from the address bar before the password is submitted.</p>
    </section>`;

  element.querySelector("[data-ff-identity-invite]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = new FormData(event.currentTarget);
    const password = clean(form.get("password"));
    const confirmPassword = clean(form.get("confirmPassword"));
    if (password.length < 10) {
      state.error = "Use a password with at least 10 characters.";
      render();
      return;
    }
    if (password !== confirmPassword) {
      state.error = "The passwords do not match.";
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    render();
    try {
      await acceptInvite(state.inviteToken, password);
      state.inviteToken = "";
      state.user = await getUser();
      state.message = previewHost()
        ? "Account activated and signed in for this deploy preview."
        : "Account activated. Open the approved FlipForge deploy preview and sign in there.";
      state.panelOpen = previewHost();
    } catch (error) {
      state.error = error instanceof Error ? error.message : "The invitation could not be accepted.";
    } finally {
      state.busy = false;
      render();
    }
  });
}

function renderPreview(element) {
  const panel = state.panelOpen
    ? state.user
      ? `<section class="ff-id-panel ff-id-user" role="dialog" aria-label="FlipForge staging identity">
          <h2>Staging identity</h2>
          <p>Signed in as <strong>${escapeHtml(state.user.email || "Identity user")}</strong>.</p>
          <p class="ff-id-note">Tenant membership is resolved server-side from signed application metadata. Browser code cannot choose a tenant.</p>
          <div class="ff-id-actions"><button class="ff-id-button ff-id-secondary" type="button" data-ff-identity-close>Close</button><button class="ff-id-button" type="button" data-ff-identity-logout ${state.busy ? "disabled" : ""}>Sign out</button></div>
          ${state.message ? `<p class="ff-id-status">${escapeHtml(state.message)}</p>` : ""}
          ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        </section>`
      : `<section class="ff-id-panel" role="dialog" aria-label="FlipForge staging sign in">
          <h2>Staging sign in</h2>
          <p>Use a controlled, invited FlipForge staging account. Public signup is intentionally not provided.</p>
          <form data-ff-identity-login>
            <label>Email<input name="email" type="email" autocomplete="username" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
            <div class="ff-id-actions"><button class="ff-id-button ff-id-secondary" type="button" data-ff-identity-close>Cancel</button><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Signing in…" : "Sign in"}</button></div>
          </form>
          ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <p class="ff-id-note">Authentication uses secure Netlify Identity cookies. No service token, tenant ID, or raw JWT is stored by this UI.</p>
        </section>`
    : "";

  element.innerHTML = `${panel}<button class="ff-id-button" type="button" data-ff-identity-toggle>${state.user ? "Staging account" : "Staging sign in"}</button>`;

  element.querySelector("[data-ff-identity-toggle]")?.addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-identity-close]")?.addEventListener("click", () => {
    state.panelOpen = false;
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-identity-login]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = new FormData(event.currentTarget);
    const email = clean(form.get("email"));
    const password = clean(form.get("password"));
    state.busy = true;
    state.error = "";
    state.message = "";
    render();
    try {
      state.user = await login(email, password);
      state.message = "Signed in. Refresh Staging Data to load the authenticated tenant view.";
      window.FlipForgeStagingReadAdapter?.refresh?.();
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Sign in failed.";
    } finally {
      state.busy = false;
      render();
    }
  });
  element.querySelector("[data-ff-identity-logout]")?.addEventListener("click", async () => {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      await logout();
      state.user = null;
      state.message = "";
      state.panelOpen = false;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Sign out failed.";
    } finally {
      state.busy = false;
      render();
    }
  });
}

function render() {
  const needsCallbackUi = Boolean(state.inviteToken);
  if (!previewHost() && !needsCallbackUi && !state.message && !state.error) {
    document.getElementById(ROOT_ID)?.remove();
    return;
  }
  ensureStyles();
  const element = root();
  if (needsCallbackUi) renderInvite(element);
  else if (previewHost()) renderPreview(element);
  else {
    element.innerHTML = `<section class="ff-id-panel"><h2>FlipForge Identity</h2><p>${escapeHtml(state.message || state.error || "Authentication callback completed.")}</p></section>`;
  }
}

async function initialize() {
  const hadCallback = callbackPresent();
  try {
    if (hadCallback) {
      const callback = await handleAuthCallback();
      if (callback?.type === "invite" && callback.token) {
        state.inviteToken = callback.token;
        clearCallbackHash();
      } else if (callback) {
        state.user = callback.user || await getUser();
        state.message = callback.type === "recovery"
          ? "Password recovery was authenticated. Use Netlify Identity account recovery controls to complete the password change."
          : "Identity confirmation completed.";
        clearCallbackHash();
      }
    }
    if (!state.user && !state.inviteToken) state.user = await getUser();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Identity initialization failed.";
  }

  try {
    onAuthChange((_event, user) => {
      state.user = user || null;
      render();
    });
  } catch (_) {
    // Initial login/logout calls still refresh state even if subscriptions are unavailable.
  }
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
