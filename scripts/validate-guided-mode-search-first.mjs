import fs from 'node:fs';

const layout = fs.readFileSync('saas-prototype/guided-mode-layout-fix-v1.css', 'utf8');
const guide = fs.readFileSync('saas-prototype/guided-mode-v1.js', 'utf8');
const guideCss = fs.readFileSync('saas-prototype/guided-mode-v1.css', 'utf8');
const compactGuideCss = fs.readFileSync('saas-prototype/guided-mode-compact-v1.css', 'utf8');
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
requireText('Guide highlights target actionable controls instead of whole panels', guide, 'const actionable = direct || [...(node.querySelectorAll?.(');
// Never a hidden, file or zero-size control (the Bulk CSV panel's hidden file input was highlighted on Evaluate).
requireText('Guide never highlights hidden, file or zero-size controls', guide, '.find(usableControl)');
requireText('Guide reads the manual evaluation form before any other panel on Evaluate', guide, 'return main.querySelector("[data-staging-evaluation-form]")');
requireText('Guide highlight no longer draws an intrusive outline', guideCss, 'outline:none!important');
requireText('Guide highlight label overlay is disabled', guideCss, '.ff-guide-highlight::after{display:none!important}');
requireText('Mobile Guided Mode keeps progress out of the active task', compactGuideCss, '.ff-guide-progress{display:none!important}');
requireText('Mobile Guided Mode keeps route navigation reachable', compactGuideCss, '.ff-guide-route-nav{position:sticky!important');
// The Discover card-box cue (arrival, "Focus card entry", "+ Start a new card") is the Discover owner's
// (customer-discovery.js) since Nov 3 2026; guided-discover-focus-fix-v1.js and the Guided Mode welcome modal it
// removed on sight are gone.
requireText('Guided Mode creates no welcome modal', guide.includes('ff-guide-modal-backdrop') || guide.includes('function showWelcome') ? '' : 'none', 'none');
requireText('Guided Mode adds no coach into the Discover page', guide.includes('data-ff-discover-coach') ? '' : 'none', 'none');
requireText('Guided Mode hands card-box focus to the Discover owner', guide, 'discovery?.focusCardEntry?.()');
requireText('Guided Mode hands new cards to the Discover owner', guide, 'if (clear) discovery?.startNewCard?.();');
requireText('full customer route is recognized before route-driven focus', discover, 'function fullCustomerMode()');
requireText('Discover arrivals still surface the exact-card entry', discover, 'function arrivalCue()');
requireText('full customer route cue preserves governed scroll origin', discover, 'focusCardEntry({ scroll: !fullCustomerMode(), passiveSerial: serial })');
requireText('explicit card-focus actions still scroll to the input', discover, 'if (target.closest("[data-ff-focus-card]")) focusCardEntry();');
requireText('automatic route cue is marked passive', discover, 'const serial = state.engagement;');
requireText('submitted searches supersede a pending route cue', discover, 'event.preventDefault();\n      state.engagement += 1;');
requireText('typed queries supersede a pending route cue', discover, 'if (event.isTrusted) state.engagement += 1;');
requireText('superseded route cue never takes focus', discover, 'if (passiveSerial !== null && passiveSerial !== state.engagement) return;');
requireText('route cue stands down once results are on screen', discover, 'if (!discoverOwnsSurface() || state.engagement !== serial || state.data) return;');
requireText('arriving on Discover starts a new engagement window', discover, 'state.arrivalPending = true;');
requireText('explicit new-card actions clear the workspace and focus the input', discover, 'renderCurrent();\n    focusCardEntry();');
requireText('Discover still owns the exact-card search form', discover, 'data-customer-discovery-form');
requireText('Discover still exposes the card identity input', discover, 'name="exactCardQuery"');

if (failures.length) {
  console.error('Guided Mode search-first validation failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PASS: Guided Mode stays search-first, exposes clickable steps plus persistent Back/Next navigation, and highlights actionable controls without drawing an intrusive page-wide outline.');
