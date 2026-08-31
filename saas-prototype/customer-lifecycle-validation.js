(() => {
  "use strict";

  const FORM_SELECTOR = "[data-lifecycle-form]";
  const PANEL_SELECTOR = "[data-lifecycle-client-validation]";

  function field(form, name) {
    const control = form?.elements?.namedItem(name);
    return control && typeof control === "object" ? control : null;
  }

  function value(form, name) {
    return String(field(form, name)?.value ?? "").trim();
  }

  function checked(form, name) {
    return Boolean(field(form, name)?.checked);
  }

  function defaultReviewReminder(form) {
    if (!form || value(form, "trackingStatus") !== "REVIEW") return;
    if (form.dataset.ffReviewReminderDefaulted === "true") return;
    const reminder = field(form, "alertEnabled");
    if (reminder && !reminder.checked) reminder.checked = true;
    form.dataset.ffReviewReminderDefaulted = "true";
  }

  function validMoney(text) {
    if (!text) return false;
    const amount = Number(text);
    return Number.isFinite(amount) && amount >= 0;
  }

  function result(message, fields) {
    return { ok: false, message, fields };
  }

  function validate(form) {
    const tracking = value(form, "trackingStatus");
    const outcome = value(form, "outcomeStatus");
    const reviewAt = value(form, "reviewAt");
    const acquisitionCost = value(form, "acquisitionCost");
    const acquiredAt = value(form, "acquiredAt");
    const dispositionProceeds = value(form, "dispositionProceeds");
    const disposedAt = value(form, "disposedAt");
    const alertEnabled = checked(form, "alertEnabled");

    if (tracking === "REVIEW") {
      const missing = [];
      if (!reviewAt) missing.push("reviewAt");
      if (!alertEnabled) missing.push("alertEnabled");
      if (missing.length) {
        return result(
          "To schedule a review, choose a review date and keep Remind me in FlipForge enabled.",
          missing
        );
      }
    }

    if (alertEnabled && !reviewAt) {
      return result(
        "Choose a review time before enabling an in-app review reminder.",
        ["reviewAt", "alertEnabled"]
      );
    }

    if (tracking === "OWNED") {
      const missing = [];
      if (outcome !== "ACQUIRED") missing.push("outcomeStatus");
      if (!validMoney(acquisitionCost)) missing.push("acquisitionCost");
      if (!acquiredAt) missing.push("acquiredAt");
      if (missing.length) {
        return result(
          "To mark this card as Owned, enter the purchase cost and purchase date. FlipForge records the matching result automatically.",
          missing
        );
      }
    }

    if (tracking === "SOLD") {
      const missing = [];
      if (outcome !== "SOLD") missing.push("outcomeStatus");
      if (!validMoney(acquisitionCost)) missing.push("acquisitionCost");
      if (!acquiredAt) missing.push("acquiredAt");
      if (!validMoney(dispositionProceeds)) missing.push("dispositionProceeds");
      if (!disposedAt) missing.push("disposedAt");
      if (missing.length) {
        return result(
          "To mark this card as Sold, complete the purchase cost, purchase date, sale proceeds, and sale date. FlipForge records the matching result automatically.",
          missing
        );
      }
    }

    if (tracking === "PASSED" && outcome !== "PASSED") {
      return result(
        "FlipForge could not align the saved result with Passed. Choose Passed again and retry; nothing was saved.",
        ["trackingStatus"]
      );
    }

    return { ok: true, message: "", fields: [] };
  }

  function clear(form) {
    const existing = form?.parentElement?.querySelector(PANEL_SELECTOR);
    existing?.remove();
    form?.querySelectorAll("[aria-invalid='true']").forEach(control => control.removeAttribute("aria-invalid"));
  }

  function show(form, validation) {
    clear(form);

    const panel = document.createElement("div");
    panel.className = "customer-lifecycle-validation";
    panel.setAttribute("data-lifecycle-client-validation", "");
    panel.setAttribute("role", "alert");
    panel.innerHTML = `
      <strong>Tracking details required</strong>
      <p>${validation.message}</p>
      <small>Nothing was saved. Complete the highlighted fields and try again.</small>
    `;
    form.before(panel);

    let first = null;
    validation.fields.forEach(name => {
      const control = field(form, name);
      if (!control) return;
      control.setAttribute("aria-invalid", "true");
      if (!first && !control.closest?.("[hidden]") && control.offsetParent !== null) first = control;
    });
    first?.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  document.addEventListener("submit", event => {
    const form = event.target?.closest?.(FORM_SELECTOR);
    if (!form) return;

    const validation = validate(form);
    if (validation.ok) {
      clear(form);
      return;
    }

    // This is customer guidance only. The authoritative server still validates
    // every lifecycle write and remains the final persistence boundary.
    event.preventDefault();
    event.stopImmediatePropagation();
    show(form, validation);
  }, true);

  document.addEventListener("input", event => {
    const form = event.target?.closest?.(FORM_SELECTOR);
    if (!form) return;
    if (event.target?.getAttribute?.("aria-invalid") === "true") {
      event.target.removeAttribute("aria-invalid");
    }
  }, true);

  document.addEventListener("change", event => {
    const form = event.target?.closest?.(FORM_SELECTOR);
    if (!form) return;

    if (event.target?.getAttribute?.("name") === "trackingStatus") {
      delete form.dataset.ffReviewReminderDefaulted;
      defaultReviewReminder(form);
    }

    const panel = form.parentElement?.querySelector(PANEL_SELECTOR);
    if (panel) {
      const validation = validate(form);
      if (validation.ok) clear(form);
    }
  }, true);

  function initializeForms(root = document) {
    root.querySelectorAll?.(FORM_SELECTOR).forEach(defaultReviewReminder);
  }

  const main = document.getElementById("main-content");
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(() => initializeForms(main)).observe(main, { childList: true, subtree: true });
  }
  window.addEventListener("pageshow", () => initializeForms(document));
  document.addEventListener("DOMContentLoaded", () => initializeForms(document));
  initializeForms(document);

  window.FlipForgeLifecycleValidation = Object.freeze({ validate });
})();
