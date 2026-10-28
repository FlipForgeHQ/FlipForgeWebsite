// Prevent the public-site event sender and the Netlify allowlist from drifting.
// Runs without a network, credentials, production traffic or third-party packages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
assert.ok(client.includes('JSON.stringify({event,page,placement})'),
  'The public tracker must transmit only allowlisted dimensions');
assert.ok(backend.includes('!EVENT_NAMES.has(event)') && backend.includes('!PAGE_NAMES.has(page)') &&
  backend.includes('!PLACEMENTS.has(placement)'), 'Server validation must remain fail-closed');
passed += 2;

console.log('PASS: ' + passed + ' public conversion event / page / placement contract checks.');
