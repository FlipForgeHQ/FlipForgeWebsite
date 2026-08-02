(() => {
  "use strict";

  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function accountRoute() {
    return String(window.location.hash || "#/dashboard").replace(/^#\//, "").split(/[/?]/)[0] === "account";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function identityApi() {
    return window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getSnapshot === "function"
      ? window.FlipForgeIdentity
      : null;
  }

  function snapshot() {
    return identityApi()?.getSnapshot?.() || {
      authenticated: false,
      email: "",
      fullName: "",
      membershipActive: false,
      membershipConfigured: false
    };
  }

  function accessLabel(session) {
    if (!session.authenticated) return "Sign-in required";
    if (session.membershipActive) return "Active staging member";
    if (session.membershipConfigured) return "Membership inactive";
    return "Membership not assigned";
  }

  function signInUrl() {
    return `/staging-auth.html?return=${encodeURIComponent("/saas-prototype/#/account")}`;
  }

  function metric(label, value, detail, tone = "neutral") {
    return `<article class="account-life-metric" data-tone="${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function render() {
    if (!eligibleHost() || !accountRoute()) return;
    const main = document.querySelector("#main-content");
    if (!main) return;

    const session = snapshot();
    const signedIn = session.authenticated;
    const displayName = session.fullName || "Invited FlipForge user";
    const membershipTone = session.membershipActive ? "ok" : "warn";

    main.innerHTML = `<div class="page account-life-page" data-account-lifecycle>
      <header class="page-heading">
        <div><span class="eyebrow">Customer account lifecycle foundation</span><h1>Account</h1><p>Manage the secure staging identity and recovery path without creating billing, provider, or transaction authority.</p></div>
        <div class="page-actions">${signedIn
          ? `<button class="button button-secondary" type="button" data-account-signout>Sign out</button>`
          : `<a class="button button-primary" href="${signInUrl()}">Sign in</a>`}</div>
      </header>

      <div class="boundary-note"><strong>Account boundary:</strong> Invitation-only Identity is active for deploy previews. Public signup, customer billing, paid entitlements, provider credentials, and production customer access remain disabled.</div>
      <div class="account-life-message" data-account-message role="status" aria-live="polite"></div>

      <section class="account-life-metrics" aria-label="Account status">
        ${metric("Session", signedIn ? "Authenticated" : "Signed out", signedIn ? "Secure same-origin Identity cookie" : "No active Identity session", signedIn ? "ok" : "warn")}
        ${metric("Tenant access", accessLabel(session), "Resolved only from administrator-signed roles", membershipTone)}
        ${metric("Billing", "Not connected", "No payment method or Stripe authority", "neutral")}
        ${metric("Production", "Inactive", "Account access remains deploy-preview-only", "neutral")}
      </section>

      <div class="account-life-grid">
        <section class="panel">
          <header class="panel-header"><div><h2>Profile</h2><p>Self-service display information. It cannot change tenant membership or entitlements.</p></div></header>
          <div class="panel-body">${signedIn ? `
            <form class="account-life-form" data-account-profile-form>
              <label><span>Display name</span><input name="fullName" type="text" minlength="1" maxlength="120" autocomplete="name" value="${escapeHtml(displayName)}" required></label>
              <label><span>Email</span><input type="email" value="${escapeHtml(session.email)}" disabled aria-describedby="account-email-note"></label>
              <small id="account-email-note">Email changes require a separately verified Identity callback and are not enabled in this preview.</small>
              <button class="button button-primary" type="submit">Save profile</button>
            </form>` : `
            <div class="account-life-empty"><strong>No active session</strong><p>Use an invited FlipForge account to view and manage the staging profile.</p><a class="button button-primary" href="${signInUrl()}">Open secure sign in</a></div>`}</div>
        </section>

        <section class="panel">
          <header class="panel-header"><div><h2>Security and recovery</h2><p>Identity controls stay separate from FlipForge intelligence authority.</p></div></header>
          <div class="panel-body">
            <div class="security-list">
              <div class="security-row"><span><strong>Authentication transport</strong><small>No raw JWT is displayed or stored by this UI.</small></span><strong>Secure cookie</strong></div>
              <div class="security-row"><span><strong>Tenant assignment</strong><small>Browser inputs cannot select or alter a tenant.</small></span><strong>Signed roles</strong></div>
              <div class="security-row"><span><strong>Password recovery</strong><small>Recovery responses never confirm whether an account exists.</small></span><strong>${signedIn ? "Available" : "Use sign-in page"}</strong></div>
              <div class="security-row"><span><strong>Provider credentials</strong><small>No API-key field exists in the customer browser.</small></span><strong>Server only</strong></div>
            </div>
            <div class="page-actions account-life-actions">${signedIn
              ? `<button class="button button-secondary" type="button" data-account-recovery>Send password recovery</button><button class="button button-secondary" type="button" data-account-signout>Sign out</button>`
              : `<a class="button button-secondary" href="${signInUrl()}">Sign in or recover password</a>`}</div>
          </div>
        </section>
      </div>

      <section class="panel account-life-entitlements">
        <header class="panel-header"><div><h2>Entitlement boundary</h2><p>Capabilities are not inferred from the browser, a plan name, or a mock usage meter.</p></div></header>
        <div class="panel-body entitlement-grid">
          <article class="entitlement-card" data-enabled="${session.membershipActive}"><h3>Staging decision intelligence</h3><p>Requires an authenticated account and active signed tenant membership.</p><span class="entitlement-state">${session.membershipActive ? "Staging access" : "Unavailable"}</span></article>
          <article class="entitlement-card" data-enabled="false"><h3>Paid subscription</h3><p>No billing provider or paid-plan authority is connected.</p><span class="entitlement-state">Unavailable</span></article>
          <article class="entitlement-card" data-enabled="false"><h3>Provider administration</h3><p>Customer accounts never receive provider credential authority.</p><span class="entitlement-state">Excluded</span></article>
          <article class="entitlement-card" data-enabled="false"><h3>Transaction execution</h3><p>No bid, purchase, checkout, payment, listing, or resale action exists.</p><span class="entitlement-state">Excluded</span></article>
        </div>
      </section>
    </div>`;

    bind(session);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function message(text, tone = "neutral") {
    const element = document.querySelector("[data-account-message]");
    if (!element) return;
    element.textContent = text;
    element.dataset.tone = tone;
  }

  function bind(session) {
    const api = identityApi();
    document.querySelector("[data-account-profile-form]")?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type='submit']");
      button.disabled = true;
      message("Saving profile…");
      try {
        await api.updateProfile(new FormData(event.currentTarget).get("fullName"));
        render();
        message("Profile updated.", "ok");
      } catch (error) {
        message(error instanceof Error ? error.message : "The profile could not be updated.", "error");
        button.disabled = false;
      }
    });

    document.querySelectorAll("[data-account-recovery]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      message("Requesting password recovery…");
      try {
        const result = await api.requestRecovery(session.email);
        message(result, "ok");
      } catch (_) {
        message("If that invited account exists, a password-recovery email has been sent.", "ok");
      } finally {
        button.disabled = false;
      }
    }));

    document.querySelectorAll("[data-account-signout]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      message("Signing out…");
      try {
        await api.signOut();
        render();
      } catch (error) {
        message(error instanceof Error ? error.message : "Sign out failed.", "error");
        button.disabled = false;
      }
    }));
  }

  window.addEventListener("hashchange", () => window.requestAnimationFrame(render));
  window.addEventListener("flipforge:identity-change", () => window.requestAnimationFrame(render));
  window.requestAnimationFrame(render);
})();
