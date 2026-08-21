import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(root, 'saas-prototype/card-brand-display.js'), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

const window = {};
const document = {
  readyState: 'complete',
  querySelector() { return null; },
  addEventListener() {}
};
class Element {}
class MutationObserver { observe() {} }

const context = vm.createContext({ window, document, Element, MutationObserver, Object, String, Map, RegExp, console });
vm.runInContext(source, context, { filename: 'card-brand-display.js' });
const display = window.FlipForgeCardBrandDisplay;

check('001 shared display API is exposed', Boolean(display));
check('002 Topps company aliases normalize to Topps', display.canonicalManufacturer('The Topps Company, Inc.') === 'Topps');
check('003 Panini company aliases normalize to Panini', display.canonicalManufacturer('Panini America, Inc.') === 'Panini');
check('004 Upper Deck company aliases normalize to Upper Deck', display.canonicalManufacturer('The Upper Deck Company') === 'Upper Deck');
check('005 Leaf company aliases normalize to Leaf', display.canonicalManufacturer('Leaf Trading Cards') === 'Leaf');
check('006 Fanatics company aliases normalize to Fanatics', display.canonicalManufacturer('Fanatics Collectibles') === 'Fanatics');
check('007 legacy brand casing is normalized', display.canonicalManufacturer('skybox') === 'SkyBox' && display.canonicalManufacturer('sage') === 'SAGE');
check('008 unknown manufacturers are preserved instead of guessed', display.canonicalManufacturer('Independent Card Co.') === 'Independent Card Co.');

check('009 Bowman product family displays Bowman even when provider manufacturer is Topps',
  display.normalizeManufacturer('Topps', 'Bowman Chrome', 'Base Set') === 'Bowman');
check('010 Bowman subset also displays Bowman',
  display.normalizeManufacturer('Topps', '2018 Bowman Chrome', 'Bowman Sterling') === 'Bowman');
check('011 Topps Chrome remains Topps',
  display.normalizeManufacturer('Topps', 'Topps Chrome', 'Base Set') === 'Topps');
check('012 Panini Prizm remains Panini',
  display.normalizeManufacturer('Panini America', 'Prizm', 'Base Set') === 'Panini');
check('013 Upper Deck Young Guns remains Upper Deck',
  display.normalizeManufacturer('Upper Deck Company', 'Upper Deck', 'Young Guns') === 'Upper Deck');

const bowmanDetail = display.normalizeDetailText('2018 · Topps · Bowman Chrome · Bowman Sterling · #BS-SO · PSA 9 (entered)');
check('014 displayed Bowman detail removes the awkward Topps-Bowman pairing',
  bowmanDetail === '2018 · Bowman · Bowman Chrome · Bowman Sterling · #BS-SO · PSA 9 (entered)');
const toppsDetail = display.normalizeDetailText('2018 · Topps · Topps Chrome · Base Set · #150 · PSA 9 (entered)');
check('015 displayed Topps Chrome detail is unchanged',
  toppsDetail === '2018 · Topps · Topps Chrome · Base Set · #150 · PSA 9 (entered)');
const paniniDetail = display.normalizeDetailText('2022 · Panini America · Prizm · Base Set · #266');
check('016 raw corporate Panini label is cleaned for display',
  paniniDetail === '2022 · Panini · Prizm · Base Set · #266');
check('017 non-card prose is never rewritten',
  display.normalizeDetailText('Smart Opportunity remains the decision authority.') === 'Smart Opportunity remains the decision authority.');
check('018 year-leading detail requirement prevents unrelated delimiter text rewrites',
  display.normalizeDetailText('Provider · Topps Company · Status') === 'Provider · Topps Company · Status');

const failures = checks.filter(check => !check.passed);
console.log('Card manufacturer display normalization validation');
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
