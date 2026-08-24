import fs from 'node:fs';

const product=fs.readFileSync('product.html','utf8');
const siteJs=fs.readFileSync('assets/js/site.js','utf8');
const visualCss=fs.readFileSync('assets/css/visual-sections.css','utf8');
const failures=[];
const requireText=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};

for(const needle of [
  'id="identity-simulator"',
  'Try to break the identity',
  'Choose the wrong card and watch FlipForge stop it.',
  'data-identity-state="exact"',
  'data-identity-state="parallel"',
  'data-identity-state="grade"',
  'id="identity-record"',
  'id="identity-result"',
  'id="identity-code"',
  'id="identity-title"',
  'id="identity-copy"',
  'Bad evidence stops before price gets a vote.',
  'Supported value is not allowed to update from the mismatch',
  'Illustrative product simulation.'
]) requireText('product identity simulator',product,needle);

for(const needle of [
  'ACCEPT_EXACT_IDENTITY',
  'REJECT_PARALLEL_MISMATCH',
  'REJECT_GRADE_MISMATCH',
  "document.querySelectorAll('[data-identity-state]')",
  'FlipForge blocks it before valuation.',
  'A PSA 9 sale cannot be treated as an exact PSA 10 comp.'
]) requireText('identity simulator behavior',siteJs,needle);

for(const needle of ['.identity-layout','.identity-options','.identity-result','.identity-result.parallel','.identity-result.grade']) requireText('identity simulator styles',visualCss,needle);

for(const needle of ['>Launch Plans</a>','>Evidence Lab</a>','>Request Beta Access</a>']) requireText('product static navigation',product,needle);

if(failures.length){
  console.error('Product identity simulator validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PASS: Product page visibly demonstrates exact-match acceptance and wrong-parallel / wrong-grade rejection before valuation.');
