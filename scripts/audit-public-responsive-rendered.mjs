import { chromium } from 'playwright';

const baseUrl = process.env.FLIPFORGE_PUBLIC_AUDIT_URL || 'http://127.0.0.1:4173';

const pages = [
  ['Home', '/'],
  ['Product', '/product.html'],
  ['Decision Intelligence', '/decision-intelligence.html'],
  ['Evidence Lab', '/learn.html'],
  ['Launch Plans', '/pricing.html'],
  ['About', '/about.html'],
  ['Beta Access', '/beta-application.html'],
  ['FAQ', '/faq.html'],
  ['Decision Preview', '/landing-decision-preview.html'],
  ['Connect', '/connect/index.html'],
  ['Data Use', '/data-use.html'],
  ['Privacy', '/privacy.html'],
  ['Terms', '/terms.html'],
  ['Beta Terms', '/beta-terms.html'],
  ['Refund', '/refund.html'],
  ['Thank You', '/thank-you.html'],
  ['Beta Onboarding', '/beta-onboarding.html'],
  ['404', '/404.html']
];

const viewports = [
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-900', width: 900, height: 760 },
  { name: 'tablet-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];

const showcaseSvgs = [
  '/assets/images/ff-graphics-identity-lock-v2.svg',
  '/assets/images/ff-graphics-evidence-filter-v2.svg',
  '/assets/images/ff-graphics-decision-receipt-v2.svg',
  '/assets/images/ff-graphics-storyboard-v2.svg'
];

const failures = [];
const round = n => Number(n.toFixed(1));

async function goto(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.fonts?.status === 'loaded' || !document.fonts, null, { timeout: 5000 }).catch(() => {});
}

async function auditPage(page, label, path, viewport) {
  const pageErrors = [];
  const onPageError = error => pageErrors.push(error.message);
  page.on('pageerror', onPageError);
  await goto(page, path);

  const state = await page.evaluate(() => {
    const visible = el => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && box.width > 0 && box.height > 0;
    };
    const rect = el => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };

    const selectors = [
      '.site-header',
      'main',
      '.hero-visual',
      '.film',
      '.ff-df-shell',
      '.ff-df-viewport',
      '.ff-approved-graphic',
      '.ff-approved-data-summary',
      '.ffg-scene',
      '.page-hero',
      '.ff-dic-shell',
      '.ff-dic-stage',
      'main figure',
      'main img'
    ];

    const elements = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))].filter(visible);
    const offscreen = elements.map(el => ({ tag: el.tagName, cls: el.className?.toString?.() || '', ...rect(el) })).filter(box => box.left < -1 || box.right > innerWidth + 1);

    const brokenImages = [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.getAttribute('src') || '');

    const approvedRaster = [...document.querySelectorAll('.ff-approved-graphic img')].filter(visible).map(img => img.getAttribute('src') || '').filter(src => !src.endsWith('.svg'));

    const forge = document.querySelector('.ff-df-viewport');
    return {
      innerWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      brokenImages,
      approvedRaster,
      offscreen,
      forge: forge ? {
        clientWidth: forge.clientWidth,
        scrollWidth: forge.scrollWidth,
        rect: rect(forge)
      } : null
    };
  });

  page.off('pageerror', onPageError);

  if (state.horizontalOverflow > 1) failures.push(`${viewport.name} ${label}: page horizontally overflows by ${round(state.horizontalOverflow)}px`);
  if (state.brokenImages.length) failures.push(`${viewport.name} ${label}: broken images ${state.brokenImages.join(', ')}`);
  if (state.approvedRaster.length) failures.push(`${viewport.name} ${label}: approved major graphics are not vector assets: ${state.approvedRaster.join(', ')}`);
  if (state.offscreen.length) {
    const sample = state.offscreen.slice(0, 4).map(x => `${x.tag}.${x.cls} [${round(x.left)}, ${round(x.right)}]`).join(' | ');
    failures.push(`${viewport.name} ${label}: major rendered content leaves viewport: ${sample}`);
  }
  if (state.forge && state.forge.scrollWidth > state.forge.clientWidth + 1) failures.push(`${viewport.name} ${label}: Decision Forge viewport has internal horizontal overflow (${state.forge.scrollWidth}px > ${state.forge.clientWidth}px)`);
  if (pageErrors.length) failures.push(`${viewport.name} ${label}: browser errors: ${pageErrors.slice(0, 3).join(' | ')}`);
}

async function auditForgeMobile(page, viewport) {
  await goto(page, '/');
  const steps = page.locator('[data-forge-step]');
  if (await steps.count() < 5) {
    failures.push(`${viewport.name} Home: Decision Forge stage controls missing`);
    return;
  }

  const checks = [
    { index: 2, overlay: '.ff-df-evidence-verdicts', scene: '.ff-df-scene-evidence img', label: 'evidence verdicts' },
    { index: 3, overlay: '.ff-df-economics', scene: '.ff-df-scene-evidence img', label: 'economics panel' },
    { index: 4, overlay: '.ff-df-reveal-card', scene: '.ff-df-scene-receipt img', label: 'decision reveal' }
  ];

  for (const check of checks) {
    await steps.nth(check.index).click();
    await page.waitForTimeout(120);
    const state = await page.evaluate(({ overlay, scene }) => {
      const rect = selector => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
      };
      return { overlay: rect(overlay), image: rect(scene), viewport: rect('.ff-df-viewport') };
    }, check);

    if (!state.overlay || !state.image || !state.viewport) {
      failures.push(`${viewport.name} Home: missing geometry for ${check.label}`);
      continue;
    }
    if (state.overlay.left < state.viewport.left - 1 || state.overlay.right > state.viewport.right + 1) {
      failures.push(`${viewport.name} Home: ${check.label} leaves Decision Forge viewport`);
    }
    if (state.overlay.top < state.image.bottom + 8) {
      failures.push(`${viewport.name} Home: ${check.label} overlaps the mobile showcase image (${round(state.overlay.top)} < ${round(state.image.bottom + 8)})`);
    }
  }
}

async function auditSvgText(page, path) {
  await goto(page, path);
  const state = await page.evaluate(() => {
    const visible = el => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && box.width > 0 && box.height > 0;
    };
    const svg = document.querySelector('svg');
    const svgRect = svg?.getBoundingClientRect();
    const items = [...document.querySelectorAll('text')].filter(visible).map((el, index) => {
      const b = el.getBoundingClientRect();
      return {
        index,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height
      };
    });
    const collisions = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const iw = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const ih = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (iw > 2 && ih > 2) collisions.push({ a: a.text, b: b.text, iw, ih });
      }
    }
    const outside = svgRect ? items.filter(item => item.left < svgRect.left - 1 || item.right > svgRect.right + 1 || item.top < svgRect.top - 1 || item.bottom > svgRect.bottom + 1) : [];
    return { collisions, outside };
  });

  for (const collision of state.collisions) failures.push(`SVG ${path}: text collision "${collision.a}" ↔ "${collision.b}" (${round(collision.iw)}×${round(collision.ih)}px)`);
  for (const item of state.outside) failures.push(`SVG ${path}: text outside canvas "${item.text}"`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    for (const [label, path] of pages) await auditPage(page, label, path, viewport);
    if (viewport.width <= 1120) await auditForgeMobile(page, viewport);

    console.log(`PASS candidate: ${viewport.name} rendered across ${pages.length} public pages`);
    await context.close();
  }

  const svgContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const svgPage = await svgContext.newPage();
  for (const path of showcaseSvgs) await auditSvgText(svgPage, path);
  await svgContext.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('Rendered public responsive/graphics audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: public pages are viewport-contained at seven breakpoints; major graphics are vector, unbroken, and on-canvas; collapsed-nav Decision Forge panels do not cover their showcase art; showcase SVG text has no collisions.');
