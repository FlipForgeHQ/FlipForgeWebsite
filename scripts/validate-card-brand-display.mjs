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
check('002 Topps company aliases still normalize internally', display.canonicalManufacturer('The Topps Company, Inc.') === 'Topps');
check('003 Panini company aliases still normalize internally', display.canonicalManufacturer('Panini America, Inc.') === 'Panini');
check('004 Upper Deck company aliases still normalize internally', display.canonicalManufacturer('The Upper Deck Company') === 'Upper Deck');
check('005 Leaf company aliases still normalize internally', display.canonicalManufacturer('Leaf Trading Cards') === 'Leaf');
check('006 Fanatics company aliases still normalize internally', display.canonicalManufacturer('Fanatics Collectibles') === 'Fanatics');
check('007 legacy brand casing remains normalized', display.canonicalManufacturer('skybox') === 'SkyBox' && display.canonicalManufacturer('sage') === 'SAGE');
check('008 unknown manufacturers are preserved internally instead of guessed', display.canonicalManufacturer('Independent Card Co.') === 'Independent Card Co.');
check('009 Bowman product context can still normalize explicit manufacturer labels', display.normalizeManufacturer('Topps', 'Bowman Chrome', 'Base Set') === 'Bowman');

const toppsDetail = display.normalizeDetailText('2018 · Topps · Topps Chrome · Base Set · #150 · PSA 9 (entered)');
check('010 Topps Chrome customer line omits redundant manufacturer',
  toppsDetail === '2018 · Topps Chrome · Base Set · #150 · PSA 9 (entered)');

const bowmanDetail = display.normalizeDetailText('2018 · Topps · Bowman Chrome · Bowman Sterling · #BS-SO · PSA 9 (entered)');
check('011 Bowman customer line uses the product name without corporate Topps prefix',
  bowmanDetail === '2018 · Bowman Chrome · Bowman Sterling · #BS-SO · PSA 9 (entered)');

const paniniDetail = display.normalizeDetailText('2022 · Panini America · Prizm · Base Set · #266 · PSA 10 (entered)');
check('012 Panini customer line uses product/release instead of corporate manufacturer',
  paniniDetail === '2022 · Prizm · Base Set · #266 · PSA 10 (entered)');

const upperDeckDetail = display.normalizeDetailText('2015-16 · The Upper Deck Company · Upper Deck · Young Guns · #201 · PSA 10 (entered)');
check('013 Upper Deck customer line remains collector-natural',
  upperDeckDetail === '2015-16 · Upper Deck · Young Guns · #201 · PSA 10 (entered)');

const leafDetail = display.normalizeDetailText('2023 · Leaf Trading Cards · Metal Draft · Autographs · #BA-1');
check('014 Leaf customer line uses the release name',
  leafDetail === '2023 · Metal Draft · Autographs · #BA-1');

const unknownDetail = display.normalizeDetailText('2020 · Independent Card Co. · Indie Series · Base Set · #7');
check('015 unknown provider manufacturer is hidden only from the compact customer identity line',
  unknownDetail === '2020 · Indie Series · Base Set · #7');

const missingRelease = display.normalizeDetailText('2020 · Panini America ·  · #7');
check('016 missing release falls back safely to normalized manufacturer',
  missingRelease === '2020 · Panini · #7');

check('017 non-card prose is never rewritten',
  display.normalizeDetailText('Smart Opportunity remains the decision authority.') === 'Smart Opportunity remains the decision authority.');
check('018 year-leading detail requirement prevents unrelated delimiter text rewrites',
  display.normalizeDetailText('Provider · Topps Company · Status') === 'Provider · Topps Company · Status');

const failures = checks.filter(check => !check.passed);
console.log('Card identity display compaction validation');
console.log(`PASSED: ${checks.length - failures.length}`);
console.log(`FAILED: ${failures.length}`);
for (const failure of failures) console.error(`FAIL | ${failure.name}`);
if (failures.length) process.exitCode = 1;
