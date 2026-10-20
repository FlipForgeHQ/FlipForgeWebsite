/* FlipForge "stay in touch" email signup. Posts to the same-origin /api/updates function.
 * Without JavaScript the form still works as a normal POST that returns to the page. */
(() => {
  "use strict";

  const MESSAGES = {
    ok: "You’re on the list. Watch your inbox for the next monthly note.",
    invalid: "Enter a valid email and tick the box to agree.",
    busy: "Too many tries from this connection. Please wait a few minutes.",
    error: "Something went wrong. Please try again in a moment.",
  };

  function say(form, key) {
    const status = form.querySelector("[data-ff-updates-status]");
    if (!status) return;
    status.textContent = MESSAGES[key] || MESSAGES.error;
    status.dataset.state = key;
  }

  function wire(form) {
    if (form.dataset.ffUpdatesReady === "true") return;
    form.dataset.ffUpdatesReady = "true";
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      const body = {
        email: String(data.get("email") || "").trim(),
        consent: data.get("consent") === "on",
        source: String(data.get("source") || "home"),
        bot_field: String(data.get("bot_field") || ""),
      };
      if (!body.email || !body.consent || !form.checkValidity()) { say(form, "invalid"); return; }
      if (button) button.disabled = true;
      try {
        const response = await fetch("/api/updates", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 202) { form.reset(); say(form, "ok"); }
        else if (response.status === 400) say(form, "invalid");
        else if (response.status === 429) say(form, "busy");
        else say(form, "error");
      } catch (_) {
        say(form, "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  function init() {
    document.querySelectorAll("form[data-ff-updates]").forEach(form => {
      wire(form);
      // Result of a no-JavaScript post, returned as ?updates=ok|invalid
      const result = new URLSearchParams(window.location.search).get("updates");
      if (result === "ok" || result === "invalid") say(form, result);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
