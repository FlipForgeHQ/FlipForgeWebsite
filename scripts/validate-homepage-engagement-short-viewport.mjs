// Synthetic browser test of homepage 'section reached' tracking at short viewport heights.
// No network, no analytics writes, no personal data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('assets/js/homepage-engagement-v1.js', 'utf8');
const page = readFileSync('index.html', 'utf8');
assert.match(page, /data-ff-challenge>[\s\S]*?<h3 id="ff10-chal-card"/, 'Challenge landmark must exist');
assert.match(page, /<h2 id="ff10-app-title"/, 'Inside-app landmark must exist');

let passed = 0;
const check = (label, fn) => { fn(); passed++; };
const makeElement = () => ({dataset: {}, handlers: {}, addEventListener(name, fn) {this.handlers[name] = fn;}});
const mock = (supportsObserver = true) => {
  const challenge = makeElement();
  const app = makeElement();
  const links = [makeElement(), makeElement()];
  links[0].dataset.ffHeroJump = 'challenge';
  links[1].dataset.ffHeroJump = 'app';
  const events = [];
  let observer;
  const lookup = {'[data-ff-challenge] h3': challenge, '#ff10-app-title': app};
  const document = {
    querySelector(selector) {return lookup[selector] || null;},
    querySelectorAll(selector) {return selector === '[data-ff-hero-jump]' ? links : [];},
    dispatchEvent(event) {events.push(event.detail);}
  };
  class FakeObserver {
    constructor(callback, options) {this.callback = callback; this.threshold = options.threshold; this.targets = new Set(); this.unobserved = new Set(); observer = this;}
    observe(target) {this.targets.add(target);}
    unobserve(target) {this.unobserved.add(target); this.targets.delete(target);}
    deliver(target, ratio) {this.callback([{target, isIntersecting: ratio > 0, intersectionRatio: ratio}]);}
  }
  const window = supportsObserver ? {IntersectionObserver: FakeObserver} : {};
  vm.runInNewContext(source, {document, window, IntersectionObserver: FakeObserver,
    CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}}}, {filename: 'homepage-engagement-v1.js'});
  return {challenge, app, links, events, observer};
};

const s = mock();
check('observes meaningful small landmarks, not 1,900px container', () => {
  assert.equal(s.observer.threshold, 0.35);
  assert.equal(s.observer.targets.has(s.challenge), true);
  assert.equal(s.observer.targets.has(s.app), true);
  assert.equal(s.challenge.dataset.ffEngagement, 'challenge');
  assert.equal(s.app.dataset.ffEngagement, 'inside-app');
});
check('1px / 10% partial entry is not mistakenly counted', () => {
  s.observer.deliver(s.app, .10);
  s.observer.deliver(s.challenge, .01);
  assert.equal(s.events.length, 0);
});
check('exactly 35% of heading visible counts on short phones', () => {
  s.observer.deliver(s.app, .35);
  s.observer.deliver(s.challenge, .35);
  assert.equal(s.events.length, 2);
  assert.equal(s.events[0].event, 'section_viewed');
  assert.equal(s.events[0].placement, 'inside-app');
  assert.equal(s.events[1].placement, 'challenge');
});
check('only one reached event per section per page view', () => {
  s.observer.deliver(s.app, .9);
  s.observer.deliver(s.challenge, .8);
  assert.equal(s.events.length, 2);
  assert.equal(s.observer.unobserved.size, 2);
});
check('hero shortcut clicks retain existing counts', () => {
  s.links[0].handlers.click();
  s.links[1].handlers.click();
  assert.equal(s.events.length, 4);
  assert.equal(s.events[2].event, 'hero_jump_clicked');
  assert.equal(s.events[2].placement, 'hero-challenge');
  assert.equal(s.events[3].placement, 'hero-app');
});
check('no IntersectionObserver degrades safely; hero clicks remain', () => {
  const oldBrowser = mock(false);
  assert.equal(oldBrowser.observer, undefined);
  oldBrowser.links[0].handlers.click();
  assert.equal(oldBrowser.events.length, 1);
  assert.equal(oldBrowser.events[0].placement, 'hero-challenge');
});
check('trackable payload is counts-only and does not introduce identity', () => {
  assert.deepEqual(Object.keys(s.events[0]).sort(), ['event', 'placement']);
  assert.deepEqual(Object.keys(s.events[2]).sort(), ['event', 'placement']);
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('fetch('), false);
});
console.log(`PASS: ${passed} viewport-safe homepage engagement tests.`);
