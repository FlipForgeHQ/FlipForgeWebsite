(() => {
  "use strict";

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const STORAGE_KEY = "flipforge.trackingContext.v1";

  function trackingIdFromHref(href) {
    const match = String(href || "").match(/#\/tracking\/([^/?#]+)/);
    if (!match) return "";
    try {
      const id = decodeURIComponent(match[1]);
      return SAFE_ID.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function remember(id) {
    try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (_) { /* session preference only */ }
  }

  function isPlainLeftClick(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  document.addEventListener("click", event => {
    const link = event.target.closest?.('a[data-ff-evidence-understood], .ff-evidence-next-step a[href^="#/tracking/"]');
    if (!link || !isPlainLeftClick(event)) return;

    const id = trackingIdFromHref(link.getAttribute("href"));
    if (!id) return;

    remember(id);
    event.preventDefault();
    event.stopImmediatePropagation();

    const nextHash = `#/tracking/${encodeURIComponent(id)}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

    // A fresh load is intentional here. The legacy prototype router and the
    // customer lifecycle router both receive hash changes in the existing app.
    // Loading the exact Tracking URL gives the lifecycle router one clean
    // initialization path—the same behavior that already works in a new tab.
    try {
      window.history.pushState({ flipforgeTrackingReload: true }, "", nextUrl);
      window.location.reload();
    } catch (_) {
      const url = new URL(window.location.href);
      url.hash = nextHash;
      url.searchParams.set("ff_tracking_nav", String(Date.now()));
      window.location.assign(url.toString());
    }
  }, true);
})();

(() => {
  "use strict";

  // Keep the Tracking customer polish in this already-loaded file. A prior
  // version injected tracking-customer-ux-v1.js dynamically, which was not
  // reliable on the production app. This layer changes presentation only.
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
        option.textContent = `${optionBaseLabel(option)} · saved ${index + 1} of ${group.length}`;
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
      note.textContent = "Some cards were evaluated more than once. Each saved decision stays separate so you can track the exact evaluation you meant.";
    } else if (note) {
      note.remove();
    }
  }

  function fieldLabel(form, name) {
    return form.querySelector(`[name="${name}"]`)?.closest("label") || null;
  }

  function setFieldVisible(form, name, visible) {
    const label = fieldLabel(form, name);
    if (!label) return;
    label.hidden = !visible;
    label.style.display = visible ? "" : "none";
    label.setAttribute("aria-hidden", visible ? "false" : "true");
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

    setFieldVisible(form, "acquisitionCost", purchaseVisible);
    setFieldVisible(form, "acquiredAt", purchaseVisible);
    setFieldVisible(form, "dispositionProceeds", saleVisible);
    setFieldVisible(form, "disposedAt", saleVisible);

    const cost = form.querySelector('input[name="acquisitionCost"]');
    if (cost) cost.placeholder = "Required when owned or sold";
    const proceeds = form.querySelector('input[name="dispositionProceeds"]');
    if (proceeds) proceeds.placeholder = "Required when sold";

    const submit = form.querySelector('button[type="submit"]');
    if (submit && !/Saving/i.test(String(submit.textContent || ""))) setText(submit, "Save tracking");
    setText(form.querySelector(".customer-lifecycle-submit small"), "Set a review date while watching. Add purchase details only when you own the card, and sale details only after it is sold.");

    const statusSelect = form.querySelector('select[name="trackingStatus"]');
    if (statusSelect && statusSelect.dataset.ffTrackingVisibilityBound !== "true") {
      statusSelect.dataset.ffTrackingVisibilityBound = "true";
      statusSelect.addEventListener("change", () => polishForm(page));
    }
  }

  function humanizeHistory(page) {
    const empty = [...page.querySelectorAll(".staging-empty")].find(node => /No lifecycle history yet/i.test(String(node.textContent || "")));
    if (empty) {
      const strong = empty.querySelector("strong");
      const p = empty.querySelector("p");
      setText(strong, "No tracking changes yet.");
      setText(p, "Your first saved Tracking update will appear here.");
    }

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
      if (/Current holdings|Owned cards/i.test(value)) setText(label, "Owned cards");
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
    page.dataset.ffTrackingCustomerUx = "v2";
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
