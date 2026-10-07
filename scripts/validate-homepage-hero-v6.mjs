// Homepage hero v6 governance: one hero implementation, one visual authority path (Decision Visual System),
// one illustrative WATCH scenario, truthful labelling, no trading affordances (Brand Authority V3 §6, §9, §11–15).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const index = read('index.html');
const system = read('assets/css/ff-decision-visual-v1.css');
const heroCss = read('assets/css/homepage-hero-v6.css');
const slab = read('assets/images/ff-fictional-slab-v1.svg');
const start = index.indexOf('<section class="ffh"');
const end = index.indexOf('id="film"');
const hero = start >= 0 && end > start ? index.slice(start, end) : '';
const failures = [];
const check = (label, ok) => { if (!ok) failures.push(label); };
const count = (text, needle) => text.split(needle).length - 1;

check('001 exactly one hero section and one H1 on the page', count(index, '<section class="ffh"') === 1 && count(index, '<h1') === 1 && hero.includes('<h1'));
check('002 approved headline', hero.includes('<span class="ffh-line-1">Stop guessing.</span>') && hero.includes('Start deciding with <em>evidence.</em>'));
check('003 at most one gold-emphasis word in the headline', count(hero.slice(hero.indexOf('<h1'), hero.indexOf('</h1>')), '<em>') === 1);
check('004 locked promise is the kicker', hero.includes('<p class="ffh-kicker">Before you buy. Know Why.</p>'));
check('005 primary CTA → product.html, secondary CTA → beta application',
  /<a class="ffh-cta ffh-cta--primary" href="product\.html">See What FlipForge Does/.test(hero)
  && /<a class="ffh-cta ffh-cta--secondary" href="beta-application\.html">Request Private Beta Access/.test(hero));
check('006 visible "Illustrative product view" label inside the product visual', hero.includes('<span class="ffdv-label">Illustrative product view</span>'));
check('007 fixture disclaimer is visible', hero.includes('Fictional card · example values, not market data'));
check('008 exactly one verdict and it is WATCH (no competing VERIFY/BUY/PASS in the hero)',
  count(hero, 'class="ffdv-verdict"') === 1 && hero.includes('<span class="ffdv-verdict">WATCH</span>')
  && !/\b(VERIFY|BUY|PASS)\b/.test(hero.replace(/<[^>]+>/g, ' ').replace(/Max Buy/g, '')));
check('009 Decision → Economics → Evidence → Action order in the intelligence stack; Uncertainty sits beside identity',
  (() => {
    const stack = hero.slice(hero.indexOf('class="ffdv-stack"'));
    const identity = hero.slice(hero.indexOf('class="ffdv-identity"'), hero.indexOf('class="ffdv-stack"'));
    return ['ffdv-decision', 'ffdv-economics', 'ffdv-evidence', 'ffdv-action'].every((cls, i, all) =>
      stack.indexOf(cls) > (i === 0 ? -1 : stack.indexOf(all[i - 1])))
      && identity.includes('ffdv-uncertainty') && !stack.includes('ffdv-uncertainty');
  })());
check('010 exact identity, evidence states and reasons are present',
  hero.includes('Exact identity · match confirmed') && hero.includes('<dt>Accepted</dt><dd>6</dd>')
  && hero.includes('<dt>Review</dt><dd>2</dd>') && hero.includes('<dt>Excluded</dt><dd>4</dd>')
  && hero.includes('Wrong grade ×2') && hero.includes('Wrong parallel') && hero.includes('Identity mismatch'));
check('011 next action and change condition are consistent with WATCH',
  hero.includes('<p class="ffdv-next">Monitor price and evidence</p>') && hero.includes('Ask at or below Max Buy ($398)'));
check('012 economics are the three labelled figures only (no modeled profit/ROI, breakeven or sell number)',
  hero.includes('<dt>Ask</dt><dd>$420</dd>') && hero.includes('<dt>Supported value</dt><dd>$455</dd>') && hero.includes('<dt>Max Buy</dt><dd>$398</dd>')
  && !/profit|ROI|breakeven|break-even|sell number/i.test(hero.replace(/aria-label="[^"]*"/g, '')));
check('013 no trading or purchase affordances', !/buy now|place bid|checkout|auto[- ]?buy|add to cart/i.test(hero));
check('014 no decorative price-history chart (no canvas, chart or polyline/path data in the hero)', !/<canvas|<polyline|chart|sparkline/i.test(hero));
check('015 fictional card only (no real brands, graders or leagues)',
  !/topps|panini|upper deck|psa|bgs|sgc|beckett|mlb|nba|nfl|nhl/i.test(hero + slab) && /Fictional|Invented/i.test(slab));
check('016 the product visual is announced once with a full text alternative', /<figure class="ffdv ffdv--hero" role="img" aria-label="Illustrative FlipForge product view[^"]+WATCH[^"]+monitor price and evidence/i.test(hero));
check('017 one visual authority path: Decision Visual System + v6 hero stylesheets, no #475 signature layer',
  index.includes('assets/css/ff-decision-visual-v1.css') && index.includes('assets/css/homepage-hero-v6.css')
  && !/homepage-signature-v1|ff-signature|ff-sig-|ff-approved-hero|ff-cinematic-workspace|class="wrap hero"/.test(index)
  && !exists('assets/css/homepage-signature-v1.css') && !exists('assets/js/homepage-signature-v1.js') && !exists('assets/images/ff-signature-slab-v1.svg'));
check('018 no hero JavaScript (the hero is HTML/CSS only)', !/<script/i.test(hero) && !/data-ff-sig/.test(index));
check('019 hero styles are isolated to .ffh / .ffdv selectors',
  heroCss.split('}').every(rule => !rule.includes('{') || /^\s*(@|\.ffh|from|to|\/\*|$)/.test(rule.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',')[0] || ''))
  && system.split('}').every(rule => !rule.includes('{') || /^\s*(@|\.ffdv|$)/.test(rule.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',')[0] || '')));
check('020 reduced motion: entrance motion only under prefers-reduced-motion: no-preference; no infinite animation',
  heroCss.includes('@media (prefers-reduced-motion: no-preference)') && !/infinite/.test(heroCss + system));
check('021 brand palette: gold #D4AF37 / #B8860B, silver #888F98, rules #2A2E33; no blue', system.includes('#D4AF37') && system.includes('#B8860B') && system.includes('#888F98') && system.includes('#2A2E33') && !/#(0000ff|1e90ff|3b82f6|2563eb)/i.test(system + heroCss));
check('022 approved logo files only (mark), Geist preloaded', hero.includes('assets/brand/flipforge-mark.svg') && index.includes('rel="preload" href="assets/fonts/geist-latin-wght-normal.woff2"'));
check('023 slab asset is small (≤ 6 KB)', Buffer.byteLength(slab) <= 6144);
const sections = read('assets/css/homepage-sections-v1.css');
const otherCss = ['assets/css/homepage-v5.css', 'assets/css/sitewide-graphics-v1.css', 'assets/css/homepage-sections-v1.css', 'assets/css/public-readability-contract-v1.css'].map(read).join('\n');
check('024 one hero authority: no hero/signature selectors outside homepage-hero-v6 + ff-decision-visual-v1', !/\.ff-sig|ff-signature|ff-cinematic-workspace|ff-approved-hero|ff-approved-data-summary|\.hero-visual|\.hero-copy|\.ffh\b|\.ffdv\b/.test(otherCss) && sections.includes('.film-section'));

if (failures.length) {
  console.error('FlipForge homepage hero v6 validation failed:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log('PASS: 24 homepage hero v6 governance checks.');
