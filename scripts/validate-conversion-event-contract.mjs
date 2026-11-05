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

// Signed-in app activation events (Nov 2026). All nine were rejected with 400 EVENT_NOT_ALLOWED: the names and
// placements were not allowlisted and the app sent its raw window.location.pathname as the page. Each app sender now
// sends a fixed page name and fixed placements, and the server allowlists exactly those - nothing pattern-based.
const IN_APP = {
  'saas-prototype/commercial-dashboard-v2.js': ['phase3_first_use_shown', 'phase3_returning_home_shown', 'phase3_first_evaluate_clicked', 'phase3_returning_action_clicked'],
  'saas-prototype/phase3-first-decision-activation-v1.js': ['phase3_first_result_education_viewed', 'phase3_evaluation_completed', 'phase3_evidence_opened',
    'phase3_evaluate_another_clicked', 'phase3_decision_receipt_opened'],
};
const IN_APP_PLACEMENTS = ['dashboard', 'dashboard_zero_saved', 'dashboard_saved', 'returning_saved', 'returning_outcomes', 'returning_heat',
  'returning_portfolio', 'result_education', 'saved_decision_detail'];
for (const [file, expected] of Object.entries(IN_APP)) {
  const source = readFileSync(file, 'utf8');
  const sentEvents = [...source.matchAll(/\bemit\(\s*["']([a-z0-9_]+)["']/g)].map(m => m[1]);
  assert.deepEqual([...new Set(sentEvents)].sort(), [...expected].sort(), 'In-app events sent by ' + file + ' changed: ' + sentEvents);
  for (const event of expected) { assert.ok(events.has(event), 'In-app event rejected by server: ' + event); passed++; }
  // Every literal placement passed to emit() is allowlisted; the returning destinations go through a fixed table.
  for (const [, placement] of source.matchAll(/\bemit\(\s*["'][a-z0-9_]+["']\s*,\s*["']([^"']+)["']/g)) {
    assert.ok(IN_APP_PLACEMENTS.includes(placement) && placements.has(placement), 'In-app placement rejected by server: ' + placement + ' in ' + file);
    passed++;
  }
  assert.ok(!/\bemit\(\s*["'][a-z0-9_]+["']\s*,\s*(?![\s"'])(?!RETURNING_PLACEMENTS\[)/.test(source), 'In-app emit() placements must be literals or the fixed table: ' + file);
  assert.ok(source.includes('const EVENT_PAGE = "beta-app";') && source.includes('JSON.stringify({ event, page: EVENT_PAGE, placement })'),
    'In-app events must send only event, the fixed page "beta-app" and a placement: ' + file);
  assert.ok(!/JSON\.stringify\(\{[^}]*(?:pathname|location|route|href|search|hash)[^}]*\}\)/.test(source), 'In-app events must not send a raw path, URL or route: ' + file);
  passed += 3;
}
const dashboardSource = readFileSync('saas-prototype/commercial-dashboard-v2.js', 'utf8');
assert.ok(dashboardSource.includes('RETURNING_PLACEMENTS = Object.freeze({ saved: "returning_saved", outcomes: "returning_outcomes", heat: "returning_heat", portfolio: "returning_portfolio" })')
  && dashboardSource.includes('RETURNING_PLACEMENTS[returning.getAttribute("data-ff-p3-return")] || "unknown"'), 'Returning-home destinations map through a fixed placement table');
assert.ok(pages.has('beta-app'), 'Server must accept the fixed in-app page name');
for (const placement of IN_APP_PLACEMENTS) assert.ok(placements.has(placement), 'In-app placement missing from server allowlist: ' + placement);
// The saved verdict is recommendation data and is never a placement; the old app paths are never a page.
for (const unsafe of ['buy', 'watch', 'verify', 'pass', '/app/beta/', '/app/customer/', '/saas-prototype/']) {
  assert.ok(!placements.has(unsafe) && !pages.has(unsafe), 'Verdict or raw path must not be allowlisted: ' + unsafe);
  passed++;
}
// Discover events Phase 3 no longer sends stay outside the allowlist.
for (const retired of ['phase3_governed_evaluation_started', 'phase3_card_search_submitted', 'phase3_identity_selected']) {
  assert.ok(!events.has(retired), 'Retired Discover event must not be allowlisted: ' + retired);
  passed++;
}
assert.ok(![...events, ...pages, ...placements].some(value => /[*?\\^$]/.test(value)), 'Allowlists hold exact strings only');
passed += 3;

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
