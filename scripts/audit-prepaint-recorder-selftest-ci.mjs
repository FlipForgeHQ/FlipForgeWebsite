// Self-test for scripts/lib/prepaint-frame-recorder.mjs: proves the recorder samples AFTER the page's own pre-paint
// work in the same frame, and that no frame is skipped. Runs under the same matrix as the audits
// (FLIPFORGE_NAVIGATION_API=on|off, FLIPFORGE_VIEWPORT=desktop|mobile).
//
// The test page mirrors what the app does before paint, in one frame:
//   1. its own requestAnimationFrame callback (registered after the recorder) writes frame number n to the DOM,
//   2. a microtask queued from that callback copies n to a second attribute,
//   3. a MutationObserver reacting to (2) copies n to a third attribute and replaces a child element,
//   4. a second, later-registered rAF callback writes n to a fourth attribute.
// A sampler that ran before any of these would see n-1 (or a mix). The recorder must see all four equal to the same n
// on every frame, with zero skipped frames, for >= 600 frames, while the page also does long tasks and hash changes.
import { chromium } from "playwright";
import {
  prepaintRecorderInit, drainFrames, matrixFromEnv, launchOptions, newMatrixContext, assertNavigationApi
} from "./lib/prepaint-frame-recorder.mjs";

const matrix = matrixFromEnv();
const passes = [];
const failures = [];
const check = (name, ok, detail = "") => (ok ? passes : failures).push(detail ? `${name} [${detail}]` : name);

const SAMPLE = `
  const n = document.body ? document.body.dataset : {};
  return { a: Number(n.a || 0), b: Number(n.b || 0), c: Number(n.c || 0), d: Number(n.d || 0), ts: Number(n.ts || -1),
           child: Number(document.getElementById("swap") && document.getElementById("swap").dataset.n || 0),
           hash: location.hash };
`;

const browser = await chromium.launch(launchOptions());
const context = await newMatrixContext(browser, matrix);
const page = await context.newPage();
await page.addInitScript(`(${prepaintRecorderInit.toString()})(${JSON.stringify({ sampleSource: SAMPLE })});`);
// Contrast sampler installed at page start too, the way a naive per-frame recorder would be: it runs first in each
// frame, before the page's own callbacks.
await page.addInitScript(() => {
  window.__naive = { seen: 0, early: 0 };
  const loop = ts => {
    const d = document.body ? document.body.dataset : null;
    if (d && Number(d.a) > 0) { window.__naive.seen += 1; if (Number(d.ts) !== ts) window.__naive.early += 1; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const html = `<!doctype html><html><body><div id="swap" data-n="0"></div><script>
  let n = 0;
  const body = document.body;
  new MutationObserver(() => {
    body.dataset.c = body.dataset.b;
    const swap = document.createElement("div"); swap.id = "swap"; swap.dataset.n = body.dataset.b;
    document.getElementById("swap").replaceWith(swap);
  }).observe(body, { attributes: true, attributeFilter: ["data-b"] });
  function first(ts) {
    n += 1;
    body.dataset.a = String(n);
    body.dataset.ts = String(ts); // this frame's clock
    queueMicrotask(() => { body.dataset.b = body.dataset.a; });
    requestAnimationFrame(first);
  }
  function second() { body.dataset.d = String(n); requestAnimationFrame(second); }
  requestAnimationFrame(first);
  requestAnimationFrame(second);
  // Busy main thread and route changes, like the app under load.
  setInterval(() => { const end = performance.now() + 30; while (performance.now() < end) {} }, 200);
  setInterval(() => { location.hash = "#/opportunities/x" + (n % 7); }, 90);
</script></body></html>`;
await page.route("http://prepaint-selftest.local/**", route => route.fulfill({ status: 200, contentType: "text/html", body: html }));
await page.goto("http://prepaint-selftest.local/app/", { waitUntil: "domcontentloaded" });
await assertNavigationApi(page, matrix.navigationApi);
check(`Navigation API is ${matrix.navigationApi ? "enabled" : "disabled"} as requested`, true);

await page.waitForTimeout(11_000);
const rec = await drainFrames(page);
const frames = rec.frames.filter(f => f.a > 0);
// Fresh = the DOM carries THIS frame's clock and all four page steps finished for it.
const stale = frames.filter(f => !(f.ts === f.rafTs && f.a === f.b && f.b === f.c && f.c === f.d && f.d === f.child));
check(`recorded >= 600 frames (${frames.length})`, frames.length >= 600);
check("every frame was sampled after the page's rAF callbacks, their microtasks and mutation observers in the SAME frame (frame clock matches, all markers equal)",
  stale.length === 0, stale.slice(0, 3).map(f => JSON.stringify(f)).join(" "));
check("no skipped frames: every rAF tick reached the pre-paint sample",
  rec.skipped.length === 0 && rec.rafTicks - rec.sampledTicks <= 1, `ticks=${rec.rafTicks} sampled=${rec.sampledTicks} skipped=${rec.skipped.length}`);
const consecutive = frames.every((f, i) => i === 0 || f.frame === frames[i - 1].frame + 1);
check("frame numbers are consecutive (one sample per rendered frame, none missing)", consecutive);
check("recorder raised no errors", rec.errors.length === 0, rec.errors.slice(0, 2).join("; "));

// Contrast: a naive sampler registered first in the frame reads the DOM before the page's callbacks run.
const naive = await page.evaluate(() => window.__naive);
check(`contrast: a first-in-frame rAF sampler reads the DOM before the page's work (stale on ${naive.early}/${naive.seen} frames); the pre-paint recorder on 0`,
  naive.early > 0 && stale.length === 0, JSON.stringify(naive));

await browser.close();
console.log(`Matrix: navigation API ${matrix.navigationApi ? "on" : "off"}, ${matrix.viewport}`);
for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`Pre-paint recorder self-test: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
