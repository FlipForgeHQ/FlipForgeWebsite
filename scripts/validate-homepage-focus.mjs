import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const marketing = read('assets/js/marketing-v3.js');
const focusCss = read('assets/css/homepage-focus-v1.css');
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check('001 homepage uses focused mode', marketing.includes("'ff-home-focused'"));
check('002 homepage removes old directory', marketing.includes("document.querySelector('.homepage-directory')?.remove()"));
check('003 deep product sections are removed from homepage rendering', ['product-screens','identity-checker','case-study','decision-tools','comparison','pricing'].every(id => marketing.includes(`'${id}'`)));
check('004 old runtime problem section is gone', !marketing.includes("id='market-problem'") && !marketing.includes('id="market-problem"'));
check('005 old runtime intelligence section is gone', !marketing.includes('what-flipforge-sees'));
check('006 old runtime proof section is gone', !marketing.includes('proof-loop'));
check('007 old runtime vision section is gone', !marketing.includes("id='vision'") && !marketing.includes('id="vision"'));
check('008 one guided demo remains', marketing.includes("document.getElementById('try-flipforge')") && marketing.includes('See the decision workflow in four steps.'));
check('009 compact how-it-works section exists', marketing.includes("workflow.id='how-it-works'") && marketing.includes('One disciplined path from listing to decision.'));
check('010 workflow keeps four decision stages', ['Resolve the card','Challenge the evidence','Measure the setup','Understand the decision'].every(text => marketing.includes(text)));
check('011 outcome follow-up remains visible', marketing.includes('7 / 14 / 30 days'));
check('012 deeper detail routes outward', marketing.includes('href="product.html"') && marketing.includes('href="learn.html"'));
check('013 pricing grid is removed from homepage rendering', marketing.includes("'pricing'") && !marketing.includes('Planned Launch Pricing'));
check('014 brand descriptor remains CARD INTELLIGENCE', marketing.includes("node.textContent='CARD INTELLIGENCE'"));
check('015 focused CSS tightens hero height', focusCss.includes('min-height:auto') && focusCss.includes('padding-top:58px'));
check('016 focused CSS has responsive tablet layout', focusCss.includes('@media(max-width:1000px)'));
check('017 focused CSS has responsive mobile layout', focusCss.includes('@media(max-width:700px)'));

const failures = results.filter(result => !result.passed);
console.log('FlipForge homepage focus validation');
console.log(`PASSED: ${results.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
