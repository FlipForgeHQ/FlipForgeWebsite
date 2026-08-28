import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const homepage=read('index.html');
const product=read('product.html');
const learn=read('learn.html');
const beta=read('beta-application.html');
const pricing=read('pricing.html');
const app=read('saas-prototype/index.html');
const awardCss=read('assets/css/award-winning-v1.css');
const awardJs=read('assets/js/award-winning-v1.js');
const contenderJs=read('assets/js/homepage-contender-v1.js');
const sw=read('sw.js');
const failures=[];
const productionBuild=String(process.env.CONTEXT||'').toLowerCase()==='production';
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.toLowerCase().includes(needle.toLowerCase()))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

// Locked brand and customer-first category.
requireText('homepage brand',homepage,'Before you buy. <span>Know Why.</span>');
requireText('homepage category',homepage,'<div class="eyebrow">CARD INTELLIGENCE</div>');
forbidText('public category',`${homepage}\n${product}\n${learn}`,'CARD VALUE INTELLIGENCE');
if(homepage.includes('Before you buy. Know why.'))failures.push('brand case: lowercase why is forbidden');

// Homepage is now six customer moments, in order.
const homeMarkers=[
  'class="hero ff-hero-v3 ff-conversion-hero ff-hero-customer"',
  'class="ff-problem-band ff-false-confidence"',
  'id="busted-comp"',
  'id="validation"',
  'id="decision-accountability"',
  'class="ff-beta-wedge"',
  'class="section home-section ff-final-cta"'
];
let last=-1;
for(const marker of homeMarkers){
  const idx=homepage.indexOf(marker);
  if(idx<0)failures.push(`homepage architecture: missing ${JSON.stringify(marker)}`);
  else if(idx<=last)failures.push(`homepage architecture: out of order ${JSON.stringify(marker)}`);
  last=Math.max(last,idx);
}
for(const removed of ['ff-customer-outcomes','id="before-after"','id="evidence"','id="sample-dossier"','id="who-its-for"','class="ff-category"','id="how-it-works"'])forbidText('lean homepage',homepage,removed);

for(const customerNeedle of [
  'You are the one putting money on the line.',
  'A convincing comp can still be the wrong reason to buy.',
  'THE ENEMY IS FALSE CONFIDENCE',
  'Which sale actually deserves to count?',
  'Trust has to be earned',
  'Did the decision age well?',
  'Bring us the card you are actually thinking about buying.'
])requireText('customer-first homepage',homepage,customerNeedle);

for(const hero of ['<small>Last comp</small><strong>$900</strong>','<small>Listing</small><strong>$850</strong>','Easy buy — or is it?','VERIFY before buying','The listing price did not. Your confidence should.','Illustrative decision · not live market data','data-replay-decision'])requireText('hero decision theatre',homepage,hero);
for(const comp of ['data-aw-comp="exact"','data-aw-comp="parallel"','data-aw-comp="grade"'])requireText('Busted Comp challenge',homepage,comp);
requireText('Busted Comp behavior',awardJs,'EXCLUDED.');
requireText('Busted Comp behavior',awardJs,'CONTEXT ONLY.');

for(const proof of ['>100<','>74<','>26<','>18<','20-case blind re-review','25-card prospective study','FlipForge has not authorized a public accuracy percentage'])requireText('governed proof',homepage,proof);
for(const day of ['Day 0','Day 7','Day 14','Day 30'])requireText('outcome accountability',homepage,day);
requireText('outcome accountability',homepage,'not rewriting history to make the model look right');

requireText('beta wedge',homepage,'Modern football rookie autos + scarce parallels');
requireText('broad category',homepage,'FlipForge remains Card Intelligence for sports cards broadly');
requireText('unpaid beta',homepage,'Private beta participation does not create a paid subscription.');
requireText('transaction boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');

// Product answers customer questions rather than presenting architecture.
for(const needle of ['Is the premium actually supported?','Is this actually the card?','Do these comps actually belong?','Is the setup actually supported?','What could make this wrong?','What should I do next—and why?','Can I challenge the recommendation too?'])requireText('Product customer questions',product,needle);
for(const simulator of ['id="identity-simulator"','Try to break the identity','Choose the wrong card and watch FlipForge stop it.','Bad evidence stops before price gets a vote.','Supported value is not allowed to update from the mismatch','Illustrative product simulation.'])requireText('Product identity proof',product,simulator);
for(const grade of ['id="grade-form"','Grade-premium intelligence','The PSA 10 price is not your grading profit.'])requireText('Product grade proof',product,grade);
requireText('Product decision receipt',product,'Decision receipt');

// Evidence Lab owns the market language and content franchise.
for(const needle of ['Learn to spot False Confidence before it costs you.','BUSTED COMP','CASE 01 · WRONG PARALLEL','CASE 02 · ONE-SALE TRAP','CASE 03 · PSA 10 MIRAGE','CASE 04 · STALE MARKET','CASE 05 · ASK ≠ EVIDENCE','7 / 14 / 30 Review','Do not trust a decision engine because it sounds confident. Measure how its calls age.'])requireText('Evidence Lab authority hub',learn,needle);

// Beta sells value first and feels like two short steps while preserving server intake.
for(const needle of ['Bring the card that makes you hesitate.','Challenge a real decision','See the reason trail','name="flipforge-private-beta-application"','action="/api/beta/applications"','name="bot-field"','data-beta-application-form','data-aw-beta-step','data-aw-beta-next','data-aw-beta-back','Private beta is not a paid subscription.'])requireText('Beta customer-first funnel',beta,needle);
requireText('Beta step behavior',awardJs,'steps.slice(1)');
requireText('Beta step behavior',awardJs,'setStep(1)');

// Launch Plans explains depth without premature price anchoring.
for(const needle of ['Planned Launch Structure','Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.','10 planned evaluations per month','75 planned evaluations per month','300 planned evaluations per month','Open full planned feature comparison'])requireText('Launch Plans progressive disclosure',pricing,needle);
for(const amount of ['$14.99','$29.99','$149','$299'])forbidText('Launch Plans unpublished pricing',pricing,amount);

// Marketing shell and premium visual system.
for(const page of [homepage,product,learn,beta,pricing]){
  requireText('marketing navigation',page,'>Product</a>');
  requireText('marketing navigation',page,'>Evidence Lab</a>');
  requireText('marketing navigation',page,'>Launch Plans</a>');
  requireText('marketing navigation',page,'>About</a>');
  requireText('marketing navigation',page,'>Request Beta Access</a>');
}
requireText('premium CSS rhythm',awardCss,'.ff-aw-question-grid');
requireText('premium CSS navigation',awardCss,'a[data-app-preview]');
requireText('premium CSS mobile',awardCss,'@media(max-width:520px)');
requireText('premium CSS beta',awardCss,'.ff-aw-beta-step[hidden]');
requireText('premium JS loaded by homepage',contenderJs,'award-winning-v1.js');

// App keeps customer routes in production while staging diagnostics remain preview-only.
for(const core of ['data-route="dashboard"','data-route="discover"','data-route="evaluate"','data-route="opportunities"','data-route="tracking"','data-route="portfolio"'])requireText('app core workflow',app,core);
requireText('app advanced analysis',app,'<details class="ff-advanced-nav">');
for(const advanced of ['data-route="compare"','data-route="psa-advisor"','data-route="evidence"','data-route="sell"','data-route="export"'])requireText('app advanced routes',app,advanced);
if(productionBuild){
  forbidText('production staging route',app,'data-route="staging"');
  forbidText('production staging evaluate route',app,'data-route="staging-evaluate"');
  forbidText('production staging read adapter',app,'src="staging-browser.js"');
  forbidText('production staging stylesheet',app,'href="staging-browser.css"');
}else{
  requireText('staging hidden',app,'data-route="staging" class="staging-only-nav" hidden');
  requireText('staging evaluate hidden',app,'data-route="staging-evaluate" class="staging-only-nav" hidden');
}

// PWA and motion boundaries.
requireText('PWA cache',sw,"const CACHE='flipforge-shell-v13'");
requireText('PWA premium CSS',sw,"'/assets/css/award-winning-v1.css'");
requireText('PWA premium JS',sw,"'/assets/js/award-winning-v1.js'");
requireText('reduced motion',contenderJs,'prefers-reduced-motion: reduce');

const publicCopy=`${homepage}\n${product}\n${learn}\n${beta}\n${pricing}`;
for(const unsafe of ['accuracy rate','guaranteed profit','automatic purchase','transactionAuthority=true','CARD VALUE INTELLIGENCE'])forbidText('public safety',publicCopy,unsafe);
for(const unsafeData of ['localStorage','sessionStorage','indexedDB'])forbidText('public static pages',publicCopy,unsafeData);

if(failures.length){
  console.error('Premium website progression validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: FlipForge customer-first premium journey and ${productionBuild?'production app boundary':'preview staging diagnostics'} validated.`);
