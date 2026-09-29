(() => {
  "use strict";

  const access = document.querySelector("[data-owner-access]");
  const workspace = document.querySelector("[data-owner-workspace]");
  const status = document.querySelector("[data-owner-status]");
  const email = document.querySelector("[data-owner-email]");
  const signIn = document.querySelector("[data-owner-sign-in]");
  const signOut = document.querySelector("[data-owner-sign-out]");

  function snapshot() {
    return window.FlipForgeIdentity?.getSnapshot?.() || {
      authenticated: false,
      operatorActive: false,
      email: ""
    };
  }

  function render() {
    const identity = snapshot();
    const allowed = Boolean(identity.authenticated && identity.operatorActive);

    access.hidden = allowed;
    workspace.hidden = !allowed;

    if (allowed) {
      if (email) email.textContent = identity.email || "FlipForge operator";
      if (status) status.textContent = "";
      return;
    }

    if (identity.authenticated) {
      if (status) status.textContent = "This signed-in account does not have the FlipForge operator role. Sign out and use the owner account.";
      if (signIn) signIn.textContent = "Open Account";
    } else {
      if (status) status.textContent = "";
      if (signIn) signIn.textContent = "Sign in as Operator";
    }
  }

  signIn?.addEventListener("click", () => {
    window.FlipForgeIdentity?.open?.();
  });

  signOut?.addEventListener("click", async () => {
    signOut.disabled = true;
    try {
      await window.FlipForgeIdentity?.signOut?.();
    } finally {
      signOut.disabled = false;
      render();
    }
  });

  window.addEventListener("flipforge:identity-change", render);

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (window.FlipForgeIdentity || attempts > 50) {
      window.clearInterval(timer);
      render();
    }
  }, 100);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();