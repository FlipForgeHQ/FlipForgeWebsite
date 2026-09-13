(() => {
  "use strict";

  const PRODUCTION_HOST = /^(?:www\.)?goflipforge\.com$/i;
  const FULL_CUSTOMER_PATH = /^\/app\/customer(?:\/|$)/i;
  const prototypeScripts = Object.freeze([
    "visual-intelligence.js",
    "cockpit-expansion.js"
  ]);
  const production = PRODUCTION_HOST.test(String(window.location.hostname || ""));
  const fullCustomer = window.FlipForgeFullCustomerEntry === true
    || FULL_CUSTOMER_PATH.test(String(window.location.pathname || ""));
  const runtime = {
    mode: production ? "PRODUCTION_SERVER_OWNED" : "NON_PRODUCTION_PROTOTYPE",
    prototypeVisualsAllowed: !production,
    loaded: []
  };

  window.FlipForgePrototypeVisualRuntime = runtime;

  function appendScript(source, datasetKey, onload) {
    if (document.querySelector(`script[src$="${source}"]`)) {
      onload?.();
      return;
    }
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    if (datasetKey) script.dataset[datasetKey] = "true";
    script.addEventListener("load", () => onload?.(), { once: true });
    script.addEventListener("error", () => {
      console.error(`FlipForge runtime asset failed to load: ${source}`);
    }, { once: true });
    document.head.appendChild(script);
  }

  if (fullCustomer) {
    appendScript("customer-surface-normalization-v1.js", "ffCustomerSurfaceNormalization");
  }

  if (production) return;

  function loadNext(index) {
    if (index >= prototypeScripts.length) return;

    const source = prototypeScripts[index];
    appendScript(source, "flipforgePrototypeVisual", () => {
      runtime.loaded.push(source);
      loadNext(index + 1);
    });
  }

  loadNext(0);
})();
