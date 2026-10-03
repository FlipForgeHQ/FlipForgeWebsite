import fs from 'node:fs';

const layout = fs.readFileSync('saas-prototype/guided-mode-layout-fix-v1.css', 'utf8');
const guide = fs.readFileSync('saas-prototype/guided-mode-v1.js', 'utf8');
const guideCss = fs.readFileSync('saas-prototype/guided-mode-v1.css', 'utf8');
const compactGuideCss = fs.readFileSync('saas-prototype/guided-mode-compact-v1.css', 'utf8');
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
requireText('Guided Mode exposes clickable path steps', guide, 'data-guide-step="${step}"');
requireText('Guided Mode routes step clicks', guide, 'goToGuideStep(step.dataset.guideStep || "")');
requireText('Guided Mode provides persistent Back and Next controls', guide, 'ff-guide-route-nav');
requireText('Guided Mode can advance from a saved decision to tracking', guide, 'Next: track this card →');
requireText('Guide highlights target actionable controls instead of whole panels', guide, 'const actionable = direct || node.querySelector?.');
requireText('Guide highlight no longer draws an intrusive outline', guideCss, 'outline:none!important');
requireText('Guide highlight label overlay is disabled', guideCss, '.ff-guide-highlight::after{display:none!important}');
requireText('Mobile Guided Mode keeps progress out of the active task', compactGuideCss, '.ff-guide-progress{display:none!important}');
requireText('Mobile Guided Mode keeps route navigation reachable', compactGuideCss, '.ff-guide-route-nav{position:sticky!important');
requireText('runtime guard removes legacy modal node', focusFix, 'document.getElementById(LEGACY_WELCOME_ID)?.remove()');
requireText('runtime guard removes modal body lock', focusFix, 'classList.remove("ff-guide-modal-open")');
requireText('runtime guard watches late modal recreation', focusFix, 'new MutationObserver(() => neutralizeLegacyWelcome())');
requireText('authenticated identity changes re-enforce search first', focusFix, 'flipforge:identity-change');
requireText('full customer route is recognized before route-driven focus', focusFix, 'FULL_CUSTOMER_PATH');
requireText('Discover routes still surface the exact-card entry', focusFix, 'function showRouteCue()');
requireText('full customer route cue preserves governed scroll origin', focusFix, 'showExactCardEntry({ clear: false, scroll: !fullCustomerMode() })');
requireText('Discover hash changes still surface the route cue', focusFix, 'window.setTimeout(() => showRouteCue(), 120)');
requireText('explicit card-focus actions still scroll to the input', focusFix, 'showExactCardEntry({ clear: false, scroll: true })');
requireText('automatic route cue is marked passive', focusFix, 'pendingPassiveSerial = engagementSerial;');
requireText('submitted searches supersede a pending route cue', focusFix, 'if (event.target?.closest?.(FORM_SELECTOR)) engagementSerial += 1;');
requireText('typed queries supersede a pending route cue', focusFix, 'if (event.isTrusted && event.target?.matches?.(INPUT_SELECTOR)) engagementSerial += 1;');
requireText('superseded route cue never scrolls toward the input', focusFix, 'if (passiveCueSuperseded(passiveSince)) return;\n      input.classList.add("ff-discover-direct-input");');
requireText('route cue stands down once results are on screen', focusFix, 'return Boolean(document.querySelector("#ff-discovery-results"));');
requireText('explicit new-card actions still scroll to a cleared input', focusFix, 'showExactCardEntry({ clear: true, scroll: true })');
requireText('Discover still owns the exact-card search form', discover, 'data-customer-discovery-form');
requireText('Discover still exposes the card identity input', discover, 'name="exactCardQuery"');

if (failures.length) {
  console.error('Guided Mode search-first validation failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PASS: Guided Mode stays search-first, exposes clickable steps plus persistent Back/Next navigation, and highlights actionable controls without drawing an intrusive page-wide outline.');
