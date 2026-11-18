// Phase 6 (scope item 7): validates the founder-run Instagram beta recruitment kit in docs/phase6/instagram-beta/.
// The kit must never post, DM, scrape or call an Instagram/Graph API; it must only build links the site's own campaign
// validator accepts; it must hold no personal data; and it must never be published.
import fs from "node:fs";
import vm from "node:vm";
import { validateCampaign, CAMPAIGN_SOURCES } from "../netlify/modern-functions/lib/beta-operations-core.mjs";

const failures = [];
let total = 0;
const check = (name, ok) => { total += 1; if (!ok) failures.push(name); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const read = rel => fs.readFileSync(rel, "utf8");
const KIT = "docs/phase6/instagram-beta";
const files = ["README.md", "TEMPLATES.md", "CONSENT_AND_PRIVACY.md", "link-builder-and-tracker.html"];

check("K01 kit files exist", files.every(f => fs.existsSync(`${KIT}/${f}`)));
const html = read(`${KIT}/link-builder-and-tracker.html`);
const all = files.map(f => read(`${KIT}/${f}`)).join("\n");

// K02: no network or external resource in the tool.
const network = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\bimport\s*\(/, /<script[^>]+src=/i,
  /<link\b/i, /<img\b/i, /<iframe\b/i, /<form\b/i, /\baction\s*=/i, /url\(/i, /@import/i, /navigator\.serviceWorker/];
check("K02 the tool makes no network request and loads no external resource", network.every(rx => !rx.test(html)));
check("K03 the tool declares a CSP that blocks every connection and form submission",
  /connect-src 'none'/.test(html) && /default-src 'none'/.test(html) && /form-action 'none'/.test(html));

// K04: no Instagram / Graph API host or automation reference anywhere in the kit.
const api = /graph\.instagram|graph\.facebook|api\.instagram|i\.instagram\.com|instagram\.com\/api|access_token|client_secret|webhook/i;
check("K04 the kit names no Instagram or Graph API host, token or webhook", !api.test(all));

// K05: link rules identical to the site's validator, and every built link is accepted by it.
const block = (html.match(/\/\/ BEGIN link-rules[\s\S]*?\/\/ END link-rules/) || [""])[0];
const sandbox = { URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(block + "\n;this.buildLink=buildLink;this.SOURCES=CAMPAIGN_SOURCES;this.VALUE=CAMPAIGN_VALUE;this.BETA_URL=BETA_URL;", sandbox);
check("K05 the kit's sources and slug rule equal the site's validateCampaign",
  JSON.stringify([...sandbox.SOURCES]) === JSON.stringify([...CAMPAIGN_SOURCES]) && String(sandbox.VALUE) === String(/^[a-z0-9_-]{1,40}$/));
const samples = [["beta-wave-1", "reel-verify-explainer", "social"], ["beta-wave-2", "carousel-max-buy", "bio"], ["w3", "story-beta-call", "story"]];
const accepted = samples.every(([c, t, m]) => {
  const r = sandbox.buildLink(c, t, m);
  if (!r.url) return false;
  const u = new URL(r.url);
  const v = validateCampaign(Object.fromEntries(u.searchParams));
  return u.origin + u.pathname === "https://goflipforge.com/beta-application.html" && v && v.source === "instagram" && v.campaign === c && v.content === t && v.medium === m;
});
check("K06 every link the builder makes is accepted by the site's validateCampaign, with all four labels kept", accepted);
const refused = [["Beta Wave", "x", "social"], ["beta", "x@y", "social"], ["beta", "a".repeat(41), "social"], ["beta", "https://x", "social"], ["beta", "", "social"]]
  .every(([c, t, m]) => !!sandbox.buildLink(c, t, m).error);
check("K07 the builder refuses tags the site would drop (spaces, capitals, @, links, too long, empty)", refused);

// K08: no personal-data field in the tracker.
const inputs = [...html.matchAll(/(?:id|name|aria-label)\s*=\s*"([^"]+)"/g)].map(m => m[1].toLowerCase());
const personal = inputs.filter(n => /handle|username|user|email|e-mail|phone|name$|fullname|follower|comment_text|dm/.test(n) && n !== "campaign");
check("K08 the tracker has no field for a handle, name, email, phone, follower or message text", personal.length === 0);
check("K09 the export refuses handles, emails and links before writing", /@\[A-Za-z0-9_\.\]\{2,\}\|https\?:/.test(html.replace(/\\/g, "")) || html.includes("Remove any handle, email or link"));

// K10: export field set matches the backend funnel format (RecruitmentFunnel, ff-p6-instagram-tracker-v1).
const postFields = ["content", "campaign", "medium", "format", "week", "reach", "likes", "comments", "saves", "shares", "profileVisits", "linkTaps"];
const appFields = ["source", "medium", "campaign", "content", "allTime", "last30Days", "betaCtaClicks30Days"];
check("K10 the export declares ff-p6-instagram-tracker-v1 and uses only the backend funnel's fields",
  html.includes('"ff-p6-instagram-tracker-v1"') && postFields.every(f => html.includes(f)) && appFields.every(f => html.includes(f)));

// K11: never published.
const strip = read("scripts/strip-internal-from-publish.mjs");
const guard = read("netlify/modern-functions/internal-path-guard.mjs");
check("K11 docs/ (and so this kit) is stripped from the Netlify publish and answers 404", strip.includes('"docs"') && guard.includes('"/docs/*"'));

// K12: copy rules.
const forbidden = JSON.parse(read("marketing/content/disclaimers.json")).forbiddenClaims;
const templates = read(`${KIT}/TEMPLATES.md`);
const quoted = templates.split("\n").filter(l => l.startsWith(">")).join("\n").toLowerCase();
check("K12 template copy contains none of the forbidden claims", forbidden.every(c => !quoted.includes(c.toLowerCase())));
check("K13 the kit never names the data provider", !/card[\s_-]*sight/i.test(all));
check("K14 the kit states that every account action is the founder's own and that it never posts, DMs or scrapes",
  /never posts, sends DMs, scrapes/i.test(read(`${KIT}/README.md`)) && /Do not start DMs/.test(templates));

console.log(`validate-phase6-instagram-kit: ${total - failures.length}/${total} passed`);
if (failures.length) process.exit(1);
