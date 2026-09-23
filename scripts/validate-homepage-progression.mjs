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
const navJs=read('assets/js/homepage-v1.js');
const dealJs=read('assets/js/homepage-deal-or-decoy-v1.js');
const heroCss=read('assets/css/homepage-decision-hero-v1.css');
const dealCss=read('assets/css/homepage-deal-or-decoy-v1.css');
const processCss=read('assets/css/homepage-deal-live-process-v3.css');
const cdiCss=read('assets/css/homepage-cdi-positioning-v1.css');
const proofPage=read('decision-proof.html');
const proofCss=read('assets/css/decision-proof-v1.css');
const mobileCss=read('assets/css/homepage-mobile-nav-v1.css');
const sw=read('sw.js');
const failures=[];
const productionBuild=String(process.env.CONTEXT||'').toLowerCase()==='production';
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.toLowerCase().includes(needle.toLowerCase()))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};
const requireAll=(label,text,needles)=>needles.forEach(needle=>requireText(label,text,needle));

requireAll('homepage CDI identity',homepage,[
  'CARD DECISION INTELLIGENCE™',
  'Before you buy.',
  'Know Why.',
  'FlipForge turns a card’s identity, market evidence, and asking price into a clear decision — and shows you why.',
  'href="decision-intelligence.html">Decision Intelligence</a>',
  'data-ff-cdi-primary="true">See how the decision is made'
]);
requireText('homepage primary beta CTA',homepage,'class="decision-button decision-button-primary" href="beta-application.html">Request Beta Access</a>');
forbidText('homepage hero taxonomy breadcrumb',homepage,'Identity → Evidence → Economics → Risk → Decision → Receipt → Outcome.');
forbidText('homepage retired brand descriptor',homepage,'FlipForge — Card Intelligence');
forbidText('public category',`${homepage}\n${product}\n${learn}`,'CARD VALUE INTELLIGENCE');

requireAll('homepage interactive proof',homepage,[
  'assets/images/flipforge-homepage-hero.webp',
  'Illustrative example · not live market data',
  'class="ff-deal-demo" id="deal-or-decoy"',
  'Would you pay <span>$349</span>?',
  'TRY THE DECISION',
  'Make the call you would make on the listing. Then watch FlipForge challenge it.',
  'data-ff-processing-stage',
  '01 · IDENTITY','02 · EVIDENCE','03 · ECONOMICS','04 · DECISION',
  '5 of 7 comparisons were rejected.','24.0%','2.3%',
  'FlipForge says <span>VERIFY.</span>',
  '<dialog class="ff-evidence-dialog"','data-ff-open-evidence>See the evidence',
  'Controlled Private Beta.',
  'FlipForge does not guarantee profit or authorize transactions.',
  'href="beta-application.html" data-ff-deal-cta="beta_access"',
  'assets/css/homepage-deal-or-decoy-v1.css',
  'assets/css/homepage-deal-live-process-v3.css',
  'assets/js/homepage-deal-or-decoy-v1.js'
]);
for(const decision of ['BUY','WATCH','VERIFY','PASS'])requireText('homepage customer choice',homepage,`data-ff-choice="${decision}"`);
for(const retired of ['assets/css/homepage-hero-film-v1.css','assets/js/homepage-hero-film-v1.js','Try the Deal Check','data-ff-see-action','assets/images/flipforge-approved-decision-visual.webp'])forbidText('homepage retired surface',homepage,retired);

requireAll('homepage CDI reveal',homepage,[
  'assets/css/homepage-cdi-positioning-v1.css',
  'WHAT JUST HAPPENED',
  'That wasn’t a price lookup. That was Card Decision Intelligence™.',
  'THE SYSTEM BEHIND THE CALL',
  'Every decision moves through the same governed path.',
  'FLIPFORGE = CARD DECISION INTELLIGENCE™'
]);
requireAll('homepage four-system CDI model',homepage,[
  'A · KNOW THE CARD',
  'B · KNOW THE MARKET',
  'C · MAKE THE DECISION',
  'D · LEARN WHAT HAPPENED',
  'Release',
  'Taxonomy',
  'Identity',
  'Provenance + Trust',
  'Evidence',
  'Economics',
  'Product + Variant',
  'Grade + Scarcity',
  'Risk + Uncertainty',
  'Decision Receipt',
  'Outcome',
  'Governance + Continuous'
]);

requireAll('homepage Decision Proof',homepage,[
  'assets/css/decision-proof-v1.css',
  'class="ff-decision-proof" id="decision-proof"',
  'Proof100 checkpoint · September 18, 2026',
  '<strong>100</strong><span>Frozen decisions</span>',
  '<strong>42</strong><span>T7 decisions measurable</span>',
  '<strong>58</strong><span>Awaiting sufficient evidence</span>',
  '17</b> Economically justified holds',
  'Current economically eligible non-BUY review candidates',
  'href="decision-proof.html">See the full Decision Proof</a>',
  'not presented as a customer-facing accuracy score'
]);
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
  '<span>15 cases</span><h3>Negative net economics</h3>',
  '<span>2 cases</span><h3>Margin of safety not met</h3>',
  '<span>16 cases</span><h3>Ask above Maximum Buy Price</h3>',
  'T14, T30, then Proof1000'
]);
requireAll('Decision Proof premium brand',proofCss,[
  '--ff-proof-black:#05070a',
  '--ff-proof-gold:#d7b56d',
  '--ff-proof-gold-bright:#f0d79c'
]);
for(const retiredColor of ['--ff-proof-blue','--ff-proof-green'])forbidText('Decision Proof retired analytics palette',proofCss,retiredColor);
requireText('Decision Proof homepage semantic progress',homepage,'role="progressbar" aria-label="Proof100 T7 evidence coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"');
requireText('Decision Proof page semantic progress',proofPage,'role="progressbar" aria-label="Proof100 T7 evidence coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"');
requireText('Decision Proof premium hero',proofPage,'Proof, not hindsight.<strong>Freeze the decision before the outcome is known.</strong>');
requireText('Decision Proof responsive CSS',proofCss,'@media(max-width:680px)');
requireText('Decision Proof reduced motion CSS',proofCss,'@media(prefers-reduced-motion:reduce)');
forbidText('Decision Proof homepage inline style',homepage,'style="');
forbidText('Decision Proof page inline style',proofPage,'style="');
forbidText('Decision Proof retired runtime JS',homepage,'assets/js/decision-proof-v1.js');
forbidText('Decision Proof page retired runtime JS',proofPage,'assets/js/decision-proof-v1.js');
forbidText('Decision Proof service-worker retired runtime JS',sw,"'/assets/js/decision-proof-v1.js'");

requireAll('homepage behavior',dealJs,[
  "button.addEventListener('click'",
  "demo.dataset.ffState='processing'",
  'processingStage.hidden=false',
  "setCompState(index,'reviewing')",
  "supportedValue.textContent='$357.20'",
  "supportedDiscount.textContent='2.3%'",
  'schedule(token,3820,showResult)',
  'resultStage.hidden=false',
  "replay?.addEventListener('click'",
  'flipforge_demo_choice_recorded',
  'flipforge_demo_processing_started',
  'flipforge_demo_decision_changed',
  'document.startViewTransition',
  'showModal'
]);
forbidText('homepage forced scrolling',dealJs,'scrollIntoView');
for(const store of ['localStorage','sessionStorage','indexedDB'])forbidText('homepage device storage',dealJs,store);

requireAll('homepage navigation collision guards',navJs,['normalizeRoutePath','dedupeRouteLinks']);
requireText('homepage closed mobile nav is non-focusable',mobileCss,'visibility:hidden');
requireText('homepage open mobile nav restores visibility',mobileCss,'.mobile-nav.open');
requireText('homepage horizontal clipping guard',cdiCss,'overflow-x:clip');

requireAll('homepage presentation',[heroCss,dealCss,processCss,cdiCss,mobileCss].join('\n'),[
  'min-height:calc(100dvh - 79px)',
  '@media(max-width:760px)',
  '@media(prefers-reduced-motion:reduce)',
  'grid-template-columns:repeat(2,minmax(0,1fr))',
  '.menu-toggle{display:block}'
]);
requireText('homepage compact start cue',dealCss,"content:'START HERE · PICK ONE'");
requireText('homepage CDI mobile stack',cdiCss,'@media(max-width:520px)');

requireAll('homepage mobile navigation',homepage,[
  'class="menu-toggle"','aria-controls="mobile-navigation"','class="mobile-nav" id="mobile-navigation"','class="backdrop" aria-hidden="true"','<script src="assets/js/homepage-v1.js" defer></script>'
]);
requireText('mobile menu Escape',navJs,"event.key==='Escape'");
requireText('mobile menu focus trap',navJs,"event.key!=='Tab'");

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

requireAll('PWA shell',sw,["const CACHE='flipforge-shell-v19'","'/decision-proof.html'","'/assets/css/homepage-cdi-positioning-v1.css'","'/assets/css/decision-proof-v1.css'","'/assets/css/homepage-deal-or-decoy-v1.css'","'/assets/js/homepage-deal-or-decoy-v1.js'"]);
const publicCopy=`${homepage}\n${proofPage}\n${product}\n${learn}\n${beta}\n${pricing}`;
for(const unsafe of ['accuracy rate','guaranteed profit','automatic purchase','transactionAuthority=true','CARD VALUE INTELLIGENCE'])forbidText('public safety',publicCopy,unsafe);
for(const unsafeData of ['localStorage','sessionStorage','indexedDB'])forbidText('public static pages',publicCopy,unsafeData);

if(failures.length){
  console.error('CDI-centered website progression validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: FlipForge CDI-centered homepage journey and ${productionBuild?'production app boundary':'preview staging diagnostics'} validated.`);
