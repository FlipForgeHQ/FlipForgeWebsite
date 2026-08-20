import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const adapter = fs.readFileSync(path.join(root, 'saas-prototype/customer-discovery.js'), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function meta(correlationId) {
  return { contractVersion: '1.0', engineVersion: 'identity-assist-test', authority: 'Smart Opportunity', gradingAuthority: 'Existing PSA intelligence', correlationId };
}
function cardEnvelope(correlationId, data) {
  return { meta: meta(correlationId), data: {
    transactionAuthority: false,
    providerIdentifierExposed: false,
    rawProviderPayloadExposed: false,
    providerPayloadPersisted: false,
    soldEvidenceAccepted: false,
    smartOpportunityRecalculated: false,
    ...data
  }};
}
function discoverEnvelope(correlationId, candidateCount = 0) {
  const items = candidateCount ? [{
    rank: 1,
    discoveryScore: 90,
    discoveryLabel: 'BEST_CONNECTED_CANDIDATE',
    title: '2018 Topps Chrome Shohei Ohtani #150 PSA 9',
    listingUrl: 'https://example.test/listing',
    activeListingOnly: true,
    completedSaleEvidence: false,
    transactionAuthority: false,
    evaluationEligible: false,
    evidence: {}
  }] : [];
  return { meta: meta(correlationId), data: {
    kind: 'discover', readOnly: true, discoveryPersisted: false, evaluationRequiredToSave: true,
    activeListingsAreCompletedSaleEvidence: false, transactionAuthority: false,
    tenantOwnedPersistenceCreated: false, tenantOwnershipCreatedOnlyByEvaluation: true,
    tenantIsolation: { enforced: true, defaultAccess: 'DENY' },
    provider: { name: 'eBay Browse', available: true, status: 'CONNECTED', providerCredentialsExposed: false, customerCanConfigureProvider: false },
    candidateCount, evidenceSupportedCount: 0, coverageSummary: candidateCount ? '1 connected candidate' : 'No connected listing matched this search.', items
  }};
}

class FakeButton {
  constructor(dataset = {}) { this.dataset = dataset; this.handlers = {}; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  click() { this.handlers.click?.(); }
}
class FakeForm {
  constructor(values) { this.values = values; this.handlers = {}; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  submit() { this.handlers.submit?.({ preventDefault() {} }); }
}
class FakeFormData {
  constructor(form) { this.values = form.values; }
  get(name) { return this.values[name] ?? null; }
}
class FakeMain {
  constructor(values) {
    this.form = new FakeForm(values);
    this.html = '';
    this.findButton = null;
    this.identityButtons = [];
    this.evaluateButtons = [];
  }
  set innerHTML(value) {
    this.html = String(value);
    this.findButton = this.html.includes('data-discovery-find-exact') ? new FakeButton() : null;
    this.identityButtons = [...this.html.matchAll(/data-discovery-use-identity="(\d+)"/g)].map(match => new FakeButton({ discoveryUseIdentity: match[1] }));
    this.evaluateButtons = [...this.html.matchAll(/data-discovery-evaluate="(\d+)"/g)].map(match => new FakeButton({ discoveryEvaluate: match[1] }));
  }
  get innerHTML() { return this.html; }
  querySelector(selector) {
    if (selector === '[data-customer-discovery-form]') return this.form;
    if (selector === '[data-discovery-find-exact]') return this.findButton;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-discovery-use-identity]') return this.identityButtons;
    if (selector === '[data-discovery-evaluate]') return this.evaluateButtons;
    return [];
  }
}

function runtime(query, { hostname = 'goflipforge.com', pathname = '/app/', candidateCount = 0 } = {}) {
  const calls = [];
  let uuid = 0;
  const window = {
    location: { hostname, pathname, hash: '#/discover' },
    crypto: { randomUUID: () => `discover-${++uuid}` }
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    const correlationId = options.headers?.['X-Correlation-Id'];
    if (url === '/api/v1/health') return response({ meta: { contractVersion: '1.0', correlationId }, data: { status: 'configured' } });
    if (url === '/api/v1/card-intelligence/search') {
      return response(cardEnvelope(correlationId, { results: [{
        name: 'Shohei Ohtani', year: '2018', manufacturer: 'Topps', releaseName: '2018 Topps Chrome',
        setName: 'Base Set', cardNumber: '150', exactCardCandidate: true,
        selectionToken: 'a'.repeat(64), confirmationRequired: true
      }] }));
    }
    if (url === '/api/v1/card-intelligence/resolve') {
      return response(cardEnvelope(correlationId, {
        readyForEvaluation: true,
        explicitConfirmationRequired: true,
        cardIdentity: '2018 Topps Chrome Shohei Ohtani #150 PSA 9',
        grader: 'PSA', grade: '9'
      }));
    }
    if (url === '/api/v1/discover') return response(discoverEnvelope(correlationId, candidateCount));
    throw new Error(`Unexpected URL ${url}`);
  };
  const context = vm.createContext({
    window, fetch, Response, Intl, Math, Date, Object, Array, String, Number, Boolean, BigInt, RegExp, Promise, Set, Map, Error, URL,
    FormData: FakeFormData, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent
  });
  vm.runInContext(adapter, context, { filename: 'customer-discovery.js' });
  const main = new FakeMain({ exactCardQuery: query, targetMaxBuy: '', limit: '25' });
  return { window, calls, main };
}

async function renderAndSubmit(rt) {
  await rt.window.FlipForgeCustomerDiscovery.render(rt.main);
  rt.main.form.submit();
  await wait(5);
}

const missingNumber = runtime('2018 Topps Chrome Shohei Ohtani PSA 9');
await renderAndSubmit(missingNumber);
check('001 missing-number query calls identity search', missingNumber.calls.some(c => c.url === '/api/v1/card-intelligence/search'));
check('002 missing-number query does not call Discover first', !missingNumber.calls.some(c => c.url === '/api/v1/discover'));
check('003 identity options render with declared PSA 9 context', missingNumber.main.identityButtons.length === 1 && /Which card did you mean\?/i.test(missingNumber.main.innerHTML) && /PSA 9 \(entered\)/.test(missingNumber.main.innerHTML));
missingNumber.main.identityButtons[0].click();
await wait(10);
const resolveCall = missingNumber.calls.find(c => c.url === '/api/v1/card-intelligence/resolve');
const discoverCall = missingNumber.calls.find(c => c.url === '/api/v1/discover');
check('004 selected token is re-resolved server-side', resolveCall?.body?.selectionToken === 'a'.repeat(64));
check('005 canonical Ohtani #150 PSA 9 reaches Discover', discoverCall?.body?.exactCardQuery === '2018 Topps Chrome Shohei Ohtani #150 PSA 9');
check('006 grade PSA 9 survives identity resolution', /PSA 9/.test(discoverCall?.body?.exactCardQuery || ''));
check('007 zero-listing result does not loop back to identity search', missingNumber.calls.filter(c => c.url === '/api/v1/card-intelligence/search').length === 1);
check('008 zero-listing result remains explicit no-listing state', /No active candidate is available/i.test(missingNumber.main.innerHTML));

for (const query of [
  '2018 Topps Chrome Shohei Ohtani #150 PSA 9',
  '2018 Topps Chrome Shohei Ohtani No. 150 PSA 9',
  '2018 Topps Chrome Shohei Ohtani No 150 PSA 9'
]) {
  const rt = runtime(query, { candidateCount: 1 });
  await renderAndSubmit(rt);
  check(`direct exact notation: ${query}`, rt.calls.some(c => c.url === '/api/v1/discover') && !rt.calls.some(c => c.url === '/api/v1/card-intelligence/search'));
}

const findExact = runtime('2018 Topps Chrome Shohei Ohtani #150 PSA 9');
await findExact.window.FlipForgeCustomerDiscovery.render(findExact.main);
findExact.main.findButton.click();
await wait(5);
check('012 Find exact card can force identity assist even when number exists', findExact.calls.some(c => c.url === '/api/v1/card-intelligence/search') && !findExact.calls.some(c => c.url === '/api/v1/discover'));

check('013 production host remains eligible', runtime('x').window.FlipForgeCustomerDiscovery.isEligible() === true);
check('014 marketing root remains ineligible', runtime('x', { pathname: '/' }).window.FlipForgeCustomerDiscovery.isEligible() === false);
check('015 selection token format is fail-closed', adapter.includes('SAFE_SELECTION_TOKEN') && adapter.includes('row.exactCardCandidate !== true'));
check('016 provider identifiers remain excluded by envelope validation', adapter.includes('data.providerIdentifierExposed === false') && adapter.includes('data.rawProviderPayloadExposed === false'));
check('017 no browser tenant header or service token', !/X-FlipForge-(?:Tenant|User)-Id|FLIPFORGE_API_SERVICE_TOKEN/.test(adapter));

const failures = checks.filter(c => !c.passed);
console.log('Discover identity-assist validation');
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
