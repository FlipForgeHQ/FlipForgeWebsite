import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const homepage=read('index.html');
const product=read('product.html');
const learn=read('learn.html');
const beta=read('beta-application.html');
const pricing=read('pricing.html');
const app=read('saas-prototype/index.html');
const awardJs=read('assets/js/award-winning-v1.js');
const navJs=read('assets/js/homepage-v1.js');
const mobileCss=read('assets/css/homepage-mobile-nav-v1.css');
const animatic=read('assets/interactive/flipforge-know-why.html');
const sw=read('sw.js');
const failures=[];
const productionBuild=String(process.env.CONTEXT||'').toLowerCase()==='production';
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.toLowerCase().includes(needle.toLowerCase()))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

// Locked brand and decision-first homepage.
requireText('homepage category',homepage,'CARD INTELLIGENCE');
requireText('homepage slogan',homepage,'Before you buy. Know Why.');
forbidText('public category',`${homepage}\n${product}\n${learn}`,'CARD VALUE INTELLIGENCE');
requireText('homepage hook',homepage,'Would you pay');
requireText('homepage hook',homepage,'<strong>$349</strong>');
requireText('homepage hook',homepage,'for this card?');
requireText('homepage reason tension',homepage,'The reason behind it matters more.');
requireText('homepage browser-decodable visual',homepage,'assets/images/flipforge-homepage-hero.webp');
forbidText('homepage broken former visual',homepage,'assets/images/flipforge-approved-decision-visual.webp');
requireText('homepage illustrative boundary',homepage,'Illustrative landing-page example · not live market data');
requireText('homepage proof',homepage,'REAL MARKET EVIDENCE');
requireText('homepage proof',homepage,'RISK &amp; REWARD INSIGHT');
requireText('homepage proof',homepage,'MAKE BETTER DECISIONS');
requireText('homepage explainer section',homepage,'id="decision-video"');
requireText('homepage interactive explainer',homepage,'assets/interactive/flipforge-know-why.html');
forbidText('homepage mislabeled former video',homepage,'assets/video/flipforge-how-it-works-30s.mp4');
requireText('homepage explainer',homepage,'See how FlipForge reaches the decision.');
requireText('homepage beta boundary',homepage,'Controlled Private Beta.');
requireText('homepage transaction boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');
requireText('homepage primary CTA',homepage,'decision-button-primary" href="beta-application.html">Request Beta Access');
requireText('homepage explainer CTA',homepage,'href="#decision-video" data-ff-how-it-works>See How It Works');
requireText('homepage explainer scroll behavior',homepage,'target.scrollIntoView');
requireText('homepage explainer restart behavior',homepage,"postMessage('ff-play-restart'");
requireText('interactive explainer evidence beat',animatic,'FlipForge checks the reason');
requireText('interactive explainer decision beat',animatic,'<div class="verdict"><strong>VERIFY</strong></div>');
requireText('interactive explainer playback control',animatic,'id="playPause"');
requireText('interactive explainer restart control',animatic,'id="restart"');
for(const removed of ['ff-decision-motion','ff-card-stage','ff-motion-console','data-replay-decision','ff-live-product-frame','id="busted-comp"'])forbidText('simplified homepage',homepage,removed);

// Mobile navigation remains keyboard/accessibility aware.
for(const needle of ['class="menu-toggle"','aria-controls="mobile-navigation"','class="mobile-nav" id="mobile-navigation"','class="backdrop" aria-hidden="true"','<script src="assets/js/homepage-v1.js" defer></script>'])requireText('homepage mobile navigation',homepage,needle);
requireText('mobile menu Escape',navJs,"event.key==='Escape'");
requireText('mobile menu focus trap',navJs,"event.key!=='Tab'");
requireText('mobile menu CSS',mobileCss,'.menu-toggle{display:block}');

// Product answers customer questions rather than presenting architecture.
for(const needle of ['Is the premium actually supported?','Is this actually the card?','Do these comps actually belong?','Is the price actually supported?','What could make this wrong?','What should I do next—and why?','Can I challenge the recommendation too?'])requireText('Product customer questions',product,needle);
for(const simulator of ['id="identity-simulator"','Try to break the identity','Choose the wrong card and watch FlipForge stop it.','Bad evidence stops before price gets a vote.','Supported value is not allowed to update from the mismatch','Illustrative product simulation.'])requireText('Product identity proof',product,simulator);
for(const grade of ['id="grade-form"','Grade-premium intelligence','The PSA 10 price is not your grading profit.'])requireText('Product grade proof',product,grade);
requireText('Product decision receipt',product,'Decision receipt');

// Evidence Lab owns the deeper education layer.
for(const needle of ['Learn to spot False Confidence before it costs you.','BUSTED COMP','CASE 01 · WRONG PARALLEL','CASE 02 · ONE-SALE TRAP','CASE 03 · PSA 10 MIRAGE','CASE 04 · STALE MARKET','CASE 05 · ASK ≠ EVIDENCE','7 / 14 / 30 Review','Do not trust a decision engine because it sounds confident. Measure how its calls age.'])requireText('Evidence Lab authority hub',learn,needle);

// Beta remains a controlled, unpaid, server-backed intake.
for(const needle of ['Bring the card that makes you hesitate.','Challenge a real decision','See the reason trail','name="flipforge-private-beta-application"','action="/api/beta/applications"','name="bot-field"','data-beta-application-form','data-aw-beta-step','data-aw-beta-next','data-aw-beta-back','Private beta is not a paid subscription.'])requireText('Beta customer-first funnel',beta,needle);
requireText('Beta step behavior',awardJs,'steps.slice(1)');
requireText('Beta step behavior',awardJs,'setStep(1)');

// Launch Plans explains depth without premature price anchoring.
for(const needle of ['Planned Launch Structure','Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.','10 planned evaluations per month','75 planned evaluations per month','300 planned evaluations per month','Open full planned feature comparison'])requireText('Launch Plans progressive disclosure',pricing,needle);
for(const amount of ['$14.99','$29.99','$149','$299'])forbidText('Launch Plans unpublished pricing',pricing,amount);

// Shared marketing shell remains navigable.
for(const page of [homepage,product,learn,beta,pricing]){
  requireText('marketing navigation',page,'>Product</a>');
  requireText('marketing navigation',page,'>Evidence Lab</a>');
  requireText('marketing navigation',page,'>Launch Plans</a>');
  requireText('marketing navigation',page,'>About</a>');
  requireText('marketing navigation',page,'>Request Beta Access</a>');
}

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

// PWA and public-safety boundaries remain.
requireText('PWA cache',sw,"const CACHE='flipforge-shell-v14'");
const publicCopy=`${homepage}\n${product}\n${learn}\n${beta}\n${pricing}`;
for(const unsafe of ['accuracy rate','guaranteed profit','automatic purchase','transactionAuthority=true','CARD VALUE INTELLIGENCE'])forbidText('public safety',publicCopy,unsafe);
for(const unsafeData of ['localStorage','sessionStorage','indexedDB'])forbidText('public static pages',publicCopy,unsafeData);

if(failures.length){
  console.error('Decision-first website progression validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: FlipForge decision-first journey and ${productionBuild?'production app boundary':'preview staging diagnostics'} validated.`);
