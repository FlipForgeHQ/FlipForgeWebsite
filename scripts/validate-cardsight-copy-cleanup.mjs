import fs from 'node:fs';

const source = fs.readFileSync(new URL('../saas-prototype/cardsight-evidence-visibility.js', import.meta.url), 'utf8');

const checks = [
  [
    'normalizes the governed-evidence provider sentence before customer-language rewriting',
    /qualified for governed evidence[\s\S]*passed FlipForge's evidence checks/.test(source)
  ],
  [
    'retains the current-authority accepted-sales labels without naming the data provider',
    source.includes('Saved accepted sales from our data provider') && source.includes('All saved exact accepted sales')
      && !source.includes('Saved CardSight accepted sales') && !source.includes('<h2>CardSight sold evidence</h2>')
  ],
  [
    'does not alter evidence authority booleans',
    source.includes('activeListingsCanSupportValue !== false')
      && source.includes('automaticOutlierAcceptance !== false')
      && source.includes('transactionAuthority !== false')
  ]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}`);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
