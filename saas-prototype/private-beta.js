(() => {
  "use strict";

  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const ROUTE = "beta-start";
  const ONBOARDING_KEY = "flipforge.privateBeta.onboarding.v1";
  const ONBOARDING_VALUE = "complete";
  const FORM_NAME = "flipforge-private-beta-feedback";

  function eligibleHost() {
    return PREVIEW_HOST.test(String(window.location.hostname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard").replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
  }

  function onBetaRoute() {
    return routeName() === ROUTE;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function identitySnapshot() {
    return window.FlipForgeIdentity && typeof window.FlipForgeIdentity.getSnapshot === "function"
      ? window.FlipForgeIdentity.getSnapshot()
      : { authenticated: false, email: "", fullName: "", membershipActive: false, membershipConfigured: false };
  }

  function initials(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.length ? parts.map(part => part.charAt(0).toUpperCase()).join("") : "FF";
  }

  function syncShell(session = identitySnapshot()) {
    if (!eligibleHost()) return;
    const displayName = session.fullName || (session.authenticated ? "Invited tester" : "Private beta");
    const access = session.membershipActive ? "Active tester" : session.authenticated ? "Access pending" : "Sign in required";
    document.querySelectorAll(".account-link .avatar, .profile-button .avatar").forEach(element => {
      element.textContent = initials(displayName);
    });
    const accountCopy = document.querySelector(".account-link span:nth-child(2)");
    if (accountCopy) accountCopy.innerHTML = `<strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(access)}</small>`;
    const profileCopy = document.querySelector(".profile-button .profile-copy");
    if (profileCopy) profileCopy.innerHTML = `<strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(access)}</small>`;
  }

  function preferenceComplete() {
    try {
      return window.localStorage.getItem(ONBOARDING_KEY) === ONBOARDING_VALUE;
    } catch (_) {
      return false;
    }
  }

  function completePreference() {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, ONBOARDING_VALUE);
    } catch (_) {
      // The guide remains usable when browser preference storage is unavailable.
    }
  }

  function resetPreference() {
    try {
      window.localStorage.removeItem(ONBOARDING_KEY);
    } catch (_) {
      // No authoritative account or evaluation state depends on this preference.
    }
  }

  function statusCard(label, value, detail, tone = "neutral", attribute = "") {
    return `<article class="private-beta-status-card" data-tone="${escapeHtml(tone)}" ${attribute}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function sessionState(session) {
    if (!session.authenticated) return ["Sign-in required", "Use an invited FlipForge account.", "warn"];
    if (!session.membershipActive) return ["Membership inactive", "An administrator must assign one active tenant role.", "warn"];
    return ["Active tester", "Signed in with an administrator-approved tenant membership.", "ok"];
  }

  function bridgeState(health) {
    if (!health) return ["Checking", "Reading the same-origin gateway health contract.", "neutral"];
    if (health.error) return ["Unavailable", "No customer data request was attempted and no mock response was substituted.", "warn"];
    if (health.data?.status === "configured" && health.data?.bridgeEnabled) {
      return ["Available", "The tenant-scoped customer intelligence path is enabled for this preview.", "ok"];
    }
    return ["Safely offline", "The preview bridge is disabled between controlled beta sessions.", "warn"];
  }

  function showBanner() {
    const banner = document.querySelector(".prototype-banner");
    if (!banner) return;
    const title = banner.querySelector("strong");
    const copy = banner.querySelector("span");
    if (title) title.textContent = "PRIVATE BETA GUIDE";
    if (copy) copy.textContent = "Invitation only · Controlled customer intelligence · No billing or transaction authority";
  }

  function feedbackForm(session) {
    const signedIn = session.authenticated && session.membershipActive;
    return `<form class="private-beta-feedback-form" data-private-beta-feedback>
      <input type="hidden" name="form-name" value="${FORM_NAME}">
      <div class="private-beta-feedback-row">
        <label>Feedback type
          <select name="category" required>
            <option value="workflow">Workflow</option>
            <option value="decision-explanation">Decision explanation</option>
            <option value="evidence">Evidence</option>
            <option value="psa-guidance">PSA guidance</option>
            <option value="accessibility">Accessibility</option>
            <option value="bug">Bug</option>
          </select>
        </label>
        <label>Experience rating
          <select name="rating">
            <option value="">Optional</option>
            <option value="1">1 — Blocked</option>
            <option value="2">2 — Difficult</option>
            <option value="3">3 — Usable</option>
            <option value="4">4 — Clear</option>
            <option value="5">5 — Excellent</option>
          </select>
        </label>
      </div>
      <label>What happened?
        <textarea name="summary" maxlength="2000" required placeholder="Describe the workflow, wording, or behavior that helped or blocked you."></textarea>
      </label>
      <label>What did you expect instead?
        <textarea name="expected" maxlength="1200" placeholder="Optional: describe what a clearer or better outcome would look like."></textarea>
      </label>
      <label class="private-beta-consent"><input type="checkbox" name="contactAllowed" value="yes"><span>FlipForge may include my invited account email with this feedback and follow up about it.</span></label>
      <p class="private-beta-feedback-note">Do not paste passwords, access tokens, provider keys, tenant IDs, card listing URLs, card identities, or other sensitive data. This form records product feedback—not an evaluation.</p>
      <div class="page-actions"><button class="button button-primary" type="submit" ${signedIn ? "" : "disabled"}>Send beta feedback</button></div>
      <p class="private-beta-message" data-private-beta-message role="status" aria-live="polite">${signedIn ? "" : "Sign in with an active invitation before sending feedback."}</p>
    </form>`;
  }

  function pageMarkup(session, health) {
    const [accessValue, accessDetail, accessTone] = sessionState(session);
    const [bridgeValue, bridgeDetail, bridgeTone] = bridgeState(health);
    const introComplete = preferenceComplete();
    const displayName = session.fullName || "FlipForge tester";

    return `<div class="page private-beta-page" data-private-beta-readiness>
      <header class="page-heading">
        <div><span class="eyebrow">Controlled customer testing</span><h1>Private Beta Guide</h1><p>Use one real path, understand the authority boundaries, and tell us exactly where the experience succeeds or fails.</p></div>
        <div class="page-actions"><a class="button button-primary" href="#/discover" data-private-beta-start>Start with Discover</a><a class="button button-secondary" href="#/evaluate">Manual evaluate</a></div>
      </header>

      <div class="boundary-note"><strong>Beta boundary:</strong> Smart Opportunity remains the sole recommendation authority, Existing PSA intelligence remains the sole grading-guidance authority, and SQLite remains the source of truth. Discover ranks active listings only; no public signup, billing, paid entitlement, provider administration, or transaction execution is active.</div>

      <section class="panel private-beta-hero">
        <div class="panel-body">
          <div class="private-beta-hero-copy"><span class="eyebrow">Welcome, ${escapeHtml(displayName)}</span><h2>Find one card. Evaluate it. Follow the evidence.</h2><p>Use Discover to search currently connected active-listing sources or enter a listing manually. Then test whether FlipForge makes the reasoning behind the saved card decision clear, traceable, and useful before you buy.</p></div>
          <div class="private-beta-progress"><span>First-run guide</span><strong>${introComplete ? "Completed" : "Ready"}</strong><small>This status is a non-sensitive browser preference only. It does not change your account, membership, evaluations, or entitlements.</small><button class="button button-secondary" type="button" data-private-beta-${introComplete ? "reset" : "complete"}>${introComplete ? "Show guide next time" : "Mark guide complete"}</button></div>
        </div>
      </section>

      <section class="private-beta-status-grid" aria-label="Private beta status">
        ${statusCard("Tester access", accessValue, accessDetail, accessTone)}
        ${statusCard("Customer API", bridgeValue, bridgeDetail, bridgeTone, "data-private-beta-bridge")}
        ${statusCard("Data authority", "SQLite saved", "Evaluations and tracked opportunities use the existing tenant-owned source of truth.", "ok")}
        ${statusCard("Production", "Inactive", "This customer path remains restricted to approved deploy previews.", "neutral")}
      </section>

      <div class="private-beta-grid">
        <div class="stack">
          <section class="panel">
            <header class="panel-header"><div><h2>Tester walkthrough</h2><p>Use this sequence so feedback maps to the actual customer decision loop.</p></div></header>
            <div class="panel-body private-beta-steps">
              <div class="private-beta-step"><span class="private-beta-step-number">1</span><span class="private-beta-step-copy"><span>Discover</span><strong>Search one exact card</strong><small>Search approved connected active-listing sources. Discovery score ranks returned listings only; it is not BUY/WATCH/VERIFY/PASS and searches are not saved.</small></span><a class="button button-secondary" href="#/discover">Discover</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">2</span><span class="private-beta-step-copy"><span>Evaluate</span><strong>Submit one listing to Smart Opportunity</strong><small>Choose a Discover result or enter the listing manually. The authoritative backend—not the browser—creates and saves the recommendation.</small></span><a class="button button-secondary" href="#/evaluate">Manual option</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">3</span><span class="private-beta-step-copy"><span>Understand</span><strong>Open Card Intelligence</strong><small>Review the saved value gap, confidence, liquidity, risk, rank, evidence eligibility, and PSA context.</small></span><a class="button button-secondary" href="#/opportunities">Tracked cards</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">4</span><span class="private-beta-step-copy"><span>Trace</span><strong>Challenge the Decision Traceback</strong><small>Confirm that identity, completed-sale evidence, market factors, and the final authority output tell one coherent story.</small></span><a class="button button-secondary" href="#/opportunities">Review</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">5</span><span class="private-beta-step-copy"><span>Compare</span><strong>Compare two saved decisions</strong><small>Review returned factors side by side without asking the browser to rerank, rescore, or choose a winner.</small></span><a class="button button-secondary" href="#/compare">Compare</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">6</span><span class="private-beta-step-copy"><span>Manage</span><strong>Review Evidence, PSA, and exit context</strong><small>Inspect saved evidence history, saved PSA requirements, and exit-planning inputs without creating a new recommendation.</small></span><a class="button button-secondary" href="#/evidence">Manage</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">7</span><span class="private-beta-step-copy"><span>Export</span><strong>Create a Decision Dossier</strong><small>Package the saved decision, governed evidence, PSA context, and lifecycle history with a SHA-256 integrity manifest.</small></span><a class="button button-secondary" href="#/export">Export</a></div>
              <div class="private-beta-step"><span class="private-beta-step-number">8</span><span class="private-beta-step-copy"><span>Report</span><strong>Send focused feedback</strong><small>Tell us what was clear, what was missing, and what would have changed your decision.</small></span><button class="button button-secondary" type="button" data-private-beta-feedback-link>Feedback</button></div>
            </div>
          </section>

          <section class="panel" id="beta-feedback">
            <header class="panel-header"><div><h2>Beta feedback</h2><p>Structured feedback is captured by the approved Netlify form and stays separate from evaluation data.</p></div></header>
            <div class="panel-body">${feedbackForm(session)}</div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <header class="panel-header"><div><h2>What is real now</h2><p>Current deploy-preview customer capabilities.</p></div></header>
            <div class="panel-body private-beta-limit-list">
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Invitation and recovery</strong><small>Secure sign-in, activation, password recovery, session state, and profile updates.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Discover → Evaluate → Intelligence → Traceback → Compare → Track</strong><small>Provider-backed active-listing search, tenant-scoped reads/writes, and comparison use the proven same-origin staging gateway when enabled.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Evidence-aware discovery boundary</strong><small>Discover may compare active asking costs with existing trusted completed-sale context, but active listings never become sold evidence and Discovery score never becomes a recommendation.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Evidence and saved PSA context</strong><small>Returned authority state is displayed without browser-side acceptance, rescoring, or grade prediction.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Evidence Center → PSA Advisor → Exit Review</strong><small>Saved evidence history, PSA requirements, and exit-planning inputs use tenant-scoped reads with no mock fallback.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Tracking → Portfolio → Alerts</strong><small>Watch state, review timing, acquisition or pass outcomes, cost basis, and in-app reminders persist through tenant-scoped SQLite lifecycle records.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Decision Dossier audit export</strong><small>One complete tenant-owned decision package includes the saved authority output, evidence, PSA context, lifecycle history, and a SHA-256 payload digest.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Tenant isolation</strong><small>Membership comes only from signed server roles; the browser cannot choose a tenant.</small></span></div>
            </div>
          </section>

          <section class="panel">
            <header class="panel-header"><div><h2>Known beta limits</h2><p>These are not hidden behind mock plan language.</p></div></header>
            <div class="panel-body private-beta-limit-list">
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Connected-source scope</strong><small>Discover ranks listings returned by currently connected approved sources. It does not claim to search every marketplace or the entire card market.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Provider may be unavailable</strong><small>If the authorized active-listing source is not configured for a session, Discover shows an honest unavailable state with no sample fallback. Manual Evaluate remains available.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Current value and performance remain unavailable</strong><small>Portfolio stores customer cost basis only; it does not invent current value, gain, loss, fees, taxes, or liquidation proceeds.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>External alert delivery is not connected</strong><small>Review reminders are in-app only. Email, SMS, push, and marketplace actions remain disabled.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Bridge may be offline</strong><small>The customer API stays disabled between approved testing sessions.</small></span></div>
              <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>No billing or transactions</strong><small>No paid limits, checkout, payment, purchase, listing, sale, or marketplace action is active.</small></span></div>
            </div>
          </section>
        </div>
      </div>
    </div>`;
  }

  function setMessage(text, tone = "neutral") {
    const message = document.querySelector("[data-private-beta-message]");
    if (!message) return;
    message.textContent = text;
    message.dataset.tone = tone;
  }

  async function loadHealth() {
    try {
      const response = await fetch("/api/v1/health", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) return { error: true };
      return body;
    } catch (_) {
      return { error: true };
    }
  }

  function bind(session) {
    document.querySelector("[data-private-beta-complete]")?.addEventListener("click", () => {
      completePreference();
      render();
    });

    document.querySelector("[data-private-beta-reset]")?.addEventListener("click", () => {
      resetPreference();
      render();
    });

    document.querySelector("[data-private-beta-start]")?.addEventListener("click", completePreference);

    document.querySelector("[data-private-beta-feedback-link]")?.addEventListener("click", () => {
      document.querySelector("#beta-feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.querySelector("[data-private-beta-feedback]")?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!session.authenticated || !session.membershipActive) {
        setMessage("An active invited account is required before feedback can be sent.", "error");
        return;
      }

      const form = event.currentTarget;
      const button = form.querySelector("button[type='submit']");
      const input = new FormData(form);
      const summary = String(input.get("summary") || "").trim();
      if (!summary || summary.length > 2000) {
        setMessage("Enter a feedback summary of no more than 2,000 characters.", "error");
        return;
      }

      const payload = new URLSearchParams();
      ["form-name", "category", "rating", "summary", "expected", "contactAllowed"].forEach(name => {
        const value = String(input.get(name) || "").trim();
        if (value) payload.set(name, value);
      });
      if (input.get("contactAllowed") === "yes" && session.email) {
        payload.set("testerEmail", session.email);
      }
      payload.set("route", routeName());

      button.disabled = true;
      setMessage("Sending beta feedback…");
      try {
        const response = await fetch("/", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: payload.toString()
        });
        if (!response.ok) throw new Error("Feedback endpoint rejected the submission.");
        form.reset();
        setMessage("Feedback received. Thank you for testing the reasoning—not just the result.", "ok");
      } catch (_) {
        setMessage("Feedback could not be sent. Your evaluation data was not affected; try again later.", "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  async function render() {
    if (!eligibleHost() || !onBetaRoute()) return false;
    const main = document.querySelector("#main-content");
    if (!main) return false;
    const session = identitySnapshot();
    syncShell(session);
    showBanner();
    main.innerHTML = pageMarkup(session, null);
    bind(session);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });

    const health = await loadHealth();
    if (!onBetaRoute()) return true;
    const latestSession = identitySnapshot();
    main.innerHTML = pageMarkup(latestSession, health);
    bind(latestSession);
    return true;
  }

  function maybeStartFirstRun() {
    if (!eligibleHost() || preferenceComplete() || onBetaRoute()) return;
    const route = routeName();
    if (route === "staging" || route === "staging-evaluate") return;
    const session = identitySnapshot();
    syncShell(session);
    if (session.authenticated && session.membershipActive) {
      window.location.hash = "#/beta-start";
    }
  }

  window.FlipForgePrivateBeta = Object.freeze({
    isEligible: eligibleHost,
    render,
    preferenceComplete
  });

  window.addEventListener("hashchange", () => window.requestAnimationFrame(render));
  window.addEventListener("flipforge:identity-change", () => {
    window.requestAnimationFrame(() => {
      syncShell();
      if (onBetaRoute()) render();
      else maybeStartFirstRun();
    });
  });
  window.requestAnimationFrame(() => {
    syncShell();
    if (onBetaRoute()) render();
    else maybeStartFirstRun();
  });
})();
