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

  function setFieldVisible(form, name, visible) {
    const label = fieldLabel(form, name);
    if (!label) return;
    label.hidden = !visible;
    label.style.display = visible ? "" : "none";
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

    page.querySelectorAll(".staging-empty").forEach(empty => {
      const strong = empty.querySelector("strong");
      if (!/No lifecycle history yet/i.test(String(strong?.textContent || ""))) return;
      setText(strong, "No tracking history yet.");
      setText(empty.querySelector("p"), "Save your first tracking update and it will appear here.");
    });
  }

  function removeTrackingOnlyClutter() {
    document.querySelectorAll(`${MAIN} [data-ff-beta-mission]`).forEach(node => node.remove());
  }

  function polishTracking() {
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    removeTrackingOnlyClutter();

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
    page.dataset.ffTrackingCustomerUx = "v3";
  }

  function friendlyReviewTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(parsed);
  }

  function polishAlertItems(page) {
    page.querySelectorAll(".customer-lifecycle-alerts article").forEach(article => {
      setText(article.querySelector(".eyebrow"), "Review reminder");
      const detail = article.querySelector("p");
      if (detail) {
        const raw = String(detail.textContent || "").replace(/^Review at\s+/i, "").trim();
        const formatted = friendlyReviewTime(raw);
        if (formatted) setText(detail, `Review: ${formatted}`);
      }
      const manage = article.querySelector('a[href^="#/tracking/"]');
      setText(manage, "Open tracking");
    });
  }

  function polishAlertLimits(page) {
    const panels = [...page.querySelectorAll("section.panel")];
    const limits = panels.find(section => /Delivery boundary|Private beta reminder limits/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (!limits) return;

    setText(limits.querySelector("h2"), "Private beta reminder limits");
    setText(limits.querySelector(".panel-header p"), "Reminders currently appear inside FlipForge. Email, SMS, and push delivery are not active in private beta.");

    const rows = [...limits.querySelectorAll(".customer-management-checklist > div")];
    rows.forEach(row => {
      const strong = row.querySelector("strong");
      const small = row.querySelector("small");
      const title = String(strong?.textContent || "").trim();
      if (/SQLite rule persistence/i.test(title)) {
        setText(strong, "In-app reminders");
        setText(small, "Saved to your account and shown here when they are due.");
      } else if (/Email, SMS, and push/i.test(title)) {
        setText(strong, "Email, SMS & push");
        setText(small, "Not available in private beta yet.");
      } else if (/Zero transaction authority/i.test(title)) {
        setText(strong, "No automatic transactions");
        setText(small, "A reminder cannot buy, sell, list, bid, or pay for anything.");
      }
    });
  }

  function polishAlerts() {
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Review reminders");
    setText(heading?.querySelector("p"), "See which saved cards need attention and open Tracking when you want to change a reminder.");

    const actions = heading?.querySelector(".page-actions");
    const manage = actions?.querySelector('a[href="#/tracking"]');
    setText(manage, "Manage reminders");

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>Reminder boundary:</strong> Alerts tell you when to revisit a saved card. They never rescore the decision or execute a transaction.";
    }

    const metrics = [...page.querySelectorAll(".customer-management-metrics article")];
    metrics.forEach(article => {
      const label = article.querySelector("span");
      const strong = article.querySelector("strong");
      const value = String(label?.textContent || "").trim();
      if (/Enabled rules/i.test(value)) setText(label, "Active reminders");
      if (/Reviews due/i.test(value)) setText(label, "Due now");
      if (/In-app queue/i.test(value)) setText(label, "In-app reminders");
      if (/Email \/ push/i.test(value)) {
        setText(label, "Email & push");
        if (/Not connected/i.test(String(strong?.textContent || ""))) setText(strong, "Not in beta");
      }
    });

    const panels = [...page.querySelectorAll("section.panel")];
    const reminders = panels.find(section => /Review reminders|Your reminders/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (reminders) {
      setText(reminders.querySelector("h2"), "Your reminders");
      setText(reminders.querySelector(".panel-header p"), "Cards you scheduled to revisit in FlipForge.");

      reminders.querySelectorAll(".staging-empty").forEach(empty => {
        const strong = empty.querySelector("strong");
        if (/No review reminder is enabled/i.test(String(strong?.textContent || ""))) {
          setText(strong, "No reminders yet.");
          setText(empty.querySelector("p"), "Set a review date on a tracked card and turn on Remind me in FlipForge.");
          setText(empty.querySelector('a[href="#/tracking"]'), "Open tracking");
        }
      });
    }

    polishAlertItems(page);
    polishAlertLimits(page);
    page.dataset.ffAlertsCustomerUx = "v1";
  }

  function polishPortfolio() {
    const page = document.querySelector(`${MAIN} .customer-lifecycle-page`);
    if (!page) return;

    const heading = page.querySelector(".page-heading");
    setText(heading?.querySelector(".eyebrow"), "Collection tracking");
    setText(heading?.querySelector("p"), "See the cards you marked as owned and the purchase cost you recorded for each one.");

    const actions = heading?.querySelector(".page-actions");
    setText(actions?.querySelector('a[href="#/tracking"]'), "Manage owned cards");

    const boundary = page.querySelector(".boundary-note");
    if (boundary) {
      boundary.innerHTML = "<strong>Portfolio boundary:</strong> Portfolio uses purchase facts you saved in Tracking. It does not estimate current market value, profit, loss, fees, taxes, or tell you when to sell.";
    }

    const metrics = [...page.querySelectorAll(".customer-management-metrics article")];
    metrics.forEach(article => {
      const label = article.querySelector("span");
      const strong = article.querySelector("strong");
      const value = String(label?.textContent || "").trim();
      if (/Current holdings/i.test(value)) setText(label, "Owned cards");
      if (/Total cost basis/i.test(value)) setText(label, "Total purchase cost");
      if (/Current value/i.test(value)) {
        setText(label, "Market value");
        if (/Not calculated/i.test(String(strong?.textContent || ""))) setText(strong, "Not shown yet");
      }
      if (/Transactions/i.test(value)) {
        setText(label, "Buying & selling");
        if (/Disabled/i.test(String(strong?.textContent || ""))) setText(strong, "Not available");
      }
    });

    const panels = [...page.querySelectorAll("section.panel")];
    const holdings = panels.find(section => /Tenant-owned holdings|Owned cards/i.test(String(section.querySelector("h2")?.textContent || "")));
    if (holdings) {
      setText(holdings.querySelector("h2"), "Owned cards");
      setText(holdings.querySelector(".panel-header p"), "Cards you marked as Owned in Tracking.");

      const badge = holdings.querySelector(".staging-status");
      if (badge) setText(badge, "Saved");

      const headers = [...holdings.querySelectorAll("thead th")];
      headers.forEach(header => {
        const value = String(header.textContent || "").trim();
        if (/Cost basis/i.test(value)) setText(header, "Purchase cost");
        if (/Acquired/i.test(value)) setText(header, "Purchase date");
      });

      holdings.querySelectorAll("tbody tr").forEach(row => {
        const rawId = row.querySelector("td:first-child small");
        if (rawId) rawId.style.display = "none";
        setText(row.querySelector('a[href^="#/tracking/"]'), "Open tracking");
      });

      holdings.querySelectorAll(".staging-empty").forEach(empty => {
        const strong = empty.querySelector("strong");
        if (/No current holdings/i.test(String(strong?.textContent || ""))) {
          setText(strong, "No owned cards yet.");
          setText(empty.querySelector("p"), "When you mark a saved card as Owned and add its purchase details, it will appear here.");
          setText(empty.querySelector('a[href="#/tracking"]'), "Open tracking");
        }
      });
    }

    const limitation = panels.find(section => /No supported-value total or performance chart was created|Market value and performance/i.test(String(section.textContent || "")));
    if (limitation) {
      const strong = limitation.querySelector("strong");
      setText(strong, "Market value and performance are not shown yet.");
      setText(limitation.querySelector("p"), "Portfolio currently uses only the purchase facts you recorded. FlipForge will not invent a gain or loss without a governed current-value snapshot.");
    }

    page.dataset.ffPortfolioCustomerUx = "v1";
  }

  function polishCurrentRoute() {
    queued = false;
    const route = routeName();
    if (route === "tracking") polishTracking();
    if (route === "alerts") polishAlerts();
    if (route === "portfolio") polishPortfolio();
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(polishCurrentRoute);
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
