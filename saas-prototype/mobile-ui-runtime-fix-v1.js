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

        /* Core-route mobile polish: preserve authority while making the primary task obvious. */
        body.ff-full-customer-app #main-content .customer-discovery-page,
        body.ff-full-customer-app #main-content .customer-evaluation-page,
        body.ff-full-customer-app #main-content .ff-di-page {
          gap: 12px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .page-heading,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .page-heading {
          gap: 10px !important;
          margin-bottom: 10px !important;
          padding-bottom: 12px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .page-heading h1,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .page-heading h1 {
          font-size: 1.8rem !important;
          line-height: 1.05 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .page-heading p,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .page-heading p {
          margin-top: 6px !important;
          font-size: .9rem !important;
          line-height: 1.42 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .page-heading .page-actions,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .page-heading .page-actions {
          display: flex !important;
          width: 100% !important;
          gap: 8px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .page-heading .page-actions .button,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .page-heading .page-actions .button {
          flex: 1 1 0 !important;
          min-height: 44px !important;
          justify-content: center !important;
          text-align: center !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-page > .boundary-note,
        body.ff-full-customer-app #main-content .customer-evaluation-page > .boundary-note {
          margin: 0 0 2px !important;
          padding: 10px 11px !important;
          font-size: .76rem !important;
          line-height: 1.42 !important;
        }

        /* Discover */
        body.ff-full-customer-app #main-content .customer-discovery-search {
          border-color: rgba(216,174,59,.28) !important;
          box-shadow: 0 14px 30px rgba(0,0,0,.16) !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search .panel-header,
        body.ff-full-customer-app #main-content .customer-discovery-search .panel-body {
          padding: 12px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search .panel-header p {
          display: none !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form {
          grid-template-columns: minmax(0, 1fr) 96px !important;
          gap: 10px !important;
          align-items: end !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form > label:first-child {
          grid-column: 1 / -1 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form > label:nth-child(2) {
          grid-column: 1 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form > label:nth-child(3) {
          grid-column: 2 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form input,
        body.ff-full-customer-app #main-content .customer-discovery-form select,
        body.ff-full-customer-app #main-content .staging-field input,
        body.ff-full-customer-app #main-content .staging-field select,
        body.ff-full-customer-app #main-content .staging-field textarea,
        body.ff-full-customer-app #main-content .ff-di-control select {
          min-height: 46px !important;
          font-size: 16px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search-actions {
          grid-column: 1 / -1 !important;
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 7px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search-actions .button-primary {
          min-height: 48px !important;
          font-weight: 850 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search-actions .button-secondary {
          min-height: 42px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-search-help {
          margin-top: 8px !important;
          font-size: .74rem !important;
          line-height: 1.4 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .panel-header {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) auto !important;
          gap: 10px !important;
          padding: 12px !important;
          align-items: start !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .panel-header h2 {
          margin-top: 4px !important;
          font-size: 1.05rem !important;
          line-height: 1.28 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .panel-header p {
          margin-top: 4px !important;
          font-size: .78rem !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-score {
          min-width: 62px !important;
          justify-items: end !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-score strong {
          font-size: 1.45rem !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-score small {
          max-width: 72px !important;
          text-align: right !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .panel-body {
          padding: 12px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .customer-discovery-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .customer-discovery-metrics > div {
          padding: 10px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .customer-discovery-copy {
          gap: 5px !important;
          margin-top: 10px !important;
          font-size: .79rem !important;
          line-height: 1.45 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-ranking-details {
          margin-top: 9px !important;
          padding: 9px 10px !important;
          font-size: .78rem !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-ranking-details summary,
        body.ff-full-customer-app #main-content .customer-discovery-identity-review > summary {
          min-height: 42px !important;
          display: flex !important;
          align-items: center !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-actions {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 8px !important;
          margin-top: 10px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-actions .button {
          width: 100% !important;
          min-height: 44px !important;
          justify-content: center !important;
          text-align: center !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-actions .button-primary {
          order: -1 !important;
          min-height: 48px !important;
          font-weight: 850 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-candidate .boundary-note {
          margin: 10px 0 0 !important;
          padding: 9px 10px !important;
          font-size: .74rem !important;
          line-height: 1.4 !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-identity-option {
          gap: 9px !important;
          padding: 10px !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-identity-option .button {
          min-height: 44px !important;
        }

        /* Evaluate */
        body.ff-full-customer-app #main-content .staging-evaluation-panel .panel-header,
        body.ff-full-customer-app #main-content .staging-evaluation-panel .panel-body {
          padding: 12px !important;
        }

        body.ff-full-customer-app #main-content .staging-evaluation-panel .panel-header {
          display: grid !important;
          gap: 8px !important;
        }

        body.ff-full-customer-app #main-content .staging-evaluation-panel .panel-header .staging-status {
          width: max-content !important;
          max-width: 100% !important;
        }

        body.ff-full-customer-app #main-content .staging-evaluation-form {
          gap: 13px !important;
        }

        body.ff-full-customer-app #main-content .customer-intake-step {
          grid-template-columns: 28px minmax(0, 1fr) !important;
          gap: 9px !important;
          margin-top: 0 !important;
          padding-bottom: 8px !important;
        }

        body.ff-full-customer-app #main-content .customer-intake-step > span {
          width: 28px !important;
          height: 28px !important;
          font-size: .78rem !important;
        }

        body.ff-full-customer-app #main-content .customer-intake-step strong {
          font-size: .9rem !important;
          line-height: 1.3 !important;
        }

        body.ff-full-customer-app #main-content .customer-intake-step small {
          margin-top: 2px !important;
          font-size: .76rem !important;
          line-height: 1.35 !important;
        }

        body.ff-full-customer-app #main-content .staging-form-grid {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }

        body.ff-full-customer-app #main-content .staging-field {
          gap: 5px !important;
        }

        body.ff-full-customer-app #main-content .staging-field > span {
          font-size: .72rem !important;
          letter-spacing: .025em !important;
        }

        body.ff-full-customer-app #main-content .staging-field small {
          font-size: .74rem !important;
          line-height: 1.35 !important;
        }

        body.ff-full-customer-app #main-content .staging-boundary-check {
          gap: 10px !important;
          padding: 11px !important;
          font-size: .79rem !important;
          line-height: 1.4 !important;
        }

        body.ff-full-customer-app #main-content .staging-form-actions {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 8px !important;
        }

        body.ff-full-customer-app #main-content .staging-form-actions .button {
          width: 100% !important;
          min-height: 44px !important;
          justify-content: center !important;
          text-align: center !important;
        }

        body.ff-full-customer-app #main-content .staging-form-actions .button-primary {
          order: -1 !important;
          min-height: 50px !important;
          font-weight: 850 !important;
        }

        body.ff-full-customer-app #main-content .staging-form-note {
          font-size: .72rem !important;
          line-height: 1.38 !important;
        }

        body.ff-full-customer-app #main-content .staging-evaluation-result .staging-key-grid,
        body.ff-full-customer-app #main-content .staging-value-intelligence-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }

        body.ff-full-customer-app #main-content .staging-evaluation-result .staging-key-grid > div,
        body.ff-full-customer-app #main-content .staging-value-intelligence-grid > div {
          padding: 10px !important;
        }

        /* Decision Intelligence */
        body.ff-full-customer-app #main-content .ff-di-hero {
          grid-template-columns: 1fr !important;
          gap: 12px !important;
          margin-bottom: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-hero-copy h1 {
          font-size: 1.95rem !important;
          line-height: 1.03 !important;
          letter-spacing: -.04em !important;
        }

        body.ff-full-customer-app #main-content .ff-di-hero-copy p {
          margin-top: 8px !important;
          font-size: .9rem !important;
          line-height: 1.45 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-hero-state {
          padding: 13px !important;
          border-radius: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-state-value {
          margin-top: 14px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-state-meta {
          margin-top: 12px !important;
          padding-top: 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-controls {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
          margin-bottom: 12px !important;
          padding: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-control label {
          margin-bottom: 5px !important;
          font-size: .67rem !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-command {
          gap: 10px !important;
          margin-bottom: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-verdict {
          grid-template-columns: 1fr !important;
          gap: 13px !important;
          padding: 14px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-decision {
          min-height: 34px !important;
          align-items: center !important;
          padding: 6px 11px !important;
          font-size: .82rem !important;
          font-weight: 850 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-verdict h2 {
          margin-top: 8px !important;
          font-size: 1.3rem !important;
          line-height: 1.16 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-verdict p {
          margin-top: 8px !important;
          font-size: .84rem !important;
          line-height: 1.45 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-verdict-metrics {
          gap: 7px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-verdict-metrics > div {
          min-height: 44px !important;
          padding: 9px 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-intelligence-grid {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-integrity,
        body.ff-full-customer-app #main-content .ff-di-v2-change {
          padding: 14px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-integrity > header {
          display: grid !important;
          gap: 6px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-integrity > header > strong {
          white-space: normal !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-gates {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 7px !important;
          margin-top: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-gate {
          min-height: 68px !important;
          padding: 9px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-reasons {
          gap: 6px !important;
          margin-top: 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-reasons > div {
          gap: 10px !important;
          padding: 8px 9px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-evidence-link {
          min-height: 42px !important;
          margin-top: 10px !important;
          align-items: center !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-change h3 {
          margin-top: 8px !important;
          font-size: 1rem !important;
          line-height: 1.35 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-change p {
          margin-top: 8px !important;
          font-size: .8rem !important;
          line-height: 1.42 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-receipt {
          margin-top: 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-receipt summary {
          min-height: 48px !important;
          padding: 11px 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-v2-receipt-grid {
          grid-template-columns: 1fr !important;
          gap: 6px !important;
          padding: 0 12px 12px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-grid {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-card {
          grid-column: 1 / -1 !important;
          padding: 14px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-bar-row {
          grid-template-columns: minmax(0, 1fr) auto !important;
          gap: 6px 10px !important;
        }

        body.ff-full-customer-app #main-content .ff-di-bar-row > span:first-child {
          grid-column: 1 / -1 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-bar-row > .ff-di-track {
          grid-column: 1 !important;
        }

        body.ff-full-customer-app #main-content .ff-di-bar-row > strong {
          grid-column: 2 !important;
          min-width: 64px !important;
        }
      }

      @media (max-width: 360px) {
        body.ff-full-customer-app #main-content .customer-discovery-form,
        body.ff-full-customer-app #main-content .customer-discovery-candidate .customer-discovery-metrics,
        body.ff-full-customer-app #main-content .staging-evaluation-result .staging-key-grid,
        body.ff-full-customer-app #main-content .staging-value-intelligence-grid,
        body.ff-full-customer-app #main-content .ff-di-v2-gates {
          grid-template-columns: 1fr !important;
        }

        body.ff-full-customer-app #main-content .customer-discovery-form > label,
        body.ff-full-customer-app #main-content .customer-discovery-search-actions {
          grid-column: 1 !important;
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
