import fs from 'node:fs';

const pricing = fs.readFileSync('pricing.html', 'utf8');
const betaTerms = fs.readFileSync('beta-terms.html', 'utf8');
const failures = [];

function requireText(label, text, needle) {
  if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`);
}

function forbidText(label, text, needle) {
  if (text.includes(needle)) failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);
}

requireText('pricing', pricing, 'Planned Launch Pricing');
requireText('pricing', pricing, '10 evaluations each month');
requireText('pricing', pricing, '75 evaluations each month');
requireText('pricing', pricing, '300 evaluations each month');
requireText('pricing', pricing, '<tr><td>Monthly evaluations</td><td>10</td><td>75</td><td>300</td></tr>');
forbidText('pricing', pricing, '5 evaluations each month');
forbidText('pricing', pricing, '<tr><td>Monthly evaluations</td><td>5</td>');
forbidText('pricing', pricing, 'Most popular');

requireText('pricing', pricing, 'Forge Heat intelligence');
requireText('pricing', pricing, '<tr><td>Forge Heat</td><td class="no">No</td><td class="no">No</td><td class="yes">Yes</td></tr>');
requireText('pricing', pricing, 'Tracked cards subject to reasonable-use and technical limits');
requireText('pricing', pricing, '<td>Reasonable use*</td>');

requireText('pricing', pricing, '$14.99 <small>/ month</small>');
requireText('pricing', pricing, '$29.99 <small>/ month</small>');
requireText('pricing', pricing, '$19.99 per month, locked for 12 months');
requireText('pricing', pricing, 'Private Beta participation does not enroll you automatically');
requireText('pricing', pricing, 'Founding Pro requires a separate explicit checkout');
requireText('pricing', pricing, 'No permanent lifetime pricing');
requireText('pricing', pricing, 'Private Beta does not automatically convert to Scout, Collector, Pro, or any paid subscription');
requireText('pricing', pricing, 'Paid checkout is processed by Paddle, which acts as the Merchant of Record');

requireText('beta terms', betaTerms, '<h2>Beta and paid plans</h2>');
requireText('beta terms', betaTerms, 'Private Beta participation does not automatically convert to Scout, Collector, Pro, Founding Pro, or any paid subscription');
requireText('beta terms', betaTerms, 'Any future paid enrollment requires a separate explicit checkout or other clear acceptance step');
requireText('beta terms', betaTerms, 'Beta participation does not guarantee a permanent entitlement, permanent discount, or future price');
requireText('beta terms', betaTerms, 'accepting Private Beta access alone does not enroll you in that offer');

for (const [label, text] of [['pricing', pricing], ['beta terms', betaTerms]]) {
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'transactionAuthority=true', 'recommendation=', 'supportedValue=']) {
    forbidText(label, text, forbidden);
  }
}

if (failures.length) {
  console.error('Phase 8 commercial copy validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Phase 8 commercial copy matches the locked subscription and Private Beta contract.');
