(() => {
  "use strict";

  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const ROUTE = "beta-start";
  const ONBOARDING_KEY = "flipforge.privateBeta.onboarding.v1";
  const ONBOARDING_VALUE = "complete";
  const FEEDBACK_ENDPOINT = "/api/beta/feedback";
  let firstRunNavigationHandled = false;
  // A feedback draft handed over by another screen (for example "Request evidence for
  // this card" in Discover). Held only in memory for this page session, applied to the
  // form when the guide renders, and cleared once the guide has rendered with it.
  let pendingFeedbackDraft = null;
  // The card reference of an evidence request: only confirmed card-identity fields, held in
  // memory while the tester reviews them, cleared on send, on removal, or on leaving the guide.
  let activeCardReference = null;
  const CARD_REFERENCE_SOURCE = "DISCOVER_EXACT_SEARCH";
  const CARD_REFERENCE_TEXT_FIELDS = Object.freeze([
    ["identity", "Card", 200],
    ["year", "Year", 7],
    ["player", "Player", 80],
    ["set", "Set", 120],
    ["cardNumber", "Card number", 24],
    ["parallel", "Parallel or variation", 80]
  ]);
  const CARD_REFERENCE_GRADERS = Object.freeze(["PSA", "BGS", "SGC", "CGC", "CSG", "TAG", "BCCG", "RAW"]);
  const CARD_REFERENCE_GRADES = Object.freeze(["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "AUTHENTIC"]);
  const CARD_REFERENCE_UNSAFE = [/[a-z][a-z0-9+.-]*:\/\//i, /\bwww\./i, /\b[a-z0-9-]+\.(?:com|net|org|io|co|us|uk|ca|de|ly|app|shop|store|me|gg)\b/i, /@/, /\d{9,}/, /[<>{}\\`]/, /[$€£¥]/];
  const FEEDBACK_DRAFT_CATEGORIES = new Set(["workflow", "decision-explanation", "evidence", "psa-guidance", "accessibility", "bug"]);

  function productionHost() {
    return PRODUCTION_HOST.test(String(window.location.hostname || ""));
  }

  function eligibleHost() {
    const hostname = String(window.location.hostname || "");
    const pathname = String(window.location.pathname || "");
    // The beta guide is included in both HTML shells for historical reasons.
    // Only the dedicated /app/beta route owns its post-sign-in onboarding jump.
    // NEVER take over /owner/customer or /app/customer after authentication.
    if (/^\/app\/beta(?:\/|$)/i.test(pathname)) {
      return PREVIEW_HOST.test(hostname) || PRODUCTION_HOST.test(hostname);
    }
    // Keep the old local/preview beta rehearsal entry working without granting
    // onboarding route authority to the full customer or owner surfaces.
    return PREVIEW_HOST.test(hostname)
      && /^\/(?:app|saas-prototype)(?:\/|$)/i.test(pathname)
      && !/^\/app\/customer(?:\/|$)/i.test(pathname);
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
      // This is an optional onboarding preference, not an access decision.
      // If browser storage is blocked, do not force a repeat beta-start jump
      // on every navigation after a successful sign-in.
      return true;
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
      return ["Available", "The tenant-scoped customer intelligence path is enabled for this private-beta session.", "ok"];
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

  function cleanCardValue(value, max) {
    return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }

  // Accepts only the card-identity fields; anything else a caller passes is dropped here and
  // refused by the server.
  function normalizeCardReference(input) {
    if (!input || typeof input !== "object") return null;
    const fields = {};
    for (const [name, , max] of CARD_REFERENCE_TEXT_FIELDS) fields[name] = cleanCardValue(input[name], max);
    fields.cardNumber = fields.cardNumber.replace(/^#/, "");
    const grader = cleanCardValue(input.grader, 8).toUpperCase();
    const grade = cleanCardValue(input.grade, 9).toUpperCase();
    fields.grader = CARD_REFERENCE_GRADERS.includes(grader) ? grader : "";
    fields.grade = fields.grader && fields.grader !== "RAW" && CARD_REFERENCE_GRADES.includes(grade) ? grade : "";
    if (fields.identity.length < 6) return null;
    return { prefill: Object.freeze({ ...fields }), current: { ...fields } };
  }

  function cardFieldStatus(name) {
    const prefill = activeCardReference?.prefill?.[name] || "";
    const current = activeCardReference?.current?.[name] || "";
    if (!current) return ["missing", name === "identity" ? "Required" : "Not in your search · add it if you know it"];
    if (current !== prefill) return ["edited", "Edited by you"];
    return ["search", "From your Discover search"];
  }

  function cardStatusChip(name) {
    const [tone, text] = cardFieldStatus(name);
    return `<small class="private-beta-card-chip" data-card-chip="${name}" data-tone="${tone}">${escapeHtml(text)}</small>`;
  }

  function cardReferenceMarkup() {
    if (!activeCardReference) return "";
    const current = activeCardReference.current;
    const textInputs = CARD_REFERENCE_TEXT_FIELDS.map(([name, label, max]) => `<label class="private-beta-card-field${name === "identity" ? " private-beta-card-field-wide" : ""}"><span>${escapeHtml(label)}</span>${cardStatusChip(name)}<input name="card-${name}" data-card-field="${name}" maxlength="${max}" autocomplete="off" spellcheck="false" value="${escapeHtml(current[name])}"${name === "identity" ? ' aria-required="true"' : ""}></label>`).join("");
    const graderOptions = [["", "Not stated"], ...CARD_REFERENCE_GRADERS.map(value => [value, value === "RAW" ? "Raw (ungraded)" : value])]
      .map(([value, label]) => `<option value="${value}"${current.grader === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
    const gradeOptions = [["", "Not stated"], ...CARD_REFERENCE_GRADES.map(value => [value, value === "AUTHENTIC" ? "Authentic" : value])]
      .map(([value, label]) => `<option value="${value}"${current.grade === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
    return `<fieldset class="private-beta-card-reference" data-card-reference>
        <legend>Card for this evidence request</legend>
        <p class="private-beta-card-intro">Check these details before you send. Fix anything that's wrong and add what's missing if you know it. Only the card fields below are sent: no listing link, seller, price, or sale details.</p>
        <div class="private-beta-card-grid">
          ${textInputs}
          <label class="private-beta-card-field"><span>Grader</span>${cardStatusChip("grader")}<select name="card-grader" data-card-field="grader">${graderOptions}</select></label>
          <label class="private-beta-card-field"><span>Grade</span>${cardStatusChip("grade")}<select name="card-grade" data-card-field="grade">${gradeOptions}</select></label>
        </div>
        <button class="private-beta-card-remove" type="button" data-card-reference-remove>Don't include card details</button>
      </fieldset>`;
  }

  function syncCardReferenceFromForm() {
    if (!activeCardReference) return;
    document.querySelectorAll("[data-card-reference] [data-card-field]").forEach(input => {
      const name = input.dataset.cardField;
      const field = CARD_REFERENCE_TEXT_FIELDS.find(([key]) => key === name);
      activeCardReference.current[name] = input.tagName === "SELECT"
        ? String(input.value || "")
        : cleanCardValue(input.value, field ? field[2] : 80);
    });
  }

  // Mirrors the server rules so the tester sees a specific message before sending.
  function cardReferenceProblem(reference) {
    const labelFor = name => (CARD_REFERENCE_TEXT_FIELDS.find(([key]) => key === name) || [name, name])[1];
    if (reference.identity.length < 6 || !/[A-Za-z]/.test(reference.identity)) return ["identity", "Enter the card (year, set, player and card number) before sending."];
    for (const [name] of CARD_REFERENCE_TEXT_FIELDS) {
      if (reference[name] && CARD_REFERENCE_UNSAFE.some(pattern => pattern.test(reference[name]))) {
        return [name, `${labelFor(name)} can only hold card details. Remove links, email addresses, long ID numbers, or prices.`];
      }
    }
    if (reference.year && !/^(?:18|19|20)\d{2}(?:-\d{2})?$/.test(reference.year)) return ["year", "Enter the year as 2023 or a season as 2025-26."];
    if (reference.cardNumber && !/^[A-Za-z0-9][A-Za-z0-9.\-/]{0,23}$/.test(reference.cardNumber.replace(/^#/, ""))) return ["cardNumber", "Enter the card number as printed, for example 1, US50 or BCP-12."];
    if (reference.grade && (!reference.grader || reference.grader === "RAW")) return ["grade", "Choose the grader for this grade, or clear the grade for a raw card."];
    return null;
  }

  function feedbackForm(session) {
    const signedIn = session.authenticated && session.membershipActive;
    return `<form class="private-beta-feedback-form" data-private-beta-feedback>
      <div class="private-beta-feedback-row">
        <label>Feedback type
          <select name="category" required>
            <option value="workflow">Workflow</option>
            <option value="decision-explanation">Decision explanation</option>
            <option value="evidence">Evidence</option>
            <option value="psa-guidance">PSA guidance</option>
            <option value="accessibility">Accessibility</option>
            <option value="bug">Bug</option>
            <option value="outcome-review">7 / 14 / 30 outcome review</option>
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
      <div class="private-beta-feedback-row">
        <label>Feedback timing
          <select name="checkpoint">
            <option value="GENERAL">Current session</option>
            <option value="DAY_7">Day 7 checkpoint</option>
            <option value="DAY_14">Day 14 checkpoint</option>
            <option value="DAY_30">Day 30 checkpoint</option>
          </select>
        </label>
        <label>Outcome signal
          <select name="outcome">
            <option value="">Not an outcome review</option>
            <option value="REASONING_HELD">Original reasoning still supported</option>
            <option value="REASONING_CHANGED">Original reasoning needs revision</option>
            <option value="MORE_EVIDENCE_NEEDED">Evidence remains insufficient</option>
          </select>
        </label>
      </div>
      ${cardReferenceMarkup()}
      <label>What happened?
        <textarea name="summary" maxlength="2000" required placeholder="Describe the workflow, wording, or behavior that helped or blocked you."></textarea>
      </label>
      <label>What did you expect instead?
        <textarea name="expected" maxlength="1200" placeholder="Optional: describe what a clearer or better outcome would look like."></textarea>
      </label>
      <label class="private-beta-consent"><input type="checkbox" name="contactAllowed" value="yes"><span>FlipForge may include my invited account email with this feedback and follow up about it.</span></label>
      <p class="private-beta-feedback-note">For an outcome review, choose Day 7, 14, or 30 and an outcome signal. Do not paste passwords, access tokens, provider keys, tenant IDs, card listing URLs, seller details, or other sensitive data. Send card identities only in the reviewed card fields of an evidence request. This form records tester feedback—not a new evaluation or accuracy claim.</p>
      <div class="page-actions"><button class="button button-primary" type="submit" ${signedIn ? "" : "disabled"}>Send beta feedback</button></div>
      <p class="private-beta-message" data-private-beta-message role="status" aria-live="polite">${signedIn ? "" : "Sign in with an active invitation before sending feedback."}</p>
    </form>`;
  }

  function pageMarkup(session, health) {
    const [accessValue, accessDetail, accessTone] = sessionState(session);
    const [bridgeValue, bridgeDetail, bridgeTone] = bridgeState(health);
    const introComplete = preferenceComplete();
    const liveProduction = productionHost();
    const displayName = session.fullName || "FlipForge tester";

    return `<div class="page private-beta-page private-beta-v2" data-private-beta-readiness>
      <header class="private-beta-v3-hero" aria-labelledby="private-beta-welcome">
        <div class="private-beta-v3-hero-copy">
          <span class="eyebrow">PRIVATE BETA · CARD DECISION INTELLIGENCE™</span>
          <h1 id="private-beta-welcome">Welcome to FlipForge.</h1>
          <p class="private-beta-v3-intro">FlipForge goes beyond a card's price. It checks the exact identity, examines the evidence, considers costs and uncertainty, and explains what the decision means.</p>
          <p class="private-beta-v3-intro-sub">Your first session has one job: evaluate one real card and decide whether the reasoning is clear enough to trust.</p>
          <div class="private-beta-v3-actions">
            <a class="button button-primary" href="#/discover" data-private-beta-start>Evaluate my first card</a>
            <a class="private-beta-v3-manual" href="#/evaluate">Enter a listing manually</a>
          </div>
          <p class="private-beta-v3-slogan">Before you buy. Know Why.</p>
        </div>
        <div class="private-beta-v3-brief" aria-label="What FlipForge helps you understand">
          <div><span>01</span><strong>The exact card</strong><p>Know which version and grade you're evaluating.</p></div>
          <div><span>02</span><strong>The evidence</strong><p>See what supports the result—and what does not.</p></div>
          <div><span>03</span><strong>The decision</strong><p>Understand the reasoning and what to check next.</p></div>
        </div>
      </header>

      <section class="private-beta-v3-next" aria-label="Optional first-session information">
              <details class="private-beta-v2-details private-beta-v3-expander private-beta-v3-guide" data-private-beta-first-card>
        <summary><span><strong>Want a little help with your first card?</strong><small>Optional four-step walkthrough: find, evaluate, understand, report.</small></span><b aria-hidden="true">＋</b></summary>
        <div class="private-beta-v3-expander-body">
          <p class="eyebrow">Private Beta Guide · First Session</p>\n          <p class="private-beta-v3-guide-hint">Start with Discover, or enter a listing manually. This guide is here if you need it.</p>
      <section class="private-beta-v2-mission" aria-labelledby="private-beta-mission-title">
        <div class="private-beta-v2-mission-copy">
          <span class="private-beta-v2-number">01</span>
          <div>
            <span class="eyebrow">START HERE</span>
            <h2 id="private-beta-mission-title">Evaluate one card from start to finish.</h2>
            <p>Do not try to learn every FlipForge feature today. Use one card you genuinely understand, follow the evidence, read the decision, and open the Decision Receipt.</p>
            <div class="private-beta-v2-mission-actions">
              <a class="button button-primary" href="#/discover" data-private-beta-start>Find my first card</a>
              <a class="button button-secondary" href="#/decision-intelligence">How Card Decision Intelligence works</a>
            </div>
          </div>
        </div>

      </section>


      <section class="panel private-beta-v2-walkthrough">
        <header class="panel-header">
          <div>
            <span class="eyebrow">YOUR FIRST DECISION</span>
            <h2>Tester walkthrough</h2>
            <p>Four stages. One card. Follow them in order.</p>
          </div>
        </header>
        <div class="panel-body private-beta-v2-journey">
          <article class="private-beta-v2-stage">
            <span class="private-beta-v2-stage-number">1</span>
            <div><span>FIND</span><strong>Search one exact card</strong><p>Use Discover and choose the exact identity. Discovery score ranks returned active listings only; it is not BUY/WATCH/VERIFY/PASS and searches are not saved.</p></div>
            <a class="button button-secondary" href="#/discover">Open Discover</a>
          </article>
          <article class="private-beta-v2-stage">
            <span class="private-beta-v2-stage-number">2</span>
            <div><span>EVALUATE</span><strong>Submit one listing to Smart Opportunity</strong><p>Choose a Discover result or enter the listing manually. The authoritative backend—not the browser—creates and saves the recommendation.</p></div>
            <a class="button button-secondary" href="#/evaluate">Manual option</a>
          </article>
          <article class="private-beta-v2-stage">
            <span class="private-beta-v2-stage-number">3</span>
            <div><span>UNDERSTAND</span><strong>Open Card Intelligence</strong><p>Read Decision → Value → Risk → Why → Evidence. Then Challenge the Decision Traceback and open the Decision Receipt to see what the result preserves.</p></div>
            <a class="button button-secondary" href="#/opportunities">Saved Decisions</a>
          </article>
          <article class="private-beta-v2-stage">
            <span class="private-beta-v2-stage-number">4</span>
            <div><span>REPORT</span><strong>Send focused feedback</strong><p>Tell us what was immediately clear, what made you hesitate, and what information you expected but could not find.</p></div>
            <button class="button button-secondary" type="button" data-private-beta-feedback-link>Give feedback</button>
          </article>
        </div>
      </section>


        </div>
      </details>

      </section>

      <section class="private-beta-v3-reference" aria-labelledby="private-beta-v3-reference-title">
        <div class="private-beta-v3-reference-intro">
          <span class="eyebrow">EXPLORE WHEN YOU'RE READY</span>
          <h2 id="private-beta-v3-reference-title">More about your workspace.</h2>
          <p>All the details are here when you need them. You can start with one card without reading them first.</p>
        </div>
        <div class="private-beta-v3-reference-links">
      <details class="private-beta-v2-details private-beta-v3-expander" data-private-beta-boundary>
        <summary><span><strong>What FlipForge does—and doesn't do</strong><small>Decision authority, evidence limits, and no transaction execution.</small></span><b aria-hidden="true">＋</b></summary>
        <div class="private-beta-v3-expander-body">      <aside class="private-beta-v2-boundary">
        <div><span class="eyebrow">AUTHORITY BOUNDARY</span><strong>FlipForge explains a governed decision. It does not execute one.</strong></div>
        <p>Smart Opportunity remains the sole recommendation authority, Existing PSA intelligence remains the sole grading-guidance authority, and SQLite remains the source of truth. Discover ranks active listings only; no public signup, billing, paid entitlement, provider administration, or transaction execution is active.</p>
      </aside>

</div>
      </details>

          <details class="private-beta-v2-details private-beta-v3-expander" data-private-beta-account-details>
            <summary><span><strong>Your access and guide settings</strong><small>Access: ${escapeHtml(accessValue)} · Evaluation system: ${escapeHtml(bridgeValue)}</small></span><b aria-hidden="true">＋</b></summary>
            <div class="private-beta-v3-expander-body">
      <section class="private-beta-v2-status" aria-label="Private beta readiness">
        ${statusCard("Your access", accessValue, accessDetail, accessTone)}
        ${statusCard("Evaluation system", bridgeValue, bridgeDetail, bridgeTone, "data-private-beta-bridge")}
        ${statusCard("Saved decisions", "SQLite source of truth", "Your evaluations and tracked decisions stay tenant-owned and server-backed.", "ok")}
        ${statusCard("Customer access", liveProduction ? "Live private beta" : "Deploy preview", liveProduction ? "Available only to invited testers with active membership." : "Controlled preview used before production promotion.", liveProduction ? "ok" : "neutral")}
      </section>


        <div class="private-beta-v2-guide-state">
          <span>First-run guide</span>
          <strong>${introComplete ? "Completed" : "Ready"}</strong>
          <small>This only controls whether this introduction opens automatically. It does not change your account or saved decisions.</small>
          <button class="button button-secondary" type="button" data-private-beta-${introComplete ? "reset" : "complete"}>${introComplete ? "Show this guide next time" : "Don't show this guide automatically again"}</button>
        </div>
            </div>
          </details>
          <details class="private-beta-v2-details private-beta-v3-expander" data-private-beta-record-details>
            <summary><span><strong>How your decision is saved</strong><small>Identity, evidence, Decision Receipt and outcome history—all connected.</small></span><b aria-hidden="true">＋</b></summary>
            <div class="private-beta-v3-expander-body">
      <section class="private-beta-record-system" aria-labelledby="private-beta-record-title" data-private-beta-record-system>
        <header class="private-beta-record-head">
          <div>
            <span class="eyebrow">YOUR FLIPFORGE RECORD</span>
            <h2 id="private-beta-record-title">One evaluation becomes a structured decision record.</h2>
            <p>FlipForge does not throw away the reasoning after it returns a verdict. The exact identity, qualified evidence, governed decision, receipt, and later outcome checkpoints stay connected as one tenant-owned server record.</p>
          </div>
          <span class="private-beta-record-badge">SERVER-BACKED · TRACEABLE</span>
        </header>
        <div class="private-beta-record-map" aria-label="FlipForge persistent decision record system">
          <div class="private-beta-record-rail">
            <article class="private-beta-record-node">
              <span>01 · IDENTITY RECORD</span>
              <strong>Exact card</strong>
              <small>Year · product · card number · parallel · grader · grade</small>
            </article>
            <article class="private-beta-record-node">
              <span>02 · EVIDENCE RECORD</span>
              <strong>Qualified evidence</strong>
              <small>Accepted, review, rejected, source, match reason, and exclusions stay traceable.</small>
            </article>
          </div>
          <article class="private-beta-record-core">
            <div class="private-beta-record-stack" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
            <span>STRUCTURED DECISION RECORD</span>
            <strong>One source of truth for the decision.</strong>
            <p>Tenant-owned · server-backed SQLite · browser does not become the authority</p>
            <div class="private-beta-record-fields" aria-label="Decision record layers">
              <small>Identity</small><small>Evidence</small><small>Economics</small><small>Risk</small><small>Decision</small>
            </div>
          </article>
          <div class="private-beta-record-rail">
            <article class="private-beta-record-node">
              <span>03 · DECISION RECEIPT</span>
              <strong>What FlipForge knew</strong>
              <small>The verdict and reason trail remain inspectable instead of collapsing into one score.</small>
            </article>
            <article class="private-beta-record-node">
              <span>04 · OUTCOME HISTORY</span>
              <strong>What happened later</strong>
              <small>Day 7 / 14 / 30 observations attach to the original record without rewriting Day 0.</small>
            </article>
          </div>
        </div>
        <footer class="private-beta-record-footer">
          <span>Saved Decisions</span><b>→</b><span>Decision Receipt</span><b>→</b><span>Outcome Intelligence</span><b>→</b><span>Decision Dossier</span>
        </footer>
      </section>


            </div>
          </details>
      <section class="private-beta-v2-secondary" aria-label="Secondary beta information">
        <details class="private-beta-v2-details">
          <summary><span><strong>What is available now</strong><small>Open this when you want to explore beyond your first decision.</small></span><b aria-hidden="true">＋</b></summary>
          <div class="private-beta-v2-details-body private-beta-limit-list">
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Discover → Evaluate → Intelligence → Traceback → Compare → Track</strong><small>Provider-backed active-listing search, tenant-scoped reads/writes, and comparison use the approved same-origin customer gateway when enabled.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Evidence-aware discovery boundary</strong><small>Active listings never become sold evidence and Discovery score never becomes a recommendation.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Evidence Center → PSA Advisor → Exit Review</strong><small>Saved evidence and PSA context remain server-owned; these tools do not add browser-side evidence acceptance, rescoring, grade prediction, or transaction authority.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Tracking → Portfolio → Alerts</strong><small>Lifecycle state, cost basis, evidence-supported reference context, and in-app reminders use tenant-scoped saved records.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Compare two saved decisions</strong><small>Compare returned factors side by side without asking the browser to choose a winner.</small><a class="panel-link" href="#/compare">Open Compare →</a></span></div>
            <div class="private-beta-limit"><span class="check-mark ok">✓</span><span><strong>Create a Decision Dossier</strong><small>Export one complete saved decision with governed evidence, PSA context, lifecycle history, and integrity manifest.</small></span></div>
          </div>
        </details>

        <details class="private-beta-v2-details">
          <summary><span><strong>Known beta limits</strong><small>What FlipForge intentionally does not pretend to do.</small></span><b aria-hidden="true">＋</b></summary>
          <div class="private-beta-v2-details-body private-beta-limit-list">
            <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Connected-source scope</strong><small>Discover ranks listings returned by currently connected approved sources. It does not claim complete-market coverage.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Provider may be unavailable</strong><small>If the active-listing source is unavailable, Discover shows an honest unavailable state with no sample fallback. Manual Evaluate remains available.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>Current value stays unavailable when evidence gates fail</strong><small>FlipForge does not invent a value for uncovered holdings or turn weak evidence into false precision.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>External alerts are not connected</strong><small>Review reminders are in-app only. Email, SMS, push, and marketplace actions remain disabled.</small></span></div>
            <div class="private-beta-limit"><span class="check-mark warn">!</span><span><strong>No billing or transactions</strong><small>No paid limits, checkout, payment, purchase, listing, sale, or marketplace action is active.</small></span></div>
          </div>
        </details>
      </section>


        </div>
      </section>

      <details class="private-beta-v2-details private-beta-v2-feedback private-beta-v3-feedback" id="beta-feedback"${pendingFeedbackDraft ? " open" : ""}>
        <summary><span><span class="eyebrow">AFTER YOU TRY ONE CARD</span><strong>Beta feedback</strong><small>Tell us where the experience was clear, confusing, incomplete, or unexpectedly useful.</small></span><b aria-hidden="true">＋</b></summary>
        <div class="private-beta-v3-feedback-body">${feedbackForm(session)}</div>
      </details>

    </div>`;
  }

  function scrollToFeedback() {
    const section = document.querySelector("#beta-feedback");
    if (!section) return;
    section.open = true;
    document.querySelector("#beta-feedback")?.scrollIntoView({ behavior: "instant", block: "start" });
    document.querySelector("[data-private-beta-feedback] [name='summary']")?.focus({ preventScroll: true });
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

  function applyPendingFeedbackDraft() {
    const draft = pendingFeedbackDraft;
    const form = document.querySelector("[data-private-beta-feedback]");
    if (!draft || !form) return false;
    if (draft.category && form.elements.category) form.elements.category.value = draft.category;
    if (draft.summary && form.elements.summary) form.elements.summary.value = draft.summary;
    if (draft.expected && form.elements.expected) form.elements.expected.value = draft.expected;
    return true;
  }

  function requestFeedback(draft = {}) {
    const category = FEEDBACK_DRAFT_CATEGORIES.has(String(draft.category || "")) ? String(draft.category) : "workflow";
    pendingFeedbackDraft = Object.freeze({
      category,
      summary: String(draft.summary || "").slice(0, 2000),
      expected: String(draft.expected || "").slice(0, 1200)
    });
    activeCardReference = category === "evidence" ? normalizeCardReference(draft.cardReference) : null;
    if (onBetaRoute()) render();
    else window.location.hash = `#/${ROUTE}`;
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
      scrollToFeedback();
    });

    document.querySelectorAll("[data-card-reference] [data-card-field]").forEach(input => {
      const update = () => {
        syncCardReferenceFromForm();
        const name = input.dataset.cardField;
        const chip = document.querySelector(`[data-card-chip="${name}"]`);
        if (!chip) return;
        const [tone, text] = cardFieldStatus(name);
        chip.dataset.tone = tone;
        chip.textContent = text;
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });

    document.querySelector("[data-card-reference-remove]")?.addEventListener("click", () => {
      activeCardReference = null;
      document.querySelector("[data-card-reference]")?.remove();
      setMessage("Card details removed. This will be sent as general evidence feedback.");
      document.querySelector("[data-private-beta-feedback] [name='summary']")?.focus();
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

      const category = String(input.get("category") || "");
      const checkpoint = String(input.get("checkpoint") || "GENERAL");
      const outcome = String(input.get("outcome") || "");
      if (category === "outcome-review" && (checkpoint === "GENERAL" || !outcome)) {
        setMessage("Choose a Day 7, 14, or 30 checkpoint and an outcome signal.", "error");
        return;
      }

      const payload = {};
      ["category", "rating", "summary", "expected", "contactAllowed", "checkpoint", "outcome"].forEach(name => {
        const value = String(input.get(name) || "").trim();
        if (value) payload[name] = value;
      });
      payload.route = routeName();

      // An evidence request carries only the card fields the tester has just reviewed.
      syncCardReferenceFromForm();
      const cardReference = activeCardReference ? { ...activeCardReference.current } : null;
      if (cardReference) {
        if (payload.category !== "evidence") {
          setMessage("A card evidence request uses the Evidence feedback type. Choose Evidence, or remove the card details.", "error");
          form.elements.category?.focus();
          return;
        }
        const problem = cardReferenceProblem(cardReference);
        if (problem) {
          setMessage(problem[1], "error");
          form.querySelector(`[data-card-field="${problem[0]}"]`)?.focus();
          return;
        }
        const prefill = activeCardReference.prefill;
        payload.requestType = "CARD_EVIDENCE";
        payload.cardReference = {
          ...cardReference,
          source: CARD_REFERENCE_SOURCE,
          edited: Object.keys(cardReference).some(name => cardReference[name] !== prefill[name])
        };
      }

      button.disabled = true;
      setMessage(cardReference ? "Sending evidence request…" : "Sending beta feedback…");
      try {
        const response = await fetch(FEEDBACK_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const fields = Array.isArray(body?.fields) ? body.fields : [];
          const error = new Error("Feedback endpoint rejected the submission.");
          error.cardReferenceRejected = fields.some(code => /^CARD_(?:REFERENCE|EVIDENCE)_/.test(String(code)));
          throw error;
        }
        form.reset();
        if (cardReference) {
          activeCardReference = null;
          form.querySelector("[data-card-reference]")?.remove();
          setMessage("Evidence request received. The FlipForge team reviews each request. It doesn't change any saved decision.", "ok");
        } else {
          setMessage("Feedback received. Thank you for testing the reasoning—not just the result.", "ok");
        }
      } catch (error) {
        setMessage(error?.cardReferenceRejected
          ? "The card details weren't accepted. Check them for links, email addresses or ID numbers, then send again."
          : "Feedback could not be sent. Your evaluation data was not affected; try again later.", "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  async function render() {
    if (!eligibleHost() || !onBetaRoute()) return false;
    // The guide was reached. A later identity/session refresh must not
    // pull an explicit Evaluate or Discover click back to beta-start.
    firstRunNavigationHandled = true;
    const main = document.querySelector("#main-content");
    if (!main) return false;
    const session = identitySnapshot();
    syncShell(session);
    showBanner();
    main.innerHTML = pageMarkup(session, null);
    bind(session);
    main.focus({ preventScroll: true });
    if (applyPendingFeedbackDraft()) scrollToFeedback();
    else window.scrollTo({ top: 0, behavior: "instant" });

    const health = await loadHealth();
    if (!onBetaRoute()) return true;
    const latestSession = identitySnapshot();
    syncCardReferenceFromForm();
    const summaryField = document.querySelector("[data-private-beta-feedback] [name='summary']");
    const typedSummary = summaryField ? summaryField.value : "";
    main.innerHTML = pageMarkup(latestSession, health);
    bind(latestSession);
    if (applyPendingFeedbackDraft()) {
      // Keep anything the tester already typed while the status check was loading.
      const field = document.querySelector("[data-private-beta-feedback] [name='summary']");
      if (field && typedSummary) field.value = typedSummary;
      scrollToFeedback();
      pendingFeedbackDraft = null;
    }
    return true;
  }

  function maybeStartFirstRun() {
    if (!eligibleHost() || preferenceComplete() || firstRunNavigationHandled) return;
    if (onBetaRoute()) {
      firstRunNavigationHandled = true;
      return;
    }
    const route = routeName();
    if (route === "staging" || route === "staging-evaluate") return;
    const session = identitySnapshot();
    syncShell(session);
    if (session.authenticated && session.membershipActive) {
      // Onboarding is an initial entry, not a permanent route enforcement
      // rule. Take the customer to the guide at most once per page session.
      firstRunNavigationHandled = true;
      window.location.hash = "#/beta-start";
    }
  }

  window.FlipForgePrivateBeta = Object.freeze({
    isEligible: eligibleHost,
    render,
    requestFeedback,
    preferenceComplete
  });

  window.addEventListener("hashchange", () => {
    if (!onBetaRoute()) {
      activeCardReference = null;
      pendingFeedbackDraft = null;
    }
    window.requestAnimationFrame(render);
  });
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
