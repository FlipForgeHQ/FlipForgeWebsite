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
// The page-side function is serialized with Function.prototype.toString and injected via page.addInitScript, so it must
// stay self-contained. `sampleSource` is the body of a function (no arguments) that returns a plain JSON-safe object
// describing the frame; it runs pre-paint on every frame.

export function prepaintRecorderInit({ sampleSource }) {
  const sample = new Function(sampleSource);
  const rec = { frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: [], startedAt: performance.now() };
  window.__ffPrepaint = rec;
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
      // The frame clock: every requestAnimationFrame callback in this frame received this same timestamp.
      data.rafTs = pendingTs;
      data.t = Math.round(performance.now() - rec.startedAt);
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
    if (pending) rec.skipped.push(pending);
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

// Drain recorded frames from the page. Returns { frames, rafTicks, sampledTicks, skipped, errors }.
export async function drainFrames(page) {
  return page.evaluate(() => {
    const rec = window.__ffPrepaint;
    if (!rec) return { frames: [], rafTicks: 0, sampledTicks: 0, skipped: [], errors: ["recorder not installed"] };
    const out = { frames: rec.frames.splice(0), rafTicks: rec.rafTicks, sampledTicks: rec.sampledTicks, skipped: rec.skipped.slice(), errors: rec.errors.slice() };
    return out;
  });
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
  const hero = heroNode && visible(heroNode) ? {
    title: String(heroNode.querySelector("h2") && heroNode.querySelector("h2").textContent || "").trim(),
    verdict: String(heroNode.querySelector(".staging-status") && heroNode.querySelector(".staging-status").textContent || "").trim().toUpperCase(),
    ask: String(heroNode.querySelector(".customer-value-summary strong") && heroNode.querySelector(".customer-value-summary strong").textContent || "").trim()
  } : null;
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
  const text = main ? String(main.textContent || "") : "";
  return {
    route,
    id,
    hero,
    claims,
    loading: /Loading card intelligence/i.test(text),
    error: /We couldn.t complete that request|took too long to load|did not finish loading/i.test(text)
  };
`;

// Strict per-frame rules. A single violating frame is a failure.
//   1. A card on screen must be the card in the address bar: same title, same saved verdict, same ask.
//      (Off a card route, no card may be on screen.)
//   2. Every visible verdict claim must equal the saved verdict of the card on screen; with no card on screen, no
//      verdict may be claimed.
export function frameViolations(frames, cards, money) {
  const out = [];
  for (const f of frames) {
    const card = f.id ? cards[f.id] : null;
    if (f.hero) {
      if (!card) out.push({ f, why: `a card ("${f.hero.title}" ${f.hero.verdict}) is on screen while the URL is "${f.route}"` });
      else if (f.hero.title !== card.title || f.hero.verdict !== card.recommendation || f.hero.ask !== money(card.ask)) {
        out.push({ f, why: `URL card ${f.id} but screen shows "${f.hero.title}" ${f.hero.verdict} ${f.hero.ask}` });
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
