import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), "utf8");

const index = read("index.html");
const styles = read("sidebar-edge-fix.css");
const script = read("sidebar-edge-fix.js");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 sidebar edge stylesheet is loaded", index.includes('href="sidebar-edge-fix.css"'));
check("002 sidebar edge script is loaded", index.includes('src="sidebar-edge-fix.js"'));
check("003 stylesheet loads after cockpit UX styles", index.indexOf('href="sidebar-edge-fix.css"') > index.indexOf('href="cockpit-final-ux.css"'));
check("004 script loads after scroll reset", index.indexOf('src="sidebar-edge-fix.js"') > index.indexOf('src="scroll-reset.js"'));
check("005 desktop-only containment protects mobile transform", styles.includes("@media (min-width: 901px)"));
check("006 desktop sidebar is anchored left", styles.includes("inset-inline-start: 0") && styles.includes("left: 0"));
check("007 sidebar width remains governed by token", styles.includes("width: var(--sidebar)") && styles.includes("min-width: var(--sidebar)"));
check("008 customer shell children are width-contained", styles.includes(".brand-block") && styles.includes(".primary-nav") && styles.includes(".sidebar-footer"));
check("009 runtime resets document and shell scrollLeft", script.includes("document.scrollingElement") && script.includes("scrollLeft = 0") && script.includes('document.querySelector(".sidebar")'));
check("010 runtime transform correction is desktop guarded", script.includes('matchMedia("(min-width: 901px)")') && script.includes("if (desktop.matches)"));
check("011 mobile sidebar inline overrides are removed", script.includes('removeProperty("left")') && script.includes('removeProperty("margin-left")') && script.includes('removeProperty("transform")'));
check("012 runtime preserves vertical scroll", script.includes("const top =") && script.includes("window.scrollTo({ left: 0, top"));
check("013 no network or browser persistence is introduced", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB/.test(script));

const failures = results.filter(result => !result.passed);
console.log("SaaSSidebarEdgeValidation");
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
