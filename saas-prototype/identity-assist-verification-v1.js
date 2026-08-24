(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  let queued = false;

  function eligibleHost() {
    const host = String(window.location.hostname || "");
    return (PRODUCTION_HOST.test(host) || PREVIEW_HOST.test(host))
      && APP_PATH.test(String(window.location.pathname || ""));
  }

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function gradeContext(value) {
    const match = String(value || "").match(/\b(PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i);
    return match ? `${match[1].toUpperCase()} ${match[2]}` : "";
  }

  function queryFromRow(row, originalQuery) {
    const name = row.querySelector("div > strong")?.textContent?.trim() || "";
    const detail = row.querySelector("div > small")?.textContent?.trim() || "";
    const parts = detail.split("·").map(value => value.trim()).filter(Boolean);
    const grade = gradeContext(originalQuery);
    const hasGrade = /\b(?:PSA|BGS|SGC|CGC|CSG|TAG|BCCG)\s*(?:10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i.test(detail);
    return [...parts, name, !hasGrade ? grade : ""]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function updateMessage(panel, hasSelectable, reviewCount) {
    const message = panel.querySelector(".customer-discovery-identity-message");
    if (!message || hasSelectable || reviewCount < 1) return;
    message.innerHTML = `<strong>Possible matches found — none is verified enough to select yet.</strong><span>If one of the cards below is the card you mean, choose <b>Verify this match</b>. FlipForge will use the visible year, set and card number to run a stricter server-side check before allowing it into Discover.</span>`;
    message.classList.add("ff-identity-assist-explained");
  }

  function decorate() {
    if (!eligibleHost() || routeName() !== "discover") return;
    const panel = document.querySelector("#main-content .customer-discovery-identity-assist");
    if (!panel) return;

    const rows = [...panel.querySelectorAll(".customer-discovery-identity-option")];
    const hasSelectable = rows.some(row => row.querySelector("[data-discovery-use-identity]"));
    let reviewCount = 0;

    rows.forEach((row, index) => {
      if (row.querySelector("[data-discovery-use-identity]")) {
        row.classList.add("ff-identity-selectable");
        return;
      }

      const oldStatus = [...row.querySelectorAll(".staging-status")]
        .find(node => /review only/i.test(node.textContent || ""));
      if (!oldStatus && !row.querySelector("[data-ff-verify-review-match]")) return;
      reviewCount += 1;
      row.classList.add("ff-identity-review-match");

      if (row.querySelector("[data-ff-verify-review-match]")) return;
      const actions = document.createElement("div");
      actions.className = "ff-identity-review-actions";
      actions.innerHTML = `<span class="ff-identity-review-label">Possible match · needs verification</span><button class="button button-secondary" type="button" data-ff-verify-review-match="${index}">Verify this match</button>`;
      oldStatus?.replaceWith(actions);
    });

    updateMessage(panel, hasSelectable, reviewCount);
  }

  async function verifyReviewMatch(button) {
    const row = button.closest(".customer-discovery-identity-option");
    const main = document.querySelector("#main-content");
    const form = main?.querySelector("[data-customer-discovery-form]");
    const input = form?.querySelector('input[name="exactCardQuery"]');
    const findExact = form?.querySelector("[data-discovery-find-exact]");
    if (!row || !input || !findExact) return;

    const originalQuery = input.value;
    const exactQuery = queryFromRow(row, originalQuery);
    if (!exactQuery) return;

    input.value = exactQuery;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.classList.add("ff-identity-recheck-input");
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }

    button.disabled = true;
    button.textContent = "Verifying…";
    window.setTimeout(() => {
      findExact.click();
    }, 180);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-ff-verify-review-match]");
    if (!button) return;
    event.preventDefault();
    verifyReviewMatch(button);
  }, true);

  const main = document.querySelector("#main-content");
  if (main) {
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        decorate();
      });
    }).observe(main, { childList: true, subtree: true });
  }

  window.addEventListener("hashchange", () => window.requestAnimationFrame(decorate));
  window.addEventListener("pageshow", () => window.requestAnimationFrame(decorate));
  window.requestAnimationFrame(decorate);
})();
