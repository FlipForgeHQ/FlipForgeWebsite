// Homepage "Inside the app" (v1): real FlipForge app screens (Discover, Evaluate, Decision Receipt) for a fictional
// card. Static contract; the rendered walkthrough is scripts/audit-homepage-experiences-rendered.mjs.
import fs from 'node:fs';

const page = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/css/homepage-app-showcase-v1.css', 'utf8');
const js = fs.readFileSync('assets/js/homepage-app-showcase-v1.js', 'utf8');
const tracker = fs.readFileSync('assets/js/conversion-events.js', 'utf8');
const server = fs.readFileSync('netlify/modern-functions/conversion-event.mjs', 'utf8');
let passed = 0;
const failures = [];
const check = (label, ok) => { if (ok) passed++; else failures.push(label); };

const start = page.indexOf('<section class="ff10-app"');
const end = page.indexOf('</section>', start);
const sec = start > 0 ? page.slice(start, end) : '';
const text = sec.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const alts = [...sec.matchAll(/alt="([^"]*)"/g)].map(m => m[1]).join(' ');
const readable = `${text} ${alts}`;

check('A01 one "Inside the app" section, after the Decision Challenge and before the final call to action',
  (page.match(/data-ff-app\b/g) || []).length === 1 && page.indexOf('id="demo"') < start
  && start < page.indexOf('<!-- 7. Final call to action'));
check('A02 existing sections untouched and in order (hero, difference, question, evidence, identity, steps, audiences, demo, final)',
  ['ff10-hero', 'id="difference"', 'id="price-vs-proof"', 'id="evidence"', 'id="identity"', 'id="how-it-works"', 'id="who-its-for"', 'id="demo"', 'id="inside-the-app"', 'ff10-final"']
    .map(k => page.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])));
check('A03 three screens in order: Discover, Evaluate, Decision Receipt',
  ['discover', 'evaluate', 'receipt'].map(k => sec.indexOf(`data-app-panel="${k}"`)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))
  && (sec.match(/data-app-panel=/g) || []).length === 3 && (sec.match(/data-app-tab=/g) || []).length === 3);
check('A04 accessible tabs: tablist, tab, tabpanel, aria-controls and aria-labelledby pair up',
  sec.includes('role="tablist"') && (sec.match(/role="tab"/g) || []).length === 3 && (sec.match(/role="tabpanel"/g) || []).length === 3
  && ['discover', 'evaluate', 'receipt'].every(k => sec.includes(`aria-controls="ff10-app-panel-${k}"`) && sec.includes(`aria-labelledby="ff10-app-tab-${k}"`)));
check('A05 the label says real app, fictional card and illustrative data', text.includes('Real FlipForge app · fictional card and illustrative data'));
check('A06 the note says what is real and what is invented',
  text.includes('The card, listing, seller and sales history are invented') && text.includes('the Discover listing is illustrative')
  && text.includes('no market data providers connected') && text.includes('No real sales, sellers or customer records are shown'));

const images = [...sec.matchAll(/(?:src|srcset)="(assets\/images\/[^"]+)"/g)].map(m => m[1]);
check('A07 five real app screens, each a local WebP that exists and is under 200 KB',
  images.length === 5 && images.every(p => p.endsWith('.webp') && fs.existsSync(p) && fs.statSync(p).size < 200 * 1024));
check('A08 phone-sized screens are served to phones; every image has width, height and lazy loading',
  (sec.match(/<source media="\(max-width:760px\)"/g) || []).length === 2
  && [...sec.matchAll(/<img [^>]*>/g)].every(m => /width="\d+"/.test(m[0]) && /height="\d+"/.test(m[0]) && m[0].includes('loading="lazy"') && /alt="[^"]{40,}"/.test(m[0])));
check('A09 screens sit in a scrollable, keyboard-reachable window with a label',
  (sec.match(/class="ff10-app-window" tabindex="0" role="region" aria-label="[^"]+"/g) || []).length === 3
  && /\.ff10-app-window\{[^}]*overflow:auto/.test(css) && /\.ff10-app-window\{[^}]*max-height/.test(css));

// What the screens and copy must never show or claim.
check('A10 no real marketplace, grader, provider or player names',
  !/\b(eBay|PSA|BGS|SGC|CGC|Beckett|CardSight|130point|Goldin|PWCC|Ohtani|Topps|Panini|Bowman|Upper Deck)\b/i.test(readable));
check('A11 no profit, return, appreciation, grade or automated-buying claims',
  !/\b(guaranteed? (profit|return)|you(’|')ll profit|make money|returns? of|will appreciate|appreciat(es|ion)|predicts? the grade|buys? for you|auto-?buy)\b/i
    .test(readable.replace('does not guarantee profit', ''))
  && text.includes('does not guarantee profit'));
check('A12 numbers match the real screens: $425 ask, 15/100 confidence, 90/100 risk, VERIFY, 0 sales counted',
  readable.includes('$425') && readable.includes('15/100 confidence') && readable.includes('90/100 risk') && readable.includes('VERIFY')
  && text.includes('0 sales counted'));
check('A13 the fictional card is the homepage card (2019 Meridian Series #48 J. Carver Silver /99)',
  alts.includes('2019 Meridian Series #48 J. Carver Silver /99') && page.includes('Meridian'));

// Design: the v10 tokens and locked palette only.
const hex = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []);
check('A14 styles use the v10 tokens only (no new colours)', hex.length === 0 && css.includes('var(--g)') && css.includes('var(--line-d)'));
check('A15 stylesheet and script are linked once, after the existing homepage styles and scripts',
  (page.match(/homepage-app-showcase-v1\.css/g) || []).length === 1 && (page.match(/homepage-app-showcase-v1\.js/g) || []).length === 1
  && page.indexOf('homepage-app-showcase-v1.css') > page.indexOf('homepage-challenge-v1.css')
  && page.indexOf('homepage-app-showcase-v1.js') > page.indexOf('homepage-challenge-v1.js'));
check('A16 without script every screen is shown; the selector waits for the script',
  css.includes('.ff10-app:not(.ff10-app-ready) .ff10-app-tabs{display:none}') && js.includes("classList.add('ff10-app-ready')"));
check('A17 reduced motion turns the screen animation off', /prefers-reduced-motion:reduce[\s\S]*ff10-app-enter[\s\S]*animation:none/.test(css));

// Measurement: counts only, allowlisted on both sides.
check('A18 screen views are counted with allowlisted names only',
  js.includes("event: 'app_screen_viewed'") && tracker.includes('"app_screen_viewed"') && tracker.includes('app-(discover|evaluate|receipt)')
  && ['app_screen_viewed', 'app-discover', 'app-evaluate', 'app-receipt'].every(k => server.includes(`"${k}"`)));
check('A19 the script makes no network calls and uses no device storage',
  !/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/.test(js));

if (failures.length) {
  for (const f of failures) console.log(`FAIL: ${f}`);
  process.exit(1);
}
console.log(`PASS: ${passed} homepage "Inside the app" checks.`);
