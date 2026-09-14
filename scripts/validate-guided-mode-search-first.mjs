import fs from 'node:fs';

const layout = fs.readFileSync('saas-prototype/guided-mode-layout-fix-v1.css', 'utf8');
const guide = fs.readFileSync('saas-prototype/guided-mode-v1.js', 'utf8');
const focusFix = fs.readFileSync('saas-prototype/guided-discover-focus-fix-v1.js', 'utf8');
const discover = fs.readFileSync('saas-prototype/customer-discovery.js', 'utf8');
const failures = [];

const requireText = (label, text, needle) => {
  if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`);
};

requireText('welcome modal cannot block workspace', layout, '.ff-guide-modal-backdrop');
requireText('welcome modal is hidden', layout, 'display: none !important');
requireText('modal body lock is neutralized', layout, 'body.ff-guide-modal-open');
requireText('workspace remains scrollable', layout, 'overflow: auto !important');
requireText('contextual Guided Mode remains available', guide, 'window.FlipForgeGuidedMode = Object.freeze');
requireText('runtime guard removes legacy modal node', focusFix, 'document.getElementById(LEGACY_WELCOME_ID)?.remove()');
requireText('runtime guard removes modal body lock', focusFix, 'classList.remove("ff-guide-modal-open")');
requireText('runtime guard watches late modal recreation', focusFix, 'new MutationObserver(() => neutralizeLegacyWelcome())');
requireText('authenticated identity changes re-enforce search first', focusFix, 'flipforge:identity-change');
requireText('full customer route is recognized before route-driven focus', focusFix, 'FULL_CUSTOMER_PATH');
requireText('Discover routes still surface the exact-card entry', focusFix, 'function showRouteCue()');
requireText('full customer route cue preserves governed scroll origin', focusFix, 'showExactCardEntry({ clear: false, scroll: !fullCustomerMode() })');
requireText('Discover hash changes still surface the route cue', focusFix, 'window.setTimeout(() => showRouteCue(), 120)');
requireText('explicit card-focus actions still scroll to the input', focusFix, 'showExactCardEntry({ clear: false, scroll: true })');
requireText('explicit new-card actions still scroll to a cleared input', focusFix, 'showExactCardEntry({ clear: true, scroll: true })');
requireText('Discover still owns the exact-card search form', discover, 'data-customer-discovery-form');
requireText('Discover still exposes the card identity input', discover, 'name="exactCardQuery"');

if (failures.length) {
  console.error('Guided Mode search-first validation failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PASS: sign-in onboarding cannot cover Discover; automatic full-customer route entry preserves scroll position while explicit card-focus actions still surface the exact-card input.');
