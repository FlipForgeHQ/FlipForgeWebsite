import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const failures=[];
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.includes(needle))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

// Whole-public-site v10 is one branded experience, not isolated hero experiments.
// Proof methodology, identity, beta terms and privacy copy remain unchanged.
const completeStyle=read('assets/css/site-complete-v10.css');
for(const feature of ['.ff10-feature','.ff10-graphic','.ff10-trust-graphic','.ff10-evidence-graphic','.ff10-plans-graphic','.ff10-beta-graphic','.ff10-faq-graphic','.ff10-auth','@media(prefers-reduced-motion:reduce)']){
  requireText('complete public-site visual system',completeStyle,feature);
}
const completeRoutes=[
  ['about.html','ff10-about'],['learn.html','ff10-learn'],['pricing.html','ff10-plans'],
  ['beta-application.html','ff10-beta'],['faq.html','ff10-faq'],
  ['beta-onboarding.html','ff10-onboarding'],['thank-you.html','ff10-received'],
  ['data-use.html','ff10-legal'],['privacy.html','ff10-legal'],['terms.html','ff10-legal'],
  ['refund.html','ff10-legal'],['beta-terms.html','ff10-legal'],['404.html','ff10-missing'],
  ['decision-proof.html','ff10-proof'],['sample-decision-dossier.html','ff10-dossier'],
  ['partner-disclosure.html','ff10-disclosure'],['platform-status.html','ff10-status'],
  ['connect/index.html','ff10-connect'],['production-auth.html','ff10-auth']
];
for(const [route,cls] of completeRoutes){
  const html=read(route);
  requireText('brand integration '+route,html,cls);
  requireText('shared design stylesheet '+route,html,'site-complete-v10.css');
}
for(const [route,marker] of [
  ['about.html','ff10-trust-graphic'],['learn.html','ff10-evidence-graphic'],
  ['pricing.html','ff10-plans-graphic'],['beta-application.html','ff10-beta-graphic'],
  ['faq.html','ff10-faq-graphic']
]){
 const html=read(route);
 requireText('bespoke editorial visual '+route,html,marker);
 requireText('return home '+route,html,'class="ff10-breadcrumb"');
}
for(const legal of ['privacy.html','terms.html','beta-terms.html']){
 requireText('trust document home '+legal,read(legal),'class="ff10-breadcrumb"');
}
requireText('auth preserves preview-only routing',read('production-auth.html'),'data-production-auth-preview-redirect');
requireText('auth retains native form guard',read('production-auth.html'),'form[hidden]{display:none}');
requireText('published homepage design stays locked',read('index.html'),'PRICES TELL YOU');
requireText('governed decision page remains intact',read('decision-intelligence.html'),'id="decision-benefits"');

const marketingPages=read('assets/css/marketing-pages-v3.css');
const marketingSupport=read('assets/css/marketing-support-v3.css');
const density=read('assets/css/marketing-density-v1.css');
const brandCss=read('assets/css/brand-v2.css');
const typography=read('assets/css/public-typography-contract-v1.css');
const workflow=read('.github/workflows/sitewide-ux.yml');
const renderedTypographyAudit=read('scripts/audit-public-typography-rendered.mjs');
const heroCss=read('assets/css/homepage-v5.css');
const heroV6Css=read('assets/css/homepage-hero-v6.css');
const decisionVisualCss=read('assets/css/ff-decision-visual-v1.css');
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
requireText('homepage uses shared desktop navigation shell',homepage,'class="site-header"');

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

requireText('homepage v7 decision stylesheet',homepage,'assets/css/homepage-interactive-decision-v7.css');
requireText('homepage v7 demo runtime',homepage,'assets/js/homepage-interactive-decision-v7.js');
requireText('homepage shared mobile behavior',homepage,'assets/js/site.js');
requireText('homepage prominent demo',homepage,'data-ffdemo');
requireText('homepage hero headline',homepage,'PRICES TELL YOU');
requireText('homepage film player',homepage,'data-ff9-film');
requireText('homepage film controller',homepage,'homepage-cinematic-film-v9.js');
requireText('reference-quality layout',homepage,'assets/css/homepage-reference-v8.css');
requireText('real product display',homepage,'ff8-phone" id="try-decision"');
requireText('homepage asking price and max buy contrast',homepage,'FLIPFORGE MAX BUY');
requireText('homepage price gap contrast',homepage,'PRICE GAP');
requireText('homepage decision proof link',homepage,'See the proof →');
requireText('homepage illustrative label',homepage,'ILLUSTRATIVE DEMO');
requireText('homepage controlled beta',homepage,'Controlled Private Beta.');
requireText('homepage profit boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');
requireText('homepage returning tester sign in',homepage,'href="/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start" data-ff-marketing-sign-in>Beta Sign In</a>');
requireText('homepage paired login and beta actions',homepage,'class="ffdemo-nav-actions"');
requireText('homepage mobile paired actions',homepage,'class="ffdemo-mobile-actions"');
const homeDemoCss=read('assets/css/homepage-interactive-decision-v7.css');
const homeDemoJs=read('assets/js/homepage-interactive-decision-v7.js');
requireText('homepage responsive demo',homeDemoCss,'@media(max-width:750px)');
requireText('homepage reduced motion',homeDemoCss,'@media(prefers-reduced-motion:reduce)');
requireText('homepage instant price input',homeDemoJs,"addEventListener('input', render)");
forbidText('homepage unauthorized provider access',homeDemoJs,'fetch(');
for(const store of ['localStorage','sessionStorage','indexedDB'])forbidText('homepage device storage',homeDemoJs,store);
for(const legacy of ['data-decision-forge','data-film','assets/js/homepage-deal-or-decoy-v1.js'])forbidText('homepage duplicate experience',homepage,legacy);

requireText('beta start action',awardJs,'Start application');
requireText('beta apply anchor',awardJs,"applySection.id='apply'");
requireText('beta notice grouping',awardJs,"grid.className='ff-beta-notice-grid'");
requireText('beta server form',beta,'action="/api/beta/applications"');
requireText('beta step one',awardJs,'steps.slice(1)');
requireText('beta step transition',awardJs,'setStep(1)');
requireText('homepage returning tester sign in',homepage,'href="/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start" data-ff-marketing-sign-in>Beta Sign In</a>');
requireText('beta application returning tester sign in',beta,'data-ff-returning-beta-sign-in');
requireText('beta application avoids duplicate applications',beta,'do not submit another application');
requireText('shared marketing sign in uses production auth',siteJs,"link.href='/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start'");
requireText('shared marketing sign in covers desktop navigation',siteJs,"document.querySelectorAll('.desktop-nav')");
requireText('shared marketing sign in covers mobile navigation',siteJs,"document.querySelectorAll('.mobile-nav')");
requireText('shared marketing sign in avoids duplicates',siteJs,"if(nav.querySelector('[data-ff-marketing-sign-in]'))return");
requireText('shared navigation routes deploy previews to production sign-in',siteJs,'routePreviewBetaSignIn();');
const conversionJs=read('assets/js/conversion-events.js');
requireText('normalized preview sign-in points to live production',conversionJs,'Sign in on the live FlipForge website');
const authHtml=read('production-auth.html');
const authProbe=read('scripts/lib/flipforge-production-auth-probe.mjs');
requireText('preview sign-in forms are really hidden even with grid CSS',authHtml,'form[hidden]{display:none}');
requireText('preview sign-in explains live-only account',authHtml,'data-production-auth-preview-redirect hidden');
requireText('preview probe preserves existing access boundary',authProbe,'if (!hostAllowed)');
requireText('preview probe unhides safe sign-in link',authProbe,'previewRedirect.hidden = false');


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
requireText('mobile guide route navigation remains sticky',guideCompact,'.ff-guide-route-nav{position:sticky!important');
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
