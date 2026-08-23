import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  requestPasswordRecovery,
  updateUser
} from "@netlify/identity";

const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
const PRODUCTION_SITE_HOST = /^(?:www\.)?goflipforge\.com$/i;
const PRODUCTION_OPERATOR_HOST = /^(?:www\.)?goflipforge\.com$/i;
const PRODUCTION_OPERATOR_PATH = /^\/operator-beta(?:\.html)?\/?$/i;
const CALLBACK_HASH = /(?:^#|[&#])(invite_token|confirmation_token|recovery_token|email_change_token)=/i;
const ROOT_ID = "flipforge-identity-root";
const STYLE_ID = "flipforge-identity-style";
const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_GUIDANCE = `Use a unique password with at least ${PASSWORD_MIN_LENGTH} characters. A password manager is recommended.`;

const state = {
  user: null,
  busy: false,
  message: "",
  error: "",
  inviteToken: "",
  recoveryMode: false,
  recoveryRequestOpen: false,
  panelOpen: false
};

function previewHost() {
  return PREVIEW_HOST.test(String(window.location.hostname || ""));
}

function productionSiteHost() {
  return PRODUCTION_SITE_HOST.test(String(window.location.hostname || ""));
}

function productionOperatorPage() {
  return PRODUCTION_OPERATOR_HOST.test(String(window.location.hostname || ""))
    && PRODUCTION_OPERATOR_PATH.test(String(window.location.pathname || ""));
}

function interactiveIdentityHost() {
  return previewHost() || productionOperatorPage();
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

function identityFingerprint(user) {
  if (!user) return "anonymous";
  const metadata = user.appMetadata || user.app_metadata || {};
  const roles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .sort();
  return JSON.stringify([
    String(user.id || user.sub || ""),
    String(user.email || ""),
    String(user.userMetadata?.full_name || user.user_metadata?.full_name || ""),
    [...new Set(roles)]
  ]);
}

function identitySnapshot(user = state.user) {
  if (!user) {
    return Object.freeze({
      authenticated: false,
      email: "",
      fullName: "",
      membershipActive: false,
      membershipConfigured: false,
      operatorActive: false
    });
  }

  const metadata = user.appMetadata || user.app_metadata || {};
  const userMetadata = user.userMetadata || user.user_metadata || {};
  const roles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(metadata.roles) ? metadata.roles : [])
  ].map(value => clean(value)).filter(Boolean);
  const tenantRoles = [...new Set(roles.filter(role => role.startsWith("flipforge-tenant--")))];
  const membershipConfigured = tenantRoles.length === 1;

  return Object.freeze({
    authenticated: true,
    email: clean(user.email),
    fullName: clean(userMetadata.full_name),
    membershipActive: roles.includes("flipforge-active") && membershipConfigured,
    membershipConfigured,
    operatorActive: roles.includes("flipforge-operator") || String(user.role || "") === "admin"
  });
}

function publishIdentityChange() {
  window.dispatchEvent(new CustomEvent("flipforge:identity-change", {
    detail: identitySnapshot()
  }));
}

function setAuthenticatedUser(nextUser, { renderIfChanged = true } = {}) {
  const normalized = nextUser || null;
  if (identityFingerprint(state.user) === identityFingerprint(normalized)) return false;
  state.user = normalized;
  publishIdentityChange();
  if (renderIfChanged) render();
  return true;
}

window.FlipForgeIdentity = Object.freeze({
  getUser: () => state.user,
  getSnapshot: () => identitySnapshot(),
  refresh: async () => {
    const nextUser = await getUser();
    setAuthenticatedUser(nextUser);
    return identitySnapshot();
  },
  open: () => {
    if (!interactiveIdentityHost()) return false;
    state.panelOpen = true;
    state.recoveryRequestOpen = false;
    render();
    return true;
  },
  requestRecovery: async email => {
    const normalizedEmail = clean(email);
    if (!normalizedEmail) throw new Error("Enter the account email first.");
    await requestPasswordRecovery(normalizedEmail);
    return "If that invited account exists, a password-recovery email has been sent.";
  },
  updateProfile: async fullName => {
    if (!state.user) throw new Error("Sign in before editing the account profile.");
    const normalizedName = clean(fullName);
    if (!normalizedName || normalizedName.length > 120) {
      throw new Error("Enter a profile name between 1 and 120 characters.");
    }
    const nextUser = await updateUser({ data: { full_name: normalizedName } });
    setAuthenticatedUser(nextUser);
    return identitySnapshot();
  },
  signOut: async () => {
    await logout();
    setAuthenticatedUser(null);
    return identitySnapshot();
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
.ff-id-link{border:0;background:transparent;color:#d4af37;padding:2px 0;font:inherit;font-size:12px;font-weight:800;cursor:pointer;text-align:left}.ff-id-membership{display:inline-flex;width:max-content;border:1px solid #394657;border-radius:999px;padding:5px 9px;color:#b8c1cb;font-size:11px;font-weight:800}.ff-id-membership[data-active="true"]{border-color:#2e8b66;color:#9de4c5}
@media(max-width:520px){#${ROOT_ID}{right:10px;bottom:10px}.ff-id-panel{width:calc(100vw - 20px)}}
`;
  document.head.appendChild(style);
}

function validateNewPassword(password, confirmation) {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_GUIDANCE;
  if (password !== confirmation) return "The passwords do not match.";
  return "";
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
      <h2 id="ff-id-invite-title">Activate your FlipForge beta account</h2>
      <p>Set a password to accept your invitation. After activation, FlipForge will open the private-beta Getting Started guide.</p>
      <p class="ff-id-note">${escapeHtml(PASSWORD_GUIDANCE)}</p>
      <form data-ff-identity-invite>
        <label>New password<input name="password" type="password" minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password" required></label>
        <label>Confirm password<input name="confirmPassword" type="password" minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password" required></label>
        <div class="ff-id-actions"><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Activating…" : "Activate account"}</button></div>
      </form>
      ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <p class="ff-id-note">The invitation token stays in memory only and is removed from the address bar before the password is submitted. FlipForge does not store or log your password.</p>
    </section>`;

  element.querySelector("[data-ff-identity-invite]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = new FormData(event.currentTarget);
    const password = clean(form.get("password"));
    const confirmPassword = clean(form.get("confirmPassword"));
    const passwordError = validateNewPassword(password, confirmPassword);
    if (passwordError) {
      state.error = passwordError;
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    render();
    try {
      await acceptInvite(state.inviteToken, password);
      state.inviteToken = "";
      setAuthenticatedUser(await getUser(), { renderIfChanged: false });
      state.message = productionSiteHost()
        ? "Account activated. Opening FlipForge Getting Started…"
        : previewHost()
        ? "Account activated and signed in for this deploy preview."
        : "Account activated and signed in.";
      state.panelOpen = interactiveIdentityHost();
      if (productionSiteHost()) window.location.assign("/app/#/beta-start");
    } catch (error) {
      state.error = error instanceof Error ? error.message : "The invitation could not be accepted.";
    } finally {
      state.busy = false;
      render();
    }
  });
}

function renderRecoveryPassword(element) {
  element.innerHTML = `
    <section class="ff-id-panel" role="dialog" aria-modal="true" aria-labelledby="ff-id-recovery-title">
      <h2 id="ff-id-recovery-title">Choose a new password</h2>
      <p>Your recovery link created a temporary secure Identity session. Set the new password now.</p>
      <p class="ff-id-note">${escapeHtml(PASSWORD_GUIDANCE)}</p>
      <form data-ff-identity-recovery-password>
        <label>New password<input name="password" type="password" minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password" required></label>
        <label>Confirm password<input name="confirmPassword" type="password" minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password" required></label>
        <div class="ff-id-actions"><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Updating…" : "Update password"}</button></div>
      </form>
      ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <p class="ff-id-note">The recovery token has already been removed from the address bar and is never stored by FlipForge. FlipForge does not store or log your password.</p>
    </section>`;

  element.querySelector("[data-ff-identity-recovery-password]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = new FormData(event.currentTarget);
    const password = clean(form.get("password"));
    const confirmation = clean(form.get("confirmPassword"));
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) {
      state.error = passwordError;
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    render();
    try {
      const nextUser = await updateUser({ password });
      setAuthenticatedUser(nextUser || await getUser(), { renderIfChanged: false });
      state.recoveryMode = false;
      state.panelOpen = interactiveIdentityHost();
      state.message = productionOperatorPage()
        ? "Password updated. Checking the signed operator role."
        : previewHost()
        ? "Password updated. Your secure staging session is active."
        : "Password updated. Open the approved FlipForge deploy preview to continue.";
    } catch (error) {
      state.error = error instanceof Error ? error.message : "The password could not be updated.";
    } finally {
      state.busy = false;
      render();
    }
  });
}

function recoveryRequestMarkup() {
  return `<section class="ff-id-panel" role="dialog" aria-label="FlipForge password recovery">
    <h2>Reset password</h2>
    <p>Enter the email for an invited FlipForge account. The response stays generic to protect account privacy.</p>
    <form data-ff-identity-recovery-request>
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <div class="ff-id-actions"><button class="ff-id-button ff-id-secondary" type="button" data-ff-identity-recovery-cancel>Cancel</button><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Sending…" : "Send recovery email"}</button></div>
    </form>
    ${state.message ? `<p class="ff-id-status" role="status">${escapeHtml(state.message)}</p>` : ""}
    ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
  </section>`;
}

function renderPreview(element) {
  const operatorMode = productionOperatorPage();
  const snapshot = identitySnapshot();
  const accessActive = operatorMode ? snapshot.operatorActive : snapshot.membershipActive;
  const panelLabel = operatorMode ? "FlipForge operator identity" : "FlipForge staging identity";
  const heading = operatorMode ? "Operator sign in" : "Staging sign in";
  const signedInHeading = operatorMode ? "Operator identity" : "Staging identity";
  const signInCopy = operatorMode
    ? "Use the FlipForge account assigned the signed operator role. Public signup is intentionally unavailable."
    : "Use a controlled, invited FlipForge staging account. Public signup is intentionally not provided.";
  const accessLabel = operatorMode
    ? accessActive ? "Operator role active" : "Operator role not active"
    : accessActive ? "Active staging membership" : "Membership not active";
  const accessNote = operatorMode
    ? "Operator authorization is verified again by the server before any applicant or tester record is returned."
    : "Tenant membership is resolved server-side from signed application metadata. Browser code cannot choose a tenant.";
  const toggleLabel = operatorMode
    ? state.user ? "Operator account" : "Operator sign in"
    : state.user ? "Staging account" : "Staging sign in";
  const panel = state.recoveryRequestOpen
    ? recoveryRequestMarkup()
    : state.panelOpen
    ? state.user
      ? `<section class="ff-id-panel ff-id-user" role="dialog" aria-label="${panelLabel}">
          <h2>${signedInHeading}</h2>
          <p>Signed in as <strong>${escapeHtml(state.user.email || "Identity user")}</strong>.</p>
          <span class="ff-id-membership" data-active="${accessActive}">${accessLabel}</span>
          <p class="ff-id-note">${accessNote}</p>
          <div class="ff-id-actions"><button class="ff-id-button ff-id-secondary" type="button" data-ff-identity-close>Close</button><button class="ff-id-button" type="button" data-ff-identity-logout ${state.busy ? "disabled" : ""}>Sign out</button></div>
          ${state.message ? `<p class="ff-id-status">${escapeHtml(state.message)}</p>` : ""}
          ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        </section>`
      : `<section class="ff-id-panel" role="dialog" aria-label="${panelLabel}">
          <h2>${heading}</h2>
          <p>${signInCopy}</p>
          <form data-ff-identity-login>
            <label>Email<input name="email" type="email" autocomplete="username" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
            <button class="ff-id-link" type="button" data-ff-identity-recovery-open>Forgot password?</button>
            <div class="ff-id-actions"><button class="ff-id-button ff-id-secondary" type="button" data-ff-identity-close>Cancel</button><button class="ff-id-button ff-id-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Signing in…" : "Sign in"}</button></div>
          </form>
          ${state.error ? `<p class="ff-id-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <p class="ff-id-note">Authentication uses secure Netlify Identity cookies. No service token, tenant ID, or raw JWT is stored by this UI.</p>
        </section>`
    : "";

  element.innerHTML = `${panel}<button class="ff-id-button" type="button" data-ff-identity-toggle>${toggleLabel}</button>`;

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
  element.querySelector("[data-ff-identity-recovery-open]")?.addEventListener("click", () => {
    state.recoveryRequestOpen = true;
    state.message = "";
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-identity-recovery-cancel]")?.addEventListener("click", () => {
    state.recoveryRequestOpen = false;
    state.panelOpen = true;
    state.message = "";
    state.error = "";
    render();
  });
  element.querySelector("[data-ff-identity-recovery-request]")?.addEventListener("submit", async event => {
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
      setAuthenticatedUser(await login(email, password), { renderIfChanged: false });
      state.message = operatorMode
        ? "Signed in. Checking the signed operator role."
        : "Signed in. Refresh Staging Data to load the authenticated tenant view.";
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
      setAuthenticatedUser(null, { renderIfChanged: false });
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
  if (!interactiveIdentityHost() && !needsCallbackUi && !state.recoveryMode && !state.message && !state.error) {
    document.getElementById(ROOT_ID)?.remove();
    return;
  }
  ensureStyles();
  const element = root();
  if (needsCallbackUi) renderInvite(element);
  else if (state.recoveryMode) renderRecoveryPassword(element);
  else if (interactiveIdentityHost()) renderPreview(element);
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
      } else if (callback?.type === "recovery") {
        setAuthenticatedUser(callback.user || await getUser(), { renderIfChanged: false });
        state.recoveryMode = true;
        state.panelOpen = true;
        clearCallbackHash();
      } else if (callback) {
        setAuthenticatedUser(callback.user || await getUser(), { renderIfChanged: false });
        state.message = "Identity confirmation completed.";
        clearCallbackHash();
      }
    }
    if (!state.user && !state.inviteToken) {
      setAuthenticatedUser(await getUser(), { renderIfChanged: false });
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Identity initialization failed.";
  }

  try {
    onAuthChange((_event, user) => {
      // Netlify may publish repeated auth snapshots while refreshing secure
      // session cookies. Re-rendering an unchanged anonymous/user snapshot
      // destroys focused form controls and makes the login fields impossible
      // to type into. Only rebuild the UI when the signed identity or roles
      // actually change.
      setAuthenticatedUser(user || null);
    });
  } catch (_) {
    // Initial login/logout calls still refresh state even if subscriptions are unavailable.
  }
  publishIdentityChange();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
