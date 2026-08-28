(() => {
  "use strict";

  const PREVIEW_HOST = /^(?:deploy-preview-\d+--goflipforge\.netlify\.app|localhost|127\.0\.0\.1)$/i;
  const host = String(window.location.hostname || "");
  if (!PREVIEW_HOST.test(host)) return;

  const nav = document.querySelector(".primary-nav");
  if (nav && !nav.querySelector("[data-staging-diagnostics-nav]")) {
    const fragment = document.createDocumentFragment();
    const links = [
      ["staging", "#/staging", "↯", "Staging Data"],
      ["staging-evaluate", "#/staging-evaluate", "◇", "Staging Evaluate"]
    ];

    for (const [route, href, icon, label] of links) {
      const link = document.createElement("a");
      link.href = href;
      link.dataset.route = route;
      link.dataset.stagingDiagnosticsNav = "";
      link.className = "staging-only-nav";
      link.innerHTML = `<span aria-hidden="true">${icon}</span>${label}`;
      fragment.appendChild(link);
    }
    nav.appendChild(fragment);
  }

  if (!document.querySelector('link[data-staging-diagnostics-style]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "staging-browser.css";
    stylesheet.dataset.stagingDiagnosticsStyle = "";
    document.head.appendChild(stylesheet);
  }

  if (document.querySelector('script[data-staging-diagnostics-adapter]')) return;
  const script = document.createElement("script");
  script.src = "staging-browser.js";
  script.async = true;
  script.dataset.stagingDiagnosticsAdapter = "";
  script.addEventListener("load", () => window.dispatchEvent(new Event("flipforge:staging-adapter-ready")));
  document.head.appendChild(script);
})();
