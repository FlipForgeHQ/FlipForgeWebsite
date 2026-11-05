// Real-browser end-to-end test: campaign link -> hero "Request Beta Access" -> submitted beta application.
// Serves the static site locally and answers /api/conversion-event and /api/beta/applications with this
// checkout's own Netlify handler modules, backed by in-memory stores. Nothing reaches production, Netlify
// Blobs, Identity or a mailbox: every non-local request is aborted and counted.
//
//   node scripts/audit-conversion-attribution-e2e.mjs                    # this checkout must pass
//   node scripts/audit-conversion-attribution-e2e.mjs --baseline <dir>   # also prove <dir> (e.g. origin/main) fails
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const CAMPAIGN = { source: 'instagram', medium: 'social', campaign: 'wysbi26', content: 'w02v01' };
const LANDING = '/?utm_source=instagram&utm_medium=social&utm_campaign=wysbi26&utm_content=w02v01';
const INVALID_LANDING = '/?utm_source=Instagram&utm_medium=social%20ads&utm_campaign=person%40example.test&utm_content=w02v01';
const RETIRED = ['phase3_landing_to_evaluate', 'phase3_public_beta_cta_clicked', 'decision_receipt_layer_selected',
  'decision_receipt_cta_clicked', 'evaluate_cta_clicked', 'phase2_beta_cta_clicked', 'evidence_failure_selected'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };

function memoryStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value, { onlyIfNew } = {}) {
      if (onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true, etag: key };
    },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: key } : null; },
    async delete(key) { data.delete(key); },
  };
}

// Handlers log one JSON line per record; keep those lines as the "event log" instead of printing them.
const logLines = [];
const print = console.log.bind(console);
console.log = (...args) => {
  const line = String(args[0] ?? '');
  if (args.length === 1 && line.startsWith('{"type":"flipforge_')) logLines.push(JSON.parse(line));
  else print(...args);
};

async function journey(root, label) {
  const conversion = await import(pathToFileURL(join(root, 'netlify/modern-functions/conversion-event.mjs')));
  const applications = await import(pathToFileURL(join(root, 'netlify/modern-functions/beta-applications.mjs')));
  const eventStore = memoryStore();
  const applicationStore = memoryStore();
  const api = {
    '/api/conversion-event': conversion.createConversionEventHandler({ store: eventStore }),
    '/api/beta/applications': applications.createBetaApplicationsHandler({ store: applicationStore }),
  };
  const sent = [];
  const otherApi = [];
  let pending = 0;
  let lastActivity = Date.now();
  logLines.length = 0;

  const server = createServer(async (req, res) => {
    pending++;
    lastActivity = Date.now();
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (url.pathname.startsWith('/api/')) {
        const handler = api[url.pathname];
        if (!handler) { otherApi.push(url.pathname); res.writeHead(404).end(); return; }
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['connection', 'keep-alive', 'transfer-encoding'].includes(key)));
        const response = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: body.length ? body : undefined }));
        const text = await response.text();
        if (url.pathname === '/api/conversion-event') {
          let payload = {};
          try { payload = JSON.parse(body.toString('utf8')); } catch { /* recorded as sent */ }
          sent.push({ payload, status: response.status, reply: text });
        }
        res.writeHead(response.status, Object.fromEntries(response.headers)).end(text);
        return;
      }
      if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>app stub</title>');
        return;
      }
      let file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(resolve(root))) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const content = await readFile(file).catch(() => null);
      if (!content) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
    } finally {
      pending--;
      lastActivity = Date.now();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const settle = async () => {
    for (let i = 0; i < 100 && (pending > 0 || Date.now() - lastActivity < 600); i++) await new Promise(done => setTimeout(done, 100));
  };

  const browser = await chromium.launch();
  const external = [];
  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base)) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    return context.newPage();
  };
  const apply = async (page, email) => {
    await page.fill('#name', 'Attribution Test');
    await page.fill('#email', email);
    await page.selectOption('#collector-type', 'Collector');
    await page.selectOption('#experience', '1–3 years');
    await page.selectOption('#web-access', 'Occasionally');
    await page.fill('#use-case', 'Attribution test application. Not a real applicant.');
    await page.click('[data-aw-beta-next]');
    await page.fill('#feedback', 'Attribution test application. Not a real applicant.');
    await page.check('#updates');
    await page.check('#terms-check');
    await Promise.all([page.waitForURL('**/thank-you.html', { timeout: 15000 }), page.click('button[type="submit"]')]);
    await page.waitForLoadState('networkidle');
  };

  // 1. Campaign link -> hero "Request Beta Access" -> application -> confirmation page.
  const page = await newPage();
  await page.goto(base + LANDING, { waitUntil: 'networkidle' });
  await settle();
  await Promise.all([page.waitForURL('**/beta-application.html'), page.click('[data-ff-hero-apply]')]);
  await page.waitForLoadState('networkidle');
  const hiddenFields = await page.$$eval('[data-beta-application-form] input[type="hidden"]', inputs => Object.fromEntries(inputs.map(i => [i.name, i.value])));
  await apply(page, 'attribution-test@example.test');
  await settle();
  const pathEvents = sent.length;

  // 2. The other public screens whose scripts sent rejected names: Product receipt + Evidence Lab theater.
  await page.goto(base + '/product.html', { waitUntil: 'networkidle' });
  await page.locator('[data-ff-p3-receipt-layer]').nth(2).click().catch(() => {});
  await page.locator('[data-ff-p2-evaluate-cta]').click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.goto(base + '/product.html', { waitUntil: 'networkidle' });
  await page.locator('[data-ff-p2-receipt-cta]').click().catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.goto(base + '/learn.html', { waitUntil: 'networkidle' });
  await page.locator('[data-ff-p2-failure]').nth(1).click().catch(() => {});
  await Promise.all([page.waitForURL('**/beta-application.html'), page.locator('main a[href*="beta-application"]').first().click()]).catch(() => {});
  await page.waitForLoadState('networkidle');
  await settle();

  // 3. Invalid campaign values in a fresh tab: never stored, never sent on.
  const before = sent.length;
  const invalidPage = await newPage();
  await invalidPage.goto(base + INVALID_LANDING, { waitUntil: 'networkidle' });
  await Promise.all([invalidPage.waitForURL('**/beta-application.html'), invalidPage.click('[data-ff-hero-apply]')]);
  await invalidPage.waitForLoadState('networkidle');
  await apply(invalidPage, 'attribution-test+invalid@example.test');
  await settle();
  const invalidSent = sent.slice(before);

  // 4. A client that bypasses the page: forged campaign values must be dropped by the server.
  const forged = await (await fetch(base + '/api/beta/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ name: 'Attribution Test', email: 'attribution-test+forged@example.test', collector_type: 'Collector',
      experience: '1–3 years', monthly_card_volume: '1–5', hosted_web_beta_access: 'Occasionally',
      primary_use_case: 'Attribution test application. Not a real applicant.', tester_fit: 'Attribution test application. Not a real applicant.',
      testing_focus: 'Discover and search', beta_updates_consent: 'yes', beta_terms_accepted: 'yes',
      utm_source: 'myspace', utm_medium: 'social', utm_campaign: 'wysbi26' }),
  })).status;
  const forgedEvent = await (await fetch(base + '/api/conversion-event', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'beta_cta_clicked', page: 'home', placement: 'hero', utm_source: 'instagram', utm_medium: 'Social Ads', utm_campaign: 'https://x.test', utm_content: 'w02v01' }) })).json();
  await settle();

  await browser.close();
  await new Promise(done => server.close(done));
  const records = [...applicationStore.data.entries()].filter(([key]) => key.startsWith('application/')).map(([, value]) => value);
  const byEmail = email => records.find(record => record.applicant?.email === email);
  return {
    label, root, sent, pathEvents, invalidSent, hiddenFields, external, otherApi, forged, forgedEvent,
    storedEvents: [...eventStore.data.values()],
    eventLog: logLines.filter(line => line.type === 'flipforge_conversion_event'),
    application: byEmail('attribution-test@example.test'),
    invalidApplication: byEmail('attribution-test+invalid@example.test'),
    forgedApplication: byEmail('attribution-test+forged@example.test'),
  };
}

const summarize = result => {
  const ok = result.sent.filter(item => item.status >= 200 && item.status < 300).length;
  const rejected = result.sent.filter(item => item.status === 400);
  const path = result.sent.slice(0, result.pathEvents);
  print(`\n[${result.label}] ${result.root}`);
  print(`  conversion requests: ${result.sent.length} total, ${ok} 2xx, ${rejected.length} 400`);
  print(`  campaign path (link -> hero CTA -> application -> confirmation): ${path.length} requests, ${path.filter(i => i.status < 300).length} 2xx, ${path.filter(i => i.status === 400).length} 400`);
  for (const item of result.sent) print(`    ${item.status} ${item.payload.event} page=${item.payload.page} placement=${item.payload.placement}${item.payload.utm_source ? ' utm=' + [item.payload.utm_source, item.payload.utm_medium, item.payload.utm_campaign, item.payload.utm_content].join('/') : ''}`);
  print(`  stored application campaign: ${JSON.stringify(result.application?.campaign)}`);
  print(`  invalid-utm application campaign: ${JSON.stringify(result.invalidApplication?.campaign)}; forged application campaign: ${JSON.stringify(result.forgedApplication?.campaign)}`);
  print(`  non-local requests aborted: ${result.external.length} (${[...new Set(result.external.map(url => new URL(url).host))].join(', ') || 'none'}); unknown /api calls: ${result.otherApi.length}`);
  return { ok, rejected };
};

const failures = [];
let passed = 0;
const check = (label, condition) => { if (condition) passed++; else failures.push(label); print(`${condition ? 'PASS' : 'FAIL'} | ${label}`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const baselineIndex = process.argv.indexOf('--baseline');
if (baselineIndex > 0) {
  const baseline = await journey(resolve(process.argv[baselineIndex + 1]), 'baseline');
  const { rejected } = summarize(baseline);
  check('baseline: the same path produces 400 EVENT_NOT_ALLOWED responses', rejected.length > 0 && rejected.every(item => item.reply.includes('EVENT_NOT_ALLOWED')));
  check('baseline: the campaign path itself is hit by a 400', baseline.sent.slice(0, baseline.pathEvents).some(item => item.status === 400));
  check('baseline: no campaign attribution reaches the application record', baseline.application && !baseline.application.campaign);
}

const result = await journey(process.cwd(), 'this checkout');
const { ok, rejected } = summarize(result);
const path = result.sent.slice(0, result.pathEvents);
const events = path.map(item => item.payload.event);
check('every conversion event in every journey returns 2xx (no 400)', result.sent.length > 0 && rejected.length === 0 && ok === result.sent.length);
check('campaign path sends hero beta_cta_clicked, beta_form_started and beta_application_received', ['beta_cta_clicked', 'beta_form_started', 'beta_application_received'].every(name => events.includes(name))
  && path.some(item => item.payload.event === 'beta_cta_clicked' && item.payload.placement === 'hero'));
check('the seven retired phase2 / phase3 events are no longer sent', !result.sent.some(item => RETIRED.includes(item.payload.event)));
check('no raw page path is sent', result.sent.every(item => !String(item.payload.page || '').includes('/')));
check('every campaign-path event carries the landing utm fields', path.every(item => item.payload.utm_source === 'instagram' && item.payload.utm_medium === 'social'
  && item.payload.utm_campaign === 'wysbi26' && item.payload.utm_content === 'w02v01'));
const pathStored = result.storedEvents.filter(record => path.some(item => item.payload.event === record.event));
check('stored conversion records and the event log keep the validated campaign', pathStored.length >= 3 && result.storedEvents.slice(0, result.pathEvents).every(record => same(record.campaign, CAMPAIGN))
  && result.eventLog.slice(0, result.pathEvents).every(record => same(record.campaign, CAMPAIGN)));
check('event records hold only event, page, placement, campaign and time', result.storedEvents.every(record => same(Object.keys(record), ['type', 'schemaVersion', 'event', 'page', 'placement', 'campaign', 'occurredAt'])));
check('the application form carries the campaign as hidden fields', same(result.hiddenFields, { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'wysbi26', utm_content: 'w02v01' }));
check('the stored beta application keeps the campaign fields', result.application?.status === 'SUBMITTED' && same(result.application?.campaign, CAMPAIGN));
check('invalid landing utm values are dropped before sending', result.invalidSent.length > 0 && result.invalidSent.every(item => !Object.keys(item.payload).some(key => key.startsWith('utm_'))));
check('invalid landing utm values never reach the application record', result.invalidApplication?.status === 'SUBMITTED' && result.invalidApplication.campaign === null);
check('forged unknown utm_source is dropped by the application function', result.forged === 202 && result.forgedApplication?.campaign === null);
check('forged malformed utm slugs are dropped by the event function', result.forgedEvent?.accepted === true
  && same(result.storedEvents.at(-1)?.campaign, { source: 'instagram', medium: null, campaign: null, content: 'w02v01' }));
check('nothing was sent to a FlipForge or Netlify host (all non-local requests aborted)', !result.external.some(url => /goflipforge|netlify/i.test(url)) && result.otherApi.length === 0);

print(`PASSED: ${passed}`);
print(`FAILED: ${failures.length}`);
if (failures.length) process.exit(1);
