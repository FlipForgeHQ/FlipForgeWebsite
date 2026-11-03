(() => {
  "use strict";

  const MAIN = "#main-content";

  function routeName() {
    return String(window.location.hash || "#/dashboard")
      .replace(/^#\/?/, "")
      .split(/[/?]/)[0] || "dashboard";
  }

  function keepSearchStationaryBelowHeading(heading, identity, search) {
    const searchFollowsHeading = Boolean(heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (searchFollowsHeading) {
      const strays = [];
      for (let node = heading.nextElementSibling; node && node !== search; node = node.nextElementSibling) {
        if (node !== identity) strays.push(node);
      }
      let anchor = search;
      for (const node of strays) {
        anchor.insertAdjacentElement("afterend", node);
        anchor = node;
      }
    }
    if (identity && search.previousElementSibling !== identity) search.insertAdjacentElement("beforebegin", identity);
    const top = identity || search;
    if (top.previousElementSibling !== heading) top.insertAdjacentElement("beforebegin", heading);
  }

  function promoteSearchPanel(main) {
    const page = main?.querySelector(".customer-discovery-page");
    const heading = page?.querySelector(":scope > .page-heading");
    const search = page?.querySelector(":scope > .customer-discovery-search");
    if (!page || !heading || !search) return;

    page.classList.add("ff-discover-above-fold");

    const identity = page.querySelector(":scope > .customer-discovery-identity-assist");
    page.classList.toggle("ff-discover-identity-required", Boolean(identity));

    // Card entry is normally the primary Discover job. When identity confirmation
    // is active, that becomes the primary task and must sit directly below the
    // page heading instead of being buried beneath search/results content.
    //
    // The search panel itself is never moved. Moving a node out of the document and
    // back drops keyboard focus, so a customer typing while another enhancement inserts
    // content above the panel (for example the Phase 3 evaluate rail) would lose
    // keystrokes and submit an empty search. Instead, anything that lands between the
    // heading and the panel is moved below the panel, which yields the same order.
    keepSearchStationaryBelowHeading(heading, identity, search);

    const results = page.querySelector(":scope > .customer-discovery-results");
    const notice = page.querySelector(":scope > .customer-discovery-notice");
    if (!identity && results) {
      let resultAnchor = search;
      if (notice) {
        if (resultAnchor.nextElementSibling !== notice) resultAnchor.insertAdjacentElement("afterend", notice);
        resultAnchor = notice;
      }
      if (resultAnchor.nextElementSibling !== results) resultAnchor.insertAdjacentElement("afterend", results);
    }

    const coach = page.querySelector(":scope > [data-ff-discover-coach]");
    const workflow = page.querySelector(":scope > [data-ff-workflow-strip]");
    const decisionKey = page.querySelector(":scope > [data-ff-decision-key]");
    const boundary = [...page.querySelectorAll(":scope > .boundary-note")]
      .find(node => /decision framework|authority boundary/i.test(String(node.textContent || "")));

    let anchor = !identity && results ? results : search;
    for (const node of [coach, workflow, decisionKey, boundary]) {
      if (!node || node === anchor) continue;
      if (anchor.nextElementSibling !== node) anchor.insertAdjacentElement("afterend", node);
      anchor = node;
    }
  }

  // Discover's wording, labels, helper text, "Factor score" and the not-eligible status are rendered by
  // customer-discovery.js. This file only keeps the Discover reading order when other Discover additions
  // (workflow strip, guidance) are inserted after the owner renders.
  function decorate() {
    if (routeName() !== "discover") return;
    const main = document.querySelector(MAIN);
    if (!main) return;
    promoteSearchPanel(main);
  }

  let queued = false;
  let observer = null;

  function observeMain() {
    const main = document.querySelector(MAIN);
    if (main && observer) observer.observe(main, { childList: true, subtree: true });
  }

  function decorateWithoutSelfObservation() {
    if (observer) observer.disconnect();
    try {
      decorate();
    } finally {
      if (observer) observeMain();
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorateWithoutSelfObservation();
    });
  }

  const main = document.querySelector(MAIN);
  if (main) {
    observer = new MutationObserver(records => {
      const meaningful = records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target?.parentElement;
        return Boolean(target);
      });
      if (meaningful) schedule();
    });
    observeMain();
  }
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule);
  schedule();
})();
