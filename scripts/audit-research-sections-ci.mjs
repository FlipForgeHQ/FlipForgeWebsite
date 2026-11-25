// Rendered audit of the research sections (desktop and phone), on the public pages and on the internal preview.
// Serves the repository with saas-prototype/serve.mjs (port 4173 or FLIPFORGE_RX_AUDIT_PORT) and drives Chromium.
//   RX1  no page errors; the only failed request allowed is the analytics endpoint (not served locally)
//   RX2  no sideways scroll at 1440 and 390 wide
//   RX3  research sections render in the directed homepage order
//   RX4  every chart mark has an accessible name and a table view; every table has a caption
//   RX5  counters end on the value printed in the HTML; reduced motion shows it immediately
//   RX6  research events reach the existing ff:conversion channel with allow-listed placements only
//   RX7  public pages never show a preview marker; the preview always does
//   RX8  focus is visible on the case-study disclosure and chart marks (keyboard reachable)
//   RX10 preview research links stay inside the preview; public links never point into it
//   RX9  writes screenshots to output/research-sections/ when FLIPFORGE_RX_SHOTS=1
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {chromium} from 'playwright';

const PORT = process.env.FLIPFORGE_RX_AUDIT_PORT || '4173';
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.FLIPFORGE_RX_SHOTS === '1';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE || undefined;
let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`PASS ${name}`); } else { failures.push(`${name}${detail ? ` [${detail}]` : ''}`); console.log(`FAIL ${name}`); }
};

if (!fs.existsSync('research-preview/index.html')) {
  await new Promise((res, rej) => spawn(process.execPath, ['scripts/build-research-sections.mjs', '--preview'], {stdio: 'inherit'})
    .on('exit', c => c === 0 ? res() : rej(new Error('preview build failed'))));
}
const server = spawn(process.execPath, ['saas-prototype/serve.mjs'], {env: {...process.env, PORT}, stdio: 'ignore'});
const up = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/')).ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); } throw new Error('server did not start'); };

try {
  await up();
  const browser = await chromium.launch({executablePath});
  if (SHOTS) fs.mkdirSync('output/research-sections', {recursive: true});
  const pages = [
    ['public', 'home', '/index.html'], ['public', 'proof', '/decision-proof.html'],
    ['preview', 'home', '/research-preview/index.html'], ['preview', 'proof', '/research-preview/decision-proof.html']
  ];
  for (const [mode, name, url] of pages) {
    for (const [device, viewport] of [['desktop', {width: 1440, height: 900}], ['phone', {width: 390, height: 844}]]) {
      const tag = `${mode} ${name} ${device}`;
      const context = await browser.newContext({viewport, reducedMotion: device === 'phone' ? 'reduce' : 'no-preference'});
      const page = await context.newPage();
      const errors = [];
      const events = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/api/conversion-event')) errors.push(`${r.status()} ${r.url()}`); });
      await page.addInitScript(() => document.addEventListener('ff:conversion', e => { (window.__rx = window.__rx || []).push(e.detail); }));
      await page.goto(BASE + url, {waitUntil: 'networkidle'});
      const info = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        order: [...document.querySelectorAll('main > section[id], main section[data-rx-section]')].map(s => s.id),
        preview: Boolean(document.querySelector('[data-rx-preview], .ff-rx-chip, .ff-rx-preview-banner')),
        hits: [...document.querySelectorAll('.ff-rx-hit')].map(b => (b.textContent || '').trim().length > 0),
        charts: [...document.querySelectorAll('.ff-rx-chart')].map(c => Boolean(c.querySelector('details.ff-rx-table table caption'))),
        tables: [...document.querySelectorAll('.ff-rx table')].every(t => t.querySelector('caption')),
        counters: [...document.querySelectorAll('[data-rx-count]')].map(c => c.textContent)
      }));
      check(`RX1 ${tag}: no page errors or missing files`, errors.length === 0, errors.slice(0, 3).join(' | '));
      check(`RX2 ${tag}: no sideways scroll`, info.width <= viewport.width, String(info.width));
      if (name === 'home') {
        const want = mode === 'preview'
          ? ['research', 'decision-file-01', 'beyond-price', 'demo', 'inside-the-app', 'decision-advantage-teaser', 'who-its-for']
          : ['research', 'beyond-price', 'demo', 'inside-the-app', 'who-its-for'];
        const got = info.order.filter(id => want.includes(id));
        check(`RX3 ${tag}: section order`, JSON.stringify(got) === JSON.stringify(want), got.join(','));
      }
      check(`RX4 ${tag}: chart marks named, charts have table views, tables captioned`, info.hits.every(Boolean) && info.charts.every(Boolean) && info.tables);
      if (info.counters.length) {
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const el of await page.$$('[data-rx-count]')) await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => [...document.querySelectorAll('[data-rx-count]')].map(c => c.textContent));
        check(`RX5 ${tag}: counters end on the printed value`, JSON.stringify(after) === JSON.stringify(info.counters), after.join(','));
      }
      // Scroll through the page as a reader would, so each section's heading is actually on screen for a moment.
      const height = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y <= height; y += Math.round(viewport.height * 0.6)) {
        await page.evaluate(top => window.scrollTo(0, top), y);
        await page.waitForTimeout(120);
      }
      const disclosure = await page.$('[data-rx-case-math] summary');
      if (disclosure) { await disclosure.click(); }
      const sent = await page.evaluate(() => window.__rx || []);
      const research = sent.filter(e => ['research_viewed', 'decision_proof_clicked', 'case_study_interacted', 'decision_file_opened'].includes(e.event));
      const tracker = fs.readFileSync('assets/js/conversion-events.js', 'utf8');
      const placement = new RegExp(tracker.match(/experiencePlacement=(\/\^\(.*\)\$\/);/)[1].slice(1, -1));
      check(`RX6 ${tag}: research events use allow-listed placements`, research.length > 0 && research.every(e => placement.test(e.placement)),
        JSON.stringify(research.slice(0, 4)));
      check(`RX7 ${tag}: preview markers ${mode === 'preview' ? 'present' : 'absent'}`, info.preview === (mode === 'preview'));
      const proofLinks = await page.evaluate(() => [...document.querySelectorAll('a[data-rx-proof-link]')].map(a => a.href));
      check(`RX10 ${tag}: Decision Proof links stay ${mode === 'preview' ? 'inside the preview' : 'on the public site'}`, proofLinks.every(h =>
        mode === 'preview' ? h.includes('/research-preview/decision-proof.html') : !h.includes('research-preview')), proofLinks.join(' '));
      const focusable = await page.$(mode === 'preview' && name === 'proof' ? '.ff-rx-hit' : (disclosure ? '[data-rx-case-math] summary' : '.ff-rx-link'));
      if (focusable) {
        // Reach it by keyboard (a mouse click earlier on the page must not decide focus visibility).
        await focusable.evaluate(el => el.focus());
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const outline = await focusable.evaluate(el => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
        check(`RX8 ${tag}: keyboard focus is visible`, !outline.startsWith('none'), outline);
      }
      if (SHOTS) await page.screenshot({path: `output/research-sections/${mode}-${name}-${device}.png`, fullPage: true});
      await context.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.error(`- ${f}`)); process.exit(1); }
