import fs from 'node:fs';

const ui = fs.readFileSync('saas-prototype/customer-grading-economics.js', 'utf8');
const route = fs.readFileSync('saas-prototype/staging-route-hook.js', 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

function includesAll(source, values) {
  return values.every(value => source.includes(value));
}

check('adapter version advanced', ui.includes('const VERSION = "v1.1.0"'));
check('governed context must be read only', ui.includes('context.readOnly === true'));
check('governed context denies grade prediction', ui.includes('context.gradePredictionPerformed === false'));
check('governed context denies grading authority', ui.includes('context.gradingAuthorityChanged === false'));
check('governed context denies recommendation authority', ui.includes('context.recommendationAuthorityChanged === false'));
check('governed context denies self training', ui.includes('context.selfTrainingAuthorized === false'));
check('governed context denies transaction authority', ui.includes('context.transactionAuthority === false'));
check('population cannot become value evidence', ui.includes('context.populationUsedAsValueEvidence === false'));
check('population cannot become grade probability', ui.includes('context.populationUsedAsGradeProbability === false'));
check('customer explanation names evidence quality, liquidity, population, turnaround and receipt continuity',
  includesAll(ui, ['Why these economics?', 'Evidence quality', 'Liquidity', 'PSA 9 population', 'PSA 10 population', 'Turnaround', 'Receipt continuity:']));
check('population boundary is plain language',
  ui.includes('Population is context only; it does not create value or a grade probability.'));
check('scarcity is not manufactured', ui.includes('No scarcity verdict is manufactured from population counts.'));
check('missing turnaround stays unmodeled',
  ui.includes('No source-backed turnaround estimate is attached, so FlipForge leaves timing out of the economics.'));
check('unavailable state forbids substitute claims',
  ui.includes('No substitute data:')
    && ui.includes('population claims')
    && ui.includes('turnaround estimates'));
check('decision boundary remains scenario-only',
  ui.includes('This is scenario analysis only.')
    && ui.includes('does not predict the grade')
    && ui.includes('change the saved BUY/WATCH/VERIFY/PASS decision')
    && ui.includes('authorize a transaction'));
check('customer adapter is cache-busted to the context revision',
  route.includes('customer-grading-economics.js?v=20260916-2'));
check('PSA route still loads existing PSA adapter', route.includes('customer-psa-advisor.js?v=20260830-1'));
check('customer route remains private-beta intelligence', route.includes('PRIVATE BETA INTELLIGENCE'));

if (failed > 0) {
  console.error(`Customer grading economics context validation failed: ${failed} failed, ${passed} passed.`);
  process.exit(1);
}

console.log(`Customer grading economics context validation passed: ${passed} checks.`);
