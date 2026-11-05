// Real-browser end-to-end test of the nine signed-in app (Private Beta workspace) activation events:
//   commercial-dashboard-v2.js           phase3_first_use_shown, phase3_returning_home_shown,
//                                        phase3_first_evaluate_clicked, phase3_returning_action_clicked
//   phase3-first-decision-activation-v1  phase3_first_result_education_viewed, phase3_evaluation_completed,
//                                        phase3_evidence_opened, phase3_evaluate_another_clicked,
//                                        phase3_decision_receipt_opened
// Until Nov 2026 /api/conversion-event answered all nine with 400 EVENT_NOT_ALLOWED: the names and placements were
// not allowlisted and the app sent its raw window.location.pathname as the page.
//
// Serves this checkout locally on 127.0.0.1 (a preview host the app accepts) with /app/beta/* mapped to
// saas-prototype/* like the Netlify rewrite. /api/conversion-event is answered by this checkout's own handler module,
// backed by an in-memory store; /api/v1/* is a synthetic read-only fixture; identity is a stubbed signed-in tester.
// Nothing reaches production, Netlify, Blobs or Identity: every non-local browser request is aborted and counted.
//
// The saved-decision page renders the CDI Signal Stack, and phase3-first-decision-activation-v1.js then yields its
// result education to it (so its five events cannot fire there today). To exercise those five events against the
// real handler, one session serves the stack script as an empty file so the education layer renders, exactly as it
// does when the stack is absent. That session is labelled "education layer forced"; nothing in the app is modified.
//
//   node scripts/audit-in-app-events-e2e.mjs                    # this checkout must pass
//   node scripts/audit-in-app-events-e2e.mjs --baseline <dir>   # also prove <dir> (the code before the fix) rejects them
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const NINE = [
  'phase3_first_use_shown', 'phase3_returning_home_shown', 'phase3_first_evaluate_clicked', 'phase3_returning_action_clicked',
  'phase3_first_result_education_viewed', 'phase3_evaluation_completed', 'phase3_evidence_opened',
  'phase3_evaluate_another_clicked', 'phase3_decision_receipt_opened',
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const EMAIL = 'in-app-events-audit@flipforge.test';
const CARD_ID = 'qa-in-app-buy';
const CARD_TITLE = '2019 Bowman Chrome Wander Franco #BCP1 PSA 10';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;

function memoryStore() {
  const data = new Map();
  return { data, async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true, etag: key }; } };
}

// The handler logs one JSON line per record; keep those lines instead of printing them.
const logLines = [];
const print = console.log.bind(console);
console.log = (...args) => {
  const line = String(args[0] ?? '');
  if (args.length === 1 && line.startsWith('{"type":"flipforge_')) logLines.push(JSON.parse(line));
  else print(...args);
};

const envelope = (cid, data) => ({ meta: { contractVersion: '1.0', engineVersion: 'in-app-events-audit', authority: 'Smart Opportunity',
  gradingAuthority: 'Existing PSA intelligence', correlationId: cid, generatedAt: '2026-11-05T12:00:00Z', evidenceFreshness: 'QA_FIXTURE',
  limitations: ['Synthetic in-app events audit fixture only.'] }, data });
const opportunity = () => ({ id: CARD_ID, title: CARD_TITLE, cardIdentity: CARD_TITLE, recommendation: 'BUY', ask: 410, supportedValue: 520,
  supportedValueCents: 52000, confidence: 81, liquidity: 70, risk: 35, rank: 78, observedAt: '2026-10-06T23:54:44Z', platform: 'EBAY',
  mappingState: 'CONFIRMED', recommendationSource: 'GOVERNED_SNAPSHOT', evidenceProvenanceStatus: 'CURRENT_EVIDENCE_RULES', evidence: { acceptedSales: 6 },
  governedDecision: { available: true, recommendation: 'BUY', confidence: 81, risk: 35, reason: 'BUY: saved reason.', evaluatedAt: '2026-10-06T23:54:44Z',
    supportedValueCents: 52000, supportedValueStatus: 'ESTABLISHED', maximumBuyPriceCents: 45000, allInAskCents: 41000, exactTrustedCompCount: 6,
    snapshotCount: 1, immutable: true, transactionAuthority: false } });

function apiFixture(pathname, saved, cid) {
  const items = saved ? [opportunity()] : [];
  if (pathname === '/api/v1/health') return [200, envelope(cid, { status: 'configured', bridgeEnabled: true })];
  if (pathname === '/api/v1/entitlements') return [200, envelope(cid, { kind: 'entitlements', membershipActive: true, current: { code: 'PRIVATE_BETA', accessState: 'ACTIVE' }, plan: { code: 'PRIVATE_BETA' }, usage: { completedEvaluations: items.length } })];
  if (pathname === '/api/v1/dashboard') return [200, envelope(cid, { kind: 'dashboard', readOnly: true, metrics: { trackedOpportunities: items.length, evidenceReady: items.length, populationContextAvailable: 0, needsVerification: 0 }, opportunities: items, items })];
  if (pathname === '/api/v1/opportunities') return [200, envelope(cid, { kind: 'opportunities', items, count: items.length, sourceOfTruth: 'SQLite', transactionAuthority: false })];
  if (pathname === '/api/v1/lifecycle') return [200, envelope(cid, { kind: 'lifecycle', sourceOfTruth: 'SQLite', items: [], transactionAuthority: false })];
  if (saved && pathname === `/api/v1/opportunities/${CARD_ID}`) return [200, envelope(cid, { kind: 'opportunity-detail', opportunity: opportunity(), sourceOfTruth: 'SQLite', transactionAuthority: false })];
  return [404, { error: { code: 'QA_NOT_MOCKED', message: pathname, correlationId: cid } }];
}

async function run(root, label) {
  const conversion = await import(pathToFileURL(join(root, 'netlify/modern-functions/conversion-event.mjs')));
  const eventStore = memoryStore();
  const handler = conversion.createConversionEventHandler({ store: eventStore });
  const sent = [];
  const otherApi = [];
  let saved = false;
  let blockStack = false;
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
      if (url.pathname === '/api/conversion-event') {
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['connection', 'keep-alive', 'transfer-encoding'].includes(key)));
        const response = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: body.length ? body : undefined }));
        const text = await response.text();
        let payload = {};
        try { payload = JSON.parse(body.toString('utf8')); } catch { /* recorded as sent */ }
        sent.push({ payload, raw: body.toString('utf8'), status: response.status, reply: text });
        res.writeHead(response.status, Object.fromEntries(response.headers)).end(text);
        return;
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const [status, json] = apiFixture(url.pathname, saved, req.headers['x-correlation-id'] || 'in-app-events-audit');
        if (status === 404) otherApi.push(url.pathname);
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(json));
        return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) { otherApi.push(url.pathname); res.writeHead(404).end(); return; }
      if (url.pathname === '/assets/js/flipforge-identity.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${EMAIL}"}),getSnapshot:()=>({authenticated:true,email:"${EMAIL}",fullName:"In-app Events Audit",membershipActive:true,membershipConfigured:true}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${EMAIL}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t"});`);
        return;
      }
      if (url.pathname === '/assets/js/flipforge-production-signin.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('(() => {})();'); return; }
      let rel = decodeURIComponent(url.pathname);
      let fallback = null;
      if (rel === '/app/beta' || rel === '/app/beta/') rel = '/saas-prototype/index.html';
      else if (rel.startsWith('/app/beta/')) { rel = '/saas-prototype/' + rel.slice('/app/beta/'.length); fallback = join(root, 'saas-prototype/index.html'); }
      else if (rel === '/app/customer' || rel === '/app/customer/') rel = '/saas-prototype/customer.html';
      else if (rel.startsWith('/app/customer/')) { rel = '/saas-prototype/' + rel.slice('/app/customer/'.length); fallback = join(root, 'saas-prototype/customer.html'); }
      if (blockStack && rel.endsWith('/customer-cdi-signal-stack-v1.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(''); return; }
      let file = resolve(root, '.' + rel);
      if (!file.startsWith(resolve(root))) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      let content = await readFile(file).catch(() => null);
      if (!content && fallback) { file = fallback; content = await readFile(file).catch(() => null); }
      if (!content) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
    } finally {
      pending--;
      lastActivity = Date.now();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const beta = base + '/app/beta/';
  const customer = base + '/app/customer/';
  const settle = async () => {
    for (let i = 0; i < 100 && (pending > 0 || Date.now() - lastActivity < 800); i++) await new Promise(done => setTimeout(done, 100));
  };

  const browser = await chromium.launch({ executablePath });
  const external = [];
  const errors = [];
  const open = async url => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(() => { try { localStorage.setItem('flipforge.privateBeta.onboarding.v1', 'complete'); localStorage.setItem('flipforge.guidedMode.enabled', 'false'); } catch (_) {} });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base)) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
    await page.goto(url, { waitUntil: 'load' });
    return { context, page };
  };
  const visible = (page, selector) => page.waitForSelector(selector, { timeout: 20000 }).then(() => true).catch(() => false);
  const ui = {};

  // 1. Home (the full customer app's Dashboard, commercial-dashboard-v2.js) with no saved decisions: first-use panel
  //    shown, then its "Evaluate" CTA.
  saved = false;
  {
    const { context, page } = await open(customer + '#/dashboard');
    ui.firstUsePanel = await visible(page, '[data-ff-p3-first-evaluate]');
    await settle();
    await page.click('[data-ff-p3-first-evaluate]').catch(() => {});
    await settle();
    await context.close();
  }

  // 2. Home with a saved decision: returning panel shown, then each of its four destinations.
  saved = true;
  {
    const { context, page } = await open(customer + '#/dashboard');
    ui.returningPanel = await visible(page, '[data-ff-p3-returning]');
    await settle();
    ui.returningLinks = [];
    for (const key of ['saved', 'outcomes', 'heat', 'portfolio']) {
      if (!await visible(page, `[data-ff-p3-return="${key}"]`)) continue;
      ui.returningLinks.push(key);
      await page.click(`[data-ff-p3-return="${key}"]`).catch(() => {});
      await settle();
      await page.evaluate(() => { window.location.hash = '#/dashboard'; });
      await settle();
    }
    await context.close();
  }

  // 3. Saved decision page as it ships: the CDI Signal Stack owns the result, so the education layer must not render.
  {
    const { context, page } = await open(`${beta}#/opportunities/${CARD_ID}`);
    ui.shippedStack = await visible(page, '#main-content [data-ff-cdi-stack-host]');
    await settle();
    ui.shippedEducation = await page.evaluate(() => Boolean(document.querySelector('#main-content [data-ff-p3-result-guide]')));
    await context.close();
  }
  const shippedEvents = sent.filter(item => NINE.slice(4).includes(item.payload.event)).length;

  // 4. Saved decision page, education layer forced (stack script served empty): view, Receipt, Evidence, Another card.
  //    The saved-decision page has no native Decision Receipt control of its own (that is on the Decision Intelligence
  //    page), so the proxy stays disabled; a stand-in native control is added to <main> so the proxy's click path runs.
  blockStack = true;
  {
    const { context, page } = await open(`${beta}#/opportunities/${CARD_ID}`);
    ui.forcedEducation = await visible(page, '#main-content [data-ff-p3-result-guide]');
    await settle();
    await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const native = document.createElement('button');
      native.type = 'button';
      native.hidden = true;
      native.setAttribute('data-ff-open-decision-receipt', '');
      main.appendChild(native);
      const proxy = main.querySelector('[data-ff-p3-open-receipt]');
      if (proxy) { proxy.disabled = false; proxy.click(); }
    });
    await settle();
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.querySelector('#main-content [data-ff-p3-open-evidence]')?.click());
    await settle();
    await page.evaluate(id => { window.location.hash = `#/opportunities/${id}`; }, CARD_ID);
    await visible(page, '#main-content [data-ff-p3-another-card]');
    await page.evaluate(() => document.querySelector('#main-content [data-ff-p3-another-card]')?.click());
    await settle();
    await context.close();
  }
  blockStack = false;

  await browser.close();

  // 5. The allowlist stays strict: the old raw path, a verdict placement, an unlisted Discover event and a lookalike
  //    name are still rejected by the same handler.
  const probes = {};
  for (const [name, body] of Object.entries({
    rawPath: { event: 'phase3_first_use_shown', page: '/app/beta/', placement: 'dashboard_zero_saved' },
    verdictPlacement: { event: 'phase3_first_result_education_viewed', page: 'beta-app', placement: 'buy' },
    rawDestination: { event: 'phase3_returning_action_clicked', page: 'beta-app', placement: 'saved' },
    unlistedEvent: { event: 'phase3_identity_selected', page: 'beta-app', placement: 'dashboard' },
    lookalikeEvent: { event: 'phase3_first_use_shown_x', page: 'beta-app', placement: 'dashboard' },
  })) {
    const before = sent.length;
    const response = await fetch(base + '/api/conversion-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    probes[name] = { status: response.status, reason: (await response.json()).reason };
    sent.splice(before);
  }
  const stored = eventStore.data.size;
  await new Promise(done => server.close(done));
  return { label, root, sent, external, otherApi, errors, ui, shippedEvents, probes, storedAfterProbes: stored, storedEvents: [...eventStore.data.values()],
    eventLog: logLines.filter(line => line.type === 'flipforge_conversion_event') };
}

const failures = [];
let passed = 0;
const check = (label, condition, detail = '') => { if (condition) passed++; else failures.push(label); print(`${condition ? 'PASS' : 'FAIL'} | ${label}${detail && !condition ? ` [${detail}]` : ''}`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const table = result => {
  print(`\n[${result.label}] ${result.root}`);
  print('  event                                  | sent | status            | page             | placements');
  for (const name of NINE) {
    const items = result.sent.filter(item => item.payload.event === name);
    const statuses = [...new Set(items.map(item => `${item.status}${item.status === 400 ? ' ' + (JSON.parse(item.reply || '{}').reason || '') : ''}`))].join(', ') || '(not sent)';
    const pages = [...new Set(items.map(item => item.payload.page))].join(', ');
    const placements = [...new Set(items.map(item => item.payload.placement))].join(', ');
    print(`  ${name.padEnd(38)} | ${String(items.length).padStart(4)} | ${statuses.padEnd(17)} | ${pages.padEnd(16)} | ${placements}`);
  }
  const others = result.sent.filter(item => !NINE.includes(item.payload.event));
  print(`  other app events: ${others.map(item => `${item.status} ${item.payload.event} page=${item.payload.page} placement=${item.payload.placement}`).join('; ') || 'none'}`);
  print(`  UI: ${JSON.stringify(result.ui)}; shipped-page education events: ${result.shippedEvents}`);
  print(`  strictness probes: ${Object.entries(result.probes).map(([name, probe]) => `${name} ${probe.status} ${probe.reason || ''}`.trim()).join('; ')}`);
  print(`  non-local requests aborted: ${result.external.length} (${[...new Set(result.external.map(url => new URL(url).host))].join(', ') || 'none'}); unmocked /api calls: ${[...new Set(result.otherApi)].join(', ') || 'none'}; page errors: ${result.errors.length}`);
};
const verdicts = result => NINE.map(name => {
  const items = result.sent.filter(item => item.payload.event === name);
  return { name, sent: items.length > 0, accepted: items.length > 0 && items.every(item => item.status === 202), rejected: items.length > 0 && items.every(item => item.status === 400 && item.reply.includes('EVENT_NOT_ALLOWED')) };
});
const noLeak = result => !result.external.some(url => /goflipforge|netlify/i.test(url)) && result.external.length === 0;

const baselineIndex = process.argv.indexOf('--baseline');
if (baselineIndex > 0) {
  const baseline = await run(resolve(process.argv[baselineIndex + 1]), 'baseline');
  table(baseline);
  const v = verdicts(baseline);
  check(`baseline: all nine events are sent by the app (${v.filter(x => x.sent).length}/9)`, v.every(x => x.sent));
  check(`baseline: all nine are rejected with 400 EVENT_NOT_ALLOWED (${v.filter(x => x.rejected).length}/9)`, v.every(x => x.rejected));
  check('baseline: the rejected events carried a raw page path', baseline.sent.filter(item => NINE.includes(item.payload.event)).every(item => String(item.payload.page).startsWith('/')));
  check('baseline: nothing reached a FlipForge or Netlify host (all non-local requests aborted)', noLeak(baseline), baseline.external.join(', '));
}

const result = await run(process.cwd(), 'this checkout');
table(result);
const v = verdicts(result);
const nine = result.sent.filter(item => NINE.includes(item.payload.event));
check('UI: first-use Home, returning Home with four destinations, and the forced education layer all rendered',
  result.ui.firstUsePanel && result.ui.returningPanel && same(result.ui.returningLinks, ['saved', 'outcomes', 'heat', 'portfolio']) && result.ui.forcedEducation, JSON.stringify(result.ui));
check(`all nine events are sent (${v.filter(x => x.sent).length}/9)`, v.every(x => x.sent), v.filter(x => !x.sent).map(x => x.name).join(', '));
check(`all nine are accepted with 202 (${v.filter(x => x.accepted).length}/9)`, v.every(x => x.accepted), v.filter(x => !x.accepted).map(x => x.name).join(', '));
check('every app conversion request in this run returns 2xx (no 400)', result.sent.length > 0 && result.sent.every(item => item.status >= 200 && item.status < 300));
check('every one of the nine is sent with the fixed page "beta-app"', nine.every(item => item.payload.page === 'beta-app'));
check('no raw page path, URL, query string, card name or card id is sent', result.sent.every(item => !String(item.payload.page || '').includes('/')
  && !/https?:|\/app\/|saas-prototype|[?#]|utm_|Wander|Franco|BCP1|qa-in-app/i.test(item.raw)));
check('the nine send only event, page and placement', nine.every(item => same(Object.keys(item.payload).sort(), ['event', 'page', 'placement'])));
check('every placement sent is one of the fixed set', nine.every(item => ['dashboard_zero_saved', 'dashboard_saved', 'dashboard', 'returning_saved', 'returning_outcomes',
  'returning_heat', 'returning_portfolio', 'result_education', 'saved_decision_detail'].includes(item.payload.placement)));
check('the saved verdict (BUY) is not sent as a placement', result.sent.every(item => !/\b(buy|watch|verify|pass)\b/i.test(String(item.payload.placement))));
check('returning destinations are each recorded once under their own placement', same(nine.filter(item => item.payload.event === 'phase3_returning_action_clicked').map(item => item.payload.placement).sort(),
  ['returning_heat', 'returning_outcomes', 'returning_portfolio', 'returning_saved']));
check('stored records and the event log hold only event, page, placement, campaign and time', result.storedEvents.length === result.sent.length
  && result.storedEvents.every(record => same(Object.keys(record), ['type', 'schemaVersion', 'event', 'page', 'placement', 'campaign', 'occurredAt']) && record.campaign === null)
  && result.eventLog.length === result.sent.length);
check('as shipped, the saved-decision page shows the CDI Signal Stack and sends none of the five education events', result.ui.shippedStack && !result.ui.shippedEducation && result.shippedEvents === 0);
check('the server still rejects a raw path, a verdict placement, an unmapped destination, an unlisted event and a lookalike name',
  Object.values(result.probes).every(probe => probe.status === 400 && probe.reason === 'EVENT_NOT_ALLOWED') && result.storedAfterProbes === result.sent.length, JSON.stringify(result.probes));
check('no page errors', result.errors.length === 0, result.errors.join(' | '));
check('nothing was sent to a FlipForge or Netlify host (all non-local requests aborted)', noLeak(result), result.external.join(', '));

print(`PASSED: ${passed}`);
print(`FAILED: ${failures.length}`);
if (failures.length) process.exit(1);
