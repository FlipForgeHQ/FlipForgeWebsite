import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  refreshSession,
  requestPasswordRecovery,
  updateUser
} from "@netlify/identity";

const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
const PRODUCTION_SITE_HOST = /^(?:www\.)?goflipforge\.com$/i;
const PRODUCTION_OPERATOR_HOST = /^(?:www\.)?goflipforge\.com$/i;
const PRODUCTION_OPERATOR_PATH = /^(?:\/operator-beta(?:\.html)?\/?|\/owner(?:\.html|\/)?|\/owner\/customer(?:\/.*)?)$/i;
const CALLBACK_HASH = /(?:^#|[&#])(invite_token|confirmation_token|recovery_token|email_change_token)=/i;
const ROOT_ID = "flipforge-identity-root";
const STYLE_ID = "flipforge-identity-style";
const STYLESHEET_PATH = "/assets/css/flipforge-identity-v1.css";
const PRODUCTION_BETA_START = "/app/beta/#/beta-start";
const PRODUCTION_SIGN_IN = `/production-auth.html?return=${encodeURIComponent(PRODUCTION_BETA_START)}`;
const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_GUIDANCE = `Use a unique password with at least ${PASSWORD_MIN_LENGTH} characters. A password manager is recommended.`;

// One shared session renewal per page. Access tokens expire after about an
// hour; renewing in the browser before protected API calls means parallel
// dashboard requests never race to rotate the same refresh token on the
// server. refreshSession() is a local no-op while the token has more than a
// minute left, so healthy sessions add no network latency.
let sessionRenewal = null;

function ensureFreshSession() {
  if (!sessionRenewal) {
    sessionRenewal = (async () => {
      try {
        return await refreshSession();
      } catch (_) {
        return null;
      }
    })().finally(() => {
      sessionRenewal = null;
    });
  }
  return sessionRenewal;
}

function protectedApiRequest(input) {
  try {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const url = new URL(String(raw || ""), window.location.origin);
    return url.origin === window.location.origin
      && url.pathname.startsWith("/api/v1/")
      && url.pathname !== "/api/v1/health";
  } catch (_) {
    return false;
  }
}

// Protected API requests currently in flight, and how many of them are waiting to
// retry after losing a server-side session-renewal race.
let protectedInFlight = 0;
let raceRetriesWaiting = 0;
const inFlightListeners = new Set();
const RACE_SETTLE_TIMEOUT_MS = 10000;

function notifyInFlight() {
  for (const listener of [...inFlightListeners]) listener();
}

function otherRequestsSettled() {
  return protectedInFlight - raceRetriesWaiting <= 0;
}

function waitForOtherRequests() {
  if (otherRequestsSettled()) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      if (!otherRequestsSettled()) return;
      inFlightListeners.delete(done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      inFlightListeners.delete(done);
      resolve();
    }, RACE_SETTLE_TIMEOUT_MS);
    inFlightListeners.add(done);
  });
}

function replayableRequest(input, init) {
  if (input && typeof input === "object" && !(input instanceof URL) && input.body) return false;
  const body = init?.body;
  return body === undefined || body === null || typeof body === "string" || body instanceof URLSearchParams;
}

// When parallel requests reach the gateway with an expired access token, the
// first renews the session (rotating the refresh token) and the others can be
// answered 401. Retry such a 401 exactly once, after every other in-flight
// request has settled so the renewed cookie is in place. A genuine sign-out
// still ends in 401: this never manufactures access.
async function recoverFromSessionRenewalRace(args, response, refetch) {
  try {
    if (!response || response.status !== 401 || typeof refetch !== "function") return null;
    if (!protectedApiRequest(args?.[0]) || !replayableRequest(args?.[0], args?.[1])) return null;
    const payload = await response.clone().json().catch(() => null);
    if (payload?.error?.code !== "AUTHENTICATION_REQUIRED") return null;
    raceRetriesWaiting += 1;
    try {
      await waitForOtherRequests();
    } finally {
      raceRetriesWaiting -= 1;
    }
    return await refetch();
  } catch (_) {
    return null;
  }
}

function installApiSessionRenewal() {
  if (window.__flipForgeApiSessionRenewalV1 || typeof window.fetch !== "function") return;
  window.__flipForgeApiSessionRenewalV1 = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!protectedApiRequest(input)) return nativeFetch(input, init);
    protectedInFlight += 1;
    try {
      await ensureFreshSession();
      return await nativeFetch(input, init);
    } finally {
      protectedInFlight -= 1;
      notifyInFlight();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ensureFreshSession();
  });
}

installApiSessionRenewal();

const state = {
  user: null,
  // False until the first session lookup finishes. Gates that redirect must wait
  // for ready, because the snapshot reads "signed out" while the session restores.
  ready: false,
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
      ready: Boolean(state.ready),
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
    ready: Boolean(state.ready),
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
  ensureFreshSession: () => ensureFreshSession(),
  recoverFromSessionRenewalRace: (args, response, refetch) => recoverFromSessionRenewalRace(args, response, refetch),
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

// Panel styling lives in a same-origin stylesheet. Invitation and recovery emails
// land on the homepage, whose Content-Security-Policy (style-src 'self') blocks
// injected <style> elements; the activation form then rendered unstyled below the
// footer and invited testers never saw it. The same-origin stylesheet is allowed.
function stylesheetLink() {
  return document.getElementById(STYLE_ID)
    || document.querySelector(`link[rel="stylesheet"][href$="${STYLESHEET_PATH}"]`);
}

function ensureStyles() {
  if (stylesheetLink()) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = STYLESHEET_PATH;
  document.head.appendChild(link);
}

// Keep the panel out of view until its stylesheet has applied, so it never
// flashes unstyled at the end of the page. If the stylesheet fails to load the
// panel is still shown rather than hidden forever.
function revealWhenStyled(element) {
  const link = stylesheetLink();
  if (!link || link.sheet) {
    element.hidden = false;
    return;
  }
  element.hidden = true;
  const reveal = () => { element.hidden = false; };
  link.addEventListener("load", reveal, { once: true });
  link.addEventListener("error", reveal, { once: true });
  window.setTimeout(reveal, 4000);
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
      ${state.error && productionSiteHost() ? `<p><a class="ff-id-next" href="${PRODUCTION_SIGN_IN}" data-ff-identity-invite-signin>Already activated? Go to Private Beta sign in</a></p><p class="ff-id-note">If this invitation has expired, ask FlipForge to resend it. You do not need to apply again.</p>` : ""}
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
      // Activated testers go straight to the Private Beta workspace, never back
      // to the public application funnel on the page they landed on.
      if (productionSiteHost()) window.location.assign("/app/beta/#/beta-start");
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
        : productionSiteHost()
        ? "Password updated. Opening the Private Beta workspace…"
        : "Password updated. Open the approved FlipForge deploy preview to continue.";
      if (productionSiteHost() && !productionOperatorPage()) window.location.assign("/app/beta/#/beta-start");
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
  revealWhenStyled(element);
  element.dataset.ffMode = needsCallbackUi ? "invite" : state.recoveryMode ? "recovery" : "panel";
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
  state.ready = true;
  publishIdentityChange();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
