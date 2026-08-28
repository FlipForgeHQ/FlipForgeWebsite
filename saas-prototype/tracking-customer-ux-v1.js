(() => {
  "use strict";

  const MAIN = "#main-content";
  let queued = false;

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function optionBaseLabel(option) {
    if (!option) return "";
    if (!option.dataset.ffTrackingBaseLabel) {
      option.dataset.ffTrackingBaseLabel = String(option.textContent || "")
        .replace(/\s+·\s+saved record\s+\d+(?:\s+of\s+\d+)?$/i, "")
        .trim();
    }
    return option.dataset.ffTrackingBaseLabel;
  }

  function clarifyDuplicateCards(page) {
    const select = page.querySelector("select[data-lifecycle-select]");
    if (!select) return;

    const options = [...select.options];
    const groups = new Map();
    options.forEach(option => {
      const base = optionBaseLabel(option);
      const key = base.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(option);
    });

    let hasDuplicates = false;
    groups.forEach(group => {
      if (group.length < 2) {
        const option = group[0];
        if (option) option.textContent = optionBaseLabel(option);
        return;
      }
      hasDuplicates = true;
      group.forEach((option, index) => {
        option.textContent = `${optionBaseLabel(option)} · saved record ${index + 1} of ${group.length}`;
      });
    });

    const wrapper = select.closest(".customer-management-selector");
    setText(wrapper?.querySelector(":scope > span"), "Tracking this card");

    const panelBody = select.closest(".panel-body");
    let note = panelBody?.querySelector("[data-ff-tracking-duplicate-note]");
    if (hasDuplicates && panelBody) {
      if (!note) {
        note = document.createElement("small");
        note.dataset.ffTrackingDuplicateNote = "";
        note.className = "ff-tracking-duplicate-note";
        panelBody.appendChild(note);
      }
      note.textContent = "The same card can appear more than once when it was evaluated and saved at different times. Each saved decision remains separate.";
    } else if (note) {
      note.remove();
    }
  }

  function fieldLabel(form, name) {
    return form.querySelector(`[name="${name}"]`)?.closest("label") || null;
  }

  function polishForm(page) {
    const form = page.querySelector("[data-lifecycle-form]");
    if (!form) return;

    const replacements = {
      trackingStatus: "Status",
      outcomeStatus: "Result",
      reviewAt: "Review date",
      acquisitionCost: "Purchase cost",
      acquiredAt: "Purchase date",
      dispositionProceeds: "Sale proceeds",
      disposedAt: "Sale date"
    };

    Object.entries(replacements).forEach(([name, label]) => {
      setText(fieldLabel(form, name)?.querySelector(":scope > span"), label);
    });

    const reminder = form.querySelector('input[name="alertEnabled"]')?.closest("label");
    setText(reminder?.querySelector("span"), "Remind me in FlipForge");

    const status = String(form.querySelector('select[name="trackingStatus"]')?.value || "").toUpperCase();
    const purchaseVisible = status === "OWNED" || status === "SOLD";
    const saleVisible = status === "SOLD";

    ["acquisitionCost", "acquiredAt"].forEach(name => {
      const label = fieldLabel(form, name);
      if (label) label.hidden = !purchaseVisible;
    });
    ["dispositionProceeds", "disposedAt"].forEach(name => {
      const label = fieldLabel(form, name);
      if (label) label.hidden = !saleVisible;
    });

    const cost = form.querySelector('input[name="acquisitionCost"]');
    if (cost) cost.placeholder = "Required when owned or sold";
    const proceeds = form.querySelector('input[name="dispositionProceeds"]');
    if (proceeds) proceeds.placeholder = "Required when sold";

    const submit = form.querySelector('button[type="submit"]');
    if (submit && !/Saving/i.test(String(submit.textContent || ""))) setText(submit, "Save tracking");
    setText(form.querySelector(".customer-lifecycle-submit small"), "Add purchase details when you own the card. Add sale details only after it is sold. A reminder needs a review date.");

    const statusSelect = form.querySelector('select[name="trackingStatus"]');
    if (statusSelect && statusSelect.dataset.ffTrackingVisibilityBound !== "true") {
      statusSelect.dataset.ffTrackingVisibilityBound = "true";
      statusSelect.addEventListener("change", () => polishForm(page));
    }
  }

  function humanizeHistory(page) {
    page.querySelectorAll(".customer-lifecycle-history article").forEach(article => {
      const heading = article.querySelector("strong");
      if (heading) {
        const value = String(heading.textContent || "")
          .toLowerCase()
          .replace(/(^|\s|·)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
        heading.textContent = value;
      }
      const detail = article.querySelector("p");
      if (detail) {
        detail.textContent = String(detail.textContent || "")
          .replace(/Outcome\s+/i, "Result: ")
          .replace(/\s+·\s+Version\s+/i, " · Update ");
      }
    });
  }

  function polishTracking() {
    queued = false;
    if (routeName() !== "tracking") return;
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Decision follow-up");
    setText(heading?.querySelector("p"), "Choose what happens next with this saved card: keep watching, schedule a review, record ownership, or close it out.");

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>Decision boundary:</strong> Tracking records what you decide to do with a saved card. It never changes the FlipForge BUY/WATCH/VERIFY/PASS decision or executes a transaction.";
    }

    const metrics = [...page.querySelectorAll(".customer-management-metrics article")];
    metrics.forEach(article => {
      const label = article.querySelector("span");
      const value = String(label?.textContent || "").trim();
      if (/Tenant-owned records|Saved records/i.test(value)) setText(label, "Saved records");
      if (/Current holdings/i.test(value)) setText(label, "Owned cards");
      if (/Selected version|Updates saved/i.test(value)) setText(label, "Updates saved");
    });

    const cardPanel = [...page.querySelectorAll("section.panel")].find(section => section.querySelector("[data-lifecycle-form]"));
    if (cardPanel) {
      setText(cardPanel.querySelector(".panel-header p"), "Update how you are following this card. Changes are saved to your account.");
    }

    const history = [...page.querySelectorAll("section.panel")].find(section => /Lifecycle history|Tracking history/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (history) {
      setText(history.querySelector("h2"), "Tracking history");
      setText(history.querySelector(".panel-header p"), "Your saved changes for this card, newest first.");
    }

    clarifyDuplicateCards(page);
    polishForm(page);
    humanizeHistory(page);
    page.dataset.ffTrackingCustomerUx = "v1";
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(polishTracking);
  }

  const main = document.querySelector(MAIN);
  if (main && typeof MutationObserver === "function") {
    new MutationObserver(queue).observe(main, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener("hashchange", queue);
  window.addEventListener("pageshow", queue);
  window.addEventListener("load", queue);
  queue();
})();
