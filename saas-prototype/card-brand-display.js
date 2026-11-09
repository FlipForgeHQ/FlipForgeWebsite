(() => {
  "use strict";

  // Discover's identity rows render the compact brand themselves (customer-discovery.js identityBrand, which uses
  // normalizeManufacturer below); this observer only compacts the Card Intelligence panel and opted-in details.
  const DETAIL_SELECTORS = [
    ".card-intelligence-result small",
    "[data-card-brand-detail]"
  ];

  const CANONICAL_MANUFACTURERS = new Map([
    ["topps", "Topps"],
    ["topps company", "Topps"],
    ["the topps company", "Topps"],
    ["topps company inc", "Topps"],
    ["the topps company inc", "Topps"],
    ["panini", "Panini"],
    ["panini america", "Panini"],
    ["panini america inc", "Panini"],
    ["upper deck", "Upper Deck"],
    ["upper deck company", "Upper Deck"],
    ["the upper deck company", "Upper Deck"],
    ["leaf", "Leaf"],
    ["leaf trading cards", "Leaf"],
    ["fanatics", "Fanatics"],
    ["fanatics collectibles", "Fanatics"],
    ["bowman", "Bowman"],
    ["fleer", "Fleer"],
    ["skybox", "SkyBox"],
    ["donruss", "Donruss"],
    ["score", "Score"],
    ["pacific", "Pacific"],
    ["pacific trading cards", "Pacific"],
    ["press pass", "Press Pass"],
    ["sage", "SAGE"],
    ["pro set", "Pro Set"],
    ["wild card", "Wild Card"],
    ["o pee chee", "O-Pee-Chee"],
    ["pinnacle", "Pinnacle"],
    ["playoff", "Playoff"],
    ["collectors edge", "Collector's Edge"],
    ["action packed", "Action Packed"]
  ]);

  function normalized(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalManufacturer(value) {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return "";
    const key = normalized(raw)
      .replace(/\b(?:incorporated|corporation|corp|llc|ltd)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return CANONICAL_MANUFACTURERS.get(key) || CANONICAL_MANUFACTURERS.get(normalized(raw)) || raw;
  }

  function normalizeManufacturer(manufacturer, releaseName = "", setName = "") {
    const canonical = canonicalManufacturer(manufacturer);
    const productContext = ` ${normalized(`${releaseName} ${setName}`)} `;

    // Preserve collector-facing brand normalization for any surface that explicitly asks for a manufacturer label.
    if (productContext.includes(" bowman ")) return "Bowman";

    return canonical;
  }

  // Display only (founder-approved fix, Nov 9 2026). Some legacy saved titles repeat the manufacturer, for example
  // "2018 Topps Topps Chrome Shohei Ohtani #150 PSA 9". When a known manufacturer name is immediately repeated, the
  // displayed title shows it once ("2018 Topps Chrome ..."). Only known manufacturer names are collapsed, only when the
  // same name appears twice in a row (any letter case), and the stored record, API payload and receipt are never changed.
  const REPEATABLE_MANUFACTURERS = [...new Set(CANONICAL_MANUFACTURERS.values())]
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  const REPEATED_MANUFACTURER = new RegExp(`(^|[\\s(])(${REPEATABLE_MANUFACTURERS.join("|")})\\s+(\\2)(?=$|[\\s),.;:/#])`, "i");

  function collapseRepeatedManufacturer(value) {
    let text = String(value ?? "");
    for (let guard = 0; guard < 8; guard += 1) {
      const next = text.replace(REPEATED_MANUFACTURER, (match, lead, first, second) => `${lead}${second}`);
      if (next === text) break;
      text = next;
    }
    return text;
  }

  function normalizeDetailText(value) {
    const source = String(value ?? "");
    if (!source.includes(" · ")) return source;
    const parts = source.split(" · ").map(part => part.trim());
    if (parts.length < 3 || !/^\d{4}(?:-\d{2})?$/.test(parts[0])) return source;

    const manufacturer = parts[1] || "";
    const releaseName = parts[2] || "";
    const setName = parts[3] || "";

    // Customer identity lines should read the way collectors name cards:
    // "2018 · Topps Chrome · Base Set · #150" rather than
    // "2018 · Topps · Topps Chrome · Base Set · #150".
    // Provider manufacturer data remains untouched; this only compacts rendered text.
    if (releaseName) {
      parts.splice(1, 1);
      return parts.filter(Boolean).join(" · ");
    }

    const displayManufacturer = normalizeManufacturer(manufacturer, releaseName, setName);
    if (displayManufacturer) parts[1] = displayManufacturer;
    return parts.filter(Boolean).join(" · ");
  }

  function normalizeNode(node) {
    if (!(node instanceof Element)) return;
    const text = node.textContent || "";
    const normalizedText = normalizeDetailText(text);
    if (normalizedText !== text) node.textContent = normalizedText;
  }

  function normalizeRoot(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    for (const selector of DETAIL_SELECTORS) {
      if (root instanceof Element && root.matches(selector)) normalizeNode(root);
      root.querySelectorAll(selector).forEach(normalizeNode);
    }
  }

  function mount() {
    const main = document.querySelector("#main-content");
    if (!main) return;
    normalizeRoot(main);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) normalizeRoot(node);
        });
      }
    });
    observer.observe(main, { childList: true, subtree: true });
  }

  window.FlipForgeCardBrandDisplay = Object.freeze({
    canonicalManufacturer,
    normalizeManufacturer,
    collapseRepeatedManufacturer,
    normalizeDetailText,
    normalizeRoot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
