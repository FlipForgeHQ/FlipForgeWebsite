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
const filmJs=read('assets/js/homepage-hero-film-v1.js');
const dealJs=read('assets/js/homepage-deal-or-decoy-v1.js');
const heroCss=read('assets/css/homepage-decision-hero-v1.css');
const filmCss=read('assets/css/homepage-hero-film-v1.css');
const dealCss=read('assets/css/homepage-deal-or-decoy-v1.css');
const mobileCss=read('assets/css/homepage-mobile-nav-v1.css');
const sw=read('sw.js');
const failures=[];
const productionBuild=String(process.env.CONTEXT||'').toLowerCase()==='production';
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.toLowerCase().includes(needle.toLowerCase()))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

requireText('homepage category',homepage,'CARD INTELLIGENCE');
requireText('homepage slogan',homepage,'Before you buy. Know Why.');
forbidText('public category',`${homepage}\n${product}\n${learn}`,'CARD VALUE INTELLIGENCE');
requireText('homepage value explanation',homepage,'FlipForge checks whether the evidence behind a sports-card deal actually holds up.');
requireText('homepage assurance',homepage,'Exact card. Qualified evidence. Explainable decision.');
requireText('homepage browser-decodable visual',homepage,'assets/images/flipforge-homepage-hero.webp');
forbidText('homepage broken former visual',homepage,'assets/images/flipforge-approved-decision-visual.webp');
requireText('homepage illustrative boundary',homepage,'Animated homepage concept · illustrative example · not live market data');
requireText('homepage film stylesheet',homepage,'assets/css/homepage-hero-film-v1.css');
requireText('homepage film behavior',homepage,'assets/js/homepage-hero-film-v1.js');
requireText('homepage film value shift',homepage,'5 of 7 rejected');
requireText('homepage film value shift',homepage,'The apparent bargain nearly disappears.');
requireText('homepage film verdict',homepage,'FlipForge decision');
requireText('homepage film sequence',filmJs,'25000');
requireText('homepage film reduced motion',filmCss,'@media(prefers-reduced-motion:reduce)');
requireText('homepage proof section',homepage,'id="deal-or-decoy"');
requireText('homepage proof hook',homepage,'Think you would have caught it?');
requireText('homepage proof instruction',homepage,'Your only task:');
for(const decision of ['data-ff-choice="BUY"','data-ff-choice="WATCH"','data-ff-choice="VERIFY"','data-ff-choice="PASS"'])requireText('homepage customer choice',homepage,decision);
requireText('homepage evidence correction',homepage,'5 of 7 comparisons were invalid.');
requireText('homepage evidence correction',homepage,'24.0%');
requireText('homepage evidence correction',homepage,'2.3%');
requireText('homepage decision',homepage,'VERIFY before you buy.');
requireText('homepage optional details',homepage,'See all 7 comparison checks');
requireText('homepage beta boundary',homepage,'Controlled Private Beta.');
requireText('homepage transaction boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');
requireText('homepage primary CTA',homepage,'decision-button-primary" href="#deal-or-decoy" data-ff-see-action>Try the Deal Check');
requireText('homepage secondary CTA',homepage,'decision-button-secondary" href="beta-application.html">Request Beta Access');
requireText('homepage Evaluate CTA',homepage,'href="/app/#/evaluate" data-ff-deal-cta="evaluate_listing"');
requireText('homepage interaction stylesheet',homepage,'assets/css/homepage-deal-or-decoy-v1.css');
requireText('homepage interaction behavior',homepage,'assets/js/homepage-deal-or-decoy-v1.js');
requireText('homepage choice behavior',dealJs,"button.addEventListener('click'");
requireText('homepage immediate reveal',dealJs,'choiceStage.hidden=true');
requireText('homepage replay behavior',dealJs,"replay?.addEventListener('click'");
requireText('homepage measurement',dealJs,'flipforge_demo_choice_recorded');
requireText('homepage decision-change measurement',dealJs,'flipforge_demo_decision_changed');
for(const browserStore of ['localStorage','sessionStorage','indexedDB'])forbidText('homepage device storage',dealJs,browserStore);
requireText('homepage hero responsive',heroCss,'grid-template-columns:1fr');
requireText('homepage film responsive',filmCss,'@media(max-width:760px)');
requireText('homepage demo responsive',dealCss,'@media(max-width:760px)');
for(const removed of ['ff-decision-motion','ff-card-stage','ff-motion-console','data-replay-decision','ff-live-product-frame','id="busted-comp"'])forbidText('simplified homepage',homepage,removed);

for(const needle of ['class="menu-toggle"','aria-controls="mobile-navigation"','class="mobile-nav" id="mobile-navigation"','class="backdrop" aria-hidden="true"','<script src="assets/js/homepage-v1.js" defer></script>'])requireText('homepage mobile navigation',homepage,needle);
requireText('mobile menu Escape',navJs,"event.key==='Escape'");
requireText('mobile menu focus trap',navJs,"event.key!=='Tab'");
requireText('mobile menu CSS',mobileCss,'.menu-toggle{display:block}');

for(const needle of ['Is the premium actually supported?','Is this actually the card?','Do these comps actually belong?','Is the price actually supported?','What could make this wrong?','What should I do next—and why?','Can I challenge the recommendation too?'])requireText('Product customer questions',product,needle);
for(const simulator of ['id="identity-simulator"','Try to break the identity','Choose the wrong card and watch FlipForge stop it.','Bad evidence stops before price gets a vote.','Supported value is not allowed to update from the mismatch','Illustrative product simulation.'])requireText('Product identity proof',product,simulator);
for(const grade of ['id="grade-form"','Grade-premium intelligence','The PSA 10 price is not your grading profit.'])requireText('Product grade proof',product,grade);
requireText('Product decision receipt',product,'Decision receipt');

for(const needle of ['Learn to spot False Confidence before it costs you.','BUSTED COMP','CASE 01 · WRONG PARALLEL','CASE 02 · ONE-SALE TRAP','CASE 03 · PSA 10 MIRAGE','CASE 04 · STALE MARKET','CASE 05 · ASK ≠ EVIDENCE','7 / 14 / 30 Review','Do not trust a decision engine because it sounds confident. Measure how its calls age.'])requireText('Evidence Lab authority hub',learn,needle);

for(const needle of ['Bring the card that makes you hesitate.','Challenge a real decision','See the reason trail','name="flipforge-private-beta-application"','action="/api/beta/applications"','name="bot-field"','data-beta-application-form','data-aw-beta-step','data-aw-beta-next','data-aw-beta-back','Private beta is not a paid subscription.'])requireText('Beta customer-first funnel',beta,needle);
requireText('Beta step behavior',awardJs,'steps.slice(1)');
requireText('Beta step behavior',awardJs,'setStep(1)');

for(const needle of ['Planned Launch Structure','Launch Plans','Pricing to be announced','Final package pricing has not been published.','No paid checkout and no public package pricing during private beta.','10 planned evaluations per month','75 planned evaluations per month','300 planned evaluations per month','Open full planned feature comparison'])requireText('Launch Plans progressive disclosure',pricing,needle);
for(const amount of ['$14.99','$29.99','$149','$299'])forbidText('Launch Plans unpublished pricing',pricing,amount);

for(const page of [homepage,product,learn,beta,pricing]){
  requireText('marketing navigation',page,'>Product</a>');
  requireText('marketing navigation',page,'>Evidence Lab</a>');
  requireText('marketing navigation',page,'>Launch Plans</a>');
  requireText('marketing navigation',page,'>About</a>');
  requireText('marketing navigation',page,'>Request Beta Access</a>');
}

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

requireText('PWA cache',sw,"const CACHE='flipforge-shell-v15'");
requireText('PWA deal stylesheet',sw,"'/assets/css/homepage-deal-or-decoy-v1.css'");
requireText('PWA deal behavior',sw,"'/assets/js/homepage-deal-or-decoy-v1.js'");
const publicCopy=`${homepage}\n${product}\n${learn}\n${beta}\n${pricing}`;
for(const unsafe of ['accuracy rate','guaranteed profit','automatic purchase','transactionAuthority=true','CARD VALUE INTELLIGENCE'])forbidText('public safety',publicCopy,unsafe);
for(const unsafeData of ['localStorage','sessionStorage','indexedDB'])forbidText('public static pages',publicCopy,unsafeData);

if(failures.length){
  console.error('Decision-first website progression validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: FlipForge video-first journey and ${productionBuild?'production app boundary':'preview staging diagnostics'} validated.`);
