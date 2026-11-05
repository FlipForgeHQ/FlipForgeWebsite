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
