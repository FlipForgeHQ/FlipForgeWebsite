(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const prototypeScripts = Object.freeze([
    "visual-intelligence.js",
    "cockpit-expansion.js"
  ]);
  const production = PRODUCTION_HOST.test(String(window.location.hostname || ""));
  const runtime = {
    mode: production ? "PRODUCTION_SERVER_OWNED" : "NON_PRODUCTION_PROTOTYPE",
    prototypeVisualsAllowed: !production,
    decisionClarityEnabled: true,
    loaded: []
  };

  window.FlipForgePrototypeVisualRuntime = runtime;

  function loadDecisionClarity() {
    if (!document.querySelector('link[data-ff-decision-clarity]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "customer-decision-clarity-v1.css";
      stylesheet.dataset.ffDecisionClarity = "style";
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-ff-decision-clarity]')) {
      const script = document.createElement("script");
      script.src = "customer-decision-clarity-v1.js";
      script.async = false;
      script.dataset.ffDecisionClarity = "script";
      document.head.appendChild(script);
    }
  }

  loadDecisionClarity();

  if (production) return;

  function loadNext(index) {
    if (index >= prototypeScripts.length) return;

    const source = prototypeScripts[index];
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.dataset.flipforgePrototypeVisual = "true";
    script.addEventListener("load", () => {
      runtime.loaded.push(source);
      loadNext(index + 1);
    }, { once: true });
    script.addEventListener("error", () => {
      console.error(`FlipForge prototype visual failed to load: ${source}`);
    }, { once: true });
    document.head.appendChild(script);
  }

  loadNext(0);
})();
