import fs from 'node:fs';

const homepage = fs.readFileSync('index.html', 'utf8');
const pricing = fs.readFileSync('pricing.html', 'utf8');
const betaTerms = fs.readFileSync('beta-terms.html', 'utf8');
const terms = fs.readFileSync('terms.html', 'utf8');
const refund = fs.readFileSync('refund.html', 'utf8');
const failures = [];

function requireText(label, text, needle) {
  if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`);
}

function forbidText(label, text, needle) {
  if (text.includes(needle)) failures.push(`${label}: forbidden ${JSON.stringify(needle)}`);
}

// The focused homepage intentionally routes detailed commercial terms to the launch-plans page.
requireText('homepage', homepage, 'Before you buy. <span>Know Why.</span>');
forbidText('homepage', homepage, 'Before You Buy, <span>Know Why.</span>');
requireText('homepage', homepage, 'href="pricing.html"');
requireText('homepage', homepage, 'href="beta-application.html"');
requireText('homepage', homepage, 'Controlled Private Beta');
requireText('homepage', homepage, 'FlipForge does not guarantee profit or authorize transactions.');
forbidText('homepage', homepage, '<li>5 evaluations per month</li>');
forbidText('homepage', homepage, 'Most popular');

// Launch plans remain explicitly provisional. Public package prices are intentionally withheld during private beta.
requireText('pricing', pricing, 'Planned Launch Structure');
requireText('pricing', pricing, 'Launch Plans');
requireText('pricing', pricing, 'Pricing to be announced');
requireText('pricing', pricing, 'Final package pricing has not been published.');
requireText('pricing', pricing, 'No paid checkout and no public package pricing during private beta.');
requireText('pricing', pricing, '10 planned evaluations per month');
requireText('pricing', pricing, '75 planned evaluations per month');
requireText('pricing', pricing, '300 planned evaluations per month');
requireText('pricing', pricing, '<tr><td>Planned monthly evaluations</td><td>10</td><td>75</td><td>300</td></tr>');
forbidText('pricing', pricing, '<li>5 evaluations each month</li>');
forbidText('pricing', pricing, '<tr><td>Monthly evaluations</td><td>5</td>');
forbidText('pricing', pricing, 'Most popular');
requireText('pricing', pricing, 'Forge Heat™ beta/roadmap access when available');
requireText('pricing', pricing, '<tr><td>Forge Heat™</td><td class="no">No</td><td class="no">No</td><td class="varies">Beta / roadmap</td></tr>');
requireText('pricing', pricing, 'Tracked cards subject to reasonable-use and technical limits');
requireText('pricing', pricing, '<td>Reasonable use*</td>');
for (const amount of ['$14.99', '$29.99', '$149', '$299', 'Planned annual option']) forbidText('pricing', pricing, amount);
requireText('pricing', pricing, 'Beta participation does not enroll a user in Scout, Collector, Pro, or any future paid plan.');
requireText('pricing', pricing, 'Any future checkout must be initiated explicitly by the customer after paid access is opened.');
requireText('pricing', pricing, 'If Paddle is used at commercial launch, it will act as Merchant of Record for transactions it processes.');

requireText('beta terms', betaTerms, '<h2>Beta and paid plans</h2>');
requireText('beta terms', betaTerms, 'Private Beta participation does not automatically convert to Scout, Collector, Pro, Founding Pro, or any paid subscription');
requireText('beta terms', betaTerms, 'Any future paid enrollment requires a separate explicit checkout or other clear acceptance step');
requireText('beta terms', betaTerms, 'Beta participation does not guarantee a permanent entitlement, permanent discount, or future price');
requireText('beta terms', betaTerms, 'accepting Private Beta access alone does not enroll you in that offer');

// General terms must describe today's actual commercial state first; future billing terms remain conditional.
requireText('terms', terms, 'Paid subscriptions are not currently offered.');
requireText('terms', terms, 'The current private beta is $0.');
requireText('terms', terms, 'Paid checkout is not active.');
requireText('terms', terms, 'If FlipForge later opens paid subscriptions, any checkout must be a separate, explicit customer action.');
requireText('terms', terms, 'If Paddle is used for a future transaction, Paddle will act as Merchant of Record and seller for that transaction.');
requireText('terms', terms, 'The current private beta has no subscription charge to cancel or refund.');
requireText('terms', terms, 'Nothing in these terms excludes or limits liability where doing so would be prohibited by applicable law');
forbidText('terms', terms, 'Paid FlipForge subscriptions purchased through Paddle are recurring subscriptions');
forbidText('terms', terms, 'You may cancel a recurring subscription to stop future renewal');

// Refund policy must not imply that a paid transaction exists during private beta.
requireText('refund', refund, 'The current FlipForge private beta is $0');
requireText('refund', refund, 'FlipForge is not currently offering paid checkout or paid subscriptions.');
requireText('refund', refund, 'The refund and cancellation rules below apply only if FlipForge later opens paid access');
requireText('refund', refund, 'If Paddle is used for a future FlipForge transaction, Paddle will act as the Merchant of Record and seller for that transaction');
requireText('refund', refund, 'Nothing on this page limits non-waivable rights under applicable law.');
requireText('refund', refund, 'If you ever see a charge represented as a FlipForge payment while the site still states that paid checkout is inactive');
forbidText('refund', refund, 'Paid FlipForge subscriptions are processed by Paddle');
forbidText('refund', refund, 'paid subscription charges are generally non-refundable');
forbidText('refund', refund, 'Canceling a subscription stops future renewal');

forbidText('terms', terms, 'FlipForge directly processes payments');
forbidText('refund', refund, 'FlipForge directly issues refunds');
forbidText('refund', refund, 'no refunds under any circumstances');
forbidText('refund', refund, 'all sales are final');

for (const [label, text] of [['homepage', homepage], ['pricing', pricing], ['beta terms', betaTerms], ['terms', terms], ['refund', refund]]) {
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'transactionAuthority=true', 'recommendation=', 'supportedValue=']) {
    forbidText(label, text, forbidden);
  }
}

if (failures.length) {
  console.error('Phase 8 commercial copy validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Private-beta no-charge status, unpublished launch pricing, future-only checkout terms, locked slogan punctuation, and refund boundaries remain commercially consistent.');
