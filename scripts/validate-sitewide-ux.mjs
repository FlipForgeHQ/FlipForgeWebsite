import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const failures=[];
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.includes(needle))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

const marketingPages=read('assets/css/marketing-pages-v3.css');
const marketingSupport=read('assets/css/marketing-support-v3.css');
const density=read('assets/css/marketing-density-v1.css');
const heroCss=read('assets/css/homepage-decision-hero-v1.css');
const mobileHomeCss=read('assets/css/homepage-mobile-nav-v1.css');
const videoCss=read('assets/css/homepage-video-v1.css');
const awardJs=read('assets/js/award-winning-v1.js');
const appIndex=read('saas-prototype/index.html');
const appLayout=read('saas-prototype/customer-layout-system-v2.css');
const guideCompact=read('saas-prototype/guided-mode-compact-v1.css');
const mobileShell=read('saas-prototype/mobile-shell-v3.css');
const readability=read('saas-prototype/customer-readability.css');
const homepage=read('index.html');
const product=read('product.html');
const evidence=read('learn.html');
const plans=read('pricing.html');
const about=read('about.html');
const beta=read('beta-application.html');

// Shared marketing system remains for the deeper pages.
for(const [label,text] of [['product/about marketing',marketingPages],['support marketing',marketingSupport]]) requireText(label,text,'@import url("marketing-density-v1.css")');
requireText('marketing density purpose',density,'definitive marketing density system');
requireText('marketing page hero cap',density,'font-size:clamp(38px,4vw,52px)!important');
requireText('support page hero cap',density,'font-size:clamp(36px,3.75vw,50px)!important');
requireText('mobile density',density,'--ff-site-section-y-mobile:36px');

// Homepage now has its own approved decision-first visual owner.
requireText('homepage hero stylesheet',homepage,'assets/css/homepage-decision-hero-v1.css');
requireText('homepage mobile stylesheet',homepage,'assets/css/homepage-mobile-nav-v1.css');
requireText('homepage explainer stylesheet',homepage,'assets/css/homepage-video-v1.css');
requireText('homepage browser-decodable visual',homepage,'assets/images/flipforge-homepage-hero.webp');
requireText('homepage first action',homepage,'Request Beta Access');
requireText('homepage reason path',homepage,'href="#decision-video" data-ff-how-it-works>See How It Works');
requireText('homepage interactive proof',homepage,'assets/interactive/flipforge-know-why.html');
forbidText('homepage broken visual removed',homepage,'assets/images/flipforge-approved-decision-visual.webp');
forbidText('homepage mislabeled video removed',homepage,'assets/video/flipforge-how-it-works-30s.mp4');
requireText('homepage controlled beta',homepage,'Controlled Private Beta.');
requireText('homepage transaction boundary',homepage,'FlipForge does not guarantee profit or authorize transactions.');
for(const old of ['ff-live-product-frame','ff-motion-console','ff-card-stage','data-replay-decision'])forbidText('homepage old overload removed',homepage,old);
requireText('homepage compact width',heroCss,'width:min(1380px,calc(100% - 56px))');
requireText('homepage approved visual cap',heroCss,'max-width:760px!important');
requireText('homepage mobile single column',heroCss,'@media(max-width:760px)');
requireText('homepage mobile nav',mobileHomeCss,'.mobile-nav.open');
requireText('homepage reduced motion',mobileHomeCss,'@media(prefers-reduced-motion:reduce)');
requireText('homepage explainer responsive',videoCss,'.ff-decision-animatic');

// Beta progressive form behavior remains untouched.
requireText('beta start action',awardJs,'Start application');
requireText('beta apply anchor',awardJs,"applySection.id='apply'");
requireText('beta notice grouping',awardJs,"grid.className='ff-beta-notice-grid'");
requireText('beta server form',beta,'action="/api/beta/applications"');
requireText('beta step one',awardJs,'steps.slice(1)');
requireText('beta step transition',awardJs,'setStep(1)');

for(const [label,text] of [['homepage',homepage],['product',product],['Evidence Lab',evidence],['Launch Plans',plans],['About',about],['Beta',beta]]){
  requireText(`${label} brand`,text,'FlipForge');
  requireText(`${label} navigation`,text,'Request Beta Access');
}
requireText('product primary action',product,'Request Beta Access');
requireText('Evidence Lab primary action',evidence,'Start with Busted Comp');
requireText('Launch Plans primary action',plans,'Request Beta Access');
requireText('About purpose',about,'WHY FLIPFORGE EXISTS');
requireText('Beta purpose',beta,'CONTROLLED PRIVATE BETA');

// Customer app density and phone shell remain governed separately.
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

const publicCopy=[homepage,product,evidence,plans,about,beta].join('\n');
requireText('locked slogan',publicCopy,'Before you buy. Know Why.');
for(const unsafe of ['CARD VALUE INTELLIGENCE','guaranteed profit','automatic purchase']) if(publicCopy.toLowerCase().includes(unsafe.toLowerCase()))failures.push(`public safety: forbidden ${JSON.stringify(unsafe)}`);
requireText('app transaction boundary',appIndex,'No transaction authority');

if(failures.length){console.error('Sitewide UX system validation failed:');failures.forEach(failure=>console.error(`- ${failure}`));process.exit(1);}
console.log('PASS: FlipForge decision-first homepage, deeper marketing pages, and customer-app UX ownership validated.');
