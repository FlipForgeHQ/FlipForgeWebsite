(() => {
  "use strict";

  // Phase 5 Customer Intelligence journey: one compact "Your decision journey" strip that joins the screens a customer
  // moves through after a decision, so each one hands off to the next and back:
  //   Discover → Evaluate → Save → Decision Receipt → Track → Review → Portfolio → Alerts → Forge Heat
  // It adds links only. It reads nothing from the API, stores nothing, and never changes a decision or a page's own
  // content. Shown on the saved decision (Decision Receipt), its Tracking page, Portfolio, Alerts and Forge Heat.
  //
  // Card-scoped steps (Receipt, Track, Review) point at the card in the address bar; on Portfolio / Alerts / Forge Heat
  // they point at the card last opened in this tab (memory only, never storage), or at the lists when there is none.
  // "Review" is "Record what you did": the tracking form for that card (status owned / sold / passed, purchase cost).
  //
  // The strip is re-inserted only when it is missing or for a different route, so it never rewrites itself (a settled
  // screen stays settled); a bounded number of checks follows each route change, with no page-wide timer.

  if (window.FlipForgeCustomerJourney) return;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const NAV = "data-ff-journey";
  const ROUTES = Object.freeze({ opportunities: "receipt", tracking: "track", portfolio: "portfolio", alerts: "alerts", "forge-heat": "heat" });
  const state = { cardId: "", pendingFocus: "", attempts: 0, timer: 0, observer: null, running: false };

  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function route() {
    const parts = String(location.hash || "").replace(/^#\/?/, "").split(/[?#]/)[0].split("/");
    const section = parts[0] || "";
    let id = "";
    if (parts[1]) { try { id = decodeURIComponent(parts[1]); } catch (_) { id = ""; } }
    if (!SAFE_ID.test(id)) id = "";
    const step = ROUTES[section];
    // The strip is for one card's receipt or tracking page, and for the three account-wide follow-up pages.
    if (!step || ((step === "receipt" || step === "track") && !id) || (step !== "receipt" && step !== "track" && id)) return null;
    return { section, id, step };
  }

  function steps(current) {
    const id = current.id || state.cardId;
    const card = id ? encodeURIComponent(id) : "";
    return [
      ["discover", "Discover", "#/discover"],
      ["evaluate", "Evaluate", "#/evaluate"],
      ["save", "Saved decisions", "#/opportunities"],
      ["receipt", "Decision Receipt", card ? `#/opportunities/${card}` : "#/opportunities"],
      ["track", "Track", card ? `#/tracking/${card}` : "#/tracking"],
      ["review", "Review: record what you did", card ? `#/tracking/${card}` : "#/tracking"],
      ["portfolio", "Portfolio", "#/portfolio"],
      ["alerts", "Alerts", "#/alerts"],
      ["heat", "Forge Heat", "#/forge-heat"]
    ];
  }

  function key(current) { return `${current.step}:${current.id || state.cardId || ""}`; }

  function markup(current) {
    const items = steps(current).map(([step, label, href], index) => {
      const here = step === current.step;
      return `<li data-ff-journey-step="${step}"${here ? ' class="is-current"' : ""}><a href="${escapeHtml(href)}"${here ? ' aria-current="step"' : ""}`
        + `${step === "review" ? " data-ff-journey-review" : ""}><span aria-hidden="true">${index + 1}</span>${escapeHtml(label)}</a></li>`;
    }).join("");
    return `<nav class="ff-journey" ${NAV}="${escapeHtml(key(current))}" aria-label="Your decision journey"><p>Your decision journey</p><ol>${items}</ol></nav>`;
  }

  // Where the strip goes: right after the page's own heading, so it never sits inside a panel or the CDI Signal Stack.
  function anchor(main) {
    const page = main.firstElementChild;
    if (!page) return null;
    const heading = page.querySelector(":scope > header, :scope > .page-heading, :scope > .forge-heat-hero");
    return heading || null;
  }

  function apply() {
    const main = document.getElementById("main-content");
    const current = route();
    const existing = main ? main.querySelectorAll(`[${NAV}]`) : [];
    if (!main || !current) { existing.forEach(node => node.remove()); return true; }
    const wanted = key(current);
    let kept = false;
    existing.forEach(node => {
      if (!kept && node.getAttribute(NAV) === wanted && node.isConnected) { kept = true; return; }
      node.remove();
    });
    if (kept) return focusPending(main);
    const heading = anchor(main);
    if (!heading) return false;
    heading.insertAdjacentHTML("afterend", markup(current));
    return focusPending(main);
  }

  // "Review: record what you did" lands on the card's tracking form.
  function focusPending(main) {
    if (state.pendingFocus !== "review") return true;
    const form = main.querySelector("[data-lifecycle-form]");
    if (!form) return false;
    state.pendingFocus = "";
    form.scrollIntoView({ block: "start" });
    const field = form.querySelector('[name="trackingStatus"]');
    if (field) field.focus({ preventScroll: true });
    return true;
  }

  function schedule() {
    window.clearTimeout(state.timer);
    state.attempts = 0;
    state.running = true;
    const tick = () => {
      const done = apply();
      if (++state.attempts >= 30 || (done && state.attempts >= 12)) { state.running = false; return; }
      state.timer = window.setTimeout(tick, 250);
    };
    tick();
  }

  function remember() {
    const current = route();
    if (current && current.id) state.cardId = current.id;
  }

  document.addEventListener("click", event => {
    const link = event.target && event.target.closest ? event.target.closest("[data-ff-journey-review]") : null;
    if (!link) return;
    state.pendingFocus = "review";
    if (link.getAttribute("href") === location.hash) { event.preventDefault(); schedule(); }
  });

  // A page renderer that replaces the main content (a refresh, a saved change) removes the strip: put it back once.
  function observe() {
    const main = document.getElementById("main-content");
    if (!main || state.observer) return;
    state.observer = new MutationObserver(() => {
      const current = route();
      if (!current) return;
      const wanted = key(current);
      const node = main.querySelector(`[${NAV}]`);
      if (node && node.getAttribute(NAV) === wanted) return;
      if (!state.running) schedule();
    });
    state.observer.observe(main, { childList: true });
  }

  window.addEventListener("hashchange", () => { remember(); schedule(); });
  remember();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { observe(); schedule(); }, { once: true });
  else { observe(); schedule(); }

  window.FlipForgeCustomerJourney = Object.freeze({ apply, route });
})();
