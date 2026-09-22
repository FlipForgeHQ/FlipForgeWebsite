import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const html = read("cdi-signal-stack-preview.html");
const css = read("assets/css/cdi-signal-stack-preview.css");
const js = read("assets/js/cdi-signal-stack-preview.js");

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check("preview is noindex", html.includes('name="robots" content="noindex,nofollow,noarchive"'));
check("official brand lockup is used", html.includes("flipforge-logo-horizontal.svg") && html.includes("Before you buy. Know Why."));
check("preview is explicitly frozen and non-live", html.includes("Frozen sample data") && html.includes("No live recommendation authority"));
check("authoritative decision is visible before animation", html.includes('data-decision>VERIFY</strong>'));
check("all four governed decision states are previewable", ["BUY","WATCH","VERIFY","PASS"].every(value => js.includes(`${value}:{`) || js.includes(`${value}: {`) || html.includes(`data-preview-state="${value}"`)));
check("signal stack has four customer-facing layers", ["identity","evidence","economics","uncertainty"].every(value => html.includes(`data-signal="${value}"`)));
check("first-time users receive a plain-language four-step guide", ["Confirm the exact card","Check trustworthy sales","Compare the price","Measure uncertainty"].every(value => html.includes(value)));
check("beginner guide explains that FlipForge performs the checks", html.includes("You do not need to calculate anything or know our terminology."));
check("beginner guide controls connect to the matching reason signal", html.includes("data-guide-signal=\"identity\"") && js.includes("guideButtons") && js.includes("renderDetail(key)") && js.includes("scrollIntoView"));
check("Forge Heat is explicitly secondary", html.includes("Opportunity priority · not recommendation authority") && html.includes("Forge Heat ranks eligible saved opportunities"));
check("Smart Opportunity authority is explicit", html.includes("Smart Opportunity remains the sole BUY / WATCH / VERIFY / PASS authority"));
check("browser preview makes no network calls", !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/i.test(js));
check("browser preview keeps no persistent customer state", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("browser preview uses no dynamic code execution", !/\beval\s*\(|new\s+Function/i.test(js));
check("replay is presentation-only", html.includes("data-replay") && js.includes("function play()") && !/evaluation|api\/v1|opportunit(?:y|ies)\//i.test(js));
check("skip keeps result instantly available", html.includes("data-skip") && js.includes("finishImmediately"));
check("reduced motion falls back to complete stack", css.includes("@media(prefers-reduced-motion:reduce)") && js.includes("prefers-reduced-motion: reduce") && js.includes("finishImmediately()"));
check("mobile-first breakpoints are present", css.includes("@media(max-width:720px)") && css.includes("@media(max-width:430px)"));
check("touch/click signal explanation is present", js.includes('node.addEventListener("click"') && html.includes('aria-pressed="true"'));
check("full evidence stays progressively disclosed", html.includes("See full evidence") && html.includes("data-full-evidence"));
check("Decision Receipt connection is present", html.includes("Decision Receipt") && html.includes("SERVER-OWNED RECORD"));
check("VERIFY sample demonstrates withheld value and Heat", js.includes("Supported value withheld") && js.includes("Heat stays withheld"));
check("PASS sample demonstrates good evidence can coexist with weak economics", js.includes("Good confidence does not rescue weak economics."));
check("visual motion uses CSS transitions rather than a library", css.includes("transition:") && !/gsap|anime\.js|framer|lottie/i.test(html + js));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
}
if (failed.length) {
  console.error(`CDI Signal Stack preview validation failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`CDI Signal Stack preview validation passed: ${checks.length}/${checks.length}`);
