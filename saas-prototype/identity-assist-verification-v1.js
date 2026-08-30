(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const APP_PATH = /^\/(?:app|saas-prototype)(?:\/|$)/i;
  const COLLAPSED_REVIEW_COUNT = 4;
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
    const hasGrade = /\b(?:PSA|BGS|SGC|CSG|TAG|BCCG)\s*(?:10|9\.5|9|8\.5|8|7\.5|7|6\.5|6)\b/i.test(detail);
    return [...parts, name, !hasGrade ? grade : ""]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanInheritedGrade(row, originalQuery) {
    const grade = gradeContext(originalQuery);
    if (!grade) return;
    const detail = row.querySelector("div > small");
    if (!detail || detail.dataset.ffGradeCleaned === "1") return;
    detail.dataset.ffGradeCleaned = "1";
    const escaped = grade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    detail.textContent = String(detail.textContent || "")
      .replace(new RegExp(`\\s*·\\s*${escaped}\\s*\\(entered\\)`, "i"), "")
      .replace(new RegExp(`\\s*${escaped}\\s*\\(entered\\)`, "i"), "")
      .trim();
  }

  function ensureGradeNote(panel, originalQuery) {
    const grade = gradeContext(originalQuery);
    const existing = panel.querySelector("[data-ff-identity-grade-note]");
    if (!grade) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.querySelector("strong").textContent = grade;
      return;
    }
    const message = panel.querySelector(".customer-discovery-identity-message");
    if (!message) return;
    const note = document.createElement("div");
    note.className = "ff-identity-grade-note";
    note.dataset.ffIdentityGradeNote = "";
    note.innerHTML = `<span>Grade filter from your search</span><strong>${grade}</strong><small>Shown once here because the catalog matches below identify the card, not a verified slab.</small>`;
    message.insertAdjacentElement("afterend", note);
  }

  function setMessage(panel, hasSelectable, reviewCount) {
    const message = panel.querySelector(".customer-discovery-identity-message");
    if (!message) return;
    if (hasSelectable) {
      message.innerHTML = `<strong>Exact card match found.</strong><span>Confirm the exact card below to search connected listings. Other possible variants are kept out of the way unless you need them.</span>`;
      message.classList.add("ff-identity-assist-explained", "ff-identity-exact-found");
      return;
    }
    if (reviewCount > 0) {
      message.innerHTML = `<strong>No exact match is verified yet.</strong><span>Review the closest catalog matches below. Choose <b>Verify this match</b> only when the visible card identity is the one you mean.</span>`;
      message.classList.add("ff-identity-assist-explained");
    }
  }

  function ensureToggle(panel, hiddenCount, exactAvailable) {
    let toggle = panel.querySelector("[data-ff-toggle-identity-alternates]");
    if (hiddenCount < 1) {
      toggle?.remove();
      return;
    }
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "button button-secondary ff-identity-alternates-toggle";
      toggle.dataset.ffToggleIdentityAlternates = "";
      const options = panel.querySelector(".customer-discovery-identity-options");
      options?.insertAdjacentElement("afterend", toggle);
    }
    const expanded = panel.dataset.ffIdentityExpanded === "1";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded
      ? "Hide other variants"
      : exactAvailable
        ? `Show ${hiddenCount} other possible variant${hiddenCount === 1 ? "" : "s"}`
        : `Show ${hiddenCount} more possible match${hiddenCount === 1 ? "" : "es"}`;
  }

  function decorate() {
    if (!eligibleHost() || routeName() !== "discover") return;
    const panel = document.querySelector("#main-content .customer-discovery-identity-assist");
    if (!panel) return;

    const form = document.querySelector("#main-content [data-customer-discovery-form]");
    const originalQuery = String(form?.querySelector('input[name="exactCardQuery"]')?.value || "");
    const rows = [...panel.querySelectorAll(".customer-discovery-identity-option")];
    const selectableRows = rows.filter(row => row.querySelector("[data-discovery-use-identity]"));
    const hasSelectable = selectableRows.length > 0;
    let reviewCount = 0;

    rows.forEach((row, index) => {
      cleanInheritedGrade(row, originalQuery);
      const useButton = row.querySelector("[data-discovery-use-identity]");
      if (useButton) {
        row.classList.add("ff-identity-selectable");
        row.classList.remove("ff-identity-secondary", "ff-identity-hidden");
        useButton.textContent = "Use exact match";
        return;
      }

      const oldStatus = [...row.querySelectorAll(".staging-status")]
        .find(node => /review only/i.test(node.textContent || ""));
      if (!oldStatus && !row.querySelector("[data-ff-verify-review-match]")) return;
      const reviewIndex = reviewCount;
      reviewCount += 1;
      row.classList.add("ff-identity-review-match", "ff-identity-secondary");

      if (!row.querySelector("[data-ff-verify-review-match]")) {
        const actions = document.createElement("div");
        actions.className = "ff-identity-review-actions";
        actions.innerHTML = `<span class="ff-identity-review-label">Possible variant · not yet verified</span><button class="button button-secondary" type="button" data-ff-verify-review-match="${index}">Verify this match</button>`;
        oldStatus?.replaceWith(actions);
      }

      const expanded = panel.dataset.ffIdentityExpanded === "1";
      const shouldHide = hasSelectable ? !expanded : reviewIndex >= COLLAPSED_REVIEW_COUNT && !expanded;
      row.classList.toggle("ff-identity-hidden", shouldHide);
    });

    panel.classList.toggle("ff-identity-has-selectable", hasSelectable);
    setMessage(panel, hasSelectable, reviewCount);
    ensureGradeNote(panel, originalQuery);
    const visibleReviewCount = hasSelectable ? 0 : Math.min(reviewCount, COLLAPSED_REVIEW_COUNT);
    ensureToggle(panel, Math.max(0, reviewCount - visibleReviewCount), hasSelectable);
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
    const verifyButton = event.target.closest("[data-ff-verify-review-match]");
    if (verifyButton) {
      event.preventDefault();
      verifyReviewMatch(verifyButton);
      return;
    }
    const toggle = event.target.closest("[data-ff-toggle-identity-alternates]");
    if (!toggle) return;
    event.preventDefault();
    const panel = toggle.closest(".customer-discovery-identity-assist");
    if (!panel) return;
    panel.dataset.ffIdentityExpanded = panel.dataset.ffIdentityExpanded === "1" ? "0" : "1";
    decorate();
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
