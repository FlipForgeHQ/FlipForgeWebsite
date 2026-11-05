// Real-browser end-to-end test: real customer actions in the Private Beta workspace and a campaign-link application
// produce accepted AND reportable events - each one counted in the private founder report (operator-beta.html).
//
// What runs, all on this machine:
//   - This checkout is copied to a temp folder and built with the production build steps (scripts/build-identity-client.mjs,
//     inject-discovery-request-guard.mjs, inject-beta-invite-terms-gate.mjs, build-app-css-bundle.mjs; CONTEXT=production),
//     so /app/beta is the page production serves: commercial-dashboard-v2.js and decision-dashboard-v3.js are injected
//     by the build, staging diagnostics are stripped.
//   - It is served as goflipforge.com (mapped to 127.0.0.1 inside Chromium), with /app/beta/* -> saas-prototype/* as in
//     _redirects. /api/conversion-event, /api/beta/applications and /api/beta/operator are this checkout's own Netlify
//     handler modules with in-memory Blobs. /api/v1/* is SYNTHETIC backend data (labelled QA_FIXTURE; no real customer,
//     card or price). Identity is a stub: a signed-in invited tester in the app, a flipforge-operator on the operator page.
//   - Every request that is not to this local server is aborted and counted. Nothing reaches production, Netlify, Blobs,
//     Identity, the backend or a mailbox.
//
//   node scripts/audit-in-app-events-e2e.mjs                    # this checkout must pass
//   node scripts/audit-in-app-events-e2e.mjs --baseline <dir>   # also show what <dir> (the code before) records
// Optional: FLIPFORGE_E2E_NODE_MODULES=<dir> when the checkout has no node_modules; FLIPFORGE_E2E_SCREENSHOT=<png path>.
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
const TESTER = 'in-app-events-tester@example.test';
const OPERATOR = 'in-app-events-operator@example.test';
const CAMPAIGN = { source: 'instagram', medium: 'social', campaign: 'wysbi26', content: 'w02v01' };
const LANDING = '/?utm_source=instagram&utm_medium=social&utm_campaign=wysbi26&utm_content=w02v01';
const INVALID_LANDING = '/?utm_source=Instagram&utm_medium=social%20ads&utm_campaign=person%40example.test&utm_content=w02v01';

// ---------- synthetic backend (QA_FIXTURE) ----------
const QUERY = '2018 Topps Chrome Shohei Ohtani #150 PSA 9';
const CARD_ID = 'EBAY-QA-OHTANI-150';
const LISTING_URL = 'https://www.ebay.com/itm/900000000001';
// A second saved decision: VERIFY with a Max Buy recorded on its receipt. Since #622 no VERIFY shows a buying limit; its
// values are synthetic and must never reach telemetry.
const VERIFY_ID = 'EBAY-QA-HERBERT-325';
const VERIFY_TITLE = '2020 Panini Prizm Justin Herbert #325 PSA 10';
// Everything a privacy scan must never find in a stored event or in the founder report.
const FORBIDDEN = [/ohtani/i, /topps/i, /#150/, /PSA 9/i, /ebay\.com/i, /900000000001/, /QA-OHTANI/i, /75995/, /759\.95/, /85000/, /\b850\b/,
  /herbert/i, /prizm/i, /#325/, /QA-HERBERT/i, /PSA 10/i, /64000/, /\b640\b/, /70000/, /\b700\b/, /max\s*-?\s*buy/i, /maximumBuy/i, /buying limit/i, /supportedValue/i,
  /\b(buy|watch|verify|pass)\b/i, /@example\.test/i, /Attribution Test/i, /Not a real applicant/i];
const envelope = (cid, data) => ({ meta: { contractVersion: '1.0', engineVersion: 'in-app-events-audit', authority: 'Smart Opportunity',
  gradingAuthority: 'Existing PSA intelligence', correlationId: cid, generatedAt: '2026-11-05T17:00:00Z', evidenceFreshness: 'QA_FIXTURE',
  limitations: ['Synthetic in-app events audit fixture only.'] }, data });
const listing = () => ({ rank: 1, matchQuality: 'EXACT_MATCH', evaluationEligible: true, evaluationBlockReason: '', activeListingOnly: true,
  completedSaleEvidence: false, transactionAuthority: false, title: `${QUERY} QA exact listing`, cardIdentityQuery: QUERY,
  providerDisplayName: 'Authorized QA Marketplace', marketplace: 'EBAY', listingUrl: LISTING_URL, listingAvailability: 'AVAILABLE',
  listingFreshness: 'CURRENT', allInAskCents: 75995, allInCostComplete: true, discoveryScore: 80, discoveryLabel: 'BEST_CONNECTED_CANDIDATE',
  sellerFeedbackScore: 5000, condition: 'Graded', listingFormat: 'FIXED_PRICE', pricePosition: 'QA price context only',
  nextAction: 'Verify the listing before evaluation.', rankingExplanation: 'Synthetic ranking explanation.',
  rankingFactors: { identity: 100, completeness: 100, availability: 100, source: 100, freshness: 100 },
  evidence: { trustedExactCompletedSaleCount: 3, supported: true, trustedEvidenceValueCents: 85000, calibratedConfidence: 80, risk: 20 },
  evaluationRequest: { externalListingId: 'QA-OHTANI-150', marketplace: 'EBAY', cardIdentity: QUERY, listingUrl: LISTING_URL, seller: 'QA Seller',
    itemPriceCents: 75995, shippingCents: 0, buyerPremiumCents: 0, taxCents: 0, listingFormat: 'FIXED_PRICE' } });
const discover = () => ({ kind: 'discover', readOnly: true, query: QUERY, requestedLimit: 25, targetMaxBuyCents: 0, discoveryPersisted: false,
  evaluationRequiredToSave: true, activeListingsAreCompletedSaleEvidence: false, transactionAuthority: false, tenantOwnedPersistenceCreated: false,
  tenantOwnershipCreatedOnlyByEvaluation: true, tenantIsolation: { enforced: true, defaultAccess: 'DENY' },
  provider: { id: 'QA_AUTHORIZED', name: 'Authorized QA Marketplace', available: true, status: 'QA connector available.', providerCredentialsExposed: false, customerCanConfigureProvider: false },
  candidateCount: 1, exactCandidateCount: 1, identityReviewCandidateCount: 0, evidenceSupportedCount: 1, evidenceSupportedBestAvailable: true,
  coverageSummary: 'Synthetic exact result.', items: [listing()] });
const evaluation = requestId => ({ kind: 'evaluation', requestId, opportunityId: CARD_ID, persistedToSqlite: true, tenantOwned: true, quotaEnforced: true,
  requestCanVerifyEvidence: false, requestCanVerifyIdentity: false, evidenceAcceptedByRequest: false, psaRecalculated: false, transactionAuthorized: false,
  providerCredentialsExposed: false, idempotentReplay: false, decision: { recommendation: 'WATCH', supportedValueCents: 85000, exactTrustedCompCount: 3, confidence: 80, risk: 70 },
  normalizedRequest: { allInAskCents: 75995 }, tenantIsolation: { enforced: true, idempotencyScope: 'TENANT', opportunityOwnership: 'GRANTED_ON_COMPLETION', defaultAccess: 'DENY' } });
const opportunity = () => ({ id: CARD_ID, title: QUERY, cardIdentity: QUERY, recommendation: 'WATCH', ask: 759.95, supportedValue: 850, supportedValueCents: 85000,
  confidence: 80, liquidity: 70, risk: 70, rank: 70, observedAt: '2026-11-05T16:00:00Z', platform: 'EBAY', mappingState: 'CONFIRMED',
  recommendationSource: 'GOVERNED_SNAPSHOT', evidenceProvenanceStatus: 'CURRENT_EVIDENCE_RULES', evidence: { acceptedSales: 3 },
  governedDecision: { available: true, recommendation: 'WATCH', confidence: 80, risk: 70, reason: 'WATCH: synthetic saved reason.', evaluatedAt: '2026-11-05T16:00:00Z',
    supportedValueCents: 85000, supportedValueStatus: 'ESTABLISHED', maximumBuyPriceCents: 70000, allInAskCents: 75995, exactTrustedCompCount: 3,
    snapshotCount: 1, immutable: true, transactionAuthority: false } });

const verifyOpportunity = () => ({ ...opportunity(), id: VERIFY_ID, title: VERIFY_TITLE, cardIdentity: VERIFY_TITLE, recommendation: 'VERIFY', ask: 610, supportedValue: 640,
  supportedValueCents: 64000, mappingState: 'NOT_CONFIRMED', governedDecision: { ...opportunity().governedDecision, recommendation: 'VERIFY', reason: 'VERIFY: synthetic saved reason.',
    supportedValueCents: 64000, maximumBuyPriceCents: 64000, allInAskCents: 61000 } });

function api(pathname, method, saved, cid, unmocked, idempotencyKey) {
  const items = saved.value ? [opportunity(), verifyOpportunity()] : [];
  if (pathname === '/api/v1/evaluations' && method === 'POST') { saved.value = true; return [200, envelope(cid, evaluation(idempotencyKey))]; }
  if (pathname === '/api/v1/discover') return [200, envelope(cid, discover())];
  if (method !== 'GET') return [405, { error: { code: 'QA_READ_ONLY', message: 'No other writes.', correlationId: cid } }];
  if (pathname === '/api/v1/health') return [200, envelope(cid, { status: 'configured', bridgeEnabled: true })];
  if (pathname === '/api/v1/entitlements') return [200, envelope(cid, { kind: 'entitlements', readOnly: true, membershipActive: true,
    current: { code: 'PRIVATE_BETA', accessState: 'PRIVATE_BETA_ACTIVE', evaluationAllowanceScope: 'PRIVATE_BETA_LIFETIME', effectiveEvaluationLimit: 50 },
    plan: { code: 'PRIVATE_BETA' }, usage: { evaluationAllowanceScope: 'PRIVATE_BETA_LIFETIME', completedEvaluations: items.length, inProgressReservations: 0,
      admissionUsage: items.length, evaluationAllowanceLimit: 50, remainingEvaluations: 50 - items.length, evaluationAllowedNow: true } })];
  // governedDecisionReadModelVersion: the G1 read-model marker Dashboard V3 requires before it keeps the Home route.
  if (pathname === '/api/v1/dashboard') return [200, envelope(cid, { kind: 'dashboard', readOnly: true, source: 'SQLite saved governed records', governedDecisionReadModelVersion: 'governed-decision-read-v1',
    metrics: { trackedOpportunities: items.length, evidenceReady: items.length, populationContextAvailable: 0, needsVerification: 0 }, opportunities: items, items })];
  if (pathname === '/api/v1/opportunities') return [200, envelope(cid, { kind: 'opportunities', items, count: items.length, sourceOfTruth: 'SQLite', transactionAuthority: false, governedDecisionReadModelVersion: 'governed-decision-read-v1' })];
  if (pathname === '/api/v1/lifecycle') return [200, envelope(cid, { kind: 'lifecycle', sourceOfTruth: 'SQLite', items: [], transactionAuthority: false })];
  if (saved.value && pathname === `/api/v1/opportunities/${CARD_ID}`) return [200, envelope(cid, { kind: 'opportunity-detail', opportunity: opportunity(), sourceOfTruth: 'SQLite', transactionAuthority: false })];
  if (saved.value && pathname === `/api/v1/evidence/${CARD_ID}`) return [200, envelope(cid, { kind: 'evidence', readOnly: true, opportunityId: CARD_ID, cardIdentity: QUERY,
    acceptedExactCompletedSales: 3, visibleButAuthorityIneligible: 0, linkedEvidence: [], manualCandidates: [], timeline: [], transactionAuthority: false,
    decisionTime: { available: true, evaluatedAt: '2026-11-05T16:00:00Z', recommendation: 'WATCH', askPrice: 759.95, supportedValue: 850, salesCountAtDecision: 3, immutable: true } })];
  unmocked.add(pathname);
  return [404, { error: { code: 'QA_NOT_MOCKED', message: pathname, correlationId: cid } }];
}

function memoryStore() {
  const data = new Map();
  return { data,
    async setJSON(key, value, { onlyIfNew, onlyIfMatch } = {}) {
      if (onlyIfNew && data.has(key)) return { modified: false };
      if (onlyIfMatch && (!data.has(key) || onlyIfMatch !== key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true, etag: key };
    },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: key } : null; },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async *list({ prefix = '' } = {}) { yield { blobs: [...data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
    async delete(key) { data.delete(key); } };
}

const logLines = [];
const print = console.log.bind(console);
console.log = (...args) => {
  const line = String(args[0] ?? '');
  if (args.length === 1 && line.startsWith('{"type":"flipforge_')) logLines.push(line);
  else print(...args);
};

// Build a production copy of <root> in a temp folder (the same build steps Netlify runs for the app and operator page).
function productionCopy(root) {
  const target = mkdtempSync(join(tmpdir(), 'ff-in-app-e2e-'));
  cpSync(root, target, { recursive: true, filter: source => !/^(?:\.git|node_modules|artifacts)(?:[\\/]|$)/.test(relative(root, source)) });
  const modules = [process.env.FLIPFORGE_E2E_NODE_MODULES, join(root, 'node_modules'), join(process.cwd(), 'node_modules')].find(dir => dir && existsSync(dir));
  if (!modules) throw new Error('node_modules not found: run npm ci or set FLIPFORGE_E2E_NODE_MODULES');
  symlinkSync(resolve(modules), join(target, 'node_modules'), 'dir');
  for (const step of ['build-identity-client.mjs', 'inject-discovery-request-guard.mjs', 'inject-beta-invite-terms-gate.mjs', 'build-app-css-bundle.mjs']) {
    if (!existsSync(join(target, 'scripts', step))) continue;
    const run = spawnSync(process.execPath, [join('scripts', step)], { cwd: target, env: { ...process.env, CONTEXT: 'production' }, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`Build step ${step} failed in ${target}: ${run.stderr || run.stdout}`);
  }
  return target;
}

async function run(sourceRoot, label) {
  const root = productionCopy(sourceRoot);
  const fn = name => import(pathToFileURL(join(root, 'netlify/modern-functions', name)));
  const [conversion, applications, operator] = await Promise.all([fn('conversion-event.mjs'), fn('beta-applications.mjs'), fn('beta-operator.mjs')]);
  const eventStore = memoryStore();
  const applicationStore = memoryStore();
  const handlers = {
    '/api/conversion-event': conversion.createConversionEventHandler({ store: eventStore }),
    '/api/beta/applications': applications.createBetaApplicationsHandler({ store: applicationStore }),
    '/api/beta/operator': operator.createBetaOperatorHandler({ applicationStore, eventStore, feedbackStore: memoryStore(),
      getUserFn: async () => ({ id: 'operator-test', email: OPERATOR, app_metadata: { roles: ['flipforge-operator'] } }),
      identityAdmin: { listUsers: async () => [] },
      inviteIdentity: async () => { throw new Error('IDENTITY_NOT_AVAILABLE_IN_TEST'); }, admissionClient: {} }),
  };
  const sent = [];
  const otherApi = new Set();
  const unmocked = new Set();
  const saved = { value: false };
  let identity = 'tester';
  let uninstrumented = false;
  let pending = 0;
  let lastActivity = Date.now();
  logLines.length = 0;

  const server = createServer(async (req, res) => {
    pending++; lastActivity = Date.now();
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (handlers[url.pathname]) {
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['connection', 'keep-alive', 'transfer-encoding'].includes(key)));
        const response = await handlers[url.pathname](new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: body.length ? body : undefined }));
        const text = await response.text();
        if (url.pathname === '/api/conversion-event') {
          let payload = {};
          try { payload = JSON.parse(body.toString('utf8')); } catch { /* kept raw */ }
          sent.push({ payload, raw: body.toString('utf8'), status: response.status, reply: text });
        }
        res.writeHead(response.status, Object.fromEntries(response.headers)).end(text);
        return;
      }
      if (url.pathname.startsWith('/api/v1/')) {
        if (process.env.FLIPFORGE_E2E_TRACE) process.stderr.write(`  api ${req.method} ${url.pathname}${url.search}\n`);
        const [status, json] = api(url.pathname, req.method, saved, req.headers['x-correlation-id'] || 'in-app-events-audit', unmocked, req.headers['idempotency-key'] || '');
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(json));
        return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) {
        if (url.pathname !== '/api/beta/founder-select') otherApi.add(url.pathname);
        res.writeHead(404).end(); return;
      }
      if (url.pathname === '/assets/js/flipforge-identity.js') {
        const email = identity === 'operator' ? OPERATOR : TESTER;
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`window.FlipForgeIdentity=Object.freeze({getUser:()=>({email:"${email}"}),getSnapshot:()=>({authenticated:true,email:"${email}",fullName:"In-app Events Audit",membershipActive:true,membershipConfigured:true,operatorActive:${identity === 'operator'}}),signOut:async()=>{},refresh:async()=>({authenticated:true,membershipActive:true,email:"${email}"}),noteServerMembership:()=>({authenticated:true,membershipActive:true}),getAccessToken:async()=>"t",open:()=>{}});`);
        return;
      }
      if (url.pathname === '/assets/js/flipforge-production-signin.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('(() => {})();'); return; }
      let rel = decodeURIComponent(url.pathname);
      let fallback = null;
      if (rel === '/app/beta' || rel === '/app/beta/') rel = '/saas-prototype/index.html';
      else if (rel.startsWith('/app/beta/')) { rel = '/saas-prototype/' + rel.slice('/app/beta/'.length); fallback = join(root, 'saas-prototype/index.html'); }
      if (uninstrumented && rel === '/saas-prototype/beta-session-v1.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(''); return; }
      let file = resolve(root, '.' + rel);
      if (!file.startsWith(resolve(root))) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      let content = await readFile(file).catch(() => null);
      if (!content && fallback) { file = fallback; content = await readFile(file).catch(() => null); }
      if (!content) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
    } finally { pending--; lastActivity = Date.now(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  const base = `http://goflipforge.com:${port}`;
  const app = `${base}/app/beta/`;
  const settle = async (quiet = 700) => { for (let i = 0; i < 120 && (pending > 0 || Date.now() - lastActivity < quiet); i++) await new Promise(done => setTimeout(done, 100)); };

  const browser = await chromium.launch({ executablePath, args: [`--host-resolver-rules=MAP goflipforge.com 127.0.0.1`] });
  const external = [];
  const errors = [];
  const open = async (url, { width = 1440 } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(() => { try { localStorage.setItem('flipforge.privateBeta.onboarding.v1', 'complete'); localStorage.setItem('flipforge.guidedMode.enabled', 'false'); } catch (_) {} });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base + '/')) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(`${label}: ${e.message.slice(0, 160)}`));
    await page.goto(url, { waitUntil: 'load' });
    return { context, page };
  };
  const seen = (page, selector, timeout = 20000) => page.waitForSelector(selector, { timeout }).then(() => true).catch(() => false);
  const nav = async (page, route) => { await page.click(`#main-content ~ * a[data-route="${route}"], nav a[data-route="${route}"], a[data-route="${route}"]`).catch(() => {}); await settle(); };
  const ui = {};
  const started = Date.now();
  const step = name => { if (process.env.FLIPFORGE_E2E_TRACE) process.stderr.write(`[${label}] ${((Date.now() - started) / 1000).toFixed(1)}s ${name}\n`); };
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

  step('1. Campaign:');
  // 1. Campaign: tagged link -> Menu -> Product -> header "Request Beta Access" -> application.
  {
    const { context, page } = await open(base + LANDING);
    await settle();
    await page.click('.site-header .menu-toggle');
    await Promise.all([page.waitForURL('**/product.html'), page.click('#site-menu a[href="/product.html"]')]);
    await page.waitForLoadState('networkidle');
    await Promise.all([page.waitForURL('**/beta-application.html'), page.click('.site-header .nav-cta')]);
    await page.waitForLoadState('networkidle');
    await apply(page, 'attribution-test+campaign@example.test');
    await settle();
    await context.close();
  }
  step('1b. Invalid');
  // 1b. Invalid tags (wrong case, spaces, an email) -> hero CTA -> application: must end up "Not attributed".
  {
    const { context, page } = await open(base + INVALID_LANDING);
    await settle();
    await Promise.all([page.waitForURL('**/beta-application.html'), page.click('[data-ff-hero-apply]')]);
    await page.waitForLoadState('networkidle');
    await apply(page, 'attribution-test+invalid@example.test');
    await settle();
    await context.close();
  }
  step('1c. A forged');
  // 1c. A forged application with an unknown utm_source, straight to the function.
  const forgedApplication = (await fetch(`http://127.0.0.1:${port}/api/beta/applications`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ name: 'Attribution Test', email: 'attribution-test+forged@example.test', collector_type: 'Collector',
      experience: '1–3 years', monthly_card_volume: '1–5', hosted_web_beta_access: 'Occasionally',
      primary_use_case: 'Attribution test application. Not a real applicant.', tester_fit: 'Attribution test application. Not a real applicant.',
      testing_focus: 'Discover and search', beta_updates_consent: 'yes', beta_terms_accepted: 'yes',
      utm_source: 'myspace', utm_medium: 'social', utm_campaign: 'wysbi26' }) })).status;
  await settle();
  const publicSent = sent.length;

  step('2. First use');
  // 2. First use, one browser tab: Home with nothing saved ("Start here") -> "Evaluate a card" -> Discover search -> Evaluate ->
  //    saved decision (CDI Signal Stack) -> See why -> Open Decision Receipt -> Understand this decision (Evidence) ->
  //    Tracking, Alerts, Portfolio, Forge Heat from the side navigation.
  saved.value = false;
  {
    const { context, page } = await open(`${app}#/dashboard`);
    ui.firstUseHome = await seen(page, '#main-content [data-commercial-dashboard-v2][data-flipforge-phase3-enhanced="dashboard:first-use"] [data-ffguided-home] .ffguided-home-cta');
    await settle();
    await page.click('#main-content .ffguided-home-cta').catch(() => {});
    const input = page.locator('#main-content [data-customer-discovery-form] input[name="exactCardQuery"]');
    ui.discover = await input.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    await input.fill(QUERY).catch(() => {});
    await page.locator('#main-content [data-customer-discovery-form]').evaluate(form => form.requestSubmit()).catch(() => {});
    const evaluate = page.locator('#main-content [data-discovery-evaluate]').first();
    await evaluate.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (process.env.FLIPFORGE_E2E_TRACE) step('discover: ' + JSON.stringify(await page.evaluate(() => ({ hash: location.hash, evaluate: document.querySelectorAll('#main-content [data-discovery-evaluate]').length,
      forms: [...document.querySelectorAll('#main-content form')].map(f => (f.getAttribute('class') || '') + ':' + [...f.elements].map(e => e.name).join(',')),
      text: (document.querySelector('#main-content')?.innerText || '').replace(/\s+/g, ' ').slice(0, 700) }))));
    await evaluate.click({ timeout: 5000 }).catch(() => {});
    ui.savedDecision = await page.waitForFunction(id => location.hash === `#/opportunities/${id}`, CARD_ID, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!ui.savedDecision && process.env.FLIPFORGE_E2E_TRACE) step('after evaluate: ' + JSON.stringify(await page.evaluate(() => ({ href: location.href, text: (document.querySelector('#main-content')?.innerText || '').replace(/\s+/g, ' ').slice(0, 900) }))));
    ui.signalStack = await seen(page, '#main-content [data-ff-cdi-stack] [data-ff-cdi-start]');
    await settle();
    await page.click('#main-content [data-ff-cdi-start]').catch(() => {});
    ui.receiptControl = await seen(page, '#main-content [data-ff-cdi-after]:not([hidden]) [data-ff-cdi-receipt]', 10000);
    await page.click('#main-content [data-ff-cdi-receipt]').catch(() => {});
    await settle();
    ui.understand = await seen(page, '#main-content [data-ff-show-why]', 5000);
    await page.click('#main-content [data-ff-show-why]').catch(() => {});
    ui.evidence = await page.waitForFunction(id => location.hash === `#/evidence/${id}`, CARD_ID, { timeout: 10000 }).then(() => true).catch(() => false);
    await settle();
    step('ui so far ' + JSON.stringify(ui));
    for (const route of ['tracking', 'alerts', 'portfolio', 'forge-heat']) { await nav(page, route); step('nav ' + route + ' -> ' + await page.evaluate(() => location.hash)); }
    ui.routesVisited = await page.evaluate(() => location.hash);
    await context.close();
  }
  step('3. Returning use');
  // 3. Returning use, a new browser tab with one saved decision: Home -> "Saved Decisions" (Start here panel) -> back ->
  //    "Show full dashboard" -> Outcome Intelligence, Forge Heat and Portfolio shortcuts (Home is re-opened each time).
  {
    const { context, page } = await open(`${app}#/dashboard`);
    const homeReady = () => seen(page, '#main-content [data-commercial-dashboard-v2][data-flipforge-phase3-enhanced="dashboard:returning"] [data-ffguided-home]', 15000);
    const backHome = async () => { await page.click('a[data-route="dashboard"]').catch(() => {}); await settle(); return homeReady(); };
    ui.returningHome = await homeReady();
    await settle();
    ui.homeShortcuts = [];
    await page.click('#main-content .ffguided-home-footer a[href="#/opportunities"]').catch(() => {});
    await settle();
    if (await page.evaluate(() => location.hash === '#/opportunities')) ui.homeShortcuts.push('saved');
    for (const key of ['outcomes', 'heat', 'portfolio']) {
      if (!await backHome()) continue;
      await page.click('#main-content [data-ffguided-more]').catch(() => {});
      if (!await seen(page, `#main-content [data-ff-p3-return="${key}"]`, 10000)) continue;
      await page.click(`#main-content [data-ff-p3-return="${key}"]`).catch(() => {});
      await settle();
      ui.homeShortcuts.push(key);
    }
    await context.close();
  }
  // 3b. Dashboard V3 (flag-only in production: ?dashboard=v3), new tab: V3 claims Home, so no Home event is sent;
  //     the side navigation to Portfolio is still counted.
  {
    const v3Start = sent.length;
    const { context, page } = await open(`${app}?dashboard=v3#/dashboard`);
    ui.dashboardV3 = await seen(page, '#main-content [data-decision-dashboard-v3][data-ffv3-state="ready"], #main-content [data-decision-dashboard-v3]:not([data-ffv3-state="loading"])', 15000);
    await settle();
    ui.dashboardV3Kept = await page.evaluate(() => Boolean(document.querySelector('#main-content [data-decision-dashboard-v3]')) && !document.querySelector('#main-content [data-commercial-dashboard-v2]'));
    ui.v3PortfolioLinkVisible = await page.locator('a[data-route="portfolio"]').first().isVisible().catch(() => false);
    ui.v3HomeEvents = sent.slice(v3Start).map(item => item.payload.event);
    const clickedAt = Date.now();
    await nav(page, 'portfolio');
    ui.v3HashAfterNav = await page.evaluate(() => location.hash);
    for (let i = 0; i < 150 && !sent.slice(v3Start).some(item => item.payload.event === 'portfolio_viewed'); i++) await new Promise(done => setTimeout(done, 100));
    ui.v3PortfolioLatencyMs = Date.now() - clickedAt;
    const pingStart = Date.now();
    await page.evaluate(() => 1);
    ui.v3PageRoundTripMs = Date.now() - pingStart;
    ui.v3AfterPortfolio = sent.slice(v3Start).map(item => item.payload.event);
    await context.close();
  }
  await settle();
  const appSent = sent.slice(publicSent);

  step('4. Founder report');
  // 4. Founder report in the operator workspace (stubbed operator identity, real /api/beta/operator handler).
  identity = 'operator';
  let founder = { present: false };
  {
    const { context, page } = await open(`${base}/operator-beta.html`);
    const present = await seen(page, '[data-founder-report] [data-founder-features] tbody tr', 20000);
    if (present) {
      founder = await page.evaluate(() => {
        const panel = document.querySelector('[data-founder-report]');
        const table = selector => [...panel.querySelectorAll(`${selector} tbody tr`)].map(row => [...row.children].map(cell => cell.textContent.trim()));
        const steps = selector => [...panel.querySelectorAll(`${selector} .ff-funnel-step`)].map(step => [step.querySelector('span')?.textContent.trim(), Number(step.querySelector('strong')?.textContent.trim())]);
        return { present: true, campaigns: table('[data-founder-campaigns]'), features: table('[data-founder-features]'), adoption: steps('[data-founder-adoption]'),
          workspace: steps('[data-founder-workspace]'), engagement: steps('[data-founder-engagement]'), asOf: panel.querySelector('[data-founder-report-asof]')?.textContent.trim(),
          text: panel.innerText };
      });
      const shot = process.env.FLIPFORGE_E2E_SCREENSHOT;
      if (shot && label === 'this checkout') {
        await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
        const box = await page.locator('[data-founder-report]').boundingBox();
        if (box) await page.screenshot({ path: shot, fullPage: true, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
      }
    }
    await context.close();
  }
  identity = 'tester';

  step('5. CDI Signal');
  const storedAtReport = [...eventStore.data.values()];
  // 5. CDI Signal Stack non-interference: the saved decision page with and without beta-session-v1.js (served empty).
  const stackState = async () => {
    const { context, page } = await open(`${app}#/opportunities/${CARD_ID}`);
    const ready = await seen(page, '#main-content [data-ff-cdi-stack] [data-ff-cdi-start]');
    await settle();
    const before = await page.locator('#main-content [data-ff-cdi-stack]').evaluate(node => node.outerHTML).catch(() => '');
    const beforeShot = await page.locator('#main-content [data-ff-cdi-stack]').screenshot({ animations: 'disabled' }).catch(() => null);
    await page.click('#main-content [data-ff-cdi-start]').catch(() => {});
    await seen(page, '#main-content [data-ff-cdi-after]:not([hidden])', 10000);
    await page.waitForTimeout(600);
    const after = await page.locator('#main-content [data-ff-cdi-stack]').evaluate(node => node.outerHTML).catch(() => '');
    const order = await page.evaluate(() => [...document.querySelectorAll('#main-content > * , #main-content .page > *')].map(node => node.className || node.tagName).join('|'));
    await context.close();
    return { ready, before, after, order, beforeShot };
  };
  const instrumented = await stackState();
  uninstrumented = true;
  const bare = await stackState();
  uninstrumented = false;
  const stackSent = sent.length;

  step('6. Forged and');
  // 6. Forged and forbidden input straight to the event function.
  const probe = async body => {
    const response = await fetch(`http://127.0.0.1:${port}/api/conversion-event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, reason: (await response.json()).reason || null };
  };
  const probes = {
    extraFields: await probe({ event: 'portfolio_viewed', page: 'beta-app', placement: 'workflow', card: QUERY, listingUrl: LISTING_URL, price: 759.95,
      recommendation: 'WATCH', email: 'attribution-test@example.test', note: 'Attribution Test free text' }),
    verdictPlacement: await probe({ event: 'evaluation_completed', page: 'beta-app', placement: 'watch' }),
    rawPath: await probe({ event: 'portfolio_viewed', page: '/app/beta/', placement: 'workflow' }),
    cardPage: await probe({ event: 'portfolio_viewed', page: CARD_ID, placement: 'workflow' }),
    retiredPhase3: await probe({ event: 'phase3_first_use_shown', page: 'beta-app', placement: 'workflow' }),
    lookalike: await probe({ event: 'portfolio_viewed_x', page: 'beta-app', placement: 'workflow' }),
    unmappedShortcut: await probe({ event: 'home_shortcut_clicked', page: 'beta-app', placement: 'saved' }),
  };

  await browser.close();
  await new Promise(done => server.close(done));
  rmSync(root, { recursive: true, force: true });
  return { label, sourceRoot, sent, publicSent, appSent, stackSent, external, otherApi: [...otherApi], unmocked: [...unmocked], errors, ui, founder,
    instrumented, bare, probes, forgedApplication, storedAtReport,
    storedEvents: [...eventStore.data.values()], applications: [...applicationStore.data.entries()].filter(([key]) => key.startsWith('application/')).map(([, value]) => value),
    logs: logLines.slice() };
}

// ---------- checks ----------
const failures = [];
let passed = 0;
const check = (label, condition, detail = '') => { if (condition) passed++; else failures.push(label); print(`${condition ? 'PASS' : 'FAIL'} | ${label}${detail && !condition ? ` [${String(detail).slice(0, 600)}]` : ''}`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// What the actions above must produce, per activity (first-use tab + returning tab).
const EXPECTED = {
  home_first_use_viewed: 1, home_evaluate_clicked: 1, evaluation_started: 1, evaluation_completed: 1, decision_saved: 1,
  home_returning_viewed: 1, home_shortcut_clicked: 4, decision_checks_viewed: 1, decision_explanation_viewed: 1,
  decision_receipt_opened: 1, evidence_viewed: 1, tracking_viewed: 2, portfolio_viewed: 3, alerts_viewed: 1, forge_heat_viewed: 2,
};
const LABELS = {
  home_first_use_viewed: 'First use: Home with no saved decisions', home_evaluate_clicked: 'Home: Evaluate a card clicked',
  evaluation_started: 'Evaluation started', evaluation_completed: 'Evaluation completed', decision_saved: 'Decision saved',
  home_returning_viewed: 'Returning use: Home with saved decisions', home_shortcut_clicked: 'Home shortcut opened',
  decision_checks_viewed: 'Decision checks viewed (See why)', decision_explanation_viewed: 'Understand this decision opened',
  decision_receipt_opened: 'Decision Receipt opened', evidence_viewed: 'Evidence viewed', tracking_viewed: 'Tracking viewed',
  portfolio_viewed: 'Portfolio viewed', alerts_viewed: 'Alerts viewed', forge_heat_viewed: 'Forge Heat viewed',
};
const summary = result => {
  print(`\n[${result.label}] ${result.sourceRoot} (production build copy)`);
  const names = [...new Set(result.appSent.map(item => item.payload.event))];
  print('  in-app requests from the customer actions (status x count, page, placements):');
  for (const name of names) {
    const items = result.appSent.filter(item => item.payload.event === name);
    const statuses = [...new Set(items.map(item => `${item.status}${item.status === 400 ? ' ' + (JSON.parse(item.reply || '{}').reason || '') : ''}`))].join('/');
    print(`    ${name.padEnd(38)} ${String(items.length).padStart(2)} x ${statuses.padEnd(22)} page=${[...new Set(items.map(item => item.payload.page))].join(',')} placement=${[...new Set(items.map(item => item.payload.placement))].join(',')}`);
  }
  print(`  public requests: ${result.publicSent} (${result.sent.slice(0, result.publicSent).filter(item => item.status === 202).length} accepted)`);
  print(`  founder report on operator page: ${result.founder.present ? 'present' : 'absent'}`);
  if (result.founder.present) {
    print(`    ${result.founder.asOf}`);
    for (const row of result.founder.campaigns) print(`    campaign  ${row.join(' | ')}`);
    print(`    adoption  ${result.founder.adoption.map(([name, value]) => `${name}: ${value}`).join('; ')}`);
    print(`    workspace ${result.founder.workspace.map(([name, value]) => `${name}: ${value}`).join('; ')}`);
    print(`    engagement ${result.founder.engagement.map(([name, value]) => `${name}: ${value}`).join('; ')}`);
    for (const row of result.founder.features) print(`    feature   ${row.join(' | ')}`);
  }
  print(`  UI reached: ${JSON.stringify(result.ui)}`);
  print(`  probes: ${Object.entries(result.probes).map(([name, value]) => `${name}=${value.status}${value.reason ? ' ' + value.reason : ''}`).join('; ')}`);
  print(`  non-local requests aborted: ${result.external.length} (${[...new Set(result.external.map(url => new URL(url).host))].join(', ') || 'none'}); unknown /api: ${result.otherApi.join(', ') || 'none'}; synthetic /api/v1 not mocked: ${result.unmocked.join(', ') || 'none'}; page errors: ${result.errors.length}`);
};

const baselineIndex = process.argv.indexOf('--baseline');
let baseline = null;
if (baselineIndex > 0) {
  baseline = await run(resolve(process.argv[baselineIndex + 1]), 'baseline');
  summary(baseline);
  const rejected = baseline.appSent.filter(item => item.status === 400);
  check(`baseline: the same customer actions get ${rejected.length} in-app 400 EVENT_NOT_ALLOWED responses`, rejected.length > 0 && rejected.every(item => item.reply.includes('EVENT_NOT_ALLOWED')));
  check('baseline: Receipt, Portfolio, Alerts and Forge Heat use is not recorded at all', !baseline.storedEvents.some(record => ['decision_receipt_opened', 'portfolio_viewed', 'alerts_viewed', 'forge_heat_viewed'].includes(record.event)));
  check('baseline: the operator page has no founder report', !baseline.founder.present);
  check('baseline: nothing reached a non-local host', baseline.external.length === 0, baseline.external.join(', '));
}

const result = await run(process.cwd(), 'this checkout');
summary(result);
const stored = result.storedEvents;
const inApp = result.storedAtReport.filter(record => record.page === 'beta-app');
const countOf = name => inApp.filter(record => record.event === name).length;
check('UI: every customer step was reached with real clicks (first-use Home, Discover, Evaluate, saved decision with Signal Stack, Receipt, Evidence, returning Home + 4 shortcuts)',
  ['firstUseHome', 'discover', 'savedDecision', 'signalStack', 'receiptControl', 'understand', 'evidence', 'returningHome'].every(key => result.ui[key] === true)
  && same(result.ui.homeShortcuts, ['saved', 'outcomes', 'heat', 'portfolio']) && result.ui.routesVisited === '#/forge-heat', JSON.stringify(result.ui));
check('Dashboard V3 (flag): V3 renders, sends no Home event, and Portfolio opened from its tab is still counted',
  result.ui.dashboardV3 === true && result.ui.dashboardV3Kept === true && same(result.ui.v3HomeEvents, []) && same(result.ui.v3AfterPortfolio, ['portfolio_viewed']), JSON.stringify([result.ui.dashboardV3, result.ui.v3HomeEvents, result.ui.v3AfterPortfolio]));
check('every request from the customer actions is accepted (202)', result.appSent.length > 0 && result.appSent.every(item => item.status === 202),
  result.appSent.filter(item => item.status !== 202).map(item => `${item.status} ${item.payload.event}`).join(', '));
check('every public request on the campaign journeys is accepted (202)', result.sent.slice(0, result.publicSent).every(item => item.status === 202));
for (const [name, expected] of Object.entries(EXPECTED)) {
  const row = result.founder.features?.find(cells => cells[0] === LABELS[name]);
  check(`${name}: ${expected} stored and founder report shows ${expected} (7 days) / ${expected} (30 days)`,
    countOf(name) === expected && row && row[1] === String(expected) && row[2] === String(expected), `stored ${countOf(name)}, row ${JSON.stringify(row)}`);
}
check('no in-app event outside the expected set was stored', inApp.every(record => Object.hasOwn(EXPECTED, record.event)), inApp.map(record => record.event).join(','));
const shortcutRows = Object.fromEntries((result.founder.features || []).filter(row => row[0].startsWith('Home shortcut: ')).map(row => [row[0], row[2]]));
check('founder report shows each Home shortcut once (Saved Decisions, Outcome Intelligence, Forge Heat, Portfolio)',
  same(shortcutRows, { 'Home shortcut: Saved Decisions': '1', 'Home shortcut: Outcome Intelligence': '1', 'Home shortcut: Forge Heat': '1', 'Home shortcut: Portfolio': '1' }), JSON.stringify(shortcutRows));
const campaignRow = result.founder.campaigns?.find(row => row[0] === 'instagram · social · wysbi26 · w02v01');
const unattributedRow = result.founder.campaigns?.find(row => row[0] === 'Not attributed');
check('founder report campaign table: instagram · social · wysbi26 · w02v01 has 1 application (all time and 30 days) and its Request Beta Access click',
  campaignRow && campaignRow[1] === '1' && campaignRow[2] === '1' && Number(campaignRow[3]) === stored.filter(record => record.event === 'beta_cta_clicked' && same(record.campaign, CAMPAIGN)).length && Number(campaignRow[3]) >= 1, JSON.stringify(campaignRow));
check('founder report campaign table: the invalid-tag and forged applications are "Not attributed" (2)', result.forgedApplication === 202 && unattributedRow && unattributedRow[1] === '2', JSON.stringify(unattributedRow));
check('stored applications: campaign kept for the tagged link, dropped for invalid and forged tags',
  same(result.applications.filter(item => item.campaign).map(item => item.campaign), [CAMPAIGN]) && result.applications.length === 3);
const adoption = Object.fromEntries(result.founder.adoption || []);
check('founder report adoption: 3 applications, 0 approved/invited/activated (no invitations in this test)', adoption.Applications === 3 && adoption['Approved or later'] === 0
  && adoption['Invitation sent'] === 0 && adoption['Activated (accepted invite and signed in)'] === 0, JSON.stringify(adoption));
const workspace = Object.fromEntries(result.founder.workspace || []);
check('founder report adoption: workspace first use 1, evaluations started 1, completed 1, saved 1, returning 1', same(workspace, {
  'First use: Home with no saved decisions': 1, 'Evaluation started': 1, 'Evaluation completed': 1, 'Decision saved': 1, 'Returning use: Home with saved decisions': 1 }), JSON.stringify(workspace));
const engagement = Object.fromEntries(result.founder.engagement || []);
const totalInApp = Object.values(EXPECTED).reduce((sum, value) => sum + value, 0);
check(`founder report engagement: ${totalInApp} workspace events in 7 and in 30 days, 3 applications in 7 and 30 days`, engagement['Workspace events, 7 days'] === totalInApp
  && engagement['Workspace events, 30 days'] === totalInApp && engagement['Applications, 7 days'] === 3 && engagement['Applications, 30 days'] === 3, JSON.stringify(engagement));
check('founder report time is shown in Eastern Time', /\bET\b/.test(result.founder.asOf || ''), result.founder.asOf);
check('every in-app event is sent as exactly { event, page: "beta-app", placement } with a fixed placement',
  result.appSent.every(item => same(Object.keys(item.payload).sort(), ['event', 'page', 'placement']) && item.payload.page === 'beta-app'
    && ['workflow', 'shortcut_saved', 'shortcut_outcomes', 'shortcut_heat', 'shortcut_portfolio'].includes(item.payload.placement)));
const scanTargets = [['stored event records', JSON.stringify(stored)], ['function log lines', result.logs.join('\n')], ['in-app request bodies', result.appSent.map(item => item.raw).join('\n')],
  ['founder report (rendered)', result.founder.text || '']];
const hits = scanTargets.flatMap(([where, text]) => FORBIDDEN.filter(pattern => pattern.test(text)).map(pattern => `${where}: ${pattern}`));
check('privacy scan: 0 hits for synthetic card names, listing URL/ids, prices, Max Buy words and values, verdict words, emails, names or free text in stored events, logs, request bodies and the founder report',
  hits.length === 0 && result.founder.text, hits.join('; '));
check('stored event records hold only type, schemaVersion, event, page, placement, campaign and time', stored.every(record => same(Object.keys(record), ['type', 'schemaVersion', 'event', 'page', 'placement', 'campaign', 'occurredAt'])));
check('forbidden extra fields on a valid event are never stored (accepted, stripped)', result.probes.extraFields.status === 202);
check('the server rejects a verdict placement, a raw path, a card id as page, a retired phase3 name, a lookalike name and an unmapped shortcut',
  ['verdictPlacement', 'rawPath', 'cardPage', 'retiredPhase3', 'lookalike', 'unmappedShortcut'].every(key => result.probes[key].status === 400 && result.probes[key].reason === 'EVENT_NOT_ALLOWED'), JSON.stringify(result.probes));
check('CDI Signal Stack: identical DOM with and without instrumentation, before and after "See why"',
  result.instrumented.ready && result.bare.ready && result.instrumented.before.length > 500 && result.instrumented.before === result.bare.before
  && result.instrumented.after === result.bare.after && result.instrumented.order === result.bare.order);
check('CDI Signal Stack: identical screenshot with and without instrumentation', result.instrumented.beforeShot && result.bare.beforeShot && result.instrumented.beforeShot.equals(result.bare.beforeShot));
check('no page errors', result.errors.length === 0, result.errors.join(' | '));
check('nothing was sent to any non-local host (FlipForge, Netlify, backend, fonts: all aborted, none attempted to production)',
  result.external.length === 0 && result.otherApi.length === 0, `${result.external.join(', ')} ${result.otherApi.join(', ')}`);

print(`PASSED: ${passed}`);
print(`FAILED: ${failures.length}`);
if (failures.length) process.exit(1);
