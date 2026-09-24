import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const homepage=read('index.html');
const product=read('product.html');
const learn=read('learn.html');
const beta=read('beta-application.html');
const pricing=read('pricing.html');
const about=read('about.html');
const decisionPage=read('decision-intelligence.html');
const phase2Css=read('assets/css/phase2-premium-intelligence-v1.css');
const phase2Js=read('assets/js/phase2-premium-intelligence-v1.js');
const decisionCardCss=read('saas-prototype/decision-card-evidence-v1.css');
const decisionCardJs=read('saas-prototype/decision-card-evidence-v1.js');
const app=read('saas-prototype/index.html');
const awardJs=read('assets/js/award-winning-v1.js');
const navJs=read('assets/js/site.js');
const dealJs=read('assets/js/homepage-v5.js');
const heroCss=read('assets/css/homepage-v5.css');
const decisionForgeCss=read('assets/css/homepage-decision-forge-v1.css');
const decisionForgeJs=read('assets/js/homepage-decision-forge-v1.js');
const dealCss=heroCss;
const processCss=heroCss;
const cdiCss=heroCss;
const proofPage=read('decision-proof.html');
const proofCss=read('assets/css/decision-proof-v1.css');
const mobileCss=read('assets/css/site.css');
const sw=read('sw.js');
const failures=[];
const productionBuild=String(process.env.CONTEXT||'').toLowerCase()==='production';
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.toLowerCase().includes(needle.toLowerCase()))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};
const requireAll=(label,text,needles)=>needles.forEach(needle=>requireText(label,text,needle));

requireAll('homepage v5 identity',homepage,[
  'CARD DECISION INTELLIGENCE™',
  'The price is easy.',
  'Knowing whether to trust it isn’t.',
  'A decision you can not only trust, but understand.',
  'Before you buy. Know Why.',
  'assets/css/homepage-v5.css',
  'assets/js/homepage-v5.js',
  'assets/js/site.js'
]);
requireAll('homepage v5 hero proof',homepage,[
  'ff-cinematic-workspace',
  '<strong>$349</strong>',
  '$459.21',
  '$357.20',
  '2.3% supported gap',
  '7 CANDIDATES',
  '2 QUALIFIED',
  'EXACT CARD VERIFIED',
  'FLIPFORGE DECISION',
  '<b>VERIFY</b>'
]);
requireAll('homepage v5 film',homepage,[
  'id="film"',
  '30-SECOND PRODUCT FILM',
  '00:05 — EXACT CARD',
  '00:12 — QUALIFIED EVIDENCE',
  '00:20 — SUPPORTED VALUE',
  'Price is an input.',
  'Value is the intelligence.'
]);
requireAll('homepage v5 simulator',homepage,[
  'id="sim"',
  'data-case="exact"',
  'data-case="parallel"',
  'data-case="grade"',
  'Choose the wrong card. Watch FlipForge stop it.'
]);

requireAll('Decision Forge interactive story',homepage,[
  'id="decision-forge"',
  'data-decision-forge',
  'THE DECISION FORGE · INTERACTIVE WALKTHROUGH',
  'Watch FlipForge',
  'build the why.',
  'data-forge-step',
  'data-forge-replay',
  'data-forge-toggle',
  'data-forge-why-button',
  'FLIPFORGE DECISION',
  'Resolve → Qualify → Reject → Recalculate → Lock → Reveal',
  'assets/css/homepage-decision-forge-v1.css',
  'assets/js/homepage-decision-forge-v1.js'
]);
requireAll('Decision Forge motion system',decisionForgeCss,[
  '.ff-decision-forge',
  '.ff-df-scene',
  '.ff-df-reveal-card',
  '@media(max-width:700px)',
  '@media(prefers-reduced-motion:reduce)'
]);
requireAll('Decision Forge behavior',decisionForgeJs,[
  "IntersectionObserver",
  "data-decision-forge",
  "prefers-reduced-motion: reduce",
  "data-forge-scene",
  "data-forge-why",
  "visibilitychange"
]);
for(const store of ['localStorage','sessionStorage','indexedDB'])forbidText('Decision Forge device storage',decisionForgeJs,store);
forbidText('Decision Forge forced scrolling',decisionForgeJs,'scrollIntoView');
requireAll('homepage v5 explanation',homepage,[
  'WHAT JUST HAPPENED?',
  'WHAT IS FLIPFORGE?',
  '01 · CARD','02 · EVIDENCE','03 · VALUE','04 · DECISION'
]);
requireAll('homepage v5 Decision Proof',homepage,[
  'id="decision-proof"',
  '<strong>100</strong><span>Frozen decisions</span>',
  '<strong>42</strong><span>Measurable at T7</span>',
  'href="decision-proof.html">See the full Decision Proof →'
]);
requireAll('homepage v5 behavior',dealJs,[
  "play.addEventListener('click'",
  "progress.style.width=(t/30*100)+'%'",
  "tabs.forEach(b=>b.addEventListener('click'",
  'IntersectionObserver'
]);
for(const store of ['localStorage','sessionStorage','indexedDB'])forbidText('homepage device storage',dealJs,store);
forbidText('homepage forced scrolling',dealJs,'scrollIntoView');
for(const retired of ['assets/js/homepage-deal-or-decoy-v1.js','assets/css/homepage-deal-or-decoy-v1.css','assets/images/flipforge-approved-decision-visual.webp','Signal. Confidence. Advantage.'])forbidText('homepage retired surface',homepage,retired);
requireText('homepage mobile navigation markup',homepage,'class="mobile-nav" id="mobile-navigation"');
requireText('homepage mobile navigation behavior',homepage,'<script src="assets/js/site.js" defer></script>');
requireText('mobile menu Escape',navJs,"e.key==='Escape'");
requireText('mobile menu focus trap',navJs,"e.key==='Tab'&&menu.classList.contains('open')");
requireText('homepage v5 responsive CSS',heroCss,'@media(max-width:620px)');
requireText('homepage v5 reduced motion CSS',heroCss,'@media(prefers-reduced-motion:reduce)');
if(`${homepage}\n${product}\n${learn}`.includes('CARD VALUE INTELLIGENCE'))failures.push('public category: forbidden formal CARD VALUE INTELLIGENCE identity');

requireAll('Decision Proof methodology page',proofPage,[
  '<title>Decision Proof | FlipForge</title>',
  'Snapshot: September 18, 2026',
  '01 · Raw outcome signal',
  '02 · Economic interpretation',
  '03 · Policy-review candidate',
  '<strong>T0</strong>',
  '<strong>T7</strong>',
  '<strong>T14</strong>',
  '<strong>T30</strong>',
  'T14, T30, then Proof1000'
]);
requireAll('Decision Proof premium brand',proofCss,[
  '--ff-proof-black:#05070a',
  '--ff-proof-gold:#d7b56d',
  '--ff-proof-gold-bright:#f0d79c'
]);
for(const retiredColor of ['--ff-proof-blue','--ff-proof-green'])forbidText('Decision Proof retired analytics palette',proofCss,retiredColor);
requireText('Decision Proof page semantic progress',proofPage,'role="progressbar" aria-label="Proof100 T7 evidence coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"');
requireText('Decision Proof responsive CSS',proofCss,'@media(max-width:680px)');
requireText('Decision Proof reduced motion CSS',proofCss,'@media(prefers-reduced-motion:reduce)');
forbidText('Decision Proof page inline style',proofPage,'style="');
forbidText('Decision Proof page retired runtime JS',proofPage,'assets/js/decision-proof-v1.js');

requireAll('Product customer-first summary',product,['CARD DECISION INTELLIGENCE','Know whether the evidence supports the card before you spend.','Exact card','Supported value','Clear next move','More than a comp check','Risk + liquidity','Grading economics','Decision Intelligence']);
requireText('Product Decision Intelligence navigation',product,'decision-intelligence.html');
requireAll('Product identity proof',product,['id="identity-simulator"','See it work','Choose the wrong card and watch FlipForge stop it.','Bad evidence stops before price gets a vote.','Supported value is not allowed to update from the mismatch','Illustrative product simulation.']);
for(const overload of ['Five questions before confidence','One decision language','Grade-premium intelligence','Decision receipt','id="grade-form"'])forbidText('Product overload removed',product,overload);

requireAll('Evidence Lab authority hub',learn,['Learn to spot False Confidence before it costs you.','BUSTED COMP','CASE 01 · WRONG PARALLEL','CASE 02 · ONE-SALE TRAP','CASE 03 · PSA 10 MIRAGE','CASE 04 · STALE MARKET','CASE 05 · ASK ≠ EVIDENCE','7 / 14 / 30 Review','Do not trust a decision engine because it sounds confident. Measure how its calls age.']);
requireAll('Beta customer-first funnel',beta,['Bring the card that makes you hesitate.','Challenge a real decision','See the reason trail','name="flipforge-private-beta-application"','action="/api/beta/applications"','name="bot-field"','data-beta-application-form','data-aw-beta-step','data-aw-beta-next','data-aw-beta-back','Private beta is not a paid subscription.']);
requireAll('Beta step behavior',awardJs,['steps.slice(1)','setStep(1)']);
requireAll('Launch Plans progressive disclosure',pricing,['Planned Launch Structure','Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.','10 planned evaluations per month','75 planned evaluations per month','300 planned evaluations per month','Open full planned feature comparison']);
for(const amount of ['$14.99','$29.99','$149','$299'])forbidText('Launch Plans unpublished pricing',pricing,amount);

requireAll('Phase 2 premium public rollout',phase2Js,[
  'buildCdiTheater()',
  'buildEvidenceTheater()',
  'buildProductReceipt()',
  'cdi_layer_viewed',
  'evidence_failure_selected',
  'decision_receipt_cta_clicked',
  'phase2_beta_cta_clicked'
]);
requireAll('Phase 2 premium visual system',phase2Css,[
  '.ff-phase2-cdi-theater',
  '.ff-phase2-evidence-theater',
  '.ff-phase2-product-receipt',
  '@media(prefers-reduced-motion:reduce)'
]);
for(const [label,page] of [['Decision Intelligence',decisionPage],['Evidence Lab',learn],['Product',product],['Launch Plans',pricing],['About',about],['Beta',beta]]){
  requireText(`Phase 2 ${label} stylesheet`,page,'assets/css/phase2-premium-intelligence-v1.css');
  requireText(`Phase 2 ${label} runtime`,page,'assets/js/phase2-premium-intelligence-v1.js');
}
requireAll('Phase 2 customer Decision Receipt',decisionCardCss,[
  'Phase 2 Decision Passport motion',
  '.ff-dce-passport-motion',
  '@keyframes ffDcePassportLayer'
]);
requireAll('Phase 2 customer Decision Receipt runtime',decisionCardJs,[
  'ff-dce-passport-motion',
  '--ff-dce-i'
]);
requireAll('Phase 3 public Decision Receipt anatomy',phase2Js,[
  'ff-phase3-product-receipt',
  'ILLUSTRATIVE ANATOMY · NO LIVE MARKET DATA',
  'assets/brand/flipforge-logo-horizontal.svg',
  'data-ff-p3-receipt-layer',
  'WHAT IT PRESERVES',
  'WHAT IT DOES NOT DO',
  'decision_receipt_layer_selected'
]);
requireAll('Phase 4 public Decision Receipt polish',phase2Css,[
  '.ff-phase3-product-receipt-layout',
  '.ff-phase3-product-receipt-reveal',
  '@media(max-width:640px)',
  '@media(prefers-reduced-motion:reduce)'
]);
requireAll('Phase 4 receipt interaction behavior',phase2Js,[
  'ArrowRight',
  'ArrowLeft',
  'prefers-reduced-motion: reduce',
  "panel.animate"
]);

requireAll('homepage marketing navigation',homepage,['>Product</a>','>Decision Intelligence</a>','>Evidence Lab</a>','>About</a>','>Request Beta Access</a>']);
for(const page of [product,learn,beta,pricing])requireAll('marketing navigation',page,['>Evidence Lab</a>','>Launch Plans</a>','>About</a>','>Request Beta Access</a>']);

for(const core of ['dashboard','discover','evaluate','opportunities','tracking','portfolio'])requireText('app core workflow',app,`data-route="${core}"`);
requireText('app advanced analysis',app,'<details class="ff-advanced-nav">');
for(const advanced of ['compare','psa-advisor','evidence','sell','export'])requireText('app advanced routes',app,`data-route="${advanced}"`);
if(productionBuild){
  forbidText('production staging route',app,'data-route="staging"');
  forbidText('production staging evaluate route',app,'data-route="staging-evaluate"');
  forbidText('production staging read adapter',app,'src="staging-browser.js"');
  forbidText('production staging stylesheet',app,'href="staging-browser.css"');
}else{
  requireText('staging hidden',app,'data-route="staging" class="staging-only-nav" hidden');
  requireText('staging evaluate hidden',app,'data-route="staging-evaluate" class="staging-only-nav" hidden');
}

requireAll('PWA shell',sw,["const CACHE='flipforge-shell-v21'","'/decision-proof.html'","'/assets/css/homepage-v5.css'","'/assets/css/homepage-decision-forge-v1.css'","'/assets/js/homepage-v5.js'","'/assets/js/homepage-decision-forge-v1.js'","'/assets/js/site.js'"]);
const publicCopy=`${homepage}\n${proofPage}\n${product}\n${learn}\n${beta}\n${pricing}`;
for(const unsafe of ['accuracy rate','guaranteed profit','automatic purchase','transactionAuthority=true'])forbidText('public safety',publicCopy,unsafe);
if(publicCopy.includes('CARD VALUE INTELLIGENCE'))failures.push('public safety: forbidden formal CARD VALUE INTELLIGENCE identity');
for(const unsafeData of ['localStorage','sessionStorage','indexedDB'])forbidText('public static pages',publicCopy,unsafeData);

if(failures.length){
  console.error('CDI-centered website progression validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: FlipForge CDI-centered homepage journey and ${productionBuild?'production app boundary':'preview staging diagnostics'} validated.`);
