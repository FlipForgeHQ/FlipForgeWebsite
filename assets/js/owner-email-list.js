/* Owner Hub: remove an address from the email list (unsubscribe requests).
 * The server re-checks the operator role on every call; this page only sends the request. */
(() => {
  "use strict";

  function init() {
    const form = document.querySelector("[data-ff-owner-unsubscribe]");
    if (!form) return;
    const status = form.querySelector("[data-ff-owner-unsubscribe-status]");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const email = String(new FormData(form).get("email") || "").trim();
      if (!email || !form.checkValidity()) { status.textContent = "Enter the email address to remove."; return; }
      status.textContent = "Removing…";
      try {
        const response = await fetch(`/api/updates/subscribers?email=${encodeURIComponent(email)}`, {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        });
        if (response.ok) { form.reset(); status.textContent = "Removed. The address is no longer on the list."; }
        else if (response.status === 401 || response.status === 403) status.textContent = "Sign in as an operator to manage the list.";
        else status.textContent = "Could not remove the address. Try again.";
      } catch (_) {
        status.textContent = "Could not remove the address. Try again.";
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
