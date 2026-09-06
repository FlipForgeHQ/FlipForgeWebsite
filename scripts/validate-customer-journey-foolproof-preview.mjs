import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const html = read('customer-journey-preview.html');
const css = read('assets/css/customer-journey-foolproof-v2.css');
const js = read('assets/js/customer-journey-foolproof-v2.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

check('001 preview remains private/noindex', html.includes('PRIVATE UX PREVIEW') && html.includes('noindex,nofollow,noarchive'));
check('002 foolproof preview assets are loaded', html.includes('customer-journey-foolproof-v2.css') && html.includes('customer-journey-foolproof-v2.js'));
check('003 one persistent next-action dock exists', (html.match(/class="ff-action-dock"/g) || []).length === 1 && html.includes('data-dock-primary'));
check('004 viewport-first shell prevents page-level action hunting', css.includes('height:100dvh') && css.includes('overflow:hidden') && css.includes('grid-template-rows:var(--ff-header) var(--ff-progress) minmax(0,1fr) var(--ff-dock)'));
check('005 mobile action dock accounts for browser safe area', css.includes('env(safe-area-inset-bottom)') && css.includes('.ff-action-dock'));
check('006 mobile listings use horizontal snap instead of vertical action hunting', css.includes('scroll-snap-type:x mandatory') && css.includes('scroll-snap-align:center'));
check('007 component responsiveness uses container queries', css.includes('@container(max-width:720px)') && css.includes('container-type:inline-size'));
check('008 modern popover path is progressive enhancement', html.includes('popover="auto"') && css.includes(':popover-open') && css.includes('@supports (transition-behavior:allow-discrete)'));
check('009 native dialog is used for destructive confirmation', html.includes('<dialog') && html.includes('data-delete-dialog') && js.includes('showModal'));
check('010 view transitions are progressive enhancement only', js.includes("typeof document.startViewTransition==='function'") && js.includes('else commitScreen(name)'));
check('011 reduced-motion preference is respected', css.includes('@media(prefers-reduced-motion:reduce)') && js.includes("prefers-reduced-motion: reduce"));
check('012 guided path is explicit and finite', ['search','identity','listing','decision','explain','tracking'].every(step => js.includes(`'${step}'`)) && html.includes('STEP 1 OF 6'));
check('013 loading explains work and advances automatically', html.includes('FLIPFORGE IS WORKING') && html.includes('Comparable evidence') && html.includes('PSA context') && js.includes("showScreen('decision')"));
check('014 result leads with decision before deeper evidence', html.indexOf('FLIPFORGE DECISION') > -1 && html.indexOf('FLIPFORGE DECISION') < html.indexOf('STEP 5 · WHY'));
check('015 saved decisions support archive, restore, and permanent-delete confirmation', html.includes('data-archive-card') && html.includes('data-restore-card') && html.includes('data-delete-card') && html.includes('data-confirm-delete'));
check('016 archive is the normal removal path', js.includes("analytics('decision_archived')") && js.includes('Moved to Archived') && js.includes('archive_undone'));
check('017 copy/paste and native selection are not intercepted', !/addEventListener\(\s*['"](?:copy|cut|paste|selectstart|contextmenu)['"]/.test(js) && !/on(?:copy|cut|paste|selectstart|contextmenu)\s*=/.test(html + js));
check('018 preview does not call production decision APIs', !/fetch\s*\(/.test(js) && !/\/api\/v1\//.test(js));
check('019 landing handoff context can be recognized without changing production landing behavior', js.includes("params.get('from')==='deal-check'") && html.includes('Back to FlipForge landing-page preview'));
check('020 advanced tools stay secondary to the first-card path', html.includes('popovertarget="ff-more-menu"') && html.indexOf('id="ff-more-menu"') > html.indexOf('class="ff-action-dock"'));
check('021 preview shell protects iPhone top and side safe areas', css.includes('env(safe-area-inset-top)') && css.includes('env(safe-area-inset-left)') && css.includes('env(safe-area-inset-right)'));
check('022 dynamic viewport has a classic viewport fallback', css.includes('height:100vh;height:100dvh') && css.includes('min-height:100vh;min-height:100dvh'));

if (failures) {
  console.error(`\n${failures} customer-journey preview validation check(s) failed.`);
  process.exit(1);
}

console.log('\nCustomer-journey foolproof preview validation passed.');
