import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const index=read('index.html');
const awardCss=read('assets/css/award-winning-v1.css');
const contenderCss=read('assets/css/homepage-contender-v1.css');
const mobileCss=read('assets/css/homepage-mobile-simplify-v1.css');
const polishCss=read('assets/css/homepage-proof-polish-v1.css');
const contenderJs=read('assets/js/homepage-contender-v1.js');
const awardJs=read('assets/js/award-winning-v1.js');
const sw=read('sw.js');
const checks=[];
const check=(name,condition)=>checks.push({name,passed:Boolean(condition)});

check('001 focused homepage mode remains',index.includes('ff-home-focused'));
check('002 locked category remains CARD INTELLIGENCE',index.includes('<div class="eyebrow">CARD INTELLIGENCE</div>'));
check('003 old descriptor remains forbidden',!index.includes('CARD VALUE INTELLIGENCE'));
check('004 locked slogan remains exact',index.includes('Before you buy. <span>Know Why.</span>'));
check('005 customer owns the decision',index.includes('You are the one putting money on the line.'));
check('006 hero keeps false-confidence tension',index.includes('A convincing comp can still be the wrong reason to buy.'));
check('007 duplicate text-side price scenario is gone',!index.includes('ff-hero-scenario'));
check('008 long customer-promise paragraph is gone',!index.includes('ff-customer-promise'));
check('009 hero has exactly one primary CTA',((index.match(/class="btn primary"/g)||[]).length===2));
check('010 hero primary CTA requests beta',index.includes('<a class="btn primary" href="beta-application.html">Request Beta Access</a>'));
check('011 hero secondary path opens reason trail',index.includes('data-demo-cta="hero" href="#reason-trail">See how FlipForge reasons'));
check('012 hero keeps no-profit boundary',index.includes('Decision support only; no transaction, grade, outcome, or profit guarantee.'));
check('012a hero uses approved supporting statement',index.includes('FlipForge checks the card, challenges the evidence, and explains the decision before you spend.'));
check('012b hero shows real product interface',index.includes('ff-live-product-frame')&&index.includes('Real FlipForge product interface'));

check('013 animated price story remains static HTML',index.includes('<small>Last comp</small><strong>$900</strong>')&&index.includes('<small>Listing</small><strong>$850</strong>'));
check('014 animated story challenges easy buy',index.includes('Easy buy — or is it?'));
check('015 animated story ends VERIFY',index.includes('VERIFY before buying'));
check('016 animated story teaches confidence shift',index.includes('The listing price did not. Your confidence should.'));
check('017 illustrative status is adjacent',index.includes('Illustrative decision · not live market data'));
check('018 replay control remains',index.includes('data-replay-decision'));

check('018a reason trail is first-paint content',index.includes('id="reason-trail"')&&index.includes("DON'T JUST GET A VERDICT. SEE WHY."));
check('018b reason trail exposes decision framework',['>BUY<','>WATCH<','>VERIFY<','>PASS<'].every(v=>index.includes(v)));
check('018c reason trail keeps evidence inspectable',index.includes('Why this decision')&&index.includes('Filter what actually counts.'));
check('018d Forge Heat stays secondary',index.includes('DISCOVERY LAYER · FORGE HEAT BETA')&&index.includes('Find what deserves a closer look.'));

check('019 homepage names False Confidence',index.includes('THE ENEMY IS FALSE CONFIDENCE'));
check('020 homepage keeps three memorable problem cards',['Wrong parallel','Thin evidence','Grade assumption'].every(v=>index.includes(v)));
check('021 deep False Confidence education routes to lab',index.includes('Explore all False Confidence cases'));

check('022 Busted Comp is static first-paint content',index.includes('id="busted-comp"')&&index.includes('BUSTED COMP · INTERACTIVE'));
check('023 Busted Comp presents three evidence choices',['data-aw-comp="exact"','data-aw-comp="parallel"','data-aw-comp="grade"'].every(v=>index.includes(v)));
check('024 Busted Comp behavior is interactive',awardJs.includes("data-aw-comp-result")&&awardJs.includes("EXCLUDED."));

check('025 governed proof remains concise but visible',['>100<','>74<','>26<','>18<'].every(v=>index.includes(v)));
check('026 blind review remains disclosed',index.includes('20-case blind re-review'));
check('027 prospective study remains disclosed',index.includes('25-card prospective study'));
check('028 public accuracy claim remains unauthorized',index.includes('FlipForge has not authorized a public accuracy percentage'));

check('029 accountability remains Day 0/7/14/30',['Day 0','Day 7','Day 14','Day 30'].every(v=>index.includes(v)));
check('030 accountability asks memorable proof question',index.includes('Did the decision age well?'));
check('031 accountability rejects hindsight rewrite',index.includes('not rewriting history to make the model look right'));
check('031a accountability is visually connected',polishCss.includes('.ff-aw-accountability .ff-aw-question-grid::before'));
check('031b accountability exposes timeline semantics',awardJs.includes('Decision accountability timeline: Day 0, Day 7, Day 14 and Day 30'));

check('032 beta wedge remains narrow',index.includes('Modern football rookie autos + scarce parallels'));
check('033 category remains broad',index.includes('FlipForge remains Card Intelligence for sports cards broadly'));
check('033a beta CTA normalizes to one label',awardJs.includes("link.textContent='Request Beta Access'"));
check('034 final CTA asks for a real buying decision',index.includes('Bring us the card you are actually thinking about buying.'));
check('035 beta remains explicitly unpaid',index.includes('Private beta participation does not create a paid subscription.'));
check('036 transaction authority remains absent',index.includes('FlipForge does not guarantee profit or authorize transactions.'));

for(const oldSection of ['ff-customer-outcomes','ff-transformation','id="evidence"','id="sample-dossier"','id="who-its-for"','class="ff-category"','id="how-it-works"']){
  check(`037 lean homepage removes ${oldSection}`,!index.includes(oldSection));
}

check('044 premium CSS is first-paint dependency',index.includes('assets/css/award-winning-v1.css'));
check('044a product-proof CSS is first-paint dependency',index.includes('assets/css/homepage-product-proof-v2.css'));
check('044b proof-polish CSS is loaded',awardJs.includes('assets/css/homepage-proof-polish-v1.css'));
check('045 premium JS is loaded explicitly',index.includes('assets/js/award-winning-v1.js'));
check('046 premium navigation hides low-priority links',awardCss.includes('a[href="faq.html"]')&&awardCss.includes('a[data-app-preview]'));
check('047 motion remains finite',contenderCss.includes('@keyframes ff-stage-focus')&&!contenderCss.includes('infinite'));
check('048 reduced-motion CSS remains',contenderCss.includes('@media(prefers-reduced-motion:reduce)'));
check('049 reduced-motion JS remains',contenderJs.includes('prefers-reduced-motion: reduce'));
check('050 mobile simplification remains',mobileCss.includes('@media(max-width:520px)')&&mobileCss.includes('.ff-primary-actions .btn:not(.primary)'));
check('050a mobile proof polish hides redundant console',polishCss.includes('.ff-hero-customer .ff-motion-console'));
check('050b Forge Heat visual remains non-data',polishCss.includes('.ff-forge-heat-signal')&&awardJs.includes('it represents no market measurement or live data'));
check('051 PWA keeps proven v14 cache',sw.includes("const CACHE='flipforge-shell-v14'"));
check('052 PWA caches premium CSS',sw.includes("'/assets/css/award-winning-v1.css'"));
check('052a PWA caches proof-polish CSS',sw.includes("'/assets/css/homepage-proof-polish-v1.css'"));
check('053 PWA caches premium JS',sw.includes("'/assets/js/award-winning-v1.js'"));

const failures=checks.filter(item=>!item.passed);
console.log('FlipForge premium customer-first homepage validation');
console.log(`PASSED: ${checks.length-failures.length}`);
console.log(`FAILED: ${failures.length}`);
for(const failure of failures)console.error(`FAIL | ${failure.name}`);
if(failures.length)process.exitCode=1;
