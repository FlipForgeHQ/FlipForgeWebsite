/* FlipForge Customer Typography Floor v1
 * Presentation/accessibility only. Never computes or changes product authority.
 * Enforces a 14px minimum only on customer-visible text that actually renders smaller.
 */
(() => {
  "use strict";

  const MINIMUM_PX = 14;
  const FLOORED_ATTR = "data-ff-typography-floored";
  const BEFORE_CLASS = "ff-typography-floor-before";
  const AFTER_CLASS = "ff-typography-floor-after";
  const excludedSelectors = [
    "script", "style", "svg", "path", ".sr-only", ".brand-mark", ".brand-center",
    ".brand-corner", ".usage-track", ".signal-track", ".readiness-ring",
    ".ff-guide-track", ".mobile-scrim"
  ];

  let queued = false;

  function isExcluded(element) {
    return excludedSelectors.some(selector => element.matches(selector) || element.closest(selector));
  }

  function isVisible(element, style = getComputedStyle(element)) {
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && element.getClientRects().length > 0;
  }

  function hasDirectText(element) {
    return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim());
  }

  function isTextControl(element) {
    return element.matches("input, select, textarea");
  }

  function generatedText(content) {
    const value = String(content || "").trim();
    if (!value || value === "none" || value === "normal" || value === '""' || value === "''") return "";
    return value.replace(/^['\"]|['\"]$/g, "").trim();
  }

  function floorPseudo(element, pseudo, className) {
    const style = getComputedStyle(element, pseudo);
    if (!generatedText(style.content)) return;
    const size = Number.parseFloat(style.fontSize);
    if (Number.isFinite(size) && size + 0.01 < MINIMUM_PX) element.classList.add(className);
  }

  function floorElement(element) {
    if (!(element instanceof HTMLElement) || isExcluded(element)) return;
    const style = getComputedStyle(element);
    if (!isVisible(element, style)) return;

    if (hasDirectText(element) || isTextControl(element)) {
      const size = Number.parseFloat(style.fontSize);
      if (Number.isFinite(size) && size + 0.01 < MINIMUM_PX) {
        element.style.setProperty("font-size", `${MINIMUM_PX}px`, "important");
        element.setAttribute(FLOORED_ATTR, "true");
      }
    }

    floorPseudo(element, "::before", BEFORE_CLASS);
    floorPseudo(element, "::after", AFTER_CLASS);
  }

  function scan() {
    const root = document.body;
    if (!(root instanceof Element)) return;
    floorElement(root);
    root.querySelectorAll("*").forEach(floorElement);
  }

  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  }

  function installStyle() {
    if (document.getElementById("ff-customer-typography-floor-style")) return;
    const style = document.createElement("style");
    style.id = "ff-customer-typography-floor-style";
    style.textContent = `
      .${BEFORE_CLASS}::before,
      .${AFTER_CLASS}::after { font-size: ${MINIMUM_PX}px !important; }

      /* Keep horizontal containment on the actual scrolling navigation surface. */
      .sidebar,
      .primary-nav {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }

      .primary-nav {
        overflow-y: auto !important;
      }

      /* Advanced groups themselves should not create a second scroll container. */
      .ff-advanced-nav,
      .ff-advanced-nav-links {
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin-inline: 0 !important;
        padding-inline: 0 !important;
        overflow: visible !important;
      }

      .ff-advanced-nav-links a {
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin-inline: 0 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }

      .ff-advanced-nav > summary {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        align-items: start !important;
        gap: 4px !important;
        min-width: 0 !important;
        max-width: 100% !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }

      .ff-advanced-hint {
        justify-self: start !important;
        min-width: 0 !important;
        max-width: 100% !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }

      /* Lifecycle history is ordinary customer reading text, not microcopy. */
      .customer-lifecycle-history span,
      .customer-lifecycle-history p,
      .customer-lifecycle-history strong,
      .customer-lifecycle-history time {
        font-size: ${MINIMUM_PX}px !important;
        line-height: 1.5 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyle();
    queueScan();
    setTimeout(queueScan, 100);
    setTimeout(queueScan, 400);

    const observer = new MutationObserver(() => queueScan());

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "open"]
    });

    document.addEventListener("toggle", queueScan, true);

    window.addEventListener("hashchange", () => {
      queueScan();
      setTimeout(queueScan, 80);
      setTimeout(queueScan, 300);
    });
    window.addEventListener("resize", queueScan, { passive: true });
    window.FlipForgeCustomerTypographyFloor = Object.freeze({
      minimumPx: MINIMUM_PX,
      rescan: queueScan
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
