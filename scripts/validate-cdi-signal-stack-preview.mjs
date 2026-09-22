import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const html = read("cdi-signal-stack-preview.html");
const css = read("assets/css/cdi-signal-stack-preview.css");
const js = read("assets/js/cdi-signal-stack-preview.js");
const visibleSource = html + "\n" + js;

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check("preview remains noindex", html.includes('name="robots" content="noindex,nofollow,noarchive"'));
check("official FlipForge lockup remains in use", html.includes("flipforge-logo-horizontal.svg") && html.includes("Before you buy. Know Why."));
check("exactly two disclosure locations exist", (html.match(/data-disclosure/g) || []).length === 2);
check("repeated authority jargon is removed from the page", !/SERVER-OWNED|not recommendation authority|governed/i.test(visibleSource));
check("plain-language verdict appears before technical decision metadata", html.indexOf("data-decision-label") > -1 && html.indexOf("data-decision-label") < html.indexOf("data-decision>VERIFY"));
check("plain-language verdict is the primary heading", html.includes('<h2 id="ff-cdi-decision-title" data-decision-label>Verify before acting</h2>'));
check("status chips avoid old internal states", !/>LOCKED<|>THIN<|>WITHHELD<|>STABLE<|>REVIEW</.test(visibleSource));
check("four beginner checks remain", ["Confirm the exact card","Check trustworthy sales","Compare the price","Measure uncertainty"].every(value => html.includes(value)));
check("primary first-time action is explicit", html.includes("data-start-tour") && html.includes("Show me why FlipForge said VERIFY"));
check("detailed reasoning is hidden until interaction", html.includes('data-reasoning hidden'));
check("redundant Why This Decision recap is removed", !html.includes("ff-cdi-explainer") && !html.includes("WHY THIS DECISION"));
check("identity uses a real check-stack visual", html.includes("ff-cdi-visual-identity") && (html.match(/<i>✓<\/i>/g) || []).length === 3);
check("evidence uses a qualification-dot visual", html.includes("ff-cdi-visual-evidence") && js.includes("setEvidenceDots"));
check("economics uses an animatable SVG sparkline", html.includes("data-price-spark") && css.includes("ff-cdi-line-draw"));
check("uncertainty uses confidence ring and risk bar", html.includes("ff-cdi-mini-ring") && html.includes("data-risk-mini") && css.includes("ff-cdi-ring-fill") && css.includes("ff-cdi-risk-fill"));
check("guided stack uses 340ms stagger", js.includes("index*340") && js.includes("Check ${index+1} of ${signals.length}"));
check("Replay reasoning remains available", html.includes("data-replay") && js.includes('querySelector("[data-replay]")'));
check("verdict stays visible before the build begins", html.indexOf("ff-cdi-verdict") < html.indexOf("data-reasoning hidden"));
check("BUY WATCH VERIFY PASS all remain QA previewable", ["BUY","WATCH","VERIFY","PASS"].every(value => html.includes(`data-preview-state="${value}"`) && js.includes(`${value}:{`)));
check("full evidence remains collapsed by default", html.includes("<details data-full-evidence>") && !html.includes("<details open data-full-evidence>"));
check("Decision Receipt remains collapsed by default", html.includes('details class="ff-cdi-receipt-preview" data-receipt') && !html.includes('details open class="ff-cdi-receipt-preview"'));
check("brand palette uses locked gold and gold2", css.includes("--cdi-gold:#d4af37") && css.includes("--cdi-gold-2:#f0ca58"));
check("preview headline follows public page-title scale", css.includes("font-size:clamp(36px,3.6vw,48px)"));
check("supporting copy is readable at 15-16px", css.includes("font-size:16px") && css.includes("font-size:15px"));
check("reduced-motion users receive the complete reasoning", css.includes("@media(prefers-reduced-motion:reduce)") && js.includes("if(reduced)") && js.includes("finishImmediately()"));
check("browser preview performs no network calls", !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/i.test(js));
check("browser preview persists no customer state", !/localStorage|sessionStorage|indexedDB/i.test(js));
check("browser preview uses no dynamic code execution", !/\beval\s*\(|new\s+Function/i.test(js));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);

if (failed.length) {
  console.error(`CDI Signal Stack preview validation failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`CDI Signal Stack preview validation passed: ${checks.length}/${checks.length}`);
