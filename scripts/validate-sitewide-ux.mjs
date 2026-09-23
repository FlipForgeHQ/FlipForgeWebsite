import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const failures=[];
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.includes(needle))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

const marketingPages=read('assets/css/marketing-pages-v3.css');
const marketingSupport=read('assets/css/marketing-support-v3.css');
const density=read('assets/css/marketing-density-v1.css');
const brandCss=read('assets/css/brand-v2.css');
const typography=read('assets/css/public-typography-contract-v1.css');
const workflow=read('.github/workflows/sitewide-ux.yml');
const renderedTypographyAudit=read('scripts/audit-public-typography-rendered.mjs');
const heroCss=read('assets/css/homepage-v5.css');
const mobileHomeCss=read('assets/css/site.css');
const dealCss=heroCss;
const dealRefinement=heroCss;
const dealProcess=heroCss;
const dealJs=read('assets/js/homepage-v5.js');
const awardJs=read('assets/js/award-winning-v1.js');
const siteJs=read('assets/js/site.js');
const appIndex=read('saas-prototype/index.html');
const appLayout=read('saas-prototype/customer-layout-system-v2.css');
const guideCompact=read('saas-prototype/guided-mode-compact-v1.css');
const mobileShell=read('saas-prototype/mobile-shell-v3.css');
const mobileShellV4=read('saas-prototype/mobile-shell-v4.css');
const readability=read('saas-prototype/customer-readability.css');
const homepage=read('index.html');
const product=read('product.html');
const evidence=read('learn.html');
const plans=read('pricing.html');
const about=read('about.html');
const beta=read('beta-application.html');
const faq=read('faq.html');
const dataUse=read('data-use.html');
const privacy=read('privacy.html');
const terms=read('terms.html');
const betaTerms=read('beta-terms.html');
const refund=read('refund.html');
const thankYou=read('thank-you.html');
const betaOnboarding=read('beta-onboarding.html');
const notFound=read('404.html');

for(const [label,text] of [['product/about marketing',marketingPages],['support marketing',marketingSupport]]) requireText(label,text,'@import url("marketing-density-v1.css")');
requireText('marketing density purpose',density,'definitive marketing density system');
requireText('mobile density',density,'--ff-site-section-y-mobile:36px');

/* Public brand/typography contract: one semantic scale owns the public site.
 * Rendered browser QA is mandatory so cascade regressions cannot hide behind
 * static CSS checks. */
requireText('brand imports authoritative typography contract',brandCss,'@import url("public-typography-contract-v1.css")');
requireText('public home display token',typography,'--ff-type-home-display:clamp(42px,4vw,54px)');
requireText('public internal page title token',typography,'--ff-type-page-title:clamp(36px,3.6vw,48px)');
requireText('public section title token',typography,'--ff-type-section-title:clamp(28px,2.6vw,36px)');
requireText('public lead token',typography,'--ff-type-lead:16px');
requireText('public body token',typography,'--ff-type-body:15px');
requireText('public nav token',typography,'--ff-type-nav:13px');
requireText('public homepage display ownership',typography,'main#main .decision-hero h1 span');
requireText('public internal page-title ownership',typography,'body.ff-support-v3 main#main .page-hero h1');
requireText('public section-title ownership',typography,'body.ff-support-v3 main#main .section-head h2');
requireText('public mobile home display token',typography,'--ff-type-home-display:clamp(36px,9.5vw,44px)');
requireText('public mobile page title token',typography,'--ff-type-page-title:clamp(32px,8.8vw,40px)');
requireText('public mobile section title token',typography,'--ff-type-section-title:clamp(24px,7vw,30px)');
requireText('rendered typography audit imports Playwright',renderedTypographyAudit,"import { chromium } from 'playwright'");
requireText('rendered typography audit covers Evidence Lab',renderedTypographyAudit,"['Evidence Lab', '/learn.html']");
requireText('rendered typography audit covers public page-title equivalence',renderedTypographyAudit,'page title ${size}px differs from Product');
requireText('rendered typography audit covers public section-title equivalence',renderedTypographyAudit,'section title ${size}px differs from Product');
requireText('rendered typography audit covers desktop and mobile',renderedTypographyAudit,"{ name: 'desktop', width: 1440");
requireText('rendered typography audit covers mobile viewport',renderedTypographyAudit,"{ name: 'mobile', width: 390");
requireText('sitewide workflow triggers on every public CSS change',workflow,'- "assets/css/**"');
requireText('sitewide workflow installs Playwright',workflow,'playwright@1.55.0');
requireText('sitewide workflow starts local public site',workflow,'python3 -m http.server 4173');
requireText('sitewide workflow executes rendered typography audit',workflow,'node scripts/audit-public-typography-rendered.mjs');
requireText('non-home explicit Home control',brandCss,'.site-header .brand::after{content:"HOME"');
requireText('Home control is removed from footer brand',brandCss,'.footer .brand::after{content:none}');
requireText('homepage uses shared Geist brand stylesheet',homepage,'assets/css/brand-v2.css');
requireText('homepage uses shared Geist typeface',heroCss,'font-family:Geist,"Geist Sans",Arial,sans-serif');
requireText('homepage uses shared desktop nav scale',heroCss,'font-size:13px;font-weight:650');

const publicShellPages=[
  ['Product',product],
  ['Evidence Lab',evidence],
  ['Launch Plans',plans],
  ['About',about],
  ['Beta',beta],
  ['FAQ',faq],
  ['Data Use',dataUse],
  ['Privacy',privacy],
  ['Terms',terms],
  ['Beta Terms',betaTerms],
  ['Refund',refund],
  ['Thank You',thankYou],
  ['Beta Onboarding',betaOnboarding],
  ['404',notFound]
];
for(const [label,text] of publicShellPages){
  requireText(`${label} shared brand stylesheet`,text,'assets/css/brand-v2.css');
  requireText(`${label} explicit route home`,text,'class="brand" href="index.html"');
}

requireText('homepage v5 stylesheet',homepage,'assets/css/homepage-v5.css');
requireText('homepage v5 behavior',homepage,'assets/js/homepage-v5.js');
requireText('homepage shared mobile behavior',homepage,'assets/js/site.js');
requireText('homepage cinematic workspace',homepage,'ff-cinematic-workspace');
requireText('homepage asking price',homepage,'<strong>$349</strong>');
requireText('homepage displayed market reference',homepage,'$459.21');
requireText('homepage supported value',homepage,'$357.20');
requireText('homepage supported gap',homepage,'2.3% supported gap');
requireText('homepage qualified evidence count',homepage,'2 QUALIFIED');
requireText('homepage exact identity lock',homepage,'EXACT CARD VERIFIED');
requireText('homepage decision',homepage,'<b>VERIFY</b>');
requireText('homepage product film',homepage,'30-SECOND PRODUCT FILM');
requireText('homepage film exact-card stage',homepage,'00:05 — EXACT CARD');
requireText('homepage film evidence stage',homepage,'00:12 — QUALIFIED EVIDENCE');
requireText('homepage film value stage',homepage,'00:20 — SUPPORTED VALUE');
requireText('homepage price-value distinction',homepage,'Price is an input.');
requireText('homepage value-intelligence distinction',homepage,'Value is the intelligence.');
requireText('homepage wrong-card simulator',homepage,'Choose the wrong card. Watch FlipForge stop it.');
requireText('homepage what happened',homepage,'WHAT JUST HAPPENED?');
requireText('homepage what is FlipForge',homepage,'WHAT IS FLIPFORGE?');
requireText('homepage compact Decision Proof',homepage,'id="decision-proof"');
requireText('homepage Decision Proof link',homepage,'See the full Decision Proof →');
requireText('homepage controlled beta',homepage,'Controlled Private Beta.');
requireText('homepage transaction boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');
requireText('homepage returning tester sign in',homepage,'href="/production-auth.html" data-ff-marketing-sign-in>Sign In</a>');
requireText('homepage v5 responsive',heroCss,'@media(max-width:620px)');
requireText('homepage v5 reduced motion',heroCss,'@media(prefers-reduced-motion:reduce)');
requireText('homepage film controls',dealJs,"play.addEventListener('click'");
requireText('homepage simulator controls',dealJs,"tabs.forEach(b=>b.addEventListener('click'");
requireText('homepage reveal progressive enhancement',dealJs,'IntersectionObserver');
forbidText('homepage forced scroll behavior',dealJs,'scrollIntoView');
for(const store of ['localStorage','sessionStorage','indexedDB'])forbidText('homepage device storage',dealJs,store);
for(const old of ['assets/js/homepage-deal-or-decoy-v1.js','assets/css/homepage-deal-or-decoy-v1.css','assets/images/flipforge-approved-decision-visual.webp','Signal. Confidence. Advantage.'])forbidText('homepage retired surface',homepage,old);

requireText('beta start action',awardJs,'Start application');
requireText('beta apply anchor',awardJs,"applySection.id='apply'");
requireText('beta notice grouping',awardJs,"grid.className='ff-beta-notice-grid'");
requireText('beta server form',beta,'action="/api/beta/applications"');
requireText('beta step one',awardJs,'steps.slice(1)');
requireText('beta step transition',awardJs,'setStep(1)');
requireText('homepage returning tester sign in',homepage,'href="/production-auth.html" data-ff-marketing-sign-in>Sign In</a>');
requireText('beta application returning tester sign in',beta,'data-ff-returning-beta-sign-in');
requireText('beta application avoids duplicate applications',beta,'do not submit another application');
requireText('shared marketing sign in uses production auth',siteJs,"link.href='/production-auth.html'");
requireText('shared marketing sign in covers desktop navigation',siteJs,"document.querySelectorAll('.desktop-nav')");
requireText('shared marketing sign in covers mobile navigation',siteJs,"document.querySelectorAll('.mobile-nav')");
requireText('shared marketing sign in avoids duplicates',siteJs,"if(nav.querySelector('[data-ff-marketing-sign-in]'))return");

for(const [label,text] of [['homepage',homepage],['product',product],['Evidence Lab',evidence],['Launch Plans',plans],['About',about],['Beta',beta]]){
  requireText(`${label} brand`,text,'FlipForge');
  requireText(`${label} navigation`,text,'Request Beta Access');
}
requireText('product primary action',product,'Request Beta Access');
requireText('Evidence Lab primary action',evidence,'Start with Busted Comp');
requireText('Launch Plans primary action',plans,'Request Beta Access');
requireText('About purpose',about,'WHY FLIPFORGE EXISTS');
requireText('Beta purpose',beta,'CONTROLLED PRIVATE BETA');

requireText('app layout purpose',appLayout,'definitive viewport and density owner');
requireText('app topbar density',appLayout,'min-height:68px!important');
requireText('app workspace density',appLayout,'padding:22px 24px 34px!important');
requireText('app heading cap',appLayout,'font-size:clamp(1.85rem,2.55vw,2.35rem)!important');
requireText('app panel density',appLayout,'padding:15px 16px!important');
requireText('app metric density',appLayout,'min-height:108px!important');
requireText('decision intelligence density',appLayout,'font-size:clamp(2rem,3.2vw,3rem)!important');
requireText('guide viewport guard',appLayout,'max-height:calc(100vh - 28px)!important');
requireText('mobile app density',appLayout,'padding:14px 12px 96px!important');
requireText('mobile single column shell',appLayout,'.app-shell{display:block!important');
requireText('mobile workspace reset',appLayout,'.workspace{width:100%!important');
requireText('mobile topbar grid',appLayout,'grid-template-columns:44px minmax(0,1fr)!important');
requireText('mobile guide height',guideCompact,'max-height:30vh!important');
requireText('mobile guide secondary copy removed',guideCompact,'.ff-guide-why{display:none!important}');
requireText('mobile guide progress removed',guideCompact,'.ff-guide-progress{display:none!important}');
requireText('final app layout import',guideCompact,'customer-layout-system-v2.css?v=20260829-4');
requireText('final phone shell import',guideCompact,'mobile-shell-v3.css?v=20260829-1');
requireText('mobile shell owner',mobileShell,'final phone chrome owner');
requireText('mobile shell topbar',mobileShell,'grid-template-columns:40px minmax(0,1fr)!important');
requireText('mobile shell compact height',mobileShell,'height:54px!important');
requireText('mobile shell hides secondary actions',mobileShell,'.topbar-actions,.topbar>.topbar-actions,.notification-button,.profile-button,.date-button{display:none!important}');
requireText('mobile shell sidebar fully off canvas',mobileShell,'transform:translateX(-105%)!important');
requireText('final stylesheet present',appIndex,'<link rel="stylesheet" href="guided-mode-compact-v1.css">');
requireText('readability retained',readability,'single customer-facing typography/readability owner');
requireText('readability text floor',readability,'--ff-type-xs: .875rem');
requireText('customer content stays selectable for copy',mobileShellV4,'#main-content *');
requireText('customer content allows native selection',mobileShellV4,'user-select:text!important');
requireText('customer fields allow native mobile paste',mobileShellV4,'-webkit-touch-callout:default!important');

const publicCopy=[homepage,product,evidence,plans,about,beta].join('\n');
requireText('locked slogan',publicCopy,'Before you buy. Know Why.');
for(const unsafe of ['guaranteed profit','automatic purchase']) if(publicCopy.toLowerCase().includes(unsafe.toLowerCase()))failures.push(`public safety: forbidden ${JSON.stringify(unsafe)}`);
if(publicCopy.includes('CARD VALUE INTELLIGENCE'))failures.push('public safety: forbidden formal CARD VALUE INTELLIGENCE identity');
requireText('app transaction boundary',appIndex,'No transaction authority');

if(failures.length){console.error('Sitewide UX system validation failed:');failures.forEach(failure=>console.error(`- ${failure}`));process.exit(1);}
console.log('PASS: FlipForge authoritative public typography, rendered cross-page browser QA, Home navigation, live first-viewport Deal Check, deeper marketing pages, and customer-app UX ownership validated.');
