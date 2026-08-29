import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const failures=[];
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};
const forbidText=(label,text,needle)=>{if(text.includes(needle))failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);};

const marketing=read('assets/css/marketing-v3.css');
const marketingPages=read('assets/css/marketing-pages-v3.css');
const marketingSupport=read('assets/css/marketing-support-v3.css');
const density=read('assets/css/marketing-density-v1.css');
const homeProof=read('assets/css/homepage-product-proof-v2.css');
const homeVisual=read('assets/css/homepage-visual-proof-v1.css');
const awardJs=read('assets/js/award-winning-v1.js');
const appIndex=read('saas-prototype/index.html');
const appLayout=read('saas-prototype/customer-layout-system-v2.css');
const guideCompact=read('saas-prototype/guided-mode-compact-v1.css');
const readability=read('saas-prototype/customer-readability.css');
const homepage=read('index.html');
const product=read('product.html');
const evidence=read('learn.html');
const plans=read('pricing.html');
const about=read('about.html');
const beta=read('beta-application.html');

// One shared marketing density owner across every public presentation family.
for(const [label,text] of [['homepage marketing',marketing],['product/about marketing',marketingPages],['support marketing',marketingSupport]]){
  requireText(label,text,'@import url("marketing-density-v1.css")');
}
requireText('marketing density purpose',density,'definitive marketing density system');
requireText('homepage viewport',density,'min-height:0!important');
requireText('homepage vertical alignment',density,'align-items:start!important');
requireText('homepage proof width',density,'max-width:720px!important');
requireText('marketing page hero cap',density,'font-size:clamp(38px,4vw,52px)!important');
requireText('support page hero cap',density,'font-size:clamp(36px,3.75vw,50px)!important');
requireText('shared question density',density,'min-height:168px!important');
requireText('beta notice compaction',density,'.ff-beta-notice-grid');
requireText('mobile density',density,'--ff-site-section-y-mobile:36px');
forbidText('marketing density old giant desktop visual',density,'width:110%!important');
forbidText('marketing density old giant desktop visual',density,'margin:-30px 0 0!important');
forbidText('marketing density old giant desktop hero',density,'max-width:1400px!important');

// Homepage: real product proof owns the width, illustrative receipt is secondary.
requireText('homepage proof owner',homeProof,'Real product first. Illustrative receipt stays compact and secondary.');
requireText('homepage real proof layout',homeProof,'.ff-home-focused .ff-decision-motion');
requireText('homepage real proof layout',homeProof,'display:block!important');
requireText('homepage product screenshot',homeProof,'.ff-live-product-shot');
requireText('homepage product screenshot height',homeProof,'height:clamp(255px,24vw,330px)');
requireText('homepage compact illustrative receipt',homeProof,'.ff-motion-stack{display:none!important}');
requireText('homepage compact illustrative footer',homeProof,'.ff-motion-footer{display:none!important}');
requireText('homepage real product content',homepage,'Real FlipForge product interface');
requireText('homepage first action',homepage,'Request Beta Access');
requireText('homepage reason trail',homepage,'id="reason-trail"');
// The legacy theatre may remain for historical visual support, but the later owner must override it.
requireText('legacy theatre recognized',homeVisual,'grid-template-columns:minmax(190px,.72fr) minmax(0,1.28fr)');

// Beta: action comes before notices/form and notices compact without changing the server form.
requireText('beta start action',awardJs,'Start application');
requireText('beta apply anchor',awardJs,"applySection.id='apply'");
requireText('beta notice grouping',awardJs,"grid.className='ff-beta-notice-grid'");
requireText('beta server form',beta,'action="/api/beta/applications"');
requireText('beta step one',awardJs,'steps.slice(1)');
requireText('beta step transition',awardJs,'setStep(1)');

// Major public pages remain in the shared shell and keep a clear primary purpose.
for(const [label,text] of [['homepage',homepage],['product',product],['Evidence Lab',evidence],['Launch Plans',plans],['About',about],['Beta',beta]]){
  requireText(`${label} brand`,text,'FlipForge');
  requireText(`${label} navigation`,text,'Request Beta Access');
}
requireText('product primary action',product,'Request Beta Access');
requireText('Evidence Lab primary action',evidence,'Start with Busted Comp');
requireText('Launch Plans primary action',plans,'Request Beta Access');
requireText('About purpose',about,'WHY FLIPFORGE EXISTS');
requireText('Beta purpose',beta,'CONTROLLED PRIVATE BETA');

// Authenticated app has one final layout owner loaded after accumulated legacy styling.
requireText('app layout purpose',appLayout,'definitive viewport and density owner');
requireText('app topbar density',appLayout,'min-height:68px!important');
requireText('app workspace density',appLayout,'padding:22px 24px 34px!important');
requireText('app heading cap',appLayout,'font-size:clamp(1.85rem,2.55vw,2.35rem)!important');
requireText('app panel density',appLayout,'padding:15px 16px!important');
requireText('app metric density',appLayout,'min-height:108px!important');
requireText('decision intelligence density',appLayout,'font-size:clamp(2rem,3.2vw,3rem)!important');
requireText('guide viewport guard',appLayout,'max-height:calc(100vh - 28px)!important');
requireText('mobile app density',appLayout,'padding:18px 14px 28px!important');
requireText('final app layout import',guideCompact,'@import url("customer-layout-system-v2.css");');
requireText('final stylesheet present',appIndex,'<link rel="stylesheet" href="guided-mode-compact-v1.css">');
requireText('readability retained',readability,'single customer-facing typography/readability owner');
requireText('readability text floor',readability,'--ff-type-xs: .875rem');

// Authority and brand boundaries remain unchanged during presentation work.
const publicCopy=[homepage,product,evidence,plans,about,beta].join('\n');
requireText('locked slogan',publicCopy,'Before you buy. Know Why.');
for(const unsafe of ['CARD VALUE INTELLIGENCE','guaranteed profit','automatic purchase']){
  if(publicCopy.toLowerCase().includes(unsafe.toLowerCase()))failures.push(`public safety: forbidden ${JSON.stringify(unsafe)}`);
}
requireText('app transaction boundary',appIndex,'No transaction authority');

if(failures.length){
  console.error('Sitewide UX system validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log('PASS: FlipForge sitewide marketing and customer-app UX ownership validated.');
