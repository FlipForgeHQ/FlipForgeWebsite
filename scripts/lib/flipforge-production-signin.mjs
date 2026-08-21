import {
  getUser,
  login,
  logout,
  onAuthChange,
  requestPasswordRecovery
} from "@netlify/identity";

const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
const PRODUCTION_APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
const ROOT_ID = "flipforge-production-identity-root";
const STYLE_ID = "flipforge-production-identity-style";
const ACCOUNT_SIGN_OUT_ATTRIBUTE = "data-ff-production-account-signout";

const state = {
  user: null,
  busy: false,
  panelOpen: false,
  recoveryOpen: false,
  message: "",
  error: ""
};

function productionAppHost() {
  return PRODUCTION_HOST.test(String(window.location.hostname || "")) &&
    PRODUCTION_APP_PATH.test(String(window.location.pathname || ""));
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

function userFingerprint(user) {
  if (!user) return "anonymous";
  const metadata = user.appMetadata || user.app_metadata || {};
  const roles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ]
    .map(value => clean(value))
    .filter(Boolean)
    .sort();
  return JSON.stringify([String(user.id || user.sub || ""), String(user.email || ""), roles]);
}

function membershipActive(user) {
  if (!user) return false;
  const metadata = user.appMetadata || user.app_metadata || {};
  const roles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ].map(value => clean(value)).filter(Boolean);
  const tenantRoles = [...new Set(roles.filter(role => role.startsWith("flipforge-tenant--")))];
  return roles.includes("flipforge-active") && tenantRoles.length === 1;
}

function accountRoute() {
  return /^#\/?account(?:[/?]|$)/i.test(String(window.location.hash || ""));
}

function setUser(nextUser) {
  const normalized = nextUser || null;
  if (userFingerprint(state.user) === userFingerprint(normalized)) return false;
  state.user = normalized;
  render();
  syncAccountSignOut();
  return true;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483001;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f2f2f2}
#${ROOT_ID} *{box-sizing:border-box}
.ff-prod-id-button{border:1px solid rgba(212,175,55,.72);border-radius:10px;background:#030812;color:#f2f2f2;padding:10px 14px;font-weight:800;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.28)}
.ff-prod-id-button:hover,.ff-prod-id-button:focus-visible{border-color:#f0ca58;outline:none}
.ff-prod-id-panel{width:min(360px,calc(100vw - 32px));margin-bottom:10px;border:1px solid rgba(139,146,143,.5);border-radius:14px;background:#07111f;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.ff-prod-id-panel h2{margin:0 0 6px;font-size:18px}.ff-prod-id-panel p{margin:0 0 14px;color:#b8c1cb;font-size:13px;line-height:1.5}.ff-prod-id-panel form{display:grid;gap:10px}.ff-prod-id-panel label{display:grid;gap:5px;font-size:12px;font-weight:800}.ff-prod-id-panel input{width:100%;border:1px solid #364252;border-radius:9px;background:#030812;color:#f2f2f2;padding:10px 11px;font:inherit}.ff-prod-id-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}.ff-prod-id-primary{background:#d4af37;color:#030812;border-color:#d4af37}.ff-prod-id-secondary{border-color:#465365}.ff-prod-id-link{border:0;background:transparent;color:#d4af37;padding:2px 0;font:inherit;font-size:12px;font-weight:800;cursor:pointer;text-align:left}.ff-prod-id-status{margin-top:10px!important;color:#d4af37!important}.ff-prod-id-error{margin-top:10px!important;color:#ff9aa5!important}.ff-prod-id-note{font-size:11px!important;color:#8794a5!important}.ff-prod-id-membership{display:inline-flex;width:max-content;border:1px solid #394657;border-radius:999px;padding:5px 9px;color:#b8c1cb;font-size:11px;font-weight:800}.ff-prod-id-membership[data-active="true"]{border-color:#2e8b66;color:#9de4c5}
@media(max-width:520px){#${ROOT_ID}{right:10px;bottom:10px}.ff-prod-id-panel{width:calc(100vw - 20px)}}
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

function recoveryMarkup() {
  return `<section class="ff-prod-id-panel" role="dialog" aria-label="FlipForge password recovery">
    <h2>Reset password</h2>
    <p>Enter the email for your invited FlipForge account. The response stays generic to protect account privacy.</p>
    <form data-ff-production-recovery>
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <div class="ff-prod-id-actions"><button class="ff-prod-id-button ff-prod-id-secondary" type="button" data-ff-production-recovery-cancel>Cancel</button><button class="ff-prod-id-button ff-prod-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Sending…" : "Send recovery email"}</button></div>
    </form>
    ${state.message ? `<p class="ff-prod-id-status" role="status">${escapeHtml(state.message)}</p>` : ""}
    ${state.error ? `<p class="ff-prod-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
  </section>`;
}

async function signOutSession({ redirect = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    await logout();
    state.user = null;
    await window.FlipForgeIdentity?.refresh?.();
    state.message = "";
    state.panelOpen = false;
    state.recoveryOpen = false;
    window.FlipForgeStagingReadAdapter?.refresh?.();
    if (redirect) {
      window.location.assign(`/production-auth.html?return=${encodeURIComponent("/app/#/dashboard")}`);
      return;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Sign out failed.";
  } finally {
    state.busy = false;
    render();
    syncAccountSignOut();
  }
}

function syncAccountSignOut() {
  const existing = document.querySelector(`[${ACCOUNT_SIGN_OUT_ATTRIBUTE}]`);
  if (!state.user || !accountRoute()) {
    existing?.remove();
    return;
  }

  const actions = document.querySelector("#main-content .customer-entitlements-page .page-heading .page-actions");
  if (!actions || existing) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.setAttribute(ACCOUNT_SIGN_OUT_ATTRIBUTE, "");
  button.textContent = "Sign out";
  button.addEventListener("click", () => signOutSession({ redirect: true }));
  actions.appendChild(button);
}

function installAccountObserver() {
  const main = document.querySelector("#main-content");
  if (!main || main.dataset.ffProductionAccountSessionObserver === "true") return;
  main.dataset.ffProductionAccountSessionObserver = "true";
  const observer = new MutationObserver(syncAccountSignOut);
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => queueMicrotask(syncAccountSignOut));
}

function render() {
  if (!productionAppHost()) {
    document.getElementById(ROOT_ID)?.remove();
    return;
  }
  ensureStyles();

  // Once authenticated, the app's own topbar Account route becomes the single
  // customer account entry point. Do not leave a duplicate fixed launcher over
  // workspace content. Sign-out is injected into the Account page instead.
  if (state.user && !state.panelOpen) {
    document.getElementById(ROOT_ID)?.remove();
    syncAccountSignOut();
    return;
  }

  const element = root();
  const active = membershipActive(state.user);
  const panel = !state.panelOpen
    ? ""
    : state.recoveryOpen
    ? recoveryMarkup()
    : state.user
    ? `<section class="ff-prod-id-panel" role="dialog" aria-label="FlipForge account">
        <h2>FlipForge account</h2>
        <p>Signed in as <strong>${escapeHtml(state.user.email || "Identity user")}</strong>.</p>
        <span class="ff-prod-id-membership" data-active="${active}">${active ? "Active FlipForge membership" : "Membership not active"}</span>
        <p class="ff-prod-id-note">Tenant membership is resolved server-side from Netlify-signed roles. Browser code cannot choose a tenant.</p>
        <div class="ff-prod-id-actions"><button class="ff-prod-id-button ff-prod-id-secondary" type="button" data-ff-production-close>Close</button><button class="ff-prod-id-button" type="button" data-ff-production-logout ${state.busy ? "disabled" : ""}>Sign out</button></div>
        ${state.message ? `<p class="ff-prod-id-status">${escapeHtml(state.message)}</p>` : ""}
        ${state.error ? `<p class="ff-prod-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      </section>`
    : `<section class="ff-prod-id-panel" role="dialog" aria-label="FlipForge sign in">
        <h2>FlipForge sign in</h2>
        <p>Use your invited FlipForge account. Public signup is intentionally not provided.</p>
        <form data-ff-production-login>
          <label>Email<input name="email" type="email" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="ff-prod-id-link" type="button" data-ff-production-recovery-open>Forgot password?</button>
          <div class="ff-prod-id-actions"><button class="ff-prod-id-button ff-prod-id-secondary" type="button" data-ff-production-close>Cancel</button><button class="ff-prod-id-button ff-prod-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Signing in…" : "Sign in"}</button></div>
        </form>
        ${state.error ? `<p class="ff-prod-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <p class="ff-prod-id-note">Authentication uses secure Netlify Identity cookies. No service token, tenant ID, or raw JWT is stored by this UI.</p>
      </section>`;

  element.innerHTML = `${panel}<button class="ff-prod-id-button" type="button" data-ff-production-toggle>${state.user ? "FlipForge account" : "FlipForge sign in"}</button>`;

  element.querySelector("[data-ff-production-toggle]")?.addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-production-close]")?.addEventListener("click", () => {
    state.panelOpen = false;
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-production-recovery-open]")?.addEventListener("click", () => {
    state.recoveryOpen = true;
    state.message = "";
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-production-recovery-cancel]")?.addEventListener("click", () => {
    state.recoveryOpen = false;
    state.message = "";
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-production-recovery]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const email = clean(new FormData(event.currentTarget).get("email"));
    state.busy = true;
    state.message = "";
    state.error = "";
    render();
    try {
      await requestPasswordRecovery(email);
      state.message = "If that invited account exists, a password-recovery email has been sent.";
    } catch (_) {
      state.message = "If that invited account exists, a password-recovery email has been sent.";
    } finally {
      state.busy = false;
      render();
    }
  });
  element.querySelector("[data-ff-production-login]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = new FormData(event.currentTarget);
    const email = clean(form.get("email"));
    const password = clean(form.get("password"));
    state.busy = true;
    state.message = "";
    state.error = "";
    render();
    try {
      state.user = await login(email, password);
      await window.FlipForgeIdentity?.refresh?.();
      state.message = "Signed in. Your secure FlipForge session is active.";
      state.panelOpen = false;
      window.FlipForgeStagingReadAdapter?.refresh?.();
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Sign in failed.";
    } finally {
      state.busy = false;
      render();
    }
  });
  element.querySelector("[data-ff-production-logout]")?.addEventListener("click", () => signOutSession());
}

async function initialize() {
  if (!productionAppHost()) return;
  try {
    state.user = await getUser();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Identity initialization failed.";
  }
  try {
    onAuthChange((_event, user) => {
      setUser(user || null);
    });
  } catch (_) {
    // Explicit login/logout and refresh still update the UI if subscriptions are unavailable.
  }
  installAccountObserver();
  render();
  syncAccountSignOut();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
