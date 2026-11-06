// Prevent the public-site event sender and the Netlify allowlist from drifting.
// Runs without a network, credentials, production traffic or third-party packages.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CAMPAIGN_SOURCES, validateCampaign } from '../netlify/modern-functions/lib/beta-operations-core.mjs';

const client = readFileSync('assets/js/conversion-events.js', 'utf8');
const backend = readFileSync('netlify/modern-functions/conversion-event.mjs', 'utf8');

const setValues = (source, name) => {
  const pattern = new RegExp("\\bconst\\s+" + name + "\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)");
  const match = source.match(pattern);
  assert.ok(match, 'Missing source allowlist: ' + name);
  return new Set([...match[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]));
};

const events = setValues(backend, 'EVENT_NAMES');
const pages = setValues(backend, 'PAGE_NAMES');
const placements = setValues(backend, 'PLACEMENTS');
const experiences = setValues(client, 'experienceEvents');

const pageMap = client.match(/const pages=\{([\s\S]*?)\n  \};/);
assert.ok(pageMap, 'Missing public page classification');
const publicPages = [...pageMap[1].matchAll(/"\/[^"]*"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
const directEvents = [...client.matchAll(/\bemit\(\s*["']([^"']+)["']/g)].map(m => m[1]);

let passed = 0;
for (const event of new Set([...directEvents, ...experiences])) {
  assert.ok(events.has(event), 'Frontend event rejected by server: ' + event);
  passed++;
}
for (const page of new Set([...publicPages, 'legal'])) {
  assert.ok(pages.has(page), 'Frontend page rejected by server: ' + page);
  passed++;
}
// The frontend derives these placements via placementFor(), its experience
// placement regex and the explicit form / visit tracking handlers.
for (const placement of [
  'navigation', 'footer', 'sample-spotlight', 'evidence', 'hero', 'page',
  'sample-page', 'form', 'post-submit', 'onboarding',
  'audience-flipper', 'audience-investor', 'audience-collector',
  'audience-dealer', 'audience-grading',
  'challenge', 'challenge-buy', 'challenge-investigate', 'challenge-pass',
  'demo', 'app-discover', 'app-evaluate', 'app-receipt'
]) {
  assert.ok(placements.has(placement), 'Frontend placement rejected by server: ' + placement);
  passed++;
}
// Keep the event boundary closed to arbitrary strings or personal data.
for (const unsafe of ['visitor_email', 'card_sale_price', 'unknown_event']) {
  assert.ok(!events.has(unsafe), 'Unexpected unrestricted event: ' + unsafe);
  passed++;
}
assert.ok(client.includes('JSON.stringify({event,page,placement,...campaign})'),
  'The public tracker must transmit only allowlisted dimensions plus validated campaign slugs');
assert.ok(backend.includes('!EVENT_NAMES.has(event)') && backend.includes('!PAGE_NAMES.has(page)') &&
  backend.includes('!PLACEMENTS.has(placement)'), 'Server validation must remain fail-closed');
passed += 2;

// One public sender. Other public scripts once posted their own event names and raw page paths, which the
// server rejected with 400 EVENT_NOT_ALLOWED; funnel events must go through conversion-events.js.
const publicSenders = readdirSync('assets/js').filter(name => name.endsWith('.js'))
  .filter(name => readFileSync('assets/js/' + name, 'utf8').includes('/api/conversion-event'));
assert.deepEqual(publicSenders, ['conversion-events.js'], 'Only conversion-events.js may post public conversion events: ' + publicSenders);
for (const retired of ['phase3_landing_to_evaluate', 'phase3_public_beta_cta_clicked', 'phase2_beta_cta_clicked',
  'evidence_failure_selected', 'decision_receipt_layer_selected', 'decision_receipt_cta_clicked', 'evaluate_cta_clicked']) {
  assert.ok(!events.has(retired), 'Retired duplicate / non-funnel event must not be allowlisted: ' + retired);
  passed++;
}

// Private Beta workspace use (Nov 2026). The in-app events once posted from commercial-dashboard-v2.js and
// phase3-first-decision-activation-v1.js were all rejected with 400 EVENT_NOT_ALLOWED (names not allowlisted, raw
// window.location.pathname as the page), and the phase3 result-education ones could never fire (that layer yields to
// the CDI Signal Stack). Now beta-session-v1.js is the one in-app sender: a fixed name table, the fixed page "beta-app"
// and fixed placements; the server allowlists exactly those names - nothing pattern-based.
const session = readFileSync('saas-prototype/beta-session-v1.js', 'utf8');
const sessionEvents = new Set([...(session.match(/const EVENTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '').matchAll(/"([a-z0-9_]+)"/g)].map(m => m[1]));
const IN_APP = ['evaluation_started', 'evaluation_completed', 'decision_saved', 'decision_explanation_viewed', 'tracking_viewed',
  'home_first_use_viewed', 'home_returning_viewed', 'home_evaluate_clicked', 'home_shortcut_clicked', 'decision_checks_viewed',
  'decision_receipt_opened', 'evidence_viewed', 'portfolio_viewed', 'alerts_viewed', 'forge_heat_viewed'];
assert.deepEqual([...sessionEvents].sort(), [...IN_APP].sort(), 'beta-session-v1.js in-app event table changed: ' + [...sessionEvents]);
for (const event of IN_APP) { assert.ok(events.has(event), 'In-app event rejected by server: ' + event); passed++; }
const SHORTCUTS = ['shortcut_saved', 'shortcut_outcomes', 'shortcut_heat', 'shortcut_portfolio'];
assert.ok(session.includes('const PAGE = "beta-app";') && session.includes('const PLACEMENT = "workflow";')
  && session.includes('SHORTCUT_PLACEMENTS = Object.freeze({ saved: "shortcut_saved", outcomes: "shortcut_outcomes", heat: "shortcut_heat", portfolio: "shortcut_portfolio" })')
  && session.includes('JSON.stringify({ event, page: PAGE, placement })') && session.includes('if (!EVENTS.has(event) || !PLACEMENTS.has(placement)) return;'),
  'The in-app sender sends only a table name, the fixed page "beta-app" and a fixed placement');
assert.ok(pages.has('beta-app') && placements.has('workflow'), 'Server accepts the fixed in-app page and placement');
for (const placement of SHORTCUTS) { assert.ok(placements.has(placement), 'Home shortcut placement missing from server allowlist: ' + placement); passed++; }
assert.ok(!/JSON\.stringify\(\{[^}]*(?:pathname|location|route|href|search|hash)[^}]*\}\)/.test(session), 'In-app events must not send a raw path, URL or route');
assert.ok(session.includes('ROUTE_VIEWS = Object.freeze({ tracking: "tracking_viewed", portfolio: "portfolio_viewed", alerts: "alerts_viewed", "forge-heat": "forge_heat_viewed", evidence: "evidence_viewed" })'),
  'Screen views come from a fixed route table');
assert.ok(session.includes('window.addEventListener("click", event => {') && !/preventDefault|stopPropagation\(|stopImmediatePropagation/.test(session.replace(/\/\/.*$/gm, '')),
  'In-app observation is passive: it never prevents or stops a customer action');
passed += 5;
// One in-app sender: the Home owner and the retired phase3 layer post nothing themselves.
for (const file of ['saas-prototype/commercial-dashboard-v2.js', 'saas-prototype/phase3-first-decision-activation-v1.js']) {
  assert.ok(!readFileSync(file, 'utf8').includes('/api/conversion-event'), file + ' must not post conversion events (beta-session-v1.js is the in-app sender)');
  passed++;
}
assert.ok(readFileSync('saas-prototype/commercial-dashboard-v2.js', 'utf8').includes('window.FlipForgeBetaSessionV1?.homeShown?.(firstUse ? "first-use" : "returning");'),
  'Home reports only which panel it rendered from the saved-decision count');
// Verdicts, raw paths, retired and never-firing names stay outside the allowlist.
for (const unsafe of ['buy', 'watch', 'verify', 'pass', '/app/beta/', '/app/customer/', '/saas-prototype/', 'dashboard_zero_saved', 'result_education', 'returning_saved']) {
  assert.ok(!placements.has(unsafe) && !pages.has(unsafe), 'Verdict, raw path or retired placement must not be allowlisted: ' + unsafe);
  passed++;
}
for (const retired of ['phase3_first_use_shown', 'phase3_returning_home_shown', 'phase3_first_evaluate_clicked', 'phase3_returning_action_clicked',
  'phase3_first_result_education_viewed', 'phase3_evaluation_completed', 'phase3_evidence_opened', 'phase3_evaluate_another_clicked',
  'phase3_decision_receipt_opened', 'phase3_governed_evaluation_started', 'phase3_card_search_submitted', 'phase3_identity_selected']) {
  assert.ok(!events.has(retired), 'Retired phase3 event must not be allowlisted: ' + retired);
  passed++;
}
assert.ok(![...events, ...pages, ...placements].some(value => /[*?\\^$]/.test(value)), 'Allowlists hold exact strings only');
passed += 2;

// Campaign attribution: first-touch utm_* in sessionStorage only, strict server re-validation, nothing else.
assert.ok(client.includes('sessionStorage.setItem(CAMPAIGN_KEY') && !/localStorage|document\.cookie|indexedDB/.test(client),
  'Campaign attribution must use this tab\'s sessionStorage only');
assert.ok(client.includes('/^[a-z0-9_-]{1,40}$/') && client.includes('["utm_source","utm_medium","utm_campaign","utm_content"]'),
  'The client keeps only the four utm fields as lowercase slugs');
assert.ok(client.includes('field.type="hidden"') && client.includes('application.append(field)'),
  'The beta application carries the validated campaign fields');
assert.ok(backend.includes('campaign: validateCampaign(input)'), 'Conversion records keep only server-validated campaign slugs');
assert.ok(readFileSync('netlify/modern-functions/beta-applications.mjs', 'utf8').includes('createApplication(validation.applicant, now(), validateCampaign(input))'),
  'Application records keep only server-validated campaign slugs');
assert.deepEqual([...CAMPAIGN_SOURCES], ['instagram', 'tiktok', 'facebook', 'youtube', 'outreach', 'reddit', 'email']);
const clientSources = client.match(/const CAMPAIGN_SOURCES=\[([^\]]*)\]/);
assert.ok(clientSources, 'The client keeps its own list of known campaign sources');
assert.deepEqual(JSON.parse('[' + clientSources[1] + ']'), [...CAMPAIGN_SOURCES],
  'The client accepts exactly the server\'s known campaign sources (an unsupported first source cannot lock out a valid campaign)');
assert.ok(client.includes('return CAMPAIGN_SOURCES.includes(clean.utm_source)?clean:{};'), 'The client drops unknown sources before storing first touch');
passed += 3;
assert.deepEqual(validateCampaign({ utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'wysbi26', utm_content: 'w02v01' }),
  { source: 'instagram', medium: 'social', campaign: 'wysbi26', content: 'w02v01' });
assert.deepEqual(validateCampaign({ utm_source: 'reddit', utm_medium: 'Social Ads', utm_campaign: 'a@b.test', utm_content: 'x'.repeat(41) }),
  { source: 'reddit', medium: null, campaign: null, content: null }, 'Invalid campaign slugs are dropped, never stored');
for (const source of ['Instagram', 'myspace', 'instagram ', '', 'https://example.test', 'person@example.test']) {
  assert.equal(validateCampaign({ utm_source: source, utm_campaign: 'wysbi26' }), null, 'Unknown or malformed utm_source rejected: ' + source);
  passed++;
}
assert.equal(validateCampaign({ utm_source: ['instagram'] }), null);
assert.equal(validateCampaign(null), null);
passed += 12;

console.log('PASS: ' + passed + ' public conversion event / page / placement / campaign contract checks.');
