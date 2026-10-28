// Post-release website polish (v1), founder-approved 2026-10-27:
//  1. the homepage leads with Card Decision Intelligence™ and a plain benefit line, with the locked slogan unchanged;
//  2. the Decision Challenge and Inside FlipForge are one tap from the top of the page;
//  3. the four checks never show a green tick for an unresolved check, and customers never see raw status codes;
//  4. homepage engagement is counted (allowlisted, counts only) and shown to the founder in the operator view.
// Static contract plus small behavioural checks. The rendered walkthrough is scripts/audit-homepage-experiences-rendered.mjs.
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const page = read('index.html');
const heroCss = read('assets/css/homepage-hero-positioning-v1.css');
const engagement = read('assets/js/homepage-engagement-v1.js');
const tracker = read('assets/js/conversion-events.js');
const server = read('netlify/modern-functions/conversion-event.mjs');
const core = read('netlify/modern-functions/lib/beta-operations-core.mjs');
const operator = read('assets/js/beta-operator.js');
const operatorPage = read('operator-beta.html');
const stack = read('saas-prototype/customer-cdi-signal-stack-v1.js');
const stackCss = read('saas-prototype/customer-cdi-signal-stack-v1.css');
const di = read('saas-prototype/decision-intelligence-ux-v2.js');
const discovery = read('saas-prototype/customer-discovery.js');
let passed = 0;
const failures = [];
const check = (label, ok) => { if (ok) passed++; else failures.push(label); };

// ---------- 1. Positioning ----------
const hero = page.slice(page.indexOf('<section class="ff10-hero"'), page.indexOf('</section>', page.indexOf('<section class="ff10-hero"')));
const order = ['class="ff10-hero-category"', 'id="ff10-hero-title"', 'class="ff10-hero-benefit"', 'class="ff10-hero-brand"', 'class="ff10-lede"', 'class="ff10-actions"'];
check('P01 hero order: category, "Price is not proof.", benefit, slogan, explanation, actions',
  order.map(t => hero.indexOf(t)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])));
check('P02 category reads "Card Decision Intelligence™"', hero.includes('<span>Card Decision Intelligence<sup>™</sup></span>'));
check('P03 benefit line is exact', hero.includes('<span>Find opportunities.</span> <span>Test the evidence.</span> <span>Avoid expensive mistakes.</span>'));
check('P04 headline and locked slogan unchanged', hero.includes('<span>Price is</span> <span>not proof.</span></h1>')
  && hero.includes('<p class="ff10-hero-brand"><span>Before</span> <span>you buy.</span> <span>Know Why.</span></p>'));
check('P05 existing hero art, illustrative panel and disclosure untouched', hero.includes('assets/images/ff10-hero.webp')
  && hero.includes('class="ff10-panel"') && hero.includes('Fictional card and illustrative numbers. Not a live evaluation.')
  && hero.includes('Invented for illustration; not a real card, player, set or grading company.'));
check('P06 hero styles use the v10 tokens only and are linked once after the existing homepage styles',
  !/#[0-9a-fA-F]{3,8}\b/.test(heroCss) && heroCss.includes('var(--g)')
  && (page.match(/homepage-hero-positioning-v1\.css/g) || []).length === 1
  && page.indexOf('homepage-hero-positioning-v1.css') > page.indexOf('homepage-v10.css'));

// ---------- 2. Interaction sooner ----------
check('I01 hero links go to the Decision Challenge and Inside FlipForge', hero.includes('href="#demo" data-ff-hero-jump="challenge">Try the Decision Challenge</a>')
  && hero.includes('href="#inside-the-app" data-ff-hero-jump="app">See Inside FlipForge</a>') && page.includes('id="demo"') && page.includes('id="inside-the-app"'));
check('I02 beta access stays in the hero and the sticky header', /class="ff10-hero-note">[^<]*<a href="beta-application.html" data-ff-hero-apply>Request Beta Access<\/a>/.test(hero)
  && page.includes('href="beta-application.html">Request Beta Access</a>'));

// ---------- 3. Credibility: indicators and wording ----------
check('C01 every check marker states its real outcome (passed, needs review, not available, context)',
  stack.includes('function signalOutcome(signal)') && stack.includes('data-outcome="\' + outcome + \'"')
  && !stack.includes('<span class="ff-cdi-signal-state" aria-hidden="true">✓</span>'));
check('C02 only a passed check is green; review, missing and context markers have their own styling',
  ['review', 'missing', 'context'].every(o => stackCss.includes(`.ff-cdi-signal-state[data-outcome="${o}"]`)));
check('C03 each marker carries readable text for screen readers', stack.includes('<span class="ff-cdi-sr">') && stackCss.includes('.ff-cdi-sr{'));
check('C04 the summary line says how many checks need review', stack.includes('need") + " review before you rely on this decision.'));
// Behaviour: run signalOutcome on the four rows of a VERIFY decision with no qualifying sales and a strong BUY case.
const fnSrc = stack.slice(stack.indexOf('function signalOutcome(signal)'), stack.indexOf('function signalMarkup('));
const sandbox = {}; vm.runInNewContext(`${fnSrc}; this.signalOutcome = signalOutcome;`, sandbox);
const outcome = sandbox.signalOutcome;
check('C05 VERIFY with no qualifying sale: identity and price need review, sales count of 0 needs review, no green tick',
  outcome({ key: 'exact', verified: false }) === 'review' && outcome({ key: 'sales', accepted: 0 }) === 'review'
  && outcome({ key: 'sales', accepted: null }) === 'missing' && outcome({ key: 'price', supported: null }) === 'review'
  && outcome({ key: 'uncertainty', confidence: 15, risk: 90 }) === 'context' && outcome({ key: 'uncertainty', confidence: null, risk: null }) === 'missing');
check('C06 a supported case still shows passed checks', outcome({ key: 'exact', verified: true }) === 'passed'
  && outcome({ key: 'sales', accepted: 3 }) === 'passed' && outcome({ key: 'price', supported: 505 }) === 'passed');
check('C07 the check logic only reads values already on the row (no decision change)', !/fetch\(|recommendation\s*=|decision\s*=/.test(fnSrc));
const codeRule = /^[A-Z0-9]+(?:[ _][A-Z0-9]+)*$/;
check('C08 status codes such as "NO PRICE CHANGE" are never shown as what would change the decision',
  di.includes('!/^[A-Z0-9]+(?:[ _][A-Z0-9]+)*$/.test(changeSummary)') && codeRule.test('NO PRICE CHANGE') && codeRule.test('NO_PRICE_CHANGE')
  && !codeRule.test('A lower asking price or a qualifying exact sale.'));
const wordsSrc = discovery.slice(discovery.indexOf('const AVAILABILITY_WORDS'), discovery.indexOf('function moneyFromCents('));
const box = {}; vm.runInNewContext(`${wordsSrc}; this.listingWords = listingWords; this.A = AVAILABILITY_WORDS; this.F = FRESHNESS_WORDS; this.T = FORMAT_WORDS;`, box);
check('C09 Discover shows listing state and format in plain words', box.listingWords(box.A, 'AVAILABLE') === 'Available' && box.listingWords(box.F, 'CURRENT') === 'Recently checked'
  && box.listingWords(box.T, 'FIXED_PRICE') === 'Fixed price' && box.listingWords(box.A, 'SOMETHING_NEW') === 'Something new' && box.listingWords(box.A, '') === 'Not confirmed'
  && !discovery.includes('String(item.listingAvailability || "UNKNOWN").replaceAll("_", " ")'));

// ---------- 4. Measurement ----------
check('M01 hero shortcut clicks and section reach are counted once per page view, with no storage or identifiers',
  engagement.includes("track('hero_jump_clicked'") && engagement.includes("track('section_viewed', placement)") && engagement.includes('seen.has(placement)')
  && !/localStorage|sessionStorage|document\.cookie|fetch\(|sendBeacon/.test(engagement)
  && (page.match(/homepage-engagement-v1\.js/g) || []).length === 1);
check('M02 the new counts are allowlisted on the page and on the server', ['hero_jump_clicked', 'section_viewed'].every(e => tracker.includes(`"${e}"`) && server.includes(`"${e}"`))
  && ['hero-challenge', 'hero-app', 'inside-app'].every(p => server.includes(`"${p}"`)) && tracker.includes('hero-(challenge|app)|inside-app'));
check('M03 the founder sees homepage engagement next to the acquisition funnel', core.includes('homepage: {') && ['challengeReached', 'challengeTried', 'challengeFinished',
  'insideAppReached', 'appScreensOpened', 'heroShortcutsUsed', 'betaCtaClicked'].every(k => core.includes(k) && operator.includes('h.' + k))
  && operatorPage.includes('data-homepage-funnel-grid') && operator.includes('data-homepage-funnel-grid'));
check('M04 hero beta-access clicks are attributed to the hero', tracker.includes('.ff10-hero,'));

// ---------- Disclosures preserved ----------
check('D01 fictional-data disclosures and compliance wording remain', ['Real FlipForge app · fictional card and illustrative data', 'No real sales, sellers or customer records are shown',
  'NO REAL SALE DATA', 'FlipForge is decision support'].every(t => page.includes(t)));

if (failures.length) { for (const f of failures) console.log(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: ${passed} website polish checks (positioning, interaction, credibility, measurement, disclosures).`);
