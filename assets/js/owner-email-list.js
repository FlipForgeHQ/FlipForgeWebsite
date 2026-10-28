/* Owner Hub: remove an address from the email list (unsubscribe requests).
 * The server re-checks the operator role on every call; this page only sends the request. */
(() => {
  "use strict";

  // The CSV is downloaded with fetch so the request carries this window's operator unlock (operator-window-lock.js);
  // a plain link cannot send it.
  function initExport() {
    const link = document.querySelector("[data-ff-owner-export]");
    if (!link) return;
    const label = link.textContent;
    link.addEventListener("click", async event => {
      event.preventDefault();
      if (link.dataset.busy === "true") return;
      link.dataset.busy = "true";
      link.textContent = "Preparing download…";
      try {
        const response = await fetch(link.getAttribute("href"), { credentials: "same-origin", cache: "no-store", redirect: "error" });
        if (!response.ok) throw new Error(String(response.status));
        const disposition = response.headers.get("content-disposition") || "";
        const name = (disposition.match(/filename="?([^";]+)"?/) || [])[1] || "flipforge-email-list.csv";
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        link.textContent = label;
      } catch (_) {
        link.textContent = "Download failed. Try again.";
        setTimeout(() => { link.textContent = label; }, 4000);
      } finally {
        link.dataset.busy = "false";
      }
    });
  }

  function init() {
    initExport();
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
