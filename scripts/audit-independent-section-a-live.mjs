const base = 'https://goflipforge.com';
const pages = [
  ['A1-home','/','CARD INTELLIGENCE'],
  ['A1-product','/product','Is the premium actually supported?'],
  ['A1-pricing','/pricing','Private Beta'],
  ['A1-faq','/faq','Frequently Asked Questions'],
  ['A1-about','/about','WHY FLIPFORGE EXISTS'],
  ['A1-privacy','/privacy','Privacy'],
  ['A1-terms','/terms','Terms of Use'],
  ['A1-beta-terms','/beta-terms','Private Beta Terms'],
  ['A1-data-use','/data-use','Data Use'],
  ['A1-application','/beta-application','CONTROLLED PRIVATE BETA'],
  ['A1-onboarding','/beta-onboarding.html','Private Beta Onboarding']
];
const results = [];
let failed = false;
for (const [id, route, marker] of pages) {
  try {
    const response = await fetch(base + route, { redirect: 'follow', headers: { 'user-agent':'FlipForge-Independent-Audit/1.0' } });
    const text = await response.text();
    const ok = response.ok && text.toLowerCase().includes(marker.toLowerCase());
    results.push({ id, status: ok ? 'PASS' : 'FAIL', http: response.status, finalUrl: response.url, marker });
    if (!ok) failed = true;
  } catch (error) {
    results.push({ id, status:'FAIL', error:String(error) });
    failed = true;
  }
}

const headerRoutes = [
  ['public-home','/'],['legal-privacy','/privacy'],['legal-terms','/terms'],
  ['legal-beta-terms','/beta-terms'],['legal-data-use','/data-use'],
  ['operator','/operator-beta.html'],['app-entry','/app/']
];
const headerReport = [];
for (const [name, route] of headerRoutes) {
  try {
    const response = await fetch(base + route, { redirect:'follow', headers:{ 'user-agent':'FlipForge-Independent-Audit/1.0' } });
    await response.arrayBuffer();
    const h = Object.fromEntries([...response.headers.entries()].map(([k,v])=>[k.toLowerCase(),v]));
    const hasFrameProtection = Boolean(h['x-frame-options']) || /frame-ancestors/i.test(h['content-security-policy'] || '');
    const checks = {
      hsts: Boolean(h['strict-transport-security']),
      nosniff: /nosniff/i.test(h['x-content-type-options'] || ''),
      frameProtection: hasFrameProtection,
      referrerPolicy: Boolean(h['referrer-policy']),
      permissionsPolicy: Boolean(h['permissions-policy']),
      csp: Boolean(h['content-security-policy']),
      cacheControl: h['cache-control'] || null
    };
    headerReport.push({ name, route, http:response.status, ...checks });
  } catch (error) {
    headerReport.push({ name, route, error:String(error) });
  }
}
console.log(JSON.stringify({ section:'A', liveRoutes:results, headers:headerReport }, null, 2));
if (failed) process.exit(1);
