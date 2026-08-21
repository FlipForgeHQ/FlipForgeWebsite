(() => {
  "use strict";

  const DETAIL_SELECTORS = [
    ".customer-discovery-identity-option small",
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

    // Bowman is a collector-facing card brand even when a provider reports Topps as the corporate manufacturer.
    // Keep the provider value in data; only normalize what the customer sees.
    if (productContext.includes(" bowman ")) return "Bowman";

    return canonical;
  }

  function normalizeDetailText(value) {
    const source = String(value ?? "");
    if (!source.includes(" · ")) return source;
    const parts = source.split(" · ");
    if (parts.length < 3 || !/^\d{4}(?:-\d{2})?$/.test(parts[0].trim())) return source;

    const manufacturer = parts[1].trim();
    const releaseName = parts[2]?.trim() || "";
    const setName = parts[3]?.trim() || "";
    const displayManufacturer = normalizeManufacturer(manufacturer, releaseName, setName);
    if (!displayManufacturer || displayManufacturer === manufacturer) return source;

    parts[1] = displayManufacturer;
    return parts.join(" · ");
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
    normalizeDetailText,
    normalizeRoot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
