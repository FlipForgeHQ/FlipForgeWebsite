// Pre-paint frame recorder for browser audits.
//
// What a customer sees is the DOM at paint time. A requestAnimationFrame sampler registered at page start runs FIRST
// among the frame's rAF callbacks, so it reads the DOM before the page's own rAF work (and the microtasks and mutation
// observers that work triggers) has run - it can miss what is about to paint. This recorder samples inside a
// ResizeObserver callback instead. In the HTML "update the rendering" steps ResizeObserver notifications are delivered
// after all animation-frame callbacks (and their microtasks) and after style and layout, immediately before paint.
//
// Mechanics: an off-screen 1x1 sentinel is resized (1px <-> 2px) in the recorder's own rAF callback every frame, so the
// ResizeObserver fires exactly once per rendered frame. Each rAF tick increments a frame counter; each ResizeObserver
// delivery samples that frame. If a tick finds the previous frame unsampled, that frame was skipped and is counted, so
// an audit can require zero skipped frames.
//
// Full page loads (reloads, direct links) are covered: on "pagehide" the recorder writes its unread frames and counters
// to sessionStorage synchronously, and the next document's recorder carries them forward before its first frame, so an
// audit drains every frame of every document. Each frame carries its document number; skipped-frame accounting is per
// document (a frame pending when its document unloads was never painted by that document and is not a skip).
//
// The page-side function is serialized with Function.prototype.toString and injected via page.addInitScript, so it must
// stay self-contained. `sampleSource` is the body of a function (no arguments) that returns a plain JSON-safe object
// describing the frame; it runs pre-paint on every frame.

export function prepaintRecorderInit({ sampleSource }) {
  const sample = new Function(sampleSource);
  const CARRY_KEY = "__ffPrepaintCarry";
  let carried = { frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: [], documents: 0 };
  try {
    const raw = window.sessionStorage.getItem(CARRY_KEY);
    if (raw) { carried = JSON.parse(raw); window.sessionStorage.removeItem(CARRY_KEY); }
  } catch (_) {}
  const rec = {
    frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: [], startedAt: performance.now(),
    document: (carried.documents || 0) + 1, carried
  };
  window.__ffPrepaint = rec;
  window.addEventListener("pagehide", () => {
    try {
      const c = rec.carried;
      window.sessionStorage.setItem(CARRY_KEY, JSON.stringify({
        frames: c.frames.concat(rec.frames),
        rafTicks: c.rafTicks + rec.rafTicks,
        sampledTicks: c.sampledTicks + rec.sampledTicks,
        skipped: c.skipped.concat(rec.skipped),
        errors: c.errors.concat(rec.errors),
        documents: rec.document
      }));
    } catch (error) {
      rec.errors.push(`pagehide carry failed: ${String(error && error.message || error)}`);
    }
  });
  let sentinel = null;
  let pending = 0;
  let pendingTs = 0;
  let flip = false;

  function deliver() {
    if (!pending) return;
    const frame = pending;
    pending = 0;
    rec.sampledTicks += 1;
    try {
      const data = sample();
      data.frame = frame;
      data.document = rec.document;
      // The frame clock: every requestAnimationFrame callback in this frame received this same timestamp.
      data.rafTs = pendingTs;
      data.t = Math.round(performance.timeOrigin + performance.now()); // wall clock, ordered across documents
      rec.frames.push(data);
    } catch (error) {
      rec.errors.push(`frame ${frame}: ${String(error && error.message || error)}`);
    }
  }

  function ensureSentinel() {
    if (sentinel || !document.documentElement) return;
    sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.dataset.ffPrepaintSentinel = "";
    sentinel.style.cssText = "position:fixed;left:-50px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;contain:strict";
    document.documentElement.appendChild(sentinel);
    new ResizeObserver(deliver).observe(sentinel);
  }

  function tick(ts) {
    rec.rafTicks += 1;
    // The previous frame never reached the pre-paint delivery: record it as skipped.
    if (pending) rec.skipped.push(`document ${rec.document} frame ${pending}`);
    ensureSentinel();
    if (sentinel) {
      // Keep the sentinel attached even if the page rewrites documentElement children.
      if (!sentinel.isConnected) document.documentElement.appendChild(sentinel);
      flip = !flip;
      sentinel.style.width = flip ? "2px" : "1px";
      pending = rec.rafTicks;
      pendingTs = ts;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Drain recorded frames from the page, including frames carried over from earlier documents of this tab.
// Returns { frames, rafTicks, sampledTicks, skipped, errors, documents }. Retries if a page load is in progress.
export async function drainFrames(page) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(() => {
        const rec = window.__ffPrepaint;
        if (!rec) return { frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: ["recorder not installed"], documents: 0 };
        const c = rec.carried;
        const out = {
          frames: c.frames.concat(rec.frames.splice(0)),
          rafTicks: c.rafTicks + rec.rafTicks,
          sampledTicks: c.sampledTicks + rec.sampledTicks,
          skipped: c.skipped.concat(rec.skipped),
          errors: c.errors.concat(rec.errors),
          documents: rec.document
        };
        rec.carried = { frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: [], documents: rec.document - 1 };
        rec.rafTicks = 0; rec.sampledTicks = 0; rec.skipped = []; rec.errors = [];
        return out;
      });
    } catch (error) {
      if (attempt >= 20 || !/Execution context was destroyed|navigation|Target closed|Cannot find context/i.test(String(error && error.message))) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(100);
    }
  }
}

// Common environment matrix knobs, read from the environment so CI can fan out:
//   FLIPFORGE_NAVIGATION_API=on|off   (off removes the Navigation API from every page before site scripts run)
//   FLIPFORGE_VIEWPORT=desktop|mobile (mobile = 390x844, touch, mobile UA)
export function matrixFromEnv() {
  const navigationApi = (process.env.FLIPFORGE_NAVIGATION_API || "on").toLowerCase() !== "off";
  const viewport = (process.env.FLIPFORGE_VIEWPORT || "desktop").toLowerCase() === "mobile" ? "mobile" : "desktop";
  return { navigationApi, viewport };
}

export function launchOptions() {
  return { headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) };
}

// Chromium has no runtime switch for the Navigation API (it is a shipped feature), so "off" removes it from the page
// before any site script runs: deleting the accessor from the Window prototype chain leaves the same state as a
// browser without the API (typeof navigation === "undefined", "navigation" in window === false).
export function removeNavigationApi() {
  for (const target of [window, Window.prototype, Object.getPrototypeOf(window)]) {
    try { delete target.navigation; } catch (_) {}
  }
  for (const name of ["Navigation", "NavigateEvent", "NavigationHistoryEntry", "NavigationTransition",
    "NavigationDestination", "NavigationCurrentEntryChangeEvent", "NavigationActivation"]) {
    try { delete window[name]; } catch (_) {}
  }
}

// Creates a browser context for the matrix cell. Call before any page is created.
export async function newMatrixContext(browser, matrix) {
  const context = await browser.newContext(contextOptions(matrix));
  if (!matrix.navigationApi) await context.addInitScript(removeNavigationApi);
  return context;
}

export function contextOptions({ viewport }) {
  return viewport === "mobile"
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" }
    : { viewport: { width: 1440, height: 900 } };
}

// Proves the matrix setting took effect in the page.
export async function assertNavigationApi(page, expected) {
  const present = await page.evaluate(() => "navigation" in window && typeof window.navigation === "object" && window.navigation !== null
    && typeof window.navigation.addEventListener === "function");
  if (present !== expected) throw new Error(`Navigation API expected ${expected ? "enabled" : "disabled"} but page reports ${present ? "enabled" : "disabled"}`);
}

// Per-frame sample for saved-decision audits (body of a no-argument function; runs in the page, pre-paint).
// Captures the address-bar route, the saved card on screen (Card Intelligence hero: title, verdict, ask) and every
// visible verdict claim: the "How to read this result" guide (and its active key), the decision summary pill, the
// Guided Mode panel title, the decision panel ("See why FlipForge said ...") and the plain-language BUY explanation.
export const CARD_FRAME_SAMPLE = `
  const route = String(location.hash || "").replace(/^#\\/?/, "").split("?")[0];
  const cardMatch = route.match(/^opportunities\\/([^/]+)/);
  let id = "";
  if (cardMatch) { try { id = decodeURIComponent(cardMatch[1]); } catch (_) { id = cardMatch[1]; } }
  const main = document.querySelector("#main-content");
  const visible = node => Boolean(node && node.isConnected && !node.closest("[hidden]") && node.getClientRects().length
    && getComputedStyle(node).visibility !== "hidden" && Number(getComputedStyle(node).opacity) > 0.01);
  const heroNode = main && main.querySelector(".customer-intelligence-hero");
  let hero = null;
  if (heroNode && visible(heroNode)) {
    const values = [...heroNode.querySelectorAll(".customer-value-summary > strong")].map(n => String(n.textContent || "").trim());
    // Evidence count shown for this card: the hero's accepted-sales line, or the page's "Accepted exact sales" figure.
    let evidence = null;
    const small = String(heroNode.querySelector(".customer-value-summary small") && heroNode.querySelector(".customer-value-summary small").textContent || "");
    const heroCount = small.match(/(\d+) accepted exact completed sale/);
    if (heroCount) evidence = Number(heroCount[1]);
    else if (main) {
      const cell = [...main.querySelectorAll(".staging-key-grid > div")].find(n => /^Accepted exact sales$/.test(String(n.querySelector("span") && n.querySelector("span").textContent || "").trim()));
      if (cell && visible(cell)) evidence = Number(String(cell.querySelector("strong") && cell.querySelector("strong").textContent || "").trim());
    }
    hero = {
      title: String(heroNode.querySelector("h2") && heroNode.querySelector("h2").textContent || "").trim(),
      verdict: String(heroNode.querySelector(".staging-status") && heroNode.querySelector(".staging-status").textContent || "").trim().toUpperCase(),
      ask: values[0] || "",
      supported: values[1] || "",
      evidence
    };
  }
  const claims = [];
  const VERDICT = /^(BUY|WATCH|VERIFY|PASS)$/;
  if (main) {
    main.querySelectorAll("[data-ff-p3-result-guide]").forEach(node => {
      if (!visible(node)) return;
      const d = String(node.dataset.decision || "").toUpperCase();
      if (d) claims.push(["result guide", d]);
      const active = node.querySelector('[data-active="true"]');
      if (active && visible(active)) claims.push(["result guide key", String(active.textContent || "").trim().toUpperCase()]);
    });
    main.querySelectorAll("[data-ff-decision-summary] .ff-decision-summary-pill").forEach(node => {
      const v = String(node.textContent || "").trim().toUpperCase();
      if (visible(node) && VERDICT.test(v)) claims.push(["decision summary", v]);
    });
    const stack = main.querySelector("[data-ff-cdi-stack-host]");
    if (stack && visible(stack)) {
      const said = String(stack.innerText || "").match(/FlipForge said (BUY|WATCH|VERIFY|PASS)\\b/);
      if (said) claims.push(["decision panel", said[1]]);
    }
    if (/cleared the current decision checks|Enough governed support exists for BUY|clears the current decision checks/.test(main.innerText || "")) {
      claims.push(["BUY explanation text", "BUY"]);
    }
  }
  const guideTitle = document.querySelector("#ff-guided-mode-root .ff-guide-panel h2");
  const guided = String(guideTitle && guideTitle.textContent || "").match(/Start here:\\s*(BUY|WATCH|VERIFY|PASS)\\b/i);
  if (guided && visible(guideTitle)) claims.push(["Guided Mode", guided[1].toUpperCase()]);
  // Dashboard V3 (opt-in): the card panel on screen and the row marked as selected.
  let v3 = null;
  const dossier = main && main.querySelector('[data-ffv3-section="dossier"]');
  if (dossier && visible(dossier)) {
    const dt = String(dossier.innerText || "");
    const lines = dt.split(String.fromCharCode(10)).map(line => line.trim()).filter(Boolean);
    const money = label => { const i = lines.indexOf(label); const v = i >= 0 ? lines[i + 1] : ""; return /^[$][0-9,]+[.][0-9]{2}$/.test(v || "") ? v : null; };
    const pressed = main.querySelector('[data-ffv3-select][aria-pressed="true"]');
    const used = dt.match(/([0-9]+) exact sales? used/);
    v3 = {
      id: String(dossier.getAttribute("data-ffv3-selected") || ""),
      text: dt.slice(0, 4000),
      verdict: (lines.find(line => /^(BUY|WATCH|VERIFY|PASS)$/.test(line)) || ""),
      ask: money("All-in ask"),
      maxBuy: money("Modeled Max Buy"),
      evidence: used ? Number(used[1]) : null,
      pressed: pressed ? String(pressed.getAttribute("data-ffv3-select") || "") : ""
    };
  }
  const text = main ? String(main.textContent || "") : "";
  return {
    route,
    id,
    hero,
    v3,
    claims,
    loading: /Loading card intelligence/i.test(text),
    error: /We couldn.t complete that request|took too long to load|did not finish loading/i.test(text)
  };
`;

// Strict per-frame rules. A single violating frame is a failure.
//   1. A card on screen must be the card in the address bar: same title (card identity incl. grade), same saved
//      verdict, same asking price, same supported value and - where shown - the same evidence count.
//      (Off a card route, no card may be on screen.)
//   2. Every visible verdict claim must equal the saved verdict of the card on screen; with no card on screen, no
//      verdict may be claimed.
export function frameViolations(frames, cards, money) {
  const out = [];
  for (const f of frames) {
    const card = f.id ? cards[f.id] : null;
    if (f.hero) {
      if (!card) out.push({ f, why: `a card ("${f.hero.title}" ${f.hero.verdict}) is on screen while the URL is "${f.route}"` });
      else if (f.hero.title !== card.title || f.hero.verdict !== card.recommendation || f.hero.ask !== money(card.ask)
        || f.hero.supported !== money(card.supportedValue) || (f.hero.evidence !== null && f.hero.evidence !== card.acceptedSales)) {
        out.push({ f, why: `URL card ${f.id} but screen shows "${f.hero.title}" ${f.hero.verdict} ask ${f.hero.ask} supported ${f.hero.supported} evidence ${f.hero.evidence}` });
      }
    }
    if (f.v3) {
      const c = cards[f.v3.id];
      const titles = Object.values(cards).map(x => x.title);
      // Card identity in the panel: exactly this card's title, no other card's.
      const showsOwnTitle = c && f.v3.text.includes(c.title);
      const otherTitle = titles.find(t => !c || (t !== c.title && f.v3.text.includes(t) && !c.title.includes(t)));
      const cents = v => `$${(Number(v)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (!c) out.push({ f, why: `V3 panel shows unknown card "${f.v3.id}"` });
      else if (!showsOwnTitle || otherTitle || f.v3.verdict !== c.recommendation
        || (f.v3.ask !== null && f.v3.ask !== cents(c.ask))
        || (c.maxBuy !== undefined && f.v3.maxBuy !== null && f.v3.maxBuy !== cents(c.maxBuy))
        || (f.v3.evidence !== null && f.v3.evidence !== c.acceptedSales)
        || (f.v3.pressed && f.v3.pressed !== f.v3.id)) {
        out.push({ f, why: `V3 panel for ${f.v3.id}: title ${showsOwnTitle ? "ok" : "missing"}${otherTitle ? ` + "${otherTitle}"` : ""}, ${f.v3.verdict}, ask ${f.v3.ask}, Max Buy ${f.v3.maxBuy}, evidence ${f.v3.evidence}, selected row ${f.v3.pressed}` });
      }
    }
    for (const [surface, verdict] of f.claims) {
      if (!f.hero) out.push({ f, why: `${surface} says ${verdict} while no card is on screen` });
      else if (verdict !== f.hero.verdict) out.push({ f, why: `${surface} says ${verdict} over a ${f.hero.verdict} card` });
    }
  }
  return out;
}

export function describeViolations(list, limit = 4) {
  return list.slice(0, limit).map(v => `frame ${v.f.frame} (+${v.f.t}ms): ${v.why}`).join("; ");
}
