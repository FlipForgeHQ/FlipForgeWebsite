(() => {
  "use strict";
  const emitted = new Set();

  function emit(event, placement) {
    const key = event + ":" + placement;
    if (emitted.has(key)) return;
    emitted.add(key);
    const body = JSON.stringify({ event, page: String(location.pathname || "/"), placement });
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon("/api/conversion-event", new Blob([body], { type: "application/json" }));
        if (ok) return;
      }
      fetch("/api/conversion-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href]");
    if (!link) return;
    const href = String(link.getAttribute("href") || "");
    if (/\/app\/(?:customer\/)?#\/(?:evaluate|discover)/i.test(href) || /\/app\/#\/evaluate/i.test(href)) {
      emit("phase3_landing_to_evaluate", link.dataset.ffDealCta || "public_cta");
    }
    if (/beta-application\.html/i.test(href)) emit("phase3_public_beta_cta_clicked", "public_page");
  }, true);
})();