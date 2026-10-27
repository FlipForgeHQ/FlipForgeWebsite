// Rendered regression for the homepage audience selector, Decision Challenge and Beta pre-selection.
// Serves from FLIPFORGE_PUBLIC_AUDIT_URL (default http://127.0.0.1:4173). Experience counts are intercepted, never sent.
import { chromium } from 'playwright';

const base = (process.env.FLIPFORGE_PUBLIC_AUDIT_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const failures = [];
let passed = 0;
const check = (label, ok) => { if (ok) passed++; else failures.push(label); };
const browser = await chromium.launch();

for (const [name, viewport] of [['phone-390', {width: 390, height: 844}], ['tablet-768', {width: 768, height: 1024}], ['desktop-1440', {width: 1440, height: 1000}]]) {
  const context = await browser.newContext({viewport, reducedMotion: name === 'phone-390' ? 'reduce' : 'no-preference', hasTouch: name !== 'desktop-1440'});
  const page = await context.newPage();
  const errors = [];
  const events = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/conversion-event', route => { events.push(JSON.parse(route.request().postData() || '{}')); route.fulfill({status: 202, body: '{}'}); });
  await page.goto(`${base}/index.html`, {waitUntil: 'networkidle'});

  // Audience selector
  check(`${name}: one audience panel shown at a time`, await page.locator('[data-aud-panel]:visible').count() === 1);
  await page.locator('[data-aud-tab="grading"]').scrollIntoViewIfNeeded();
  await page.locator('[data-aud-tab="grading"]').click();
  check(`${name}: choosing an audience changes the headline and question`,
    (await page.locator('[data-aud-panel="grading"] .ff10-aud-headline').isVisible())
    && (await page.locator('[data-aud-panel="grading"] .ff10-aud-headline').innerText()).includes('Look beyond the label.')
    && !(await page.locator('[data-aud-panel="flipper"]').isVisible()));
  await page.locator('[data-aud-tab="grading"]').focus();
  await page.keyboard.press('Home');
  check(`${name}: keyboard Home selects the first audience and moves focus`,
    await page.evaluate(() => document.activeElement.dataset.audTab) === 'flipper'
    && await page.locator('[data-aud-tab="flipper"]').getAttribute('aria-selected') === 'true');
  await page.keyboard.press('ArrowLeft');
  check(`${name}: arrow keys wrap around`, await page.locator('[data-aud-tab="grading"]').getAttribute('aria-selected') === 'true');
  const tabBox = await page.locator('[data-aud-tab="grading"]').boundingBox();
  check(`${name}: the selected audience is in view`, tabBox && tabBox.x >= -1 && tabBox.x + tabBox.width <= viewport.width + 1);

  // Decision Challenge
  await page.locator('[data-chal-choice="investigate"]').scrollIntoViewIfNeeded();
  check(`${name}: challenge starts with the call only`, await page.locator('[data-chal-step="investigate"]').isHidden()
    && await page.locator('[data-chal-step="decision"]').isHidden());
  await page.locator('[data-chal-choice="investigate"]').click();
  check(`${name}: choosing a call reveals the first finding only`, await page.locator('[data-chal-finding]:visible').count() === 1
    && await page.locator('[data-chal-choice="buy"]').isDisabled());
  for (let i = 0; i < 4; i++) await page.locator('[data-chal-next]').click();
  check(`${name}: all findings, the PASS decision and the comparison appear`, await page.locator('[data-chal-finding]:visible').count() === 4
    && await page.locator('[data-chal-step="decision"] .ff10-verdict').innerText() === 'PASS'
    && (await page.locator('[data-chal-reveal]').innerText()).startsWith('You chose to investigate first.')
    && await page.locator('[data-chal-next]').isHidden());
  await page.locator('[data-chal-restart]').click();
  check(`${name}: start again resets the challenge`, await page.locator('[data-chal-step="investigate"]').isHidden()
    && !(await page.locator('[data-chal-choice="buy"]').isDisabled()));
  const slider = page.locator('[data-asking]');
  await slider.focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowLeft');
  check(`${name}: the existing price demo still decides (BUY at $335)`, await page.locator('[data-ffdemo] [data-verdict]').innerText() === 'BUY'
    && (await page.locator('[data-ask-value]').innerText()).includes('335'));

  check(`${name}: no horizontal page scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  check(`${name}: no script errors`, errors.length === 0);
  await page.waitForTimeout(300);
  const sent = events.map(e => `${e.event}:${e.placement}`);
  check(`${name}: experience counts sent with allowlisted names only`,
    ['audience_selected:audience-grading', 'challenge_answered:challenge-investigate', 'challenge_completed:challenge-investigate', 'demo_interacted:demo']
      .every(e => sent.includes(e)) && events.every(e => Object.keys(e).sort().join() === 'event,page,placement'));
  await context.close();
}

// Without script: every audience and every challenge stage is readable.
const plain = await browser.newPage({viewport: {width: 1440, height: 1000}, javaScriptEnabled: false});
await plain.goto(`${base}/index.html`);
check('no-script: all five audiences shown, selector hidden', await plain.locator('[data-aud-panel]:visible').count() === 5
  && !(await plain.locator('.ff10-aud-tabs').isVisible()));
check('no-script: the full investigation is shown, calls hidden', await plain.locator('[data-chal-finding]:visible').count() === 4
  && !(await plain.locator('.ff10-chal-choices').isVisible()));
await plain.close();

// Beta application: pre-selection from an audience, existing pathway intact.
const beta = await browser.newPage({viewport: {width: 1440, height: 1000}});
await beta.goto(`${base}/beta-application.html?goal=flipper`, {waitUntil: 'networkidle'});
check('beta: flipper pre-selects existing answers and explains it', await beta.inputValue('#collector-type') === 'Flipper / reseller'
  && await beta.inputValue('#focus') === 'Supported value / decision guidance' && await beta.locator('.ff-beta-goal-note').count() === 1);
await beta.goto(`${base}/beta-application.html`, {waitUntil: 'networkidle'});
check('beta: without a goal nothing is pre-selected', await beta.inputValue('#collector-type') === '' && await beta.locator('.ff-beta-goal-note').count() === 0
  && await beta.locator('form[action="/api/beta/applications"]').count() === 1);
await beta.close();
await browser.close();

if (failures.length) {
  console.error(`FAIL: ${failures.length} rendered homepage experience check(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`PASS: ${passed} rendered homepage experience checks (audience selector, Decision Challenge, Beta pre-selection) at three viewports.`);
