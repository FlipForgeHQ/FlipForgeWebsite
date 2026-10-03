(() => {
  "use strict";

  const OWNER_PATH = /^\/owner\/customer(?:\/|$)/i;
  const production = /^(?:www\.)?goflipforge\.com$/i.test(String(window.location.hostname || ""));
  if (!production || !OWNER_PATH.test(String(window.location.pathname || ""))) return;

  const reveal = () => {
    document.documentElement.style.visibility = "";
    document.body?.classList.add("ff-owner-customer-preview");

    if (!document.querySelector("[data-ff-owner-mode-banner]")) {
      const style = document.createElement("style");
      style.dataset.ffOwnerModeStyle = "";
      style.textContent = `
        body.ff-owner-customer-preview{padding-top:42px!important}
        .ff-owner-mode-banner{position:fixed;z-index:2147483000;left:0;right:0;top:0;height:42px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 18px;background:#070707;border-bottom:1px solid rgba(212,175,55,.5);box-shadow:0 8px 28px rgba(0,0,0,.4);font-family:Geist,Inter,system-ui,sans-serif}
        .ff-owner-mode-banner strong{color:#d4af37;font-size:11px;letter-spacing:.14em}.ff-owner-mode-banner span{color:#f5f3ed;font-size:12px;font-weight:800}.ff-owner-mode-links{display:flex;gap:8px;align-items:center}.ff-owner-mode-links a{color:#d7d3ca;text-decoration:none;font-size:11px;font-weight:800;border:1px solid rgba(255,255,255,.16);border-radius:7px;padding:5px 8px}.ff-owner-mode-links a:hover,.ff-owner-mode-links a:focus-visible{border-color:#d4af37;color:#fff;outline:none}
        @media(max-width:680px){.ff-owner-mode-banner span{display:none}.ff-owner-mode-links a:nth-child(2),.ff-owner-mode-links a:nth-child(3){display:none}}
      `;
      document.head.appendChild(style);

      const banner = document.createElement("div");
      banner.className = "ff-owner-mode-banner";
      banner.dataset.ffOwnerModeBanner = "";
      banner.setAttribute("role", "status");
      banner.innerHTML = `
        <div><strong>OWNER PREVIEW · CUSTOMER</strong> <span>Real customer SaaS surface · not public</span></div>
        <nav class="ff-owner-mode-links" aria-label="Owner preview navigation">
          <a href="/owner">Owner Hub</a>
          <a href="/app/beta/#/beta-start">Private Beta</a>
          <a href="/operator-beta.html">Beta Operations</a>
        </nav>
      `;
      document.body.prepend(banner);
    }
  };

  const deny = () => {
    document.documentElement.style.visibility = "hidden";
    window.location.replace("/owner");
  };

  const check = () => {
    const snapshot = window.FlipForgeIdentity?.getSnapshot?.();
    // Wait until the identity client has finished restoring the session; before
    // that, every visitor reads as signed out and would be bounced to /owner.
    if (!snapshot || snapshot.ready !== true) return false;
    if (!snapshot.authenticated || !snapshot.operatorActive) {
      deny();
      return true;
    }
    reveal();
    return true;
  };

  if (check()) return;

  window.addEventListener("flipforge:identity-change", () => {
    check();
  });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (check() || attempts > 150) {
      window.clearInterval(timer);
      if (attempts > 150) deny();
    }
  }, 100);
})();