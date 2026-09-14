(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const REPAIR_STYLE_ID = "ff-mobile-customer-dashboard-repair-v1";

  function fullCustomerMode() {
    return FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""))
      || window.FlipForgeFullCustomerEntry === true;
  }

  function installMobileRepairStyles() {
    if (!fullCustomerMode() || document.getElementById(REPAIR_STYLE_ID) || !document.head) return;

    const style = document.createElement("style");
    style.id = REPAIR_STYLE_ID;
    style.textContent = `
      @media (max-width: 760px) {
        html.ff-full-customer-app,
        body.ff-full-customer-app {
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }

        body.ff-full-customer-app .app-shell[data-nav-open="false"] .mobile-scrim {
          display: none !important;
          pointer-events: none !important;
        }

        body.ff-full-customer-app .app-shell[data-nav-open="true"] .mobile-scrim {
          pointer-events: auto !important;
        }

        body.ff-full-customer-app #main-content {
          overflow-x: hidden !important;
          padding-bottom: calc(118px + env(safe-area-inset-bottom, 0px)) !important;
          touch-action: pan-y pinch-zoom;
        }

        body.ff-full-customer-app #main-content .table-wrap {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
        }

        body.ff-full-customer-app #main-content .table-wrap > table:not(.ff-v2-table) {
          width: max-content !important;
          min-width: 680px !important;
          max-width: none !important;
        }

        body.ff-full-customer-app #main-content .table-wrap > table:not(.ff-v2-table) th,
        body.ff-full-customer-app #main-content .table-wrap > table:not(.ff-v2-table) td {
          max-width: none !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table-wrap {
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
          border: 0 !important;
          background: transparent !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          border-collapse: separate !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table thead {
          display: none !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody {
          display: grid !important;
          width: 100% !important;
          gap: 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody tr {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          width: 100% !important;
          max-width: 100% !important;
          gap: 10px 12px !important;
          padding: 14px !important;
          border: 1px solid rgba(255,255,255,.10) !important;
          border-radius: 12px !important;
          background: #0d141c !important;
          box-shadow: 0 10px 26px rgba(0,0,0,.16) !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td {
          display: flex !important;
          min-width: 0 !important;
          max-width: 100% !important;
          padding: 0 !important;
          border: 0 !important;
          background: transparent !important;
          white-space: normal !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          gap: 4px !important;
          overflow-wrap: anywhere !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td::before {
          content: attr(data-ff-mobile-label);
          color: #8d98a4;
          font-size: .68rem !important;
          font-weight: 800 !important;
          letter-spacing: .055em !important;
          line-height: 1.2 !important;
          text-transform: uppercase !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:first-child {
          grid-column: 1 / -1 !important;
          padding-bottom: 12px !important;
          border-bottom: 1px solid rgba(255,255,255,.08) !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:first-child::before {
          display: none !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:first-child a {
          display: block !important;
          width: 100% !important;
          color: #f4f5f6 !important;
          font-size: 1rem !important;
          font-weight: 800 !important;
          line-height: 1.35 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:first-child small {
          display: block !important;
          margin-top: 5px !important;
          color: #9ba6b2 !important;
          font-size: .82rem !important;
          line-height: 1.4 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:first-child small[hidden] {
          display: none !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table .ff-recommendation-pill {
          width: max-content !important;
          min-width: 0 !important;
          max-width: 100% !important;
          min-height: 30px !important;
          padding: 4px 10px !important;
          font-size: .78rem !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:nth-child(3),
        body.ff-full-customer-app #main-content .ff-v2-table tbody td:nth-child(4) {
          padding: 10px !important;
          border: 1px solid rgba(255,255,255,.07) !important;
          border-radius: 9px !important;
          background: rgba(255,255,255,.018) !important;
          font-size: 1rem !important;
          font-weight: 750 !important;
        }

        body.ff-full-customer-app #main-content .ff-v2-table tbody td:nth-child(n+5) {
          color: #c7ced5 !important;
          font-size: .84rem !important;
        }

        body.ff-full-customer-app .ff-guide-launcher {
          right: 12px !important;
          bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
          width: auto !important;
          max-width: 150px !important;
          min-height: 44px !important;
          padding: 9px 14px !important;
          font-size: 14px !important;
          line-height: 1.2 !important;
          z-index: 90 !important;
        }

        body.ff-full-customer-app .ff-guide-panel {
          right: 8px !important;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          width: calc(100vw - 16px) !important;
          max-width: calc(100vw - 16px) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeCardDisplay(value) {
    return String(value ?? "")
      .replace(/(^|\s)%(\d{1,4})(?=\s|$)/g, "$1#$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sameIdentity(left, right) {
    const a = normalizeCardDisplay(left).toLocaleLowerCase("en-US");
    const b = normalizeCardDisplay(right).toLocaleLowerCase("en-US");
    return Boolean(a && b && a === b);
  }

  function normalizeDashboardIdentity() {
    const dashboard = document.querySelector("[data-commercial-dashboard-v2]");
    if (!dashboard) return;

    const spotlight = dashboard.querySelector(".ff-decision-identity");
    const spotlightTitle = spotlight?.querySelector("h2");
    const spotlightIdentity = spotlight?.querySelector(":scope > p");
    if (spotlightTitle && spotlightIdentity) {
      const duplicate = sameIdentity(spotlightTitle.textContent, spotlightIdentity.textContent);
      spotlightIdentity.hidden = duplicate;
      spotlightIdentity.setAttribute("aria-hidden", duplicate ? "true" : "false");
    }

    dashboard.querySelectorAll(".ff-v2-table").forEach(table => {
      const headers = [...table.querySelectorAll("thead th")].map(node => String(node.textContent || "").trim());
      table.querySelectorAll("tbody tr").forEach(row => {
        const cells = [...row.querySelectorAll(":scope > td")];
        cells.forEach((cell, index) => {
          const label = headers[index] || "";
          if (cell.getAttribute("data-ff-mobile-label") !== label) {
            cell.setAttribute("data-ff-mobile-label", label);
          }
        });

        const title = cells[0]?.querySelector("a");
        const identity = cells[0]?.querySelector("small");
        if (title && identity) {
          const duplicate = sameIdentity(title.textContent, identity.textContent);
          identity.hidden = duplicate;
          identity.setAttribute("aria-hidden", duplicate ? "true" : "false");
        }
      });
    });
  }

  function normalizeBrandTrademark() {
    const name = document.querySelector(".brand-name");
    if (!name) return;
    if (String(name.textContent || "").trim() !== "FLIPFORGE") {
      name.textContent = "FLIPFORGE";
    }
  }

  function syncMobileNavState() {
    const shell = document.querySelector(".app-shell");
    const mobile = window.matchMedia?.(MOBILE_QUERY).matches === true;
    const open = mobile && shell?.dataset.navOpen === "true";
    document.body.classList.toggle("ff-mobile-nav-open", Boolean(open));
  }

  function sync() {
    installMobileRepairStyles();
    normalizeBrandTrademark();
    normalizeDashboardIdentity();
    syncMobileNavState();
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-nav-open"]
  });

  window.addEventListener("resize", sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("hashchange", sync);
  document.addEventListener("click", () => window.setTimeout(sync, 0), true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
